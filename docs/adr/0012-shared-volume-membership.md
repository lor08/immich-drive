# ADR 0012: Shared-volume membership is authoritative state, kept apart from the index

- Status: Accepted
- Date: 2026-07-30

## Context

[ADR 0004](0004-volume-path-model.md) described a shared space as "a named space with an explicit member list", and then conceded that membership "cannot be per-user until the index exists; the first implementation is limited to a configuration-defined space". That first implementation is what ships today: the shared volume is addressable by **every** authenticated user holding `file.read`, because configuration is all the registry knows.

Private volumes need no such decision. A private volume's path is derived from the caller's own identifier, so one user cannot name another's volume — the safety is structural, and tested.

Membership is different in a way that matters to this fork's architecture. [ADR 0002](0002-transparent-filesystem-storage.md) makes the filesystem authoritative and [ADR 0011](0011-drive-index-schema.md) keeps PostgreSQL to a rebuildable cache of it. **Nothing on disk says who may read `/shared/family`.** A directory has owner and mode bits for the single process user, and that is all; there is no place in the tree where "these four people, one of them read-only" could live without inventing a metadata file that would then be a second source of truth and an obvious tampering target.

So per-user membership means the database starts holding a fact that cannot be recovered from the tree. That is a change to the promise, and it deserves to be written down rather than discovered later by someone restoring a backup.

## Decision

**Membership is authoritative state in PostgreSQL, and it is deliberately not part of the index.**

- One fork-owned table holds `(volume key, user, access mode)`. Access is `read-only` or `read-write`; there are no other modes at this stage.
- The table is keyed by the **volume key text** — `shared:<space>` — and **not** by a foreign key to `drive_volume`. The index tables are a cache whose documented recovery is "drop them and run a pass"; membership must survive that. Tying the two together would mean rebuilding the cache silently revoked everyone's access.
- **An empty member list means nobody.** Never everybody. A rebuilt or restored database that has lost the member rows leaves the shared volume reachable by no one until an administrator adds people back.
- A private volume needs no row. Ownership stays derived from the path, because that cannot be lost, corrupted, or forgotten.
- **System work is not a user.** Reconciliation and scheduled jobs reach every volume without a membership row, because they act for the deployment rather than on someone's behalf.
- Every file-domain entry point resolves access through one decision point, and the storage adapter is reachable _only_ through it. Forgetting a check then requires adding a dependency rather than merely forgetting a line.

## Consequences

### Positive

- The shared volume becomes usable in a household where not everyone should see everything, which is what ADR 0004 promised.
- Losing the database fails **closed**. The alternative — reading an absent member list as "unrestricted" — would turn a restore into a disclosure.
- Rebuilding the index does not touch authorization, so the cache stays a cache in practice and not merely in intent.
- One decision point makes read-only membership real: a mutation is refused with `403` rather than quietly succeeding somewhere the check was skipped.

### Negative

- **The tree is no longer fully self-describing.** Content, names and hierarchy still are — a person with shell access reads `/shared/family/files` exactly as before, and that is the property ADR 0002 was protecting. What is not on disk is _who was permitted_, and after a total database loss that information is gone rather than derivable. This is the first Drive state with that property and it should stay a very short list.
- Membership rides in Immich's own database backup, alongside users and albums. There is no separate, human-readable export of it, which means the recovery story for authorization is "restore the database" rather than "read the disk".
- An existing deployment that relied on the shared volume being open to everyone finds it closed after the upgrade. That is the safe direction, but it is a behaviour change that belongs in release notes.
- A household of four is four rows. Groups would reduce that, and are deliberately not introduced until something needs them.

## Rejected alternatives

**A metadata file in the volume, so membership lives on disk too.** Keeps the tree self-describing and survives a database loss. Rejected because it makes the authorization list writable by anyone with filesystem access — including, later, by an external directory's other writer — and because two sources of truth for permissions is how permission bugs are born. The tree stays authoritative for _content_, which is what ADR 0002 actually promises.

**Deriving membership from filesystem ownership or groups.** Attractive, and how a NAS does it. Rejected because every volume is served by one process user by ADR 0004's design, so the bits carry no per-person information to read; making them carry it would mean the server running as many users.

**Treating an empty member list as unrestricted.** Simpler to migrate to, and it would keep existing deployments working unchanged. Rejected outright: it means a database restore that half-succeeds opens the shared volume to everyone, and it makes "nobody has access yet" indistinguishable from "everyone does".

**Foreign key to `drive_volume` with cascade.** The obvious relational modelling, and it would keep membership tidy. Rejected because it couples authorization to a cache that the fork tells operators to drop and rebuild; the first person to follow that advice would silently revoke every member.

**Per-path permissions now.** What users will eventually want. Deferred to Phase 7, because volume-level membership is the smallest thing that makes a shared space honest, and per-path rules need a share model, an inheritance rule, and a listing story that the index cannot serve yet.
