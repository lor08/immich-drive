# Task 0013: Make inherited validation runnable in the fork

## Tracking

- Stable backlog ID: `P0-14`
- GitHub Issue: [#30 — Make inherited validation runnable in the fork](https://github.com/lor08/immich-drive/issues/30)
- Policy: [GitHub workflow policy](../architecture/github-workflow-policy.md) and `AGENTS.md`

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #30 is the live execution log.

## Status

Done. Merged in PR #31, and proven on that pull request itself: editing a workflow forces every path filter on, so all three jobs ran. `Lint Web` passed on a hosted runner, Dart analysis passed without the licensed step, and the Android build was skipped instead of queueing.

## Problem

Three inherited jobs depend on infrastructure only `immich-app/immich` has. PR #29 was the first to trigger all three.

| Job                      | Workflow              | Dependency                     | Behaviour in the fork  |
| ------------------------ | --------------------- | ------------------------------ | ---------------------- |
| `Lint Web`               | `test.yml`            | runner label `mich`            | queued forever         |
| `Build and sign Android` | `build-mobile.yml`    | `mich` runner, signing secrets | queued forever         |
| `Run Dart Code Analysis` | `static_analysis.yml` | DCM licence                    | fails before analysing |

A queued job is worse than a failing one. It never resolves, so the pre-merge condition in `AGENTS.md` that all applicable checks completed can never be met.

`Lint Web` is the one that matters most, and it is easy to misfile as a mobile problem. It is not: it triggers on web and `packages/sdk` changes, so it would block all of Phase 2.

## Decision

Degrade rather than disable, gated on `github.repository_owner == 'immich-app'`.

That predicate was chosen over alternatives — deleting the jobs, adding fork-only workflows, or testing for secret presence — because it keeps each edit to one line, states its own reason, leaves upstream behaviour untouched, produces a textual rather than semantic conflict on upstream synchronisation, and is correct for any fork instead of just this one.

- **`Lint Web`** selects a GitHub-hosted runner outside upstream. It is an eslint run and needs nothing special, so the check survives intact.
- **`Run Dart Code Analysis`** runs `mise //mobile:analyze:dart` outside upstream, keeping the free `dart analyze --fatal-infos` and skipping only the licensed DCM step. Previously the fork lost both.
- **`Build and sign Android`** is skipped outside upstream. It needs the runner and signing identities, and Flutter is deferred by ADR 0006. It returns with `P6-09`.

## Justification for editing inherited workflows

`AGENTS.md` permits editing an inherited workflow given an explicit task and justification; this is that task, following the precedent set by ADR 0010 for `P0-13`. The edits are confined to runner selection and job conditions. No validation logic changes, no permissions widen, and no parallel workflow is introduced — which is what Task 0002 rejected.

## Scope

```text
.github/workflows/test.yml             Lint Web runner selection
.github/workflows/build-mobile.yml     Android job condition
.github/workflows/static_analysis.yml  Dart analysis without DCM
```

The seam inventory entries for these three files are added by PR #29 rather than here, because that pull request is already editing the same document and is blocked on this one. Recording them in both would guarantee a conflict.

## Acceptance criteria

- [x] No inherited job can queue forever in this fork.
- [x] `Lint Web` produces a real result on web and SDK changes.
- [x] Dart analysis still runs, minus the licensed portion.
- [x] The Android job is skipped rather than failing, with its reason in the workflow.
- [ ] Upstream behaviour is unchanged when these workflows run in `immich-app/immich`.
- [x] Zizmor and the other inherited checks pass.
- [x] The three workflows are recorded in the seam inventory by PR #29.

## Non-goals

- Buying a DCM licence or provisioning a runner.
- Publication changes, which are `P0-13`.
- Re-enabling mobile builds, which is `P6-09`.

## Definition of done

A fork-owned pull request can reach a genuinely green state, and every check that still runs means what it says.
