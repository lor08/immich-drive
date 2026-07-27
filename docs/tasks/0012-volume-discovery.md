# Task 0012: Volume discovery and module registration

## Tracking

- Stable backlog ID: `P1-08`
- GitHub Issue: [#28 — Expose volume discovery and register the file module](https://github.com/lor08/immich-drive/issues/28)
- Seam measurement: [`P0-12`](0007-integration-seam-spike.md) and [ADR 0008](../adr/0008-in-process-file-module.md)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #28 is the live execution log.

## Status

Implementation in review.

## Goal

Make the file domain reachable, and take on the upstream seam that `P0-12` measured.

## Scope narrowed from the plan

The plan entry bundled volume listing, folder listing, and folder creation. This task delivers only volume discovery, because that already exercises the whole chain — configuration, startup validation, registry, service, controller, DTO, three generated clients, and module registration — on the smallest surface. Folder listing and creation become `P1-18`, where path handling and write semantics get their own review.

## Decisions made by this task

**The module is registered unconditionally.** The first implementation registered it only when `IMMICH_DRIVE_ROOT` was set, and regenerating the OpenAPI document without that variable silently removed the endpoint from the specification and both clients. An API contract that depends on deployment configuration is not a contract. Configuration now gates behavior: unconfigured deployments answer `Immich Drive file storage is not enabled`, matching how upstream reports a disabled feature, and nothing is validated or created.

**Validation stays a startup concern, in two phases.** Root shape is checked while the module is constructed, because the registry needs the canonical path. Overlap with the Immich media location is checked in `onApplicationBootstrap`, which runs after `StorageService` resolves that location on the `AppBootstrap` event. Either failure stops the server.

**Every service entry point rejects rather than throws.** `listVolumes` is `async` for that reason alone; a mixed contract where some methods throw synchronously and others reject is a defect waiting for a caller.

**Drive permissions are namespaced `file.*`,** since `Permission` already contains an upstream `FolderRead`.

## Upstream seam taken on

Three files, all additive, recorded in the [seam inventory](../architecture/integration-seams.md):

| File                       | Change                                              |
| -------------------------- | --------------------------------------------------- |
| `server/src/app.module.ts` | Import, one const, one array entry in `ApiModule`.  |
| `server/src/enum.ts`       | `Permission.FileRead`, `ApiTag.Files`.              |
| `server/src/constants.ts`  | `endpointTags` entry, enforced by the type checker. |

Regenerated: the OpenAPI document, the TypeScript client, and the Dart client.

This pull request also records the three workflow files that `P0-14` edited, because that task was blocked on the same document and recording them twice would have guaranteed a conflict.

## Non-goals

- Folder listing and creation, which are `P1-18`.
- Writes, trash, and locking.
- Web routes and navigation, which belong to Phase 2.

## Acceptance criteria

- [x] An authenticated request lists the caller's volumes; another user gets their own.
- [x] No response field contains a host path, asserted by serializing the response and searching for one.
- [x] An unconfigured deployment reports that file storage is not enabled, from every service entry point.
- [x] The specification contains the endpoint regardless of whether the deployment enables the feature.
- [x] The OpenAPI document, TypeScript client, and Dart client are regenerated and committed.
- [x] Every touched upstream file is recorded in the seam inventory with its reason.
- [ ] Relevant inherited checks pass, including `OpenAPI Clients`.

## Definition of done

A client can ask the server which volumes it has, the answer depends on who is asking, and a deployment that never opted in is unaffected apart from an endpoint that says so.
