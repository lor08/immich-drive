# Initial roadmap

This roadmap favors small vertical slices and inexpensive synchronization with upstream Immich.

## Phase 0 — Project foundation

- Product vision and architectural boundaries.
- Agent and contributor guardrails.
- Upstream synchronization strategy.
- ADRs for the file domain, transparent filesystem storage, and HTTPS-first access.

## Phase 1 — File storage core

- Separate file and folder domain.
- Local filesystem `StorageAdapter`.
- Database metadata in an Immich Drive-owned schema or clearly prefixed tables.
- Folder creation and listing.
- Upload, download, rename, move, copy, and soft delete.
- Ownership and authorization checks.
- Path traversal and symlink-escape protection.

Exit condition: API tests prove that one user cannot access another user's files and that ordinary files remain readable on disk.

## Phase 2 — First web vertical slice

- Add a minimal Files navigation entry.
- Folder browser.
- Drag-and-drop upload with progress.
- Download, rename, move, delete, and restore.
- Basic image, text, PDF, audio, and video previews where practical.

Exit condition: a user can manage files without using the host filesystem.

## Phase 3 — Large files and media playback

- Resumable uploads.
- Correct HTTP byte-range handling.
- Short-lived signed playback URLs.
- Open-in-external-player actions.
- Stable MIME and content-disposition behavior.

Exit condition: VLC can start and seek through a large remote video without downloading it in full.

## Phase 4 — External directories

- Register an existing host directory.
- Explicit read-only and read-write modes.
- Initial scan and scheduled reconciliation.
- Filesystem watcher as an optimization, not the only consistency mechanism.
- Mount-health reporting.

Exit condition: an existing media directory appears in the UI without moving or duplicating files.

## Phase 5 — Filesystem exports

- Create stable export definitions for real folders.
- Read-only by default.
- Docker bind-mount examples for Jellyfin and Plex.
- Access checks and export-health status.
- No smart or virtual exports in the first iteration.

Exit condition: Jellyfin can index a folder managed through Immich Drive using a stable read-only mount.

## Phase 6 — Flutter clients

- Files browser in the existing Flutter application.
- Upload, download, offline cache, and share/open actions.
- Android external-app intents.
- Android Storage Access Framework integration.
- Android TV layout and D-pad focus behavior.
- Desktop adaptations where Flutter support and plugins are sufficient.

## Phase 7 — Cloud features

- Shared links with expiration and optional passwords.
- File versions.
- Quotas.
- Search and previews.
- Favorites, recent files, and activity history.
- Optional WebDAV or other compatibility adapters based on real demand.

## Delivery rules

- Every phase should be split into reviewable issues and pull requests.
- New functionality must not modify Immich's `Asset` model.
- A later phase may revise an earlier decision only through an ADR and migration plan.
