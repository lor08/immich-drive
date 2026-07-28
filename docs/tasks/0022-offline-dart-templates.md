# Task 0022: Generate the Dart client without fetching templates

## Tracking

- Stable backlog ID: `P0-15`
- GitHub Issue: [#48 — Stop fetching Dart generator templates over the network](https://github.com/lor08/immich-drive/issues/48)

This versioned file is the source of truth for stable scope and acceptance criteria. GitHub Issue #48 is the live execution log.

## Status

Implementation in review.

## Problem

`generate-dart-sdk.sh` downloaded two mustache templates from `raw.githubusercontent.com` on every run and patched them, although the patched results are already committed. On PR #29 that download failed with `Unable to establish SSL connection`, which failed the required `OpenAPI Clients` check with nothing wrong in the code.

## Why the download existed

It was not decoration. `patch` is not idempotent, so the fetch reset each template to its unpatched upstream state before patching. Removing the fetch therefore also means removing the patch step: the committed templates already are the patched result.

## Decision

Generate from the committed templates. Keep the fetch and patch behind an explicit `--refresh-templates` flag, to be run when `OPENAPI_GENERATOR_VERSION` is bumped, and keep the `.patch` files for that purpose.

## Verified

Regenerating from the committed templates with the pinned generator produced **zero diff** against the committed client. That is the same procedure every Dart client in this fork has used since `P1-08`, across five API changes, each confirmed by the `OpenAPI Clients` check passing.

## The trade this makes, stated plainly

Templates stop being derived on every run, so a generator upgrade that changes upstream templates will not be noticed automatically. That risk is tied to a deliberate version bump, and the refresh flag plus the script's comment make it a step in that bump. The alternative — a random failure on every run — is worse.

## What this does not fix

Generation still reaches the network: `pnpm dlx @openapitools/openapi-generator-cli` downloads the generator jar. This removes the dependency on `raw.githubusercontent.com`, which is the one that actually failed, not every network dependency. Making generation fully offline would mean vendoring the jar or a container image, which is a larger change and not obviously worth it.

The other observed source of end-to-end flakiness — the database refusing connections after `docker compose up --wait` — is `P0-16` and is untouched here.

## Acceptance criteria

- [x] Generation succeeds without fetching templates.
- [x] The generated client is byte-identical to what is committed.
- [x] The refresh procedure for a generator upgrade is documented in the script itself.
- [x] The edited file is recorded in the seam inventory.
- [ ] `OpenAPI Clients` passes.

## Definition of done

A required check stops depending on a third-party host that has already broken it once.
