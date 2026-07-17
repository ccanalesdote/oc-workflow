---
name: local-architecture
description: Use after Architect selects local mode to turn a bounded single-repository or single implementation-boundary design into an executable local implementation handoff, including local consumption of a matching cross-repo draft.
---

# Local Architecture

This playbook is loaded **only after Architect selects `local` mode**. It is the
handoff-producing architecture playbook for a feature that can be implemented
within one repository or one bounded implementation unit without negotiating a
changed shared contract. It is also the playbook for a local Architect that is
consuming a matching `repos/{repo}.md` cross-repo draft: the draft is binding
input, but the resulting handoff remains local.

The common Architect role, five-step design protocol, mode declaration,
playbook exclusivity, and generic safety rules live in `templates/architect.md`.
Do not load or reconstruct the cross-repo architecture playbook for the same
handoff.

## Local-mode boundary

Local mode applies when one repository or bounded implementation unit can own
the implementation without negotiating a changed contract across an
independently owned, deployed, or consumed boundary. A feature is still local
when a workspace contains other repositories, when it changes many files, or
when its internal structure is complex, provided no other boundary must change.

If reconnaissance finds that another independent repository, service,
deployment unit, or shared consumer must change, stop before persisting the
local handoff. Return to the Architect kernel, declare the transition to
`cross`, load `cross-repo-architecture`, and produce a fresh cross artifact.
Do not mix local and cross artifact schemas.

## Local handoff procedure

### Direct chat handoff

When the user requests a direct chat handoff, do not write files or create a
branch or worktree. Return a complete local implementation handoff in chat:

- goal and measurable success criteria;
- constraints, scope, non-goals, and edge cases;
- the recommended design and its tradeoffs;
- acceptance criteria, implementation tasks, dependencies, and verification;
- the local Implementation Contract described below.

The chat handoff must be self-contained. Do not rely on a parent cross brief
being available to Developer.

### Persistent local handoff

For a persistent local handoff, use exactly this shape inside the selected
repository or current checkout:

```text
.path/work/{feature-slug}/
  brief.md
  tasks.md
  progress.md
```

`{feature-slug}` is kebab-case, contains no spaces, and is confirmed before
writing. A local handoff does not contain `repos/` drafts unless the user is
separately preserving a cross artifact; do not create cross coordination
artifacts from this playbook.

#### Current checkout

After the user selects the current-checkout mode, confirm the slug and inspect
the target folder for collisions. Create `.path/work/{slug}/` in the current
checkout and write only `brief.md`, `tasks.md`, and `progress.md`. Do not create
a branch or worktree.

#### Dedicated worktree

Use a dedicated worktree only when the user explicitly selects that mode. The
worktree is `../{repo-name}-{slug}/`, the branch is `feature/{slug}`, and the
work folder is `.path/work/{slug}/` inside that worktree. Apply the Architect
kernel's complete common Mode 3 preflight before creation: check the sibling
directory, registered worktrees, and branch; stop on any collision without
overwrite, silent reuse, or auto-increment; show worktree path, work-folder
path, branch, and base together; and wait for explicit approval before
`git worktree add` or artifact creation. This playbook does not replace or
weaken that preflight. Do not make implementation changes in a different
checkout from the one that owns the handoff.

#### Slug and collision handling

- Confirm a user-provided slug exactly; otherwise propose a kebab-case slug and
  wait for confirmation.
- Never auto-increment, silently rename, overwrite, reuse, or move a slug.
- If the work folder exists, inspect it or ask whether to reuse, append,
  replace, stop, or choose another slug.
- If `brief.md`, `tasks.md`, or `progress.md` already exists, do not overwrite
  it without an explicit choice.

## `brief.md` local schema

Write a self-contained brief with these sections:

```markdown
# Brief: {feature-title}

## Objective
## Problem
## Scope
## Non-goals
## Constraints
## Decisions
## Implementation Contract
### Target files and areas
### Expected changes by area
### Contracts / invariants / compatibility to preserve
### Decisions already made
### Normal flow to encode
### Escalation contract
### Do not touch / do not introduce
## Relevant files and areas
## Acceptance Criteria
## Edge cases
## Open questions
## Assumptions and residual risks
```

`## Implementation Contract` is mandatory and binding. A persistent local
handoff is incomplete without every required subsection above. The contract
must be concrete enough for Developer to implement without inventing
architecture, public behavior, compatibility rules, or scope.

### Target files and areas

Name exact files when known. If reconnaissance is required, name a concrete
folder, glob, or bounded area and explain why. Do not use vague references such
as "related modules" or "where appropriate".

### Expected changes by area

Describe the observable change required in each target file or area. Preserve
existing project conventions and prefer the smallest localized implementation.

### Contracts, invariants, and compatibility

List interfaces, serialized formats, API/DTO/event/auth/error contracts,
behavioral invariants, and compatibility constraints that must not break.
When a matching cross draft is consumed, copy only the code-affecting shared
contracts and compatibility obligations into this section. The local brief
must remain self-contained because the parent cross artifact may not be in the
repository.

### Decisions already made

Record material technical, architectural, compatibility, testing, and process
decisions that Developer must follow. Do not leave material decisions only in
chat or in `progress.md`.

### Normal flow to encode

Describe the expected user or caller flow, including success, error, and edge
case behavior. State the observable result that verification should confirm.

### Escalation contract

If Developer finds a contradiction, technical impossibility, or material gap,
Developer must append this entry to `progress.md` and stop the affected area:

```markdown
## Escalation to Architect

### Task / checkpoint
<task and checkpoint>

### Problem
<specific contract or implementation problem>

### Evidence
<paths, line numbers, contract quotes, errors, or command output>

### Impact
<blocked tasks, acceptance criteria, or checkpoint>

### Proposed options
<at least one concrete path with tradeoffs>

### Status
blocked awaiting Architect decision
```

Architect must persist any material resolution that changes scope, behavior,
compatibility, or artifact shape into `brief.md` and/or `tasks.md`. A decision
only in `progress.md` is not binding.

### Do not touch / do not introduce

State explicit exclusions for the handoff. At minimum, do not add agents,
plugins, hooks, dependencies, runtime enforcement, mandatory worktrees, or
persistent artifacts outside the local three-file shape unless the contract
explicitly requires an already-approved exception. Do not turn a local
handoff into a cross coordination plan.

## Acceptance criteria and coverage mapping

Acceptance criteria are observable feature outcomes, not implementation chores.
Give each criterion a stable ID such as `AC-01`. Every criterion must be
covered by at least one task in `tasks.md`, and every task must list the AC IDs
it covers. Criteria must be specific enough for an implementer and Reviewer to
verify independently.

When consuming a cross draft, convert only repo-controlled implementation
behavior into local acceptance criteria. Do not copy cross coordination
metadata, repo responsibility tables, rollout ownership, or other coordination
context as local ACs.

## `tasks.md` local schema

Use the following structure:

```markdown
# Tasks: {feature-title}

## Status legend
- pending: not started
- in_progress: actively being implemented
- done: completed and verified for the stated task
- blocked: cannot proceed without input or prerequisite
- cancelled: intentionally no longer needed

## Task table
| ID | Status | Owner | Files / areas | Technical objective | Covers | Dependencies | Verification | Notes |
|---|---|---|---|---|---|---|---|---|

## Checkpoints
| ID | Included tasks | Intended ACs closed | Reviewer focus | Expected evidence | Reviewer required |
|---|---|---|---|---|---|

## Coverage notes

## Auditor notes
```

Every task is atomic and names exact files or bounded areas, a concrete
technical objective, covered AC IDs, dependencies, and an independently
verifiable command or observable check. Tasks describe implementation work,
not unresolved architecture decisions. Every task belongs to a checkpoint.

Checkpoints are risk-based quality gates. Each checkpoint names its included
tasks, intended ACs, Reviewer focus, expected evidence, and `Reviewer required:
yes`. The final checkpoint is the final feature review. Architect does not
invoke Reviewer; the user or Developer invokes Reviewer at checkpoint closure.

## `progress.md` local execution log

Keep `progress.md` append-only and self-contained for a later session. At each
meaningful stopping point record:

```markdown
### <YYYY-MM-DD HH:mm> — <Agent> — <short summary>

#### Current Task
- <task ID or none>

#### Current Status
- <one-line state>

#### What Was Attempted
- <what was tried>

#### What Changed
- <observable outcomes>

#### Files Touched
- <paths>

#### What Remains
- <next steps>

#### Validation Run
- <commands/checks actually run, or none>

#### Validation Missing
- <commands/checks not run, or none>

#### Decisions Made
- <decisions worth preserving>

#### Notes for Next Session
- <safe recovery context>

#### Do Not Touch
- <scope guardrails>
```

The log is not a substitute for the brief or task contract. Do not hide
material decisions in it.

## Technology-agnostic verification

Use validation commands documented by the repository. Do not invent a package
manager, test runner, linter, formatter, or build command as a placeholder.
If the repository's commands are not known, include a bounded discovery step
for its README, package/build configuration, task runner, or CI files. Each
task and acceptance criterion must still state what observable result proves it
complete.

## Local consumption of a cross-repo draft

When `repos/{repo}.md` is present for the current repository:

1. Load this local playbook only; do not load the cross playbook for the local
   implementation handoff.
2. Match the draft by its stated repository or service identity, not by a
   directory-name guess.
3. Treat code-affecting shared API, DTO, event, auth, error, and compatibility
   obligations as binding input and copy them into the local Implementation
   Contract.
4. Decide internal data access, query design, module layout, files, tests,
   migrations internal to this repository, and local configuration locally,
   unless one of them changes a shared contract.
5. Do not copy coordination-only context into local tasks, ACs, checkpoints, or
   validation evidence.
6. If the matching draft is missing or the binding contract is impossible,
   ask for it or block and escalate. Never guess or silently weaken it.

## Safe local-mode transitions

- **Local → cross:** stop before persisting the local `brief.md`, `tasks.md`,
  or `progress.md`; explain the newly discovered boundary, return to the
  kernel, load `cross-repo-architecture`, and create a fresh cross artifact.
- **Apparent cross → local:** explain why no independent boundary or shared
  contract changes, load this playbook, and produce the normal local shape
  without empty repo drafts.

## Local implementation-ready exit gate

Before declaring a local persistent handoff ready, verify all of the following:

1. `brief.md` contains the complete Implementation Contract and all required
   subsections: target files/areas, expected changes by area,
   contracts/invariants/compatibility, decisions already made, normal flow,
   escalation contract, and do not touch/do not introduce.
2. No material product, scope, behavior, security, compatibility, migration,
   or architecture decision remains unresolved.
3. Every task is executable without Developer inventing architecture or public
   behavior, and every AC is mapped to at least one task.
4. The checkpoints section exists, every task belongs to a checkpoint, and
   each checkpoint has Reviewer focus and expected evidence.
5. The handoff is internally consistent, preserves existing local contracts,
   and contains no stale cross-only coordination or post-commit ownership.

Only then may Architect persist the local handoff. If the required
`local-architecture` skill is unavailable or cannot be loaded in the current
session, stop and report the problem rather than reconstructing this procedure
from memory.

<!-- managed-by: opencode-path -->
