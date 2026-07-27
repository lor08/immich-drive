# Task 0010: Release and publication architecture

## Tracking

- Stable backlog ID: `P0-05`, cross-cutting `X-03`
- GitHub Issue: [#11 — Define fork release and publication pipeline](https://github.com/lor08/immich-drive/issues/11)
- Decision: [ADR 0010](../adr/0010-fork-owned-release.md)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #11 is the live execution log.

## Status

Architecture accepted. The workflow changes it authorizes are a separate implementation task, because they edit an inherited workflow and must be reviewed on their own.

## Goal

Decide how Immich Drive publishes artifacts without relying on upstream registries, namespaces, signing identities, secrets, or runners.

## Answer

GHCR under the fork owner is the only registry; the server image is renamed; the machine-learning image is not rebuilt; only a published release publishes a version. The reasoning and rejected alternatives are in ADR 0010.

The Issue's required decisions resolve as follows.

| Decision                    | Answer                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| Image names                 | `ghcr.io/<owner>/immich-drive-server`. No fork-built machine-learning image.                          |
| Registries                  | GHCR only. Docker Hub is never a target, and `dockerhub-push` becomes a constant `false`.             |
| Tag policy                  | Release publishes `X.Y.Z`; `main` may publish `main` and `commit-<sha>`; pull requests never push.    |
| Package visibility          | Public, matching how the images are meant to be consumed.                                             |
| Android runner and signing  | Out of scope until Phase 6 is promoted, per ADR 0006.                                                 |
| iOS and TestFlight          | Out of scope for the same reason.                                                                     |
| Artifact retention          | Inherited defaults; nothing fork-specific is required while only images are published.                |
| Versioning against upstream | Independent Drive version, with the upstream base release and commit in the notes and an image label. |

## Implementation, tracked separately

ADR 0010 authorizes editing the inherited `.github/workflows/docker.yml`, confined to:

1. renaming the server image;
2. setting `dockerhub-push` to a constant `false`;
3. restricting publication triggers so pull requests do not push;
4. disabling the machine-learning build matrix and re-tag job.

That work also has to:

- verify what the fork has actually published to GHCR so far, which could not be confirmed while writing the decision because listing packages needs a scope the authoring environment lacked;
- record the newly edited inherited workflow in the [seam inventory](../architecture/integration-seams.md), since it becomes the fork's first modified upstream file;
- add the documented pull command and a Compose snippet using the renamed image and the pinned upstream ML image.

## Acceptance criteria

- [x] A single registry is chosen and the Docker Hub path is closed by a constant rather than a condition.
- [x] The image name distinguishes this product from upstream Immich.
- [x] The machine-learning decision is justified by a measured fact and carries an explicit reversal condition.
- [x] Mobile signing is explicitly out of scope with a named dependency.
- [x] Every release is required to state its upstream base.
- [ ] Workflow changes are implemented and verified — separate task.
- [ ] Published packages are enumerated and reconciled with the tag policy — separate task.

## Non-goals

- Publishing anything before the workflow changes are reviewed.
- Creating Apple or Google developer identities.
- Using any upstream secret, runner, or namespace.
