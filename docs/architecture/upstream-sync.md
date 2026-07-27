# Upstream synchronization strategy

Immich Drive is expected to remain a long-lived fork of `immich-app/immich`. Keeping the delta understandable is a core architectural requirement.

## Remotes

Recommended local configuration:

```text
origin   -> lor08/immich-drive
upstream -> immich-app/immich
```

## Branch roles

- `main`: stable Immich Drive releases and accepted changes.
- `agent/*` or `feature/*`: reviewable product changes.
- temporary `upstream-sync/*`: integration branches used to bring upstream changes into the fork.

A permanent divergent `develop` branch is not required initially. Keeping `main` releasable simplifies upstream comparison.

## Integration policy

- Prefer merging or rebasing feature branches from the current Immich Drive `main`.
- Bring upstream changes into a temporary sync branch first.
- Resolve conflicts there and run upstream plus Immich Drive checks before opening a sync PR.
- Never mix an upstream synchronization with a new product feature in the same PR.

## Minimizing conflicts

New code should live in isolated feature directories. Existing Immich files should be edited only at small integration seams:

- navigation entries;
- server module registration;
- configuration schemas;
- generated API clients;
- Docker or package manifests when unavoidable.

Every integration seam should be easy to identify in a comparison against upstream.

## Commit and PR discipline

- One capability per PR.
- Explain every modified upstream-owned file in the PR body.
- Avoid drive-by formatting or refactoring in upstream files.
- Keep generated changes separate or clearly identified.
- Do not squash upstream synchronization commits into an unrelated product commit.

## Versioning

Immich Drive releases should record both:

- the Immich Drive version;
- the upstream Immich commit or release on which it is based.

Example:

```text
Immich Drive 0.1.0
Based on Immich 3.x / upstream commit <sha>
```

The exact release numbering scheme can be selected before the first distributable build.

## Conflict review checklist

For every upstream sync:

1. Did Immich change users, authentication, sessions, jobs, API generation, storage paths, or navigation?
2. Do file-module integration seams still compile and behave correctly?
3. Did upstream introduce a feature or type named `File`, `Drive`, `Storage`, or `ExternalDirectory` that collides with ours?
4. Are migrations ordered correctly?
5. Do Docker volumes and environment variables remain compatible?
6. Do web and Flutter generated clients still match the server OpenAPI document?
7. Do existing Immich tests and the Immich Drive test suite pass?
