# ADR 0008: Keep the file domain inside the Immich server process

- Status: Accepted
- Date: 2026-07-27

## Context

Every decision so far assumed the file domain can live inside the Immich server process behind a small integration seam. ADR 0004 through ADR 0007 all depend on that assumption, and none of them tested it: the merged code was a scaffold and a read-only adapter, neither registered nor reachable.

The alternative is a separate service that shares the database and validates Immich sessions, with the fork reduced to a navigation entry and reverse-proxy configuration. That trades a smaller upstream diff for losing direct reuse of authentication, sessions, configuration, queues, OpenAPI generation, and packaging.

Choosing wrongly is expensive in both directions, and the deciding number — how many upstream-owned files a working feature actually touches — was unknown.

## Decision

The file domain stays **inside the Immich server process** as a registered module.

Spike `P0-12` wired the smallest reachable slice and measured the seam: six upstream-owned files, twenty added lines and one modified line, with five of the six being pure additions to a list, an enum, or an object literal. The full measurement is in [integration seams](../architecture/integration-seams.md).

That document is now the maintained inventory. Any change that adds a seam updates it in the same pull request.

This decision is revisited if either of the following becomes true:

- a required seam modifies upstream logic rather than appending an entry to a list, enum, or object;
- the inventory grows past roughly a dozen upstream-owned files.

## Consequences

### Positive

- Users, sessions, the authentication guard, configuration, job queues, OpenAPI generation, and container packaging are reused directly rather than reimplemented or proxied.
- The measured seam is small enough that upstream synchronization conflicts will be single-line and mechanical.
- Two of the six seams are enforced by the type checker and by inherited CI rather than by reviewer attention, so they cannot silently drift.
- The extraction path stays open: the domain still depends only on `StorageAdapter` and its own service, which is what ADR 0001 required.

### Negative

- Every server API change regenerates the TypeScript and Dart clients, including the Dart client that ADR 0006 defers using. Skipping it fails the inherited `OpenAPI Clients` job.
- Completing an API change requires the full `mise` toolchain, including Java for the Dart generator.
- `server/src/enum.ts` and `server/src/constants.ts` are frequently modified upstream, so they will conflict during synchronization, even if resolving each conflict is trivial.
- The file domain shares a process with Immich, so a fault in file handling can affect photo workflows. This raises the bar for the resource and error-handling behavior of upload and streaming code.

## Rejected alternatives

**Extract a separate service now.** Would shrink the upstream diff to roughly navigation and proxy configuration, but the measured diff is already six additive files, so the trade buys little. It would cost a second deployment unit, cross-service session validation, a second configuration surface, and duplicated OpenAPI plumbing before a single feature exists.

**Avoid OpenAPI and hand-write the web client.** Would remove the generated-client cost entirely, but it fights the repository's own contract, breaks the inherited verification job, and would leave the eventual Flutter client with no generated types.

**Defer the decision until Phase 1 is further along.** Rejected because every later phase compounds the cost of moving, and the measurement was cheap: the spike took one throwaway branch and produced a number.
