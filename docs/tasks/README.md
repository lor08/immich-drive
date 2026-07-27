# Task tracking policy

Immich Drive tracks implementation work in two places with intentionally different responsibilities.

## Versioned task files

Files under `docs/tasks/` are the durable technical record. They define:

- goal and boundaries;
- required architectural context;
- accepted scope and non-goals;
- acceptance criteria;
- Codex instructions;
- definition of done;
- links to the corresponding GitHub Issue and implementation pull request.

Task files are reviewed through pull requests and remain available with the repository history even if GitHub Issues are later edited, closed, transferred, or disabled.

## GitHub Issues

Issues are the live execution log. They track:

- current status and ownership;
- questions and discussion;
- decisions made during implementation;
- links to branches, commits, and pull requests;
- checklist progress;
- test and validation results;
- follow-up work discovered during implementation.

## Synchronization rule

A material change to goal, scope, constraints, acceptance criteria, or non-goals must update both the task file and its linked Issue.

Routine status updates, investigation notes, comments, and validation output belong only in the Issue unless they represent a durable architectural decision.

Durable architectural decisions belong in an ADR and should be linked from both the task file and Issue.

## Lifecycle

1. Add the versioned task file through a pull request.
2. Create the corresponding GitHub Issue and cross-link both records.
3. Implement the task in a dedicated branch and draft pull request.
4. Use the Issue as the work log while keeping scope synchronized.
5. Merge the implementation pull request.
6. Record final validation in the Issue and close it.
7. Keep the task file as historical documentation.
