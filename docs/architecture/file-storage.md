# File storage architecture

## Goals

- Store arbitrary files and directories independently from Immich assets.
- Keep managed local data understandable and recoverable from the host filesystem.
- Support large files, streaming, external directories, and future storage backends.
- Enforce ownership and path safety centrally.

## Domain model

A file-domain entry has a stable application ID independent of its current name or path.

Stable IDs and the tables that hold them arrive with the index. Until then, content is addressed by volume and relative path, and no Drive-owned table exists; see [ADR 0005](../adr/0005-defer-drive-database.md).

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

The implemented contract lives in `server/src/extensions/files/storage.adapter.ts`:

```ts
abstract class StorageAdapter {
  abstract stat(path: string): Promise<FileEntry | null>;
  abstract list(path: string): Promise<readonly FileEntry[]>;
  abstract open(path: string, range?: StorageRange): Promise<AsyncIterable<Uint8Array>>;
  abstract write(path: string, content: AsyncIterable<Uint8Array>, options?: StorageWriteOptions): Promise<FileEntry>;
  abstract move(sourcePath: string, targetPath: string): Promise<void>;
  abstract copy(sourcePath: string, targetPath: string): Promise<FileEntry>;
  abstract delete(path: string, options?: StorageDeleteOptions): Promise<void>;
}
```

Notes on the current shape:

- Paths are virtual and relative to one volume root, never host paths.
- `stat` returns `null` for a missing entry rather than throwing.
- Content is carried as `AsyncIterable<Uint8Array>` so an adapter can stream without depending on Node stream types.
- Directory creation is not part of the contract yet; it is added with the folder-creation capability.

The initial adapter is `LocalStorageAdapter`, and it is read-only: `write`, `move`, `copy`, and `delete` reject explicitly. Each volume, including a registered external directory, is served by an adapter instance with its own configured root and access mode; see [ADR 0004](../adr/0004-volume-path-model.md).

## Managed storage layout

Content lives in volumes. Each volume is an independently rooted tree with a kind and an access mode, and every path the server derives comes from a trusted volume root, trusted identifiers, and validated names.

```text
<managed-root>/users/<user-id>/files/      browsable private content
<managed-root>/users/<user-id>/.trash/     soft-deleted content and manifests
<managed-root>/users/<user-id>/.tmp/       upload staging
<managed-root>/shared/<space>/files/       shared content, same service directories
```

Requirements:

- No client-controlled absolute paths, and no host path in any response.
- Normalize and validate every path segment.
- Reject `.` and `..`, null bytes, separators embedded in names, and platform-reserved names where relevant.
- Reject symbolic links; the final target and every intermediate component must remain inside the volume root, verified through open descriptors rather than by string comparison.
- Use collision-safe behavior and never silently overwrite unless the operation explicitly requests replacement.
- Keep service directories outside the browsable tree so they never appear in listings, exports, or backups of user content.
- Stage every write in the volume's `.tmp`, flush it, then rename into place. The staging directory is a sibling of the browsable tree, so partial content is never addressable, and it must sit on the same filesystem or the rename cannot be atomic — which the adapter refuses at construction rather than discovering later.
- Validate at startup that no managed root overlaps an Immich upload or library path, in either direction, comparing canonical paths so a symbolic link cannot defeat the check.

The managed root comes from `IMMICH_DRIVE_ROOT`. **The file domain is opt-in**: with the variable unset the domain is disabled and the server behaves exactly like upstream Immich, which is what keeps an upgrade reversible by configuration alone. With it set, an unusable or overlapping root fails startup with an operator-facing error rather than failing at first write.

## Database and filesystem consistency

API operations should update filesystem and metadata through an explicit application workflow. Because crashes can occur between steps, operations must be retryable and reconciliation-aware.

For the MVP:

- upload to a temporary file inside the target filesystem;
- calculate required metadata;
- atomically rename into place when supported;
- commit or update the database record;
- enqueue reconciliation when an ambiguous failure occurs.

A periodic reconciliation job compares the index with physical storage. Filesystem watchers may reduce latency but cannot be the only consistency mechanism.

Reconciliation ships in the same phase as the index, defaults to non-destructive behavior, and treats an unreadable, replaced, or unexpectedly empty volume root as a health failure rather than as evidence of deletion; see [ADR 0007](../adr/0007-reconciliation-and-mount-health.md).

## Deletion and trash

Normal user deletion is soft deletion:

- move the physical entry into the trash directory **of the same volume**, so deletion stays a rename rather than a copy of the whole file;
- record the original path and deletion time in a manifest stored beside the trashed content, and in the index once it exists;
- preserve enough metadata to restore it, including collision behavior when the original path is occupied again;
- purge only through an explicit retention job.

A trash area shared between volumes is not acceptable: it turns deleting a large file into a cross-filesystem copy and can fail halfway.

External read-only directories cannot be deleted through Immich Drive. External read-write behavior must be documented clearly because moving to an internal trash directory may cross filesystems.

## Concurrency

The service must define behavior for concurrent upload, rename, move, and delete operations. Filesystem state must be revalidated immediately before destructive operations.

Mutual exclusion uses PostgreSQL advisory locks keyed by a hash of the normalized volume and path. In-process locks are not sufficient, because Immich can run several server replicas against one database. Advisory locks also keep the early filesystem-only stages free of schema; see [ADR 0005](../adr/0005-defer-drive-database.md).

Moves inside a volume must be `rename(2)`. A move between volumes is detected by comparing filesystem identity and is rejected explicitly until a resumable transfer job exists, because it is a copy whose duration scales with file size.

## Future backends

S3-compatible or content-addressed storage can be added later behind `StorageAdapter`. Such backends must not force the local transparent-storage implementation to abandon normal filenames or direct filesystem exports.
