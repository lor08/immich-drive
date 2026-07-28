import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { FileEntry, FileEntryType } from 'src/extensions/files/file-entry';
import { LocalStorageAdapterError, LocalStorageErrorCode } from 'src/extensions/files/local-storage.adapter';
import { PathLock } from 'src/extensions/files/path-lock';
import { StorageDeleteOptions, StorageRange, StorageWriteOptions } from 'src/extensions/files/storage.adapter';
import { Volume } from 'src/extensions/files/volume';
import { VolumeRegistry } from 'src/extensions/files/volume.registry';

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

  async openEntry(
    ownerId: string,
    volumeId: string,
    path: string,
    range?: StorageRange,
  ): Promise<AsyncIterable<Uint8Array>> {
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);
    return adapter.open(path, range);
  }

  async writeEntry(
    ownerId: string,
    volumeId: string,
    path: string,
    content: AsyncIterable<Uint8Array>,
    options?: StorageWriteOptions,
  ): Promise<FileEntry> {
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);
    return adapter.write(path, content, options);
  }

  async moveEntry(ownerId: string, volumeId: string, sourcePath: string, targetPath: string): Promise<void> {
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);
    return adapter.move(sourcePath, targetPath);
  }

  async copyEntry(ownerId: string, volumeId: string, sourcePath: string, targetPath: string): Promise<FileEntry> {
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);
    return adapter.copy(sourcePath, targetPath);
  }

  async deleteEntry(ownerId: string, volumeId: string, path: string, options?: StorageDeleteOptions): Promise<void> {
    const adapter = await this.requireVolumes().getAdapter(ownerId, volumeId);
    return adapter.delete(path, options);
  }
}
