import { Injectable } from '@nestjs/common';
import { DriveIndexService } from 'src/extensions/files/drive-index.service';
import { FileEntry, FileEntryType, TrashRecord } from 'src/extensions/files/file-entry';
import { LocalStorageAdapterError, LocalStorageErrorCode } from 'src/extensions/files/local-storage.adapter';
import { PathLock } from 'src/extensions/files/path-lock';
import {
  StorageDeleteOptions,
  StorageRange,
  StorageWriteOptions,
  TrashPurgeResult,
} from 'src/extensions/files/storage.adapter';
import { Volume } from 'src/extensions/files/volume';
import { VolumeAccessService, VolumeNeed } from 'src/extensions/files/volume-access.service';

/**
 * Lock key for a trash record.
 *
 * A normalized path always begins with a slash, so this prefix cannot be produced by one. That keeps
 * record keys and path keys in the same lock space without either being able to mean the other.
 */
const trashLockKey = (trashId: string): string => `trash:${trashId}`;

/**
 * Entry point for file-domain operations.
 *
 * Every operation is scoped to an owner and a volume. The service never receives a host path and never
 * returns one, and it no longer holds the volume registry: an adapter comes only from
 * `VolumeAccessService`, which decides whether this caller may do this to this volume. A new entry point
 * therefore cannot reach storage without stating what it needs — see
 * [ADR 0012](../../../../docs/adr/0012-shared-volume-membership.md).
 */
@Injectable()
export class FileDomainService {
  constructor(
    private readonly access: VolumeAccessService,
    private readonly locks: PathLock,
    private readonly index: DriveIndexService,
  ) {}

  // Async so an unconfigured domain rejects like every other entry point instead of throwing
  // synchronously, which would make the contract depend on which method a caller happened to use.
  async listVolumes(ownerId: string): Promise<Volume[]> {
    return this.access.listVolumes(ownerId);
  }

  async getEntry(ownerId: string, volumeId: string, path: string): Promise<FileEntry | null> {
    const { adapter } = await this.access.forUser(ownerId, volumeId, VolumeNeed.Read);
    return adapter.stat(path);
  }

  async listEntries(ownerId: string, volumeId: string, path: string): Promise<readonly FileEntry[]> {
    const { adapter } = await this.access.forUser(ownerId, volumeId, VolumeNeed.Read);
    return adapter.list(path);
  }

  /**
   * Resolves an entry and opens it in one step, so a caller streaming a file cannot end up describing
   * one entry while reading another.
   */
  async openFile(
    ownerId: string,
    volumeId: string,
    path: string,
  ): Promise<{ entry: FileEntry; content: AsyncIterable<Uint8Array> }> {
    const { adapter } = await this.access.forUser(ownerId, volumeId, VolumeNeed.Read);

    const entry = await adapter.stat(path);
    if (!entry) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotFound, 'Storage entry does not exist');
    }

    if (entry.type !== FileEntryType.File) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotFile, 'Storage entry is not a regular file');
    }

    return { entry, content: await adapter.open(path) };
  }

  /**
   * Creates one folder, holding the path lock for the duration so two replicas cannot race on the
   * same target.
   */
  async createFolder(ownerId: string, volumeId: string, path: string): Promise<FileEntry> {
    const { volume, adapter } = await this.access.forUser(ownerId, volumeId, VolumeNeed.Write);

    return this.locks.withPathLock(volumeId, path, async () => {
      const entry = await adapter.createDirectory(path);
      await this.index.recordEntry(ownerId, volume, entry);
      return entry;
    });
  }

  /**
   * Writes one file, holding the path lock so two replicas cannot publish different content at the
   * same target.
   */
  async writeFile(
    ownerId: string,
    volumeId: string,
    path: string,
    content: AsyncIterable<Uint8Array>,
    options?: StorageWriteOptions,
  ): Promise<FileEntry> {
    const { volume, adapter } = await this.access.forUser(ownerId, volumeId, VolumeNeed.Write);

    return this.locks.withPathLock(volumeId, path, async () => {
      const entry = await adapter.write(path, content, options);
      await this.index.recordEntry(ownerId, volume, entry);
      return entry;
    });
  }

  async openEntry(
    ownerId: string,
    volumeId: string,
    path: string,
    range?: StorageRange,
  ): Promise<AsyncIterable<Uint8Array>> {
    const { adapter } = await this.access.forUser(ownerId, volumeId, VolumeNeed.Read);
    return adapter.open(path, range);
  }

  /**
   * Moves an entry, holding the lock on both paths.
   *
   * Two paths mean two locks, and two locks taken in the order they were written would deadlock on
   * the symmetric request: moving `/a` to `/b` while another request moves `/b` to `/a`. The keys are
   * therefore ordered by the lock layer rather than by the caller, which turns that pair into a queue.
   */
  async moveEntry(ownerId: string, volumeId: string, sourcePath: string, targetPath: string): Promise<void> {
    const { volume, adapter } = await this.access.forUser(ownerId, volumeId, VolumeNeed.Write);

    return this.locks.withPathLocks(volumeId, [sourcePath, targetPath], async () => {
      await adapter.move(sourcePath, targetPath);

      // The destination is described by the filesystem rather than by this method, so the index cannot
      // assert a size or a type the entry never had. A missing destination means it was removed from
      // under us between the rename and this call, and then the only honest update is that the source
      // is no longer there.
      const entry = await adapter.stat(targetPath);
      await (entry
        ? this.index.recordMove(ownerId, volume, sourcePath, entry)
        : this.index.forgetSubtree(ownerId, volume, sourcePath));
    });
  }

  /**
   * Copies a file, holding the lock on both paths.
   *
   * The source is locked as well as the target, so the file cannot be moved out from under the copy
   * between the check that it is a regular file and the read that follows.
   */
  async copyEntry(ownerId: string, volumeId: string, sourcePath: string, targetPath: string): Promise<FileEntry> {
    const { volume, adapter } = await this.access.forUser(ownerId, volumeId, VolumeNeed.Write);

    return this.locks.withPathLocks(volumeId, [sourcePath, targetPath], async () => {
      const entry = await adapter.copy(sourcePath, targetPath);
      await this.index.recordEntry(ownerId, volume, entry);
      return entry;
    });
  }

  async deleteEntry(ownerId: string, volumeId: string, path: string, options?: StorageDeleteOptions): Promise<void> {
    const { adapter } = await this.access.forUser(ownerId, volumeId, VolumeNeed.Write);
    return adapter.delete(path, options);
  }

  /** Moves an entry to the trash, holding the lock on the path it leaves. */
  async trashEntry(ownerId: string, volumeId: string, path: string): Promise<TrashRecord> {
    const { volume, adapter } = await this.access.forUser(ownerId, volumeId, VolumeNeed.Write);

    return this.locks.withPathLock(volumeId, path, async () => {
      const record = await adapter.trash(path);
      // The trash is not part of the address space, so the index stops describing this path rather than
      // following the content. `P1-06` owns what the trash itself holds.
      await this.index.forgetSubtree(ownerId, volume, path);
      return record;
    });
  }

  async listTrash(ownerId: string, volumeId: string): Promise<readonly TrashRecord[]> {
    const { adapter } = await this.access.forUser(ownerId, volumeId, VolumeNeed.Read);
    return adapter.listTrash();
  }

  /**
   * Restores a record, holding the lock on the record and on the path it lands at.
   *
   * The record is keyed by `trash:<id>`, which no normalized path can produce, so the two namespaces
   * cannot collide even by accident. Locking the record is what stops a restore and a purge of the
   * same record from running at once; locking the target is what stops two restores landing there.
   */
  async restoreFromTrash(ownerId: string, volumeId: string, trashId: string, targetPath?: string): Promise<FileEntry> {
    const { volume, adapter } = await this.access.forUser(ownerId, volumeId, VolumeNeed.Write);
    const keys = [trashLockKey(trashId), ...(targetPath === undefined ? [] : [targetPath])];

    return this.locks.withPathLocks(volumeId, keys, async () => {
      const entry = await adapter.restoreFromTrash(trashId, targetPath);
      // Only the restored entry itself. A restored folder's descendants were forgotten when it was
      // trashed and are not walked here: rebuilding a subtree in the index is a scan, and the scan is
      // `P1-06`. Until then those files are simply unindexed, which is the state every file was in
      // before this task.
      await this.index.recordEntry(ownerId, volume, entry);
      return entry;
    });
  }

  /**
   * Removes one record for good, holding the lock on the record.
   *
   * The target path is unknown here and irrelevant: nothing lands anywhere, so the record itself is
   * the only thing two callers can contend over.
   */
  async purgeFromTrash(ownerId: string, volumeId: string, trashId: string): Promise<void> {
    const { adapter } = await this.access.forUser(ownerId, volumeId, VolumeNeed.Write);

    return this.locks.withPathLock(volumeId, trashLockKey(trashId), () => adapter.purgeFromTrash(trashId));
  }

  /**
   * Empties the trash.
   *
   * Deliberately not locked as one unit: a lock covering every record would have to be a volume-wide
   * lock, which would serialise emptying against every unrelated operation. Each record is removed
   * independently, and a record being restored at the same moment simply fails to be removed and is
   * reported in the failed count.
   */
  async emptyTrash(ownerId: string, volumeId: string): Promise<TrashPurgeResult> {
    const { adapter } = await this.access.forUser(ownerId, volumeId, VolumeNeed.Write);
    return adapter.emptyTrash();
  }
}
