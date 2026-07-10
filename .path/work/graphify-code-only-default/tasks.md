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
| T-001 | done | Developer | `src/lib/graphify.ts`, `src/lib/graphify.test.ts` | Update Graphify helper command args so init uses explicit code-only extraction, update/force use Graphify's documented no-LLM `update` forms, and state writes include local code graph mode metadata after successful refresh only. | AC-01, AC-02, AC-05, AC-10 | none | `npm test -- src/lib/graphify.test.ts` | Implemented with `graphify . --code-only` for init, documented `graphify update .` / `graphify update . --force` for update, and `graphifyMode: "local-code"` state metadata. Evidence recorded in `progress.md`. |
| T-002 | done | Developer | `src/commands/graphify.ts`, `src/commands/graphify.test.ts` | Update `opencode-path graphify` runtime behavior/messages to state local/no-LLM code graphing mode and direct semantic users to `graphify`; preserve missing-CLI, init/update/force, failure, and no-state-on-failure behavior. | AC-01, AC-02, AC-03, AC-04, AC-05, AC-10 | T-001 | `npm test -- src/commands/graphify.test.ts src/lib/graphify.test.ts` | Implemented concise local-code mode line and direct Graphify semantic hint. Focused command/helper tests passed. |
| T-003 | done | Developer | `README.md`, `src/commands/skills.ts`, `src/cli.ts` | Moderately update README: replace Mermaid workflow with portable plain text, correct agent flow, document `skills` based on actual implementation, and explain Graphify code-only default plus direct Graphify semantic usage. | AC-06, AC-07, AC-08, AC-09 | none | Inspect README diff; `npm run validate-dist` | README updated moderately; diff inspected; `npm run validate-dist` passed. |
| T-004 | done | Developer | Repository-wide validation | Run focused and full validation, fix in-scope regressions, and record evidence in `progress.md`. | AC-10, AC-11 | T-001, T-002, T-003 | `npm test`; `npm run typecheck`; `npm run build`; `npm run validate-dist` | Full validation passed. Manual Graphify init/update evidence recorded in `progress.md`. |

## Checkpoints
| ID | Included tasks | Intended ACs closed | Reviewer focus | Expected evidence | Reviewer required |
|---|---|---|---|---|---|
| CP-01 | T-001, T-002 | AC-01, AC-02, AC-03, AC-04, AC-05, AC-10 | Explicit code-only init command selection, documented no-LLM update/force command selection, no semantic/API-key behavior, state mode metadata, no state write on failure, concise runtime messaging. | Diff for `src/lib/graphify.ts`, `src/commands/graphify.ts`, focused tests, accepted init-form evidence, and Graphify docs/help evidence that update is no-LLM/code-file re-extraction. | yes |
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
| 2026-07-10 | T-001–T-004 / CP-01–CP-02 | none | accepted | Auditor found no blocker/major/minor findings. AC coverage, Reviewer PASS traceability, scoped product diff, README updates, Graphify command args/state metadata, and test evidence were sufficient for closure. Auditor independently reran `npm test`, `npm run typecheck`, `npm run build`, `npm run validate-dist`, and checked local `graphify --help` evidence for no-LLM update wording. | Optional manual smoke remains as already noted: run `opencode-path graphify` in a disposable repo with and without `graphify-out/graph.json` if release confidence needs real Graphify execution beyond mocked unit tests. |
