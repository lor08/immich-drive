import { BadRequestException, Inject, Injectable } from '@nestjs/common';
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
import { VolumeRegistry } from 'src/extensions/files/volume.registry';

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
 * Every operation is scoped to an owner and a volume. The service never receives a host path and
 * never returns one: the registry maps a volume identifier to the adapter confined to that volume.
 */
@Injectable()
export class FileDomainService {
  constructor(
    @Inject(VolumeRegistry) private readonly volumes: VolumeRegistry | null,
    private readonly locks: PathLock,
  ) {}

  /**
   * The registry exists only when the domain is configured. Every entry point goes through here so
   * an unconfigured deployment answers consistently instead of failing somewhere deeper.
   */
  private requireVolumes(): VolumeRegistry {
    if (!this.volumes) {
      throw new BadRequestException('Immich Drive file storage is not enabled');
    }

    return this.volumes;
  }

  // Async so an unconfigured domain rejects like every other entry point instead of throwing
  // synchronously, which would make the contract depend on which method a caller happened to use.
  async listVolumes(ownerId: string): Promise<Volume[]> {
    return this.requireVolumes().listVolumes(ownerId);
  }

  async getEntry(ownerId: string, volumeId: string, path: string): Promise<FileEntry | null> {
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);
    return adapter.stat(path);
  }

  async listEntries(ownerId: string, volumeId: string, path: string): Promise<readonly FileEntry[]> {
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);
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
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);

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
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);

    return this.locks.withPathLock(volumeId, path, () => adapter.createDirectory(path));
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
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);

    return this.locks.withPathLock(volumeId, path, () => adapter.write(path, content, options));
  }

  async openEntry(
    ownerId: string,
    volumeId: string,
    path: string,
    range?: StorageRange,
  ): Promise<AsyncIterable<Uint8Array>> {
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);
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
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);

    return this.locks.withPathLocks(volumeId, [sourcePath, targetPath], () => adapter.move(sourcePath, targetPath));
  }

  /**
   * Copies a file, holding the lock on both paths.
   *
   * The source is locked as well as the target, so the file cannot be moved out from under the copy
   * between the check that it is a regular file and the read that follows.
   */
  async copyEntry(ownerId: string, volumeId: string, sourcePath: string, targetPath: string): Promise<FileEntry> {
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);

    return this.locks.withPathLocks(volumeId, [sourcePath, targetPath], () => adapter.copy(sourcePath, targetPath));
  }

  async deleteEntry(ownerId: string, volumeId: string, path: string, options?: StorageDeleteOptions): Promise<void> {
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);
    return adapter.delete(path, options);
  }

  /** Moves an entry to the trash, holding the lock on the path it leaves. */
  async trashEntry(ownerId: string, volumeId: string, path: string): Promise<TrashRecord> {
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);

    return this.locks.withPathLock(volumeId, path, () => adapter.trash(path));
  }

  async listTrash(ownerId: string, volumeId: string): Promise<readonly TrashRecord[]> {
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);
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
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);
    const keys = [trashLockKey(trashId), ...(targetPath === undefined ? [] : [targetPath])];

    return this.locks.withPathLocks(volumeId, keys, () => adapter.restoreFromTrash(trashId, targetPath));
  }

  /**
   * Removes one record for good, holding the lock on the record.
   *
   * The target path is unknown here and irrelevant: nothing lands anywhere, so the record itself is
   * the only thing two callers can contend over.
   */
  async purgeFromTrash(ownerId: string, volumeId: string, trashId: string): Promise<void> {
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);

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
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);
    return adapter.emptyTrash();
  }
}
