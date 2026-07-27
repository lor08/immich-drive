# Immich Drive vision

Immich Drive is a self-hosted personal cloud built on top of Immich.

Immich remains the specialized photo and video engine. Immich Drive adds a separate general-purpose file domain and presents both through one product, one account, and one family of clients.

## Problem

Self-hosted users often combine several disconnected tools:

- a photo application;
- a file manager;
- a media server;
- mobile backup applications;
- external-player links;
- host directories mounted into Docker containers.

The result works, but users must understand storage paths, protocols, permissions, and service-specific interfaces.

Immich Drive should provide a coherent experience while keeping data accessible as ordinary files on the host.

## Product promise

A user should be able to:

1. Back up and browse photos with Immich.
2. Store arbitrary files and folders next to the photo experience.
3. Open a remote file in an installed application such as VLC.
4. Stream large media without downloading it first.
5. Use the same account on web, Android, Android TV, iOS, and desktop clients where supported.
6. Connect an existing host directory without importing or duplicating its data.
7. Expose a selected folder as a stable read-only or read-write path for Jellyfin, Plex, backup software, or another container.
8. Recover the underlying files without depending on the Immich Drive database or UI.

## Non-goals for the first release

- Replacing Immich's photo asset model.
- Implementing SMB inside the application.
- Competing with enterprise document collaboration suites.
- Transparent block-level synchronization between many devices.
- Content-addressed or chunk-only storage that hides normal filenames from the host.
- Automatic deployment or reconfiguration of third-party containers.

## Target users

- Individuals and families running a home server or NAS.
- Users who want Google Photos-like photo management and Google Drive-like file access without public-cloud storage.
- Self-hosters who already use Jellyfin, Plex, VLC, Docker, or TrueNAS.

## Success criteria

The first usable vertical slice is successful when an authenticated user can create a folder, upload a large file, browse it in the web client, stream it using HTTP ranges, and open it through a temporary external-player URL without changing any Immich asset internals.
