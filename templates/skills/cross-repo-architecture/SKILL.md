---
name: cross-repo-architecture
description: Use when a feature or task spans multiple Git repositories, services, packages, frontends, backends, or deployment units, or when an API/contract is shared across teams or repos. Defines the cross-repo handoff protocol Architect uses to produce a parent-level coordination brief plus one contract-bound draft per affected repo, and the boundary between shared (binding) decisions and repo-local decisions.
---

# Cross-Repo Architecture

This skill is loaded by Architect when a feature affects **multiple repositories, services, packages, frontends, backends, or deployment units**. It defines the cross-repo handoff protocol and separates decisions that Architect must own from decisions that repo-local Architect may decide independently.

## When to activate

Architect must load this skill when the feature under design touches **any** of:

- Multiple Git repositories
- Multiple services (even in the same repo)
- Multiple deployment units (e.g., separate backend, frontend, worker, CLI)
- A contract or API consumed by another team/service
- Shared data models, events, or auth that span boundaries
- Rollout ordering that depends on multiple repos changing

If unsure, activate the skill. It is cheaper to activate and not need cross-repo output than to miss the coordination.

## Cross-mode output (parent-level handoff)

When Architect operates in **cross mode** (outside any single child repo, or in a parent coordination workspace), it produces a **parent-level coordination handoff** plus one **contract-bound draft** per affected repo.

### Work folder structure

```
cross-handoff/
  brief.md              — parent-level design: overall goal, shared contracts, rollout order
  tasks.md              — coordination tasks: which repo changes what, in what order
  progress.md           — cross-mode execution log
  repos/{repo}.md       — one contract-bound draft per affected repo
```

### `brief.md` (cross-mode)

The cross `brief.md` owns the **shared architecture decisions** that apply across all repos:

- **Shared contracts**: API surface, DTO shapes, event schemas, auth model, error format
- **Rollout order**: which repo must change first, which can follow
- **Compatibility rules**: what must not break during rollout, versioning strategy
- **Repo responsibilities**: which repo owns which part of the feature
- **Escalation contract**: how repo-local Architect escalates conflicts

The cross `brief.md` is a **coordination artifact** that may live outside any single repo's Git history. It is the single source of truth for cross-repo decisions.

### `repos/{repo}.md` — Contract-bound draft

Each `repos/{repo}.md` is a **binding upstream contract** written for a specific repo. It contains:

```markdown
# Cross-Repo Contract: {repo-name}

## Target repo
- **Name**: {repository or service name}
- **Path/URL**: {where this repo or service lives}
- **Identity note**: {if repo directory name differs from service name}

## Shared contracts (binding)
### API / interface contract
- {endpoint, method, request/response shape, auth requirements}

### DTO / data contract
- {schema, fields, validation rules, versioning}

### Event contract (if applicable)
- {event name, payload shape, publisher, consumers}

### Auth / authorization contract
- {who authenticates, token format, required scopes}

### Error contract
- {error format, expected HTTP codes, retry behavior}

## Compatibility constraints
- {what behavior, API shape, or data format must not change}
- {versioning or deprecation strategy}

## Rollout ordering
- {this repo changes before/after which other repo}
- {feature flags needed for gradual rollout}

## Local decision space (repo-local Architect owns these)
- File layout, helpers, utilities, and internal module structure
- Validation commands, test strategy within this repo
- Task breakdown and implementation ordering within this repo
- Local conventions (linting, formatting, naming) as long as contracts are met
- Non-shared infrastructure (database migrations internal to this repo)

## Prohibited local decisions (must NOT change)
- Shared API surface, DTO shapes, field names, or types
- Event schemas, topic names, or payload contracts
- Auth model, token format, or required scopes
- Error format, status codes, or retry contracts
- Rollout ordering or inter-repo dependency timing
- Compatibility guarantees or versioning strategy

## Escalation rules
If local constraints (stack, performance, existing architecture) prevent this repo from
satisfying a binding contract, repo-local Architect must **block and escalate** back to
the cross handoff. Do not silently relax, reinterpret, or partially implement the contract.

Escalation format:
- **Contract point**: {which shared contract is blocked}
- **Local constraint**: {what prevents implementation}
- **Evidence**: {measurement, existing code reference, architectural conflict}
- **Suggested adaptation**: {what would work locally}
```

### `tasks.md` (cross-mode)

Cross-mode `tasks.md` tracks coordination tasks, not implementation:

- **T-C01**: Validate cross contracts are internally consistent
- **T-C02**: Produce `repos/{repo}.md` for each affected repo
- **T-C03**: Verify rollout ordering is feasible
- **T-C04**: Confirm all shared contracts are covered by at least one repo draft

## Local-mode behavior (repo-local Architect)

When Architect runs **inside a child repo** and a cross-repo draft (`repos/{repo}.md`) exists:

### Consumption rules

1. **Treat the cross draft as a binding upstream contract.** It is not negotiable at the local level.
2. **Create a normal local handoff** (`brief.md`, `tasks.md`, `progress.md`) inside `.path/work/{feature-slug}/`.
3. **Copy all binding contract constraints** from the cross draft into the local `brief.md` under `## Implementation Contract`. The cross handoff may not be in Git; the local handoff must be self-contained.
4. **Own local decisions**: file layout, helpers, commands, task breakdown, validation steps, internal module structure, non-shared infrastructure.
5. **Must not change shared decisions**: API surface, DTO shapes, event schemas, auth, error format, rollout ordering, compatibility guarantees.
6. **Escalate conflicts**: if local constraints make the contract impossible, block and escalate. Do not adapt the contract silently.

### When cross draft is missing

If the user says the feature is cross-repo but only provides a parent `brief.md` without a matching `repos/{repo}.md`:

1. Ask the user for the relevant repo draft.
2. If the local responsibility is ambiguous without the draft, **block** and do not produce a local handoff.
3. Do not guess which parts of the parent brief apply to this repo.

### Repo identity

Repo names in `repos/{repo}.md` may not match directory names exactly. The cross handoff must state the intended repo/service identity clearly. Local Architect should match by stated identity, not by directory name guesswork.

## Cross-mode escalation (repo-local → cross)

When repo-local Architect escalates a contract conflict:

1. Repo-local Architect records the block in `progress.md` with the escalation format above.
2. Cross Architect (or the user) reviews the escalation and decides:
   - Adapt the shared contract (update cross `brief.md` and affected `repos/{repo}.md`)
   - Accept the local constraint as-is and adjust scope
   - Reject the escalation and require the repo to adapt
3. Any material decision that changes the contract must be persisted in `brief.md` and/or `tasks.md`. Decisions only in `progress.md` do not count.

## Edge cases

- **Feature starts single-repo, becomes cross-repo**: Architect discovers another repo/service must change. Switch to cross mode before finalizing the implementation handoff. Produce `repos/{repo}.md` drafts for all affected repos.
- **Cross handoff lives outside Git and disappears**: Each local `brief.md` must copy shared constraints so the contract survives. Local handoffs must be self-contained.
- **Local repo cannot implement due to real constraints**: Block and escalate. Do not weaken the contract silently.
- **Repo names differ from directory names**: Match by stated identity in the cross draft, not by filesystem guesswork.
- **Multiple repos in the same monorepo**: Still produce separate `repos/{repo}.md` per service boundary. Don't assume they share a stack or commands just because they share a repo.

## Graphify in cross-repo work

Graphify graphs and `.path/graphify-state.json` freshness metadata are **per repository**. In cross-repo exploration:

- Explorer may use each repo's graph/state independently as an optional navigation aid for understanding structure, dependencies, and likely impact areas within a single repo.
- Do **not** combine graph output from multiple repos into a shared graph, a unified representation, or a cross-repo contract source.
- Shared API surfaces, DTO shapes, event schemas, auth models, error formats, and rollout ordering must **still be verified from source files and explicit contracts** (see `## Shared contracts (binding)`), not inferred from Graphify output alone.
- If a repo's graph is stale or missing, Explorer falls back to normal source exploration within that repo. Graph freshness does not block cross-repo architecture decisions.

## Do not introduce

- Do not create a separate `cross-architect` agent. This skill is loaded by Architect.
- Do not give Architect broad child-repo write permissions by default.
- Do not turn a parent workspace into a monorepo.
- Do not assume all repos share stack, commands, or architecture.
- Do not make repo-local Architect redesign shared contracts.

<!-- managed-by: opencode-path -->
