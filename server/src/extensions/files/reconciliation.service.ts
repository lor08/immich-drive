import { Inject, Injectable } from '@nestjs/common';
import path from 'node:path/posix';
import { DriveEntryRow, DriveIndexRepository, DriveVolumeRow } from 'src/extensions/files/drive-index.repository';
import { DriveIndexService } from 'src/extensions/files/drive-index.service';
import { FileEntry, FileEntryType, TrashRecord } from 'src/extensions/files/file-entry';
import { DRIVE_CONFIG, DriveConfig } from 'src/extensions/files/files.config';
import { DriveEntryState, DriveVolumeState } from 'src/extensions/files/index-state';
import { StorageAdapter } from 'src/extensions/files/storage.adapter';
import { Volume, volumeKey } from 'src/extensions/files/volume';
import { VolumeAccessService } from 'src/extensions/files/volume-access.service';
import {
  ReconcileReport,
  TrashReport,
  VolumeHealthReason,
  VolumeHealthReport,
} from 'src/extensions/files/volume-health';
import { inspectVolumeIdentity, VolumeInspection } from 'src/extensions/files/volume-identity';
import { compareWalkOrder, subtreeCompleted } from 'src/extensions/files/walk-order';
import { LoggingRepository } from 'src/repositories/logging.repository';

/** How many directories one pass reconciles before saving a checkpoint and returning. */
const DEFAULT_DIRECTORY_LIMIT = 5000;
const MAX_DIRECTORY_LIMIT = 100_000;

interface PassState {
  readonly volumeRowId: string;
  readonly adapter: StorageAdapter;
  readonly resumeFrom: string | null;
  readonly limit: number;
  directories: number;
  added: number;
  conflicted: number;
  missing: number;
  recovered: number;
  lastCompleted: string | null;
  stoppedAt: string | null;
}

/**
 * Repairs the index from the filesystem, and refuses to when it cannot prove what it is looking at.
 *
 * The order of work is the whole design, and it comes from
 * [ADR 0007](../../../../docs/adr/0007-reconciliation-and-mount-health.md): **health first, then
 * reconciliation**. A vanished network mount leaves an empty directory where a populated volume used to
 * be, and comparing that against a populated index makes "the user deleted everything" the obvious
 * conclusion. Acting on it is unrecoverable, and at the moment of the scan there is nothing in the tree
 * itself that distinguishes the two. So a pass that cannot show the volume is the same volume does not
 * get to conclude anything at all.
 *
 * Everything this class does to the index is additive or a change of state. It inserts entries it finds,
 * marks entries it cannot find as `missing`, marks disagreements as `conflicted`, and deletes nothing.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    private readonly access: VolumeAccessService,
    @Inject(DRIVE_CONFIG) private readonly config: DriveConfig,
    private readonly repository: DriveIndexRepository,
    private readonly index: DriveIndexService,
    private readonly logger: LoggingRepository,
  ) {
    this.logger.setContext(ReconciliationService.name);
  }

  /** Health of every volume the owner can address. */
  async inspectVolumes(ownerId: string): Promise<VolumeHealthReport[]> {
    const volumes = this.access.describeAllForSystem(ownerId);

    return Promise.all(volumes.map((volume) => this.inspectVolume(ownerId, volume)));
  }

  /**
   * Health of one volume, without touching it.
   *
   * Deliberately reads through `describeVolume` and `inspectVolumeIdentity`, neither of which creates
   * anything: the ordinary request path provisions a volume's directories and writes its marker on
   * first use, and a health check that did either would repair the very things it is meant to detect.
   * It also does not write the verdict to the row — `drive_volume.state` is what the last *pass*
   * concluded, and a read has no business overwriting that.
   */
  async inspectVolume(ownerId: string, volumeId: string | Volume): Promise<VolumeHealthReport> {
    const volume = typeof volumeId === 'string' ? this.access.describeForSystem(ownerId, volumeId) : volumeId;
    const row = await this.repository.getVolume(volumeKey(ownerId, volume));
    const indexedEntries = row ? await this.repository.countEntries(row.id) : 0;
    const { state, reason } = await this.evaluate(volume, row, indexedEntries);

    return {
      volumeId: volume.id,
      state,
      reason,
      indexedEntries,
      scannedAt: row?.scannedAt ?? null,
      resumeFrom: row?.checkpoint ?? null,
    };
  }

  /**
   * Runs or resumes a pass on one volume.
   *
   * `limit` bounds how many directories are reconciled before the pass saves a checkpoint and returns,
   * so a tree larger than one request can be walked across several, and so an interruption costs the
   * work of one directory rather than of the whole volume.
   */
  async reconcileVolume(ownerId: string, volumeId: string, limit?: number): Promise<ReconcileReport> {
    const volume = this.access.describeForSystem(ownerId, volumeId);
    const health = await this.inspectVolume(ownerId, volume);

    // `Unverified` is not a refusal. A volume nobody has written to, or one whose index was dropped, has
    // nothing recorded to compare against — and rebuilding from the filesystem is exactly what a first
    // pass is for. Only `Unhealthy` stops the pass, because only `Unhealthy` means the tree in front of
    // us might not be the tree the index describes.
    if (health.state === DriveVolumeState.Unhealthy) {
      return this.refuse(ownerId, volume, health);
    }

    // Only now is it safe to touch the volume: the adapter provisions directories, and provisioning a
    // volume whose mount has disappeared would write into whatever is mounted at its place instead.
    const { adapter } = await this.access.forSystem(ownerId, volumeId);
    const volumeRowId = await this.index.ensureVolumeRow(ownerId, volume);

    const state: PassState = {
      volumeRowId,
      adapter,
      resumeFrom: health.resumeFrom,
      limit: normalizeLimit(limit),
      directories: 0,
      added: 0,
      conflicted: 0,
      missing: 0,
      recovered: 0,
      lastCompleted: null,
      stoppedAt: null,
    };

    await this.walk(state, '/');

    const completed = state.stoppedAt === null;
    await this.repository.setCheckpoint(volumeRowId, state.stoppedAt);
    await this.repository.recordPass(volumeRowId, { state: DriveVolumeState.Healthy, completed });

    // The trash is examined only by a pass that reached the end of the tree, so a resumed pass does not
    // repeat it, and so retention never runs against a half-known volume.
    const trash = completed ? await this.reconcileTrash(state) : null;

    this.logger.log(
      `Reconciled volume "${volume.id}": ${state.directories} directories, ${state.added} added, ` +
        `${state.conflicted} conflicted, ${state.missing} missing, ${state.recovered} recovered` +
        (completed ? '' : `, stopped at ${state.stoppedAt}`),
    );

    return {
      volumeId: volume.id,
      state: DriveVolumeState.Healthy,
      reason: null,
      completed,
      directories: state.directories,
      added: state.added,
      conflicted: state.conflicted,
      missing: state.missing,
      recovered: state.recovered,
      resumedFrom: health.resumeFrom,
      stoppedAt: state.stoppedAt,
      trash,
    };
  }

  /**
   * Records the refusal and reports it.
   *
   * The state is persisted even though nothing was reconciled, because "we looked and could not trust
   * it" is the most important thing the row can say. The checkpoint is left exactly as it was: the
   * pending work has not been done, and a volume coming back healthy should resume rather than restart.
   */
  private async refuse(ownerId: string, volume: Volume, health: VolumeHealthReport): Promise<ReconcileReport> {
    const row = await this.repository.getVolume(volumeKey(ownerId, volume));
    if (row) {
      await this.repository.recordPass(row.id, { state: DriveVolumeState.Unhealthy, completed: false });
    }

    this.logger.warn(
      `Refused to reconcile volume "${volume.id}": ${health.reason}. ` +
        `${health.indexedEntries} indexed entr(ies) left untouched.`,
    );

    return {
      volumeId: volume.id,
      state: health.state,
      reason: health.reason,
      completed: false,
      directories: 0,
      added: 0,
      conflicted: 0,
      missing: 0,
      recovered: 0,
      resumedFrom: health.resumeFrom,
      stoppedAt: health.resumeFrom,
      trash: null,
    };
  }

  /**
   * The four unhealthy conditions from ADR 0007, evaluated in a fixed order.
   *
   * The order is the order of severity of what it implies about the volume: an unreadable root says
   * nothing else can be trusted, a changed identity says this is a different directory, a marker
   * problem says it may be, and an empty root against a populated index says the tree cannot be read as
   * a deletion. The first one that holds is the reported reason.
   */
  private async evaluate(
    volume: Volume,
    row: DriveVolumeRow | undefined,
    indexedEntries: number,
  ): Promise<{ state: DriveVolumeState; reason: VolumeHealthReason | null }> {
    let inspection: VolumeInspection;
    try {
      inspection = await inspectVolumeIdentity(volume.rootPath);
    } catch {
      return { state: DriveVolumeState.Unhealthy, reason: VolumeHealthReason.RootUnreadable };
    }

    if (!row) {
      // Nothing recorded to compare against. Not a failure: a volume nobody has written to yet is
      // simply unverified, and the first pass is what gives it an identity.
      return { state: DriveVolumeState.Unverified, reason: VolumeHealthReason.NotIndexed };
    }

    if (row.device !== inspection.device || row.inode !== inspection.inode) {
      return { state: DriveVolumeState.Unhealthy, reason: VolumeHealthReason.IdentityChanged };
    }

    if (!inspection.markerPresent) {
      return { state: DriveVolumeState.Unhealthy, reason: VolumeHealthReason.MarkerMissing };
    }

    if (inspection.markerId === null || inspection.markerId !== row.markerId) {
      return { state: DriveVolumeState.Unhealthy, reason: VolumeHealthReason.MarkerMismatch };
    }

    if (indexedEntries > 0 && (await this.rootIsEmpty(volume))) {
      return { state: DriveVolumeState.Unhealthy, reason: VolumeHealthReason.RootEmptyWhileIndexed };
    }

    return { state: DriveVolumeState.Healthy, reason: null };
  }

  /**
   * Whether the browsable tree has nothing in it.
   *
   * Read through the adapter rather than the filesystem, and a root that cannot be listed at all counts
   * as empty here: either way the index cannot be compared against it, and both answers lead to the
   * same refusal.
   */
  private async rootIsEmpty(volume: Volume): Promise<boolean> {
    try {
      const adapter = await this.access.inspectForSystem(volume);
      const entries = await adapter.list('/');
      return entries.length === 0;
    } catch {
      return true;
    }
  }

  /**
   * Walks one directory and then its subdirectories, in the order `compareWalkOrder` defines.
   *
   * A resumed pass still descends towards its checkpoint but reconciles nothing at or before it, and
   * skips whole branches that finished earlier. That keeps resuming cheap — it costs one listing per
   * ancestor of the checkpoint — without needing to remember anything more than a single path.
   */
  private async walk(state: PassState, directoryPath: string): Promise<void> {
    if (state.stoppedAt !== null) {
      return;
    }

    let children: readonly FileEntry[];
    try {
      children = await state.adapter.list(directoryPath);
    } catch (error) {
      // A directory that disappeared or turned unreadable while the pass was running is not a reason to
      // abandon the volume, and it is not evidence that its rows are gone either. It is skipped, with
      // the rows below it left exactly as they were for the next pass to judge.
      this.logger.warn(`Skipped ${directoryPath} during reconciliation: ${describeError(error)}`);
      return;
    }

    const alreadyReconciled = state.resumeFrom !== null && compareWalkOrder(directoryPath, state.resumeFrom) <= 0;

    if (!alreadyReconciled) {
      if (state.directories >= state.limit) {
        state.stoppedAt = state.lastCompleted ?? state.resumeFrom;
        return;
      }

      await this.reconcileDirectory(state, directoryPath, children);
      state.directories++;
      state.lastCompleted = directoryPath;
    }

    for (const child of children) {
      if (child.type !== FileEntryType.Directory) {
        continue;
      }

      if (state.resumeFrom !== null && subtreeCompleted(child.path, state.resumeFrom)) {
        continue;
      }

      await this.walk(state, child.path);
      if (state.stoppedAt !== null) {
        return;
      }
    }
  }

  /**
   * Compares one directory's contents against the rows that claim to describe it.
   *
   * Three outcomes, and only the first writes anything a user could notice:
   *
   * - on disk but not indexed: inserted, which is how content created outside the application, or
   *   predating the index entirely, becomes known;
   * - indexed and in agreement: left alone, or returned to `present` if a previous pass had marked it,
   *   which is how a volume that came back repairs itself;
   * - indexed and disagreeing: marked `conflicted`, and **the row is not updated to match**. Without
   *   checksums (`P1-13`) the server cannot tell a deliberate edit from a truncated or half-written
   *   file, so adopting whatever is on disk would make the index assert a freshness it has not verified.
   *   A conflicted row is the visible statement that the tree changed here; writing through the API
   *   clears it, because that write is one the server performed itself.
   *
   * A row with no file left is marked `missing` together with everything under it, and nothing is
   * deleted — that is the rule the whole task exists to protect.
   */
  private async reconcileDirectory(
    state: PassState,
    directoryPath: string,
    children: readonly FileEntry[],
  ): Promise<void> {
    const rows = await this.repository.getChildren(state.volumeRowId, directoryPath);
    const unseen = new Map(rows.map((row) => [row.name, row]));

    for (const entry of children) {
      const row = unseen.get(entry.name);
      unseen.delete(entry.name);

      if (!row) {
        await this.repository.upsertEntry({
          volumeId: state.volumeRowId,
          path: entry.path,
          parentPath: path.dirname(entry.path),
          name: entry.name,
          type: entry.type,
          size: entry.size,
          modifiedAt: entry.modifiedAt,
        });
        state.added++;
        continue;
      }

      if (agrees(row, entry)) {
        if (row.state !== DriveEntryState.Present) {
          await this.repository.setEntryState(state.volumeRowId, row.path, DriveEntryState.Present);
          state.recovered++;
        }
        continue;
      }

      // A row that is already conflicted is left exactly as it is, and not counted again. Every count a
      // pass reports is what *this* pass changed, so a volume nobody has touched reports zeros — which
      // is the signal an operator is actually reading it for. Rewriting the same state on every pass
      // would also mean an UPDATE per unchanged row, forever.
      if (row.state !== DriveEntryState.Conflicted) {
        await this.repository.setEntryState(state.volumeRowId, row.path, DriveEntryState.Conflicted);
        state.conflicted++;
      }
    }

    for (const row of unseen.values()) {
      // Already known missing: its subtree was marked when it was first found gone, and no row can have
      // appeared underneath since — a pass only adds what it can see, and it cannot see into a directory
      // that is not there.
      if (row.state === DriveEntryState.Missing) {
        continue;
      }

      state.missing += await this.repository.markSubtreeMissing(state.volumeRowId, row.path);
    }
  }

  /**
   * Reports what the trash holds, and expires records only if the deployment asked for that.
   *
   * Nothing here creates index rows. A trash record has no path in the address space, so a row would
   * have to invent one, and the alternative — a table mirroring the manifest — is what
   * [ADR 0011](../../../../docs/adr/0011-drive-index-schema.md) rejected to keep one source of truth
   * for a deleted entry. So the trash is *reported* rather than indexed, which is what an operator
   * actually needs from it: how much is recoverable, and what is broken.
   */
  private async reconcileTrash(state: PassState): Promise<TrashReport> {
    const { records, orphanedManifests, foreign } = await state.adapter.inspectTrash();
    const damaged = records.filter((record) => record.deletedAt === null || record.originalPath === null);

    if (damaged.length > 0 || orphanedManifests.length > 0 || foreign.length > 0) {
      this.logger.warn(
        `Trash needs attention: ${damaged.length} damaged record(s), ${orphanedManifests.length} orphaned ` +
          `manifest(s), ${foreign.length} unrecognised entr(ies)`,
      );
    }

    return {
      records: records.length,
      damaged: damaged.length,
      orphanedManifests: orphanedManifests.length,
      foreign: foreign.length,
      expired: await this.expire(state, records),
    };
  }

  /**
   * Removes trash records older than the configured window.
   *
   * The only destructive operation in this file, and it is off unless a deployment sets a retention
   * window. A record whose manifest could not be read has no known age and is therefore **never**
   * expired: guessing would mean destroying the one class of record a user is least able to recover by
   * other means.
   */
  private async expire(state: PassState, records: readonly TrashRecord[]): Promise<number> {
    const retentionDays = this.config.enabled ? this.config.trashRetentionDays : undefined;
    if (retentionDays === undefined) {
      return 0;
    }

    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let expired = 0;

    for (const record of records) {
      if (record.deletedAt === null || record.deletedAt.getTime() > cutoff) {
        continue;
      }

      try {
        await state.adapter.purgeFromTrash(record.id);
        expired++;
        this.logger.log(`Expired trash record ${record.id}, deleted at ${record.deletedAt.toISOString()}`);
      } catch (error) {
        this.logger.warn(`Could not expire trash record ${record.id}: ${describeError(error)}`);
      }
    }

    return expired;
  }
}

const normalizeLimit = (limit: number | undefined): number => {
  if (limit === undefined) {
    return DEFAULT_DIRECTORY_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_DIRECTORY_LIMIT);
};

/**
 * Whether a row still describes the entry on disk.
 *
 * A folder is compared by kind alone. Its size and modification time change whenever anything inside it
 * changes, so comparing them would mark every folder on the path to a new file as conflicted — a report
 * about filesystem bookkeeping rather than about anyone's data.
 */
const agrees = (row: DriveEntryRow, entry: FileEntry): boolean => {
  if (row.type !== entry.type) {
    return false;
  }

  if (entry.type === FileEntryType.Directory) {
    return true;
  }

  return row.size === entry.size && row.modifiedAt.getTime() === entry.modifiedAt.getTime();
};

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));
