# GitHub workflow policy

Immich Drive inherits Immich's repository automation and should follow it rather than maintain a parallel CI system unless a documented fork-specific gap exists.

## Pull request contract

Every pull request created by an automated agent must:

1. use a Conventional Commit title such as `feat(files): add storage adapter`;
2. preserve the headings and checklist from `.github/pull_request_template.md`;
3. include `Fixes #<issue>` or explain why no issue is closed;
4. describe validation honestly, leaving checks unchecked until they pass;
5. disclose the degree of LLM use;
6. carry exactly one `changelog:*` label before it is considered ready for review.

Use `changelog:skip` for internal scaffolding, documentation, CI, refactoring, and other changes that should not appear in a user-facing release changelog. Choose another existing changelog label only when the change has a user-facing release impact.

Repository automation may close a pull request whose description does not match the template and reopen it after the body is corrected. Agents must not manually fight this automation; they must correct the PR body first.

## Inherited validation

The inherited workflows are the default source of truth:

- `Test` — path-filtered unit tests, formatting, linting, and type checks across server, web, CLI, mobile, scripts, ML, and E2E areas;
- `Static Code Analysis` — generated-file checks and mobile analysis;
- `CodeQL` — JavaScript and Python security scanning;
- `Zizmor` — GitHub Actions security policy;
- `PR Conventional Commit` — PR title validation;
- `Check OpenAPI` — breaking API and mobile patch checks;
- `Docker` — container builds and publishing paths;
- `Build Mobile` — Android/iOS build and artifact flows;
- `Docs build` — documentation formatting and build;
- `CLI Build` — CLI packaging and container build;
- `Weblate checks` — translation lock enforcement;
- `Preview label` — preview environment lifecycle;
- `Fix formatting` — opt-in formatting write-back when labeled;
- `Cache Cleanup` — removes PR caches after closure.

Some inherited workflows reference Immich-only secrets, reusable workflows, or custom runners. Those implementation details should not be copied into new Immich Drive workflows. When an inherited workflow is skipped or cannot run in the fork, document the gap before adding a replacement.

## Actions security rules

For every new or edited workflow:

- pin third-party actions and reusable workflows to full commit SHAs; version tags such as `@v4` are not sufficient;
- add a human-readable version comment after the SHA;
- set top-level `permissions: {}` or the minimum read-only permission;
- grant additional permissions only on the job that needs them;
- set `persist-credentials: false` on `actions/checkout` unless the workflow intentionally writes commits;
- do not pass secrets to pull requests from forks;
- prefer `ubuntu-latest` unless a platform-specific or documented custom runner is required;
- use concurrency cancellation for superseded PR runs when appropriate;
- never add deployment, package publishing, or repository write permissions to a validation-only workflow.

## Agent behavior

Before opening a PR, an agent must inspect:

- `.github/pull_request_template.md`;
- `CONTRIBUTING.md`;
- the relevant workflow path filters;
- `AGENTS.md`;
- the task file and linked issue.

Before merge, the agent must confirm:

- the PR remains open and mergeable;
- exactly one changelog label is present;
- all applicable inherited checks have finished successfully or an explicit exception is documented;
- no unresolved security or review findings remain;
- the PR description still matches the repository template.
