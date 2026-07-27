# Task 0007: Measure the upstream integration seam

## Tracking

- Stable backlog ID: `P0-12`
- GitHub Issue: [#19 — Measure the upstream integration seam for a working file slice](https://github.com/lor08/immich-drive/issues/19)
- Spike branch: `spike/p0-12-seam-measurement` — evidence only, must not be merged
- Result: [`docs/architecture/integration-seams.md`](../architecture/integration-seams.md) and [ADR 0008](../adr/0008-in-process-file-module.md)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #19 is the live execution log.

## Status

Done. The seam measured six upstream-owned files, and ADR 0008 keeps the file domain in-process.

## Goal

Determine how many upstream-owned files a genuinely working file slice touches, and decide from that number whether the file domain stays inside the Immich server process or moves to a separate service.

The implementation is deliberately throwaway. The deliverable is a measurement, a maintained seam inventory, and a decision.

## Method

On a branch that is never merged:

1. Register the file module in the API process so its route is served.
2. Add one authenticated read endpoint backed by the existing `LocalStorageAdapter`.
3. Regenerate the API clients the repository treats as part of its contract.
4. Add one web route and one navigation entry that reaches the endpoint.
5. Classify every changed file outside the Immich Drive feature boundaries.

## Result

Six upstream-owned files, twenty added lines and one modified line. Five of six changes are pure additions to a list, an enum, or an object literal; only module registration modified an existing line. Two seams are enforced by the type checker or by inherited CI rather than by review.

Three findings changed how later tasks are planned:

- the Dart client is regenerated on every API change even though Flutter is deferred, because the inherited `OpenAPI Clients` job fails otherwise;
- completing an API change therefore requires the full toolchain including Java;
- Drive permissions must be namespaced, since `Permission` already contains an upstream `FolderRead`.

## Acceptance criteria

- [x] The slice compiles and type checks on both server and web, or the exact reason it could not be run is documented.
- [x] Every touched upstream file is listed and classified as additive or modifying.
- [x] Generated-client cost is measured separately from hand-edited cost, and unmeasured parts are stated as such.
- [x] An ADR records the decision and the evidence behind it.
- [x] A maintained seam inventory exists so future seams are recorded rather than rediscovered.
- [x] The spike branch is not merged.

## Non-goals

- Shipping the endpoint, the route, or the navigation entry.
- Designing the file API.
- Implementing volumes, storage-root configuration, or authorization.

## Definition of done

A reviewer can see the exact upstream files a working feature requires, the evidence behind the in-process decision, and the conditions that would reopen it.
