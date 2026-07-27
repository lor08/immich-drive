# Task 0001: Scaffold an isolated server-side file domain

## Tracking

- GitHub Issue: [#2 — Scaffold isolated server-side file domain](https://github.com/lor08/immich-drive/issues/2)
- Architecture bootstrap: [PR #1](https://github.com/lor08/immich-drive/pull/1)
- Implementation: [PR #3](https://github.com/lor08/immich-drive/pull/3)

This versioned file is the source of truth for scope, constraints, and acceptance criteria. GitHub Issue #2 is the live execution log for status, discussion, implementation decisions, pull requests, and validation results. Any material scope change must be reflected in both places.

## Status

In review in draft PR #3. The implementation branch was rebuilt on the current `main` after the repository automation policy was established, so inherited Immich checks can validate a clean diff.

## Goal

Create the smallest compile-safe server-side boundary for the Immich Drive file domain. This task is intentionally limited to architecture scaffolding and must not implement file persistence, database tables, API endpoints, uploads, streaming, external directories, exports, web UI, or Flutter UI.

## Required reading

- `AGENTS.md`
- `docs/architecture/overview.md`
- `docs/architecture/file-storage.md`
- `docs/adr/0001-separate-file-domain.md`
- `docs/adr/0002-transparent-filesystem-storage.md`

## Scope

Create an isolated feature boundary, provisionally under:

```text
server/src/extensions/files/
```

Add minimal types and contracts sufficient to establish the intended dependency direction. Suggested components:

```text
files.module.ts
file-domain.service.ts
storage.adapter.ts
file-entry.ts
```

Exact names may be adjusted to match current Immich server conventions after inspecting the repository.

The storage contract should represent capabilities without importing Node filesystem APIs into the domain service. It may include type signatures for operations such as stat, list, open, write, move, copy, and delete, but implementations are out of scope.

Register the new module only if registration is necessary for the project to compile and test. Keep any upstream-owned integration diff minimal and explain it in the pull request.

## Acceptance criteria

- [x] New code is isolated from Immich asset entities, repositories, services, jobs, and album permissions.
- [x] No existing migration is changed and no new migration is added.
- [x] No API route or OpenAPI schema is added.
- [x] No physical filesystem operation is implemented.
- [x] No production dependency is added.
- [x] The file-domain service depends on an abstract storage contract, not `node:fs`.
- [x] Unit tests verify the basic service boundary or contract behavior without touching the real filesystem.
- [ ] Relevant inherited server formatting, linting, type checking, and tests pass.
- [x] The pull request lists every modified upstream-owned file and explains why the edit is necessary.

## Non-goals

- `FileEntry` database entity or repository
- uploads and downloads
- folder CRUD
- HTTP ranges or signed playback URLs
- external directories
- Jellyfin or Plex exports
- web navigation
- Flutter changes

## Codex instructions

1. Inspect current Immich server module, dependency-injection, testing, and repository conventions before writing code.
2. Prefer adapting this task's provisional structure to established repository patterns rather than introducing a parallel framework.
3. Keep the patch small and reversible.
4. Do not refactor unrelated Immich code.
5. Open a draft pull request and include commands and results for all validation performed.

## Definition of done

A reviewer can see a clean, tested extension boundary and approve the dependency direction before storage or database implementation begins.
