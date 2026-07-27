# ADR 0010: Publish only fork-owned GHCR images, and do not rebuild machine learning

- Status: Accepted
- Date: 2026-07-27

## Context

Issue #11 asked how Immich Drive publishes its artifacts without relying on upstream registries, signing identities, secrets, or runners.

The inherited `docker.yml` derives its GHCR repository from `github.repository_owner`, so in this fork it already targets `ghcr.io/lor08/...`. It also passes `dockerhub-push: github.event_name == 'release' && !prerelease` into a pinned reusable workflow whose Docker Hub images live under an upstream namespace. That is dormant today and would activate on the first published release.

Two things narrow the problem since the Issue was written. [ADR 0006](0006-web-first-clients.md) defers the Flutter client, so Android signing, Google Play, App Store Connect, and the upstream `mich` runner are no longer on the critical path. And the fork has never modified `machine-learning/`: its entire delta against upstream is documentation plus `server/src/extensions/files/`.

## Decision

**GHCR under the fork owner is the only registry.** Docker Hub is not a publication target for Immich Drive, now or later, and `dockerhub-push` is set to a constant `false` rather than left as an event expression. No workflow may publish to an upstream or third-party namespace under any trigger.

**The server image is renamed to `immich-drive-server`.** Publishing a differently-behaving image as `immich-server` invites confusion in issue reports and in Compose files. The image is `ghcr.io/<owner>/immich-drive-server`.

**The fork does not build a machine-learning image.** Because `machine-learning/` is unmodified, deployments pin the upstream image published for the Immich release the Drive release is based on. The ML build matrix — cpu, cuda, rocm, openvino, armnn, rknn — and the ML re-tag job are disabled in this fork. If the fork ever modifies that directory, this decision is reversed in the same pull request that does so.

**Only a published GitHub release publishes a versioned tag.** Pushes to `main` may publish `main` and `commit-<sha>` for testing. Pull-request builds validate the image and must not push. Whether the inherited workflow currently pushes `pr-<n>` tags in this fork could not be confirmed while writing this decision, so verifying and correcting it is part of the implementing task.

**Every release records the upstream base.** The Drive version is independent, and the release notes and an image label both state the upstream Immich release and commit the build is based on. Without that, no one can reason about which upstream fixes a given Drive image contains.

**Client signing stays out of scope** until Phase 6 is promoted, per ADR 0006. No Apple or Google identity is created, and no upstream signing secret is ever reused.

Achieving this requires editing the inherited `.github/workflows/docker.yml`. That is permitted only with an explicit task and justification; this ADR is the justification, and the edits are confined to image naming, the Docker Hub flag, publication triggers, and disabling the ML jobs. The inherited validation workflows are not touched.

## Consequences

### Positive

- No credible path to publishing under an upstream namespace, because the flag is constant rather than conditional.
- Users pull an image whose name says what it is.
- Dropping the ML matrix removes six image builds per run from a fork that changes nothing in them, which is the single largest CI cost here.
- Release engineering needs no Apple or Google account, no custom runner, and no secret beyond the automatic `GITHUB_TOKEN`.

### Negative

- The fork now carries edits to an inherited workflow file, which will conflict during upstream synchronization. This is the first such file, so the [seam inventory](../architecture/integration-seams.md) grows and must record it.
- Pinning an externally-built ML image couples the Drive release to the upstream release it is based on. Mixing versions becomes an operator error we can document but not prevent.
- A renamed image means existing Compose files cannot be reused verbatim, so the migration documentation must show the change.
- Reversing the ML decision later means restoring a build matrix that will have drifted.

## Rejected alternatives

**Keep the inherited workflow untouched and add a separate release workflow.** Avoids conflicts in an inherited file, but leaves the original still building, still tagging under `immich-server`, and still holding a Docker Hub flag that activates on release. Two workflows publishing to the same registry is worse than one edited workflow.

**Also publish to Docker Hub under a fork-owned account.** More convenient for some users, but it doubles the credential surface and the failure modes for a project whose users already run `docker compose` against GHCR-hosted Immich images.

**Keep building the machine-learning images.** Straightforward and self-contained, but it spends the majority of the fork's CI budget rebuilding bytes identical to upstream's.

**Keep the `immich-server` image name.** Smallest diff, and tempting because it makes the fork a drop-in replacement. Rejected because a drop-in name for non-identical behavior is precisely what makes bug reports land in the wrong repository.
