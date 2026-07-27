# ADR 0005: Defer Drive-owned database schema until the index

- Status: Accepted
- Date: 2026-07-27

## Context

ADR 0002 makes the filesystem authoritative and reduces PostgreSQL to an index. The initial delivery plan nevertheless sequenced Drive-owned schema before the first folder and upload APIs.

Introducing schema early has a cost that is easy to underestimate in a fork. Drive-owned migrations must interleave with upstream Immich migrations, which is the single most conflict-prone part of upstream synchronization. It also entangles the first usable slice with Issue #9, where the migration and rollback boundaries for existing Immich installations are still unresolved.

Meanwhile, browsing a directory and downloading a file need no database at all. `readdir` and `stat` already answer both questions, and the answers cannot be stale because they come from the source of truth.

## Decision

Browse and basic write capabilities are delivered **without any Drive-owned table**.

- Listing, `stat`, download, upload, folder creation, rename, move, and soft delete read and write the filesystem directly.
- Mutual exclusion between concurrent operations uses PostgreSQL **advisory locks** keyed by a hash of the normalized volume and path. Advisory locks require no schema and work across replicas, which in-process locks do not; Immich supports running several server replicas.
- Soft-deleted content carries a sidecar manifest stored beside it inside the volume's trash directory, recording the original path and deletion time.
- The first Drive-owned tables are introduced together with the index and reconciliation. They use a `drive_` prefix and fork-owned migrations.

Until the index exists, the file API is explicitly unstable. This is acceptable because the only client ships in the same image as the server; see ADR 0006.

## Consequences

### Positive

- Rollback is removing the fork. No Drive-owned schema means no migration to undo and no data to rescue, which is the strongest possible answer to the reversibility question in Issue #9.
- The first vertical slice is not blocked by migration architecture.
- No Drive migration can collide with upstream migration ordering before the index lands.
- Fewer failure modes: there is no database-versus-filesystem drift while there is no database.

### Negative

- Without stable identifiers there can be no sharing, favorites, versions, or search, so those features cannot be prototyped early.
- Listing a very large directory is bounded by `readdir` and offers no server-side sort or pagination beyond what the filesystem provides.
- The API changes shape when the index introduces identifiers, and clients must be updated in the same release.
- Trash manifests must be migrated into tables when the index arrives, and that migration must tolerate manifests written by older versions.
- Advisory locks are scoped to one PostgreSQL database and must be documented as such, including behavior when the connection is lost mid-operation.

## Rejected alternatives

**Introduce Drive-owned schema before the first API.** Follows the conventional order, but couples the first slice to unresolved migration and rollback decisions, and produces migrations that must be maintained through every upstream synchronization before anything uses them.

**In-process locking instead of advisory locks.** Simpler to write, but silently incorrect as soon as more than one server replica runs, and the repository already supports scaling replicas in development.

**Storing trash metadata in a separate embedded database or a single global manifest.** Adds a second source of truth with its own consistency and backup story, when a per-item file inside the same volume moves and restores atomically with the content.
