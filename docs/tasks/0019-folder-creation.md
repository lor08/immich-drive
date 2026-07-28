# Task 0019: Create folders over the API

## Tracking

- Stable backlog ID: `P1-19`
- GitHub Issue: [#42 — Create folders over the API](https://github.com/lor08/immich-drive/issues/42)
- First caller of: [`P1-17`](0018-path-locks.md)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #42 is the live execution log.

## Status

Implementation in review.

## Goal

Let an authenticated client create a folder inside a volume. This is the domain's first write to disk, and it gets the isolated review the read-only adapter received in `P1-02`.

## Decisions made by this task

**The write is as descriptor-safe as the reads.** The parent is resolved through the same open-descriptor walk that `stat` and `list` use, and `mkdir` addresses it through that pinned descriptor rather than by re-walking a path string. A parent swapped after validation cannot redirect the creation, which is the property the whole adapter exists to hold.

**Creation is not recursive.** A missing parent is an error. Recursive creation would let one request materialise an arbitrary hierarchy, and would turn a mistyped path into a silent success. The test asserts that a missing parent leaves the volume untouched.

**An occupied path is `409`, not `400` or `500`.** The caller can fix it by choosing another name, which is what a conflict means. This required a new error code, and the exhaustive mapping introduced by `P1-18` refused to compile until its status was decided — the guarantee working as intended rather than as a comment.

**The new directory is re-opened through the parent descriptor before being reported.** What the response describes is what exists on disk, not what was requested.

**The mutation holds the path lock.** `P1-17` gets its first real caller, so two replicas cannot race on the same target.

**Mode `0o700`**, matching how volume directories are provisioned under ADR 0004.

## Scope

```text
server/src/extensions/files/storage.adapter.ts        createDirectory in the contract
server/src/extensions/files/local-storage.adapter.ts  descriptor-relative mkdir
server/src/extensions/files/files.exceptions.ts       conflict mapping
server/src/extensions/files/file-domain.service.ts    createFolder under the lock
server/src/extensions/files/files.controller.ts       POST /files/folders
server/src/extensions/files/files.dto.ts
server/src/enum.ts                                    file.create permission
```

Regenerated: the OpenAPI document, the TypeScript client, and the Dart client.

## Non-goals

- Uploads, rename, move, copy, delete, trash.
- Recursive creation and collision-avoiding auto-renaming.
- A create-folder control in the web client.

## Acceptance criteria

- [x] A folder is created at a volume root and inside an existing folder.
- [x] Creating over an existing entry gives `409`, whether that entry is a file or a directory.
- [x] A missing parent gives `404` and creates nothing.
- [x] Invalid paths — relative, doubled separator, dot segments, null bytes, Windows drive — are refused and create nothing.
- [x] A symlinked parent cannot place a directory outside the volume, and the outside directory stays empty.
- [x] The created directory is owner-only on disk.
- [x] The operation holds the path lock for its duration.
- [x] Verified against the running server, including conflict and missing-parent cases.
- [ ] Relevant inherited checks pass.

## Verified by running it

111 unit tests pass, fifteen of them new. Against the live server:

| Request                           | Result                             |
| --------------------------------- | ---------------------------------- |
| `POST /files/folders` `/Projects` | created, reported as a directory   |
| `/Projects/2026`                  | created inside the new folder      |
| `/Projects` again                 | `409 Storage entry already exists` |
| `/notes.md` (an existing file)    | `409`                              |
| `/missing/child`                  | `404`, nothing created             |
| `relative`, `/a/../escape`        | `400`                              |
| unknown volume                    | `404`                              |
| no token                          | `401`                              |

On disk the folder is `drwx------`. The web browser lists it alongside the pre-existing entries without any change to the client.

## Definition of done

A user can create a folder, and no sequence of requests can place one outside their volume.
