# Task tracking policy

Immich Drive separates long-term product planning from promoted implementation work. This keeps the complete product context durable without filling GitHub with premature or duplicate Issues.

## Planning layers

### Product roadmap

`docs/product/roadmap.md` describes the purpose, outcomes, and exit condition of each phase. It stays concise and does not attempt to track every implementation task.

### Delivery plan

`docs/product/delivery-plan.md` is the durable long-term backlog. It defines:

- stable backlog identifiers such as `P1-04`;
- ordered tasks for every product phase;
- dependencies and blockers;
- cross-cutting migration, release, security, backup, observability, repair, and compatibility work;
- evidence-based phase exit gates.

Backlog identifiers do not change when GitHub Issue numbers or chronological task-file numbers change.

### Task index

`docs/tasks/index.md` is the canonical registry for promoted work. It connects stable backlog identifiers to:

- chronological task files;
- GitHub Issues;
- implementation branches and pull requests;
- current status;
- dependencies and superseding decisions.

## Versioned task files

Files under `docs/tasks/` are the durable technical record for promoted work. They define:

- stable backlog ID;
- goal and boundaries;
- required architectural context;
- accepted scope and non-goals;
- acceptance criteria;
- agent instructions where useful;
- definition of done;
- links to the corresponding GitHub Issue and implementation pull request.

Task files are reviewed through pull requests and remain available with repository history even if GitHub Issues are later edited, closed, transferred, or disabled.

A task receives the next chronological `NNNN` filename when it is promoted. The chronological number is a record identifier; sequencing and dependencies come from the stable backlog ID and delivery plan.

## GitHub Issues

Issues are the live execution log. They track:

- current status and ownership;
- questions and discussion;
- decisions made during implementation;
- links to branches, commits, and pull requests;
- checklist progress;
- test and validation results;
- follow-up work discovered during implementation.

Do not create placeholder Issues for the whole future backlog. Create an Issue when a task is:

- ready to start;
- active;
- blocked and needs a visible decision;
- an architectural task whose result prevents irreversible implementation mistakes.

## Promotion rule

A backlog item is promoted in this order:

1. Confirm the stable backlog ID in `docs/product/delivery-plan.md`.
2. Search `docs/tasks/index.md` and existing task files for the same ID or capability.
3. Search open and closed Issues.
4. Search open, closed, and merged pull requests.
5. Search existing branches.
6. Create the next chronological task file.
7. Add or update the task-index row.
8. Create one linked GitHub Issue.
9. Create one dedicated branch from current `main`.
10. Open one focused draft pull request using the repository template.

One stable backlog ID may have only one active Issue and one active implementation pull request.

## Duplicate and no-op prevention

Before creating a task file, Issue, branch, or pull request, compare both the stable backlog ID and equivalent wording. Different titles do not make the same capability a different task.

Before updating a file:

- fetch the current branch and blob SHA;
- confirm the desired content materially differs;
- do not submit the same replacement content repeatedly;
- do not create placeholder or no-op commits;
- after a failed mutation, re-read repository state before retrying.

When a duplicate is discovered, preserve the canonical record, cross-link it, and close the duplicate with the appropriate reason.

## Synchronization rule

A material change to goal, scope, constraints, acceptance criteria, non-goals, sequencing, or dependencies must update:

- the delivery plan;
- the detailed task file;
- the linked Issue;
- the task index when status or links changed.

Routine status updates, investigation notes, comments, and validation output belong only in the Issue unless they represent a durable architectural decision.

Durable architectural decisions belong in an ADR and should be linked from the delivery plan, task file, and Issue.

## Lifecycle

1. Promote the backlog item through a reviewed task-file and index change.
2. Create or confirm the linked GitHub Issue.
3. Create a dedicated branch from current `main`.
4. Implement through a draft pull request.
5. Use the Issue as the live work log while keeping durable scope synchronized.
6. Complete inherited validation and human review.
7. Merge the implementation pull request.
8. Record final validation and close the Issue.
9. Mark the task `Done` in the index and delivery plan.
10. Keep the task file as historical documentation.
