# ADR 0004: Address content as volumes over a per-user physical layout

- Status: Accepted
- Date: 2026-07-27

## Context

ADR 0002 makes the physical filesystem authoritative for bytes, names, and hierarchy, but it does not say how that filesystem is arranged or how clients address it.

Two requirements pull in different directions. Private files need ownership that is obvious and hard to get wrong. Household media needs a home that several users share and that Jellyfin, Plex, or a backup tool can mount under a readable path.

Later phases add registered external host directories and stable filesystem exports. If those arrive as special cases layered onto a single global path space, every path-handling routine gains a branch, and the physical layout leaks into the client contract where it can no longer be changed.

## Decision

The API addresses content as a **volume identifier plus a relative POSIX path**. Clients never receive a path relative to a global storage root, and never a host path.

A volume is an independently rooted tree with a name, a kind, and an access mode:

- `managed-private` — created automatically for each user;
- `managed-shared` — a named space with an explicit member list;
- `external` — a registered host directory, introduced in a later phase.

Managed storage uses this physical layout:

```text
<root>/users/<userId>/files/…      browsable content
<root>/users/<userId>/.trash/…     soft-deleted content and its manifests
<root>/users/<userId>/.tmp/…       upload staging
<root>/shared/<space>/files/…      shared content, same service-directory structure
```

The following rules apply to every volume:

- Service directories are siblings of `files/`, never entries inside the browsable tree.
- Trash and upload staging live on the same volume as their content, so soft delete and finalization are renames rather than copies.
- Moves inside a volume must be `rename(2)`. Cross-volume moves are detected by comparing filesystem identity and are rejected with an explicit error until a resumable background transfer job exists.
- A volume records the filesystem identity of its root and revalidates it, as `LocalStorageAdapter` already does for the configured root.
- Physical per-user directories are named by the stable user identifier. A human-readable index of links may be maintained for host operators, but the storage adapter must never traverse it, because the adapter rejects symbolic links.

Isolation between users is enforced by the application and by the path structure. Every file belongs to the single host user that runs the server process; there is no kernel-level separation between Immich Drive users. This must be stated in operator documentation rather than implied.

## Consequences

### Positive

- Authorization for private content becomes structural: the volume root is derived from the session, so a leak requires a path-resolution defect rather than a missing check.
- External directories and exports stop being special cases. Access mode is one field, and root-identity validation is one mechanism shared by all volumes.
- Per-volume roots allow one filesystem dataset per user, which makes real quotas and snapshots available from the host instead of approximated by the application.
- Removing a user is removing one subtree.
- Exports point at shared spaces, so the path a person mounts into Jellyfin is readable and stable.

### Negative

- Two physical namespaces exist from the start, and clients need a virtual root that presents private and shared volumes together.
- Cross-volume moves cannot be offered until the transfer job exists, so the first releases must refuse an operation that users will expect to work.
- Shared-space membership cannot be per-user until the index exists; the first implementation is limited to a configuration-defined space.
- A volume registry must exist before any database, so it starts as configuration and later moves into the schema.

## Rejected alternatives

**One shared tree with application-level permissions.** Matches how a NAS owner thinks and produces the nicest export paths, but per-path permissions require the database immediately, which conflicts with ADR 0005. Until then every user would see everything. Per-user quotas become impractical and deleting a user leaves files scattered through the tree.

**Per-user trees only, with no shared space.** Simpler, but household content has no home, so it ends up inside one person's tree or under a pseudo-user, which is this decision in a less honest form.

**Exposing storage-root-relative paths in the API.** Cheapest today, but it freezes the physical layout into the client contract, so adding external directories or shared spaces later becomes a breaking change.
