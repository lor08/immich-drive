# Task 0015: Files route and navigation in the web client

## Tracking

- Stable backlog ID: `P2-01`
- GitHub Issue: [#34 — Add the Files route and navigation to the web client](https://github.com/lor08/immich-drive/issues/34)
- Builds on: [`P1-08`](0012-volume-discovery.md), [`P1-18`](0014-folder-listing.md)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #34 is the live execution log.

## Status

Implementation in review.

## Goal

Make the file domain reachable from the web client: a `/files` route, a navigation entry, and the feature flag that decides whether the entry exists at all.

## Decisions made by this task

**A server feature flag, not an always-visible entry.** [ADR 0009](../adr/0009-in-place-opt-in-migration.md) promises that a deployment which never sets `IMMICH_DRIVE_ROOT` is indistinguishable from upstream Immich. A navigation entry visible to everyone would break that promise in the most visible place in the product, and would lead to a page whose only content is that the feature is off. The server therefore reports `files` among its features and the web gates the entry on it.

**The upstream feature spec is edited, deliberately.** `server.service.spec.ts` asserts the exact feature object with `toEqual`, so a new field breaks it. The alternative was to skip the flag and ship a misleading navigation entry. Adding one line to an upstream test is the smaller cost, and it is an addition rather than a weakening of the assertion.

**The page borrows Immich's visual language rather than inventing one.** It uses `UserPageLayout`, `Container`, and the `Card`/`Icon` composition already used by the workflow cards, so the Files view reads as part of Immich rather than as something grafted on.

## Scope

```text
server/src/dtos/server.dto.ts                 files feature flag
server/src/services/server.service.ts         reports it
server/src/services/server.service.spec.ts    exact-object assertion
web/src/lib/features/files/VolumeList.svelte  isolated feature boundary
web/src/routes/(user)/files/+page.ts          loader
web/src/routes/(user)/files/+page.svelte      page
web/src/lib/route.ts                          Route.files()
web/src/lib/components/.../UserSidebar.svelte navigation entry
i18n/en.json                                  one key
```

The [seam inventory](../architecture/integration-seams.md) grows from six entries to twelve and now reconciles that number against the `P0-12` estimate: the spike named exactly the six files a slice needs, and all six were required. The extra six come from repairing fork-only CI and from the feature flag, neither of which the spike modelled.

## Non-goals

- Browsing folder contents, which is `P2-02`. This task proves the route, the navigation, and the flag.
- Uploads, mutations, previews.
- Storage administration UI, which is `P2-06`.

## Acceptance criteria

- [x] With `IMMICH_DRIVE_ROOT` unset the feature flag is false, so no Files entry appears.
- [x] With it set, the entry appears and the route lists the caller's volumes.
- [x] The page uses existing Immich layout and UI components.
- [x] No host path reaches the browser; the volume response carries no filesystem location.
- [x] Generated clients regenerated and committed.
- [x] Every new upstream file recorded in the seam inventory, with the spike reconciliation.
- [ ] Relevant inherited checks pass, including `Lint Web` and `Test Web`.

## Environment notes

Two local verification limits, both pre-existing and unrelated to this change:

- `thumbnail-util.spec.ts` compares locale-formatted dates and fails under a non-English shell locale. It passes with `LANG=en_US.UTF-8`, which is what CI uses.
- `eslint` crashes locally inside the `tscompat` rule while linting an upstream mock file, so the web lint verdict comes from CI. Disabling that single rule locally confirms the files added here are clean.

## Definition of done

An Immich instance with Drive configured shows a Files entry that opens a page listing the user's volumes, and an instance without it looks exactly as it did before.
