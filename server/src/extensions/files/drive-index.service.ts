import { Injectable } from '@nestjs/common';
import path from 'node:path/posix';
import { DriveEntryRecord, DriveIndexRepository } from 'src/extensions/files/drive-index.repository';
import { FileEntry } from 'src/extensions/files/file-entry';
import { Volume, VolumeKind, volumeKey } from 'src/extensions/files/volume';
import { ensureVolumeIdentity } from 'src/extensions/files/volume-identity';
import { LoggingRepository } from 'src/repositories/logging.repository';

/**
 * Keeps the Drive index in step with the filesystem.
 *
 * Two rules define this class, and both come from
 * [ADR 0002](../../../../docs/adr/0002-transparent-filesystem-storage.md):
 *
 * 1. **The filesystem is authoritative.** The index is a cache that gives entries a stable identity and
 *    gives reconciliation something to compare against. Nothing reads it yet, so it cannot serve a
 *    stale answer to anyone.
 * 2. **A failed index write never fails the operation.** The bytes are already on disk; reporting an
 *    error would tell the user their upload failed when it did not, and would invite them to repeat a
 *    mutation that already happened. Divergence is logged and left for `P1-06` to repair — that is what
 *    reconciliation exists for.
 *
 * Paths arrive here exactly as the caller wrote them, which is safe only because the adapter *validates*
 * virtual paths instead of rewriting them: a trailing slash, `//`, `.` and `..` are all rejected, so a
 * path the adapter accepted is already the canonical form stored in the rows. Anything that makes
 * normalization rewrite a path — Unicode folding, for one — has to normalize before the index sees it,
 * or a subtree rewrite will silently match nothing.
 */
@Injectable()
export class DriveIndexService {
  /**
   * Volume row ids, resolved once per process.
   *
   * The promise is cached rather than awaited-then-stored, so concurrent mutations on a volume share one
   * lookup instead of racing to insert it, and a failure is not remembered as success.
   */
  private readonly volumeRows = new Map<string, Promise<string>>();

  constructor(
    private readonly repository: DriveIndexRepository,
    private readonly logger: LoggingRepository,
  ) {
    this.logger.setContext(DriveIndexService.name);
  }

  /**
   * Resolves the volume's row, recording the volume and initialising its marker if this is the first
   * time the server has seen it.
   *
   * The one method here that **throws**. An operator-triggered reconciliation pass has to know it could
   * not record the volume — continuing would mean walking a tree with nowhere to put what it finds —
   * whereas an ordinary mutation must not fail for that reason. The difference in contract is the point,
   * so it is stated rather than left to whoever reads the call site.
   *
   * It also deliberately **ignores the cache and re-records the volume**, replacing whatever was
   * remembered. A pass is the operation that runs right after someone dropped and re-created the Drive
   * tables, so the remembered row id is exactly the thing most likely to be stale — and inserting
   * against a row that no longer exists fails on the foreign key, in the middle of a walk, having
   * already reported nothing wrong. One extra statement per pass buys that away.
   */
  async ensureVolumeRow(ownerId: string, volume: Volume): Promise<string> {
    const key = volumeKey(ownerId, volume);
    const pending = this.recordVolume(key, ownerId, volume);
    this.volumeRows.set(key, pending);

    try {
      return await pending;
    } catch (error) {
      this.volumeRows.delete(key);
      throw error;
    }
  }

  /** Records an entry that was created, written, copied, or restored. */
  async recordEntry(ownerId: string, volume: Volume, entry: FileEntry): Promise<void> {
    await this.maintain(ownerId, volume, `write of ${entry.path}`, (volumeRowId) =>
      this.repository.upsertEntry(toRecord(volumeRowId, entry)),
    );
  }

  /**
   * Records a move, including every descendant of a moved folder.
   *
   * `entry` is the filesystem's own description of the destination rather than the caller's expectation
   * of it, so the row cannot end up asserting a size or a modification time that the file never had.
   */
  async recordMove(ownerId: string, volume: Volume, sourcePath: string, entry: FileEntry): Promise<void> {
    await this.maintain(ownerId, volume, `move of ${sourcePath} to ${entry.path}`, (volumeRowId) =>
      this.repository.moveSubtree({ volumeId: volumeRowId, sourcePath, entry: toRecord(volumeRowId, entry) }),
    );
  }

  /**
   * Forgets a path and everything under it.
   *
   * Used when an entry leaves the address space — today only by a move into the trash. The rows are
   * removed rather than marked `missing`, because `missing` is reconciliation's word for a row whose
   * file vanished behind the application's back, and a delete the application performed itself is not
   * that. The trashed content is not indexed by this task at all; `P1-06` owns the trash.
   */
  async forgetSubtree(ownerId: string, volume: Volume, entryPath: string): Promise<void> {
    await this.maintain(ownerId, volume, `removal of ${entryPath}`, (volumeRowId) =>
      this.repository.deleteSubtree(volumeRowId, entryPath),
    );
  }

  /**
   * Runs one index write, absorbing whatever it does.
   *
   * Every statement that could throw is inside the `try`, including deriving the volume key. Callers
   * depend on this method never rejecting — that is the whole mechanism by which a failed index write
   * cannot fail a mutation — so "this line cannot throw" is not a good enough reason to leave one
   * outside it.
   */
  private async maintain(
    ownerId: string,
    volume: Volume,
    action: string,
    handler: (volumeRowId: string) => Promise<void>,
  ): Promise<void> {
    try {
      await this.write(ownerId, volume, handler);
    } catch (error) {
      // Warn rather than error: the operation the user asked for succeeded, and the index is designed
      // to be rebuilt from the tree. Only the virtual path is logged — host paths never leave the
      // server, not even into a log file.
      this.logger.warn(
        `Drive index not updated after the ${action} on volume "${volume.id}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async write(ownerId: string, volume: Volume, handler: (volumeRowId: string) => Promise<void>): Promise<void> {
    const key = volumeKey(ownerId, volume);

    try {
      await handler(await this.resolveVolumeRow(key, ownerId, volume));
    } catch (error) {
      // The remembered row may be the thing that is wrong: dropping and re-creating the Drive tables is
      // a documented downgrade, and a process holding a row id from before the drop would otherwise
      // keep failing every write until it restarted. Forget it and let the next mutation resolve it.
      this.volumeRows.delete(key);
      throw error;
    }
  }

  private resolveVolumeRow(key: string, ownerId: string, volume: Volume): Promise<string> {
    let pending = this.volumeRows.get(key);
    if (!pending) {
      pending = this.recordVolume(key, ownerId, volume);
      this.volumeRows.set(key, pending);
    }

    return pending;
  }

  private async recordVolume(key: string, ownerId: string, volume: Volume): Promise<string> {
    const identity = await ensureVolumeIdentity(volume.rootPath);

    return this.repository.upsertVolume({
      key,
      ownerId: volume.kind === VolumeKind.Private ? ownerId : null,
      volumeId: volume.id,
      ...identity,
    });
  }
}

/**
 * Turns an entry into a row.
 *
 * `parentPath` is derived here and stored rather than computed at read time, so listing a folder is one
 * index lookup instead of a pattern match over every descendant. A top-level entry gets `/`.
 */
const toRecord = (volumeId: string, entry: FileEntry): DriveEntryRecord => ({
  volumeId,
  path: entry.path,
  parentPath: path.dirname(entry.path),
  name: entry.name,
  type: entry.type,
  size: entry.size,
  modifiedAt: entry.modifiedAt,
});
