import { FileEntry, TrashRecord } from 'src/extensions/files/file-entry';

export interface StorageRange {
  readonly offset: number;
  readonly length?: number;
}

export interface StorageWriteOptions {
  readonly overwrite?: boolean;
}

export interface StorageDeleteOptions {
  readonly recursive?: boolean;
}

/**
 * What emptying the trash actually managed to do.
 *
 * Counts rather than a plain success, because one record the filesystem refuses to remove must not
 * make the whole trash permanently un-emptiable. The caller sees what was removed and what was not.
 */
export interface TrashPurgeResult {
  readonly removed: number;
  readonly failed: number;
}

export abstract class StorageAdapter {
  abstract stat(path: string): Promise<FileEntry | null>;
  abstract list(path: string): Promise<readonly FileEntry[]>;
  abstract createDirectory(path: string): Promise<FileEntry>;
  abstract open(path: string, range?: StorageRange): Promise<AsyncIterable<Uint8Array>>;
  abstract write(path: string, content: AsyncIterable<Uint8Array>, options?: StorageWriteOptions): Promise<FileEntry>;
  abstract move(sourcePath: string, targetPath: string): Promise<void>;
  abstract copy(sourcePath: string, targetPath: string): Promise<FileEntry>;
  abstract delete(path: string, options?: StorageDeleteOptions): Promise<void>;

  /**
   * The trash is part of the storage contract, not an optional extra.
   *
   * ADR 0002 makes recoverability a property of the storage layout rather than of the application, so
   * an adapter either provides a place deleted content survives in or says plainly that it cannot.
   * A backend with no such place refuses these the way a read-only adapter refuses a write.
   */
  abstract trash(path: string): Promise<TrashRecord>;
  abstract listTrash(): Promise<readonly TrashRecord[]>;
  abstract restoreFromTrash(id: string, targetPath?: string): Promise<FileEntry>;
  abstract purgeFromTrash(id: string): Promise<void>;
  abstract emptyTrash(): Promise<TrashPurgeResult>;
}
