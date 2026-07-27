# Architecture overview

Immich Drive is a modular extension of the Immich monorepository.

## High-level structure

```text
Clients
├── Immich web application with Files routes
├── Immich Flutter application with Files features
└── External players using signed HTTPS URLs
          │
          ▼
Immich server process
├── Existing Immich photo and video modules
└── Immich Drive file module
    ├── File domain
    ├── Authorization
    ├── Upload and download
    ├── Streaming
    ├── External directories
    └── Filesystem exports
          │
          ├── PostgreSQL metadata and indexes
          ├── Redis/background jobs where appropriate
          └── StorageAdapter
              ├── Managed local storage
              └── Registered external directories
```

## Core boundary

Immich photo assets and arbitrary files are separate domains.

An Immich `Asset` represents a photo or video managed by Immich. A file-domain entry represents a general file or directory. The same physical media may eventually be referenced or indexed by both domains, but neither model should be embedded into the other.

## Proposed code boundaries

These paths are provisional and may be refined by the first implementation ADR:

```text
server/src/extensions/files/
web/src/lib/features/files/
web/src/routes/(user)/files/
mobile/lib/features/files/
docs/architecture/
docs/adr/
```

Only small upstream-owned integration seams should need edits:

- server module registration;
- web and mobile navigation;
- OpenAPI generation and generated clients;
- configuration and container packaging.

## Sources of truth

- The filesystem is authoritative for file bytes, physical names, and physical hierarchy.
- PostgreSQL is authoritative for stable IDs, ownership, permissions, shares, versions, favorites, indexing state, and audit data.
- External changes may make the database index stale. Reconciliation must be a normal supported operation.

## Storage model

The first implementation uses transparent filesystem storage with human-readable names. Object or chunk storage may be added later behind `StorageAdapter`, but must not be required for local managed storage.

Content is organized into volumes: a private tree for each user, named shared spaces, and later registered external directories. Clients address content as a volume plus a relative path, never as a path from a global root; see [ADR 0004](../adr/0004-volume-path-model.md).

Example:

```text
/storage/users/<user-id>/files/Documents/report.pdf
/storage/shared/media/files/Movies/movie.mkv
```

Host paths are implementation details and are never returned from ordinary user APIs.

## Access model

HTTPS API is the primary application protocol.

- Web and Flutter clients use authenticated APIs.
- External players receive short-lived signed playback URLs.
- Jellyfin, Plex, and other local services use explicit filesystem exports.
- SMB, WebDAV, and FUSE are optional future adapters, not core dependencies.

## Deployment model

The first release may run the file module inside the existing Immich server process to reuse users, sessions, configuration, jobs, OpenAPI tooling, and deployment.

Domain and storage interfaces must remain sufficiently isolated so the file module can be extracted into a separate service later without redesigning the data model or clients.
