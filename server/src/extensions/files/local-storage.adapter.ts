import { constants, type Stats } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FileEntry, FileEntryType } from 'src/extensions/files/file-entry';
import {
  StorageAdapter,
  StorageDeleteOptions,
  StorageRange,
  StorageWriteOptions,
} from 'src/extensions/files/storage.adapter';

const READ_CHUNK_SIZE = 64 * 1024;

export enum LocalStorageErrorCode {
  InvalidRoot = 'invalid-root',
  InvalidPath = 'invalid-path',
  SymlinkNotAllowed = 'symlink-not-allowed',
  EntryNotFound = 'entry-not-found',
  EntryNotDirectory = 'entry-not-directory',
  EntryNotFile = 'entry-not-file',
  RangeNotSatisfiable = 'range-not-satisfiable',
  UnsupportedOperation = 'unsupported-operation',
}

export class LocalStorageAdapterError extends Error {
  constructor(
    public readonly code: LocalStorageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = LocalStorageAdapterError.name;
  }
}

interface ResolvedEntry {
  readonly virtualPath: string;
  readonly hostPath: string;
  readonly stats: Stats;
}

interface ReadWindow {
  readonly offset: number;
  readonly length: number;
}

export class LocalStorageAdapter extends StorageAdapter {
  private constructor(private readonly root: string) {
    super();
  }

  static async create(root: string): Promise<LocalStorageAdapter> {
    if (root.includes('\0') || !path.isAbsolute(root)) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Storage root must be an absolute path');
    }

    let canonicalRoot: string;
    try {
      canonicalRoot = await fs.realpath(root);
    } catch {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Storage root must exist');
    }

    const stats = await fs.lstat(canonicalRoot);
    if (!stats.isDirectory()) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Storage root must be a directory');
    }

    return new LocalStorageAdapter(canonicalRoot);
  }

  override async stat(virtualPath: string): Promise<FileEntry | null> {
    const entry = await this.resolveExisting(virtualPath);
    return entry ? this.toFileEntry(entry) : null;
  }

  override async list(virtualPath: string): Promise<readonly FileEntry[]> {
    const directory = await this.resolveRequired(virtualPath);
    if (!directory.stats.isDirectory()) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotDirectory, 'Storage entry is not a directory');
    }

    const entries = await fs.readdir(directory.hostPath, { withFileTypes: true });
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

    const result: FileEntry[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
        continue;
      }

      const childPath = this.joinVirtualPath(directory.virtualPath, entry.name);
      const child = await this.resolveExisting(childPath);
      if (child) {
        result.push(this.toFileEntry(child));
      }
    }

    return result;
  }

  override async open(virtualPath: string, range?: StorageRange): Promise<AsyncIterable<Uint8Array>> {
    const entry = await this.resolveRequired(virtualPath);
    if (!entry.stats.isFile()) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotFile, 'Storage entry is not a regular file');
    }

    const window = this.getReadWindow(entry.stats.size, range);
    return this.read(entry.hostPath, window);
  }

  override async write(
    virtualPath: string,
    content: AsyncIterable<Uint8Array>,
    options?: StorageWriteOptions,
  ): Promise<FileEntry> {
    void virtualPath;
    void content;
    void options;
    throw this.unsupported('write');
  }

  override async move(sourcePath: string, targetPath: string): Promise<void> {
    void sourcePath;
    void targetPath;
    throw this.unsupported('move');
  }

  override async copy(sourcePath: string, targetPath: string): Promise<FileEntry> {
    void sourcePath;
    void targetPath;
    throw this.unsupported('copy');
  }

  override async delete(virtualPath: string, options?: StorageDeleteOptions): Promise<void> {
    void virtualPath;
    void options;
    throw this.unsupported('delete');
  }

  private async resolveRequired(virtualPath: string): Promise<ResolvedEntry> {
    const entry = await this.resolveExisting(virtualPath);
    if (!entry) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotFound, 'Storage entry does not exist');
    }

    return entry;
  }

  private async resolveExisting(virtualPath: string): Promise<ResolvedEntry | null> {
    const normalizedPath = this.normalizeVirtualPath(virtualPath);
    const segments = normalizedPath === '/' ? [] : normalizedPath.slice(1).split('/');

    let hostPath = this.root;
    let stats: Stats;
    try {
      stats = await fs.lstat(hostPath);
    } catch {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Storage root is unavailable');
    }

    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Storage root is unavailable');
    }

    for (const segment of segments) {
      hostPath = path.join(hostPath, segment);
      try {
        stats = await fs.lstat(hostPath);
      } catch (error) {
        if (this.isErrno(error, 'ENOENT')) {
          return null;
        }
        throw error;
      }

      if (stats.isSymbolicLink()) {
        throw new LocalStorageAdapterError(
          LocalStorageErrorCode.SymlinkNotAllowed,
          'Symbolic links are not available through local storage',
        );
      }
    }

    let canonicalPath: string;
    try {
      canonicalPath = await fs.realpath(hostPath);
    } catch (error) {
      if (this.isErrno(error, 'ENOENT')) {
        return null;
      }
      throw error;
    }

    this.assertContained(canonicalPath);
    return { virtualPath: normalizedPath, hostPath, stats };
  }

  private normalizeVirtualPath(virtualPath: string): string {
    if (!virtualPath || virtualPath.includes('\0')) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Invalid storage path');
    }

    if (!virtualPath.startsWith('/') || virtualPath.startsWith('//') || virtualPath.includes('\\')) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Invalid storage path');
    }

    const rawSegments = virtualPath.slice(1).split('/');
    for (const segment of rawSegments) {
      if (segment === '.' || segment === '..' || /^[A-Za-z]:$/.test(segment)) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Invalid storage path');
      }
    }

    const segments = rawSegments.filter(Boolean);
    return segments.length === 0 ? '/' : `/${segments.join('/')}`;
  }

  private assertContained(canonicalPath: string): void {
    const relativePath = path.relative(this.root, canonicalPath);
    if (relativePath === '') {
      return;
    }

    if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Storage path escapes the configured root');
    }
  }

  private toFileEntry(entry: ResolvedEntry): FileEntry {
    let type: FileEntryType;
    if (entry.stats.isFile()) {
      type = FileEntryType.File;
    } else if (entry.stats.isDirectory()) {
      type = FileEntryType.Directory;
    } else {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Unsupported storage entry type');
    }

    return {
      path: entry.virtualPath,
      name: entry.virtualPath === '/' ? '/' : path.posix.basename(entry.virtualPath),
      type,
      size: entry.stats.size,
      modifiedAt: entry.stats.mtime,
    };
  }

  private joinVirtualPath(parent: string, name: string): string {
    if (name.includes('\\')) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Invalid storage entry name');
    }

    return parent === '/' ? `/${name}` : `${parent}/${name}`;
  }

  private getReadWindow(fileSize: number, range?: StorageRange): ReadWindow {
    const offset = range?.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.RangeNotSatisfiable, 'Invalid storage range offset');
    }

    if (range?.length !== undefined && (!Number.isSafeInteger(range.length) || range.length <= 0)) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.RangeNotSatisfiable, 'Invalid storage range length');
    }

    if (offset > fileSize) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.RangeNotSatisfiable, 'Storage range starts beyond EOF');
    }

    const available = fileSize - offset;
    return {
      offset,
      length: Math.min(range?.length ?? available, available),
    };
  }

  private async *read(hostPath: string, window: ReadWindow): AsyncGenerator<Uint8Array> {
    if (window.length === 0) {
      return;
    }

    let handle: fs.FileHandle;
    try {
      handle = await fs.open(hostPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if (this.isErrno(error, 'ELOOP')) {
        throw new LocalStorageAdapterError(
          LocalStorageErrorCode.SymlinkNotAllowed,
          'Symbolic links are not available through local storage',
        );
      }
      throw error;
    }

    try {
      const stats = await handle.stat();
      if (!stats.isFile()) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotFile, 'Storage entry is not a regular file');
      }

      if (window.offset > stats.size) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.RangeNotSatisfiable, 'Storage range starts beyond EOF');
      }

      let position = window.offset;
      let remaining = Math.min(window.length, stats.size - window.offset);
      const buffer = Buffer.allocUnsafe(Math.min(READ_CHUNK_SIZE, remaining));

      while (remaining > 0) {
        const requested = Math.min(buffer.length, remaining);
        const { bytesRead } = await handle.read(buffer, 0, requested, position);
        if (bytesRead === 0) {
          break;
        }

        yield Uint8Array.from(buffer.subarray(0, bytesRead));
        position += bytesRead;
        remaining -= bytesRead;
      }
    } finally {
      await handle.close();
    }
  }

  private unsupported(operation: string): LocalStorageAdapterError {
    return new LocalStorageAdapterError(
      LocalStorageErrorCode.UnsupportedOperation,
      `Local storage operation is not supported: ${operation}`,
    );
  }

  private isErrno(error: unknown, code: string): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && error.code === code;
  }
}
