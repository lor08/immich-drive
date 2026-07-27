# Task 0008: Configure and validate the storage root

## Tracking

- Stable backlog ID: `P1-03`
- GitHub Issue: [#22 — Configure and validate the Immich Drive storage root](https://github.com/lor08/immich-drive/issues/22)
- Decided by: [ADR 0004](../adr/0004-volume-path-model.md)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #22 is the live execution log.

## Status

Implementation in review.

## Goal

Give the file domain a configured storage root and refuse to run with a dangerous one, before anything writes to disk.

`LocalStorageAdapter` already refuses to escape its configured root, but nothing decided what that root is or whether it is safe. The dangerous case is overlap with Immich's own media location in either direction, which lets one domain write into the other's tree. That must fail at startup rather than at first write.

## Decisions made by this task

**The file domain is opt-in.** With `IMMICH_DRIVE_ROOT` unset the domain is disabled and the server behaves exactly like upstream Immich. This keeps an upgrade reversible by configuration alone, which is the property the migration architecture in `P0-04` depends on.

**The validator is pure.** Reserved paths are passed in rather than read from `StorageCore` statics, so the rules are unit-testable and the validator does not depend on Immich bootstrap order.

**Comparison happens on canonical paths.** The root is resolved once through `realpath`, and reserved paths that do not exist yet are resolved through their nearest existing ancestor. Without that, a symbolic link anywhere in either path would defeat the overlap check.

## Scope

```text
server/src/extensions/files/files.config.ts
server/src/extensions/files/storage-root.validator.ts
server/src/extensions/files/storage-root.validator.spec.ts
```

Rejection rules, each with a distinct error code:

- a null byte in the configured value;
- a relative path;
- a missing path;
- a path that is not a directory;
- a directory the server process cannot read and write;
- overlap with a reserved Immich path, in either direction, including through symbolic links.

Errors name the offending path. They are read by an operator fixing a deployment and are never returned through a user API.

## Non-goals

- Registering the module in `app.module.ts`; that lands with `P1-16`, when there is something to serve.
- Volumes, shared spaces, per-volume roots, and marker files.
- External library paths, which live in the database and change at runtime; those are checked when a volume is registered.
- Any write to disk.

## Acceptance criteria

- [x] An unset, empty, or blank `IMMICH_DRIVE_ROOT` yields a disabled file domain and no validation.
- [x] A relative path, a null byte, a missing path, and a regular file are rejected with distinct error codes.
- [x] A root lacking read or write permission is rejected, with the test skipped when the process runs as root and permission bits do not apply.
- [x] A root equal to, inside, or containing a reserved path is rejected in both directions.
- [x] A sibling sharing only a name prefix, such as `immich-drive` next to `immich`, is accepted.
- [x] A symlinked root whose target lands inside a reserved path is rejected.
- [x] Overlap is detected when the reserved path itself is reached through a symbolic link.
- [x] A reserved path that does not exist yet does not break validation.
- [x] Errors name the offending path.
- [ ] Relevant inherited checks pass.

## Definition of done

An operator can point Immich Drive at a directory and be told precisely why it is unusable, and a deployment that has not opted in is indistinguishable from upstream Immich.
