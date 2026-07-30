export enum FileEntryType {
  File = 'file',
  Directory = 'directory',
}

/** The digest algorithm the server uses for content it writes. Recorded per row; see ADR 0011. */
export const CHECKSUM_ALGORITHM = 'sha256';

export interface FileEntry {
  readonly path: string;
  readonly name: string;
  readonly type: FileEntryType;
  readonly size: number;
  readonly modifiedAt: Date;
}

/**
 * An entry the server just wrote, with the digest of what it wrote.
 *
 * A separate type from `FileEntry` on purpose: `stat` and `list` cannot produce a digest without reading
 * the whole file, so a checksum is only ever present where the bytes already passed through the server.
 * Anything that accepts a plain `FileEntry` therefore cannot silently assume one.
 */
export interface WrittenEntry extends FileEntry {
  readonly checksum: string;
  readonly checksumAlgorithm: string;
}

/**
 * One deleted entry, as recorded in the volume's trash.
 *
 * `originalPath` and `deletedAt` are nullable because they live in a sidecar manifest rather than in
 * the filesystem: content whose manifest is missing or unreadable is still listed, so it can still be
 * restored to an explicit path or removed. Content the application cannot interpret must never become
 * content the application cannot remove.
 */
export interface TrashRecord {
  readonly id: string;
  readonly name: string;
  readonly originalPath: string | null;
  readonly type: FileEntryType;
  readonly size: number;
  readonly deletedAt: Date | null;
}
