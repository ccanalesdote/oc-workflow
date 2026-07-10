# Tasks: Graphify Code-Only Default

## Status legend
- pending: not started
- in_progress: actively being implemented
- done: completed and verified for the stated task
- blocked: cannot proceed without input or prerequisite
- cancelled: intentionally no longer needed

## Task table
| ID | Status | Owner | Files / areas | Technical objective | Covers | Dependencies | Verification | Notes |
|---|---|---|---|---|---|---|---|---|
| T-001 | pending | Developer | `src/lib/graphify.ts`, `src/lib/graphify.test.ts` | Update Graphify helper command args so init/update/force refreshes run in code-only/local mode using argument arrays; add/write mode metadata in state after successful refresh only. | AC-01, AC-02, AC-05, AC-10 | none | `npm test -- src/lib/graphify.test.ts` | Verify supported `--code-only` ordering locally. If update/force code-only is not supported, block and escalate; do not fall back to semantic mode. |
| T-002 | pending | Developer | `src/commands/graphify.ts`, `src/commands/graphify.test.ts` | Update `opencode-path graphify` runtime behavior/messages to state code-only mode and direct semantic users to `graphify`; preserve missing-CLI, init/update/force, failure, and no-state-on-failure behavior. | AC-01, AC-02, AC-03, AC-04, AC-05, AC-10 | T-001 | `npm test -- src/commands/graphify.test.ts src/lib/graphify.test.ts` | Do not add prompts or semantic/backend flags. Runtime message should be concise. |
| T-003 | pending | Developer | `README.md`, `src/commands/skills.ts`, `src/cli.ts` | Moderately update README: replace Mermaid workflow with portable plain text, correct agent flow, document `skills` based on actual implementation, and explain Graphify code-only default plus direct Graphify semantic usage. | AC-06, AC-07, AC-08, AC-09 | none | Inspect README diff; `npm run validate-dist` | Use `src/commands/skills.ts` and `src/cli.ts` as source of truth for `skills` flags/behavior. Do not perform a wholesale README rewrite. |
| T-004 | pending | Developer | Repository-wide validation | Run focused and full validation, fix in-scope regressions, and record evidence in `progress.md`. | AC-10, AC-11 | T-001, T-002, T-003 | `npm test`; `npm run typecheck`; `npm run build`; `npm run validate-dist` | Include exact command results and any manual Graphify CLI verification performed for `--code-only` argument support. |

## Checkpoints
| ID | Included tasks | Intended ACs closed | Reviewer focus | Expected evidence | Reviewer required |
|---|---|---|---|---|---|
| CP-01 | T-001, T-002 | AC-01, AC-02, AC-03, AC-04, AC-05, AC-10 | Code-only command selection, no semantic/API-key behavior, state mode metadata, no state write on failure, concise runtime messaging. | Diff for `src/lib/graphify.ts`, `src/commands/graphify.ts`, focused tests, and recorded evidence of supported `--code-only` argument form. | yes |
| CP-02 | T-003, T-004 | AC-06, AC-07, AC-08, AC-09, AC-10, AC-11 and final feature review | README accuracy/moderation, `skills` docs source-of-truth, Graphify semantic boundary, full validation evidence, no scope creep. | README diff, full validation results, and progress entries with exact command outputs. | yes |

## Coverage notes
- AC-01 is covered by T-001 and T-002.
- AC-02 is covered by T-001 and T-002.
- AC-03 is covered by T-002.
- AC-04 is covered by T-002 and Reviewer focus in CP-01.
- AC-05 is covered by T-001 and T-002.
- AC-06 is covered by T-003.
- AC-07 is covered by T-003.
- AC-08 is covered by T-003.
- AC-09 is covered by T-003 and Reviewer focus in CP-02.
- AC-10 is covered by T-001, T-002, and T-004.
- AC-11 is covered by T-004.

## Auditor notes
| Date | Related task | Severity | Status | Finding / resolution note | Suggested follow-up |
|---|---|---|---|---|---|
