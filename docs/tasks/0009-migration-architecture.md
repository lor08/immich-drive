# Task 0009: Migration and rollback architecture

## Tracking

- Stable backlog ID: `P0-04`, cross-cutting `X-02`
- GitHub Issue: [#9 — Design migration path from existing Immich installations](https://github.com/lor08/immich-drive/issues/9)
- Decision: [ADR 0009](../adr/0009-in-place-opt-in-migration.md)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #9 is the live execution log.

## Status

Architecture accepted. Implementation work is deferred until `P1-04` introduces Drive-owned schema, which is the point where migration stops being a no-op.

## Goal

Define how an existing Immich installation becomes an Immich Drive installation without re-uploading the photo library or losing users, albums, metadata, jobs, configuration, or files on disk.

## Answer

An in-place image swap, with the file domain opt-in and off by default. The reasoning and the rejected alternatives are in ADR 0009.

The Issue's original design questions resolve as follows.

| Question                                  | Answer                                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Supported upstream sources                | Exactly the upstream release each Immich Drive release is based on. Older installations upgrade upstream first. |
| Backup verification before upgrade        | Not enforced by tooling. Documented as a precondition, as for any Immich upgrade.                               |
| Volumes and environment variables         | Unchanged. Immich Drive adds `IMMICH_DRIVE_ROOT` and nothing else.                                              |
| Where the file root goes                  | An operator-chosen path that `P1-03` validates as non-overlapping with Immich media paths, in both directions.  |
| Naming of Drive-owned migrations          | `drive_` prefix, fork-owned, additive, introduced by `P1-04`.                                                   |
| Detecting an existing upstream deployment | Not required. The upgrade is behaviourally identical whether or not data already exists.                        |
| External libraries and unavailable mounts | Untouched by migration. External directories are a later phase with their own health rules.                     |
| Rollback guarantees                       | Pure image swap until Drive schema exists; afterwards the documented drop of `drive_` tables is also required.  |
| Preserving upstream database migrations   | They run unchanged, because the fork does not modify them.                                                      |

## Deferred implementation work

These become their own tasks when `P1-04` is promoted:

- a documented downgrade procedure that drops `drive_` tables, published with the release that first adds them;
- an upgrade fixture test that boots the supported upstream release with real data, swaps the image, and asserts that users, albums, assets, and configuration survive;
- release notes that state the upstream base release explicitly, per `P0-07`.

## Acceptance criteria

- [x] The supported source-version rule is stated and is maintainable without a compatibility matrix.
- [x] The rollback boundary is identified precisely rather than promised generally.
- [x] The decision restates that Immich assets are never imported into the file domain.
- [x] The claim that a disabled deployment is identical to upstream Immich is tied to a checkable artifact.
- [ ] An upgrade fixture test exists — deferred to `P1-04`, because until then there is nothing to migrate.

## Non-goals

- Writing migration code before there is schema to migrate.
- Supporting side-by-side operation of Immich and Immich Drive against the same data.
- Owning a compatibility matrix across upstream versions.
