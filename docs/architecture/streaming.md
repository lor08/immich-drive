# Streaming and external player access

Immich Drive must support large media without requiring a complete download before playback.

## HTTP range support

The content endpoint must support standard byte ranges and return correct response headers.

Typical request:

```http
GET /api/files/<id>/content
Range: bytes=52428800-
```

Typical response:

```http
HTTP/1.1 206 Partial Content
Accept-Ranges: bytes
Content-Range: bytes 52428800-104857599/75161927680
Content-Length: 52428800
Content-Type: video/x-matroska
```

Requirements:

- Support normal full responses and a single byte range in the first version.
- Return `416 Range Not Satisfiable` for invalid or unsatisfiable ranges.
- Avoid buffering the whole file in application memory.
- Ensure storage adapters can open a bounded or offset stream efficiently.
- Preserve stable ETag or modification metadata where practical.

## Authenticated application playback

The web and Flutter clients may use normal authenticated content endpoints. Authorization is checked against the file-domain entry before opening storage.

## External applications

Applications such as VLC often cannot attach Immich Drive session headers. The client therefore requests a temporary playback capability:

```http
POST /api/files/<id>/playback-url
```

The response contains a signed HTTPS URL scoped to:

- one file;
- read or stream access only;
- a short expiration time;
- optionally a specific user, device, or playback session.

The signed URL must not contain or expose the user's normal access or refresh token.

## Expiration behavior

The implementation must balance security with long playback sessions. A useful first design is:

- the URL must be used for the first request within a short window;
- an accepted playback session may continue to issue range requests for a longer bounded lifetime;
- revocation data may be stored for explicitly cancelled or shared sessions.

The exact policy should be finalized in an implementation ADR after testing VLC, Android intents, and browser playback behavior.

## Content disposition

- Inline playback endpoints should use `Content-Disposition: inline` when safe.
- Explicit download endpoints should use `attachment` with a sanitized UTF-8 filename.
- MIME detection must not trust only the filename extension.

## Transcoding

General file streaming initially serves original bytes. Reusing Immich transcoding for arbitrary files is out of scope unless a later design creates a clean media-processing boundary.

Jellyfin, Plex, VLC, and compatible clients remain responsible for format compatibility and transcoding in the first release.

## Security tests

Tests must cover:

- unauthorized playback URL creation;
- expired and modified signatures;
- range requests against signed URLs;
- deleted, moved, or replaced files;
- MIME and filename header injection;
- attempts to reuse a capability for another file or operation.
