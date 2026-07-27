# ADR 0007: Ship reconciliation with the index and never infer deletion from an unhealthy volume

- Status: Accepted
- Date: 2026-07-27

## Context

ADR 0002 keeps the filesystem authoritative, and the product deliberately invites people to touch their files outside the application: over SSH, from a backup tool, or through a directory that another container also writes. ADR 0005 delays the index, but once it exists it is a cache of something that changes behind its back.

There is a specific failure that destroys data in systems like this. A network mount disappears, or a volume root is replaced by an empty directory, and the indexer reads an empty tree. Comparing that against a populated index, the obvious conclusion is that the user deleted everything. Acting on that conclusion is unrecoverable if it also removes content or metadata.

## Decision

Reconciliation is delivered **in the same phase as the index**, not as later hardening.

- The index must be fully rebuildable from the filesystem alone. Dropping and rebuilding it is a supported operation, not a recovery emergency.
- Reconciliation is non-destructive by default. It may mark entries missing, stale, or conflicted, and it may add entries it discovers, but it never deletes user-visible content or its metadata on its own. Destructive cleanup requires an explicit, logged operator action.
- Every volume records the filesystem identity of its root and a marker file written when the volume is initialized.
- A volume is reported **unhealthy**, and reconciliation performs no removals on it, when any of the following holds: the root filesystem identity has changed, the marker file is absent, the root cannot be read, or the root is empty while the index is not.
- Filesystem watchers are an optimization that produce hints. Scheduled reconciliation remains authoritative, because watchers drop events under load and miss changes made while the server is down.
- Reconciliation checkpoints its progress so an interrupted run resumes instead of restarting, and so a large tree does not block other work.

## Consequences

### Positive

- Editing files outside the application is a supported workflow rather than a way to corrupt state, which is the practical meaning of the promise in ADR 0002.
- A failed mount degrades into a visible health error instead of a mass deletion.
- Because the index can be rebuilt, it stays a cache, which preserves the rollback story in ADR 0005.
- External directories in a later phase inherit this behavior instead of needing their own rules.

### Negative

- Reconciliation cost grows with tree size, so checkpointing, throttling, and progress reporting are required rather than optional.
- Missing and conflicted states must be represented in the API and in the interface, which adds cases to the file browser.
- A marker file is visible to anyone browsing the volume on the host; it is one dot-file at the volume root and must be documented.
- Genuine bulk deletions performed outside the application need an operator action before the index reflects them.

## Rejected alternatives

**Watcher-only consistency.** Cheapest and lowest latency, but inotify-style watchers overflow, miss events while the process is down, and are unavailable or unreliable on network filesystems, which are exactly the mounts this product expects.

**Delete index entries when a file is absent.** Correct in the common case and catastrophic in the failure case that matters, with no way to distinguish the two at the moment of the scan.

**Defer reconciliation until external directories arrive.** Managed storage is already writable from the host, so the drift exists as soon as the index does; postponing the mechanism only means the first drift is handled by hand.
