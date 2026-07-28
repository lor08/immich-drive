# Upstream integration seams

This document records every upstream-owned file that Immich Drive must touch to serve a working feature, and the measurement that produced the list. It is the evidence behind [ADR 0008](../adr/0008-in-process-file-module.md).

Keep it current. If a future change adds a seam, add it here in the same pull request.

## Seams the fork has taken on

These are live. Every entry was added by a pull request that explains why the edit is unavoidable.

| File                                                                   | Taken on by | Reason                                                                                                                              |
| ---------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `server/src/app.module.ts`                                             | `P1-08`     | Registers `FilesModule` in `ApiModule`. One import line and one array entry.                                                        |
| `server/src/enum.ts`                                                   | `P1-08`     | `Permission.FileRead` and `ApiTag.Files`, appended to existing enums.                                                               |
| `server/src/constants.ts`                                              | `P1-08`     | `endpointTags` entry, required by the `Record<ApiTag, string>` type.                                                                |
| `.github/workflows/test.yml`                                           | `P0-14`     | `Lint Web` picks a GitHub-hosted runner outside upstream; the `mich` runner does not exist here, so the job queued forever.         |
| `.github/workflows/build-mobile.yml`                                   | `P0-14`     | `Build and sign Android` is skipped outside upstream; it needs the `mich` runner and signing identities. Restored with `P6-09`.     |
| `.github/workflows/static_analysis.yml`                                | `P0-14`     | Dart analysis runs without the licensed DCM step outside upstream, where the task otherwise aborts before analysing anything.       |
| `server/src/dtos/server.dto.ts`                                        | `P2-01`     | One field in the server features schema, so the web can hide the Files entry when the domain is off.                                |
| `server/src/services/server.service.ts`                                | `P2-01`     | One field in `getFeatures`, reading the Drive configuration.                                                                        |
| `server/src/services/server.service.spec.ts`                           | `P2-01`     | The upstream spec asserts the exact feature object with `toEqual`, so the new field has to appear there too.                        |
| `web/src/lib/route.ts`                                                 | `P2-01`     | `Route.files()` beside the existing route builders.                                                                                 |
| `web/src/lib/components/shared-components/side-bar/UserSidebar.svelte` | `P2-01`     | One navigation entry gated on the feature flag, plus two icon imports.                                                              |
| `e2e/src/specs/server/api/server.e2e-spec.ts`                          | `P2-01`     | The end-to-end spec also asserts the exact feature object, so the new field appears there too.                                      |
| `i18n/en.json`                                                         | `P2-01`     | One translation key. Weblate owns every other locale.                                                                               |
| `open-api/bin/generate-dart-sdk.sh`                                    | `P0-15`     | Generates from the committed templates instead of re-downloading them, so a required check no longer depends on a third-party host. |

The three workflow edits are gated on `github.repository_owner == 'immich-app'`, so upstream behaviour is unchanged and an upstream synchronisation sees a one-line textual conflict rather than a semantic one.

Generated artifacts regenerated alongside them: `open-api/immich-openapi-specs.json`, `packages/sdk/src/fetch-client.ts`, and `mobile/openapi/**`.

## How the count compares with the spike

`P0-12` predicted six upstream files for a working slice and named them exactly: `app.module.ts`, `enum.ts`, `constants.ts`, `route.ts`, `UserSidebar.svelte`, and `i18n/en.json`. All six turned out to be required, and the slice needed no others.

The inventory is larger than six because it also carries work the spike did not model:

- three workflow files, from repairing inherited validation that cannot run in a fork (`P0-14`);
- four server and end-to-end files, from the feature flag that hides the navigation entry when the domain is disabled (`P2-01`), which the spike's slice did not have.

A feature flag costs more than it looks. Immich asserts the exact feature object in two places, a unit spec and an end-to-end spec, and CI guards newly-required response fields with a mobile test demanding either a backward-compatibility patch or an optional field. All three obligations surfaced in CI rather than in review. The flag was declared optional for that reason, which also gives the honest default: a client that has never heard of Drive treats an absent field as off. Anyone adding a second flag should expect the same three obligations.

The estimate therefore held for what it measured. What it did not measure was the cost of being a fork at all, and the cost of keeping the promise that a disabled deployment looks untouched.

## Measurement

Backlog ID `P0-12`, Issue #19. Measured on a throwaway branch against `main` at `b002afa88`.

The slice wired the smallest reachable feature: the file module registered in the API process, one authenticated `GET /api/files` endpoint backed by `LocalStorageAdapter`, the regenerated API clients, one web route, and one navigation entry.

### Upstream-owned files, hand-edited

Six files, 20 added lines and one modified line.

| File                                                                   | Change  | Nature                                                                     |
| ---------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------- |
| `server/src/app.module.ts`                                             | +8 / −1 | Import and register the module in `ApiModule`. The only non-additive edit. |
| `server/src/enum.ts`                                                   | +3      | `Permission.FileRead` and `ApiTag.Files`, appended to existing enums.      |
| `server/src/constants.ts`                                              | +1      | `endpointTags` entry. Required by the `Record<ApiTag, string>` type.       |
| `web/src/lib/route.ts`                                                 | +3      | `Route.files()` helper next to the existing route builders.                |
| `web/src/lib/components/shared-components/side-bar/UserSidebar.svelte` | +4      | One `NavbarItem` and two icon imports.                                     |
| `i18n/en.json`                                                         | +1      | One translation key. Weblate owns the other locales.                       |

Five of the six are pure additions to a list, an enum, or an object literal. Only `app.module.ts` modified an existing line, because registering a module turned a single-line `imports` array into a multi-line one.

### Immich Drive-owned files

Five files, 103 lines, all inside the feature boundary: the controller, its DTOs, the module registration helper, and the web route with its loader.

### Generated files

| Artifact                             | Cost              | Regenerated by                           |
| ------------------------------------ | ----------------- | ---------------------------------------- |
| `open-api/immich-openapi-specs.json` | +104 lines        | `mise //server:sync-open-api`            |
| `packages/sdk/src/fetch-client.ts`   | +31 lines         | `mise //:open-api-typescript` (oazapfts) |
| `mobile/openapi/**`                  | 3 new, 3 modified | `mise //:open-api-dart`                  |

The Dart figure is structural rather than measured: one endpoint produces `lib/api/files_api.dart`, each schema produces a model file, and `lib/api.dart`, `lib/api_client.dart`, and `lib/model/permission.dart` each gain one or two lines. It was not regenerated during the spike because the authoring environment had no Java toolchain.

## What is mechanically enforced

Two seams cannot silently drift, which materially lowers the maintenance risk:

- `endpointTags` is typed `Record<ApiTag, string>`, so a new tag without a description fails type checking. The spike discovered this seam through a compiler error rather than through review.
- The inherited `OpenAPI Clients` job in `.github/workflows/test.yml` runs `mise //:open-api` and fails if `open-api/immich-openapi-specs.json`, `packages/sdk`, or `mobile/openapi` differ afterwards.

## Consequences for day-to-day work

- **Every server API change regenerates the Dart client**, even though Flutter work is deferred by [ADR 0006](../adr/0006-web-first-clients.md). The generated Dart tree is part of the repository contract, so a pull request that skips it fails CI.
- **API changes require the full toolchain, or Docker.** Regenerating the Dart client needs the OpenAPI generator, which is a Java program. Without `mise` it can be run through the `openapitools/openapi-generator-cli:v7.24.0` image, matching the version pinned in `open-api/openapitools.json`, followed by the patches in `open-api/bin/generate-dart-sdk.sh`. Verified during `P1-08` to reproduce the committed client byte for byte on an unchanged specification.
- **The OpenAPI document must not depend on deployment configuration.** `P1-08` first registered the file module only when `IMMICH_DRIVE_ROOT` was set, which silently removed the endpoint from the specification and both clients whenever they were regenerated without that variable. The module is now registered unconditionally and the configuration gates behavior instead.
- **Namespace Drive permissions.** `Permission` already contains `FolderRead` for the upstream folder view. Drive permissions use the `file.*` prefix so the two never collide.
- **`enum.ts` and `constants.ts` are high-traffic upstream files.** Conflicts during upstream synchronization are likely but trivial, because our edits are single appended lines.

## Verified during the spike

- Server: `tsc --noEmit` clean, `eslint --max-warnings 0` clean, 23 file-domain unit tests pass.
- Server bootstrap: the Nest application graph initialized `FilesModule` while generating the OpenAPI document.
- Web: `tsc --noEmit` clean, `svelte-check` reports 0 errors and 0 warnings across 412 files.
- Generation: the OpenAPI document and the TypeScript client regenerate cleanly and produce a usable `listFiles` function.

## Not verified

- No server was started against a real storage root, so no HTTP response was captured end to end.
- The Dart client was not regenerated.
- Authorization behavior was not exercised; the endpoint reused the existing guard but no cross-user test was run.
