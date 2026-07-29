# Task 0025: Trash, restore and permanent deletion

## Tracking

- Stable backlog ID: `P1-12`
- GitHub Issue: [#54 — Trash, restore and permanent deletion](https://github.com/lor08/immich-drive/issues/54)
- Uses: [`P1-17`](0018-path-locks.md) path lock, [`P1-16`](0011-volume-model.md) volume layout, [`P1-11`](0024-move-copy.md) rename discipline

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #54 is the live execution log.

## Status

Implementation in review.

## Goal

A user can delete a file or folder, see what they deleted, put it back, and remove it for good — without any step being a copy, and without a mistake being unrecoverable.

## The design question, and the answer

`P1-16` rooted the adapter at the volume's `files/` directory, so `.trash` is a **sibling of the address space rather than a folder inside it**. That is what makes service directories structurally invisible instead of hidden by convention — and it also means a soft delete cannot be written as `move(path, '/.trash/…')`, because the adapter cannot name the trash at all.

The same three options `P1-09` faced with staging:

1. **Put the trash inside the address space.** Then a user can browse, rename and delete their own trash as ordinary folders, and `.trash` becomes a name they can collide with.
2. **Do the rename a layer above the adapter.** That layer would need its own descriptor-safe rename, duplicating the property the adapter exists to provide.
3. **Give the adapter a trash root** beside its address root, used only for the trash and never resolvable from a virtual path.

The third, exactly as staging works. Construction now validates both service roots through one function, and the check that matters is the same for both: a service directory on another filesystem would silently turn every upload into a copy and every delete into a copy — the second being precisely what [ADR 0004](../adr/0004-volume-path-model.md) says a delete must never become. It fails at construction instead.

## Decisions made by this task

**Soft delete is the only delete.** `StorageAdapter.delete` stays unsupported, because the product has no operation that permanently removes a live entry in one step. Permanent removal acts on a trash record. That is a product decision — recoverability by default — not an unimplemented method.

**The record layout.** One deleted entry becomes two things:

```text
.trash/<uuid>/<original name>   the content, moved by rename(2), name unchanged
.trash/<uuid>.json             the sidecar manifest
```

A generated identifier rather than a mirror of the original path, because two deletes of the same path would collide and restoring would have to recreate parents it never owned. The entry keeps its own name inside the record, because [ADR 0002](../adr/0002-transparent-filesystem-storage.md) requires the tree to stay readable and recoverable without the application, and `.trash/<uuid>/report.txt` beside a manifest naming its old home reads correctly to a person with a text editor. The manifest sits **beside** the record rather than inside it, because inside it could collide with a deleted entry carrying the same name.

**The manifest is written before the rename.** If the rename then fails, the manifest and the empty record are removed and the entry never left its place. The opposite order would risk content in the trash with no record of where it belongs.

**The content is authoritative and the manifest is advisory.** A record whose manifest is missing, unparseable, or naming a path the normal rules reject is still listed, with an unknown origin, and can be restored to an explicit path or removed. Content the application cannot interpret must never become content the application cannot remove. The manifest's `originalPath` is re-validated on read rather than trusted, so a tampered manifest cannot name a path outside the address space.

**A restore refuses to overwrite.** An occupied target is `409`, a missing target parent is `404`, and neither is created silently — the same rule as non-recursive folder creation. `targetPath` exists so that conflict is resolvable without an overwrite flag, and so an unreadable manifest is not a dead end.

**A failed restore keeps the record.** Cleanup of the emptied record runs only after the content has moved out, never in a `finally`. This was a real defect during implementation, caught by its own tests: a rejected restore was deleting the record it had just refused to restore.

**The trash is one authority.** `file.delete` covers moving into the trash, restoring out of it, and purging. Splitting restore under `file.create` would hand out a key that can restore what it cannot delete.

**A record the application cannot read is still removable.** A purge validates the identifier and then removes whatever sits under it, without first requiring the record to be interpretable, and emptying maps a stray `<uuid>.json` back to its identifier so a delete interrupted between writing the manifest and creating the directory does not leave a file nothing ever looks at again. Both of these were gaps in the first implementation, found by self-review against this task's own stated principle: listing tolerated a damaged record, but purging refused it.

**Emptying continues past a failing record** and reports `{ removed, failed }`, so one record the filesystem refuses to remove cannot make the trash permanently un-emptiable. Content in the trash that is not a record — a stray file, a directory that is not a UUID — is left alone by every operation.

**Lock keys.** A delete locks the path it leaves; a restore locks the record and the target; a purge locks the record alone, since nothing lands anywhere. Record keys are `trash:<id>`, which no normalized path can produce, so the two namespaces share a lock space without either being able to mean the other. Emptying is deliberately **not** locked as a unit: a lock covering every record would have to be volume-wide and would serialise emptying against every unrelated operation, so each record goes independently and one being restored at that moment is simply counted as failed.

## Scope

```text
server/src/extensions/files/storage.adapter.ts        trash contract, TrashPurgeResult
server/src/extensions/files/file-entry.ts             TrashRecord
server/src/extensions/files/local-storage.adapter.ts  trash root, five operations, manifest handling
server/src/extensions/files/volume.registry.ts        passes the volume's .trash
server/src/extensions/files/file-domain.service.ts    each operation under its own locks
server/src/extensions/files/files.controller.ts       five endpoints
server/src/extensions/files/files.dto.ts
server/src/enum.ts                                    file.delete permission
```

`server/src/enum.ts` is an existing seam from `P1-08`; no new upstream file is touched. The specification and both generated clients are regenerated.

## Endpoints

| Endpoint                               | Effect                                                  | Permission    |
| -------------------------------------- | ------------------------------------------------------- | ------------- |
| `DELETE /files/entries?volumeId&path`  | moves the entry to the trash, returns the record        | `file.delete` |
| `GET /files/trash?volumeId`            | lists records, newest first                             | `file.read`   |
| `POST /files/trash/restore`            | `{ volumeId, trashId, targetPath? }`, returns the entry | `file.delete` |
| `DELETE /files/trash?volumeId&trashId` | removes one record for good                             | `file.delete` |
| `POST /files/trash/empty`              | `{ volumeId }`, returns removed and failed counts       | `file.delete` |

## Non-goals and known gaps

- **Automatic retention and expiry.** It needs a scheduled job, which means taking on the Immich job-queue seam, and that deserves its own task and its own inventory entry. Until then **the trash grows until someone empties it** — stated plainly rather than implying a cleanup that does not exist.
- **Reconciliation of foreign or orphaned content in the trash** is `P1-06`. This task only guarantees such content stays listable, purgeable, and untouched by everything else.
- **Quotas** are `P7-03`; deleted content still occupies the disk, which is the point of a trash.
- **Web controls** are `P2-04`.
- **Cross-volume restore** is not expressible, for the same reason a cross-volume move is not.

## Acceptance criteria

- [x] Deleting a file moves it into the trash by rename, leaving nothing at the original path.
- [x] Deleting a folder moves the whole subtree in one operation.
- [x] The manifest records the original path, and the entry keeps its name.
- [x] A failed delete leaves the entry where it was and no record behind.
- [x] The trash lists records newest first, and a record with a broken manifest is listed rather than hidden.
- [x] Restore puts the entry back at its original path, and the record disappears.
- [x] An occupied target is `409` and the record survives; `targetPath` resolves it; a missing parent is `404`.
- [x] Purging one record removes both the content and the manifest.
- [x] A record the application cannot interpret can still be purged, and an orphaned manifest is cleared by emptying.
- [x] Emptying removes every record, reports counts, and leaves foreign content alone.
- [x] The trash is unreachable through the address space: no path can name it, list it, or write into it.
- [x] One owner cannot see or touch another owner's trash.
- [x] A trash root that is missing, or on another filesystem, is refused at construction.
- [x] Descriptors are not leaked across success and failure.
- [x] Verified against the running server.
- [x] Relevant inherited checks pass.

## Verified by running it

The full server suite passes: 2455 tests, 2 skipped. The file domain holds 207, forty-two of them new — including a folder moved in whole, a record whose manifest is missing, not JSON, not an object, or naming an escaping path, identifiers that are not identifiers, a trash root on `/dev/shm`, and descriptor accounting across every operation and its failures.

Against the live server:

| Check                                                  | Result                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Delete a file                                          | record returned, entry gone from the listing, content under `.trash/<id>/` |
| The manifest on disk                                   | `version`, `originalPath`, `name`, `type`, `deletedAt`, readable as text   |
| `GET /files/trash`                                     | the record, and a pre-existing stray file in `.trash` ignored              |
| `path=/.trash`                                         | `404` — the trash cannot be addressed                                      |
| Restore over a recreated original path                 | `409`, and the record still listed afterwards                              |
| Restore with `targetPath`                              | `201` with the restored entry, record directory and manifest gone          |
| Delete a folder                                        | whole subtree inside one record                                            |
| Purge one record                                       | `204`, content and manifest gone                                           |
| Empty with three records                               | `{ removed: 3, failed: 0 }`, stray file untouched                          |
| Delete a missing entry / escaping path / volume root   | `404` / `400` / `400`                                                      |
| Restore or purge a bad or absent identifier            | `400` / `404`                                                              |
| Trash of a volume the owner cannot address             | `404 Volume not found`                                                     |
| **Restore while another session holds the record key** | blocked 4.07 s, then `201`                                                 |

The lock proof, as in `P1-11`: holding `pg_advisory_lock(1685222961, -52548588)` — the Drive lock class and the key for `trash:<id>` — made the restore wait, and `pg_locks` showed the server queued on exactly that object at `objsubid = 2`.

Cross-owner separation was checked two ways: a unit test drives two owners through the service, and on disk each owner's `.trash` is their own directory — the second owner's stayed empty while the first held the record. No HTTP call was made as the second user, because that session's token was not available in this environment.

## Definition of done

Nothing a user deletes is gone until they say so a second time, and nothing the application fails to understand becomes something it cannot remove.
