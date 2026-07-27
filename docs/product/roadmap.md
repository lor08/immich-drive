# Initial roadmap

This roadmap defines the product outcomes and exit conditions for each phase. The ordered implementation backlog, dependencies, and stable task identifiers live in `docs/product/delivery-plan.md`; promoted work and GitHub links live in `docs/tasks/index.md`.

The roadmap favors small vertical slices and inexpensive synchronization with upstream Immich.

## Phase 0 — Project foundation

- Product vision and architectural boundaries.
- Agent and contributor guardrails.
- Upstream synchronization strategy.
- Migration and rollback architecture.
- Fork-owned release and publication architecture.
- ADRs for the file domain, transparent filesystem storage, and HTTPS-first access.
- ADRs for the volume path model, the deferred Drive-owned schema, web-first clients, and reconciliation with mount health.

Exit condition: contributors can build and validate the fork, migration and release boundaries are reviewed, upstream divergence can be measured, and validation cannot accidentally publish to an upstream namespace.

## Phase 1 — File storage core

- Separate file and folder domain.
- Local filesystem `StorageAdapter`.
- Volumes: a private tree per user plus a shared space, addressed as volume and relative path.
- Folder creation and listing on the filesystem alone, with no Drive-owned table.
- Database metadata in clearly prefixed Immich Drive-owned tables, introduced with the index rather than before the first API.
- Upload, download, rename, move, copy, and soft delete.
- Ownership and authorization checks.
- Path traversal, symlink-escape, and path-replacement protection.
- Reconciliation and repair behavior.

Exit condition: API tests prove that one user cannot access another user's files, ordinary files remain readable on disk, and database/filesystem drift can be explained without destructive guessing.

## Phase 2 — First web vertical slice

- Add a minimal Files navigation entry.
- Folder browser.
- Drag-and-drop upload with progress.
- Download, rename, move, delete, and restore.
- Basic image, text, PDF, audio, and video previews where practical.
- Storage-health and operator errors.

Exit condition: a user can manage files without using the host filesystem and existing Immich photo flows continue to pass regression tests.

## Phase 3 — Large files and media playback

- Resumable uploads.
- Correct HTTP byte-range handling.
- Short-lived signed playback URLs.
- Open-in-external-player actions.
- Stable MIME and content-disposition behavior.
- Bounded-memory transfer and performance tests.

Exit condition: VLC can start and seek through a large remote video without downloading it in full, and interrupted uploads resume without corrupting final files.

## Phase 4 — External directories

- Register an existing host directory.
- Explicit read-only and read-write modes.
- Initial scan and scheduled reconciliation.
- Filesystem watcher as an optimization, not the only consistency mechanism.
- Mount-health reporting.
- Conflict and unavailable-mount behavior.

Exit condition: an existing media directory appears in the UI without moving or duplicating files, and unavailable mounts never trigger destructive cleanup.

## Phase 5 — Filesystem exports

- Create stable export definitions for real folders.
- Read-only by default.
- Docker bind-mount examples for Jellyfin and Plex.
- Access checks and export-health status.
- No smart or virtual exports in the first iteration.

Exit condition: Jellyfin and Plex can index a folder managed through Immich Drive using a stable read-only mount.

## Phase 6 — Flutter clients

Deferred until the file API stabilizes after the index. The web application is the only file client before that, which keeps API changes free and keeps signing and store distribution off the critical path.

- Files browser in the existing Flutter application.
- Upload, download, offline cache, and share/open actions.
- Android external-app intents.
- Android Storage Access Framework integration.
- Android TV layout and D-pad focus behavior.
- Desktop adaptations where Flutter support and plugins are sufficient.
- Fork-owned signing and distribution.

Exit condition: supported clients provide traceable release builds and complete ordinary file workflows without using upstream signing identities.

## Phase 7 — Cloud features

- Shared links with expiration and optional passwords.
- File versions.
- Quotas.
- Search and previews.
- Favorites, recent files, and activity history.
- Optional WebDAV or other compatibility adapters based on real demand.
- Governance, audit, and scale-out behavior.

Exit condition: collaboration and organization features enforce the same authorization and audit model as core file access.

## Delivery rules

- Every planned capability has a stable ID in `docs/product/delivery-plan.md`.
- Future backlog items remain in versioned documentation; do not create placeholder Issues for all future work.
- Promote a detailed task file and Issue when work is ready, active, blocked, or needed for an architectural decision.
- Search the task index, existing Issues, pull requests, and branches before creating a new work record.
- Every phase is split into reviewable tasks and pull requests.
- New functionality must not modify Immich's `Asset` model.
- A later phase may revise an earlier decision only through an ADR and migration plan.
- A phase is complete only when its exit condition is demonstrated by automated validation and an operator workflow.
