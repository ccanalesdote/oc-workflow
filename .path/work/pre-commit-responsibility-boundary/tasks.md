# Tasks: Pre-Commit Responsibility Boundary

## Status legend

- pending: not started
- in_progress: actively being implemented
- done: completed and verified for the stated task
- blocked: cannot proceed without input or prerequisite
- cancelled: intentionally no longer needed

## Task table

| ID | Status | Owner | Files / areas | Technical objective | Covers | Dependencies | Verification | Notes |
|---|---|---|---|---|---|---|---|---|
| T-001 | pending | Developer | `templates/skills/test-strategy/SKILL.md`, `src/lib/skills.test.ts` | Make validation selection capability-aware: discover existing facilities, require relevant existing tests/smoke/E2E, avoid incidental framework introduction, and use explicit user risk acceptance for sensitive validation gaps. | AC-03, AC-04, AC-05, AC-06 | prerequisite feature `.path/work/architect-kernel-playbooks/` final checkpoint complete | Run `npm test -- src/lib/skills.test.ts`; inspect assertions for capability discovery, existing-infrastructure obligations, non-blocking absent infrastructure, and explicit risk acceptance. | Do not weaken honest evidence reporting or treat unavailable checks as passed. |
| T-002 | pending | Developer | `templates/skills/migration-and-data-change/SKILL.md`, `templates/skills/api-contracts/SKILL.md`, `src/lib/skills.test.ts` | Separate local migration/contract preparation and available validation from post-commit execution, deployed rollout, and receipts while preserving compatibility, rollback/compensation, invalid-data, and destructive-change decisions. | AC-01, AC-06, AC-07 | T-001 | Run `npm test -- src/lib/skills.test.ts`; inspect migration/API prompt assertions for pre-commit ownership and preserved safety decisions. | Manual migration execution may be outside the repo; development-order advice is allowed, operational execution ownership is not. |
| T-003 | pending | Developer | `templates/developer.md`, `src/lib/templates.test.ts` | Align implementation and close/finish behavior with the boundary: use required available validation, treat missing infrastructure/post-commit evidence correctly, create and report logical commits on explicit intent, then stop without push recommendation. | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07 | T-001, T-002 | Run `npm test -- src/lib/templates.test.ts`; inspect the close flow and confirm no push execution or recommendation remains in Developer's responsibility contract. | Preserve explicit user intent, wrong-worktree safety, commit inspection, logical commit grouping, and no automatic cleanup. |
| T-004 | pending | Developer | `templates/reviewer.md`, `templates/auditor.md`, `src/lib/templates.test.ts` | Align local review/audit semantics: Reviewer fails only for in-scope local deficiencies, Auditor stays optional/user-invoked, and neither requires absent infrastructure or post-commit operational evidence when risk handling is documented. | AC-05, AC-06, AC-07, AC-08, AC-09 | T-003 | Run `npm test -- src/lib/templates.test.ts`; inspect verdict and invocation invariants, including Auditor's optional status and unchanged read-only/file permissions. | Do not add cross modes, cross skills, or mandatory Auditor invocation. |
| T-005 | pending | Developer | `templates/architect.md`, `templates/spec.md`, `src/lib/templates.test.ts` | Add proportional conversational-output guidance: answer direct questions first, avoid repetition and irrelevant full schemas, and use progressive disclosure while preserving complete persistent handoffs and Architect mode routing. | AC-10, AC-11 | prerequisite feature `.path/work/architect-kernel-playbooks/` final checkpoint complete | Run `npm test -- src/lib/templates.test.ts`; inspect static invariants and representative wording without adding hard word-count assertions. | Reconcile against the finalized Architect kernel; do not reintroduce local/cross schemas into `architect.md`. |
| T-006 | pending | Developer | All target files listed in `brief.md`; bounded existing `src/**/*.test.ts` assertions discovered during implementation | Perform final contradiction search, add/adjust regression coverage, verify no cross or post-commit ownership leaked into scope, and run the repository's documented validation suite. | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12 | T-004, T-005 | Run `npm test`, `npm run typecheck`, `npm run build`, `npm run validate-dist`, and `npm run smoke`; inspect the complete scoped diff and search target templates/skills for stale push/deploy/evidence obligations. | Record any additional bounded test file before editing. Do not modify cross-repo skill behavior. |

## Checkpoints

| ID | Included tasks | Intended ACs closed | Reviewer focus | Expected evidence | Reviewer required |
|---|---|---|---|---|---|
| CP-01 | T-001, T-002 | AC-01, AC-03, AC-04, AC-05, AC-06, AC-07 | Verify capability-aware validation does not waive relevant existing checks, migration safety remains intact, and post-commit execution/receipts are outside closure. | Skill-only diff plus focused `src/lib/skills.test.ts` results recorded in `progress.md`. | yes |
| CP-02 | T-003, T-004 | AC-01, AC-02, AC-05, AC-06, AC-07, AC-08, AC-09 | Verify commit is the terminal responsibility, push is outside scope, Reviewer semantics remain strict locally, and Auditor remains optional with unchanged boundaries. | Agent-template diff, focused `src/lib/templates.test.ts` results, and permission/invocation invariant evidence in `progress.md`. | yes |
| CP-03 | T-005, T-006 | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12 | Final feature review: concise chat guidance without weaker handoffs, no cross contamination, complete protocol consistency, and all documented validations passing. | Complete scoped diff, contradiction-search results, all five validation commands, and resolved prior checkpoint verdicts in `progress.md`. | yes |

## Coverage notes

- AC-01 is covered by T-002, T-003, and T-006.
- AC-02 is covered by T-003 and T-006.
- AC-03 is covered by T-001, T-003, and T-006.
- AC-04 is covered by T-001, T-003, and T-006.
- AC-05 is covered by T-001, T-003, T-004, and T-006.
- AC-06 is covered by T-001, T-002, T-003, T-004, and T-006.
- AC-07 is covered by T-002, T-003, T-004, and T-006.
- AC-08 is covered by T-004 and T-006.
- AC-09 is covered by T-004 and T-006.
- AC-10 is covered by T-005 and T-006.
- AC-11 is covered by T-005 and T-006.
- AC-12 is covered by T-006.
- Every implementation task belongs to a checkpoint.

## Auditor notes

| Date | Related task | Severity | Status | Finding / resolution note | Suggested follow-up |
|---|---|---|---|---|---|
| 2026-07-16 | T-002, T-003, T-004, T-006 / AC-01 | major | open | AC-01 says "Agent and skill definitions" without limiting that universal wording to the bounded target files, while the Implementation Contract intentionally excludes several agent/skill definitions. The plan could either expand out of scope or leave AC-01 unverifiable. | Architect should constrain AC-01 to the explicitly targeted definitions, or deliberately revise target files/tasks before implementation. |
| 2026-07-16 | T-003, T-006 / AC-02 | major | open | The contract says Developer reports commits and stops, but T-003 verification explicitly checks only removal of push guidance. Current `templates/developer.md` also recommends post-commit worktree/branch cleanup, so tests could pass while the terminal lifecycle boundary remains violated. | Architect should state the intended disposition of post-commit cleanup guidance and require a focused regression assertion for that boundary. |
| 2026-07-16 | T-001, T-004, T-006 / AC-06 | minor | open | Risk acceptance is intended to waive unavailable validation evidence, but the planned assertions do not explicitly protect the negative boundary: acceptance must not waive known defects, skipped relevant available checks, or undefined security/migration strategy. | Add this negative invariant to task verification and static regression coverage. |
| 2026-07-16 | T-006 | minor | open | `Files / areas` permits all target files plus discovered tests, making the final sweep the main anti-bloat and task-boundary risk; it is unclear whether those files are inspection-only or all editable. | Mark broad target coverage as inspection scope and require any edits to be traced to a concrete unmet AC/contradiction and recorded before editing. |
| 2026-07-16 | T-001, T-005 / prerequisite | minor | open | The prerequisite is recorded as incomplete, but the plan does not define the evidence that proves its final checkpoint and intended baseline are present before implementation starts. This audit did not inspect the unrelated prerequisite work folder. | Before selecting T-001 or T-005, record the prerequisite final Reviewer verdict and baseline commit/state in this plan's `progress.md`. |
