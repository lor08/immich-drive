# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

`lor08/immich-drive` is a long-lived **fork of `immich-app/immich`** (`upstream` remote). Immich stays the photo/video engine; Immich Drive adds a **separate general-purpose file domain** (arbitrary files, streaming, external host directories, read-only filesystem exports for Jellyfin/Plex) exposed through the same accounts, web app, and Flutter app.

**`AGENTS.md` is the binding rulebook for every automated agent in this repo — read it before making any change.** It is normative; this file adds the operational detail (commands, architecture map, current state) rather than restating it. The rules that most often get violated:

- Never write implementation or task placeholders directly to `main`. Issue → branch (`agent/issue-<n>-<slug>`) → draft PR.
- Add isolated files; edit upstream-owned files only at narrow integration seams (module registration, navigation, generated clients, config, packaging) and explain every such file in the PR body.
- Never edit an existing upstream migration; never repurpose Immich `Asset`/albums/permissions for arbitrary files.
- PRs: Conventional Commit title, the exact `.github/pull_request_template.md` headings kept intact, honest LLM disclosure, exactly one `changelog:*` label (usually `changelog:skip` for docs/CI/scaffolding), stay draft until self-reviewed. Repository automation auto-closes non-conforming PR bodies — fix the body, don't fight the bot.
- Inherited Immich workflows are the validation source of truth. Do not add a parallel CI workflow (that experiment already failed — see `docs/tasks/0002-fork-friendly-ci.md`).

## Commands

`mise` is the task runner (`Makefile` targets are dead stubs that print the `mise` equivalent). Task syntax is `mise //<config-root>:<task>`; from inside a directory, `mise <task>` works. Config roots: `server`, `web`, `mobile`, `e2e`, `docs`, `machine-learning`, `packages/cli`, `packages/plugin-core`, `deployment`, `.github`.

```bash
# one-time per package
mise //server:install            # pnpm install --filter immich --frozen-lockfile
mise //web:install

# server (NestJS + TypeScript)
mise //server:test               # vitest, src/**/*.spec.ts
mise //server:test --run src/extensions/files/file-domain.service.spec.ts   # single file
mise //server:test --run -t 'delegates entry lookup'                        # single test by name
mise //server:test-medium        # test/medium/**, spins a Postgres testcontainer (Docker required)
mise //server:format-fix         # prettier
mise //server:lint               # eslint --max-warnings 0
mise //server:check              # tsc --noEmit
mise //server:checklist          # ci-unit + ci-medium — run before marking a server PR ready

# web (SvelteKit)
mise //web:start                 # dev server on :3000
mise //web:test / :check / :lint / :format-fix
mise //web:checklist

# mobile (Flutter)
mise //mobile:codegen            # build_runner; also :pigeon, :translation
mise //mobile:test / :analyze / :format
mise //mobile:checklist

# whole stack
mise dev                         # docker compose dev stack
mise open-api                    # regenerate OpenAPI spec + TS SDK + Dart client (see below)
mise e2e && mise //e2e:test      # e2e stack, then API tests; //e2e:test-web for Playwright
```

Equivalent raw commands exist as package scripts (`cd server && pnpm test <path>`), useful when `mise` isn't available.

## Architecture

Monorepo (pnpm workspaces, `packageManager: pnpm@11.13.1`, Node 24):

| Path | What it is |
| --- | --- |
| `server/` | NestJS + Express + Kysely, loosely hexagonal: `src/controllers` (HTTP) → `src/services` (business logic) → `src/repositories` (DB/filesystem/external tech). DTOs in `src/dtos` define the OpenAPI surface. Schema/migrations in `src/schema`. |
| `server/src/extensions/files/` | **Immich Drive's file domain** — the fork's own code lives here. |
| `web/` | SvelteKit + Tailwind. Fork's UI goes in `web/src/lib/features/files/` + `web/src/routes/(user)/files/`. |
| `mobile/` | Flutter + Riverpod + Drift; layered `domain/` (interfaces, models, services) / `infrastructure/` / `presentation/`. Fork's UI goes in `mobile/lib/features/files/`. |
| `packages/sdk` | `@immich/sdk`, **generated** from `open-api/immich-openapi-specs.json` via oazapfts. Consumed by `web` and `packages/cli`. |
| `mobile/openapi/` | Generated Dart client. |
| `machine-learning/` | Python + FastAPI, ONNX models. Untouched by Drive work. |
| `e2e/` | vitest API tests + Playwright web tests against a real docker stack. |

**OpenAPI is the client contract.** Changing a server DTO/controller means running `mise open-api` (builds server → `sync-open-api` → regenerates the TS SDK and Dart client) and committing the generated output. `check-openapi.yml` enforces this. Never hand-edit generated clients.

Server DI conventions worth matching: services take repositories via constructor injection; repositories stay dumb (no Immich-specific logic) — this is an explicit PR-checklist item. Unit tests are `*.spec.ts` colocated in `src/`, use globals (`vi`, `describe`) with no imports, and name the subject `sut`.

### File domain (the fork's actual work)

Current state after PR #3 — scaffolding only, not wired into `app.module.ts`:

- `storage.adapter.ts` — abstract `StorageAdapter` (`stat`/`list`/`open`/`write`/`move`/`copy`/`delete`). The domain must never import `node:fs`.
- `file-domain.service.ts` — `FileDomainService`, delegates to the injected adapter.
- `files.module.ts` — `FilesModule.register(AdapterClass)` dynamic module.
- `file-entry.ts` — `FileEntry` / `FileEntryType`.

Invariants (from ADRs 0001–0003):

- Arbitrary files are a **separate domain** from Immich `Asset`; any future link is a cross-domain reference, never inheritance.
- The **filesystem is authoritative** for bytes, names, and hierarchy; Postgres indexes identity, ownership, permissions, shares, versions, state. Files must stay human-readable and recoverable without the app, so reconciliation of a stale index is a normal supported operation.
- **HTTPS API is the primary access protocol**: byte ranges for streaming, short-lived scoped signed URLs for external players (never leak the session token), filesystem exports (read-only by default) for Jellyfin/Plex. SMB/WebDAV/FUSE are out of scope for the MVP.
- Paths are always resolved and validated server-side; host absolute paths never leave the server. Traversal, symlink escape, null bytes, and cross-user access must be rejected — and tested.

## Task & issue workflow

Work is tracked in **two places with different jobs** (`docs/tasks/README.md`): a versioned file `docs/tasks/NNNN-*.md` owns stable scope/constraints/acceptance criteria; the linked GitHub Issue owns live status, discussion, PR links, and validation output. Material scope changes update both. Durable decisions become ADRs in `docs/adr/`.

Before creating any task file, Issue, or PR, search existing Issues/PRs and the task files first — duplicate-prevention is an explicit rule.

State as of 2026-07-27 (`gh` targets `upstream` by default here — pass `--repo lor08/immich-drive`):

- Done: #2 file-domain scaffold (PR #3), #4/#6 CI & workflow policy (PRs #5, #7), architecture bootstrap (PR #1).
- In flight: **#8** secure read-only `LocalStorageAdapter` (draft PR #10, branch `agent/issue-8-local-storage-adapter`) — fd-based traversal under `/proc/self/fd`, `O_NOFOLLOW`, dev/ino revalidation, ranged reads, mutations explicitly unsupported. **#13** staged delivery backlog (draft PR #14).
- Open design work: **#9** migration path from existing Immich installs, **#11** fork release/publication pipeline (GHCR under `lor08/`, never upstream namespaces or signing identities).

Roadmap phases live in `docs/product/roadmap.md`: 1 file storage core → 2 web slice → 3 large files/playback → 4 external directories → 5 exports → 6 Flutter → 7 sharing/versions/quotas.

## Upstream sync

`origin` = `lor08/immich-drive`, `upstream` = `immich-app/immich`. Bring upstream changes in on a temporary `upstream-sync/*` branch, resolve there, and never mix a sync with a product change in one PR. `docs/architecture/upstream-sync.md` has the conflict checklist (watch for upstream introducing types named `File`, `Drive`, `Storage`, or `ExternalDirectory`, migration ordering, and generated-client drift).

Note `CONTRIBUTING.md` is inherited from upstream and speaks for `immich-app/immich` (including its "no LLM-generated PRs" policy); for this fork, `AGENTS.md` governs.

## Key documents

`AGENTS.md` · `docs/product/vision.md` · `docs/product/roadmap.md` · `docs/architecture/overview.md` · `docs/architecture/file-storage.md` · `docs/architecture/streaming.md` · `docs/architecture/external-directories-and-exports.md` · `docs/architecture/upstream-sync.md` · `docs/architecture/github-workflow-policy.md` · `docs/adr/000{1,2,3}-*.md` · `docs/tasks/`
