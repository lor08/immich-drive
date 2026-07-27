# File storage architecture

## Goals

- Store arbitrary files and directories independently from Immich assets.
- Keep managed local data understandable and recoverable from the host filesystem.
- Support large files, streaming, external directories, and future storage backends.
- Enforce ownership and path safety centrally.

## Domain model

A file-domain entry has a stable application ID independent of its current name or path.

Suggested concepts:

```text
FileEntry
├── id
├── ownerId
├── parentId
├── type: file | directory
├── name
├── storageId
├── storageKey
├── mimeType
├── size
├── checksum
├── modifiedAt
├── indexedAt
└── deletedAt
```

`storageKey` is an adapter-relative identifier. It is not an arbitrary host path supplied by a client.

Additional tables should be introduced only when their behavior is implemented, for example shares, permissions, versions, upload sessions, favorites, and index jobs.

## Storage adapter

Domain services depend on an interface rather than Node filesystem calls.

```ts
interface StorageAdapter {
  stat(key: string): Promise<StorageEntry>;
  list(key: string): Promise<StorageEntry[]>;
  createDirectory(key: string): Promise<void>;
  open(key: string, range?: ByteRange): Promise<Readable>;
  write(key: string, source: Readable, options?: WriteOptions): Promise<WriteResult>;
  move(sourceKey: string, targetKey: string): Promise<void>;
  copy(sourceKey: string, targetKey: string): Promise<void>;
  delete(key: string): Promise<void>;
}
```

The initial adapter is `LocalStorageAdapter`. External directories may use the same adapter implementation with a distinct configured root and access mode.

## Managed storage layout

The server owns a configured root and derives every path from trusted IDs and validated names.

```text
<managed-root>/users/<user-id>/files/
```

Requirements:

- No client-controlled absolute paths.
- Normalize and validate every path segment.
- Reject `.` and `..`, null bytes, separators embedded in names, and platform-reserved names where relevant.
- Resolve symlinks and ensure the final target remains inside the configured root.
- Use collision-safe behavior and never silently overwrite unless the operation explicitly requests replacement.

## Database and filesystem consistency

API operations should update filesystem and metadata through an explicit application workflow. Because crashes can occur between steps, operations must be retryable and reconciliation-aware.

For the MVP:

- upload to a temporary file inside the target filesystem;
- calculate required metadata;
- atomically rename into place when supported;
- commit or update the database record;
- enqueue reconciliation when an ambiguous failure occurs.

A periodic reconciliation job compares the index with physical storage. Filesystem watchers may reduce latency but cannot be the only consistency mechanism.

## Deletion and trash

Normal user deletion is soft deletion:

- move the physical entry into a user-scoped trash area when practical;
- mark the database entry deleted;
- preserve enough metadata to restore it;
- purge only through an explicit retention job.

External read-only directories cannot be deleted through Immich Drive. External read-write behavior must be documented clearly because moving to an internal trash directory may cross filesystems.

## Concurrency

The service must define behavior for concurrent upload, rename, move, and delete operations. Initial protection may use database transactions and application-level locks keyed by storage and entry IDs. Filesystem state must be revalidated immediately before destructive operations.

## Future backends

S3-compatible or content-addressed storage can be added later behind `StorageAdapter`. Such backends must not force the local transparent-storage implementation to abandon normal filenames or direct filesystem exports.
