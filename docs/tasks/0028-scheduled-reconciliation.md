# Task 0028: Scheduled reconciliation on the job queue

## Tracking

- Stable backlog ID: `P1-20`
- GitHub Issue: [#62 — Scheduled reconciliation on the job queue](https://github.com/lor08/immich-drive/issues/62)
- Takes the seam [`P1-06`](0027-reconciliation-and-health.md) deliberately left alone
- Rules it serves: [ADR 0007](../adr/0007-reconciliation-and-mount-health.md)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #62 is the live execution log.

## Status

Implementation in review.

## Goal

Reconciliation runs on a schedule, in the worker built for background work, without an operator in the loop — and without a deployment inheriting background filesystem scans it never asked for.

## What the seam costs, measured

The decision this task turns on, and it was measured against the code rather than estimated. Immich discovers job handlers in `JobRepository.setup(services)`, over an **explicit list** of service classes, and then refuses to start if any `JobName` lacks one:

> `Failed to find job handler for Job.X` → `ImmichStartupError`

So adding a `JobName` at all forces the handler into the upstream registry. Four files, two of them new seams:

| File                           | Change                                          | Why it is unavoidable                                                                                     |
| ------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `server/src/enum.ts`           | two `JobName`s, one `DatabaseLock`              | existing seam; the lock is what stops two replicas owning the same schedule                               |
| `server/src/types.ts`          | two `JobItem` union entries, one data interface | **new seam**; `jobRepository.queue()` takes `JobItem`, which is exhaustive                                |
| `server/src/services/index.ts` | one import, one array entry                     | **new seam**; without it the server refuses to start, per the above                                       |
| `server/src/app.module.ts`     | `driveModule` into two more modules             | existing seam; jobs run in the microservices worker, and the admin CLI instantiates the same service list |

## Decisions made by this task

**No new `QueueName`.** `QueueName.BackgroundTask` exists and already has concurrency configured. A new queue would additionally touch the exhaustive maps in `config.ts` and `dtos/queue-legacy.dto.ts`, the `switch` in `services/queue.service.ts`, and the admin Jobs panel with its translations — cost for nothing, since what matters is that the work leaves the request path, not that it has a queue of its own. A test reads the decorators rather than trusting this paragraph.

**No `SystemConfig` entry, so no runtime-editable schedule.** Upstream schedules its own periodic work from admin settings (`integrityChecks.*.cronExpression`). Matching that means `config.ts`, `system-config.dto.ts`, the settings UI, translations, and the two specs that assert the config object exactly — the surface `P2-01` already measured the hard way. The schedule comes from the environment, like every other Drive setting. Drive settings in the admin UI is a real decision and gets its own task.

**Unset means no schedule, and that is the default.** Reconciliation reads every volume's tree. Switching that on for every deployment that merely upgrades is exactly the surprise a fork must not spring, and `P1-06` behaviour stays identical until an operator sets `IMMICH_DRIVE_RECONCILE_CRON`. A malformed expression **fails startup**, validated with the scheduler's own parser so what is accepted here is what it will accept later; the alternative is a server that starts, says nothing, and never reconciles — indistinguishable from one that was never configured.

**One worker, one replica.** The schedule is registered only in the microservices worker, and only by the replica that wins `DatabaseLock.DriveReconciliation`. Several replicas each running it would not corrupt anything — a pass only adds rows or changes their state — but they would multiply the filesystem reads by the number of replicas for the same answer.

**The handler lives in the upstream service scope; reconciliation does not.** `DriveJobService` decides _when_ work runs and _for which volumes_; everything about what a pass does stays in `ReconciliationService`. The split is not decoration: enumerating volumes needs the user list, and the file domain deliberately does not know about users. That is the whole reason this class exists in that scope at all.

**The shared volume is queued once**, not once per user. It belongs to the deployment, and the owner identifier in a job is only how a volume is addressed; reconciling it once per person who can see it would be the same work repeated.

**A volume larger than one pass is finished by a chain of jobs, and the chain must be able to end.** A pass that stops at its directory limit queues the next one, carrying the checkpoint it reached. If the next pass does not move past that checkpoint, the chain **stops** rather than continuing — a job that re-queues itself while achieving nothing is a queue that never empties. An attempt counter backstops the pathological case where a checkpoint keeps moving without the tree ending.

**An unhealthy volume is dropped, not retried.** The next refusal would be identical, and a mount comes back on a human's timescale rather than a queue's; the next scheduled run picks it up.

## Scope

```text
server/src/extensions/files/drive-job.service.ts   the schedule, the two handlers, the re-queue rules
server/src/extensions/files/files.config.ts        IMMICH_DRIVE_RECONCILE_CRON and its validation
server/src/extensions/files/files.module.ts        exports the four providers the handler needs
server/src/enum.ts                                 UPSTREAM: two JobNames, one DatabaseLock
server/src/types.ts                                UPSTREAM: JobItem entries, IDriveReconcileJob
server/src/services/index.ts                       UPSTREAM: registers the handler
server/src/app.module.ts                           UPSTREAM: driveModule in MicroservicesModule
```

No DTO, controller or specification changes, so neither generated client moves. All four upstream files are recorded in `docs/architecture/integration-seams.md`.

## Non-goals

- **Drive settings in the admin UI**, and therefore a schedule editable without a restart.
- **Filesystem watchers.** [ADR 0007](../adr/0007-reconciliation-and-mount-health.md) makes them a hint, and the authoritative pass is what they would be hinting at.
- **Destructive cleanup of `missing` rows**, which still needs an explicit operator action.
- **Per-volume schedules.** One expression covers the deployment; a volume that needs different treatment is a sign the volume model needs work, not the scheduler.

## Acceptance criteria

- [x] A cron expression in the environment schedules passes; unset means nothing is scheduled.
- [x] The schedule is registered in the microservices worker only, and only once across replicas.
- [x] A malformed expression fails startup with an operator-facing error rather than being ignored.
- [x] The queue-all job queues one job per volume, including the shared volume exactly once.
- [x] A volume whose pass ends incomplete is queued again and eventually completes.
- [x] A pass that makes no progress is not re-queued.
- [x] An unhealthy volume is logged and not retried in a loop.
- [x] Nothing is scheduled or queued when the file domain is disabled.
- [x] Trash retention expires records through the scheduled pass, when configured.
- [x] Every upstream file touched is recorded in the seam inventory.
- [x] Verified against the running server, including a real scheduled run.
- [x] Relevant inherited checks pass.

## Verified by running it

The file domain holds 299 unit tests, eighteen of them new for the job service — including the re-queue rules, the shared-volume deduplication, and a test that reads the `@OnJob` decorators to check both jobs really do run on an existing queue.

Live, with both workers running against a real Redis and a real database:

| Check                                                     | Result                                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Startup with a schedule                                   | `[Microservices:DriveJobService] Scheduled Drive reconciliation with "* * * * *"`                 |
| The schedule firing                                       | `Queued reconciliation for 2 volume(s)`, then both volumes reconciled in the microservices worker |
| A file written outside the application                    | picked up by the next scheduled pass: `1 added`, and the row present in the index                 |
| Retention through a scheduled pass                        | `Expired trash record ced70caf…, deleted at 2026-05-01…`; the trash then empty                    |
| Foreign content in the trash during that pass             | untouched                                                                                         |
| `IMMICH_DRIVE_RECONCILE_CRON` unset, both workers running | no schedule registered, both workers healthy                                                      |
| `IMMICH_DRIVE_RECONCILE_CRON='every tuesday maybe'`       | startup fails: `IMMICH_DRIVE_RECONCILE_CRON is not a usable cron expression`                      |

Two things the live run found that no test would have:

1. **The module exported too little.** `DriveJobService` resolves in the microservices worker, which meant `FilesModule` had to export `DRIVE_CONFIG` as well as its services — a provider is invisible outside its module unless the module exports it. The worker failed to boot until it did.

2. **The admin CLI takes the same service list, and it was overlooked twice.** `ImmichAdminModule` also builds from `common`, so it instantiates `DriveJobService` — and failed to construct it, exiting `1` with **no message at all**, because the CLI forces its log level to `warn` and the dependency error never reached the terminal. Found by the inherited end-to-end suite, which runs four `immich-admin` commands, and then reproduced locally in one command. Importing the file domain there surfaced a second problem: the CLI never sets a media location, so this module's overlap check threw. It is now skipped when no location has been set, which is only ever true in a process that serves no files — anything that does serve them sets it while modules initialise, before that hook runs.
3. **The microservices worker needs geodata.** Unrelated to this change, but it is why this worker had never been started in the development environment: `MetadataService` imports reverse-geocoding data on bootstrap and throws if it cannot. Minimal fixtures under `IMMICH_BUILD_DATA/geodata` are enough to get the worker up locally; the note is here so the next person does not rediscover it.

Two criteria are met by unit tests rather than by the live run, and the difference is stated rather than implied: **"only once across replicas"** is the lock returning false leaving the schedule unregistered, not two replicas actually racing; and **the chain of jobs for an oversized volume** is the re-queue rules under test, because the development tree is twelve directories and finishes inside one pass. Both would need a larger fixture or a second replica to see for real.

## Definition of done

An operator sets one environment variable and the index stops drifting on its own, with no job able to run forever and no deployment gaining background work it did not ask for.
