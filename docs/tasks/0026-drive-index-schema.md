# Task 0026: Drive index schema

## Tracking

- Stable backlog ID: `P1-04`
- GitHub Issue: [#56 — Drive index schema](https://github.com/lor08/immich-drive/issues/56)
- Decision: [ADR 0011](../adr/0011-drive-index-schema.md)
- Delivered with: [`P1-06`](https://github.com/lor08/immich-drive/issues/57) reconciliation, as [ADR 0005](../adr/0005-defer-drive-database.md) requires — this task is the schema and the index maintenance; the scan, drift detection and health gating are `P1-06`.

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #56 is the live execution log.

## Status

Implementation in review.

## Goal

Give every indexed entry a stable identity, and give reconciliation something to compare the filesystem against — without making the filesystem any less authoritative and without changing a single response.

## The decision that dominated this task: migration ordering

`allowUnorderedMigrations` is `isDev()`, so **production refuses unordered migrations**, and Kysely orders them by filename. A fork therefore has a specific failure ahead of it: we add a migration, a user runs it, we later sync an upstream migration stamped _earlier_ than ours, and their server stops starting. Renaming ours is not available once `kysely_migrations` has recorded it.

**Drive migrations carry a fixed high timestamp prefix, starting at `9000000000000`** — a date in 2255, so every upstream migration sorts before them and a Drive migration is always last. The reasoning, the alternatives, and the ceiling are in [ADR 0011](../adr/0011-drive-index-schema.md); it is recorded in three places precisely because the filename looks like a mistake.

## Decisions made by this task

**Two tables, no third.** `drive_volume` (one row per volume the server has indexed) and `drive_entry` (one row per indexed entry). There is deliberately **no `drive_trash` table**: the sidecar manifest stays the source of truth for a deleted entry, because ADR 0002 requires the trash to be recoverable without the application. ADR 0005 anticipated migrating manifests into tables; this reverses that.

**`key` is the volume's natural identity**, `<ownerId>:private` or `shared:<space>`. It exists as its own column because every owner addresses their volume as `private`, so `(ownerId, volumeId)` would need a unique index over a nullable `ownerId` — and PostgreSQL treats nulls as distinct, which would let two rows for one shared space through.

**`parentPath` is stored, not derived**, so listing a folder is one index lookup rather than a pattern match over every descendant.

**Identity is recorded once and never overwritten.** `coalesce` keeps the first `device`, `inode` and `markerId`. Overwriting would erase the only evidence that a mount was swapped, which is exactly what [ADR 0007](../adr/0007-reconciliation-and-mount-health.md) gates removals on. `state` stays `unverified` until a `P1-06` pass says otherwise, which is the honest state of a row that exists only because a mutation touched the volume.

**The marker file is written here; enforcing it is `P1-06`.** One JSON dot-file at the volume root, created with `wx` so several workers cannot race and so a symlink planted at that path is refused rather than followed. A marker that exists but cannot be read is **never rewritten** — it is someone's data — and the volume then reports no marker identifier, which reads as unhealthy later. Documented in `docs/architecture/file-storage.md`, as ADR 0007 demands.

**A failed index write never fails the operation.** The bytes are already on disk. Reporting an error would tell a user their upload failed when it did not, and invite them to repeat a mutation that already happened. Every failure is one `warn` line naming the virtual path — never a host path — and the divergence is left for reconciliation. The guarantee lives in exactly one method, and every statement that could throw is inside its `try`, including deriving the volume key: "this line cannot throw" is not a good enough reason to leave one outside it.

**A failure also forgets the cached volume row.** Dropping and re-creating the tables is a supported downgrade, and a process still holding a row id from before the drop would otherwise fail every write until it restarted.

**Reads are untouched.** Listing, `stat` and download still answer from `readdir` and `stat`. Nothing reads the index, so it cannot serve a stale listing, no endpoint changes shape, no client regenerates, and no entry identifier is exposed. Serving reads from the index needs pagination, sorting and a guarantee of coverage that only `P1-06`'s scan can give.

**A move is one statement, whatever the size of the subtree.** The row for the source is re-inserted rather than updated, because a move can also be a rename; descendants are rewritten by prefix. Two details are load-bearing and both are covered by tests against real PostgreSQL:

- `starts_with(path, source || '/')` rather than `LIKE`, because a path may contain `%` or `_` and escaping them for a pattern match is a bug waiting to be written;
- the prefix is sliced at `char_length(source)` computed **by PostgreSQL**, because `'📁'` is one character there and two UTF-16 units in JavaScript, and a JavaScript offset would corrupt every descendant path.

The four statements run in one transaction, so a crash cannot leave half a subtree pointing at a path that no longer exists. This is also the only place in the domain that can deadlock against itself — two overlapping moves taking row locks in opposite orders — and PostgreSQL aborting one is harmless here, precisely because a failed index write is not a failed operation.

## Scope

```text
server/src/extensions/files/schema/drive-volume.table.ts   declared table
server/src/extensions/files/schema/drive-entry.table.ts    declared table
server/src/schema/migrations/9000000000000-CreateDriveTables.ts   generated migration
server/src/extensions/files/index-state.ts                 volume and entry lifecycle states
server/src/extensions/files/drive-index.repository.ts      the four statements
server/src/extensions/files/drive-index.service.ts         what each mutation records, and the swallow
server/src/extensions/files/volume-identity.ts             marker file and root identity
server/src/extensions/files/volume.ts                      volume root path, index key
server/src/extensions/files/volume.registry.ts             resolves a volume and its adapter together
server/src/extensions/files/file-domain.service.ts         six call sites
server/src/extensions/files/files.module.ts                wiring
server/src/schema/index.ts                                 UPSTREAM: declares the two tables
```

`server/src/schema/index.ts` is a **new upstream seam** — two imports, two entries in `ImmichDatabase.tables`, two keys in `DB`. A Drive-owned table has to be declared there or `SQL Schema Checks` reads it as drift and generates a migration to drop it. Recorded in `docs/architecture/integration-seams.md`.

No DTO, controller or specification changes, so neither generated client moves.

## What each mutation records

| Mutation        | Index effect                                    |
| --------------- | ----------------------------------------------- |
| Folder creation | upsert the folder                               |
| Upload          | upsert the file                                 |
| Copy            | upsert the destination                          |
| Move            | rewrite the source subtree onto the destination |
| Trash           | forget the path and everything under it         |
| Restore         | upsert the restored entry                       |
| Purge, empty    | nothing — the trash is not indexed by this task |

## Non-goals and known gaps

- **The scan, drift detection, health gating and marker enforcement** are `P1-06`. Nothing here compares a recorded identity against the current one, because acting on a mismatch means gating removals.
- **The index is incomplete by construction.** Only entries a mutation touched are indexed; content that existed before this task, and the descendants of a restored folder, are not walked. Walking a subtree is a scan, and the scan is `P1-06`. Until then those files are unindexed — the state every file was in before this task, which is why it changes nothing for anyone.
- **Serving reads from the index**, pagination and sorting: a later task, once coverage is guaranteed.
- **Checksums** are `P1-13`; sharing, versions and favourites are Phase 7.
- **The volume registry is still configuration-driven.** Moving membership into the schema needs `P1-07` authorization, not just tables.

## Acceptance criteria

- [x] The migration creates both tables and is the last migration to run, whatever upstream adds later.
- [x] `SQL Schema Checks` passes: the declared schema and the migration agree, and the SQL snapshots are unchanged.
- [x] The migration runs on a database that already holds a full Immich schema, and the server starts after it.
- [x] Dropping both tables and re-running the migration is a supported, documented downgrade, and the filesystem is unaffected.
- [x] Every mutation records its effect in the index, including a move that changes `parentPath` for a whole subtree.
- [x] A failing index write leaves the filesystem operation successful, and is logged.
- [x] Nothing reads the index yet, so no endpoint changes shape and no client regenerates.
- [x] One owner's entries cannot be reached through another owner's volume.
- [x] Verified against the running server and a real database, not only by tests.
- [x] Relevant inherited checks pass.

## Verified by running it

The server unit suite passes: 2476 tests, 2 skipped, 98 files. The file domain holds 226, nineteen of them new. A separate medium suite runs the repository against a real PostgreSQL — 20 tests, including the `%`/`_` boundary, the astral-character prefix slice, a stale row at the destination, a subtree with no rows at all, and both cascades.

Both `SQL Schema Checks` gates were run locally against the dev database: `migrations generate` reports **No changes detected**, and `sync-sql` rewrites all 35 snapshots byte-identically.

Against the live server, on a database holding a full Immich schema:

| Check                                            | Result                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Migration on the existing database               | `Migration "9000000000000-CreateDriveTables" succeeded`, newest row in `kysely_migrations` |
| Folder creation, upload, nested folder, copy     | five rows, each with the derived `parentPath`, `size`, `type`, `present`                   |
| Volume row                                       | key `<ownerId>:private`, owner set, `device`/`inode` recorded, `unverified`                |
| Move `/idx` → `/archive` with three descendants  | all five paths and every `parentPath` rewritten in one operation                           |
| Trash the folder                                 | all five rows gone                                                                         |
| Restore it                                       | one row for the folder; descendants on disk and unindexed, as documented                   |
| Marker on disk                                   | `{"version": 1, "markerId": …}` at the volume root, beside `files`/`.trash`                |
| Marker through the API                           | absent from the listing; `path=/.immich-drive-volume` is `404`                             |
| **Both tables dropped under the running server** | upload `200`, folder `201`, content on disk, one `warn` per operation                      |
| The second warning after the drop                | names `drive_volume`, not `drive_entry` — the cached volume row was forgotten              |
| Migration re-run, same process, no restart       | the next upload is indexed again                                                           |

Cross-owner separation is covered by unit tests driving two owners through the service; no HTTP call was made as a second user, because that session's token was not available in this environment — the same limit as `P1-12`.

## Definition of done

The fork owns tables, and nothing about them can make a user's server refuse to start, lose a file, or be told an operation failed when it succeeded.
