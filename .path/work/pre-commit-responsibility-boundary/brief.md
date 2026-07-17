# Brief: Pre-Commit Responsibility Boundary

## Objective

Align opencode-path agents and supporting skills around a clear local-development boundary: plan, implement, validate with the repository's existing capabilities, review, optionally audit, and create commits. Everything after commit is outside opencode-path responsibility.

## Problem

Current prompts and skills can overstate validation obligations, assume test or migration tooling that a repository does not have, or continue guiding work into push, deployment, environment execution, and operational evidence. This can turn pre-existing technical debt or post-commit operations into blockers for an otherwise complete feature.

Architect and Spec also tend to produce unnecessarily long conversational responses because their structured protocols do not strongly distinguish concise debate from complete persistent handoffs.

## Scope

- Define commit creation as the final opencode-path lifecycle responsibility.
- Make validation proportional to the test, smoke, E2E, build, and manual-check capabilities already present in the repository.
- Require focused tests for new behavior when a relevant test platform already exists.
- Require relevant existing smoke or E2E checks when available.
- Treat absent test infrastructure as a non-blocking pre-existing limitation, not feature scope.
- Allow explicit user risk acceptance to close sensitive work when adequate validation is unavailable, without requiring attached evidence.
- Separate migration preparation from post-commit migration execution and operational receipts.
- Keep Auditor optional and user-invoked.
- Make Architect and Spec chat responses somewhat simpler and shorter without weakening persistent handoffs.

## Non-goals

- Cross-repo compatibility auditing or a Cross Auditor.
- Changes to the Architect kernel/playbook architecture introduced by `.path/work/architect-kernel-playbooks/`.
- Push, pull request, QA, staging, production, deployment, activation, or monitoring workflows.
- Automated policy enforcement, plugins, hooks, or new dependencies.
- Introducing test frameworks, E2E platforms, migration frameworks, or CI infrastructure into projects that do not already have them.
- Reducing the completeness of `brief.md`, `tasks.md`, `progress.md`, or other persistent handoff contracts.

## Constraints

- Implementation must start only after `.path/work/architect-kernel-playbooks/` reaches its final checkpoint and its intended changes are present in the implementation baseline.
- Preserve existing agent permissions and user-driven handoffs.
- Developer may create commits only through the existing explicit close/finish intent; it must not push.
- Lack of a test platform is not permission to claim runtime behavior was proven. It must be reported as a residual risk without blocking solely because infrastructure is absent.
- Existing relevant validation commands and facilities must not be skipped merely because validation is capability-aware.
- Destructive, security-sensitive, or otherwise high-risk work without adequate validation requires an explicit user decision before proceeding; the decision is sufficient workflow authorization and no evidence attachment is required.

## Decisions

- The opencode-path lifecycle ends after commits are created and reported.
- Push guidance and all post-commit execution ownership are removed from the agent completion contract.
- Reviewer is the normal local implementation gate; Auditor remains optional and is invoked only by the user.
- Validation obligations are derived from repository capabilities and feature risk, not from an assumed ideal toolchain.
- Existing test infrastructure creates an obligation to add relevant focused tests for new behavior.
- Existing relevant smoke/E2E facilities must be used when applicable.
- Missing infrastructure is surfaced as debt/risk, not added incidentally to feature scope.
- Migration design and artifacts can be locally required; real environment execution and receipts cannot block local closure.
- Concision changes apply to conversational output, not persistent implementation contracts.

## Implementation Contract

### Target files and areas

- `templates/developer.md`
- `templates/reviewer.md`
- `templates/auditor.md`
- `templates/architect.md`
- `templates/spec.md`
- `templates/skills/test-strategy/SKILL.md`
- `templates/skills/migration-and-data-change/SKILL.md`
- `templates/skills/api-contracts/SKILL.md`
- `src/lib/templates.test.ts`
- `src/lib/skills.test.ts`
- Bounded existing command/template tests under `src/**/*.test.ts` only if a changed invariant is already asserted there; record the exact file in `progress.md` before editing it.

### Expected changes by area

- `templates/developer.md`: preserve explicit close intent and logical commits, but terminate the workflow after reporting created commits. Remove push recommendations and state that push, PRs, deployment, environment operations, and activation are outside responsibility. During implementation, use required validation selected from existing project capabilities; do not turn absent infrastructure or post-commit operational evidence into a blocker.
- `templates/reviewer.md`: fail for missing required local implementation, relevant existing validation that was required but skipped, contract violations, security/correctness defects, or diff hygiene. Do not fail solely because the repository lacks a test/E2E platform or because post-commit migration/deployment evidence is absent when the handoff records that limitation or an explicit user risk decision.
- `templates/auditor.md`: remain an optional, user-invoked local closure audit. Audit claims against available local evidence and recorded risk decisions; do not require post-commit operations or make Auditor mandatory for commit closure.
- `templates/architect.md` and `templates/spec.md`: add proportional, progressive-disclosure guidance for chat. Answer the concrete question first, avoid repeating settled context, and omit irrelevant sections during debate. Preserve full mode selection, design rigor, and persistent handoff completeness.
- `templates/skills/test-strategy/SKILL.md`: begin with capability discovery. Require focused tests when a relevant framework exists and relevant smoke/E2E when available. When no suitable platform exists, select the best available local check, report the gap, and do not require incidental infrastructure creation. For high-risk gaps, require explicit user acceptance rather than evidence attachment.
- `templates/skills/migration-and-data-change/SKILL.md`: distinguish locally controlled migration design/artifacts/static or local-test validation from post-commit execution in real environments. Manual migration projects may close locally without execution receipts. Preserve compatibility, rollback/compensation, invalid-data, lock, and destructive-change planning; unresolved high-risk strategy still requires a user decision.
- `templates/skills/api-contracts/SKILL.md`: preserve explicit contracts and compatibility while making verification capability-aware and treating deployment/rollout execution as outside responsibility. Development-order or compatibility advice may be documented, but deployed evidence is not a local closure requirement.
- Tests: assert the lifecycle boundary, optional Auditor, capability-aware validation, migration execution boundary, explicit risk acceptance, and concise-chat/full-handoff distinction without brittle word-count assertions.

### Contracts / invariants / compatibility to preserve

- Preserve all existing agent permission frontmatter unless a contradiction makes that impossible; any permission change requires escalation.
- Preserve Architect's kernel and mutually exclusive architecture-playbook contract resulting from the prerequisite feature.
- Preserve local handoff schemas, AC/task/checkpoint traceability, Developer's Reviewer invocation, and Reviewer read-only behavior.
- Preserve migration safety planning. This change removes unsupported execution-evidence ownership; it does not permit silent destructive changes or omitted rollback/compensation decisions.
- Preserve API contract compatibility requirements. This change does not weaken code-level contract correctness.
- Preserve honest reporting: unavailable validation must not be presented as passing validation.
- Existing relevant project validation remains mandatory when selected by the plan; capability awareness is not a general waiver.

### Decisions already made

- No Cross Auditor or cross-repo workflow changes in this feature.
- No test platform may be introduced solely because a feature enters a repository without one.
- If a relevant test platform exists, new behavior receives focused tests in that platform.
- Relevant existing smoke/E2E checks apply when related to the feature.
- Explicit user acceptance is sufficient to proceed with a disclosed high-risk validation gap; no attached proof is required.
- Manual migration execution and receipts are post-commit responsibilities.
- Auditor is optional and never an automatic prerequisite to commit.
- Chat concision uses judgment and progressive disclosure, not hard word or section limits.

### Normal flow to encode

1. Architect inspects project documentation, build configuration, CI, and existing test directories to identify available validation capabilities.
2. Architect plans focused tests and relevant smoke/E2E checks only from capabilities the project already has. Missing infrastructure is disclosed as a non-blocking risk or follow-up.
3. For a sensitive change with inadequate validation, Architect asks for an explicit user decision and records the accepted risk in the persistent handoff when one exists.
4. For data changes, Architect defines the migration artifact, compatibility strategy, rollback/compensation, and available local checks. Real-environment execution and receipts remain outside the plan's closure criteria.
5. Developer implements the bounded tasks and runs the required available local validation.
6. Reviewer verifies implementation, contract compliance, required available validation, and diff hygiene. Pre-existing missing infrastructure or post-commit evidence does not independently cause FAIL.
7. Auditor runs only if explicitly requested and evaluates the same local boundary.
8. On explicit close/finish intent, Developer creates logical commits, reports their hashes/messages, and stops. It does not push or guide post-commit operations as part of closure.
9. Architect and Spec use concise, proportional chat responses while keeping persistent handoffs complete.

### Escalation contract

If Developer finds a contradiction between these rules and the current Architect playbooks after the prerequisite feature finishes, or if capability-aware validation would waive an existing relevant project check, record the affected task/checkpoint, problem, evidence, impact, and proposed options in `progress.md` with status `blocked awaiting Architect decision`, then stop the affected area. Material resolutions must be persisted in `brief.md` and/or `tasks.md`; a decision only in chat or `progress.md` is not contractual.

### Do not touch / do not introduce

- Do not modify `templates/skills/cross-repo-architecture/SKILL.md` or create a cross-audit skill.
- Do not add agents, including Cross Auditor.
- Do not modify application runtime behavior, CLI commands, plugins, hooks, or dependencies.
- Do not introduce automated enforcement or mandatory worktrees.
- Do not create persistent handoff artifacts beyond `.path/work/pre-commit-responsibility-boundary/brief.md`, `tasks.md`, and `progress.md`.
- Do not add test/E2E/migration frameworks to this repository as examples of the policy.
- Do not weaken security, compatibility, rollback, or destructive-change decision requirements.
- Do not use hard response word counts or delete required persistent handoff sections to achieve concision.

## Relevant files and areas

- `templates/developer.md`: implementation and close/finish lifecycle.
- `templates/reviewer.md`: local PASS/FAIL semantics.
- `templates/auditor.md`: optional closure and evidence semantics.
- `templates/architect.md`, `templates/spec.md`: conversational output behavior.
- `templates/skills/test-strategy/SKILL.md`: validation selection.
- `templates/skills/migration-and-data-change/SKILL.md`: migration preparation versus execution.
- `templates/skills/api-contracts/SKILL.md`: compatibility verification versus rollout execution.
- `src/lib/templates.test.ts`, `src/lib/skills.test.ts`: static protocol regression coverage.

## Acceptance Criteria

- AC-01: Agent and skill definitions state that opencode-path responsibility ends after commits are created and reported; push, PR, QA, deployment, production, activation, and operational receipts are outside closure responsibility.
- AC-02: Developer's explicit close/finish flow creates and reports logical commits, then stops without running or recommending push as part of opencode-path closure.
- AC-03: Validation planning begins by discovering the repository's existing test, smoke, E2E, build, CI, and documented manual-check capabilities.
- AC-04: When a relevant test framework exists, the plan requires focused tests for new behavior; when relevant smoke/E2E facilities exist, the plan requires their applicable checks.
- AC-05: A repository without suitable test/E2E infrastructure is not forced to add it for an unrelated feature; the limitation is disclosed as non-blocking debt or residual risk.
- AC-06: A sensitive change with inadequate validation requires an explicit user decision; recorded acceptance permits local closure without requiring the user to attach evidence.
- AC-07: Migration artifacts, compatibility, rollback/compensation, and available local checks may be required, while real-environment execution and receipts cannot block local closure or commit.
- AC-08: Reviewer blocks on local defects, contract violations, skipped required available validation, security/correctness issues, or dirty/incidental diff artifacts, but not solely on absent pre-existing infrastructure or post-commit evidence.
- AC-09: Auditor remains optional and user-invoked, audits only the local closure boundary, and is not required before commits.
- AC-10: Architect and Spec chat instructions favor direct, proportional, non-repetitive responses and progressive disclosure, while persistent handoffs remain complete and precise.
- AC-11: Cross-repo architecture and Cross Auditor behavior remain unchanged and out of scope.
- AC-12: Focused and full documented repository validations pass, and static tests protect the new responsibility and output-style invariants.

## Edge cases

- A project has unit tests but no E2E platform: require relevant unit/integration tests, do not introduce E2E infrastructure.
- A project has an E2E command unrelated to the changed subsystem: do not run it automatically merely because it exists; apply relevance and risk.
- A project has no automated tests but documents a relevant manual smoke: require that available smoke before commit and record the result.
- A project has no suitable runtime validation at all: perform available static/build checks, disclose the gap, and do not claim runtime proof.
- A security-sensitive or destructive change lacks adequate validation: stop for explicit user acceptance; after acceptance, record the residual risk and proceed without demanding attachments.
- A manual SQL migration is prepared in the repo: review its content and rollback/compensation locally, but do not require a QA/production execution receipt.
- A migration is already applied in production: preserve the rule against silently editing/deleting it.
- New untracked source files or incidental build artifacts remain local diff-hygiene blockers before commit.
- The user asks to push after commits: report that push is outside opencode-path responsibility; do not execute or incorporate it into closure.
- A short design question does not need a full option matrix; Architect answers proportionally. A persistent handoff still follows the complete selected playbook.

## Open questions

- None material. Implementation is intentionally sequenced after the Architect kernel/playbook prerequisite completes.

## Assumptions and residual risks

- Static prompt tests can protect required concepts but cannot guarantee exact response length; Reviewer should inspect examples and wording for proportionality without enforcing brittle word counts.
- Capability-aware validation accepts that some repositories provide weaker proof. The workflow must disclose that limitation honestly rather than equating closure with production certainty.
