# Task 0014: List folder contents over the API

## Tracking

- Stable backlog ID: `P1-18`
- GitHub Issue: [#32 — List folder contents over the API](https://github.com/lor08/immich-drive/issues/32)
- Builds on: [`P1-08`](0012-volume-discovery.md), [`P1-16`](0011-volume-model.md)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #32 is the live execution log.

## Status

Implementation in review.

## Goal

Let an authenticated client list the contents of a folder inside one of its volumes, with HTTP semantics a client can act on.

## Scope narrowed from the plan

The plan paired listing with folder creation. This task delivers listing only. Creation is the first write the domain performs and deserves the isolated review the read-only adapter got in `P1-02`, so it becomes `P1-19` and is sequenced with the write slices.

Listing alone completes the milestone the roadmap actually cares about first: an operator places files in a volume, a user browses them, and nothing writes to disk.

## Decisions made by this task

**Domain errors are mapped to status codes, and the mapping is a unit under test.** Without it every rejected path returns 500 and the endpoint is unusable, because a client cannot tell its own mistake from a server fault. The mapping is exhaustive over both error enums by type, so adding an error code without deciding its status stops compiling.

**An unaddressable volume returns 404, not 403 or 400.** Someone probing for a volume that belongs to another user gets the same answer as for one that does not exist, so the response reveals nothing about what exists.

**The mapping is applied through an interceptor rather than an exception filter.** The mapped exception continues through Immich's global filter, so file-domain errors are shaped like every other error in the API instead of forming a second convention.

**Conditions an operator caused stay 500.** An unusable root, an unsupported platform, an unimplemented mutation, and an entry that changed under a validated path are not client mistakes; reporting them as 400 would tell the caller to fix something it cannot reach.

## Scope

```text
server/src/extensions/files/files.controller.ts     GET /files/entries
server/src/extensions/files/files.dto.ts            entry and query schemas
server/src/extensions/files/files.exceptions.ts     domain error to HTTP mapping
server/src/extensions/files/files.interceptor.ts    applies the mapping
server/src/extensions/files/files.exceptions.spec.ts
```

Regenerated: the OpenAPI document, the TypeScript client, and the Dart client.

## Non-goals

- Folder creation, uploads, and every other mutation.
- Recursive listing, sort options, and pagination. Ordering stays deterministic by name, which the adapter already guarantees.
- Web routes, which are `P2-01` and `P2-02`.

## Acceptance criteria

- [x] Listing a volume root and a nested folder both work, scoped to the authenticated user.
- [x] Traversal, relative, non-canonical, null-byte, Windows, and symlinked paths are refused with 400 rather than 500.
- [x] A missing folder gives 404; a file given where a folder is expected gives 400.
- [x] An unknown volume identifier gives 404 with a message that does not confirm existence.
- [x] No mapped error message contains the storage root, asserted against real domain failures rather than hand-built errors.
- [x] Operator-facing storage conditions and defective identifiers stay 500.
- [x] An unrelated error passes through untouched.
- [x] Generated clients regenerated and committed.
- [ ] Relevant inherited checks pass.

## Definition of done

A client can walk a volume and, when it asks for something impossible, receives an answer precise enough to correct itself.
