# Task 0017: Download a file over the API

## Tracking

- Stable backlog ID: `P1-10`
- GitHub Issue: [#38 — Download a file over the API](https://github.com/lor08/immich-drive/issues/38)
- Builds on: [`P1-18`](0014-folder-listing.md), [`P1-16`](0011-volume-model.md)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #38 is the live execution log.

## Status

Implementation in review.

## Goal

Let an authenticated client download a file from one of its volumes, streamed rather than buffered. The web client could already list a file and show its size but not obtain it, which was the most visible gap left in the read path.

## Decisions made by this task

**`sendFile` is not reused, on purpose.** Immich streams files by handing a host path to `res.sendFile`. That is incompatible with this domain: `LocalStorageAdapter` validates through open descriptors precisely so a path cannot be swapped between check and read, and re-opening by path in Express would reintroduce exactly that race — while also putting a host path in the hands of code outside the adapter. The endpoint streams the adapter's `AsyncIterable` through Nest's `StreamableFile`, following `download.controller.ts` in shape.

**`stat` and `open` happen in one service call.** `openFile` returns the entry and the content together, so a caller cannot describe one entry in its headers while streaming another.

**`Content-Type` is always `application/octet-stream`.** These are arbitrary user-supplied files. Guessing a type is how stored content becomes executable content in a browser. Narrow, safe inline types can be added later for previews, deliberately and per type.

**A separate `file.download` permission**, mirroring how `asset.download` is distinct from `asset.read` upstream, so a scoped API key can read a listing without being able to pull bytes.

**Range requests are out of scope**, and not advertised. `P3-03` owns the whole range contract — parsing, `206`, `416`, `Content-Range`, `Accept-Ranges` — and implementing half of it here would split ownership of the same behaviour across two tasks.

## Scope

```text
server/src/enum.ts                                  file.download permission
server/src/extensions/files/files.dto.ts            download query
server/src/extensions/files/files.controller.ts     GET /files/download
server/src/extensions/files/file-domain.service.ts  openFile
server/src/extensions/files/file-domain.service.spec.ts
```

Regenerated: the OpenAPI document, the TypeScript client, and the Dart client.

## Non-goals

- Byte ranges, signed URLs, inline previews, thumbnails, transcoding.
- Uploads and every other mutation.
- A download control in the web client; the endpoint comes first.

## Acceptance criteria

- [x] A file downloads with its bytes intact, compared against the source.
- [x] `Content-Length` matches the entry size.
- [x] The body is streamed rather than buffered.
- [x] Filenames survive encoding, including non-ASCII characters.
- [x] A directory gives `400`, a missing path `404`, an unaddressable volume `404`.
- [x] No host path appears in any header or error body.
- [x] Requests without a token are refused.
- [x] Verified by downloading through the running server.
- [ ] Relevant inherited checks pass.

## Verified by running it

Against a live server:

- `report.txt` downloaded byte-identical, with `Content-Length: 17`, `Content-Type: application/octet-stream`, and `Content-Disposition: attachment; filename*=UTF-8''report.txt`.
- A file named `Отчёт «2026».txt` downloaded byte-identical, with the name percent-encoded per RFC 5987.
- A 200 MB file downloaded byte-identical with **time to first byte of 7 ms**, which is the evidence that the file is not read before sending. Server resident memory grew by roughly 85 MB during that transfer — well under the file size, so nothing buffers the whole file, but not flat either. Transfer memory behaviour under concurrency belongs to `P3-09`.
- Directory, missing path, foreign volume, relative path, and missing token each returned the expected status.

## Known gap

`X-Content-Type-Options` is not set by this endpoint. `X-Content-Type-Options: nosniff` comes from Immich's helmet middleware, which is enabled by deployment configuration and was not active in the local run, so it was not observed. The `attachment` disposition and the octet-stream type already prevent inline interpretation; confirming the header in a deployed configuration belongs to `P0-09`.

## Definition of done

A user can obtain a file, of any size, without the server reading it into memory first.
