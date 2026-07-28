# Task 0016: Browse folder contents in the web client

## Tracking

- Stable backlog ID: `P2-02`
- GitHub Issue: [#36 — Browse folder contents in the web client](https://github.com/lor08/immich-drive/issues/36)
- Builds on: [`P1-18`](0014-folder-listing.md), [`P2-01`](0015-web-files-route.md)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #36 is the live execution log.

## Status

Implementation in review.

## Goal

Let a user walk a volume in the browser: open it, see folders and files, go deeper, come back.

## Why this task exists in this shape

`P2-01` shipped volume cards that linked to `/files?volumeId=…`, which the loader ignored, so clicking one changed the URL and nothing else. That was caught by running the app, not by reading the diff. The anchor was removed there and this task gives it a destination.

Three of the decisions below exist because the same class of defect kept appearing, and each was found the same way.

## Decisions made by this task

**One route, two views.** `/files` lists volumes; `/files?volumeId=…&path=…` lists a folder. Putting the volume in the path would make it look like part of the addressing scheme rather than a selection, and the volume identifier is already an opaque handle rather than a location.

**Only folders are links.** File rows render the same but carry no anchor, because opening a file needs a download endpoint that does not exist yet. This is the `P2-01` lesson applied before shipping rather than after.

**A missing or rejected folder is a state, not a crash.** The first implementation let the loader throw, which produced Immich's full-page error screen with a stack trace, outside the application shell. But a link outliving the folder it points at is an _expected_ condition here: [ADR 0002](../adr/0002-transparent-filesystem-storage.md) makes the filesystem the source of truth, so folders can disappear without the application doing anything. The loader now catches `404` and `400` and renders an alert inside the page, keeping the breadcrumbs. Anything else still propagates, because a real fault should be loud.

**Both are reported with one existing message.** The first attempt added an `invalid_path` translation key to distinguish them, and running the app showed it rendering as the literal string `invalid_path` in a non-English interface: new keys have no translations until Weblate reaches them. The distinction between "gone" and "never valid" matters when reading the API, not when standing in front of the screen, so both use the existing translated `folder_not_found`. No new key, no untranslated string.

## Scope

```text
web/src/routes/(user)/files/+page.ts            two views, expected-error handling
web/src/routes/(user)/files/+page.svelte        view selection
web/src/lib/features/files/EntryList.svelte     folders link, files do not
web/src/lib/features/files/FileBreadcrumbs.svelte
web/src/lib/features/files/VolumeList.svelte    links restored
```

No upstream-owned file is touched and no API changes, so the seam inventory and the generated clients are unchanged.

## Non-goals

- Downloading, previewing, uploading, renaming, deleting.
- Sorting and pagination beyond the adapter's deterministic name order.
- Recursive or tree views.

## Acceptance criteria

- [x] Clicking a volume opens its root folder.
- [x] Nested navigation works deeper and back, through breadcrumbs and browser history.
- [x] Files and folders are visually distinguishable, and only folders invite a click.
- [x] An empty folder says so.
- [x] A path the server rejects shows an in-page state rather than an empty folder or a crash screen.
- [x] No host path reaches the browser.
- [x] Verified by driving the real application, not only by types and tests.
- [ ] Relevant inherited checks pass.

## Verified by running it

Against a live server with a real storage root:

- volume list to volume root to `/Documents` and back through the breadcrumb;
- an empty folder rendering its own message;
- `path=/does-not-exist` and `path=relative` both rendering the alert inside the shell;
- clicking a file row leaving the URL untouched.

## Definition of done

A user can browse their files, and every part of the screen that looks interactive is.
