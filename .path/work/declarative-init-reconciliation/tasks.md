# Tasks: Declarative Init Reconciliation

## Status legend

- pending: not started
- in_progress: actively being implemented
- done: completed and verified for the stated task
- blocked: cannot proceed without input or prerequisite
- cancelled: intentionally no longer needed

## Task table

| ID | Status | Owner | Files / areas | Technical objective | Covers | Dependencies | Verification | Notes |
|---|---|---|---|---|---|---|---|---|
| T-001 | done | Developer | `src/lib/profiles.ts`, `src/lib/profiles.test.ts`, bounded use of `src/lib/frontmatter.ts`, `src/lib/frontmatter.test.ts` | Add pure/bounded discovery and composition support for recognized profile target state and exact model preservation when rebuilding canonical agent content. Represent current absent/present/mixed profile state without adding arbitrary merge behavior. | AC-04, AC-05, AC-06, AC-13 | none | Run `npm test -- src/lib/profiles.test.ts src/lib/frontmatter.test.ts`; prove canonical regeneration, no duplicates, mixed-state discovery, skip-preserved per-agent sets, explicit target sets, and YAML-sensitive model preservation. | Reuse canonical profile definitions and existing model serialization. Unknown marked drift is not a profile-preservation contract. |
| T-002 | done | Developer | `src/lib/agents.ts`, `src/lib/agents.test.ts` | Generalize canonical reconciliation from Architect to every retained/selected managed custom agent; compose latest template + desired recognized profiles + preserved/assigned model, and integrate marker-safe create/replace/remove while keeping built-in hide/restore separate. | AC-01, AC-03, AC-04, AC-05, AC-06, AC-09, AC-13, AC-14 | T-001 | Run `npm test -- src/lib/agents.test.ts`; cover all `PACK_AGENTS`, create/replace/unchanged/remove/conflict, valid/invalid model, profile target state, unsupported marked drift replacement, unmarked preservation, idempotence, and partial/race-safe outcomes proportional to existing helpers. | Removal now validates marked frontmatter/model and preserves invalid files as conflicts. |
| T-003 | done | Developer | `src/lib/skills.ts`, `src/lib/skills.test.ts`, `scripts/validate-dist-skill-lookup.mjs` only if required | Generalize canonical reconciliation to core and optional managed skills and add installed-only reconciliation for marked `graphify-explorer`; preserve marker-safe removal and catalog boundaries. | AC-02, AC-07, AC-08, AC-09, AC-13 | none | Run `npm test -- src/lib/skills.test.ts` and `npm run validate-dist`; cover every catalog class, core always-desired behavior, optional selected/retained/removal behavior, missing/unmarked Graphify Explorer, and idempotence. | Implementation verified; user explicitly accepted the pre-existing 0.6.2 version changes and instructed Reviewer to omit them. |
| T-004 | done | Developer | `src/commands/init.ts`, `src/commands/init.test.ts`, bounded `src/lib/ui.ts` / `src/lib/messages.ts` only if required | Convert interactive init planning to explicit desired-state management with current items preselected, distinct Skip semantics, mixed profile disclosure, aggregate per-path actions, one confirmation, and application through T-001–T-003 helpers. | AC-01, AC-02, AC-03, AC-04, AC-07, AC-08, AC-09, AC-10 | T-001, T-002, T-003 | Run `npm test -- src/commands/init.test.ts`; cover skip versus explicit empty selection, retained defaults, removals/hides, replacement warning, exact plan actions, cancellation, conflicts, mixed profiles, and one confirmation. | Remove active-agent forced retention only for an explicitly confirmed agent target state. Core skills remain forced desired. |
| T-005 | done | Developer | `src/commands/init.ts`, `src/commands/init.test.ts` | Bind noninteractive and safety semantics: `--yes` derives target state from installed managed state and never removes, dry-run never mutates, retries are idempotent, and partial failures/results/restart messaging remain honest. | AC-06, AC-08, AC-10, AC-11, AC-12, AC-13, AC-14 | T-004 | Run `npm test -- src/commands/init.test.ts`; separately prove `--yes`, `--dry-run`, `--dry-run --yes`, repeated run, no-removal guarantees, no surprise optional/Graphify install, partial failure, and restart/no-restart results. | CP-02 PASS; follow-up Reviewer PASS after explicit config result/path and create/replace/failure/cancel/revalidation regressions. |
| T-006 | done | Developer | `src/commands/agents.test.ts`, `src/commands/skills.test.ts`, `src/commands/profiles.test.ts`, `src/commands/models.test.ts`, `src/commands/uninstall.test.ts`, `README.md` | Preserve standalone lifecycle behavior and document the new init target-state contract, ownership boundary, canonical replacement, models/profiles, Graphify boundary, preview, `--yes`, dry-run, and restart semantics. | AC-09, AC-11, AC-12, AC-15 | T-004, T-005 | Run the listed command tests; inspect README examples against implemented prompts/results. Existing standalone tests must remain green, with focused additions only where shared helper refactoring changes regression risk. | Standalone command suite passed; README now documents desired state, ownership, canonical replacement, mutable state, Graphify boundary, safety modes, partial results, and restart semantics. |
| T-007 | done | Developer | Full bounded surface from `brief.md`; edit only assigned files or a pre-recorded AC/contradiction-driven addition | Complete integration review, traceability, anti-bloat inspection, full validation, and scoped diff hygiene. | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16 | T-005, T-006 | Run `npm test`, `npm run typecheck`, `npm run build`, `npm run validate-dist`, `npm run smoke`, and the repository's scoped diff/whitespace check; inspect all changed files against the Implementation Contract. | CP-03 PASS; full validation and scoped diff hygiene passed. |
| T-008 | done | Developer | `package.json`, `package-lock.json`, `src/cli.ts`; inspect built and packed metadata without committing generated artifacts | Synchronize every project-owned opencode-path version declaration to exactly `0.6.3` and verify package, lockfile, source CLI, built CLI, and packed package metadata agree. | AC-17 | T-007 | Verify source/manifests contain `0.6.3`; run `npm run build`, assert `node dist/cli.js --version` prints exactly `0.6.3`, run the existing smoke/pack validation, and search product-owned files to prove no opencode-path `0.6.2` declaration remains. | CP-04 ready for Reviewer; dependency versions and historical `.path/work/**` evidence were unchanged. |

## Checkpoints

| ID | Included tasks | Intended ACs closed | Reviewer focus | Expected evidence | Reviewer required |
|---|---|---|---|---|---|
| CP-01 | T-001, T-002, T-003 | AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-13, AC-14 | Verify canonical composition/reconciliation is generic, marker-safe, model/profile aware, idempotent, and excludes external Graphify ownership. | Focused profile/frontmatter/agent/skill test results, helper-level diff, catalog matrix, unmarked byte-preservation evidence, and idempotence cases in `progress.md`. | yes |
| CP-02 | T-004, T-005 | AC-01, AC-02, AC-03, AC-04, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14 | Verify interactive target state, Skip versus empty selection, preselection, removal transparency, aggregate confirmation, `--yes` no-removal, dry-run, partial results, and restart semantics. | Focused init tests for every execution mode, representative plan/result output, no-write snapshots, no-surprise-install/removal evidence, and Reviewer verdict recorded in `progress.md`. | yes |
| CP-03 | T-006, T-007 | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16 | Final feature review: complete behavioral consistency, standalone compatibility, documentation accuracy, no unmarked/Graphify scope breach, no incidental abstraction, and full validation. | Complete scoped diff, README inspection, prior checkpoint PASS evidence, all five repository validation commands, diff hygiene, and final traceability matrix. | yes |
| CP-04 | T-008 | AC-17 | Verify the release bump is complete and limited to project-owned version declarations, generated validation observes `0.6.3`, and dependency/history data is untouched. | Diff of the three assigned source/manifest files, exact built `--version` output, packed metadata evidence, product-version search, and relevant build/smoke results recorded in `progress.md`. | yes |

## Coverage notes

- AC-01 is covered by T-002 and T-004.
- AC-02 is covered by T-003 and T-004.
- AC-03 is covered by T-002 and T-004.
- AC-04 is covered by T-001, T-002, and T-004.
- AC-05 is covered by T-001 and T-002.
- AC-06 is covered by T-001, T-002, and T-005.
- AC-07 is covered by T-003 and T-004.
- AC-08 is covered by T-003, T-004, and T-005.
- AC-09 is covered by T-002, T-003, T-004, and T-006.
- AC-10 is covered by T-004 and T-005.
- AC-11 is covered by T-005 and T-006.
- AC-12 is covered by T-005 and T-006.
- AC-13 is covered by T-001, T-002, T-003, and T-005.
- AC-14 is covered by T-002 and T-005.
- AC-15 is covered by T-006 and T-007.
- AC-16 is covered by T-007.
- AC-17 is covered by T-008.
- Every task belongs to a Reviewer checkpoint.

## Auditor notes

| Date | Related task | Severity | Status | Finding / resolution note | Suggested follow-up |
|---|---|---|---|---|---|
| — | — | — | none | No audit has been requested for this handoff. | Auditor remains optional and user-invoked. |
| 2026-07-18 | T-004, T-005 | minor | open | `src/commands/init.ts:799-816` always creates/normalizes `opencode.json` during an apply, but `buildConsolidatedSummary` does not plan that config create/update unless a built-in hide/restore happens. The write is marker-independent, minimal, and pre-existing, but it is not fully traceable through the aggregate preview promised by AC-10. | Represent the config create/normalization as an explicit planned path/action, or document and test it as an intentional baseline init side effect. |
| 2026-07-18 | T-005 | minor | open | A compatible concurrent writer can make an explicitly selected custom-agent model canonical before apply; `applyCustomAgentReconciliation` then returns `unchanged`, but `src/commands/init.ts:841-855` still records the model as `configured`. Restart guidance remains prudent because the external write changed configuration, but result attribution is not exact. | Track achieved-vs-written model outcomes and add an init-level revalidation-race regression. |
| 2026-07-18 | T-004, T-007 | minor | open | Anti-bloat/code-hygiene residue remains in `src/commands/init.ts`: the unused `getActivePatchableAgents` helper/import (`:12`, `:96-104`), stale optional-skill comments (`:80-83`, `:940-942`), and an unreachable built-in `toInstall` summary branch (`:349-355`). No runtime defect was confirmed. | Remove the dead helper/import/branch and update comments in a focused cleanup without broad refactoring. |
| 2026-07-18 | T-004, T-007 | minor | open | Runtime coverage is broad, but the mixed-profile integration case does not assert the actual `current: mixed` UI description, and no init test asserts that conflicting agents are disabled in the checkbox. Source and helper tests independently support both behaviors, so this is an evidence-strength gap rather than a confirmed defect. | Add focused prompt-argument assertions when this flow is next changed. |
| 2026-07-18 | T-001–T-008 | nit | documented | Independent closure audit reproduced all required local validation: 528 tests, typecheck, build, dist validation, smoke, CLI version `0.6.3`, packed metadata `0.6.3`, and scoped diff checks all passed. CP-01 through CP-04 have recorded PASS verdicts; AC-01 through AC-17 map to real tasks and product changes. | No closure blocker; retain the minor follow-ups above as bounded debt. |
