# Immich Drive agent instructions

These instructions apply to every automated coding agent working in this repository.

## Product direction

Immich Drive extends Immich with a general-purpose file storage domain while preserving Immich as the photo and video engine. The product should provide one web and Flutter experience for photos, files, streaming, external directories, and filesystem exports.

## Upstream safety

- Treat `immich-app/immich` as upstream and keep future synchronization inexpensive.
- Prefer adding isolated files and modules over editing existing Immich code.
- Changes to upstream-owned files must be limited to explicit integration seams such as module registration, navigation, generated clients, configuration, and packaging.
- Never edit an existing upstream migration. Add a new migration owned by Immich Drive.
- Do not repurpose Immich `Asset` entities, repositories, jobs, permissions, or album semantics for arbitrary files.
- Do not rename or reorganize upstream directories without a dedicated architectural decision.

## File domain boundaries

- Keep arbitrary files and folders in a separate domain from Immich assets.
- Put new server code under an isolated feature boundary, provisionally `server/src/extensions/files/`, unless an accepted ADR selects another path.
- Put new web code under an isolated feature boundary, provisionally `web/src/lib/features/files/` and dedicated routes.
- Put new Flutter code under an isolated feature boundary, provisionally `mobile/lib/features/files/`.
- Depend on small interfaces such as `StorageAdapter`; do not couple domain services directly to local filesystem APIs.
- The physical filesystem is the source of truth for file bytes and names. PostgreSQL is the index for identity, ownership, permissions, shares, versions, search, and operational state.

## Storage and security

- Preserve human-readable files and directory names on disk for the initial implementation.
- Resolve and validate every path server-side. Reject path traversal, symlink escape, null bytes, reserved paths, and cross-user access.
- Never expose host absolute paths in normal user APIs.
- Make external directories explicitly read-only or read-write.
- Default filesystem exports for Jellyfin, Plex, and similar consumers to read-only.
- Use stable export paths. Do not create media exports under temporary directories.
- Keep Immich-managed upload and library paths outside writable general file storage.

## API and playback

- Support resumable or chunked uploads for large files before calling uploads production-ready.
- Support HTTP byte ranges and correct `206 Partial Content` responses for media streaming.
- External player URLs must be short-lived, scoped to one resource and operation, and must not reveal the user's session token.
- Authorization must be checked before issuing a signed URL and again when practical at stream start.

## Quality requirements

- Add tests for domain rules, authorization, path handling, range parsing, and storage adapters.
- Include failure-path tests, especially for traversal, missing files, concurrent rename/delete, and unavailable external mounts.
- Run the smallest relevant formatter, linter, type checker, and test suite for every changed package.
- Do not silently weaken an existing test or lint rule to make a change pass.
- Document significant architecture choices in `docs/adr/`.

## Scope discipline

- One pull request should implement one reviewable capability.
- Do not implement UI, database, storage, and platform integrations in one task unless the issue explicitly requires an end-to-end vertical slice.
- Do not add SMB, WebDAV, FUSE, or object storage to the first MVP unless an accepted issue or ADR requests it.
- When a requirement is unclear, prefer the smallest reversible design and record the assumption in the PR description.
