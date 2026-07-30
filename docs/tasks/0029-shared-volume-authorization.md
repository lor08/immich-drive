# Task 0029: Ownership and authorization for the shared volume

## Tracking

- Stable backlog ID: `P1-07`
- GitHub Issue: [#64 — Ownership and authorization for the shared volume](https://github.com/lor08/immich-drive/issues/64)
- Decision: [ADR 0012](../adr/0012-shared-volume-membership.md)
- Follows through on: [ADR 0004](../adr/0004-volume-path-model.md), which described a shared space as having "an explicit member list" and then deferred it

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #64 is the live execution log.

## Status

Implementation in review.

## Goal

A shared space that can be shared with _some_ people, and one place in the code that decides whether any file operation is allowed.

## What was wrong

The shared volume was addressable by **every** authenticated user holding `file.read`. `VolumeRegistry.describe` accepted `shared:<space>` from anyone, because configuration was all it knew, and nothing distinguished a member from a stranger or reading from writing.

Private volumes were already safe, and remain so without a single check: their path is derived from the caller's own identifier, so one owner cannot name another's.

## The decision that came first

Membership cannot be reconstructed from the filesystem — nothing on disk says who may read `/shared/family` — so it is the **first Drive state that is not a cache**. That is a change to the promise in ADR 0002 and ADR 0011, and it is argued in [ADR 0012](../adr/0012-shared-volume-membership.md) rather than buried in a migration. The two consequences worth repeating here:

- **An empty member list means nobody, never everybody.** A restored or rebuilt database that lost the rows leaves the shared volume reachable by no one until an administrator adds people back. The opposite reading would turn a half-successful restore into a disclosure.
- **Membership is keyed by the volume key text, not by a foreign key to `drive_volume`.** The index is a cache the fork tells operators to drop and rebuild; membership has to survive exactly that. A cascading reference would mean rebuilding the cache silently revoked everyone.

## Decisions made by this task

**One decision point, and storage is reachable only through it.** `VolumeAccessService` answers "may this caller do this to this volume?", and `FileDomainService` **no longer holds the volume registry at all** — an adapter comes only from a resolved access decision. Forgetting a check now requires adding a dependency rather than omitting a line.

**Three kinds of caller.** The owner of a private volume, whose right is derived from the path; a member of a shared volume, read-only or read-write; and system work — reconciliation and scheduled passes — which acts for the deployment and needs no membership row. The third is a named method, `forSystem`, so that it reads as a decision rather than as a missing check. Reconciliation and the scheduled job were both moved onto it, which is what keeps "storage comes from one place" literally true rather than nearly true: after this task nothing outside the access service holds the volume registry.

**A non-member is told the volume does not exist**, exactly as an unknown identifier is, and it is left out of `GET /files/volumes` entirely. A household space should not be discoverable by people outside it. **A read-only member is told plainly they may not write** — `403`, not `404`, because pretending a volume they can list has vanished is the worse answer.

**Member administration is administration**: `file.maintenance` plus `admin: true`, no new permission. It lives in `VolumeMembershipService`, apart from the access decision, because changing who may make requests is a different concern from deciding one. Adding someone who is already a member changes their access rather than failing.

**A private volume has no members**, and naming one is refused with a message that says why rather than an empty list.

## Scope

```text
server/src/extensions/files/schema/drive-volume-member.table.ts   the one authoritative table
server/src/schema/migrations/9000000000001-CreateDriveVolumeMember.ts
server/src/extensions/files/drive-membership.repository.ts        persistence, deliberately not the index
server/src/extensions/files/volume-access.service.ts              the single decision point
server/src/extensions/files/volume-membership.service.ts          administration
server/src/extensions/files/file-domain.service.ts                every entry point, each naming its need
server/src/extensions/files/reconciliation.service.ts             system work, said out loud
server/src/extensions/files/drive-job.service.ts                  the scheduled pass, likewise
server/src/extensions/files/volume.ts                             the read-only refusal code
server/src/extensions/files/files.exceptions.ts                   403 for that refusal
server/src/extensions/files/files.dto.ts, files.controller.ts     three admin endpoints
server/src/schema/index.ts                                        UPSTREAM: declares the table
```

`server/src/schema/index.ts` is the existing `P1-04` seam and the only upstream file touched; the inventory already describes it and the migrations directory. The specification and both generated clients are regenerated.

## Endpoints

| Endpoint                                        | Effect                                 | Permission                |
| ----------------------------------------------- | -------------------------------------- | ------------------------- |
| `GET /files/volumes/members?volumeId`           | who may reach a shared volume, and how | `file.maintenance`, admin |
| `POST /files/volumes/members`                   | add a member, or change their access   | `file.maintenance`, admin |
| `DELETE /files/volumes/members?volumeId&userId` | revoke access; content is untouched    | `file.maintenance`, admin |

## Non-goals

- **Per-path and per-entry sharing**, and share links: Phase 7.
- **More than one shared space.** Configuration still defines one; this gives it members rather than siblings.
- **Groups.** A household of four is four rows until something needs otherwise.
- **A compatibility shim** for deployments that relied on the shared volume being open to everyone. It is closed after this change, which belongs in release notes.

## Acceptance criteria

- [x] An ADR records that membership is the first Drive state not derivable from the filesystem, and what that costs.
- [x] A non-member cannot read, write, list or download anything in the shared volume, and does not see it in `GET /files/volumes`.
- [x] A read-only member can read and download, and every mutation is refused with `403`.
- [x] A read-write member can do everything a private volume allows.
- [x] The owner of a private volume is unaffected, and no member row is needed for it.
- [x] Reconciliation and scheduled jobs still reach every volume without a membership row.
- [x] An administrator can list, add and remove members; a non-administrator cannot.
- [x] Removing a user removes their membership rather than orphaning it (foreign key, `ON DELETE CASCADE`).
- [x] Every file-domain entry point goes through the single decision point — demonstrated by a test that fails if a new entry point forgets.
- [x] An empty member list means nobody, never everybody, including immediately after the index is rebuilt.
- [x] Verified against the running server with two real users.
- [x] Relevant inherited checks pass.

## Verified by running it

The file domain holds 309 unit tests, twenty-eight of them new: the decision rules, the administration rules, and five that walk every entry point of `FileDomainService`.

**The coverage test found a real hole within a minute of being written.** Rewriting every call site to name what it needs was mechanical, and the mechanism classified three operations as reads because they had previously been resolved the same way as a listing: `deleteEntry`, `purgeFromTrash` and **`emptyTrash`**. A read-only member of a shared volume could therefore have emptied its trash — destroying content — and the two-line change that fixed it is exactly the kind of thing a reviewer does not catch by eye. The test compares its call table against the class's own method list, so a new entry point fails it until it is covered.

Live, against the running server with two real users (the second given a password through the admin API so a real session token could be obtained):

| Check                                             | Result                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| Migration on the existing database                | applied, newest row in `kysely_migrations`, all three Drive tables present |
| Shared volume before any membership               | absent from `GET /files/volumes` for both users; direct access `404`       |
| Second user added as read-only                    | appears in their volume list; listing `200`                                |
| That user uploading                               | `403` — `Volume "shared:family" is read-only for this user`                |
| That user emptying the trash                      | `403` — the hole the coverage test found                                   |
| Upgraded to read-write                            | upload `200`                                                               |
| Member list as administrator                      | `second@immich.app`, `read-write`                                          |
| Member list and member add as a non-administrator | `403` both                                                                 |
| Adding a member to `private`                      | `A private volume has one owner and no members`                            |
| Membership removed                                | volume gone from the listing again; direct access `404`                    |
| The file that member wrote                        | still on disk — membership governs access, not ownership of content        |

One correction made during the live run: the member response carried the internal `volumeKey`, which the DTO did not describe. The controller now maps to exactly the promised fields.

## Definition of done

A household can share a space with the people in it and not with everyone else, and the answer to "is this allowed?" lives in one place that a new endpoint cannot quietly avoid.
