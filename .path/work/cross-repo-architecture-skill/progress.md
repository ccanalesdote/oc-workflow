# Progress: Cross-Repo Architecture Skill

## Log

### 2026-07-06 22:16 — Developer — All tasks completed, all ACs satisfied

#### Current Task
- T-009 done

#### Current Status
- All 9 tasks completed. 314 tests pass. Typecheck, build, pack all pass.

#### What Was Attempted
- Implemented the full cross-repo-architecture skill feature per the brief

#### What Changed
- Created `templates/skills/cross-repo-architecture/SKILL.md` — core skill template (~8.4KB)
- Updated `templates/architect.md` — cross-repo detection trigger, cross-draft consumption rules, repos/ permissions (edit + bash + quoted worktree)
- Extended `src/lib/paths.ts` — `skillDir` in `InstallTarget`, `CORE_SKILLS` list
- Created `src/lib/skills.ts` — skill template resolution, marker detection, state detection, install/update/delete
- Created `src/lib/skills.test.ts` — 40 tests covering templates, markers, catalog, state, mutations, edge cases
- Updated `src/commands/init.ts` — core skill auto-install during init, conflict warnings, summary, dry-run support
- Updated `src/commands/uninstall.ts` — skill removal alongside agents, skill skip/unmarked handling
- Updated `src/lib/ui.ts` — `printPaths` shows optional `skillDir`
- Tech debt docs in `src/cli.ts`, `src/commands/init.ts`, `src/lib/skills.ts`, `src/lib/paths.ts`
- Updated tests: paths, agents, ui, init, uninstall (all fixtures have `skillDir`)

#### Files Touched
- `templates/skills/cross-repo-architecture/SKILL.md` (new)
- `templates/architect.md` (modified)
- `src/lib/paths.ts` (modified)
- `src/lib/skills.ts` (new)
- `src/lib/skills.test.ts` (new)
- `src/commands/init.ts` (modified)
- `src/commands/init.test.ts` (modified)
- `src/commands/uninstall.ts` (modified)
- `src/commands/uninstall.test.ts` (modified)
- `src/lib/ui.ts` (modified)
- `src/lib/ui.test.ts` (modified)
- `src/lib/agents.test.ts` (modified)
- `src/lib/paths.test.ts` (modified)
- `src/cli.ts` (modified)

#### What Remains
- None

#### Validation Run
- `npm run typecheck` — passes
- `npm run test` — 314 tests pass (14 test files)
- `npm run build` — 81.99 KB, builds successfully
- `npm pack --dry-run` — skill template (8.4kB) included

#### Decisions Made
- Core skill auto-installed during init without prompts (AC-09)
- Uninstall removes managed skills alongside agents (consistent principle)
- Skill conflicts shown as warnings but don't trigger apply path
- Managed marker convention reused from agents (`<!-- managed-by: opencode-path -->`)
- New `src/lib/skills.ts` keeps skill logic separate from agent logic

#### Notes for Next Session
- All ACs covered (AC-01 through AC-12)
- Future work: optional skills, `skills` command, update/refresh semantics (documented as tech debt)
- Architect now has repos/ edit + bash permissions for cross-mode work

#### Do Not Touch
- N/A (feature complete)

### 2026-07-06 22:44 — Developer — Auditor blocker resolution

#### Current Task
- Fix Auditor blocker findings from 2026-07-06 audit.

#### Current Status
- All Auditor findings resolved. Blocker fixed, minor warning added, regression validation created.

#### What Was Attempted
- Fix the packaged/built CLI skill template lookup bug
- Add explicit uninstall post-apply warning for skipped unmarked skills
- Add automated regression validation against built/packaged output

#### What Changed
- **`src/lib/skills.ts`** (line 43): Changed `getSkillTemplatesDir()` dist path from `resolve(thisDir, "..", "..", "templates", "skills")` to `resolve(thisDir, "..", "templates", "skills")`. This matches the `getTemplatesDir()` strategy: from dist, go up one level (to project root) then into `templates/skills`. The dev (src) path remains unchanged at `../../templates/skills`.
- **`src/commands/uninstall.ts`** (lines 297-301): Added explicit `printWarning` for `result.skillsSkipped` after apply, mirroring the existing agent warning.
- **`scripts/validate-dist-skill-lookup.mjs`** (new): Standalone regression script that simulates the dist-based path resolution after build. Verifies `templates/skills/cross-repo-architecture/SKILL.md` is locatable and readable.
- **`package.json`**: Added `validate-dist` script (`npm run build && node scripts/validate-dist-skill-lookup.mjs`).

#### Files Touched
- `src/lib/skills.ts` (modified — 1 line fix)
- `src/commands/uninstall.ts` (modified — 5 lines added)
- `scripts/validate-dist-skill-lookup.mjs` (new)
- `package.json` (modified — 1 script added)

#### What Remains
- None. All Auditor findings resolved.

#### Verification
- `npm run typecheck` — passes
- `npm run test` — 314 tests pass (14 files), all existing tests pass including skills tests
- `npm run build` — 82.13 KB, builds successfully
- `npm run validate-dist` — PASS: skill template lookup from dist works correctly
- `npm pack --dry-run` — skill template (8.4kB) included

#### Built output verification
- `dist/cli.js` line 784: `resolve3(thisDir, "..", "templates", "skills")` (correct dist path)
- `dist/cli.js` line 788: `resolve3(thisDir, "..", "..", "templates", "skills")` (correct src path)

#### Decisions Made
- Regression validation uses a standalone `.mjs` script (not a vitest test) because vitest runs in source mode and cannot test the dist-based path resolution. The script runs after build and simulates the bundled CLI's path resolution.
- Uninstall post-apply warning added symmetrically to the existing agent warning.

#### Notes for Next Session
- Auditor findings resolved with evidence. Ready for re-audit.
- All ACs remain covered (AC-01 through AC-12).

#### Do Not Touch
- N/A

### 2026-07-06 22:53 — Auditor — Re-audit after Developer fixes

#### Current Task
- Re-audit `cross-repo-architecture-skill` after Developer resolved prior Auditor findings.

#### Current Status
- Verdict: ACCEPTABLE for the audited scope. Prior blocker and minor finding are verified resolved.

#### Evidence Reviewed
- Scoped product status/diff excluding `.path/work/**`.
- Plan artifacts for this slug only: `brief.md`, `tasks.md`, `progress.md`.
- Source/runtime evidence: `src/lib/skills.ts`, `dist/cli.js` after build, `scripts/validate-dist-skill-lookup.mjs`, `package.json`, `src/commands/uninstall.ts`, `templates/architect.md`, and `templates/skills/cross-repo-architecture/SKILL.md`.

#### Validation Run
- `npm run typecheck` — pass.
- `npm run test` — pass, 314 tests / 14 files.
- `npm run build` — pass, `dist/cli.js` 82.13 KB.
- `npm run validate-dist` — pass; confirms built-output skill template path exists and reads the cross-repo skill template.
- `npm pack --dry-run` — pass; tarball includes `templates/skills/cross-repo-architecture/SKILL.md`.

#### Resolution Verification
- Prior blocker resolved: `src/lib/skills.ts` lines 42-49 now match the agent template path strategy, and built `dist/cli.js` line 784 uses `resolve3(thisDir, "..", "templates", "skills")`.
- Prior minor resolved: `src/commands/uninstall.ts` lines 297-301 now emits a warning for skipped unmarked skill files.

#### Findings
- No new blocker, major, or minor findings found in this re-audit.

#### Notes
- The new `validate-dist` script simulates the dist path rather than importing an exported dist helper, but direct source and built-output inspection plus pack dry-run are sufficient for this audited fix.
