# Task 0011: Volume and path namespace model

## Tracking

- Stable backlog ID: `P1-16`
- GitHub Issue: [#26 — Implement the volume and path namespace model](https://github.com/lor08/immich-drive/issues/26)
- Decided by: [ADR 0004](../adr/0004-volume-path-model.md)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #26 is the live execution log.

## Status

Implementation in review.

## Goal

Give the file domain the volume abstraction ADR 0004 decided on. Before this task the domain had a validated storage root and a read-only adapter, but nothing that said which directory belongs to whom.

## Decisions made by this task

**A volume's adapter root is its `files/` directory.** Service directories are siblings, so `.trash` and `.tmp` are unreachable through the adapter by construction. The adapter already refuses to leave its root, so this converts a convention into a structural guarantee, and the test asserts it rather than trusting it.

**Volume identifiers are `private` and `shared:<name>`.** The private volume is resolved from the authenticated session, so its identifier needs to carry no owner information and leaks none. A future `user:<id>` form can be added when sharing arrives without changing these two.

**Identifiers from trusted sources are still validated.** The owner identifier comes from a session and the space name from configuration, so neither is attacker-controlled today. Both are checked against a single-segment pattern anyway, because a malformed value would otherwise become a path escape instead of an error.

**Provisioning is idempotent and cached as a promise.** Concurrent resolution shares one attempt, and a failed attempt is not remembered as success.

**One shared space, available to everyone.** Per-user membership needs the index, so until `P1-04` a shared space is either present for all users or absent.

## Scope

```text
server/src/extensions/files/volume.ts
server/src/extensions/files/volume.registry.ts
server/src/extensions/files/volume.registry.spec.ts
server/src/extensions/files/files.config.ts        (adds IMMICH_DRIVE_SHARED_SPACE)
```

Physical layout, unchanged from ADR 0004:

```text
<root>/users/<owner>/files    browsable, and the adapter root
<root>/users/<owner>/.trash   reserved, nothing writes to it yet
<root>/users/<owner>/.tmp     reserved, nothing writes to it yet
<root>/shared/<space>/…       same shape
```

## Non-goals

- Registering the module in `app.module.ts`. Registration without a route changes nothing observable, so it lands with `P1-08` as one reviewable seam together with the endpoint it serves.
- HTTP endpoints, DTOs, and generated clients.
- Writes, trash behavior, and locking.
- Per-user membership for shared spaces, which needs `P1-04`.
- Persisting the registry; it stays configuration-driven until `P1-04`.

## Acceptance criteria

- [x] A private volume resolves and its three directories exist afterwards.
- [x] Resolution is idempotent and correct under concurrent callers.
- [x] The adapter cannot see `.trash` or `.tmp`, proven by a test.
- [x] A configured shared space resolves to the same tree for every owner; without configuration no shared volume exists.
- [x] Invalid shared-space names and owner identifiers are rejected, including separators, dot segments, leading dots, spaces, and null bytes.
- [x] Unknown, empty, and malformed volume identifiers are rejected.
- [x] Two owners resolve to different trees.
- [x] A rejected owner identifier creates nothing on disk, inside or outside the storage root.
- [ ] Relevant inherited checks pass.

## Definition of done

The domain can answer "which directories does this user have, and which adapter serves each", and the answer cannot be talked into pointing somewhere else.
