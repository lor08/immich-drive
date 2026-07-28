# Task 0020: Upload a file atomically

## Tracking

- Stable backlog ID: `P1-09`
- GitHub Issue: [#44 — Upload a file atomically](https://github.com/lor08/immich-drive/issues/44)
- Uses: [`P1-17`](0018-path-locks.md) path lock, [`P1-16`](0011-volume-model.md) volume layout

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #44 is the live execution log.

## Status

Implementation in review.

## Goal

Let an authenticated client put a file into a volume, streamed, without ever leaving a partial file visible. This completes the Phase 2 exit condition: managing files without touching the host filesystem.

## The design question, and the answer

The architecture commits to staging a write and renaming it into place, and volumes already provision a `.tmp` directory for it. But `P1-16` made the adapter's root the volume's `files/` directory, so `.tmp` is **unreachable through the adapter** — deliberately, because that is what makes service directories structurally invisible instead of conventionally hidden.

Three ways out were considered:

1. **Stage inside the target directory.** No plumbing, but a partial file is briefly visible in listings and survives a crash inside the user's own space.
2. **Stage above the adapter.** That layer would need its own descriptor-safe write, duplicating the property the adapter exists to provide.
3. **Give the adapter a staging root** beside its address root, used only for staging and never resolvable from a virtual path.

The third was chosen: every filesystem write stays where the descriptor discipline lives, and staging stays outside the address space structurally.

## Decisions made by this task

**Construction refuses a staging directory on another filesystem.** An atomic rename only works within one filesystem, so a staging directory elsewhere would silently turn every upload into a copy that can fail halfway. Better to fail loudly at construction than to discover it during an incident.

**`fsync` before the rename.** Without it a crash can publish a renamed but empty file — the rename is atomic with respect to readers, not with respect to power loss.

**The staging file is removed on every failure path**, including a client that disconnects mid-transfer. Verified by killing a transfer, not by reading the code.

**`PUT` with the body as the content.** The request states what the resource should contain. No body parser claims `application/octet-stream`, so the request arrives unconsumed and streams straight into the adapter.

**Overwrite is opt-in.** An existing file is a `409` unless the caller asks; a directory at the path is always a `409`.

## Scope

```text
server/src/extensions/files/local-storage.adapter.ts  staging root, atomic write
server/src/extensions/files/volume.registry.ts        passes the volume's .tmp
server/src/extensions/files/file-domain.service.ts    writeFile under the lock
server/src/extensions/files/files.controller.ts       PUT /files/content
server/src/extensions/files/files.dto.ts
server/src/enum.ts                                    file.upload permission
```

## Non-goals and known gaps

- **Resumable and chunked uploads** are `P3-01`. One request carries one whole file.
- **There is no size limit.** Until quotas arrive with `P7-03`, a client can fill the disk. Stated plainly because it is the kind of gap that is easy to leave unsaid.
- Checksums and duplicate detection are `P1-13`.
- No upload control in the web client yet.

## Acceptance criteria

- [x] A file is uploaded and its bytes match the source exactly.
- [x] A large file streams rather than buffering, demonstrated by measurement.
- [x] No partial file is ever visible at the target path.
- [x] The staging file is gone after success, after failure, and after a client disconnects mid-transfer.
- [x] An existing entry gives `409`; with overwrite it is replaced and the old content is gone.
- [x] A missing parent gives `404`; a directory at the path gives `409`.
- [x] Invalid paths are refused without creating anything, in either directory.
- [x] The uploaded file is owner-only on disk.
- [x] Verified against the running server, including an interrupted upload.
- [ ] Relevant inherited checks pass.

## Verified by running it

126 unit tests pass, fifteen new, including a generator that throws mid-stream and a check that a cross-filesystem staging directory is refused.

Against the live server:

| Check                                 | Result                                                      |
| ------------------------------------- | ----------------------------------------------------------- |
| Upload to `/Projects/uploaded.txt`    | bytes identical, mode `600`, staging empty                  |
| Same path again                       | `409 Storage entry already exists`, original content intact |
| Same path with `overwrite=true`       | replaced, staging empty                                     |
| `/Projects` with overwrite            | `409 Storage entry is a directory`                          |
| `/missing/x.txt`                      | `404`                                                       |
| `relative`, `/a/../escape`            | `400`                                                       |
| **300 MB transfer killed mid-flight** | no file at the target, staging empty                        |
| 300 MB complete transfer              | 1.52 s, bytes identical, resident memory +35 MB             |

The memory figure is the evidence for streaming: 35 MB of growth for a 300 MB body means the content was never held.

## Definition of done

A user can upload a file of any size, and no interruption can leave a partial file where a complete one is expected.
