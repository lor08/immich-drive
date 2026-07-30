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

| Task file                           | Backlog ID      | Title                                  | Status     | Issue | Pull request | Dependencies / notes                                                                               |
| ----------------------------------- | --------------- | -------------------------------------- | ---------- | ----- | ------------ | -------------------------------------------------------------------------------------------------- |
| `0001-scaffold-file-domain.md`      | `P1-01`         | Scaffold isolated file domain          | Done       | #2    | #3           | Foundation for all file-domain server work.                                                        |
| `0002-fork-friendly-ci.md`          | `X-CI-01`       | Fork-friendly CI experiment            | Superseded | #4    | #5           | Replaced by inherited-workflow policy in `P0-02`; the added workflow was removed by PR #7.         |
| `0003-github-workflow-policy.md`    | `P0-02`         | Align agents with inherited workflows  | Done       | #6    | #7           | Defines PR template, labels, CI, and security rules.                                               |
| `0004-local-storage-adapter.md`     | `P1-02`         | Secure read-only local storage adapter | Done       | #8    | #10          | Descriptor-safe read-only adapter; mutations still unsupported.                                    |
| `0005-delivery-backlog.md`          | `P0-03`         | Complete staged delivery backlog       | Done       | #13   | #14          | Documentation and process only.                                                                    |
| `0006-architecture-decisions.md`    | `P0-11`         | Storage, index, and client decisions   | Done       | #17   | #18          | Adds ADR 0004-0007 and re-sequences Phase 1; documentation only.                                   |
| `0007-integration-seam-spike.md`    | `P0-12`         | Integration seam measurement spike     | Done       | #19   | —            | Six upstream files measured; ADR 0008 keeps the domain in-process. Spike branch unmerged.          |
| `0008-storage-root-config.md`       | `P1-03`         | Storage-root configuration             | Done       | #22   | #23          | Opt-in via `IMMICH_DRIVE_ROOT`; overlap with Immich media paths fails startup.                     |
| `0009-migration-architecture.md`    | `P0-04`         | Migration and rollback architecture    | Done       | #9    | —            | ADR 0009: in-place image swap, opt-in domain. Implementation deferred to `P1-04`.                  |
| `0010-release-architecture.md`      | `P0-05`         | Release and publication architecture   | Done       | #11   | —            | ADR 0010: GHCR only, renamed image, no fork-built ML. Workflow work split out as `P0-13`.          |
| `0011-volume-model.md`              | `P1-16`         | Volume and path namespace model        | Done       | #26   | #27          | Private volume per owner plus one configured shared space; adapter confined to `files/`.           |
| `0012-volume-discovery.md`          | `P1-08`         | Volume discovery and registration      | Done       | #28   | #29          | First upstream seam taken on; folder listing and creation split out as `P1-18`.                    |
| `0014-folder-listing.md`            | `P1-18`         | Folder listing API                     | Done       | #32   | #33          | Adds error-to-status mapping; folder creation split out as `P1-19`.                                |
| `0015-web-files-route.md`           | `P2-01`         | Web Files route and navigation         | Done       | #34   | #35          | Server feature flag hides the entry when Drive is off; inventory grew to thirteen seams.           |
| `0016-folder-browser.md`            | `P2-02`         | Folder browser                         | Done       | #36   | #37          | Breadcrumbs and navigation; only folders interactive; expected errors stay in-page.                |
| `0017-file-download.md`             | `P1-10`         | Authenticated download API             | Done       | #38   | #39          | Streams from the adapter, never by host path; ranges deferred to `P3-03`.                          |
| `0018-path-locks.md`                | `P1-17`         | Path advisory locks                    | Done       | #40   | #41          | Two-argument lock space; cannot collide with Immich's `DatabaseLock` keys.                         |
| `0019-folder-creation.md`           | `P1-19`         | Folder creation API                    | Done       | #42   | #43          | First write to disk; descriptor-relative, non-recursive, conflicts are `409`.                      |
| `0020-file-upload.md`               | `P1-09`         | Atomic upload pipeline                 | Done       | #44   | #45          | Staging root beside the address root; interrupted uploads leave nothing behind.                    |
| `0021-web-file-actions.md`          | `P2-03`/`P2-04` | Web actions for the file domain        | Done       | #46   | #47          | Create, upload, download from the interface; the rest of both items stays in the backlog.          |
| `0022-offline-dart-templates.md`    | `P0-15`         | Offline Dart template generation       | Done       | #48   | #50          | Removes a third-party fetch from a required check; refresh kept behind a flag.                     |
| `0023-e2e-stack-startup.md`         | `P0-16`         | Diagnosable e2e stack startup          | Done       | #49   | #51          | Cause was a registry rate limit, not a database race; the wrong hypothesis is recorded.            |
| `0024-move-copy.md`                 | `P1-11`         | Move, rename and copy entries          | Done       | #52   | #53          | Deterministic multi-path locking; directory copy and cross-volume moves stay out.                  |
| `0025-trash-restore-purge.md`       | `P1-12`         | Trash, restore and permanent deletion  | Done       | #54   | #55          | Trash root beside the address root; retention needs the job-queue seam and stays out.              |
| `0026-drive-index-schema.md`        | `P1-04`         | Drive index schema                     | Done       | #56   | #58          | First Drive-owned tables; migrations carry a fixed `9000000000000` prefix so they sort last.       |
| `0027-reconciliation-and-health.md` | `P1-06`         | Reconciliation and volume health       | Done       | #57   | #60          | Health gates every conclusion; the trash is reported rather than indexed, and retention is opt-in. |
| `0028-scheduled-reconciliation.md`  | `P1-20`         | Scheduled reconciliation               | Active     | #62   | #63          | Takes the job-queue seam; the schedule comes from the environment and is off by default.           |
| `0013-fork-runnable-ci.md`          | `P0-14`         | Runnable inherited validation          | Done       | #30   | #31          | Degrades three upstream-only jobs; unblocks every fork pull request from queueing forever.         |

## Promotable work with accepted decisions and no Issue yet

These items are defined by an accepted ADR and may be promoted without further design work. They intentionally have no Issue until they are started.

| Backlog ID | Title                           | Decided by | Notes                                                                                |
| ---------- | ------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `P0-13`    | Fork-owned publication workflow | ADR 0010   | Edits inherited `docker.yml`; must record the new seam in the inventory.             |
| `P1-06`    | Reconciliation                  | ADR 0007   | Also owns orphaned trash records and retention, which `P1-12` deliberately left out. |

## Foundation records without implementation task files

| Backlog ID | Record                              | Status | Pull request | Notes                                                                     |
| ---------- | ----------------------------------- | ------ | ------------ | ------------------------------------------------------------------------- |
| `P0-01`    | Product and architecture foundation | Done   | #1           | Established vision, roadmap, architecture, ADRs, and initial task policy. |

## Next recommended sequence

1. `P1-06` reconciliation is in review. Next after it: `P1-04` gave it the tables, the recorded volume identity and the marker to check them against, and it is what makes the index complete rather than only current: content that predates the index, and the descendants of a restored folder, are unindexed until the scan runs. The trash also has orphans only reconciliation can clear.
2. Take `P1-07` authorization before the shared volume carries anything worth protecting.
3. Run `P0-13` before publishing anything, so no build can push under an upstream name.
