# Task 0030: Checksums and integrity state

## Tracking

- Stable backlog ID: `P1-13`
- GitHub Issue: [#66 — Checksums and integrity state](https://github.com/lor08/immich-drive/issues/66)
- Fixes the limitation recorded in [`P1-06`](0027-reconciliation-and-health.md)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #66 is the live execution log.

## Status

Implementation in review.

## Goal

Let the server tell a file that was edited apart from a file whose timestamp merely moved, so that editing content outside the application stops leaving a row conflicted for good.

## The question this task turned on: when is a file read

A digest costs a full read. A pass costs one `stat` per entry today, which is what makes it cheap enough to schedule; hashing everything every pass would turn a nightly scan into a nightly read of the whole volume. So the rule is **hash only when it decides something**:

- **On write.** The bytes already stream through the server for an upload or a copy, so the digest is computed in the same pass and costs nothing extra. It describes what was written rather than whatever is at the path afterwards.
- **On a modification-time-only disagreement.** A size difference is settled without reading — different lengths cannot be the same bytes. When only the time moved, the file is read and the digests compared: equal means the same content with a new timestamp, and the row takes the new time and stays `present`; different means a real edit, and it is conflicted **on evidence** rather than on the assumption that any difference is one.
- **Nowhere else.** A row with no digest behaves exactly as it did before, and no file is read for it unless a budget says so.

**Backfill is opt-in and bounded.** `IMMICH_DRIVE_CHECKSUM_BUDGET_MB` is how many megabytes one pass may read purely to give existing files a digest; unset means none, so nothing inherits a full-volume read by upgrading. The budget is spent optimistically — a file larger than what remains is still hashed once, so a volume of large files makes progress instead of starving — and the pass then stops backfilling. That is what "incremental hashing" means here: progress across passes, bounded per pass.

## Decisions made by this task

**`sha256`, with the algorithm stored beside the digest.** Two nullable columns rather than one, so replacing the algorithm later is a distinguishable change rather than a silent reinterpretation of old rows. Immich's own assets use `sha1`; a new store has no reason to inherit that.

**A digest lives on a separate type, not on `FileEntry`.** `WrittenEntry` is what a write returns. `stat` and `list` cannot produce a digest without reading the whole file, so anything accepting a plain `FileEntry` cannot silently assume one is there — the type says where digests come from.

**The upsert keeps a digest it already has.** A write carries one and a discovery does not, so `coalesce` rather than `excluded`: a reconciliation pass that re-records an entry must not erase what the upload learned about the same bytes.

**A read that fails settles nothing.** If the file cannot be read during verification, the entry is treated as changed rather than as verified — a file that cannot be read is not a file that agrees. During backfill the same failure simply leaves the row without a digest for the next pass to retry.

**Backfill only touches entries that agree.** A conflicted row is not given a digest, because the digest would describe content the row already disagrees with.

**The digest is not exposed through the API.** Nothing reads the index yet, and the shape of a checksum in the client contract belongs with duplicate detection, which is a separate decision.

## Scope

```text
server/src/extensions/files/file-entry.ts                 CHECKSUM_ALGORITHM, WrittenEntry
server/src/extensions/files/storage.adapter.ts            write returns a digest; digest() added
server/src/extensions/files/local-storage.adapter.ts      hashed in the same pass that writes
server/src/extensions/files/schema/drive-entry.table.ts    two nullable columns
server/src/schema/migrations/9000000000002-AddDriveEntryChecksum.ts
server/src/extensions/files/drive-index.repository.ts      setEntryChecksum, coalesce on upsert
server/src/extensions/files/drive-index.service.ts         carries a write's digest into the row
server/src/extensions/files/reconciliation.service.ts      the comparison, verification, backfill
server/src/extensions/files/files.config.ts                IMMICH_DRIVE_CHECKSUM_BUDGET_MB
server/src/extensions/files/volume-health.ts, files.dto.ts  verified and hashed counts
```

No upstream file is touched at all — the schema seam was already taken by `P1-04` and the table itself is fork-owned. The specification and both clients are regenerated for the two new report counts.

## Non-goals

- **Duplicate hints.** They need an index over digests and a decision about what to do with a duplicate.
- **Repair status and operator repair flows.** Marking is here; acting on the mark is not.
- **Verifying a digest on read or download**, which would put a full read on the request path.
- **Checksums for trashed content.** A record keeps its manifest, and a manifest is not an index row.

## Acceptance criteria

- [x] An upload records a digest, and the digest is the sha256 of what was actually written.
- [x] A copy records a digest for the copy.
- [x] A file whose modification time changed but whose bytes did not is **recovered** rather than conflicted, and the row's time is updated.
- [x] A file whose bytes changed is conflicted, and the row is not updated.
- [x] A size disagreement is conflicted without reading the file.
- [x] A row with no digest behaves exactly as before, and no file is read for it unless a budget is configured.
- [x] With a budget configured, a pass hashes entries that have no digest until the budget is spent, and stops cleanly.
- [x] With no budget configured, no file is read for backfill.
- [x] A pass reports how many entries it verified and how many it hashed.
- [x] Verified against the running server, including a `touch` on a real file and a real edit.
- [x] Relevant inherited checks pass.

## Verified by running it

The file domain holds 340 unit tests, thirteen of them new: nine for the reconciliation behaviour and four at the adapter, including one that hashes across chunk boundaries — a per-chunk digest would be wrong in a way no functional test would notice.

Live, against the running server:

| Check                                               | Result                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Migration on the existing database                  | both columns added; the migration is the newest row                                |
| Upload                                              | digest recorded, and equal to `sha256sum` of the same bytes                        |
| `touch -d '+1 hour'` on that file                   | `verified: 1, recovered: 1, conflicted: 0`; the row stays `present`                |
| A real edit **of the same length**, then a new time | `verified: 1, conflicted: 1`; caught by content, which size and time could not see |
| A pass with no budget configured                    | `hashed: 0`; twenty files left without a digest                                    |
| A pass with `IMMICH_DRIVE_CHECKSUM_BUDGET_MB=1`     | `hashed: 19`, and a spot-checked digest equal to `sha256sum`                       |
| The one file left without a digest                  | the `conflicted` one — backfill deliberately skips rows that already disagree      |

## Definition of done

Someone who edits a file over SSH gets a row that says the file changed; someone whose backup tool touched a timestamp gets a row that says nothing happened, because nothing did.
