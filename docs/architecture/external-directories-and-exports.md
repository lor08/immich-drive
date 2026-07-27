# External directories and filesystem exports

Immich Drive integrates with the host filesystem in two directions.

## External directories

An external directory makes an existing host directory visible inside Immich Drive without moving or duplicating its contents.

Example:

```text
Host: /mnt/tank/media
UI:   External/Media
```

Each external directory has:

- a stable ID and display name;
- an administrator-configured host root;
- an explicit `read-only` or `read-write` access mode;
- ownership or visibility rules;
- scan status, last successful reconciliation, and health state.

Normal users never submit arbitrary host paths through public APIs. Registration is an administrative operation.

### Indexing

The initial scan walks the external root and creates or updates index records. Later changes are discovered through:

1. immediate metadata updates for operations performed through Immich Drive;
2. a filesystem watcher when the platform supports it reliably;
3. scheduled reconciliation as the correctness mechanism.

A missing or temporarily unavailable external directory must be reported as unavailable. Its indexed contents should not be immediately treated as intentionally deleted.

### Access modes

Read-only mode allows listing, reading, preview generation, search indexing, and streaming. It rejects create, update, move, rename, and delete operations.

Read-write mode allows mutations after the same authorization and path-safety checks used for managed storage. The UI must make it clear that changes affect the original host files.

## Filesystem exports

A filesystem export exposes a real Immich Drive folder through a stable host path for local services such as Jellyfin, Plex, Navidrome, Calibre-Web, backup software, or another Docker container.

The first implementation exports only physical folders. Smart collections and virtual folders are out of scope.

Example definition:

```text
Name: Jellyfin Movies
Source: /Media/Movies
Host export path: <export-root>/jellyfin-movies
Mode: read-only
```

### Implementation preference

When managed storage already has a stable physical directory, the export manager should prefer a safe bind-mount or stable link strategy appropriate to the deployment platform rather than copying data.

The exact mechanism must be selected with awareness of Docker, TrueNAS, Linux mount namespaces, symlink behavior, and cross-platform limitations. The product model must not promise that every host platform supports every export mechanism.

### Security

- Default to read-only.
- Never export Immich's internal upload or library directories as writable general storage.
- Validate that the source belongs to an allowed storage root.
- Do not allow arbitrary export destinations outside an administrator-configured export root.
- Detect overlapping or recursive export paths.
- Keep the export path stable across server restarts.

### Third-party consumers

Immich Drive should generate configuration examples, not silently modify third-party applications.

Example Docker Compose fragment:

```yaml
volumes:
  - /configured/export/root/jellyfin-movies:/media/movies:ro
```

Jellyfin and Plex retain their own databases, metadata, thumbnails, and caches. They read original media from the exported folder.

## Relationship between the features

External directories import visibility into Immich Drive. Filesystem exports provide visibility from Immich Drive to other local applications.

```text
Existing host directory -> External directory -> Immich Drive UI/API
Immich Drive folder      -> Filesystem export -> Jellyfin/Plex/container
```
