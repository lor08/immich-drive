# ADR 0001: Keep arbitrary files in a separate domain

- Status: Accepted
- Date: 2026-07-27

## Context

Immich models photos and videos as assets with specialized metadata, thumbnails, facial recognition, albums, timelines, and media-processing jobs. Immich Drive needs to manage arbitrary files and directories, including documents, archives, music, disk images, and media consumed by other applications.

Extending the existing asset model to represent every file type would couple unrelated rules and increase conflicts with upstream Immich.

## Decision

Immich Drive will introduce a separate file domain.

- Immich `Asset` remains owned by upstream photo and video behavior.
- General files and folders use independent entities, repositories, services, permissions, migrations, and API routes.
- Shared infrastructure such as users, sessions, PostgreSQL, queues, configuration, OpenAPI generation, and UI components may be reused through explicit interfaces.
- Future links between an asset and a file entry must be references between domains, not inheritance or a shared overloaded entity.

## Consequences

### Positive

- Clear ownership and invariants.
- Lower upstream synchronization cost.
- Arbitrary files do not trigger photo-specific jobs.
- The file domain can later be extracted into a separate process.

### Negative

- Some metadata and authorization concepts may need adapters or duplication.
- A photo visible through both systems may require cross-domain identity or reconciliation later.
- Clients must intentionally combine two API domains into one experience.

## Rejected alternative

Add generic file types to Immich `Asset`. Rejected because it would spread conditionals through upstream services, jobs, migrations, clients, and media assumptions.
