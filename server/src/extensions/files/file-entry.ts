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
