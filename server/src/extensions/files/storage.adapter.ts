import { FileEntry } from 'src/extensions/files/file-entry';

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

export abstract class StorageAdapter {
  abstract stat(path: string): Promise<FileEntry | null>;
  abstract list(path: string): Promise<readonly FileEntry[]>;
  abstract open(path: string, range?: StorageRange): Promise<AsyncIterable<Uint8Array>>;
  abstract write(path: string, content: AsyncIterable<Uint8Array>, options?: StorageWriteOptions): Promise<FileEntry>;
  abstract move(sourcePath: string, targetPath: string): Promise<void>;
  abstract copy(sourcePath: string, targetPath: string): Promise<FileEntry>;
  abstract delete(path: string, options?: StorageDeleteOptions): Promise<void>;
}
