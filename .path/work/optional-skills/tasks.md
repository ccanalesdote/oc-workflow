# Tasks: Optional Skills System

## Status legend
- pending: not started
- in_progress: actively being implemented
- done: completed and verified for the stated task
- blocked: cannot proceed without input or prerequisite
- cancelled: intentionally no longer needed

## Checkpoints
| ID | Status | Review gate | Tasks included | Intended ACs | Expected evidence |
|---|---|---|---|---|---|
| CP-01 | done | Reviewer checkpoint | T-001, T-002, T-003 | AC-01, AC-02, AC-11 | Catalog/types and five skill templates exist; unit/template tests or equivalent validation prove core/optional distinction and template validity. |
| CP-02 | done | Reviewer checkpoint | T-004, T-005, T-006 | AC-03, AC-04, AC-05, AC-06, AC-07, AC-08 | Init, skills command, and uninstall tests cover install/remove/dry-run/conflict behavior. All 356 tests pass. |
| CP-03 | done | Reviewer checkpoint | T-007 | AC-09, AC-10 | Agent templates contain concise activation guidance and Developer limited-mode guardrails. |
| CP-04 | done | Final Reviewer gate | T-008, T-009 | AC-11, AC-12, AC-13 | Full validation commands pass: typecheck, test, build, validate-dist. |
| CP-05 | done | Reviewer content checkpoint | T-010 | AC-02, AC-09, AC-10, AC-11 | Reviewer verifies the five optional `SKILL.md` files are precise runtime instruction contracts, not generic prose, and preserve role-specific guardrails. | T-010 done by Developer; Reviewer CP-05 PASS. |

## Task table
| ID | Status | Owner | Task | Covers | Verification | Notes |
|---|---|---|---|---|---|---|
| T-001 | done | Developer | Inspect current managed skill, init, command, uninstall, UI, and test patterns before editing. | AC-01, AC-03, AC-05, AC-08, AC-12 | Record findings in `progress.md`; no product behavior change yet. | Focus on `src/lib/skills.ts`, `src/lib/paths.ts`, `src/commands/init.ts`, `src/commands/agents.ts`, `src/commands/uninstall.ts`, `src/cli.ts`, `src/lib/ui.ts`, `src/lib/messages.ts`, and related tests. |
| T-002 | done | Developer | Refactor/extend managed skill catalog and library support to distinguish core and optional skills. | AC-01, AC-07, AC-11, AC-12 | Unit tests show catalog lists one core skill and five optional skills; core install behavior remains intact. | Preserve existing public behavior where possible; avoid scattering optional skill names across command files. |
| T-003 | done | Developer | Add the five optional skill templates with valid frontmatter, managed marker behavior, and focused protocol content. | AC-02, AC-09, AC-10, AC-11 | Template validation tests pass for all managed skills; each new skill has matching `name` and useful trigger-oriented `description`. | Skills: `migration-and-data-change`, `api-contracts`, `security-boundary-review`, `incident-recovery`, `test-strategy`. Keep each skill narrow and role-aware. |
| T-004 | done | Developer | Add optional skill installation step to `opencode-path init`. | AC-03, AC-04, AC-12 | Init tests cover fresh default unchecked optional skills, explicit optional install, project/global path behavior if existing test style supports it, dry-run, and conflict preservation. | `init` should install selected optional skills only; do not remove optional skills when unchecked in init. `--yes` must not install optional skills by surprise. |
| T-005 | done | Developer | Implement and register `opencode-path skills` for optional skill target-state management. | AC-05, AC-06, AC-07, AC-11, AC-12 | Command tests cover checked install, unchecked remove, unchanged active, dry-run, conflicts, and project/global scope. CLI registration is in `src/cli.ts`. | Follow existing `agents` command standard: checkbox UX, summary lines, confirmation, dry-run, restart warning. Core skills are not removable here. |
| T-006 | done | Developer | Extend `uninstall` to remove all managed skills from the catalog while preserving unmarked/manual skill files. | AC-08, AC-12 | Uninstall tests cover managed core deletion, managed optional deletion, unmarked optional preservation, clear skip warning/summary, and empty directory cleanup where safe. | Do not delete unknown third-party skills or unmarked files. |
| T-007 | done | Developer | Add concise skill activation guidance to relevant agent templates. | AC-09, AC-10 | Reviewer verifies each relevant agent has the correct activation map without excessive prompt bloat. | Matrix: Architect uses migration/API/security/test; Developer uses all five in limited mode; Reviewer uses migration/API/security/test; Auditor uses all five, including incident recovery. Spec/Research/Explore do not directly invoke these skills. |
| T-008 | done | Developer | Harden validation and packaging coverage for managed skill templates. | AC-11, AC-12, AC-13 | Tests and/or `npm run validate-dist` prove built output can locate all skill templates and validation fails for invalid managed skill templates. | Include frontmatter/name/description checks if not already covered. Ensure `package.json` packaged files still include templates. |
| T-009 | done | Developer | Run final project validation and address regressions. | AC-12, AC-13 | `npm run typecheck`, `npm run test`, `npm run build`, and `npm run validate-dist` pass, or missing commands are explicitly documented in `progress.md` with user acceptance. | Invoke Reviewer at checkpoint boundaries and final feature closure. Do not mark CP-04 done until validation evidence is recorded. |
| T-010 | done | Developer | Replace/refine the five optional skill templates using the Architect-provided drafts below, preserving install/catalog behavior. | AC-02, AC-09, AC-10, AC-11 | `npm run test` passes and Reviewer confirms each skill matches the Architect-provided drafts in substance and preserves role-specific guardrails. | Content-only change to `templates/skills/{migration-and-data-change,api-contracts,security-boundary-review,incident-recovery,test-strategy}/SKILL.md`. Developer must not invent or materially change skill behavior, triggers, hard rules, decision gates, or output contracts without Architect approval. |

## Coverage notes
- AC-01 is covered by T-001 and T-002.
- AC-02 is covered by T-003, T-008, and T-010.
- AC-03 is covered by T-004.
- AC-04 is covered by T-004.
- AC-05 is covered by T-005.
- AC-06 is covered by T-005.
- AC-07 is covered by T-002 and T-005.
- AC-08 is covered by T-006.
- AC-09 is covered by T-003, T-007, and T-010.
- AC-10 is covered by T-003, T-007, and T-010.
- AC-11 is covered by T-002, T-003, T-005, T-008, and T-010.
- AC-12 is covered by T-002, T-004, T-005, T-006, T-008, and T-009.
- AC-13 is covered by T-008 and T-009.

## Architect content-review notes for T-010
- Overall: the current skill files are serviceable but too generic and documentation-like. Refine them into concise runtime instruction contracts inspired by Gentle-AI's `skill-style-guide`: trigger-first quoted description, `## Activation Contract`, `## Hard Rules`, `## Decision Gates`, `## Execution Steps`, `## Output Contract`, and optional local references only if needed.
- Overall: keep each skill narrow. Do not add tutorials, long motivation, or broad best-practice prose. Use compact decision tables for meaningful branches.
- Overall: preserve role separation. Architect defines strategy/contract, Developer executes only an existing contract and escalates missing decisions, Reviewer verifies implementation/evidence, Auditor checks traceability/evidence. Developer must not invent migration, API, security, incident-recovery, or test-scope decisions.
- `migration-and-data-change`: add explicit gates for additive nullable fields, required fields, rename/drop, enum changes, large-table indexes/constraints, backfills/data cleanup, existing invalid data, deployment order, rollback/compensation, batching/resumability, and the prohibition on editing/deleting applied production migrations without authorization.
- `api-contracts`: add explicit DTO/request/response shapes, validation rules, error status/code/retry behavior, backward compatibility as default, versioning/deprecation, event/webhook payloads, idempotency/retry semantics where applicable, rollout order, and contract test/sample payload evidence.
- `security-boundary-review`: add actor/resource/permission/ownership model, server-side trusted identity, manipulated-ID and cross-tenant checks, sensitive data in logs/errors/responses, admin/upload/webhook/payment/secrets triggers, rate-limit/idempotency/audit decisions, and reword “do not add auth checks” as “do not silently change the security model; escalate missing rules.”
- `incident-recovery`: refocus from broad production incident response to opencode-path agent/session recovery: wrong cwd, wrong worktree, Git accident/conflict, confusing tests, environment workaround, permission surprise, unexpected lockfile or migration mutation, repeated failed attempts. Include “freeze writes”, allowed diagnostics, required `progress.md` evidence, prohibited destructive commands/actions, and escalation to user/Architect/Auditor.
- `test-strategy`: make it proportional, not “tests always”. Add gates for pure logic, API/contract, DB/migration, auth/ownership/security, UI-only/copy/style, bugfix regression, cross-repo/public contract, and acceptable “no new test” with rationale. Preserve the rule that runtime behavior needs runtime evidence and project-documented commands must be discovered rather than invented.

## Architect-provided skill drafts for T-010

Developer must use these drafts as the source of truth for the five optional `SKILL.md` files. Minor wording cleanup is allowed only if it does not change activation triggers, hard rules, decision gates, role boundaries, or output contracts.

### `migration-and-data-change/SKILL.md`

```md
---
name: migration-and-data-change
description: "Trigger: Prisma migrations, SQL, schema.prisma, enums, indexes, constraints, backfills, persistent data changes. Plan safe data evolution."
license: MIT
metadata:
  author: opencode-path
  version: "1.0"
---

# Migration and Data Change

## Activation Contract

Load this skill when a change touches persistent data shape or semantics: Prisma migrations, SQL DDL/DML, `schema.prisma`, database enums, constraints, indexes, keys, backfills, required fields, data cleanup, serialized persisted formats, or compatibility with already-stored records.

## Hard Rules

- Architect owns migration strategy. Developer implements only an existing migration contract.
- Developer must stop if expand/contract, backfill, invalid-existing-data handling, rollback, or deploy ordering is missing for a risky change.
- Do not drop, rename, make non-null, tighten constraints, or remove enum values without an explicit compatibility and rollback/compensation plan.
- Existing invalid data must be handled explicitly; do not assume production data already matches the new schema.
- Large-table indexes, constraints, and backfills must consider locks, batching, resumability, and runtime impact.
- Applied production migrations must not be edited or deleted without explicit user authorization.

## Decision Gates

| Change type | Required strategy |
|---|---|
| Add nullable field with no required consumer | Simple additive migration plus validation. |
| Add required field | Expand/contract: nullable/default → backfill → enforce. |
| Rename/drop field | Add new field, dual-read/write if needed, backfill, contract cleanup later. |
| Enum change | Backward-compatible handling and old-version compatibility. |
| Large index/constraint | Non-blocking/concurrent/batched strategy or explicit downtime note. |
| Data cleanup/backfill | Idempotent script/query, batching, verification, rollback/compensation. |

## Execution Steps

1. Identify data stores, tables/models, fields, indexes, constraints, and consumers.
2. Classify the change: additive, contractive, destructive, backfill, cleanup, or performance-only.
3. Define migration order relative to code deploys.
4. Define rollback or compensation, including partial-migration handling.
5. Define validation evidence: schema diff, data checks, migration dry-run/test DB, affected queries, and before/after counts.
6. For Developer: verify the contract exists before editing; if not, record the gap and escalate.

## Output Contract

Return a migration note with: change type, expand/contract strategy, deploy order, backfill plan, invalid existing data handling, lock/index risk, rollback/compensation, validation evidence, and blockers.

<!-- managed-by: opencode-path -->
```

### `api-contracts/SKILL.md`

```md
---
name: api-contracts
description: "Trigger: API endpoints, DTOs, request/response, webhooks, events, SDKs, public contracts, frontend/backend changes. Define safe contracts."
license: MIT
metadata:
  author: opencode-path
  version: "1.0"
---

# API Contracts

## Activation Contract

Load this skill when a change affects an API or contract boundary: frontend/backend DTOs, public endpoints, SDKs, webhooks, events, serialized payloads, error formats, validation rules, producer/consumer compatibility, or cross-team interfaces.

## Hard Rules

- The contract must be explicit before implementation: request DTO, response DTO, validation, errors, auth assumptions, and compatibility.
- Backward compatibility is the default. Breaking changes require versioning, deprecation, or coordinated rollout.
- Developer may implement a defined contract but must not invent DTO fields, error codes, versioning, or compatibility behavior.
- Events and webhooks require idempotency/retry semantics when delivery can duplicate or fail.
- Contract tests, fixtures, sample payloads, or consumer-visible validation must be specified for non-trivial boundaries.

## Decision Gates

| Situation | Required contract decision |
|---|---|
| Add optional response field | Preserve old consumers; document field semantics. |
| Add required request field | Version, default, staged rollout, or compatibility adapter. |
| Change error behavior | Status, stable code, message shape, and retryability. |
| Webhook/event payload | Event name, schema, idempotency key, retry behavior, signature if applicable. |
| SDK/API public surface | Versioning and deprecation path. |
| Internal-only DTO | Local validation and focused tests may be enough. |

## Execution Steps

1. Identify producers, consumers, and whether the contract is public, cross-repo, cross-service, or internal.
2. Define request DTO, response DTO, validation rules, error contract, and compatibility rules.
3. Define versioning/deprecation if any field is removed, renamed, made required, or semantically changed.
4. Define rollout order when producer and consumer cannot deploy atomically.
5. Define contract verification: tests, sample payloads, snapshots, fixtures, or manual smoke.
6. For Developer: stop and escalate if the contract is ambiguous, contradictory, impossible, or missing required details.

## Output Contract

Return an API contract block with: endpoint/event name, producer, consumers, DTOs, validation, errors, auth assumptions, compatibility/versioning, rollout order, and contract test evidence.

<!-- managed-by: opencode-path -->
```

### `security-boundary-review/SKILL.md`

```md
---
name: security-boundary-review
description: "Trigger: auth, authorization, roles, ownership, tokens, sessions, uploads, webhooks, payments, secrets, admin endpoints. Review access boundaries."
license: MIT
metadata:
  author: opencode-path
  version: "1.0"
---

# Security Boundary Review

## Activation Contract

Load this skill when a change touches authentication, authorization, roles, permissions, ownership, tokens, sessions, admin endpoints, uploads, webhooks, payments, secrets, environment variables, user/tenant data, or cross-user resource access.

## Hard Rules

- Always identify the actor, target resource, permission rule, ownership model, and trust boundary.
- Ownership checks must happen server-side using trusted identity; never trust client-provided user IDs, tenant IDs, roles, or ownership claims.
- Sensitive data must not leak in responses, logs, errors, analytics, traces, screenshots, or progress artifacts.
- Webhooks, payments, and retryable external operations must consider replay, idempotency, signature/secret handling, and rate limits.
- Developer must stop if the authorization rule, ownership model, secret handling, or exposed-data policy is not defined.
- Do not silently change the security model; escalate missing or contradictory rules.

## Decision Gates

| Risk signal | Required check |
|---|---|
| Resource has user/tenant owner | Verify ownership using trusted server-side identity. |
| Admin endpoint | Verify role/scope and auditability. |
| Token/session handling | Expiry, revocation, storage, logging, and error behavior. |
| Upload | File type/size, path traversal, processing boundary, storage visibility. |
| Webhook/payment | Signature verification, idempotency, replay handling, rate limit. |
| Secret/env var | No hardcoding, no logs, documented deployment requirement. |

## Execution Steps

1. Define who can execute the operation and why.
2. Define how identity and ownership are established from trusted data.
3. Check manipulated IDs, missing auth, cross-tenant access, replay, and logging paths.
4. Decide whether rate limit, idempotency, or audit logging is required.
5. For Developer: implement only the defined checks; escalate missing security rules or unclear exposure decisions.

## Output Contract

Return a security boundary note with: actor, resource, permission rule, ownership check, denied cases, sensitive data handling, replay/idempotency/rate-limit decision, audit need, and unresolved risks.

<!-- managed-by: opencode-path -->
```

### `incident-recovery/SKILL.md`

```md
---
name: incident-recovery
description: "Trigger: wrong cwd, worktree accident, git conflicts, broken environment, confusing tests, failed recovery. Stop, collect evidence, escalate safely."
license: MIT
metadata:
  author: opencode-path
  version: "1.0"
---

# Incident Recovery

## Activation Contract

Load this skill when execution state becomes unsafe: wrong cwd, wrong worktree, accidental repo mutation, merge/rebase conflict, confusing test result, environment workaround, permission surprise, unexpected lockfile or migration change, repeated failed fix attempts, or any situation where continuing may make the repo worse.

## Hard Rules

- Stop modifying files immediately.
- Do not run destructive recovery commands without explicit user authorization.
- Do not use `git reset`, `git clean`, destructive checkout/restore, delete migrations, edit lockfiles “to fix it”, or force dependency reinstalls as a guess.
- Record evidence in `progress.md` when a work folder exists.
- Resume only after the user, Architect, or Auditor gives a clear next action.

## Allowed Diagnostics

Use read-only or low-risk diagnostics only: current directory and repo root, branch, git status/diff/log/worktree list, task/work-folder status, exact failing command output, and relevant config presence without exposing secrets.

## Decision Gates

| Incident | Action |
|---|---|
| Wrong cwd/worktree | Stop; report expected vs actual root. |
| Git conflict or unexpected diff | Capture status/diff; ask before recovery. |
| Confusing tests | Record command, output, environment assumptions, and changed files. |
| Migration/data incident | Stop; do not edit applied migrations or production-like data. |
| Repeated failed attempts | Escalate to Auditor or Architect with evidence. |

## Execution Steps

1. Freeze writes.
2. Identify scope: cwd, repo root, branch, work folder, active task.
3. Collect minimal evidence.
4. Record incident entry in `progress.md` if available.
5. State the safest next options and wait for direction.

## Output Contract

Return an incident report with: current task, symptom, evidence, files changed, commands run, unsafe actions avoided, suspected impact, recommended authority, and blocked status.

<!-- managed-by: opencode-path -->
```

### `test-strategy/SKILL.md`

```md
---
name: test-strategy
description: "Trigger: testing strategy, validation evidence, new behavior, bugfix, API/DB/security change, weak verification. Choose proportional tests."
license: MIT
metadata:
  author: opencode-path
  version: "1.0"
---

# Test Strategy

## Activation Contract

Load this skill when a change needs a validation decision: new behavior, bugfix regression risk, API/contract change, database change, security-sensitive flow, unclear task verification, Reviewer finding of weak evidence, or manual smoke being proposed for non-trivial risk.

## Hard Rules

- Choose evidence proportional to risk; do not require new tests for every trivial change.
- Runtime behavior needs runtime evidence. Source inspection alone does not prove behavior.
- Use validation commands documented by the project; do not invent `npm test`, `pytest`, `go test`, or other placeholders.
- High-risk API, data, or security changes need stronger evidence than simple source inspection.
- If Developer cannot identify adequate validation from the contract or project docs, record missing validation and escalate.

## Decision Gates

| Change type | Default evidence |
|---|---|
| Pure logic/helper | Unit test or existing focused test. |
| API DTO/validation/error | Integration or contract/API test plus sample payload if useful. |
| DB/schema/backfill | Migration test/dry-run, data assertion, and affected query check. |
| Auth/ownership/security | Negative tests for denied access and manipulated IDs. |
| UI-only copy/style | Manual smoke or no new test with justification. |
| Bugfix | Regression test at the smallest boundary that would have caught the bug. |
| Cross-repo/public contract | Contract test or producer/consumer fixture evidence. |

## Execution Steps

1. Identify the behavior or risk that must be proven.
2. Pick the cheapest test level that catches the important failure.
3. Decide what not to test and why.
4. Identify exact project validation commands from README, package/build config, CI, or task runner files.
5. Define evidence Developer must record: command, result, sample input/output, or manual smoke steps.
6. Reviewer/Auditor verify evidence was actually run or explicitly deferred.

## Output Contract

Return a test strategy block with: risk level, required evidence, optional evidence, not-required tests with rationale, exact commands or discovery step, manual smoke steps, and evidence to record.

<!-- managed-by: opencode-path -->
```

## Auditor notes
| Date | Related task | Severity | Status | Finding / resolution note | Suggested follow-up |
|---|---|---|---|---|---|
| 2026-07-08 | T-004–T-009 / CP-02–CP-04 | major | resolved | Traceability mismatch: `tasks.md` still marks CP-02, CP-03, CP-04 as `pending`, T-004 as `in_progress`, and T-005–T-009 as `pending`, while `progress.md` claims all 9 tasks are implemented, all checkpoints reviewed, final validation passes, and AC-01–AC-13 are satisfied. This makes completion/reviewer-gate evidence internally inconsistent. **Resolved: All task/checkpoint statuses reconciled to `done`.** | Final Reviewer gate for CP-02/CP-03/CP-04 closure. |
| 2026-07-08 | T-008 / AC-11 | minor | resolved | Runtime installer validation is asymmetric: `initCommand` validates agent templates via `validateAllTemplates()` but never calls `validateAllSkillTemplates()` before installing core/optional skills; malformed packaged skill frontmatter would rely on tests/release validation rather than command preflight. **Resolved: Added `validateAllSkillTemplates()` calls to both `initCommand` (init.ts) and `skillsCommand` (skills.ts) as preflight checks before skill install/management.** | None. |
| 2026-07-08 | T-005 / AC-05, AC-06 | minor | resolved | Conflict-only `opencode-path skills` runs can print a completed result and restart warning even when no install/remove happens because conflicts bypass `No changes needed` and the apply/result path still executes. **Resolved: Added an early-return path for `!hasChanges && conflicts.length > 0` that shows the plan/summary with conflict resolution hint but skips completion and restart messaging. Added test.** | None. |
