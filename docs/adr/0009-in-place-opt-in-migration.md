# ADR 0009: Migrate by swapping the image, with the file domain opt-in

- Status: Accepted
- Date: 2026-07-27

## Context

Issue #9 asked how an existing Immich installation becomes an Immich Drive installation without re-uploading the photo library or losing users, albums, metadata, jobs, configuration, or files on disk.

Two facts changed the shape of that question after the Issue was written.

`P1-03` makes the file domain **opt-in**: with `IMMICH_DRIVE_ROOT` unset it is disabled entirely. And [ADR 0005](0005-defer-drive-database.md) defers Drive-owned schema until the index, so early versions add no tables at all.

Measuring the fork confirms the consequence. Across its history, Immich Drive has modified **zero upstream-owned files**; its entire delta is documentation plus `server/src/extensions/files/`. There is no altered upstream behavior for a migration to preserve.

## Decision

**Migration is an in-place image swap.** An operator points the existing Compose deployment at the Immich Drive server image and restarts. Volumes, environment variables, database, and media location are unchanged. Upstream migrations run exactly as they would for the equivalent Immich release.

**The file domain stays off until the operator turns it on.** Without `IMMICH_DRIVE_ROOT` the deployment is behaviourally identical to upstream Immich. Enabling it later is a configuration change, not a migration.

**One supported source version per release.** Each Immich Drive release states the upstream Immich release it is based on, and migration is supported only from that exact release. An operator on an older Immich upgrades with upstream Immich first, then swaps the image. We do not maintain a compatibility matrix across upstream versions, and we do not attempt to run upstream migrations out of order.

**Rollback has two regimes, and the boundary is published.**

- Before any Drive-owned schema exists, rollback is swapping the image back. Nothing was added to the database and nothing outside `IMMICH_DRIVE_ROOT` was written.
- Once Drive-owned tables exist, rollback additionally requires dropping them. They are `drive_`-prefixed and additive, so upstream Immich ignores them, but leaving them behind means a future upgrade sees tables it did not create. The downgrade procedure is documented alongside the release that first introduces schema.

**Immich assets are never imported into the file domain.** This restates [ADR 0001](0001-separate-file-domain.md) as a migration rule: no upgrade path copies, moves, links, or indexes an Immich asset as a Drive file.

**Side-by-side migration is not a supported product path.** Running both products against copies of the same data doubles storage, splits the database, and has no automatic reconciliation. Operators who want a rehearsal restore a backup into a separate environment and swap the image there.

## Consequences

### Positive

- The upgrade risk for a user who does not want file storage is the same as an ordinary Immich upgrade, because it is one.
- Enabling and disabling the feature is reversible by configuration for as long as there is no schema, which covers the whole first phase.
- No compatibility matrix to maintain, and no migration code to write for the first releases.
- Preflight is cheap: the storage-root validation in `P1-03` already refuses to start against a root that overlaps Immich media paths, which is the one configuration mistake that could damage existing data.

### Negative

- Operators lagging several Immich versions behind must upgrade with upstream first, which is an extra step we cannot remove without owning a compatibility matrix.
- Once schema exists, rollback stops being a pure image swap, and the documentation must be accurate about where that line falls.
- Because there is no side-by-side path, rehearsing an upgrade requires restoring a backup elsewhere.
- The claim "identical to upstream Immich when disabled" must be re-verified on every upstream synchronization, since it depends on the fork continuing to add rather than modify. The [seam inventory](../architecture/integration-seams.md) is what makes that checkable.

## Rejected alternatives

**A migration tool with a supported-version matrix.** Standard for products that ship their own schema from day one. Rejected because the fork has no schema yet and no modified upstream behavior, so the tool would exist only to re-implement what upstream migrations already do.

**Importing existing Immich assets into the file domain during upgrade.** Superficially attractive because users would immediately see their photos in the file browser, but it contradicts ADR 0001, duplicates ownership and deletion semantics across two domains, and cannot be undone cleanly.

**Making the file domain enabled by default with a generated root.** Would make first-run smoother, but silently creating a storage tree during an upgrade is exactly the behavior that makes an upgrade irreversible, and a generated location is likely to be the wrong one on a NAS.
