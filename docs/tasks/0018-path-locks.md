# Task 0018: Serialise path mutations with advisory locks

## Tracking

- Stable backlog ID: `P1-17`
- GitHub Issue: [#40 — Serialise path mutations with advisory locks](https://github.com/lor08/immich-drive/issues/40)
- Decided by: [ADR 0005](../adr/0005-defer-drive-database.md)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #40 is the live execution log.

## Status

Implementation in review.

## Goal

Give the file domain mutual exclusion per volume and path, before anything mutates the filesystem.

## Why this comes before the first write

Immich runs several server replicas against one database — the development compose file scales it to three. In-process locking would be silently wrong: two replicas renaming and deleting the same path would never see each other. ADR 0005 chose PostgreSQL advisory locks because they cross replicas and need no schema.

## Decisions made by this task

**The two-argument lock form, with a class reserved for this domain.** Immich uses `pg_advisory_lock(bigint)` with small keys from its `DatabaseLock` enum. PostgreSQL keeps the one-argument and two-argument forms in separate lock spaces, so `pg_advisory_lock(classid, objid)` cannot collide with those keys by construction rather than by hoping a hash misses `1337`. This was confirmed against a live database rather than taken from the documentation: with the Immich server running, `pg_locks` showed its key `600` as `objsubid = 1` while every Drive lock appeared and disappeared at `objsubid = 2`.

**A 32-bit object id derived from a hash of volume and path.** Two unrelated paths can share an id and serialise against each other. That costs throughput, never correctness, and it is the right trade for a mechanism that must work before there is any schema to hold real identities. The volume and path are separated by a null byte in the hash input, so `('ab', '/c')` and `('a', 'b/c')` cannot collapse into one key.

**A pinned connection, not a transaction.** The lock is taken inside Kysely's `connection()` scope and released in a `finally`, mirroring Immich's own helper. Holding a transaction open across filesystem work would be wrong for long operations such as uploads.

## Scope

```text
server/src/extensions/files/path-lock.ts
server/src/extensions/files/path-lock.spec.ts
```

## Non-goals

- Using it; `P1-19` is the first caller.
- Lock waits, timeouts, fairness, and metrics.
- Anything requiring Drive-owned schema.

## Acceptance criteria

- [x] The same volume and path produce the same key; different ones differ.
- [x] Concatenation cannot confuse the key, because the parts are separated.
- [x] The key stays inside the signed 32-bit range the parameter accepts.
- [x] The lock is released after the callback returns and after it throws.
- [x] Two concurrent holders of the same path serialise; different paths do not block each other.
- [x] The key space provably cannot collide with Immich's `DatabaseLock` values.
- [ ] Relevant inherited checks pass.

## Verified against a live database

Key derivation is unit tested. Mutual exclusion cannot be, so it was measured against a running PostgreSQL with the Immich server also connected:

| Check                  | Result                                                                    |
| ---------------------- | ------------------------------------------------------------------------- |
| Same path, two holders | `A in → A out → B in → B out` — serialised                                |
| Different paths        | `one in → two in → two out → one out` — overlapped, no blocking           |
| Handler throws         | Lock reacquired immediately afterwards                                    |
| Residual locks         | Only Immich's own `600` at `objsubid = 1`; nothing left at `objsubid = 2` |

## Testing note

Behaviour needing a real database belongs in the medium-test suite, which lives in an upstream-owned directory this fork avoids adding files to, and whose vitest configuration would have to be edited to look anywhere else. Rather than take that seam for one test, the derivation is unit tested and the concurrency behaviour is verified as above and recorded here. If a second such case appears, the seam is probably worth taking.

## Definition of done

A mutation can be wrapped so that no two replicas perform it on the same path at once, and the mechanism cannot interfere with Immich's own locks.
