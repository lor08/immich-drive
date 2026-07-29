# Immich Drive delivery plan

This document is the durable product backlog for Immich Drive. It translates the outcome-oriented roadmap into ordered, reviewable capabilities while keeping future work independent from GitHub Issue numbering.

## How to use this plan

- Each backlog item has a stable identifier such as `P1-04`.
- Phase identifiers (`P0` through `P7`) describe product sequencing, not release versions.
- Cross-cutting identifiers (`X-01` and later) apply across multiple phases.
- `docs/tasks/index.md` records promoted tasks, their task files, Issues, pull requests, and current status.
- A detailed task file and GitHub Issue are created only when work is ready, active, blocked, or needed for an architectural decision.
- Backlog items remain here until promotion. Placeholder Issues are not created merely to reserve work.

## Status vocabulary

- **Done** — merged and validated.
- **Active** — implementation or review is in progress.
- **Ready** — sufficiently defined to promote into a detailed task.
- **Blocked** — cannot proceed until a named dependency is resolved.
- **Backlog** — intentionally not promoted yet.
- **Superseded** — replaced by another decision or task.

## Delivery principles

- Preserve upstream Immich behavior and keep upstream synchronization inexpensive.
- Keep arbitrary files separate from Immich `Asset` semantics.
- Keep ordinary file bytes and names readable on disk.
- Add the smallest reversible integration seam in each pull request.
- Treat migration, release engineering, security, backups, observability, and repair tooling as product requirements rather than late cleanup.
- Defer irreversible commitments — database schema, published artifacts, signed clients, frozen API contracts — until the capability that needs them is being built.
- Do not call a phase complete until its exit gate is demonstrated by automated tests and a documented operator workflow.

## Phase 0 — Foundation and operability

Goal: establish architectural, contributor, migration, release, and upstream-sync boundaries before production data depends on the fork.

### Tasks

- **P0-01 — Product and architecture foundation — Done.** Product vision, roadmap, architecture, ADRs, task policy, and agent guardrails. Delivered by PR #1.
- **P0-02 — Repository automation and agent policy — Done.** Align contribution flow with inherited Immich checks and prevent unsafe CI duplication. Delivered by PR #7.
- **P0-03 — Complete staged delivery backlog — Active.** Maintain this plan, the task index, and duplicate-prevention rules. Tracked by Issue #13.
- **P0-04 — Migration architecture — Accepted, implementation deferred to P1-04.** [ADR 0009](../adr/0009-in-place-opt-in-migration.md) makes migration an in-place image swap with the file domain opt-in, supports exactly the upstream release each Drive release is based on, and publishes the rollback boundary. Implementation begins when Drive-owned schema exists. Tracked by Issue #9.
- **P0-05 — Release and publication architecture — Accepted, implementation split out as P0-13.** [ADR 0010](../adr/0010-fork-owned-release.md) makes GHCR the only registry, renames the server image to `immich-drive-server`, drops the fork-built machine-learning image, and restricts publication to published releases. Tracked by Issue #11.
- **P0-15 — Offline Dart template generation — Done.** Generate from the committed mustache templates instead of re-downloading them on every run, after a fetch failure broke a required check with no fault in the code. Delivered by PR #50.
- **P0-16 — Diagnosable e2e stack startup — Active.** The refused connections turned out to be a registry rate limit that stopped the stack from starting at all, not a database race; the suites then ran anyway and buried the real message. Retry startup, and stop the suites running when it did not start. Tracked by Issue #49.
- **P0-14 — Runnable inherited validation — Done.** Three inherited jobs depend on the upstream `mich` runner or a DCM licence; `Lint Web` and the Android build queue forever, and Dart analysis fails before it starts. Degraded behind `github.repository_owner`, keeping the free analysis and moving web linting to a hosted runner. Delivered by PR #31.
- **P0-13 — Fork-owned publication workflow — Ready.** Implement the changes ADR 0010 authorizes in the inherited `docker.yml`: image rename, constant `dockerhub-push: false`, publication only on release, and disabled machine-learning jobs. Also enumerate what the fork has already published to GHCR and record the edited workflow in the seam inventory.
- **P0-06 — Upstream synchronization workflow — Backlog.** Define upstream remote policy, scheduled divergence reports, conflict classification, sync branches, regression gates, and release rebasing rules.
- **P0-07 — Supported-version and release-train policy — Blocked by P0-04, P0-05, and P0-06.** Define which upstream versions each Immich Drive release is based on and how long migration sources remain supported.
- **P0-08 — Reproducible development and demo environment — Backlog.** Provide a fork-owned Compose example, seeded test data, local storage root, mail/testing defaults, and documented reset procedure. Must cover the full API-generation toolchain, including Java, because `P0-12` showed that an API change cannot be completed without regenerating the Dart client.
- **P0-09 — Security threat model — Backlog.** Model filesystem, API, signed URL, sharing, external mount, export, supply-chain, and administrative threats before write APIs are production-ready.
- **P0-10 — Licensing, attribution, and branding review — Backlog.** Record fork naming, notices, distribution obligations, third-party assets, and application identifiers before public releases.
- **P0-11 — Storage, index, and client architecture decisions — Active.** Record the volume path model, the deferred Drive-owned schema, the web-first client strategy, and the reconciliation and mount-health rules as ADRs, and align the plan with them. Tracked by Issue #17.
- **P0-12 — Integration seam measurement spike — Done.** Measured six upstream-owned files, twenty added lines, five of six purely additive. [ADR 0008](../adr/0008-in-process-file-module.md) keeps the file domain in-process; [integration seams](../architecture/integration-seams.md) is the maintained inventory. Tracked by Issue #19.

### Exit gate

- A new contributor can build and test the fork.
- Migration and release strategies have accepted architecture documents.
- Upstream divergence can be measured and synchronized through a documented process.
- No workflow can accidentally publish to an upstream or third-party namespace.

## Phase 1 — File storage core

Goal: provide a secure, user-owned file domain with transparent local storage, metadata, APIs, and recovery behavior.

Sequencing note: browse and write capabilities are delivered on the filesystem alone. `P1-04` and `P1-05` follow `P1-08`, `P1-09`, and `P1-10` rather than preceding them, because no Drive-owned table exists until the index; see [ADR 0005](../adr/0005-defer-drive-database.md). Stable identifiers, the index, and reconciliation land together.

### Tasks

- **P1-01 — Isolated file-domain scaffold — Done.** `FileEntry`, `StorageAdapter`, `FileDomainService`, and module boundary. Delivered by PR #3.
- **P1-02 — Secure read-only local adapter — Active.** Descriptor-safe `stat`, `list`, and ranged `open` with traversal, symlink, root replacement, and race protection. Tracked by Issue #8 and PR #10.
- **P1-03 — Storage-root configuration and validation — Done.** Add configuration, startup validation, non-overlap checks against Immich upload/library paths, mount readiness, permissions checks, and operator-facing errors. The domain is opt-in: with `IMMICH_DRIVE_ROOT` unset the server behaves exactly like upstream Immich. Delivered by PR #23.
- **P1-04 — Drive-owned database schema — Backlog, sequenced after P1-08 through P1-10.** Define volumes, file identities, hierarchy, ownership, lifecycle state, checksums, reconciliation state, and indexes using fork-owned `drive_`-prefixed migrations. Includes migrating trash manifests written by the filesystem-only stages.
- **P1-05 — File metadata repository — Backlog, sequenced after P1-04.** Implement persistence contracts without coupling storage adapters to PostgreSQL or upstream asset repositories.
- **P1-06 — Initial scan and reconciliation engine — Backlog, delivered together with P1-04.** Index existing files, detect additions/removals/renames, recover from interruptions, and report conflicts without deleting unknown data. Volume health gates every removal; see [ADR 0007](../adr/0007-reconciliation-and-mount-health.md).
- **P1-07 — Ownership and authorization model — Backlog.** Define owner, administrator, service, and future share permissions; centralize checks for every file operation. Drive permissions use the `file.*` namespace, since `Permission` already contains an upstream `FolderRead`.
- **P1-08 — Volume discovery and module registration — Done.** One authenticated endpoint listing the caller's volumes, plus the module registration that serves it. This is the first upstream seam the fork takes on, recorded in the seam inventory. Delivered by PR #29.
- **P1-18 — Folder listing API — Done.** Lists folder contents and maps domain errors onto status codes a client can act on. Delivered by PR #33.
- **P1-19 — Folder creation API — Done.** Descriptor-relative, non-recursive directory creation under the path lock, with conflicts reported as `409`. Delivered by PR #43.
- **P1-09 — Atomic upload pipeline — Done.** Streams into the volume's staging directory, fsyncs, renames into place, and cleans up on every failure path. Size limits wait for `P7-03`; resumable transfer waits for `P3-01`. Delivered by PR #45.
- **P1-10 — Authenticated download API — Done.** Streams whole files from the adapter rather than by host path, with a separate `file.download` permission and an unconditional octet-stream type. Ranges stay with `P3-03`. Delivered by PR #39.
- **P1-11 — Rename, move, and copy semantics — Done.** `POST /files/move` covers rename and move through `rename(2)`; `POST /files/copy` copies one file through the staged write. Two paths mean two locks, acquired in key order so a symmetric pair queues instead of deadlocking. An occupied target is a conflict with no overwrite flag, directory copy waits on a background job, and a cross-volume move is not expressible because the request names one volume. Delivered by PR #53.
- **P1-12 — Trash, restore, and permanent deletion — Backlog.** Soft delete moves content into the trash directory of the same volume with a sidecar manifest, so deletion never becomes a cross-filesystem copy. Define retention, restore collisions, administrator purge, and reconciliation.
- **P1-13 — Checksums and integrity state — Backlog.** Add incremental hashing, corruption detection, duplicate hints, and repair status without blocking ordinary file access.
- **P1-14 — Audit and operational events — Backlog.** Record security-relevant mutations, reconciliation failures, storage health, and administrative actions.
- **P1-15 — Core integration and security tests — Backlog.** Prove cross-user isolation, path safety, interrupted-write recovery, database/filesystem consistency, and normal filesystem readability.
- **P1-16 — Volume and path namespace model — Done.** Implement the volume abstraction from [ADR 0004](../adr/0004-volume-path-model.md): a private volume per user, one configuration-defined shared space, service directories outside the browsable tree, per-volume root identity, and an API addressed by volume plus relative path. The registry is configuration-driven until `P1-04` moves it into the schema. Delivered by PR #27.
- **P1-17 — Concurrency primitives — Done.** PostgreSQL advisory locking keyed by normalised volume and path, in the two-argument lock space so it cannot collide with Immich's own keys. Delivered by PR #41.

### Exit gate

- A user can create folders, upload, list, download, rename, move, trash, restore, and permanently delete files through authenticated APIs.
- One user cannot access another user's files.
- Data remains understandable on disk without the database.
- A reconciliation run can explain and repair common database/filesystem drift without destructive guessing.
- A tested upgrade from a supported upstream Immich fixture preserves all existing Immich data.

## Phase 2 — First web vertical slice

Goal: make the Phase 1 capabilities usable through the existing Immich web application without destabilizing photo workflows.

### Tasks

- **P2-01 — Web integration seam and Files navigation — Done.** Isolated route and feature directory, navigation entry gated on a new server feature flag so a disabled deployment looks untouched, and the web seams the `P0-12` spike predicted. Delivered by PR #35.
- **P2-02 — Folder browser — Done.** Breadcrumbs, folder navigation, empty and error states, with only folders interactive until a download endpoint exists. Sorting, pagination, and selection stay out until there is content that needs them. Delivered by PR #37.
- **P2-03 — Upload queue — Partially delivered, remainder Backlog.** A single-file picker upload landed with `P2-01`'s successor task; drag-and-drop, progress, cancellation, retry, and background state remain. Tracked by Issue #46 for the delivered part.
- **P2-04 — File and folder actions — Partially delivered, remainder Backlog.** Create folder and download landed; trash, restore, and permanent delete still wait on their endpoints, while rename, move, and copy are now unblocked by `P1-11`. Tracked by Issue #46 for the delivered part.
- **P2-05 — Baseline previews — Backlog.** Provide safe image, text, PDF, audio, and video previews where browsers support them without introducing premature transcoding.
- **P2-06 — Storage and health administration UI — Backlog.** Display configured roots, capacity, permissions, scan state, mount health, and actionable errors.
- **P2-07 — Accessibility and responsive behavior — Backlog.** Keyboard navigation, focus management, screen-reader labels, mobile layouts, and large-list usability.
- **P2-08 — Web end-to-end coverage — Backlog.** Cover navigation, upload, mutations, authorization failures, refresh/recovery, and coexistence with existing Immich views.

### Exit gate

- A user can complete ordinary file management without host filesystem access.
- Existing Immich photo and video flows still pass upstream regression tests.
- The Files UI works with keyboard navigation and narrow screens.
- Operator-visible storage failures provide actionable remediation.

## Phase 3 — Large files, previews, and media playback

Goal: support production-scale transfers and direct playback without downloading whole files.

### Tasks

- **P3-01 — Resumable upload protocol — Backlog.** Define upload sessions, chunk validation, idempotency, expiration, parallelism, and finalization.
- **P3-02 — Transfer persistence and recovery — Backlog.** Resume after browser/server restarts, garbage-collect abandoned sessions, and expose reliable progress.
- **P3-03 — HTTP range contract — Backlog.** Implement and test single-range parsing, unsatisfied ranges, `206`, `416`, `Content-Range`, and `Accept-Ranges`.
- **P3-04 — Streaming endpoint — Backlog.** Stream verified file handles with backpressure, cancellation, authorization, range support, and no full buffering.
- **P3-05 — Short-lived signed playback URLs — Backlog.** Scope tokens to one resource, operation, expiry, and optional client context; prevent session-token disclosure and replay abuse.
- **P3-06 — MIME and content-disposition policy — Backlog.** Use safe detection, filename encoding, inline/attachment rules, and browser-sniffing protections.
- **P3-07 — External player integration — Backlog.** Generate copy/open actions for VLC and platform handlers while preserving expiry and authorization.
- **P3-08 — Preview job domain — Backlog.** Create file-domain preview jobs and storage separate from upstream Asset jobs; define cleanup and regeneration.
- **P3-09 — Media and transfer performance suite — Backlog.** Test multi-gigabyte files, seek latency, concurrent streams, cancellation, memory bounds, and slow clients.

### Exit gate

- VLC can start and seek through a large remote video.
- Large uploads resume after interruption without corrupting final files.
- Streaming memory stays bounded under concurrent load.
- Signed URLs expire and cannot access a different resource.

## Phase 4 — External directories

Goal: expose existing directories without moving or duplicating their contents.

### Tasks

- **P4-01 — External source model — Backlog.** Define source identity, mount path, display name, mode, ownership, include/exclude policy, and lifecycle.
- **P4-02 — Mount preflight and health — Backlog.** Validate existence, permissions, filesystem identity, overlap, disappearance, read-only state, and capacity.
- **P4-03 — Initial scan and scheduled reconciliation — Backlog.** Index large trees incrementally, checkpoint progress, handle unavailable mounts, and avoid destructive assumptions.
- **P4-04 — Filesystem watcher optimization — Backlog.** Add watcher-based hints with overflow recovery; scheduled reconciliation remains authoritative.
- **P4-05 — Read-only external directory access — Backlog.** Browse, preview, download, stream, search, and share within explicit authorization.
- **P4-06 — Read-write external semantics — Backlog.** Define mutations, ownership expectations, collision handling, external changes, and rollback limits.
- **P4-07 — Conflict and offline behavior — Backlog.** Surface moved/deleted/changed files, stale metadata, mount outages, and operator resolution.
- **P4-08 — External source administration UI — Backlog.** Add, validate, scan, pause, rescan, remove, and inspect health.
- **P4-09 — External-directory integration tests — Backlog.** Cover read-only enforcement, unavailable mounts, symlink boundaries, watcher overflow, and reconciliation.

### Exit gate

- An existing media directory appears without copying files.
- Read-only sources cannot be mutated through any API.
- Unavailable mounts do not cause metadata or file deletion.
- Reconciliation recovers after missed watcher events.

## Phase 5 — Stable filesystem exports

Goal: expose selected real folders to Jellyfin, Plex, and similar consumers through predictable read-only paths.

### Tasks

- **P5-01 — Export definition model — Backlog.** Define source folder, export name, target path, mode, health, and ownership.
- **P5-02 — Stable export layout — Backlog.** Choose bind-mount, directory, link, or materialization strategy that preserves real filenames and survives restarts.
- **P5-03 — Read-only enforcement — Backlog.** Make read-only the default and document the boundary between application permissions and host mount permissions.
- **P5-04 — Export reconciliation and health — Backlog.** Detect broken sources, stale links, collisions, unavailable mounts, and partial updates.
- **P5-05 — Jellyfin integration guide — Backlog.** Provide Compose mounts, permissions, scanning behavior, and troubleshooting.
- **P5-06 — Plex integration guide — Backlog.** Provide equivalent configuration and platform-specific notes.
- **P5-07 — Export security and durability tests — Backlog.** Verify no path escape, no temporary target paths, stable restart behavior, and read-only operation.

### Exit gate

- Jellyfin and Plex can index an exported folder through a stable read-only mount.
- Export paths remain stable across application restarts and upgrades.
- A broken source is reported without silently exposing another directory.
- Smart or virtual exports remain out of the first implementation.

## Phase 6 — Flutter, Android TV, and desktop clients

Goal: provide file access and transfer workflows in the existing Flutter application and supported platforms.

Sequencing note: this entire phase is deferred until the file API has stabilized after the index. The web application is the only client until then, which is what makes the API changes in Phase 1 free; see [ADR 0006](../adr/0006-web-first-clients.md). The phase begins by freezing the contract and generating the Dart client.

### Tasks

- **P6-01 — Generated API and shared client contracts — Backlog.** Keep web and Flutter clients aligned with OpenAPI and signed URL rules.
- **P6-02 — Flutter file browser — Backlog.** Roots, folders, sorting, selection, breadcrumbs, errors, and refresh.
- **P6-03 — Mobile transfer manager — Backlog.** Upload/download queues, resumable transfers, background execution, retry, and notifications.
- **P6-04 — Offline cache — Backlog.** Explicit downloads, eviction, integrity, stale-version handling, and storage limits.
- **P6-05 — Share and open actions — Backlog.** Native share sheets, external apps, safe temporary files, and signed URL usage.
- **P6-06 — Android Storage Access Framework — Backlog.** Import/export through user-selected providers and directories without broad storage permissions.
- **P6-07 — Android TV experience — Backlog.** D-pad navigation, focus behavior, media-first layout, and external player handoff.
- **P6-08 — Desktop adaptations — Backlog.** Windowed layout, drag-and-drop, filesystem dialogs, and platform integration where Flutter support is reliable.
- **P6-09 — Android signing and distribution — Blocked by P0-05.** Fork-owned application ID, signing key, GitHub artifacts, and optional Google Play delivery.
- **P6-10 — iOS signing and TestFlight — Blocked by P0-05.** Fork-owned bundle ID, certificates, App Store Connect secrets, protected environments, and release lanes.
- **P6-11 — Client integration tests — Backlog.** API compatibility, transfer interruption, offline behavior, intents, TV navigation, and release-build smoke tests.

### Exit gate

- Android and iOS users can browse, transfer, cache, share, and open files.
- Android TV can navigate and start media with a remote.
- Client builds use fork-owned identifiers and signing identities.
- Release artifacts are reproducible and traceable to one source commit.

## Phase 7 — Cloud features

Goal: add collaboration, organization, search, and governance after the storage core is proven.

### Tasks

- **P7-01 — Sharing and permission model extension — Backlog.** Users, groups, roles, inheritance, revocation, and audit behavior.
- **P7-02 — Public shared links — Backlog.** Expiry, optional passwords, download/preview permissions, rate limits, revocation, and abuse controls.
- **P7-03 — Quotas and capacity policies — Backlog.** Per-user/root quotas, reserved space, upload admission, reporting, and administrator overrides.
- **P7-04 — File versions — Backlog.** Version identity, retention, restore, storage accounting, conflict behavior, and cleanup.
- **P7-05 — Search and indexing — Backlog.** Filename, metadata, content extraction where safe, incremental indexing, permissions filtering, and repair.
- **P7-06 — Expanded previews — Backlog.** Office/document formats, archives, media metadata, thumbnails, sandboxing, and resource limits.
- **P7-07 — Favorites, recent files, and activity — Backlog.** User views, event semantics, privacy, retention, and pagination.
- **P7-08 — WebDAV compatibility decision — Backlog.** ADR based on real client demand, security cost, locking semantics, and maintenance burden.
- **P7-09 — Administration and governance — Backlog.** Audit search, retention policies, disabled users, ownership transfer, and operational reporting.
- **P7-10 — Scale-out and high availability — Backlog.** Shared storage assumptions, distributed jobs, locks, cache invalidation, and multi-instance reconciliation.

### Exit gate

- Sharing, quotas, versions, and search enforce the same authorization model as core file access.
- Administrative actions are auditable and reversible where promised.
- Optional compatibility protocols are added only through accepted ADRs and maintenance commitments.

## Cross-cutting tracks

These tasks may be promoted whenever their dependency becomes relevant.

- **X-01 — Upstream sync and divergence reporting.** Automate fetch/compare, classify conflicts, and retain a compatibility baseline.
- **X-02 — Migration, preflight, backup, and rollback.** Own Issue #9 and all later migration tooling and fixtures.
- **X-03 — Release, registry, signing, and rollback.** Own Issue #11 and fork-controlled distribution.
- **X-04 — Backup and disaster recovery.** Database, file roots, external-source metadata, export definitions, restore ordering, and restore drills.
- **X-05 — Observability and support bundles.** Metrics, logs, health endpoints, trace identifiers, redaction, diagnostics, and operator exports.
- **X-06 — Security assurance.** Threat model, dependency scanning, fuzzing for paths/ranges, authorization tests, secret handling, and disclosure process.
- **X-07 — Performance and capacity testing.** Large libraries, deep trees, millions of metadata rows, concurrent transfers, and low-memory deployments.
- **X-08 — Documentation and operator experience.** Installation, upgrade, storage layout, troubleshooting, release notes, and recovery runbooks.
- **X-09 — Integrity, repair, and reconciliation.** Explain drift, dry-run repairs, checkpoints, idempotency, and non-destructive defaults, as decided in [ADR 0007](../adr/0007-reconciliation-and-mount-health.md).
- **X-10 — Compatibility matrix.** Upstream versions, PostgreSQL versions, architectures, filesystems, browsers, mobile OS versions, and external players.
- **X-11 — Privacy and telemetry policy.** Default data collection, diagnostics consent, redaction, crash reporting, and external service use.
- **X-12 — Dependency, licensing, and branding governance.** Review new dependencies, notices, application identifiers, and distribution assets.

## Promotion and sequencing rules

1. Finish or explicitly block the active task before starting another task in the same narrow capability.
2. Promote tasks from the current phase first; promote next-phase work only when it removes a known blocker.
3. Architecture tasks may run ahead when they prevent irreversible schema, migration, security, or release mistakes.
4. Before creating a task file or Issue, search `docs/tasks/index.md`, open and closed Issues, pull requests, and branches for the stable backlog ID and equivalent wording.
5. One stable backlog ID may have only one active Issue and one active implementation PR.
6. A task file receives the next chronological `docs/tasks/NNNN-*.md` number when promoted; the stable phase ID does not change.
7. Material scope changes update this plan, the detailed task file, and the Issue.
8. Phase exit gates are evidence-based. A checklist is not sufficient without automated validation and a documented operator flow.
