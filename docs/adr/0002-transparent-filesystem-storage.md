# ADR 0002: Use transparent filesystem storage for the initial backend

- Status: Accepted
- Date: 2026-07-27

## Context

Immich Drive must support ordinary file browsing, recovery without the application, external directories, and direct read-only exports to Jellyfin, Plex, and other local services.

Content-addressed or chunk-only storage can provide deduplication and versioning, but hides normal names and makes direct filesystem integrations substantially more complex.

## Decision

The first managed-storage backend will preserve a human-readable physical directory tree and filenames under a configured root.

- The application derives physical paths from trusted storage roots, user identities, and validated names.
- Clients never submit or receive unrestricted host paths.
- PostgreSQL stores stable IDs, ownership, permissions, indexing state, and other metadata.
- The filesystem stores the actual bytes and physical hierarchy.
- Domain services access storage through `StorageAdapter`, allowing future backends without replacing the local implementation.

## Consequences

### Positive

- Files remain recoverable and understandable without Immich Drive.
- Jellyfin and Plex can consume exported directories without copying data.
- Existing host tools can back up and inspect the storage.
- The implementation is straightforward for a home NAS.

### Negative

- Renames and moves are physical operations and may be expensive across filesystems.
- Deduplication and versioning require additional mechanisms.
- External changes can make the database index stale, so reconciliation is mandatory.
- Cross-platform filename rules require careful validation.

## Rejected alternative

Store every file only as opaque objects or chunks. Rejected for the initial release because it conflicts with direct filesystem exports and the requirement that data remain usable as ordinary files.
