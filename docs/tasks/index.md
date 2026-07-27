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

| Task file | Backlog ID | Title | Status | Issue | Pull request | Dependencies / notes |
| --- | --- | --- | --- | --- | --- | --- |
| `0001-scaffold-file-domain.md` | `P1-01` | Scaffold isolated file domain | Done | #2 | #3 | Foundation for all file-domain server work. |
| `0002-fork-friendly-ci.md` | `X-CI-01` | Fork-friendly CI experiment | Superseded | #4 | #5 | Replaced by inherited-workflow policy in `P0-02`; the added workflow was removed by PR #7. |
| `0003-github-workflow-policy.md` | `P0-02` | Align agents with inherited workflows | Done | #6 | #7 | Defines PR template, labels, CI, and security rules. |
| `0004-local-storage-adapter.md` | `P1-02` | Secure read-only local storage adapter | Active | #8 | #10 | Depends on `P1-01`; must finish with green inherited CI. |
| `0005-delivery-backlog.md` | `P0-03` | Complete staged delivery backlog | Active | #13 | #14 | Documentation and process only. |

## Promoted architecture work awaiting task files

These Issues are valid architectural work, but implementation must not begin until a versioned task file is added and this index is updated.

| Backlog ID | Title | Status | Issue | Required next record |
| --- | --- | --- | --- | --- |
| `P0-04` / `X-02` | Migration architecture | Ready | #9 | Add the next chronological task file before architecture implementation. |
| `P0-05` / `X-03` | Release and publication architecture | Ready | #11 | Add the next chronological task file before workflow or packaging changes. |

## Foundation records without implementation task files

| Backlog ID | Record | Status | Pull request | Notes |
| --- | --- | --- | --- | --- |
| `P0-01` | Product and architecture foundation | Done | #1 | Established vision, roadmap, architecture, ADRs, and initial task policy. |

## Next recommended sequence

1. Finish `P1-02` / PR #10 and merge only after all inherited checks pass.
2. Merge `P0-03` so every later task uses the complete delivery plan and duplicate-prevention rules.
3. Promote and complete `P0-04` migration architecture before Drive-owned schema migrations are introduced.
4. Promote `P1-03` storage-root configuration and overlap validation.
5. Promote `P1-04` Drive-owned database schema after the migration boundaries are accepted.
6. Complete `P0-05` release architecture before publishing stable images or signed clients.
