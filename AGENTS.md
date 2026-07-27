# Immich Drive agent instructions

These instructions apply to every automated coding agent working in this repository.

## Product direction

Immich Drive extends Immich with a general-purpose file storage domain while preserving Immich as the photo and video engine. The product should provide one web and Flutter experience for photos, files, streaming, external directories, and filesystem exports.

## Upstream safety

- Treat `immich-app/immich` as upstream and keep future synchronization inexpensive.
- Prefer adding isolated files and modules over editing existing Immich code.
- Changes to upstream-owned files must be limited to explicit integration seams such as module registration, navigation, generated clients, configuration, and packaging.
- Never edit an existing upstream migration. Add a new migration owned by Immich Drive.
- Do not repurpose Immich `Asset` entities, repositories, jobs, permissions, or album semantics for arbitrary files.
- Do not rename or reorganize upstream directories without a dedicated architectural decision.

## Planning and duplicate prevention

Before creating or modifying a task file, Issue, branch, or pull request:

1. Read `docs/product/delivery-plan.md` and identify the stable backlog ID.
2. Read `docs/tasks/index.md` and search existing task files for that ID and equivalent wording.
3. Search open and closed GitHub Issues.
4. Search open, closed, and merged pull requests.
5. Search existing branches.
6. Confirm that no active record already represents the same capability.

Additional rules:

- The complete future backlog belongs in `docs/product/delivery-plan.md`; do not create placeholder Issues for every future item.
- Promote a backlog item only when it is ready, active, blocked, or needed for an architectural decision.
- One stable backlog ID may have only one active Issue, one active branch, and one active implementation pull request.
- Record the stable backlog ID in the detailed task file and Issue, and include it in branch or pull-request context where practical.
- Different wording does not make the same capability a separate task.
- After any failed or ambiguous GitHub mutation, re-fetch repository state before retrying.
- Before updating a file, fetch its current blob SHA and confirm the replacement is materially different.
- Never create placeholder, duplicate, or no-op commits. Do not repeatedly submit identical file content.
- When a duplicate is discovered, preserve and cross-link the canonical record, then close the duplicate with the appropriate reason.

## Git and task workflow

- Never write implementation or task placeholders directly to `main`.
- For promoted work, create or confirm the linked GitHub Issue first, then create a dedicated branch from current `main`, then mutate files on that branch.
- Keep a versioned specification under `docs/tasks/` and a linked GitHub Issue for every promoted implementation or architecture task.
- The task file owns stable scope, constraints, and acceptance criteria. The Issue owns live status, discussion, PR links, and validation output.
- Reflect material scope, sequencing, dependency, or acceptance changes in the delivery plan, task file, Issue, and task index as applicable.
- Use one focused branch and one reviewable pull request per stable backlog ID.

## Pull request requirements

Before creating or editing a pull request, read:

- `.github/pull_request_template.md`;
- `CONTRIBUTING.md`;
- `docs/architecture/github-workflow-policy.md`;
- relevant files under `.github/workflows/`.

Every agent-created pull request must:

- use a Conventional Commit title, for example `feat(files): add storage adapter`;
- preserve the exact required headings and checklist from `.github/pull_request_template.md`;
- complete every applicable template section and explain non-applicable items;
- include `Fixes #<issue>` when the PR should close an Issue;
- honestly disclose the degree of LLM use;
- list testing and CI results truthfully, leaving checks unchecked until they pass;
- carry exactly one existing `changelog:*` label before it is ready for review;
- normally use `changelog:skip` for internal scaffolding, documentation, refactoring, and CI-only changes;
- remain a draft until the patch has been self-reviewed and all expected validation is running or complete.

Repository automation may close a PR whose description does not follow the template. Correct the body first; do not repeatedly force-reopen or merge around the automation.

## GitHub Actions rules

- Treat inherited Immich workflows as the validation source of truth unless a documented fork-specific gap proves otherwise.
- Do not duplicate an inherited workflow merely because it references upstream infrastructure; first verify whether the applicable jobs run successfully in this fork.
- Do not edit inherited workflow files without an explicit task and justification.
- Pin every third-party action or reusable workflow to a full commit SHA and include a version comment.
- Set top-level workflow permissions to `{}` or the minimum read-only permissions.
- Grant write permissions only to the specific job that requires them.
- Set `persist-credentials: false` on `actions/checkout` unless the workflow intentionally commits or pushes changes.
- Do not expose secrets to pull requests from forks.
- Prefer GitHub-hosted runners for fork-owned validation. Use a custom runner only when the task documents why it is required.
- Validation workflows must not publish packages, push images, deploy, or mutate repository state.
- Address Zizmor and CodeQL findings before merge; never dismiss them merely to make a PR green.

Before merging any PR, confirm:

- the PR is open, mergeable, and no longer a draft;
- exactly one `changelog:*` label is present;
- the PR body still conforms to the repository template;
- all applicable inherited checks completed successfully or a documented exception was approved;
- there are no unresolved review threads or security findings;
- the expected head SHA has not changed.

## File domain boundaries

- Keep arbitrary files and folders in a separate domain from Immich assets.
- Put new server code under an isolated feature boundary, provisionally `server/src/extensions/files/`, unless an accepted ADR selects another path.
- Put new web code under an isolated feature boundary, provisionally `web/src/lib/features/files/` and dedicated routes.
- Put new Flutter code under an isolated feature boundary, provisionally `mobile/lib/features/files/`.
- Depend on small interfaces such as `StorageAdapter`; do not couple domain services directly to local filesystem APIs.
- The physical filesystem is the source of truth for file bytes and names. PostgreSQL is the index for identity, ownership, permissions, shares, versions, search, and operational state.

## Storage and security

- Preserve human-readable files and directory names on disk for the initial implementation.
- Resolve and validate every path server-side. Reject path traversal, symlink escape, null bytes, reserved paths, and cross-user access.
- Never expose host absolute paths in normal user APIs.
- Make external directories explicitly read-only or read-write.
- Default filesystem exports for Jellyfin, Plex, and similar consumers to read-only.
- Use stable export paths. Do not create media exports under temporary directories.
- Keep Immich-managed upload and library paths outside writable general file storage.

## API and playback

- Support resumable or chunked uploads for large files before calling uploads production-ready.
- Support HTTP byte ranges and correct `206 Partial Content` responses for media streaming.
- External player URLs must be short-lived, scoped to one resource and operation, and must not reveal the user's session token.
- Authorization must be checked before issuing a signed URL and again when practical at stream start.

## Quality requirements

- Add tests for domain rules, authorization, path handling, range parsing, and storage adapters.
- Include failure-path tests, especially for traversal, missing files, concurrent rename/delete, and unavailable external mounts.
- Run the smallest relevant formatter, linter, type checker, and test suite for every changed package.
- Do not silently weaken an existing test or lint rule to make a change pass.
- Document significant architecture choices in `docs/adr/`.

## Scope discipline

- One pull request should implement one reviewable capability.
- Do not implement UI, database, storage, and platform integrations in one task unless the Issue explicitly requires an end-to-end vertical slice.
- Do not add SMB, WebDAV, FUSE, or object storage to the first MVP unless an accepted Issue or ADR requests it.
- When a requirement is unclear, prefer the smallest reversible design and record the assumption in the pull request description.
