# Task 0023: Make an unstartable e2e stack say so

## Tracking

- Stable backlog ID: `P0-16`
- GitHub Issue: [#49 — Make the e2e database startup failure diagnosable, then fix it](https://github.com/lor08/immich-drive/issues/49)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #49 is the live execution log, including the corrected diagnosis.

## Status

Implementation in review.

## Problem, as first understood

Twice every end-to-end suite failed with `connect ECONNREFUSED 127.0.0.1:5435` before any test could run, on both runners, and a plain re-run passed both times. The Issue hypothesised a PostgreSQL startup race: the official image restarts the server after `initdb`, and `pg_isready` inside the container could pass while host connections were still refused. It also assumed container logs were unavailable, and therefore proposed building observability first.

## Both assumptions were wrong

**Logs were already captured.** The jobs have `Capture Docker logs` and `Archive Docker logs` steps, both of which succeeded on the failing run. They are archived rather than printed, which is why they looked absent.

**There was no database race.** The archived logs show initialisation completing normally and connections being served. The alarming `IM CORRUPTED;` and `terminating connection due to administrator command` lines are the backup and maintenance suites doing their job.

## The actual cause

From the failing attempt's own log, at the stack startup step:

```
toomanyrequests: retry-after: 180.482µs, allowed: 44000/minute
##[error]Process completed with exit code 1.
```

`docker compose up --build` failed on a **registry rate limit while pulling base images**. No container started, so every suite failed on connection, and the failing attempt's docker-log artifact is 162 bytes because there was nothing to log.

## Why it cost two diagnoses, and what that fixes

Every step in these jobs carries `if: ${{ !cancelled() }}`, so the test steps ran on top of a stack that had never started. One transient pull failure was reported as five failing suites, with the real message buried above screens of connection errors. **That is the expensive part**, more than the rate limit itself.

So the change is two things:

1. **Retry the startup.** A rate limit is transient by nature and a fork cannot raise it. Three attempts with increasing delay, cleaning up between them. A genuine startup failure still fails the job.
2. **Do not run tests when the stack is absent.** The condition becomes `!cancelled() && steps.stack.outcome == 'success'`. Upstream's `!cancelled()` is deliberate — it lets a later suite run when an earlier suite fails — so it is kept and narrowed rather than replaced.

`Capture Docker logs` keeps `if: always()`, so evidence is still collected when startup fails.

## Non-goals

- Authenticating to the registry to obtain a higher limit. That needs credentials and a decision about which registry; `P0-13` owns registry configuration.
- Removing `--renew-anon-volumes`; test isolation is worth more than startup time.
- Reducing coverage or marking suites as allowed failures.

## Acceptance criteria

- [x] A transient pull failure no longer fails the job on the first attempt.
- [x] Test steps do not run when the stack did not start, so one cause produces one failure.
- [x] A real startup failure still fails, with an error annotation naming it.
- [x] Log capture still runs when startup fails.
- [x] The cause was identified from an observed failure rather than assumed, and the wrong hypothesis is recorded rather than quietly dropped.
- [ ] Relevant inherited checks pass.

## Definition of done

When the end-to-end stack cannot start, the job says that, once, instead of reporting five broken test suites.
