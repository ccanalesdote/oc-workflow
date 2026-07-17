---
name: cross-repo-architecture
description: Use after Architect selects cross mode to coordinate responsibilities, shared contracts, compatibility, and development ordering across independent repositories, services, or deployment units without producing a local implementation plan.
---

# Cross-Repo Architecture

This playbook is loaded **only after Architect selects `cross` mode**. It
produces a minimal coordination contract for independently owned or deployed
implementation boundaries. It is not a local implementation plan, a Developer
task list, or a post-commit operations plan.

Do not load this playbook for a feature contained in one repository or one
bounded implementation unit, even when the workspace contains several
repositories. A local Architect consuming one repo draft loads
`local-architecture` only; the draft is binding input, not a reason to rerun
cross coordination.

## When to activate

Select cross mode and load this playbook only when at least one actual boundary
requires coordination:

- independently owned Git repositories must change together;
- separately deployed services, frontends, backends, workers, CLIs, or other
  deployment units must change together;
- a shared API, DTO, event, serialized payload, auth model, error format, or
  compatibility guarantee consumed across a boundary changes;
- development ordering is required so independently released units remain
  compatible while the feature is introduced.

The following are negative examples and remain local unless a real boundary or
shared contract also changes:

- a multi-repo workspace where only one repository is affected;
- a large or difficult feature with many files in one repository;
- a monorepo with several packages owned and deployed as one implementation
  boundary;
- the mere presence of other repositories, directories, or packages.

If bounded reconnaissance proves that no independent boundary or shared
consumer changes, return to the Architect kernel, declare apparent-cross →
local, and load `local-architecture`. Do not create empty repo drafts.

## Cross coordination output

The cross artifact is a compatibility and responsibility contract. It records
what boundaries must agree on and what each repo owns, while leaving internal
implementation choices to a later local Architect.

### Persistent shape

A persistent cross handoff contains exactly:

```text
.path/work/{feature-slug}/
  brief.md
  repos/{repo}.md
```

Create one `repos/{repo}.md` draft for each affected implementation boundary.
The cross work folder contains **no `tasks.md` and no `progress.md`**. It also
contains no local acceptance criteria, Developer tasks, local checkpoints,
local validation commands, evidence receipts, or post-commit operational
artifacts.

### Cross `brief.md`

The parent brief must be self-contained and contain these coordination
sections:

```markdown
# Cross-Repo Coordination Brief: {feature-title}

## Objective
## Participating repositories and responsibilities
## Shared contracts
### API / interface contract
### DTO / data contract
### Event contract
### Auth / authorization contract
### Error contract
## Compatibility matrix
## Development ordering constraints
## Repository drafts
## Open cross decisions
## Escalation
```

The sections may use an equivalent old/new compatibility table when that is
clearer than a matrix. The brief must identify producers and consumers, old and
new behavior, compatibility obligations during transition, and any ordering
constraint necessary to keep independently developed changes compatible.

#### Responsibilities

State which repository, service, or deployment unit owns each cross-visible
responsibility. Assign responsibility at the boundary level; do not dictate
internal module layout, queries, tests, files, or migration mechanics.

#### Shared contracts

Define only contracts that cross a boundary and are binding for affected repo
drafts:

- API or interface endpoints, methods, request/response shapes, and auth
  requirements;
- DTO or serialized data fields, validation, versioning, and compatibility;
- event names, payloads, publishers, consumers, delivery assumptions, and
  idempotency where relevant;
- authentication and authorization expectations, token shape, and scopes;
- stable error shape, status/code semantics, and retry behavior.

If a contract is not known, record it as an open cross decision or escalate;
do not let a repo-local Architect invent it.

#### Compatibility and ordering

Use a compatibility matrix or equivalent explicit old/new rules. State which
old producers and consumers remain compatible with which new versions, whether
additive or breaking changes require versioning or a staged adapter, and which
development order is necessary.

It is valid to state “producer changes after consumer support” or an equivalent
development constraint. This playbook may define the constraint, but does not
manage, deploy, prove, or collect evidence for the later rollout, migration,
flag activation, scheduler activation, QA, or production operation.

#### Open decisions and escalation

Keep unresolved decisions that affect more than one boundary in `## Open cross
decisions`. Do not hide them in repo drafts. If a shared contract is ambiguous,
contradictory, or impossible, block and use the escalation format below rather
than weakening it locally.

### `repos/{repo}.md` draft

Create exactly one draft for every affected repository or implementation
boundary. Match a draft by its stated identity, not by an assumed directory
name. Each draft must contain:

```markdown
# Cross-Repo Draft: {repo-name}

## Target identity
## Assigned responsibility
## Binding shared contracts
### API / interface contract
### DTO / data contract
### Event contract
### Auth / authorization contract
### Error contract
## Compatibility obligations
## Development ordering constraints
## Local decision space
## Prohibited local decisions
## Escalation
```

The draft is a binding input for a later Architect session in that repository.
It must include:

- target repository/service identity, path or URL, and identity notes when the
  directory name differs;
- responsibility assigned to this boundary;
- the code-affecting shared contracts this boundary must satisfy;
- compatibility obligations and old/new behavior it must preserve;
- development-order constraints that affect implementation sequencing;
- the decisions the local Architect may make;
- decisions the local Architect must not change; and
- the escalation format for an impossible or contradictory contract.

## Local decision space

Unless changing one of the shared contracts above, these remain the local
Architect's decisions inside each repository:

- internal data access and query design;
- module, package, and file layout;
- helpers, algorithms, and internal interfaces;
- tests and verification strategy internal to that repository;
- migrations internal to that repository;
- local configuration and non-shared infrastructure;
- task breakdown and implementation ordering within the repository.

The cross brief must not prescribe these details. The local Architect later
converts only repo-controlled implementation behavior into local acceptance
criteria, tasks, checkpoints, and validation. Coordination context stays in the
cross artifact and is not copied indiscriminately into a local contract.

## Explicit cross exclusions

Cross artifacts must not contain or own:

- local acceptance criteria;
- Developer implementation tasks;
- checkpoints or local progress logs;
- repository validation commands, evidence receipts, or post-commit proof;
- QA or production deployment management;
- operational migration execution or runtime migration evidence;
- feature-flag or runtime activation;
- scheduler activation;
- deployed smoke requirements or release approval.

Compatibility-preserving development order may be stated as a constraint. The
cross Architect does not manage or prove the later deployment or operations.

## Escalation contract

When a repo-local Architect finds that a binding cross contract cannot be met,
the issue must be escalated without silently relaxing or reinterpreting the
contract:

```markdown
## Escalation to cross architecture

### Target repository / boundary
<affected identity>

### Contract point
<shared API, DTO, event, auth, error, or compatibility rule>

### Local constraint
<what prevents implementation>

### Evidence
<source path, measurement, existing behavior, or error>

### Impact
<blocked responsibility or compatibility consequence>

### Proposed options
<at least one concrete adaptation with tradeoffs>

### Status
blocked awaiting cross architecture decision
```

Material resolutions must be persisted in the cross `brief.md` and all
affected repo drafts. A decision only in chat or a local progress log is not a
binding cross decision.

## Safe transition from local mode

If local reconnaissance discovers a consumer, independent owner, deployment
unit, or shared contract that must change, stop before persisting the local
`brief.md`, `tasks.md`, or `progress.md`. Declare `Mode: cross`, explain the
new boundary, load this playbook, and create a fresh cross artifact with one
draft per affected boundary. Never mix local and cross schemas.

## Dedicated worktree transport

When a cross coordination handoff uses a dedicated worktree, use the Architect
kernel's complete common Mode 3 preflight. Check the sibling directory,
registered worktrees, and `feature/{slug}` branch; stop on any collision without
overwrite, silent reuse, or auto-increment; show worktree path, work-folder
path, branch, and base together; and wait for explicit approval before creation.
This playbook does not replace or weaken that preflight. The resulting cross
artifacts remain only `brief.md` plus `repos/{repo}.md` drafts.

## Graphify in cross-repo work

Graphify graphs and `.path/graphify-state.json` freshness metadata remain per
repository. They may help navigate each repository, but shared API surfaces,
DTOs, event schemas, auth, errors, and ordering must be verified from source
files and explicit contracts, never inferred from graph output alone. A stale
or missing graph does not block cross architecture.

## Do not introduce

- Do not create a separate `cross-architect` or `cross-auditor` agent.
- Do not give Architect broad child-repository write permissions.
- Do not turn a parent workspace into a monorepo or assume repos share a stack.
- Do not redesign shared contracts from a repo-local handoff.
- Do not add cross `tasks.md`, `progress.md`, local ACs, checkpoints, runtime
  enforcement, plugins, hooks, dependencies, or post-commit operations.

<!-- managed-by: opencode-path -->
