# Task 0005: Complete staged delivery backlog

## Tracking

- Stable backlog ID: `P0-03`
- GitHub Issue: [#13 — Document complete staged delivery backlog](https://github.com/lor08/immich-drive/issues/13)
- Implementation pull request: [#14 — Add staged delivery backlog](https://github.com/lor08/immich-drive/pull/14)

## Status

In review in draft PR #14. The inherited formatter normalized the planning documents; fresh inherited checks run from this user-authored follow-up commit.

## Goal

Create a durable planning system that preserves the complete Immich Drive product direction across conversations, contributors, agents, upstream synchronization, and long pauses in development.

The system must describe all planned phases without creating dozens of premature GitHub Issues that become stale or duplicate later work.

## Deliverables

- `docs/product/delivery-plan.md` with stable phase task IDs, sequencing, dependencies, cross-cutting tracks, and evidence-based exit gates.
- `docs/tasks/index.md` with all promoted task files, Issues, pull requests, status, and dependencies.
- Updated `docs/tasks/README.md` defining promotion, synchronization, and duplicate-prevention rules.
- Updated `AGENTS.md` requiring agents to inspect the plan and existing GitHub records before creating new work.
- A roadmap link that distinguishes strategic outcomes from the detailed delivery backlog.

## Planning model

### Roadmap

`docs/product/roadmap.md` describes product outcomes and phase exit conditions. It should remain compact and understandable to a reader who does not need implementation detail.

### Delivery plan

`docs/product/delivery-plan.md` is the complete long-term backlog. Every planned capability has a stable ID such as `P1-04`. These identifiers do not depend on GitHub Issue or chronological task-file numbers.

### Task index

`docs/tasks/index.md` is the canonical registry of promoted work. It connects stable backlog IDs to chronological task files, Issues, branches, pull requests, dependencies, and status.

### Detailed task files

A `docs/tasks/NNNN-*.md` file is created when a backlog item becomes ready, active, blocked, or needs an architectural decision. The file owns durable scope, constraints, acceptance criteria, and definition of done.

### GitHub Issues

Issues are created only for promoted work. They own live discussion, status, implementation notes, validation, and follow-up findings. Backlog items do not receive placeholder Issues merely to reserve numbers.

## Duplicate-prevention requirements

Before creating an Issue, task file, branch, or pull request, an agent must:

1. Read `docs/tasks/index.md` and search `docs/product/delivery-plan.md` for the stable backlog ID and equivalent wording.
2. Search open and closed Issues.
3. Search open, closed, and merged pull requests.
4. Search existing branches.
5. Confirm that no active record already represents the same capability.
6. Record the stable backlog ID in the new task file, Issue, branch description or name where practical, and pull request.

An agent must not repeat a file update when the intended content is unchanged. It must fetch the current blob SHA, compare the desired change conceptually, and skip no-op commits.

## Scope

- Documentation and agent-process rules only.
- No runtime source changes.
- No GitHub Actions behavior changes.
- No mass creation of future Issues.
- No milestones, release dates, or estimates that have not been explicitly decided.

## Acceptance criteria

- [ ] Every roadmap phase has an ordered task breakdown.
- [ ] Migration, release engineering, upstream sync, backups, observability, security, repair, compatibility, privacy, and documentation are represented.
- [ ] Every promoted task and existing Issue/PR is represented in the task index.
- [ ] Stable backlog IDs are independent of Issue and task-file numbering.
- [ ] The repository clearly states when to create a detailed task file and when to create an Issue.
- [ ] Agent instructions require duplicate searches before any new work record.
- [ ] No runtime or workflow file is changed.
- [ ] Inherited formatting and docs build checks pass.

## Definition of done

A new contributor or coding agent can enter the repository with no conversation history, identify the complete intended product, find the current task and its dependencies, understand what comes next, and avoid creating a duplicate Issue, branch, task file, or pull request.
