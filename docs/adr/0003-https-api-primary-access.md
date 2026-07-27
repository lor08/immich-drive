# ADR 0003: Use HTTPS APIs as the primary client access method

- Status: Accepted
- Date: 2026-07-27

## Context

Immich Drive clients need to work on mobile devices, Android TV, browsers, and desktops, including outside the local network. Direct SMB access is useful for some desktop and LAN workflows but is not a safe or portable foundation for every client.

The application also needs authorization, temporary external-player access, range streaming, offline caching, and consistent behavior across platforms.

## Decision

Immich Drive clients will use authenticated HTTPS APIs as the primary access method.

- Web and Flutter clients use the file API for listing and mutations.
- File content endpoints support byte ranges.
- External applications such as VLC receive short-lived signed URLs scoped to a file and operation.
- Android may expose the cloud through platform integrations such as intents and the Storage Access Framework.
- Filesystem exports provide local direct access for Jellyfin, Plex, and other trusted services.
- SMB, WebDAV, FUSE, and similar protocols remain optional future adapters.

## Consequences

### Positive

- One secure access model works locally and remotely.
- Mobile and TV clients do not need SMB configuration.
- Authorization and audit behavior remain centralized.
- External-player access can be narrowly scoped and temporary.

### Negative

- Native desktop filesystem integration requires additional work.
- External applications may need signed URLs or platform-specific handoff code.
- The server must implement efficient streaming and resumable transfer behavior.

## Rejected alternative

Require SMB as the primary protocol. Rejected because it is unsuitable for direct internet exposure, inconsistent across client platforms, and insufficient for the intended integrated application experience.
