# Tasks: Graphify Freshness and Close Refresh

## Status legend
- pending: not started
- in_progress: actively being implemented
- done: completed and verified for the stated task
- blocked: cannot proceed without input or prerequisite
- cancelled: intentionally no longer needed

## Task table
| ID | Status | Owner | Files / areas | Technical objective | Covers | Dependencies | Verification | Notes |
|---|---|---|---|---|---|---|---|---|
| T-001 | done | Developer | `src/lib/graphify.ts`, `src/lib/graphify.test.ts`, `src/commands/init.test.ts` | Update Graphify install helpers to use compatible install spec `graphifyy>=0.9.0,<0.10.0`; preserve no-op behavior for existing CLI; add version parsing/access helpers for `graphify --version`. | AC-01, AC-09 | none | `npm test -- src/lib/graphify.test.ts src/commands/init.test.ts` | Use argument arrays. Do not shell-quote the version spec in the actual argument. Do not auto-reinstall existing Graphify. |
| T-002 | done | Developer | `src/lib/graphify.ts`, `src/lib/graphify.test.ts` | Add `.path/graphify-state.json` helpers: state shape, state path resolution, `.path` directory creation, Git commit/dirty metadata collection with null fallbacks, and JSON write after successful graph refresh. | AC-02, AC-03, AC-04, AC-09 | T-001 | `npm test -- src/lib/graphify.test.ts` | State path is relative to command cwd. Git/metadata failures must not fail successful graph refresh except state write failure itself. |
| T-003 | done | Developer | `src/commands/graphify.ts`, `src/commands/graphify.test.ts`, `src/lib/graphify.test.ts` | Wire state writing into `opencode-path graphify` after successful init/update/force update; report `.path/graphify-state.json`; ensure no state write on missing CLI or graph command failure. | AC-02, AC-03, AC-04, AC-09 | T-002 | `npm test -- src/commands/graphify.test.ts src/lib/graphify.test.ts` | Preserve existing graph init/update/force command selection exactly. No hooks or install behavior in this command. |
| T-004 | done | Developer | `templates/developer.md` | Update Developer close/finish procedure to offer optional `opencode-path graphify` before commits when `.path/graphify-state.json` exists, handle accept/decline/failure paths, and re-check status/diff after accepted refresh. | AC-05 | none | Inspect `templates/developer.md` diff and run `npm run validate-dist` after template changes. | Keep commit permission and no-push rules intact. Suggestion is based on state-file existence only. |
| T-005 | done | Developer | `templates/skills/graphify-explorer/SKILL.md`, `templates/skills/cross-repo-architecture/SKILL.md` | Update Explorer Graphify freshness guidance and cross-repo per-repo Graphify guidance without turning Graphify into source of truth or default auto-refresh. | AC-06, AC-07 | T-002 | `npm run validate-dist` | Preserve managed skill frontmatter/marker. Cross-repo guidance must not introduce a combined graph or alter binding contract rules. |
| T-006 | done | Developer | `README.md` | Document state file metadata, compatible `0.9.x` install range, existing-install preservation, optional pre-commit refresh suggestion, and no default hooks/background refresh. | AC-08 | T-003, T-004, T-005 | Inspect README diff and run `npm run validate-dist`. | Keep docs minimal; do not duplicate full Graphify documentation. |
| T-007 | done | Developer | Repository-wide validation | Run full validation and fix in-scope regressions without broadening the feature. | AC-09, AC-10 | T-001, T-002, T-003, T-004, T-005, T-006 | `npm test`; `npm run typecheck`; `npm run build`; `npm run validate-dist` | Record commands and results in `progress.md`. |

## Checkpoints
| ID | Included tasks | Intended ACs closed | Reviewer focus | Expected evidence | Reviewer required |
|---|---|---|---|---|---|
| CP-01 | T-001, T-002, T-003 | AC-01, AC-02, AC-03, AC-04, AC-09 | State file correctness, version-range install args, no state writes on failure, Git fallback behavior, and preservation of existing graph command behavior. | Diff for `src/lib/graphify.ts`, `src/commands/graphify.ts`, focused tests, and focused test output. | yes |
| CP-02 | T-004, T-005, T-006 | AC-05, AC-06, AC-07, AC-08 | Developer close flow remains safe; Explorer does not auto-refresh on use; cross-repo guidance keeps repo boundaries; docs are minimal and accurate. | Diff for template/docs files and validation output for template/dist checks. | yes |
| CP-03 | T-007 | AC-09, AC-10 and final feature review | Complete diff, no hooks/background refresh, no unrelated agent/workflow changes, all validation commands recorded. | Full validation results for `npm test`, `npm run typecheck`, `npm run build`, and `npm run validate-dist`; final progress evidence. | yes |

## Coverage notes
- AC-01 is covered by T-001.
- AC-02 is covered by T-002 and T-003.
- AC-03 is covered by T-002 and T-003.
- AC-04 is covered by T-002 and T-003.
- AC-05 is covered by T-004.
- AC-06 is covered by T-005.
- AC-07 is covered by T-005.
- AC-08 is covered by T-006.
- AC-09 is covered by T-001, T-002, T-003, and T-007.
- AC-10 is covered by T-007.

## Auditor notes
| Date | Related task | Severity | Status | Finding / resolution note | Suggested follow-up |
|---|---|---|---|---|---|
| 2026-07-10 | T-006 / AC-08 | minor | open | README still contains one unqualified sentence saying `.path/graphify-state.json` "is written" after a successful run, while implementation/docs elsewhere correctly treat state write as best-effort and non-fatal on filesystem failure. | Qualify README freshness-state intro to say the command attempts to write the file, or "when state write succeeds, the file is valid JSON". |
| 2026-07-10 | CP-03 / reviewer traceability | minor | open | `progress.md` records CP-03 final Reviewer as `PASS WITH NITS` but does not preserve the nit details or explicitly state that no nits remain unresolved. | Append the final Reviewer summary/nit list, or a dated note confirming the nits were informational/resolved. |
