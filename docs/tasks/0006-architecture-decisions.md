# Task 0006: Record staged storage, index, and client architecture decisions

## Tracking

- Stable backlog ID: `P0-11`
- GitHub Issue: [#17 — Record staged storage, index, and client architecture decisions](https://github.com/lor08/immich-drive/issues/17)
- Foundation: [PR #1](https://github.com/lor08/immich-drive/pull/1), [PR #14](https://github.com/lor08/immich-drive/pull/14)

This versioned file is the source of truth for stable scope, constraints, and acceptance criteria. GitHub Issue #17 is the live execution log.

## Status

Implementation in progress.

## Goal

Turn the decisions taken during the staged design review into accepted ADRs and align the delivery plan, roadmap, and file-storage architecture with them. Each decision changes sequencing or schema and becomes expensive to reverse once implementation starts.

## Required reading

- `AGENTS.md`
- `docs/product/delivery-plan.md`
- `docs/architecture/overview.md`
- `docs/architecture/file-storage.md`
- `docs/adr/0002-transparent-filesystem-storage.md`
- `server/src/extensions/files/storage.adapter.ts`

## Decisions in scope

1. **Volume path model.** The API addresses content as a volume plus a relative path. Managed storage is a private tree per user plus named shared spaces. External directories become volumes rather than special cases.
2. **Deferred Drive-owned schema.** Browse and write stages run on the filesystem alone. Concurrency uses PostgreSQL advisory locks, which need no schema. The first `drive_` tables arrive with the index.
3. **Web-first clients.** Flutter file work waits until the API stabilizes. While the only client ships in the same image as the server, the file API is explicitly unstable.
4. **Reconciliation and mount health.** Reconciliation ships with the index, defaults to non-destructive behavior, and never treats an unhealthy volume as evidence of deletion.

## Scope

- Add `docs/adr/0004-volume-path-model.md`, `0005-defer-drive-database.md`, `0006-web-first-clients.md`, and `0007-reconciliation-and-mount-health.md`.
- Update `docs/product/delivery-plan.md` with the sequencing change, `P0-11`, `P0-12`, `P1-16`, and `P1-17`, and with the consequences that constrain existing Phase 1 tasks.
- Update `docs/architecture/file-storage.md` so the documented storage contract matches the implemented one and the layout describes volumes.
- Update `docs/product/roadmap.md` for the deferred schema and the web-first decision.
- Update `docs/tasks/index.md`.

## Constraints

- No existing stable backlog ID is renumbered; new work receives new identifiers.
- No runtime code, workflow, dependency, or generated artifact changes.
- Decisions accepted in ADR 0001 through 0003 are not reopened.

## Acceptance criteria

- [ ] Each of the four decisions has an ADR with context, decision, consequences, and rejected alternatives.
- [ ] The delivery plan no longer sequences Drive-owned schema before the filesystem-only slices.
- [ ] The documented `StorageAdapter` matches `server/src/extensions/files/storage.adapter.ts`.
- [ ] Trash-per-volume, cross-volume move rejection, and service-directory placement appear in both the ADR and the architecture document.
- [ ] The integration-seam measurement spike exists in the plan as promotable work.
- [ ] No existing stable backlog ID is renumbered.
- [ ] Relevant inherited checks pass.

## Non-goals

- Implementing volumes, shared spaces, the index, reconciliation, or the spike itself.
- Deciding the outcome of the spike in advance.
- Resolving migration architecture (`P0-04`) or release architecture (`P0-05`).

## Definition of done

A reviewer can read the ADRs alone and understand why the first stages carry no schema, how content is addressed, why the trash lives inside each volume, and what must be true before Flutter work starts.
