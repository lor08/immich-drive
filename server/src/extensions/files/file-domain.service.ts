import { Injectable } from '@nestjs/common';
import { FileEntry } from 'src/extensions/files/file-entry';
import {
  StorageAdapter,
  StorageDeleteOptions,
  StorageRange,
  StorageWriteOptions,
} from 'src/extensions/files/storage.adapter';

@Injectable()
export class FileDomainService {
  constructor(private readonly storage: StorageAdapter) {}

  getEntry(path: string): Promise<FileEntry | null> {
    return this.storage.stat(path);
  }

  listEntries(path: string): Promise<readonly FileEntry[]> {
    return this.storage.list(path);
  }

  openEntry(path: string, range?: StorageRange): Promise<AsyncIterable<Uint8Array>> {
    return this.storage.open(path, range);
  }

  writeEntry(
    path: string,
    content: AsyncIterable<Uint8Array>,
    options?: StorageWriteOptions,
  ): Promise<FileEntry> {
    return this.storage.write(path, content, options);
  }

  moveEntry(sourcePath: string, targetPath: string): Promise<void> {
    return this.storage.move(sourcePath, targetPath);
  }

  copyEntry(sourcePath: string, targetPath: string): Promise<FileEntry> {
    return this.storage.copy(sourcePath, targetPath);
  }

  deleteEntry(path: string, options?: StorageDeleteOptions): Promise<void> {
    return this.storage.delete(path, options);
  }
}
