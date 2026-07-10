# Tasks: Optional Graphify Integration

## Status legend
- pending: not started
- in_progress: actively being implemented
- done: completed and verified for the stated task
- blocked: cannot proceed without input or prerequisite
- cancelled: intentionally no longer needed

## Task table
| ID | Status | Owner | Files / areas | Technical objective | Covers | Dependencies | Verification | Notes |
|---|---|---|---|---|---|---|---|---|
| T-001 | done | Developer | `src/lib/graphify.ts`, optional `src/lib/graphify.test.ts` | Add Graphify helper functions for CLI availability, `uv` availability, `uv tool install graphifyy`, official OpenCode skill install, `graphify-out/graph.json` detection, and graph init/update command argument selection using Node child process APIs with argument arrays. | AC-03, AC-04, AC-05, AC-09, AC-10, AC-11 | none | `npm test -- src/lib/graphify.test.ts` if a helper test file is added; otherwise helper behavior must be covered by `src/commands/init.test.ts` and `src/commands/graphify.test.ts`. | No new dependency. Do not call hooks or `graphify opencode install`. |
| T-002 | done | Developer | `templates/skills/graphify-explorer/SKILL.md`, `src/lib/paths.ts`, `src/lib/skills.ts`, `scripts/validate-dist-skill-lookup.mjs`, `src/lib/skills.test.ts` if needed | Create the `graphify-explorer` skill using the exact content in `brief.md`. Wire the template into validation/installation through the smallest safe path without exposing it in the normal optional-skill picker unless needed for type safety; if added to catalog, ensure init/skills UI cannot install it independently of Graphify success. | AC-06, AC-07, AC-08 | none | `npm test -- src/lib/skills.test.ts` and `npm run validate-dist` after implementation; if no skills unit changes are needed, run the closest existing skill validation tests. | Exact skill wording is fixed by Architect; Developer must not rewrite triggers or behavior. |
| T-003 | done | Developer | `src/commands/init.ts`, `src/cli.ts`, `src/lib/ui.ts`, `src/commands/init.test.ts` | Add `init --with-graphify`, optional interactive Graphify prompt defaulting to no, dry-run summary, apply-phase Graphify install sequence, conflict preflight, nonfatal failure reporting, and result summary while preserving existing init flow. | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-13 | T-001, T-002 | `npm test -- src/commands/init.test.ts` | `--yes` alone must not opt in. `--dry-run` must not run external commands. |
| T-004 | done | Developer | `src/commands/graphify.ts`, `src/cli.ts`, `src/commands/graphify.test.ts` | Add `opencode-path graphify` with `--force`: verify CLI availability, initialize with `graphify .` when no graph exists, update with `graphify update .` when graph exists, force update with `graphify update . --force`, and report actionable missing-CLI errors. | AC-09, AC-10, AC-11, AC-13 | T-001 | `npm test -- src/commands/graphify.test.ts` | No install behavior in this command. No hooks, branches, worktrees, or `.path/work` changes. |
| T-005 | done | Developer | `README.md` | Add minimal documentation for optional Graphify install during init, `--with-graphify`, the `opencode-path graphify` command, `--force`, expected `graphify-out/graph.json` behavior, and explicit hook exclusion. | AC-12 | T-003, T-004 | Inspect README diff and run `npm test` to ensure docs changes did not affect tests. | Do not duplicate Graphify full docs. Link/mention official commands only as needed. |
| T-006 | done | Developer | Repository-wide validation | Run full validation and fix regressions without broadening scope. | AC-13 | T-001, T-002, T-003, T-004, T-005 | `npm test`; `npm run typecheck`; `npm run build`; `npm run validate-dist` | Record commands and results in `progress.md`. |

## Checkpoints
| ID | Included tasks | Intended ACs closed | Reviewer focus | Expected evidence | Reviewer required |
|---|---|---|---|---|---|
| CP-01 | T-001, T-002 | AC-06, AC-07, AC-08, helper portions of AC-03, AC-04, AC-05, AC-09, AC-10, AC-11 | Graphify helper is small/testable; exact skill content matches brief; no Explorer base prompt/config changes; no hooks/always-use command. | Diff for `src/lib/graphify.ts`, skill template, skill validation wiring, focused tests, and recorded validation output. | yes |
| CP-02 | T-003 | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-13 | Init flow preserves existing semantics; `--yes` does not opt in; `--with-graphify` works; failures are nonfatal; custom skill only after external success. | Diff for init/CLI/UI tests plus `src/commands/init.test.ts` output. | yes |
| CP-03 | T-004, T-005, T-006 | AC-09, AC-10, AC-11, AC-12, AC-13 and final feature review | New command behavior, docs minimality, no scope creep, full validation evidence. | Diff for graphify command/docs, focused command test output, and full `npm test`, `npm run typecheck`, `npm run build`, `npm run validate-dist` results. | yes |

## Coverage notes
- AC-01 is covered by T-003.
- AC-02 is covered by T-003.
- AC-03 is covered by T-001 and T-003.
- AC-04 is covered by T-001 and T-003.
- AC-05 is covered by T-001 and T-003.
- AC-06 is covered by T-002 and T-003.
- AC-07 is covered by T-002.
- AC-08 is covered by T-002 and Reviewer focus in CP-01.
- AC-09 is covered by T-001 and T-004.
- AC-10 is covered by T-001 and T-004.
- AC-11 is covered by T-001 and T-004.
- AC-12 is covered by T-005.
- AC-13 is covered by T-003, T-004, and T-006.

## Auditor notes
| Date | Related task | Severity | Status | Finding / resolution note | Suggested follow-up |
|---|---|---|---|---|---|
| 2026-07-10 | CP-01, CP-02, CP-03 / T-006 | major | open | Reviewer verdict traceability is missing: all checkpoints require Reviewer, but `progress.md` still says the work is awaiting final Reviewer pass and contains no checkpoint or final PASS evidence. Auditor cannot close the feature on Developer validation alone. | Run/record required Reviewer checkpoint or final feature review verdicts, then re-audit closure evidence. |
| 2026-07-10 | T-006 | minor | open | Validation evidence in `progress.md` is stale relative to current primary validation: Developer recorded `npm test` as 400/400, while Auditor reproduced 407 passing tests across 17 files. Commands are green, but the recorded evidence is not exact. | Update progress evidence or rely on the Auditor entry below as the current validation record. |
| 2026-07-10 | T-003 | nit | open | Anti-bloat: `src/commands/init.ts` imports `isUvAvailable` from `src/lib/graphify.ts` but does not use it; the helper itself performs the uv preflight. | Remove the unused import in a cleanup pass. |
| 2026-07-10 | CP-01, CP-02, CP-03 / T-006 | major | resolved | Reviewer verdict traceability recorded in `progress.md`: final Reviewer feature review returned `PASS` with no findings after Graphify init coverage was added. | None for this finding; Auditor can re-check closure evidence if desired. |
| 2026-07-10 | T-006 | minor | resolved | Current validation evidence recorded in `progress.md`: `npm test` PASS 407/407 across 17 files; `npm run typecheck` PASS; `npm run build` PASS; `npm run validate-dist` PASS. | None for this finding. |
| 2026-07-10 | T-003 | nit | blocked | Attempted cleanup of unused `isUvAvailable` import in `src/commands/init.ts` was blocked by active permissions: source edits are denied in this Auditor context except work-folder `tasks.md`/`progress.md`. | Hand off to Developer/source-edit-capable role to remove the unused import. |
| 2026-07-10 | Re-audit / T-006 | nit | accepted residual | Re-audit reproduced full validation successfully and found no new closure blocker. The only remaining issue is the already-recorded unused `isUvAvailable` import in `src/commands/init.ts`; it is harmless anti-bloat cleanup and does not invalidate AC coverage. | Optional cleanup before merge; no further Auditor blocker found. |
