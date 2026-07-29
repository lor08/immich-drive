# ADR 0011: Drive migrations sort last, and the index stays a cache

- Status: Accepted
- Date: 2026-07-29

## Context

[ADR 0005](0005-defer-drive-database.md) deferred every Drive-owned table until the index. The filesystem-only slices are delivered, so the index is now due — and introducing the fork's first tables raises two questions that outlive the task that answers them.

**The first is ordering.** `DatabaseRepository.createMigrator` passes `allowUnorderedMigrations: this.configRepository.isDev()`. In production, unordered migrations are refused. Kysely sorts migrations by filename, and upstream stamps a migration with the timestamp of when _they_ wrote it, not when the fork takes it. So the following sequence is not hypothetical:

1. the fork adds `1784900000000-CreateDriveTables.ts`, and a user's server runs it;
2. a later upstream synchronisation brings in `1784800000000-SomethingUpstream.ts`, written before ours but taken after;
3. that migration now sorts _before_ one that has already been executed, and the user's server refuses to start.

Renaming ours at that point is not available: the filename is recorded in `kysely_migrations` on every install that ran it.

**The second is what the tables are allowed to mean.** [ADR 0002](0002-transparent-filesystem-storage.md) makes the filesystem authoritative. A table that starts holding a fact the tree does not hold turns a cache into a second source of truth, and the fork's rollback story — remove the fork, keep the files — quietly stops being true.

## Decision

**Drive migrations carry a fixed high timestamp prefix, starting at `9000000000000`.** Every upstream migration ever written sorts before them, so a Drive migration is always last to run and can never become unordered. Drive migrations order among themselves by the digits that follow.

**The index is a cache, and the tables are shaped so it cannot become anything else.**

- Two tables, `drive_volume` and `drive_entry`, both declared in fork-owned files under `server/src/extensions/files/schema/`.
- `drive_volume` holds what ADR 0007 needs before anything may be removed: the volume's key, the filesystem identity of its root (`device`, `inode`, as text — both are 64-bit), the marker identifier, health state, and the reconciliation checkpoint.
- `drive_entry` holds one row per indexed entry: path, parent path, name, type, size, modification time, and lifecycle state. Unique on `(volumeId, path)`.
- **Identity is recorded once and never overwritten.** A root whose device or inode has changed since it was first recorded still reads as the old value, because that difference is the only evidence that a mount was swapped, and health gating depends on seeing it.
- **A failed index write never fails the operation that caused it.** The bytes are already on disk; reporting an error would tell a user their upload failed when it did not. Divergence is logged and left for reconciliation.
- **No `drive_trash` table.** The sidecar manifest beside the deleted content stays the source of truth for a deleted entry. ADR 0005 anticipated migrating those manifests into tables; that is reversed here, because ADR 0002 requires the trash to be recoverable without the application and a table duplicating the manifest would be a second source of truth for the same fact.

## Alternatives considered

**A fork-owned migration table and runner.** Structurally the cleanest separation: upstream ordering could never affect us. Rejected because it takes another startup seam and gives up `SQL Schema Checks`, which today verifies that the declared schema and the migrations agree — a real check traded for a hypothetical conflict.

**Re-stamping a Drive migration when a conflict appears.** Impossible once it has executed anywhere; the name is recorded in `kysely_migrations`.

**Enabling `allowUnorderedMigrations` in production.** Turns an ordering error into silent, order-dependent schema state, which is worse than a refusal to start.

**Serving listings from the index immediately.** Rejected for now: an index nobody reads cannot serve a stale answer, and switching reads over needs pagination, sorting, and a guarantee of coverage that only the reconciliation scan can give.

## Consequences

### Positive

- A Drive migration cannot be made unordered by anything upstream does, which removes the most conflict-prone part of upstream synchronisation from the fork's schema.
- Dropping both tables is a supported downgrade: the filesystem is untouched, and re-running the migration rebuilds them empty.
- The index cannot serve a stale answer to a user, because nothing reads it yet.
- A divergence is a logged warning and a job for reconciliation, not a failed request.

### Negative

- The prefix looks like a mistake to anyone who has not read this ADR — a migration dated far in the future. It is recorded here, in the task file, and in the seam inventory for that reason.
- `9000000000000` is a real ceiling: it corresponds to a wall-clock date in 2255, so upstream timestamps will collide with it long after every other assumption in this repository has expired. If it ever matters, the fix is a higher prefix for new migrations, and existing ones keep working.
- The index is incomplete by construction until the reconciliation scan exists: only entries a mutation touched are indexed, and a restored folder's descendants are not walked. This is stated rather than hidden, and it is exactly what the scan is for.
- One upstream file, `server/src/schema/index.ts`, has to declare the tables, or `SQL Schema Checks` reads them as drift and generates a migration to drop them.
