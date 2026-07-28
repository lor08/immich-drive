# Task 0021: Web actions for the file domain

## Tracking

- Stable backlog IDs: `P2-03` and `P2-04`, narrowed to a first slice
- GitHub Issue: [#46 — Give the web client the actions the API already supports](https://github.com/lor08/immich-drive/issues/46)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #46 is the live execution log.

## Status

Implementation in review.

## Goal

Make creating a folder, uploading, and downloading reachable from the interface. All three endpoints worked before this task and none was usable without `curl` — the folders visible in the browser had been created that way.

## Decisions made by this task

**Download is a plain link, not a fetch into a blob.** The server accepts the access-token cookie, so an anchor authenticates by itself. Verified rather than assumed: fetching the link from the page with only cookies returned `200`, `application/octet-stream`, and the file's exact bytes. This follows the existing `integrityReportFile` precedent in `route.ts`.

**No new translation keys except one.** `P2-02` showed that a new key renders as its own identifier in every locale Weblate has not reached, so the modal reuses `folder`, `name`, and `create`, and the buttons reuse `upload` and `download`. Only `errors.unable_to_create_folder` was added, and it is a fallback the user sees only when the server sends no message of its own — a much smaller exposure than a visible title.

**Errors surface as the server's own words.** `handleError` prefers the server message, so a conflict reads "Storage entry already exists" rather than a generic failure. Confirmed by triggering it and catching the toast on screen, not by reading the code.

**Folders are grouped before files, in the component.** This is scope beyond the Issue and is recorded as such: the server returns a deterministic name order and nothing more, which is the right contract for an API, and a listing that interleaves folders with files reads as broken in a file browser. Grouping is presentation, so it lives in the component — but when pagination arrives the server has to own ordering, because a page boundary makes client-side grouping wrong. That note is in the code as well.

## Scope

```text
web/src/lib/services/files.service.ts             create and upload, with refresh
web/src/lib/modals/FileFolderCreateModal.svelte
web/src/lib/features/files/EntryList.svelte       download control, folder grouping
web/src/routes/(user)/files/+page.svelte          action buttons
web/src/lib/route.ts                              absolute download URL
i18n/en.json                                      one error key
```

## Non-goals

- Drag and drop, progress, cancellation, retry, concurrent uploads — these stay with `P2-03`.
- Multi-select and bulk actions, with `P2-04`.
- Rename, move, copy, delete: no endpoints yet.
- Overwrite prompts. An upload onto an existing name fails and says why, rather than asking.

## Acceptance criteria

- [x] A file row offers a download that produces the correct bytes.
- [x] A folder can be created from the interface and appears without a manual reload.
- [x] A file can be uploaded from the interface and appears without a manual reload.
- [x] Uploading onto an existing name reports the conflict in the page.
- [x] Controls are keyboard reachable and labelled, verified through the accessibility tree.
- [x] Verified by driving the real application, including the failure case.
- [ ] Relevant inherited checks pass.

## Verified by running it

| Action                        | Result                                                       |
| ----------------------------- | ------------------------------------------------------------ |
| Create folder `Из интерфейса` | created `drwx------`, appeared in the listing without reload |
| Upload `upload-me.txt`        | bytes identical, mode `600`, staging directory empty         |
| Upload the same name again    | toast: "Storage entry already exists"; original untouched    |
| Download link, cookie only    | `200`, `application/octet-stream`, exact bytes               |
| Accessibility tree            | buttons and download links present and labelled              |

## Definition of done

Everything the API supports can be done from the interface, and a refused action explains itself on screen.
