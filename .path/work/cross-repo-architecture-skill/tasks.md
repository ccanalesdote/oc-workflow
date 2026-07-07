# Tasks: Cross-Repo Architecture Skill

## Status legend
- pending: not started
- in_progress: actively being implemented
- done: completed and verified for the stated task
- blocked: cannot proceed without input or prerequisite
- cancelled: intentionally no longer needed

## Task table
| ID | Status | Owner | Task | Covers | Verification | Notes |
|---|---|---|---|---|---|---|
| T-001 | done | Developer | Inspect current managed-template and install flows for agents, init, paths, uninstall, and packaging before editing. | AC-07, AC-08, AC-11 | Document findings in implementation notes or progress before code changes; no behavior change yet. | Start with `src/commands/init.ts`, `src/lib/templates.ts`, `src/lib/paths.ts`, `src/lib/agents.ts`, `src/commands/uninstall.ts`, `package.json`. |
| T-002 | done | Developer | Add the packaged core skill template `cross-repo-architecture` with managed marker and detailed workflow content. | AC-01, AC-04, AC-05, AC-06 | Skill template exists at the chosen packaged path and contains cross-mode output, repo draft schema, local consumption rules, allowed/prohibited local decisions, and escalation rules. | Prefer an opencode-compatible path ending in `cross-repo-architecture/SKILL.md`. Ensure package inclusion if template directory changes. |
| T-003 | done | Developer | Add a concise cross-repo trigger and cross-draft consumption rule to `templates/architect.md`. | AC-02, AC-03 | Architect template includes only a short trigger/stub and does not inline the full skill protocol. | Architect must load/use the skill when multiple repos/services/packages/deployment units are involved. |
| T-004 | done | Developer | Extend path/template support for managed core skills in the selected project/global scope. | AC-07, AC-08 | Unit tests cover project skill path `.opencode/skills/<name>/SKILL.md` and global skill path `~/.config/opencode/skills/<name>/SKILL.md`. | Consider new `src/lib/skills.ts`; do not overload agent-specific types with skill names unless clean. |
| T-005 | done | Developer | Install the core skill during `init` without adding optional skill-selection prompts. | AC-07, AC-09, AC-11 | `init` tests or new tests verify selected scope installs/keeps managed core skill and existing agent/profile/model behavior still works. | Respect dry-run and confirmation behavior consistent with existing init plan style. |
| T-006 | done | Developer | Define conflict/overwrite behavior for existing skill files and managed marker handling. | AC-08, AC-11 | Tests cover at least: missing skill installs, managed active skill is left safe/updated according to chosen semantics, unmanaged conflict is not silently overwritten. | Follow existing managed-file safety principles from agents where applicable. |
| T-007 | done | Developer | Decide and implement or explicitly defer uninstall behavior for managed core skills. | AC-10, AC-11 | Tests or documentation show whether `uninstall` removes managed skills now or leaves them for future `skills` command. | If deferred, make that explicit in technical debt notes. |
| T-008 | done | Developer | Add technical debt documentation for future optional skills, skill update/refresh, a dedicated `skills` command, and possible `init.ts` refactor. | AC-10 | A tracked note exists in an appropriate docs/work location chosen by Developer, or the debt is captured in comments/tests only if no docs convention exists. | Do not add optional prompts now. Mention future areas: `src/cli.ts`, `src/commands/skills.ts`, `src/lib/skills.ts`, update semantics. |
| T-009 | done | Developer | Run project validation and fix regressions. | AC-11, AC-12 | `npm run typecheck`, `npm run test`, and `npm run build` pass. 314 tests, typecheck clean, build 81.99 KB. | `npm run smoke` may be run if changes affect packaging/install behavior and time permits. |

## Coverage notes
- AC-01 is covered by T-002.
- AC-02 is covered by T-003.
- AC-03 is covered by T-003 and T-002.
- AC-04 is covered by T-002.
- AC-05 is covered by T-002.
- AC-06 is covered by T-002.
- AC-07 is covered by T-004 and T-005.
- AC-08 is covered by T-002, T-004, and T-006.
- AC-09 is covered by T-005.
- AC-10 is covered by T-008 and T-007 if uninstall behavior is deferred.
- AC-11 is covered by T-005, T-006, T-007, and T-009.
- AC-12 is covered by T-009.

## Auditor notes
| Date | Related task | Severity | Status | Finding / resolution note | Suggested follow-up |
|---|---|---|---|---|---|
| 2026-07-06 | T-004, T-005, T-009 / AC-07, AC-12 | blocker | resolved (2026-07-06) | Packaged/built CLI cannot locate skill templates: `src/lib/skills.ts` resolved `../../templates/skills` for both dist and src, and after `npm run build` the bundled `dist/cli.js` kept that path relative to `dist/`, which pointed outside the package. Dev tests passed because `src/lib` happens to make `../../templates/skills` correct. | **Resolved**: Changed `getSkillTemplatesDir()` dist path from `../../templates/skills` to `../templates/skills` (matching `getTemplatesDir()` strategy). Added `scripts/validate-dist-skill-lookup.mjs` regression test and `npm run validate-dist` script. Built `dist/cli.js` now resolves `templates/skills` correctly relative to `dist/`. Validation: typecheck, 314 tests, build, pack, validate-dist all pass. |
| 2026-07-06 | T-007 / AC-11 | minor | resolved (2026-07-06) | `uninstall` summarizes skipped unmarked skills but only emits explicit warning text for unmarked agent skips after apply; users may miss that skill files were intentionally preserved. | **Resolved**: Added explicit `printWarning` for `result.skillsSkipped` after apply, mirroring the existing agent warning. |
| 2026-07-06 | T-004, T-005, T-007, T-009 / AC-07, AC-11, AC-12 | info | re-audit accepted | Re-audit verified the prior blocker and minor finding are resolved in source and built output. `src/lib/skills.ts` now uses `../templates/skills` for dist and `dist/cli.js` contains the same path. `src/commands/uninstall.ts` now warns for `result.skillsSkipped`. | No required follow-up. Optional hardening: make `validate-dist` exercise the built implementation directly if exports/CLI hooks later make that practical. |
