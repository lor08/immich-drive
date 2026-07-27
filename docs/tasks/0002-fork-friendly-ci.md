# Task 0002: Add fork-friendly server CI

## Tracking

- GitHub Issue: [#4 — Add fork-friendly server CI](https://github.com/lor08/immich-drive/issues/4)
- Implementation PR: [#5 — ci: add fork-friendly server validation](https://github.com/lor08/immich-drive/pull/5)
- Superseded by: [Task 0003](0003-github-workflow-policy.md) and [Issue #6](https://github.com/lor08/immich-drive/issues/6)

This versioned file preserves the decision history. Task 0003 is the active source of truth for GitHub workflow policy.

## Status

Superseded.

PR #5 added `.github/workflows/immich-drive-ci.yml`, but subsequent validation showed that:

- the inherited Immich `Test` workflow runs successfully in this fork after GitHub Actions are enabled;
- the custom workflow duplicated inherited server validation;
- the custom plugin build sequence failed while the inherited workflow passed;
- Zizmor reported unpinned action references and persisted checkout credentials;
- maintaining a parallel CI workflow would create unnecessary drift from upstream.

The custom workflow is removed by Task 0003. Future validation should use inherited Immich workflows unless a specific, documented fork-only gap is demonstrated.

## Original goal

Add a minimal GitHub Actions workflow for Immich Drive that validates server-side extension changes on standard GitHub-hosted runners without depending on upstream Immich secrets, GitHub Apps, or custom runners.

## Decision

Do not maintain a separate general-purpose server CI workflow.

Instead:

- preserve inherited Immich workflow files;
- follow their commands, path filters, PR rules, and security conventions;
- verify whether applicable inherited jobs actually work in the fork before adding replacements;
- document any confirmed fork-only gap as a separate Issue and task;
- make any replacement narrowly scoped to that gap.

## Definition of done

The historical experiment is documented, the redundant workflow is removed, and agents use the inherited workflow policy defined by Task 0003.
