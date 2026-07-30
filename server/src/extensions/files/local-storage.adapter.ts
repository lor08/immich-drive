import { createHash, randomUUID } from 'node:crypto';
import { constants, type BigIntStats, type Stats } from 'node:fs';
import fs, { type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import {
  CHECKSUM_ALGORITHM,
  FileEntry,
  FileEntryType,
  TrashRecord,
  WrittenEntry,
} from 'src/extensions/files/file-entry';
import {
  StorageAdapter,
  StorageDeleteOptions,
  StorageRange,
  StorageWriteOptions,
  TrashInspection,
  TrashPurgeResult,
} from 'src/extensions/files/storage.adapter';

const READ_CHUNK_SIZE = 64 * 1024;
const DIRECTORY_OPEN_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const ENTRY_OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;

/** Owner-only, matching how volume directories are provisioned; see ADR 0004. */
const DIRECTORY_MODE = 0o700;

/** Owner-only, matching the directories that contain them. */
const FILE_MODE = 0o600;

/**
 * Version stamped into every trash manifest.
 *
 * The manifest is read by a future version of this server, and possibly by a person with a text
 * editor, so it says which shape it is rather than relying on the reader to guess.
 */
const TRASH_MANIFEST_VERSION = 1;

/**
 * A trash record is named by a generated identifier, and only that shape is accepted back.
 *
 * Identifiers arrive from clients, so they are validated before they are used as a path segment. This
 * pattern cannot contain a separator, a dot segment, or a null byte, which makes a record name unable
 * to address anything but a record.
 */
const TRASH_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
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
  EntryExists = 'entry-exists',
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

/** A directory beside the address root, pinned by identity so a swap after setup is detected. */
interface ServiceRoot {
  readonly path: string;
  readonly identity: FileIdentity;
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
    /**
     * Where partial writes live until they are complete.
     *
     * Deliberately outside the address root: `P1-16` made the adapter's root the volume's browsable
     * tree so service directories are structurally unreachable, and staging must stay that way. It is
     * never resolved from a virtual path — only this class ever names it.
     */
    private readonly stagingRoot: string | undefined,
    /**
     * Where deleted content lives until it is restored or removed.
     *
     * Outside the address root for the same reason staging is: `P1-16` made the adapter's root the
     * volume's browsable tree, so a user can neither browse their own trash as a folder nor collide
     * with its name. Only this class ever names it.
     */
    private readonly trashRoot: ServiceRoot | undefined,
  ) {
    super();
  }

  static async create(root: string, stagingRoot?: string, trashRoot?: string): Promise<LocalStorageAdapter> {
    if (root.includes('\0') || !path.isAbsolute(root)) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Storage root must be an absolute path');
    }

    for (const [label, candidate] of [
      ['Staging', stagingRoot],
      ['Trash', trashRoot],
    ] as const) {
      if (candidate !== undefined && (candidate.includes('\0') || !path.isAbsolute(candidate))) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, `${label} root must be an absolute path`);
      }
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

      const staging =
        stagingRoot === undefined
          ? undefined
          : await LocalStorageAdapter.prepareServiceRoot(stagingRoot, stats, 'Staging');
      const canonicalTrashRoot =
        trashRoot === undefined ? undefined : await LocalStorageAdapter.prepareServiceRoot(trashRoot, stats, 'Trash');

      return new LocalStorageAdapter(
        canonicalRoot,
        descriptorRoot,
        LocalStorageAdapter.identity(stats),
        staging?.path,
        canonicalTrashRoot,
      );
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

  /**
   * Validates a service directory that sits beside the address root.
   *
   * The same-filesystem check is the point, and it is the same point for both users of this. An
   * atomic rename in or out of the address root is only possible within one filesystem, so a staging
   * directory elsewhere would silently turn every upload into a copy that can fail halfway, and a
   * trash directory elsewhere would turn every delete into one — which is precisely what ADR 0004
   * says a delete must never become. Better to refuse at construction than to discover it later.
   */
  private static async prepareServiceRoot(
    candidate: string,
    rootStats: BigIntStats,
    label: string,
  ): Promise<ServiceRoot> {
    let canonical: string;
    try {
      canonical = await fs.realpath(candidate);
    } catch {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, `${label} root must exist`);
    }

    const stats = await fs.stat(canonical, { bigint: true });
    if (!stats.isDirectory()) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, `${label} root must be a directory`);
    }

    if (stats.dev !== rootStats.dev) {
      throw new LocalStorageAdapterError(
        LocalStorageErrorCode.InvalidRoot,
        `${label} root must be on the same filesystem as the storage root`,
      );
    }

    return { path: canonical, identity: LocalStorageAdapter.identity(stats) };
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

  /**
   * Creates one directory, relative to its pinned parent descriptor.
   *
   * The parent is resolved the same way reads are, so it cannot be swapped between validation and
   * creation, and `mkdir` addresses it through its descriptor rather than by re-walking a path
   * string. Creation is deliberately not recursive: a missing parent is an error rather than an
   * invitation to materialise a hierarchy, which also means a mistyped path fails instead of
   * quietly succeeding.
   */
  override async createDirectory(virtualPath: string): Promise<FileEntry> {
    const { normalized: normalizedPath, parentPath, name } = this.splitPath(virtualPath);

    const parent = await this.resolveRequired(parentPath);
    try {
      if (!parent.stats.isDirectory()) {
        throw new LocalStorageAdapterError(
          LocalStorageErrorCode.EntryNotDirectory,
          'Storage parent is not a directory',
        );
      }

      try {
        await fs.mkdir(this.descriptorChildPath(parent.handle, name), { mode: DIRECTORY_MODE });
      } catch (error) {
        if (this.isErrno(error, 'EEXIST')) {
          throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryExists, 'Storage entry already exists');
        }
        throw error;
      }

      // Re-open through the parent descriptor, so what is reported is what now exists on disk.
      const child = await this.openChild(parent.handle, name, true);
      if (child === null) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryChanged, 'Storage entry changed during access');
      }

      try {
        return this.toFileEntry(normalizedPath, child.stats);
      } finally {
        await child.handle.close();
      }
    } finally {
      await parent.handle.close();
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

  /**
   * Writes one file, atomically.
   *
   * Content lands in the staging directory first, is flushed, and only then is renamed into place.
   * A reader therefore never observes a partial file at the target path: it either sees the previous
   * content or the complete new content. The staging file is removed on every failure path, so an
   * interrupted transfer leaves nothing behind — including when the client disconnects.
   */
  override async write(
    virtualPath: string,
    content: AsyncIterable<Uint8Array>,
    options?: StorageWriteOptions,
  ): Promise<WrittenEntry> {
    const stagingRoot = this.requireStagingRoot();

    const { normalized: normalizedPath, parentPath, name } = this.splitPath(virtualPath);

    const parent = await this.resolveRequired(parentPath);
    const stagingPath = path.join(stagingRoot, `upload-${randomUUID()}`);

    try {
      if (!parent.stats.isDirectory()) {
        throw new LocalStorageAdapterError(
          LocalStorageErrorCode.EntryNotDirectory,
          'Storage parent is not a directory',
        );
      }

      const existing = await this.openChild(parent.handle, name, false);
      if (existing !== null) {
        try {
          if (!options?.overwrite) {
            throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryExists, 'Storage entry already exists');
          }
          if (existing.stats.isDirectory()) {
            throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryExists, 'Storage entry is a directory');
          }
        } finally {
          await existing.handle.close();
        }
      }

      // 'wx' so a staging name can never be reused, and owner-only from the moment it exists.
      const staging = await fs.open(stagingPath, 'wx', FILE_MODE);
      // Hashed in the same pass that writes: the bytes are already in hand, so the digest is free, and it
      // describes exactly what was written rather than whatever is at the path afterwards.
      const hash = createHash(CHECKSUM_ALGORITHM);
      try {
        for await (const chunk of content) {
          hash.update(chunk);
          await staging.write(chunk);
        }
        // Flush before the rename, so a crash cannot publish an empty or truncated file.
        await staging.sync();
      } finally {
        await staging.close();
      }

      await fs.rename(stagingPath, this.descriptorChildPath(parent.handle, name));

      const written = await this.openChild(parent.handle, name, false);
      if (written === null) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryChanged, 'Storage entry changed during access');
      }

      try {
        return {
          ...this.toFileEntry(normalizedPath, written.stats),
          checksum: hash.digest('hex'),
          checksumAlgorithm: CHECKSUM_ALGORITHM,
        };
      } finally {
        await written.handle.close();
      }
    } catch (error) {
      await fs.rm(stagingPath, { force: true });
      throw error;
    } finally {
      await parent.handle.close();
    }
  }

  /**
   * Moves an entry, which also covers renaming when the parent does not change.
   *
   * Both parents are resolved through descriptors and the rename addresses them through those, so
   * neither side can be substituted between validation and the operation. An existing target is a
   * conflict rather than a silent replacement: overwriting during a move has cases that cannot be
   * done atomically, such as a target directory that is not empty, and no caller needs it.
   */
  override async move(sourcePath: string, targetPath: string): Promise<void> {
    // A rename needs no staging, but the staging root is what marks this adapter able to modify
    // content at all, so a read-only volume refuses a move for the same reason it refuses a write.
    this.requireStagingRoot();

    const source = this.splitPath(sourcePath);
    const target = this.splitPath(targetPath);

    // Refused before touching the filesystem, so the caller gets our error instead of a bare errno.
    if (target.normalized.startsWith(`${source.normalized}/`)) {
      throw new LocalStorageAdapterError(
        LocalStorageErrorCode.InvalidPath,
        'Storage entry cannot be moved inside itself',
      );
    }

    const sourceParent = await this.resolveRequired(source.parentPath);
    try {
      const existing = await this.openChild(sourceParent.handle, source.name, false);
      if (existing === null) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotFound, 'Storage entry does not exist');
      }
      await existing.handle.close();

      // Nothing to do — but only once there is something to do nothing with. Reporting success for a
      // path that holds nothing would tell the caller their entry is at the target when none exists.
      if (source.normalized === target.normalized) {
        return;
      }

      const targetParent = await this.resolveRequired(target.parentPath);
      try {
        if (!targetParent.stats.isDirectory()) {
          throw new LocalStorageAdapterError(
            LocalStorageErrorCode.EntryNotDirectory,
            'Storage parent is not a directory',
          );
        }

        // `rename` would replace this without asking, so the target is checked first. The path lock
        // held by the caller is what makes the gap between the check and the rename safe.
        const occupied = await this.openChild(targetParent.handle, target.name, false);
        if (occupied !== null) {
          await occupied.handle.close();
          throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryExists, 'Storage entry already exists');
        }

        try {
          await fs.rename(
            this.descriptorChildPath(sourceParent.handle, source.name),
            this.descriptorChildPath(targetParent.handle, target.name),
          );
        } catch (error) {
          // Reachable inside one volume: a subdirectory can be a separate mount.
          if (this.isErrno(error, 'EXDEV')) {
            throw new LocalStorageAdapterError(
              LocalStorageErrorCode.UnsupportedOperation,
              'Storage entry cannot be moved across filesystems',
            );
          }
          throw error;
        }
      } finally {
        await targetParent.handle.close();
      }
    } finally {
      await sourceParent.handle.close();
    }
  }

  /**
   * Copies one file.
   *
   * A directory is refused: copying a tree is an open-ended operation that can fail halfway and needs
   * progress and cancellation, which belongs to a background job rather than to a request. The copy
   * goes through the same staged write as an upload, so a partial copy is never visible at the target.
   */
  override async copy(sourcePath: string, targetPath: string): Promise<WrittenEntry> {
    // Checked before resolving anything, so a read-only volume answers the same way whether or not
    // the source happens to exist.
    this.requireStagingRoot();

    const source = await this.resolveRequired(this.normalizeVirtualPath(sourcePath));
    try {
      // Reported as "not a file" rather than as an unsupported operation, so the client sees a
      // rejected request instead of a server fault: the endpoint's subject is a file.
      if (source.stats.isDirectory()) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotFile, 'Copying a directory is not supported');
      }
      if (!source.stats.isFile()) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotFile, 'Storage entry is not a regular file');
      }
    } finally {
      await source.handle.close();
    }

    // Re-opened rather than streamed from the handle above, because `open` is the one place that
    // pins a file for reading, and the target is written before either path is reported.
    return this.write(targetPath, await this.open(sourcePath));
  }

  /**
   * The digest of what is at a path right now.
   *
   * Streams through `open`, so it inherits the same containment and the same refusal of anything that is
   * not a regular file, and it holds no more than one chunk in memory at a time.
   */
  override async digest(virtualPath: string): Promise<string> {
    const hash = createHash(CHECKSUM_ALGORITHM);
    for await (const chunk of await this.open(virtualPath)) {
      hash.update(chunk);
    }

    return hash.digest('hex');
  }

  /**
   * Moves an entry into the volume's trash.
   *
   * The move is a `rename(2)` into a sibling directory, so a delete never becomes a copy however
   * large the entry is, and a folder goes in whole rather than one child at a time. What the
   * filesystem cannot carry — where the entry came from and when it left — goes into a sidecar
   * manifest beside the record.
   *
   * The manifest is written before the rename. If the rename then fails, the manifest and the empty
   * record are removed and the entry never left its place; the opposite order would risk content
   * sitting in the trash with no record of where it belongs.
   */
  override async trash(virtualPath: string): Promise<TrashRecord> {
    const trashRoot = this.requireTrashRoot();
    const { normalized, parentPath, name } = this.splitPath(virtualPath);

    const id = randomUUID();
    const trashHandle = await this.openServiceRoot(trashRoot);
    try {
      const parent = await this.resolveRequired(parentPath);
      try {
        const entry = await this.openChild(parent.handle, name, false);
        if (entry === null) {
          throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotFound, 'Storage entry does not exist');
        }

        let record: TrashRecord;
        try {
          record = {
            id,
            name,
            originalPath: normalized,
            type: LocalStorageAdapter.toFileEntryType(entry.stats),
            size: entry.stats.size,
            deletedAt: new Date(),
          };
        } finally {
          await entry.handle.close();
        }

        await this.writeTrashManifest(trashHandle, record);
        try {
          await fs.mkdir(this.descriptorChildPath(trashHandle, id), { mode: DIRECTORY_MODE });
          const destination = await this.openChild(trashHandle, id, true, trashRoot.path);
          if (destination === null) {
            throw new LocalStorageAdapterError(
              LocalStorageErrorCode.EntryChanged,
              'Trash record changed during access',
            );
          }

          try {
            await fs.rename(
              this.descriptorChildPath(parent.handle, name),
              this.descriptorChildPath(destination.handle, name),
            );
          } finally {
            await destination.handle.close();
          }
        } catch (error) {
          await this.removeTrashRecord(trashHandle, id);

          // The trash is a sibling of the address root, so this means the volume spans two mounts.
          if (this.isErrno(error, 'EXDEV')) {
            throw new LocalStorageAdapterError(
              LocalStorageErrorCode.UnsupportedOperation,
              'Storage entry cannot be moved to the trash across filesystems',
            );
          }
          throw error;
        }

        return record;
      } finally {
        await parent.handle.close();
      }
    } finally {
      await trashHandle.close();
    }
  }

  /**
   * Lists the trash, newest first.
   *
   * A record whose manifest is missing or unreadable is still listed, with an unknown original path.
   * Hiding it would leave content that cannot be seen, restored, or removed — the one outcome the
   * trash exists to prevent.
   */
  override async listTrash(): Promise<readonly TrashRecord[]> {
    const trashRoot = this.requireTrashRoot();
    const trashHandle = await this.openServiceRoot(trashRoot);

    try {
      const names = await fs.readdir(this.descriptorPath(trashHandle));
      const records: TrashRecord[] = [];

      for (const id of names) {
        if (!TRASH_ID_PATTERN.test(id)) {
          continue;
        }

        const record = await this.readTrashRecord(trashHandle, trashRoot, id);
        if (record !== null) {
          records.push(record);
        }
      }

      return records.sort((left, right) => {
        // A record without a manifest has no time to sort by, so it sorts last but stays visible.
        const leftTime = left.deletedAt?.getTime() ?? -1;
        const rightTime = right.deletedAt?.getTime() ?? -1;
        return rightTime === leftTime ? compareNames(left.id, right.id) : rightTime - leftTime;
      });
    } finally {
      await trashHandle.close();
    }
  }

  /**
   * Reports the trash as it is, rather than as it should be.
   *
   * The three outcomes are deliberately separate. A record whose manifest is unreadable is still a
   * record, and appears with a null origin. A manifest whose directory is missing is not a record at
   * all — a delete interrupted between writing the manifest and creating the directory leaves one, and
   * nothing else ever looks at it again. Anything else in the trash belongs to whoever put it there:
   * it is named here so an operator can see it, and touched by nothing.
   */
  override async inspectTrash(): Promise<TrashInspection> {
    const trashRoot = this.requireTrashRoot();
    const trashHandle = await this.openServiceRoot(trashRoot);

    try {
      const names = await fs.readdir(this.descriptorPath(trashHandle));
      const contentIds = new Set<string>();
      const manifestIds = new Set<string>();
      const foreign: string[] = [];

      for (const name of names) {
        if (TRASH_ID_PATTERN.test(name)) {
          contentIds.add(name);
          continue;
        }

        const withoutSuffix = name.endsWith('.json') ? name.slice(0, -'.json'.length) : null;
        if (withoutSuffix !== null && TRASH_ID_PATTERN.test(withoutSuffix)) {
          manifestIds.add(withoutSuffix);
          continue;
        }

        foreign.push(name);
      }

      const records: TrashRecord[] = [];
      for (const id of [...contentIds].sort(compareNames)) {
        // An identifier-shaped name that is not a record — a plain file, or a directory holding more
        // than one entry — is reported as foreign rather than skipped silently, because a purge can
        // still remove it and an operator has no other way to learn it is there.
        const record = await this.readTrashRecord(trashHandle, trashRoot, id).catch(() => null);
        if (record === null) {
          foreign.push(id);
          continue;
        }

        records.push(record);
      }

      return {
        records,
        orphanedManifests: [...manifestIds].filter((id) => !contentIds.has(id)).sort(compareNames),
        foreign: foreign.sort(compareNames),
      };
    } finally {
      await trashHandle.close();
    }
  }

  /**
   * Puts a record back, at its original path or at one the caller names.
   *
   * An occupied target is a conflict rather than a replacement, for the same reason a move refuses
   * one. `targetPath` exists so that conflict is resolvable without an overwrite flag, and so a
   * record whose manifest is unreadable can still be recovered somewhere.
   */
  override async restoreFromTrash(id: string, targetPath?: string): Promise<FileEntry> {
    const trashRoot = this.requireTrashRoot();
    this.assertTrashId(id);

    const trashHandle = await this.openServiceRoot(trashRoot);
    try {
      const record = await this.readTrashRecord(trashHandle, trashRoot, id);
      if (record === null) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotFound, 'Trash record does not exist');
      }

      const destination = targetPath ?? record.originalPath;
      if (destination === null) {
        throw new LocalStorageAdapterError(
          LocalStorageErrorCode.InvalidPath,
          'Trash record has no known original path, so a target path is required',
        );
      }

      const target = this.splitPath(destination);
      let restoredEntry: FileEntry;
      const source = await this.openChild(trashHandle, id, true, trashRoot.path);
      if (source === null) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryChanged, 'Trash record changed during access');
      }

      try {
        const parent = await this.resolveRequired(target.parentPath);
        try {
          if (!parent.stats.isDirectory()) {
            throw new LocalStorageAdapterError(
              LocalStorageErrorCode.EntryNotDirectory,
              'Storage parent is not a directory',
            );
          }

          const occupied = await this.openChild(parent.handle, target.name, false);
          if (occupied !== null) {
            await occupied.handle.close();
            throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryExists, 'Storage entry already exists');
          }

          await fs.rename(
            this.descriptorChildPath(source.handle, record.name),
            this.descriptorChildPath(parent.handle, target.name),
          );

          const restored = await this.openChild(parent.handle, target.name, false);
          if (restored === null) {
            throw new LocalStorageAdapterError(
              LocalStorageErrorCode.EntryChanged,
              'Storage entry changed during access',
            );
          }

          try {
            restoredEntry = this.toFileEntry(target.normalized, restored.stats);
          } finally {
            await restored.handle.close();
          }
        } finally {
          await parent.handle.close();
        }
      } finally {
        await source.handle.close();
      }

      // Only now, with the content out of the record, does the empty record go. Doing this in a
      // `finally` would delete the record on a failed restore, which is the one thing a restore must
      // never do — a rejected restore has to leave the entry recoverable.
      await this.removeTrashRecord(trashHandle, id).catch(() => {
        // The restore itself has succeeded, so failing to tidy up after it must not report failure.
        // What is left is an empty record, which reconciliation removes and a purge can also remove.
      });

      return restoredEntry;
    } finally {
      await trashHandle.close();
    }
  }

  /**
   * Removes one record for good.
   *
   * Deliberately independent of whether the record can be *read*: it removes whatever sits under that
   * identifier. A record the application cannot interpret — a damaged manifest, an unexpected shape —
   * must still be removable, or the trash would accumulate content nothing can clear. Only the
   * identifier is validated, so this can still name nothing but a record.
   */
  override async purgeFromTrash(id: string): Promise<void> {
    const trashRoot = this.requireTrashRoot();
    this.assertTrashId(id);

    const trashHandle = await this.openServiceRoot(trashRoot);
    try {
      const directory = await this.openChild(trashHandle, id, true, trashRoot.path);
      if (directory === null) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.EntryNotFound, 'Trash record does not exist');
      }
      await directory.handle.close();

      await this.removeTrashRecord(trashHandle, id);
    } finally {
      await trashHandle.close();
    }
  }

  /**
   * Removes every record, continuing past the ones it cannot.
   *
   * A single record the filesystem refuses to remove would otherwise make the trash permanently
   * un-emptiable, so the failure is counted and reported rather than raised.
   */
  override async emptyTrash(): Promise<TrashPurgeResult> {
    const trashRoot = this.requireTrashRoot();
    const trashHandle = await this.openServiceRoot(trashRoot);

    try {
      const names = await fs.readdir(this.descriptorPath(trashHandle));
      let removed = 0;
      let failed = 0;

      // A manifest without its directory is possible: a delete interrupted between writing the one
      // and creating the other leaves it behind. Both spellings map to the same identifier here, so
      // emptying clears that too instead of leaving a file nothing else will ever look at.
      const ids = new Set(
        names
          .map((name) => (name.endsWith('.json') ? name.slice(0, -'.json'.length) : name))
          .filter((name) => TRASH_ID_PATTERN.test(name)),
      );

      for (const id of ids) {
        try {
          await this.removeTrashRecord(trashHandle, id);
          removed++;
        } catch {
          failed++;
        }
      }

      return { removed, failed };
    } finally {
      await trashHandle.close();
    }
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

  private async openChild(
    parent: FileHandle,
    name: string,
    requireDirectory: boolean,
    base: string = this.root,
  ): Promise<OpenedChild | null> {
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
      this.assertContained(canonicalPath, base);

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

  private assertContained(canonicalPath: string, base: string = this.root): void {
    const relativePath = path.relative(base, canonicalPath);
    if (relativePath === '') {
      return;
    }

    if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Storage path escapes the configured root');
    }
  }

  private toFileEntry(virtualPath: string, stats: Stats): FileEntry {
    const type = LocalStorageAdapter.toFileEntryType(stats);

    if (!Number.isSafeInteger(stats.size)) {
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

    const requestedLength = range?.length;
    if (requestedLength !== undefined && (!Number.isSafeInteger(requestedLength) || requestedLength <= 0)) {
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

  /**
   * Refuses every modification when no staging directory was configured.
   *
   * A staged write is the only way this adapter publishes content, so an adapter without a staging
   * root is read-only by construction rather than by a separate flag that could disagree with it.
   */
  private requireStagingRoot(): string {
    if (this.stagingRoot === undefined) {
      throw new LocalStorageAdapterError(
        LocalStorageErrorCode.UnsupportedOperation,
        'Storage adapter has no staging directory and cannot modify content',
      );
    }

    return this.stagingRoot;
  }

  /**
   * Splits an addressable path into its parent and its final segment, validating both.
   *
   * Every mutation names an entry inside a directory, so the root is rejected here: it has no name
   * and no parent, which makes it unusable as the subject of a create, a write or a move. The final
   * segment goes through the same validation as every other name.
   */
  private splitPath(virtualPath: string): { normalized: string; parentPath: string; name: string } {
    const normalized = this.normalizeVirtualPath(virtualPath);
    if (normalized === '/') {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Storage root cannot be named directly');
    }

    const separator = normalized.lastIndexOf('/');
    const parentPath = separator === 0 ? '/' : normalized.slice(0, separator);
    const name = normalized.slice(separator + 1);

    this.joinVirtualPath(parentPath, name);

    return { normalized, parentPath, name };
  }

  private requireTrashRoot(): ServiceRoot {
    if (this.trashRoot === undefined) {
      throw new LocalStorageAdapterError(
        LocalStorageErrorCode.UnsupportedOperation,
        'Storage adapter has no trash directory',
      );
    }

    return this.trashRoot;
  }

  private assertTrashId(id: string): void {
    if (!TRASH_ID_PATTERN.test(id)) {
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidPath, 'Invalid trash record identifier');
    }
  }

  /**
   * Opens a service root the same way the address root is opened.
   *
   * Identity is compared against what construction saw, so a directory replaced underneath us after
   * setup is detected rather than followed, and everything below is addressed through this descriptor.
   */
  private async openServiceRoot(root: ServiceRoot): Promise<FileHandle> {
    let handle: FileHandle | undefined;
    try {
      handle = await fs.open(root.path, DIRECTORY_OPEN_FLAGS);
      const stats = await handle.stat({ bigint: true });
      if (!stats.isDirectory() || !LocalStorageAdapter.sameIdentity(root.identity, stats)) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Service root changed after setup');
      }

      const openedPath = await fs.realpath(this.descriptorPath(handle));
      if (openedPath !== root.path) {
        throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Service root changed after setup');
      }

      return handle;
    } catch (error) {
      if (handle !== undefined) {
        await handle.close();
      }
      if (error instanceof LocalStorageAdapterError) {
        throw error;
      }
      throw new LocalStorageAdapterError(LocalStorageErrorCode.InvalidRoot, 'Service root cannot be opened safely');
    }
  }

  private trashManifestName(id: string): string {
    return `${id}.json`;
  }

  private async writeTrashManifest(trashHandle: FileHandle, record: TrashRecord): Promise<void> {
    const manifest = {
      version: TRASH_MANIFEST_VERSION,
      originalPath: record.originalPath,
      name: record.name,
      type: record.type,
      deletedAt: record.deletedAt?.toISOString() ?? null,
    };

    // Exclusive create: the identifier is generated here, so an existing manifest means something is
    // wrong with the trash rather than that this delete should proceed over it.
    await fs.writeFile(
      this.descriptorChildPath(trashHandle, this.trashManifestName(record.id)),
      JSON.stringify(manifest, undefined, 2),
      { mode: FILE_MODE, flag: 'wx' },
    );
  }

  /**
   * Reads one record, or returns null when there is no content under that identifier.
   *
   * The content is authoritative and the manifest is advisory: a record whose manifest is missing,
   * unparseable, or names something that is not a usable entry name is reported with an unknown
   * origin rather than dropped, because it still holds bytes somebody may want back.
   */
  private async readTrashRecord(
    trashHandle: FileHandle,
    trashRoot: ServiceRoot,
    id: string,
  ): Promise<TrashRecord | null> {
    const directory = await this.openChild(trashHandle, id, true, trashRoot.path);
    if (directory === null) {
      return null;
    }

    try {
      const children = await fs.readdir(this.descriptorPath(directory.handle));
      const [name] = children;
      if (children.length !== 1 || name === undefined) {
        return null;
      }

      const entry = await this.openChild(directory.handle, name, false, trashRoot.path);
      if (entry === null) {
        return null;
      }

      try {
        const manifest = await this.readTrashManifest(trashHandle, id);

        return {
          id,
          name,
          originalPath: manifest?.originalPath ?? null,
          type: LocalStorageAdapter.toFileEntryType(entry.stats),
          size: entry.stats.size,
          deletedAt: manifest?.deletedAt ?? null,
        };
      } finally {
        await entry.handle.close();
      }
    } finally {
      await directory.handle.close();
    }
  }

  private async readTrashManifest(
    trashHandle: FileHandle,
    id: string,
  ): Promise<{ originalPath: string | null; deletedAt: Date | null } | null> {
    let raw: string;
    try {
      raw = await fs.readFile(this.descriptorChildPath(trashHandle, this.trashManifestName(id)), 'utf8');
    } catch {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }

      const { originalPath, deletedAt } = parsed as { originalPath?: unknown; deletedAt?: unknown };
      const deleted = typeof deletedAt === 'string' ? new Date(deletedAt) : null;

      return {
        // Validated rather than trusted: a tampered manifest must not be able to name a path outside
        // the address space, so anything the normal rules reject is reported as unknown instead.
        originalPath: typeof originalPath === 'string' && this.isAddressablePath(originalPath) ? originalPath : null,
        deletedAt: deleted !== null && !Number.isNaN(deleted.getTime()) ? deleted : null,
      };
    } catch {
      return null;
    }
  }

  private isAddressablePath(candidate: string): boolean {
    try {
      this.splitPath(candidate);
      return true;
    } catch {
      return false;
    }
  }

  /** Removes a record's content and its manifest. Both are forced, so a partial record still goes. */
  private async removeTrashRecord(trashHandle: FileHandle, id: string): Promise<void> {
    await fs.rm(this.descriptorChildPath(trashHandle, id), { recursive: true, force: true });
    await fs.rm(this.descriptorChildPath(trashHandle, this.trashManifestName(id)), { force: true });
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
