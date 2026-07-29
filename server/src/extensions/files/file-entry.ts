export enum FileEntryType {
  File = 'file',
  Directory = 'directory',
}

export interface FileEntry {
  readonly path: string;
  readonly name: string;
  readonly type: FileEntryType;
  readonly size: number;
  readonly modifiedAt: Date;
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
