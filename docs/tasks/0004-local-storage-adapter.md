# Task 0004: Implement secure read-only LocalStorageAdapter

## Tracking

- GitHub Issue: [#8 — Implement secure read-only LocalStorageAdapter](https://github.com/lor08/immich-drive/issues/8)
- Foundation: [PR #3](https://github.com/lor08/immich-drive/pull/3)
- Implementation: [PR #10](https://github.com/lor08/immich-drive/pull/10)

This versioned file is the source of truth for stable scope, constraints, and acceptance criteria. GitHub Issue #8 is the live execution log for status, discussion, implementation decisions, pull requests, and validation results. Any material scope change must be reflected in both places.

## Status

In review in draft PR #10. The adapter now uses descriptor-based traversal and revalidation to prevent root replacement, intermediate symlink substitution, and time-of-check/time-of-use path escapes. Fresh inherited checks are required before merge.

## Goal

Add the first concrete adapter for the isolated file domain. The adapter exposes a configured local directory through virtual paths while preventing host path disclosure, traversal, symlink escape, and path-component replacement during access.

This task is intentionally read-only. It implements `stat`, `list`, and ranged `open`; mutation methods remain explicitly unsupported until a later task defines write semantics, concurrency behavior, and recovery guarantees.

## Required reading

- `AGENTS.md`
- `docs/architecture/file-storage.md`
- `docs/architecture/streaming.md`
- `docs/adr/0002-transparent-filesystem-storage.md`
- `server/src/extensions/files/storage.adapter.ts`
- `server/src/repositories/storage.repository.ts`

## Scope

Add the adapter under:

```text
server/src/extensions/files/
```

Files:

```text
local-storage.adapter.ts
local-storage.adapter.spec.ts
```

Additional small error or helper types may be added inside the same feature boundary when they materially improve clarity.

## Runtime platform

The production server target is the Linux-based Immich container runtime. Secure traversal uses open file descriptors through `/proc/self/fd`; macOS development may use `/dev/fd`. A platform without a safe file-descriptor path must be rejected explicitly rather than silently using a weaker path-based implementation.

## Virtual path rules

- `/` represents the configured storage root.
- Returned paths always use POSIX separators and begin with `/`.
- Inputs beginning with `/` are interpreted in the virtual namespace, never as host paths. For example, `/etc/passwd` can only address `<storage-root>/etc/passwd`; it must never address the host `/etc/passwd`.
- Relative paths are rejected.
- Empty paths, duplicate separators, and trailing separators other than `/` are rejected.
- Reject null bytes.
- Reject `.` and `..` path segments supplied by callers rather than silently normalizing traversal attempts.
- Reject backslashes, Windows drive paths, and UNC paths.
- Never return the configured host root or another absolute host path.

## Root, descriptor, and symlink safety

- The configured root must be absolute and must resolve to an existing directory.
- Store the canonical real path and filesystem identity (`dev` and `ino`) of the root.
- Reopen and verify the root identity for every operation so replacement of the configured directory is detected.
- Traverse path components through an already-open parent directory descriptor.
- Use `O_NOFOLLOW` for every opened component, not only the final file.
- Compare the `lstat` identity with the opened handle identity to detect replacement between inspection and open.
- Resolve the opened handle and confirm that it remains the root itself or is contained below the canonical root.
- Do not follow or expose symbolic links in the initial implementation.
- A symlink entry encountered by `stat` or `list` must be rejected or excluded consistently and covered by tests.
- Revalidate the complete path when an `AsyncIterable` begins reading; validation performed when `open()` returns is not sufficient.
- A symlink or directory replacement performed after `open()` but before iteration must never make an external file readable.

## Read operations

### `stat`

- Return `null` for `ENOENT`.
- Return a `FileEntry` for regular files and directories.
- Return virtual path, base name, type, size, and modification time.
- Directory size may use the filesystem-reported value; callers must not interpret it as recursive content size.
- Close every opened descriptor before returning.

### `list`

- Require a directory.
- List through the verified open directory descriptor.
- Return direct children only.
- Exclude symbolic links and unsupported entry types.
- Produce deterministic ordering by name.
- Return virtual child paths and never host paths.
- Close child and directory descriptors on success and failure.

### `open`

- Require a regular file.
- Return an `AsyncIterable<Uint8Array>`.
- Validate `offset` as a non-negative safe integer.
- Validate optional `length` as a positive safe integer.
- A missing range reads the full file.
- A range beginning at EOF returns an empty iterable.
- A range beginning beyond EOF is rejected.
- Clamp a requested length at EOF.
- Read from the verified open file handle, never by reopening an unchecked host path.
- Never read bytes before the requested offset or after the computed end.
- Close the file handle when iteration completes, fails, or is cancelled.

## Unsupported operations

`write`, `move`, `copy`, and `delete` must return rejected promises with one consistent unsupported-operation error. They must not partially modify the filesystem, and they must satisfy the repository's `require-await` lint rule without misleading `async` methods.

## Tests

Use a temporary directory created for each test suite. Cover at least:

- root validation;
- replacement of the configured root after adapter creation;
- file and directory `stat`;
- missing path;
- deterministic listing;
- full-file reads;
- bounded and EOF-clamped range reads;
- offset at EOF and beyond EOF;
- invalid offset and length;
- opening a directory;
- relative, traversal, and non-canonical paths;
- POSIX-looking virtual paths remaining sandboxed below the configured root;
- Windows drive path, UNC path, backslash, and null byte rejection;
- symlink inside the root;
- final symlink escaping the root;
- intermediate directory symlink escaping the root;
- replacement of an intermediate directory after `open()` but before iterable consumption;
- unsupported mutation methods;
- absence of host absolute paths in returned entries and thrown messages where practical.

Skip symlink-specific assertions only on a platform where creating symlinks is genuinely unavailable, and document that condition in the test.

## Acceptance criteria

- [ ] Normal files and directories can be statted and listed.
- [ ] Missing paths return `null` from `stat`.
- [ ] Directory entries use stable virtual paths and deterministic ordering.
- [ ] Full-file and byte-range reads work with documented EOF behavior.
- [ ] Relative paths, traversal, null bytes, Windows/UNC paths, and symlink escape are rejected.
- [ ] Root replacement and intermediate path-component substitution cannot escape the configured root.
- [ ] POSIX-looking virtual paths remain sandboxed below the configured root.
- [ ] Unsupported mutations fail explicitly without changing the filesystem.
- [ ] No host absolute path is returned through the adapter contract.
- [ ] All descriptors are closed on success, failure, and generator completion.
- [ ] No database entity, migration, API route, OpenAPI schema, or runtime module registration is added.
- [ ] Relevant inherited Immich formatting, linting, type checking, unit tests, and security checks pass.

## Non-goals

- Write support
- Folder creation
- Rename, copy, move, trash, or deletion
- Database indexing
- User authorization and sharing
- HTTP endpoints
- Uploads
- External directories
- Jellyfin or Plex exports
- Native Windows server support in the initial adapter

## Definition of done

A reviewer can mount a temporary directory behind `LocalStorageAdapter`, safely inspect and read ordinary files through virtual paths, and verify that traversal, root replacement, intermediate symlink substitution, and delayed iterable consumption cannot expose content outside the configured root.
