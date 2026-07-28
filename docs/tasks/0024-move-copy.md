# Task 0024: Move, rename and copy entries

## Tracking

- Stable backlog ID: `P1-11`
- GitHub Issue: [#52 — Move, rename and copy entries](https://github.com/lor08/immich-drive/issues/52)
- Uses: [`P1-17`](0018-path-locks.md) path lock, [`P1-09`](0020-file-upload.md) staged write, [`P1-16`](0011-volume-model.md) volume layout

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #52 is the live execution log.

## Status

Implementation in review.

## Goal

Let a client rearrange content it already owns: rename an entry, move it into another folder, and copy a file.

## The design question, and the answer

Every mutation so far touched one path and took one lock. A move touches two, and two locks are where deadlocks come from: a request moving `/a` to `/b` and another moving `/b` to `/a` each hold what the other waits for. PostgreSQL breaks such a cycle by aborting one session, which would surface to a user as a failed rename with a database error behind it.

The fix is not to hold fewer locks but to stop the cycle from forming. The keys are sorted before acquisition, so the two requests above ask for the same two keys in the same order and the second simply queues behind the first. Ordering is derived from the keys themselves, so no caller has to know about any other caller. Duplicates are collapsed, because two paths can hash to one key and because a caller may name the same path twice — a key acquired twice would need releasing twice.

Ordering is a pure function, `orderedPathLockIds`, so the property that makes the scheme correct is testable without a database.

## Decisions made by this task

**A rename is a move.** One endpoint, `POST /files/move`, covers both: on the filesystem they are one operation, and splitting them would only invite the two to drift.

**An occupied target is a conflict, never a replacement.** `rename(2)` would overwrite the target silently, and some of those overwrites cannot be done atomically at all — replacing a non-empty directory is not one operation. The target is checked first, under the lock that makes the check meaningful, and an occupied target is `409`. There is no overwrite flag: no caller needs one, and adding one would mean choosing what "replace a folder" means.

**A cross-volume move cannot be expressed.** The request names one volume for both paths, so the case does not arise rather than being validated away. That is what [ADR 0004](../adr/0004-volume-path-model.md) asks for: volumes can be separate filesystems and separate ownership, so moving between them is a copy followed by a delete, with progress and cancellation — a different operation, not a flag on this one.

**Copying a directory is refused, and refused as a bad request.** A tree can be arbitrarily large, can fail halfway, and needs progress and cancellation, which belongs to a background job rather than a request. It answers `400`, not `500`: the client asked for something outside the endpoint's subject, which is a rejected request rather than a server fault.

**Moving a directory into its own descendant is refused before the filesystem is touched**, so the caller gets our error rather than an `errno` leaking through with whatever text the platform chose.

**A copy reuses the staged write.** Same `.tmp` staging, same `fsync`, same rename into place, so a partial copy is never visible and a failed copy leaves nothing behind. The copy is owner-only on disk regardless of the source mode.

**The staging root is what marks an adapter writable.** A rename needs no staging directory, but an adapter constructed without one is read-only by construction, so it refuses a move for the same reason it refuses a write. A separate flag could disagree with the thing it describes.

**`EXDEV` is mapped, not assumed impossible.** Both paths are in one volume, but a subdirectory can still be a separate mount, so a cross-device rename is reported as an unsupported operation instead of escaping as an unhandled error.

## Scope

```text
server/src/extensions/files/path-lock.ts              orderedPathLockIds, withPathLocks
server/src/extensions/files/local-storage.adapter.ts  move, copy, shared path splitting
server/src/extensions/files/file-domain.service.ts    both operations under both locks
server/src/extensions/files/files.controller.ts       POST /files/move, POST /files/copy
server/src/extensions/files/files.dto.ts
server/src/enum.ts                                    file.update permission
```

`server/src/enum.ts` is an existing seam from `P1-08`; no new upstream file is touched. The specification and both generated clients are regenerated, as every API change requires.

## Non-goals and known gaps

- **No web control yet.** Rename, move and copy in the browser belong to `P2-04`, which this task unblocks.
- **Directory copy** waits on a background job; no partial support is offered in the meantime.
- **Cross-volume transfer** is a separate operation and is not scheduled by this task.
- **No overwrite flag** on either endpoint.
- Trash and delete are `P1-12`. A move cannot reach `.trash`, which is outside the address space.
- Checksums are `P1-13`, so a copy is not verified by digest; it is verified by comparison in this task's own testing only.

## Acceptance criteria

- [x] A file is renamed, and a directory is renamed with its contents.
- [x] A file is moved into another directory.
- [x] A file is copied, bytes identical, owner-only on disk, with nothing left in staging.
- [x] An occupied target is `409` on both endpoints, and the existing entry is untouched.
- [x] A missing source and a missing target parent are both `404`.
- [x] Copying a directory is `400`.
- [x] Moving a directory into its own descendant is refused with our own error.
- [x] Invalid and escaping paths are refused on both sides without changing anything.
- [x] Concurrent requests on the same pair of paths queue instead of deadlocking, demonstrated against a real database.
- [x] Contended requests produce exactly one winner.
- [x] Descriptors are not leaked across success and failure.
- [x] Verified against the running server.
- [ ] Relevant inherited checks pass.

## Verified by running it

164 unit tests pass, 37 new: rename, directory rename, move between directories, move onto itself, missing source, missing target parent, target parent that is a file, occupied target as file and as directory, directory into its own descendant, invalid source and target paths, symlinked source parent, symlinked target parent, descriptor accounting, and the copy equivalents including mode and staging.

Against the live server:

| Check                                                  | Result                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| Rename a file, rename a directory                      | `204`, listing reflects the new name                               |
| Move a file into a nested folder                       | `204`, entry appears there and nowhere else                        |
| Copy a file                                            | `201` with the new entry, staging empty                            |
| Move and copy onto an occupied target                  | `409`, existing content intact                                     |
| Missing source, missing target parent                  | `404`                                                              |
| Copy a directory                                       | `400 Copying a directory is not supported`                         |
| Directory into its own descendant                      | `400 Storage entry cannot be moved inside itself`                  |
| `targetPath: /../../escape.txt`                        | `400 Invalid storage path`                                         |
| `targetPath: /.trash/c.txt`                            | `404` — the trash directory is not in the address space            |
| Unknown volume                                         | `404 Volume not found`                                             |
| 200 MB copy                                            | 0.40 s, byte-identical, resident memory unchanged                  |
| **A move while another session holds the target key**  | blocked 5.07 s, then `204` — it waited for exactly that key        |
| **40 concurrent requests swapping the same two paths** | all `409`, no deadlock, no file lost, no advisory lock left behind |
| 20 concurrent moves of one source to one free target   | exactly one `204`, nineteen `404`                                  |
| 20 concurrent copies of one source to one free target  | exactly one `201`, nineteen `409`, staging empty                   |

The lock proof is the interesting one. Holding `pg_advisory_lock(1685222961, 1227278764)` from a separate session — the Drive lock class and the target path's key — made the move wait, and `pg_locks` showed the server holding the source key and queued on the target:

```text
  classid   |   objid    | objsubid |     mode      | granted
------------+------------+----------+---------------+---------
          0 |        600 |        1 | ExclusiveLock | t          <- Immich, single-argument form
 1685222961 | 1227278764 |        2 | ExclusiveLock | t          <- the holder above
 1685222961 | 2288102607 |        2 | ExclusiveLock | t          <- the server, source key
 1685222961 | 1227278764 |        2 | ExclusiveLock | f          <- the server, waiting
```

Two things are visible at once: the Drive locks sit at `objsubid = 2` in a lock space Immich's own keys cannot reach, and the source was taken before the target because that is the order the keys sort in.

## Definition of done

A user can rearrange their files, and two users doing it to the same files at the same time get a queue rather than a deadlock or a lost file.
