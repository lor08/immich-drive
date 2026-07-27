# Immich Drive task index

This file is the canonical registry for promoted Immich Drive work. The complete long-term backlog lives in `docs/product/delivery-plan.md`; this index records work that has a durable task file, a GitHub Issue, an implementation pull request, or an explicit architectural decision.

## Rules

- Use the stable backlog ID from `docs/product/delivery-plan.md` in every new task file, Issue, branch, and pull request.
- Assign the next chronological `docs/tasks/NNNN-*.md` number only when a backlog item is promoted.
- Search this index, open and closed Issues, pull requests, and branches before creating a new record.
- One stable backlog ID may have only one active Issue and one active implementation pull request.
- A task marked `Backlog` in the delivery plan normally has no Issue.
- A task marked `Ready`, `Active`, or `Blocked` must have a detailed task file before implementation starts.
- Update this index when a task is promoted, blocked, superseded, merged, or closed.

## Status vocabulary

- `Done` — implementation merged and validation recorded.
- `Active` — implementation, review, or required architecture work is underway.
- `Ready` — promoted and sufficiently defined, but implementation has not started.
- `Blocked` — promoted but waiting on a named dependency.
- `Superseded` — retained for history but replaced by another task or decision.

## Promoted tasks

| Task file                        | Backlog ID | Title                                  | Status     | Issue | Pull request | Dependencies / notes                                                                       |
| -------------------------------- | ---------- | -------------------------------------- | ---------- | ----- | ------------ | ------------------------------------------------------------------------------------------ |
| `0001-scaffold-file-domain.md`   | `P1-01`    | Scaffold isolated file domain          | Done       | #2    | #3           | Foundation for all file-domain server work.                                                |
| `0002-fork-friendly-ci.md`       | `X-CI-01`  | Fork-friendly CI experiment            | Superseded | #4    | #5           | Replaced by inherited-workflow policy in `P0-02`; the added workflow was removed by PR #7. |
| `0003-github-workflow-policy.md` | `P0-02`    | Align agents with inherited workflows  | Done       | #6    | #7           | Defines PR template, labels, CI, and security rules.                                       |
| `0004-local-storage-adapter.md`  | `P1-02`    | Secure read-only local storage adapter | Done       | #8    | #10          | Descriptor-safe read-only adapter; mutations still unsupported.                            |
| `0005-delivery-backlog.md`       | `P0-03`    | Complete staged delivery backlog       | Done       | #13   | #14          | Documentation and process only.                                                            |
| `0006-architecture-decisions.md` | `P0-11`    | Storage, index, and client decisions   | Done       | #17   | #18          | Adds ADR 0004-0007 and re-sequences Phase 1; documentation only.                           |
| `0007-integration-seam-spike.md` | `P0-12`    | Integration seam measurement spike     | Done       | #19   | —            | Six upstream files measured; ADR 0008 keeps the domain in-process. Spike branch unmerged.  |
| `0009-migration-architecture.md` | `P0-04`    | Migration and rollback architecture    | Done       | #9    | —            | ADR 0009: in-place image swap, opt-in domain. Implementation deferred to `P1-04`.          |

## Promoted architecture work awaiting task files

These Issues are valid architectural work, but implementation must not begin until a versioned task file is added and this index is updated.

| Backlog ID       | Title                                | Status | Issue | Required next record                                                       |
| ---------------- | ------------------------------------ | ------ | ----- | -------------------------------------------------------------------------- |
| `P0-05` / `X-03` | Release and publication architecture | Ready  | #11   | Add the next chronological task file before workflow or packaging changes. |

## Promotable work with accepted decisions and no Issue yet

These items are defined by an accepted ADR and may be promoted without further design work. They intentionally have no Issue until they are started.

| Backlog ID | Title                           | Decided by | Notes                                                                                       |
| ---------- | ------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `P1-03`    | Storage-root configuration      | ADR 0004   | Startup validation, including non-overlap with Immich upload and library paths.             |
| `P1-16`    | Volume and path namespace model | ADR 0004   | Private volume per user plus one configured shared space; registry is configuration-driven. |
| `P1-17`    | Concurrency primitives          | ADR 0005   | PostgreSQL advisory locks keyed by normalized volume and path; no schema required.          |

## Foundation records without implementation task files

| Backlog ID | Record                              | Status | Pull request | Notes                                                                     |
| ---------- | ----------------------------------- | ------ | ------------ | ------------------------------------------------------------------------- |
| `P0-01`    | Product and architecture foundation | Done   | #1           | Established vision, roadmap, architecture, ADRs, and initial task policy. |

## Next recommended sequence

1. Promote `P1-03` storage-root configuration and overlap validation; nothing may be written to disk before it exists.
2. Promote `P1-16` volumes and `P1-17` advisory locking, then the filesystem-only browse and write slices `P1-08` through `P1-10`.
3. Promote `P2-01` and `P2-02` so the first slice is usable in the web client.
4. Promote and complete `P0-04` migration architecture before `P1-04` introduces Drive-owned schema, and deliver `P1-06` reconciliation together with it.
5. Complete `P0-05` release architecture before publishing stable images or signed clients.
