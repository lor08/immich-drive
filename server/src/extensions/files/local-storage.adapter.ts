import { constants, type BigIntStats, type Stats } from 'node:fs';
import fs, { type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { FileEntry, FileEntryType } from 'src/extensions/files/file-entry';
import {
  StorageAdapter,
  StorageDeleteOptions,
  StorageRange,
  StorageWriteOptions,
} from 'src/extensions/files/storage.adapter';

const READ_CHUNK_SIZE = 64 * 1024;
const DIRECTORY_OPEN_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const ENTRY_OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const FILE_DESCRIPTOR_ROOTS: Partial<Record<NodeJS.Platform, string>> = {
  linux: '/proc/self/fd',
  darwin: '/dev/fd',
};

const compareNames = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

export enum LocalStorageErrorCode {
  InvalidRoot = 'invalid-root',
  InvalidPath = 'invalid-path',
  SymlinkNotAllowed = 'symlink-not-allowed',
  EntryNotFound = 'entry-not-found',
  EntryNotDirectory = 'entry-not-directory',
  EntryNotFile = 'entry-not-file',
  EntryChanged = 'entry-changed',
  RangeNotSatisfiable = 'range-not-satisfiable',
  UnsupportedOperation = 'unsupported-operation',
  UnsupportedPlatform = 'unsupported-platform',
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

interface FileIdentity {
  readonly device: bigint;
  readonly inode: bigint;
}

interface OpenedEntry {
  readonly virtualPath: string;
  readonly handle: FileHandle;
  readonly stats: Stats;
}

interface OpenedChild {
  readonly handle: FileHandle;
  readonly stats: Stats;
}

interface ReadWindow {
  readonly offset: number;
  readonly length: number;
}

export class LocalStorageAdapter extends StorageAdapter {
  private constructor(
    private readonly root: string,
    private readonly descriptorRoot: string,
    private readonly rootIdentity: FileIdentity,
  ) {
    super();
  }

  static async create(root: string): Promise<LocalStorageAdapter> {
    if (root.includes('\0') || !path.isAbsolute(root)) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Storage root must be an absolute path');
    }

    const descriptorRoot = FILE_DESCRIPTOR_ROOTS[process.platform];
    if (descriptorRoot === undefined) {
      throw new LocalStorageAdapterError(
        LocalStorageErrorCode.UnsupportedPlatform,
        'Secure local storage is not supported on this platform',
      );
    }

    let canonicalRoot: string;
    try {
      canonicalRoot = await fs.realpath(root);
    } catch {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Storage root must exist');
    }

    let handle: FileHandle | undefined;
    try {
      handle = await fs.open(canonicalRoot, DIRECTORY_OPEN_FLAGS);
      const stats = await handle.stat({ bigint: true });
      if (!stats.isDirectory()) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Storage root must be a directory');
      }

      const openedPath = await fs.realpath(path.join(descriptorRoot, String(handle.fd)));
      if (openedPath !== canonicalRoot) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Storage root changed during setup');
      }

      return new LocalStorageAdapter(canonicalRoot, descriptorRoot, LocalStorageAdapter.identity(stats));
    } catch (error) {
      if (error instanceof LocalStorageAdapterError) {
        throw error;
      }

      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Storage root cannot be opened safely');
    } finally {
      if (handle !== undefined) {
        await handle.close();
      }
    }
  }

  override async stat(virtualPath: string): Promise<FileEntry | null> {
    const entry = await this.resolveExisting(virtualPath);
    if (entry === null) {
      return null;
    }

    try {
      return this.toFileEntry(entry.virtualPath, entry.stats);
    } finally {
      await entry.handle.close();
    }
  }

  override async list(virtualPath: string): Promise<readonly FileEntry[]> {
    const directory = await this.resolveRequired(virtualPath);
    try {
      if (!directory.stats.isDirectory()) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotDirectory, 'Storage entry is not a directory');
      }

      const entries = await fs.readdir(this.descriptorPath(directory.handle), { withFileTypes: true });
      entries.sort((left, right) => compareNames(left.name, right.name));

      const result: FileEntry[] = [];
      for (const entry of entries) {
        if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
          continue;
        }

        let child: OpenedChild | null;
        try {
          child = await this.openChild(directory.handle, entry.name, false);
        } catch (error) {
          if (this.hasCode(error, LocalStorageErrorCode.SymlinkNotAllowed)) {
            continue;
          }
          throw error;
        }

        if (child === null) {
          continue;
        }

        try {
          result.push(this.toFileEntry(this.joinVirtualPath(directory.virtualPath, entry.name), child.stats));
        } finally {
          await child.handle.close();
        }
      }

      return result;
    } finally {
      await directory.handle.close();
    }
  }

  override async open(virtualPath: string, range?: StorageRange): Promise<AsyncIterable<Uint8Array>> {
    const entry = await this.resolveRequired(virtualPath);
    try {
      if (!entry.stats.isFile()) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotFile, 'Storage entry is not a regular file');
      }
      this.getReadWindow(entry.stats.size, range);
    } finally {
      await entry.handle.close();
    }

    return this.read(virtualPath, range);
  }

  override write(
    virtualPath: string,
    content: AsyncIterable<Uint8Array>,
    options?: StorageWriteOptions,
  ): Promise<FileEntry> {
    void virtualPath;
    void content;
    void options;
    return Promise.reject(this.unsupported('write'));
  }

  override move(sourcePath: string, targetPath: string): Promise<void> {
    void sourcePath;
    void targetPath;
    return Promise.reject(this.unsupported('move'));
  }

  override copy(sourcePath: string, targetPath: string): Promise<FileEntry> {
    void sourcePath;
    void targetPath;
    return Promise.reject(this.unsupported('copy'));
  }

  override delete(virtualPath: string, options?: StorageDeleteOptions): Promise<void> {
    void virtualPath;
    void options;
    return Promise.reject(this.unsupported('delete'));
  }

  private async resolveRequired(virtualPath: string): Promise<OpenedEntry> {
    const entry = await this.resolveExisting(virtualPath);
    if (entry === null) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotFound, 'Storage entry does not exist');
    }

    return entry;
  }

  private async resolveExisting(virtualPath: string): Promise<OpenedEntry | null> {
    const normalizedPath = this.normalizeVirtualPath(virtualPath);
    const segments = normalizedPath === '/' ? [] : normalizedPath.slice(1).split('/');

    let current = await this.openRoot();
    try {
      if (segments.length === 0) {
        return {
          virtualPath: normalizedPath,
          handle: current,
          stats: await current.stat(),
        };
      }

      for (const [index, segment] of segments.entries()) {
        const child = await this.openChild(current, segment, index < segments.length - 1);
        await current.close();

        if (child === null) {
          return null;
        }

        current = child.handle;
        if (index === segments.length - 1) {
          return {
            virtualPath: normalizedPath,
            handle: current,
            stats: child.stats,
          };
        }
      }

      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Invalid storage path');
    } catch (error) {
      await current.close();
      throw error;
    }
  }

  private async openRoot(): Promise<FileHandle> {
    let handle: FileHandle | undefined;
    try {
      handle = await fs.open(this.root, DIRECTORY_OPEN_FLAGS);
      const stats = await handle.stat({ bigint: true });
      if (!stats.isDirectory() || !LocalStorageAdapter.sameIdentity(this.rootIdentity, stats)) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Storage root changed after setup');
      }

      const openedPath = await fs.realpath(this.descriptorPath(handle));
      if (openedPath !== this.root) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Storage root changed after setup');
      }

      return handle;
    } catch (error) {
      if (handle !== undefined) {
        await handle.close();
      }
      if (error instanceof LocalStorageAdapterError) {
        throw error;
      }

      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Storage root is unavailable');
    }
  }

  private async openChild(parent: FileHandle, name: string, requireDirectory: boolean): Promise<OpenedChild | null> {
    const candidatePath = this.descriptorChildPath(parent, name);

    let before: BigIntStats;
    try {
      before = await fs.lstat(candidatePath, { bigint: true });
    } catch (error) {
      if (this.isErrno(error, 'ENOENT')) {
        return null;
      }
      throw error;
    }

    if (before.isSymbolicLink()) {
      throw this.symlinkError();
    }
    if (requireDirectory && !before.isDirectory()) {
      throw new LocalStorageAdapterError(
        LocalStorageErrorCode.EntryNotDirectory,
        'Storage path component is not a directory',
      );
    }
    if (!before.isFile() && !before.isDirectory()) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Unsupported storage entry type');
    }

    let handle: FileHandle | undefined;
    try {
      handle = await fs.open(candidatePath, requireDirectory ? DIRECTORY_OPEN_FLAGS : ENTRY_OPEN_FLAGS);
      const after = await handle.stat({ bigint: true });
      if (!LocalStorageAdapter.sameIdentity(LocalStorageAdapter.identity(before), after)) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryChanged, 'Storage entry changed during access');
      }
      if (requireDirectory && !after.isDirectory()) {
        throw new LocalStorageAdapterError(
          LocalStorageErrorCode.EntryNotDirectory,
          'Storage path component is not a directory',
        );
      }
      if (!after.isFile() && !after.isDirectory()) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Unsupported storage entry type');
      }

      const canonicalPath = await fs.realpath(this.descriptorPath(handle));
      this.assertContained(canonicalPath);

      return {
        handle,
        stats: await handle.stat(),
      };
    } catch (error) {
      if (handle !== undefined) {
        await handle.close();
      }
      if (this.isErrno(error, 'ENOENT')) {
        return null;
      }
      if (this.isErrno(error, 'ELOOP')) {
        throw this.symlinkError();
      }
      if (this.isErrno(error, 'ENOTDIR') && requireDirectory) {
        throw new LocalStorageAdapterError(
          LocalStorageErrorCode.EntryNotDirectory,
          'Storage path component is not a directory',
        );
      }
      throw error;
    }
  }

  private normalizeVirtualPath(virtualPath: string): string {
    if (virtualPath.length === 0 || virtualPath.includes('\0')) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Invalid storage path');
    }

    if (
      !virtualPath.startsWith('/') ||
      virtualPath.startsWith('//') ||
      virtualPath.includes('\\') ||
      (virtualPath !== '/' && (virtualPath.endsWith('/') || virtualPath.includes('//')))
    ) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Invalid storage path');
    }

    const segments = virtualPath === '/' ? [] : virtualPath.slice(1).split('/');
    for (const segment of segments) {
      if (segment.length === 0 || segment === '.' || segment === '..' || /^[A-Za-z]:$/.test(segment)) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Invalid storage path');
      }
    }

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

  private toFileEntry(virtualPath: string, stats: Stats): FileEntry {
    const type = LocalStorageAdapter.toFileEntryType(stats);

    if (!Number.isSafeInteger(stats.size) || stats.size < 0) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Storage entry size is not supported');
    }

    return {
      path: virtualPath,
      name: virtualPath === '/' ? '/' : path.posix.basename(virtualPath),
      type,
      size: stats.size,
      modifiedAt: new Date(stats.mtimeMs),
    };
  }

  private joinVirtualPath(parent: string, name: string): string {
    if (
      name.length === 0 ||
      name.includes('/') ||
      name.includes('\\') ||
      name.includes('\0') ||
      name === '.' ||
      name === '..'
    ) {
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

  private async *read(virtualPath: string, range?: StorageRange): AsyncGenerator<Uint8Array> {
    const entry = await this.resolveRequired(virtualPath);
    try {
      if (!entry.stats.isFile()) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotFile, 'Storage entry is not a regular file');
      }

      const currentStats = await entry.handle.stat();
      if (!currentStats.isFile()) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotFile, 'Storage entry is not a regular file');
      }

      const window = this.getReadWindow(currentStats.size, range);
      if (window.length === 0) {
        return;
      }

      let position = window.offset;
      let remaining = window.length;
      const buffer = Buffer.allocUnsafe(Math.min(READ_CHUNK_SIZE, remaining));

      while (remaining > 0) {
        const requested = Math.min(buffer.length, remaining);
        const { bytesRead } = await entry.handle.read(buffer, 0, requested, position);
        if (bytesRead === 0) {
          break;
        }

        yield Uint8Array.from(buffer.subarray(0, bytesRead));
        position += bytesRead;
        remaining -= bytesRead;
      }
    } finally {
      await entry.handle.close();
    }
  }

  private descriptorPath(handle: FileHandle): string {
    return path.join(this.descriptorRoot, String(handle.fd));
  }

  private descriptorChildPath(parent: FileHandle, name: string): string {
    return path.join(this.descriptorPath(parent), name);
  }

  private unsupported(operation: string): LocalStorageAdapterError {
    return new LocalStorageAdapterError(
      LocalStorageErrorCode.UnsupportedOperation,
      `Local storage operation is not supported: ${operation}`,
    );
  }

  private symlinkError(): LocalStorageAdapterError {
    return new LocalStorageAdapterError(
      LocalStorageErrorCode.SymlinkNotAllowed,
      'Symbolic links are not available through local storage',
    );
  }

  private hasCode(error: unknown, code: LocalStorageErrorCode): boolean {
    return error instanceof LocalStorageAdapterError && error.code === code;
  }

  private isErrno(error: unknown, code: string): error is NodeJS.ErrnoException {
    return (error as NodeJS.ErrnoException | undefined)?.code === code;
  }

  private static toFileEntryType(stats: Stats): FileEntryType {
    if (stats.isFile()) {
      return FileEntryType.File;
    }
    if (stats.isDirectory()) {
      return FileEntryType.Directory;
    }
    throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Unsupported storage entry type');
  }

  private static identity(stats: BigIntStats): FileIdentity {
    return {
      device: stats.dev,
      inode: stats.ino,
    };
  }

  private static sameIdentity(expected: FileIdentity, actual: BigIntStats): boolean {
    return expected.device === actual.dev && expected.inode === actual.ino;
  }
}
