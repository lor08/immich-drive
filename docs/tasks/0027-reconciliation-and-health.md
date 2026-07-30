# Task 0027: Reconciliation and volume health

## Tracking

- Stable backlog ID: `P1-06`
- GitHub Issue: [#57 — Reconciliation and volume health](https://github.com/lor08/immich-drive/issues/57)
- Decided by: [ADR 0007](../adr/0007-reconciliation-and-mount-health.md)
- Builds on: [`P1-04`](0026-drive-index-schema.md) index tables and recorded volume identity

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #57 is the live execution log.

## Status

Done. Delivered by PR #60.

## Goal

Make editing files outside the application a supported workflow rather than a way to corrupt state — and make a failed mount produce a visible error instead of a mass deletion.

## The failure this exists to prevent

A network mount disappears, or a volume root is replaced by an empty directory. A scanner reads an empty tree, compares it against a populated index, and the obvious conclusion is that the user deleted everything. Acting on that is unrecoverable, and **at the moment of the scan there is nothing in the tree itself that tells the two apart**.

So the order of work is the design: **health first, then reconciliation**. A pass that cannot show the volume is the same volume does not get to conclude anything.

## Decisions made by this task

**Health is computed live; `drive_volume.state` is what the last pass concluded.** `GET /files/volumes/health` never writes. That is not fussiness: the ordinary request path provisions a volume's directories and writes its marker on first use, so a health check built on `resolve` would recreate a vanished mount's directories and a check built on `ensureVolumeIdentity` would rewrite the missing marker — repairing exactly what it was asked to detect. Reading needed two new capabilities that create nothing: `VolumeRegistry.describeVolume` and `inspectVolumeIdentity`.

**Five reasons, evaluated in a fixed order**, so the report says what to do rather than only that something is wrong: `root-unreadable`, `identity-changed`, `marker-missing`, `marker-mismatch`, `root-empty-while-indexed`. A marker that exists but cannot be parsed is a _mismatch_, not agreement — the one interpretation that must never be charitable.

**`unverified` is not a refusal.** A volume nobody has written to, and a volume whose index was dropped, both have nothing recorded to compare against; rebuilding from the filesystem is precisely what a first pass is for. Only `unhealthy` stops a pass. This was a genuine correction during implementation: the first version refused anything that was not already healthy, which would have made "drop the index and rebuild it" impossible — the supported recovery path ADR 0007 requires.

**A refusal keeps the checkpoint.** The pending work has not been done, so a volume that comes back healthy resumes rather than restarting.

**Checkpointing is one path, and the comparison is not a string comparison.** A pass records the last directory whose entries it reconciled, in depth-first, name-sorted order. Resuming descends towards that path, reconciles nothing at or before it, and skips whole branches that finished earlier — one listing per ancestor of the checkpoint, and nothing more to remember than a single path.

The trap is that this order is **not** lexicographic on the path: `-` is below `/` in ASCII, so `/a-b` sorts before `/a/x` as a string while the walk reaches `/a/x` first. A checkpoint compared as a string would therefore skip real work, silently, and only for names containing one of the dozen characters below a slash. `compareWalkOrder` compares segment lists instead, which is exactly the walk's order, and `walk-order.spec.ts` asserts the disagreement with string comparison directly.

**Every conclusion is additive or a change of state.** Entries found are inserted; rows whose file is gone are marked `missing`; rows that disagree are marked `conflicted`. Nothing is deleted and no file is touched. A missing _folder_ marks its whole subtree, because those descendants live in directories the walk can no longer visit.

**A conflicted row is not updated to match the file.** Without checksums (`P1-13`) the server cannot tell a deliberate edit from a truncated or half-written file, so adopting whatever is on disk would make the index assert a freshness it has not verified. Writing through the API clears the conflict, because that is a write the server performed itself. The tension is real and is stated rather than hidden: editing over SSH is a _supported_ workflow, and until checksums arrive the index's answer to it is "this row no longer describes the file" rather than a new row.

**A folder is compared by kind alone.** Its size and modification time change whenever anything inside it changes, so comparing them would mark every folder on the path to a new file as conflicted — a report about filesystem bookkeeping rather than about anyone's data.

**The trash is reported, not indexed.** ADR 0011 rejected a table mirroring the manifest, and a trash record has no path in the address space, so a row would have to invent one. `StorageAdapter.inspectTrash` is new and reports what an ordinary listing deliberately hides: records whose manifest is unreadable, manifests whose content never arrived, and names that are not records at all. This is a **deviation from the wording of Issue #57**, which asked for an indexed row, and it is the same decision ADR 0011 already made for the same reason.

**Retention is off unless a deployment asks for it.** `IMMICH_DRIVE_TRASH_RETENTION_DAYS` is the only destructive thing in this task; it runs only on a healthy volume, only in a pass that reached the end of the tree, and **never** on a record whose manifest could not be read — a record with no known age is the class a user is least able to recover by other means, so guessing is the one thing not to do. A malformed value is rejected at startup rather than treated as "never", because those two look identical to an operator who meant to configure expiry.

## Scope

```text
server/src/extensions/files/reconciliation.service.ts   health, the pass, trash report, retention
server/src/extensions/files/walk-order.ts               depth-first order and checkpoint comparison
server/src/extensions/files/volume-health.ts            reasons and report shapes
server/src/extensions/files/volume-identity.ts          read-only inspection beside the writing variant
server/src/extensions/files/volume.registry.ts          describe without provisioning; read-only adapter
server/src/extensions/files/drive-index.repository.ts   eight statements a pass needs
server/src/extensions/files/drive-index.service.ts      ensureVolumeRow, the one throwing method
server/src/extensions/files/storage.adapter.ts          inspectTrash contract
server/src/extensions/files/local-storage.adapter.ts    inspectTrash
server/src/extensions/files/files.config.ts             retention window, DRIVE_CONFIG token
server/src/extensions/files/files.dto.ts                health and reconcile schemas
server/src/extensions/files/files.controller.ts         two endpoints
server/src/enum.ts                                      file.maintenance permission
```

`server/src/enum.ts` is the existing `P1-08` seam, which the inventory already describes as the place every later slice appends a permission. No new upstream file is touched. The specification and both generated clients are regenerated.

The `DRIVE_CONFIG` token moved from `files.module.ts` to `files.config.ts`, and the health reasons live in their own file, because a DTO importing the service that produced them closed an import cycle through the module and the controller. That failed at load time rather than at compile time — as a zod schema built from an enum that was still `undefined` — which is worth knowing about before it happens again.

## Endpoints

| Endpoint                    | Effect                                                      | Permission                |
| --------------------------- | ----------------------------------------------------------- | ------------------------- |
| `GET /files/volumes/health` | identity, marker and health state per volume, read-only     | `file.read`               |
| `POST /files/reconcile`     | runs or resumes a pass on one volume, returns what it found | `file.maintenance`, admin |

## Non-goals and known gaps

- **Scheduled passes.** Automatic periodic reconciliation belongs on Immich's job queue, which is a new upstream seam; taking it in the same change as this one would mean two seams at once. Until then a pass is operator-triggered, and **nothing runs it on a schedule**.
- **Filesystem watchers** stay out entirely: ADR 0007 makes them a hint, and hints are worthless before the authoritative pass exists.
- **Destructive cleanup of `missing` rows** is defined by this task's rules but not implemented: it needs an explicit, logged operator action, which is its own task.
- **Reconciling another user's volume.** A pass runs on the caller's own volumes. Acting on someone else's needs the user lookup and the authorization model from `P1-07`, and an admin surface that accepts an arbitrary owner identifier would provision directories for one that does not exist.
- **Serving reads from the index** is still a later task; nothing reads it yet.

## Acceptance criteria

- [x] A volume is initialised with a marker file, and its root identity is recorded.
- [x] A missing marker, a changed root identity, an unreadable root, and an empty root against a non-empty index each report unhealthy — with a test for each.
- [x] An unhealthy volume produces no index removals and no missing-marking.
- [x] A file created outside the application appears in the index after a pass.
- [x] A file removed outside the application is marked `missing`, not deleted.
- [x] A file whose size or modification time disagrees with the index is marked `conflicted` and never overwritten.
- [x] Dropping the index and running a pass rebuilds it, with the same identities where identity is derivable.
- [x] An interrupted pass resumes from its checkpoint rather than restarting.
- [x] A trash record with an unreadable manifest, and an orphaned manifest, are both reported.
- [x] Verified against the running server, including a deliberately broken mount.
- [x] Relevant inherited checks pass.

## Verified by running it

The file domain holds 278 unit tests, fifty-two of them new: thirty-nine for reconciliation, eight for the walk order, five for `inspectTrash`. The medium suite against real PostgreSQL holds 29, nine of them new for the statements a pass depends on.

**The live checks found a defect the tests could not.** Running the documented downgrade — drop the Drive tables, then reconcile — returned `500`, because `ensureVolumeRow` trusted the row id this process had remembered from before the drop, and the inserts then failed on the foreign key part-way through the walk. Every unit test built a fresh service, so none of them ever held a stale row id. Two changes came out of it: `ensureVolumeRow` now re-records the volume and replaces whatever was cached, on the grounds that a pass is precisely the operation that runs after someone dropped the tables; and the in-memory index in the unit tests now **enforces the foreign key**, because a fake that accepts rows PostgreSQL would reject teaches the wrong lesson. Reverting the fix makes the new test fail with the same message the server produced.

One test failure during implementation was worth more than the test: "a file that comes back identical returns to `present`" failed roughly two runs in five. The cause was in the test, not the product — `fs.utimes` restores a modification time through a float number of seconds, so it can land a millisecond low, and the pass then correctly reported a conflict for a reason the test had not intended. It was rewritten to move the file out and back, which is both the faithful shape of the failure that matters and exactly precise.

Counts report what a pass **changed**, not what state the index is in. That came out of the live run too: a pass over an unchanged volume reported `missing: 1` for a row that had been missing since the previous pass, which reads as a new problem every time. A pass now skips rows already in the state it would set — no repeated `UPDATE`, and an untouched volume reports zeros.

Against the live server, on a volume holding content created before the index existed:

| Check                                          | Result                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| First pass over pre-existing content           | 12 directories, 28 entries added, 1 foreign entry reported in the trash    |
| A file created outside the application         | added, `present`, correct size                                             |
| A file removed outside the application         | `missing`; the row survives                                                |
| A file appended to outside the application     | `conflicted`, and the row still holds the old size (4) while disk holds 21 |
| A second pass with nothing changed             | all counts zero                                                            |
| `limit: 1`, three times                        | stopped at `/`, resumed from `/`, stopped at `/Documents`                  |
| Finishing the interrupted walk                 | resumed from `/Documents`, 10 of the 12 directories, completed             |
| **Volume root replaced by an empty directory** | `identity-changed`; the pass refused; all 30 rows untouched                |
| Marker deleted / replaced / made unreadable    | `marker-missing` / `marker-mismatch` / `marker-mismatch`                   |
| Root restored                                  | `healthy`, and the next pass reported zeros                                |
| **Tree emptied, same root and marker**         | `root-empty-while-indexed`; refused; nothing marked missing                |
| Index dropped entirely, then one pass          | rebuilt 29 entries; same `device`, `inode` and `markerId` as before        |

## Definition of done

A volume that is not the volume the index describes produces a report and no conclusions, and a person who edits their files over SSH finds the application agreeing with them rather than fighting them.
