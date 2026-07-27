# Task 0003: Align agent workflow with inherited Immich automation

## Tracking

- GitHub Issue: pending
- Implementation PR: pending

This versioned file is the source of truth for scope, constraints, and acceptance criteria. The corresponding GitHub Issue is the live execution log.

## Status

Preparing implementation.

## Goal

Make automated agents follow the inherited Immich pull-request and GitHub Actions conventions instead of creating a parallel workflow that conflicts with repository automation.

## Findings

- Pull request descriptions must preserve and complete `.github/pull_request_template.md`; a repository automation closes non-compliant PRs and reopens them after correction.
- Pull request titles must follow Conventional Commit syntax.
- Every PR requires exactly one `changelog:*` label. Internal scaffolding, documentation, and CI-only work should normally use `changelog:skip`.
- GitHub Actions references should be pinned to full commit SHAs.
- `actions/checkout` should use `persist-credentials: false` unless a workflow intentionally pushes commits.
- Workflow permissions should default to empty or read-only and be expanded only per job.
- The inherited `Test` workflow successfully validates the repository after Actions are enabled, so the separate `Immich Drive CI` workflow is redundant.

## Scope

- Update `AGENTS.md` with PR-template, title, label, Actions security, and inherited-CI rules.
- Add a durable workflow policy document under `docs/architecture/`.
- Remove `.github/workflows/immich-drive-ci.yml`.
- Mark Task 0002 as superseded by inherited Immich CI.
- Do not edit inherited Immich workflow files in this task.

## Acceptance criteria

- [ ] Agents must use the exact PR template headings and complete all applicable fields.
- [ ] Agents must disclose LLM usage honestly in every PR.
- [ ] Agents must use Conventional Commit PR titles.
- [ ] Agents must apply exactly one `changelog:*` label before considering a PR ready.
- [ ] New or edited Actions must pin every external action to a full commit SHA.
- [ ] Checkout credentials must not persist unless write-back is explicitly required.
- [ ] Permissions must follow least privilege.
- [ ] The redundant `Immich Drive CI` workflow is removed.
- [ ] Inherited workflows remain untouched.

## Definition of done

Future agent-created pull requests follow the repository's automation without being auto-closed, and validation relies on inherited Immich workflows unless a documented fork-specific gap appears.