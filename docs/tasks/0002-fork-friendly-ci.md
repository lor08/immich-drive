# Task 0002: Add fork-friendly server CI

## Tracking

- GitHub Issue: [#4 — Add fork-friendly server CI](https://github.com/lor08/immich-drive/issues/4)
- Implementation PR: pending

This versioned file is the source of truth for scope, constraints, and acceptance criteria. GitHub Issue #4 is the live execution log for status, discussion, implementation decisions, pull requests, and validation results.

## Status

Ready for implementation.

## Goal

Add a minimal GitHub Actions workflow for Immich Drive that validates server-side extension changes on standard GitHub-hosted runners without depending on upstream Immich secrets, GitHub Apps, or custom runners.

## Context

The inherited upstream `test.yml` creates a token using the upstream-only `PUSH_O_MATIC_APP_CLIENT_ID` and `PUSH_O_MATIC_APP_KEY` secrets. Some inherited jobs also use custom runners. Those dependencies are appropriate for `immich-app/immich`, but they are not portable to this fork.

## Scope

Create `.github/workflows/immich-drive-ci.yml` with:

- `pull_request`, `push` to `main`, and `workflow_dispatch` triggers;
- path filtering for server changes and the workflow itself;
- read-only repository permissions;
- Node `24.15.0` and pnpm `11.13.1`;
- installation of the server workspace and required plugin workspaces;
- server formatting, linting, TypeScript checking, and unit tests;
- no deployment, publishing, container builds, or secrets.

## Acceptance criteria

- [ ] Workflow runs on a pull request that changes `server/**`.
- [ ] Workflow runs on pushes to `main` and supports manual dispatch.
- [ ] Workflow uses only GitHub-hosted runners.
- [ ] Workflow does not require repository secrets.
- [ ] Workflow permissions are limited to `contents: read`.
- [ ] Server formatter, linter, type checker, and unit tests run.
- [ ] Upstream workflow files are not modified.

## Non-goals

- replacing or editing upstream Immich workflows;
- Docker image builds;
- mobile, web, machine-learning, CLI, or end-to-end test coverage;
- release or deployment automation;
- caching optimization.

## Definition of done

The fork can validate Immich Drive server changes independently from upstream infrastructure.
