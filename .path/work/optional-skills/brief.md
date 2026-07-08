# Brief: Optional Skills System

## Objective
Add first-class optional skill management to `opencode-path` and introduce the first five optional managed skills without bloating the default workflow pack.

The system must keep core skills installed automatically, let users opt into optional skills during `init`, and provide a dedicated `opencode-path skills` command for installing or removing optional managed skills after installation.

## Problem
`opencode-path` already has managed core skill support, but optional skills were intentionally left as technical debt. Adding more skills as core would make every installation heavier and noisier. Adding skill templates without a management flow would leave users unable to select, remove, or update them cleanly.

The desired change is a reusable optional-skill lifecycle: catalog, install, remove, conflict handling, uninstall cleanup, template validation, agent trigger wiring, and tests.

## Scope
- Keep core skills and optional skills as distinct managed catalog entries.
- Keep `cross-repo-architecture` as a core skill installed automatically.
- Add these optional skills:
  - `migration-and-data-change`
  - `api-contracts`
  - `security-boundary-review`
  - `incident-recovery`
  - `test-strategy`
- Add optional skill selection to `opencode-path init`; missing optional skills are unchecked by default.
- Add a dedicated `opencode-path skills` command, matching the interaction style of existing management commands, for installing/removing optional skills.
- Extend `uninstall` so it removes all managed skills from the catalog, both core and optional, while preserving unmarked/manual skills.
- Add concise skill activation instructions to the appropriate agent templates.
- Add tests and distribution validation coverage for the new lifecycle.

## Non-goals
- Do not make the five new skills core.
- Do not remove or downgrade `cross-repo-architecture` from core in this feature.
- Do not add non-interactive `--add` / `--remove` flags to `opencode-path skills` unless the existing command standard already requires them.
- Do not let `init` remove optional skills; removals belong to the dedicated `skills` command and `uninstall`.
- Do not let Developer use skills to make architecture, security, data migration, API contract, or test-scope decisions that are missing from the handoff.
- Do not broaden agent permissions as part of this feature unless strictly required for existing command patterns.
- Do not introduce new runtime dependencies unless an existing project pattern cannot reasonably solve the problem.

## Constraints
- Packaged agent templates live under `templates/*.md`.
- Packaged skill templates currently live under `templates/skills/<skill-name>/SKILL.md`.
- `src/lib/paths.ts` currently defines `CORE_SKILLS`; optional skills need a source of truth without breaking existing core behavior.
- `src/lib/skills.ts` currently centralizes managed core skill install/update/delete behavior and marker handling.
- `src/commands/init.ts` already has explicit technical-debt comments for optional skills and must preserve existing agent/profile/model behavior.
- `src/cli.ts` currently documents future `skills` command debt; this feature resolves that debt.
- `src/commands/uninstall.ts` currently deletes managed core skills and preserves unmarked skill files.
- Managed skill files must use the existing marker: `<!-- managed-by: opencode-path -->`.
- opencode skill files must be installed at `.opencode/skills/<name>/SKILL.md` for project scope and `~/.config/opencode/skills/<name>/SKILL.md` for global scope.
- After installing, removing, or updating skills/agents/config-time files, users must be told to restart opencode because running sessions keep already-loaded config.

## Decisions
- Keep `cross-repo-architecture` as the only core skill for now; core skills install automatically during `init`.
- Add the five selected skills as optional managed skills, not core skills.
- Model managed skills with a catalog that distinguishes `core` from `optional`; avoid hardcoding optional names only in CLI commands.
- `init` installs core skills automatically and offers an optional-skill selection step for additional installs only. Missing optional skills are unchecked by default.
- `opencode-path skills` manages optional skills as a target-state command: checked optional skills should be active after apply, unchecked optional skills should be removed if they are managed, and conflicts are shown but not modified.
- Core skills are not removable through `opencode-path skills`; they may be shown informationally or omitted from the checkbox, but the command must not remove them.
- `uninstall` removes all managed skills in the managed catalog, including core and optional skills, and preserves unmarked/manual files.
- Agent activation rules are intentionally concise in agent templates; detailed protocol lives in each `SKILL.md`.
- Developer may load all five optional skills only in limited implementation mode: follow an existing contract, detect gaps, record evidence, and escalate missing decisions. Developer must not invent contract, migration, security, or test-scope decisions.

## Relevant files and areas
- `src/lib/paths.ts` — managed skill catalog source or exported constants/types; preserve existing install target behavior.
- `src/lib/skills.ts` — skill template resolution, catalog state, install/update/delete operations, marker handling, validation helpers.
- `src/lib/skills.test.ts` — unit coverage for catalog, optional/core distinctions, template validation, install/delete/update behavior.
- `src/commands/init.ts` — add optional skill selection step without surprising removal behavior.
- `src/commands/init.test.ts` — cover default-unchecked optional skills, selected optional install, dry-run, conflicts, and no removal from init.
- `src/commands/skills.ts` — new command for optional skill management, following existing command style.
- `src/commands/agents.ts` — reference for target-state checkbox UX and summary behavior.
- `src/commands/uninstall.ts` — remove managed optional skills along with managed core skills; preserve conflicts.
- `src/commands/uninstall.test.ts` — cover managed optional deletion and unmarked preservation.
- `src/cli.ts` — register `skills` command and remove/resolve the existing technical-debt comment.
- `src/lib/messages.ts` and `src/lib/ui.ts` — reuse existing warning, summary, dry-run, confirm, and restart patterns where appropriate.
- `templates/skills/*/SKILL.md` — existing core skill plus five new optional skill templates.
- `templates/architect.md` — concise activation triggers for Architect-owned skills.
- `templates/developer.md` — limited-mode activation triggers and escalation guardrails for Developer.
- `templates/reviewer.md` — review activation triggers for specialized checks.
- `templates/auditor.md` — audit activation triggers for specialized checks and incident recovery.
- `package.json`, `scripts/validate-dist-skill-lookup.mjs` — ensure packaged distribution can locate all skill templates.

## Acceptance Criteria
- AC-01: The managed skill catalog distinguishes core skills from optional skills and includes `cross-repo-architecture` as core plus exactly the five selected optional skills.
- AC-02: All five optional skill templates exist under `templates/skills/<skill-name>/SKILL.md`, have valid opencode skill frontmatter with matching `name`, meaningful `description`, and include the managed marker when installed.
- AC-03: `opencode-path init` installs core skills automatically and presents an optional-skill selection step where missing optional skills are unchecked by default.
- AC-04: `opencode-path init` can install selected optional skills in the selected project/global scope, respects dry-run, and does not remove optional skills when they are left unchecked.
- AC-05: `opencode-path skills` exists, is registered in the CLI help, supports project/global scope, dry-run, confirmation behavior, and manages optional skills using the same user-interaction standard as existing management commands.
- AC-06: `opencode-path skills` installs checked missing optional skills, removes unchecked managed optional skills, leaves checked active optional skills unchanged, and refuses to overwrite unmarked conflicts.
- AC-07: Core skills cannot be removed through `opencode-path skills`; they remain core-managed and installed automatically by `init`.
- AC-08: `opencode-path uninstall` removes all managed skills in the catalog, including core and optional skills, deletes empty managed skill directories where safe, and preserves unmarked/manual skill files with a clear warning or summary.
- AC-09: Architect, Developer, Reviewer, and Auditor templates contain concise activation guidance for the optional skills they are allowed to invoke, without inlining each full skill protocol.
- AC-10: Developer-specific guidance makes clear that Developer may use optional skills only to execute within an existing contract, detect gaps, record evidence, and escalate; Developer must not make missing architecture/security/data/API/test-scope decisions.
- AC-11: Skill validation covers every managed skill template, including frontmatter presence, matching folder/name, non-empty description, readable template, and marker behavior.
- AC-12: Existing agent, profile, model, core skill, init, uninstall, and distribution lookup behavior continues to work.
- AC-13: Validation commands documented by this project pass after implementation: `npm run typecheck`, `npm run test`, `npm run build`, and `npm run validate-dist`.

## Edge cases
- A user has an unmarked/manual skill with the same name as a managed optional skill; install/remove/update must not overwrite or delete it silently.
- A user runs `init` after previously installing optional skills; `init` must not remove optional skills merely because the user leaves an install-only selection unchecked.
- A user runs `skills` and unchecks a managed optional skill; the command should remove only the managed file and clean up the empty skill directory when safe.
- A user runs `skills` where a core skill is active; the command must not allow removal of core skills.
- Global and project scopes must place skills in different correct locations and not cross-contaminate paths.
- Dry-run must not create or remove files, but must show planned optional skill installs/removals/conflicts clearly.
- `--yes` should not install optional skills by surprise in `init`; optional skills require explicit selection in interactive init.
- Distribution builds must be able to locate `templates/skills` from built output, not only from `tsx`/source execution.
- A skill template without frontmatter or with mismatched `name` should fail validation before release.
- Developer encountering a task that touches a managed skill trigger but lacks a contract must stop and escalate rather than designing the missing behavior.

## Open questions
- None blocking. Implementation should preserve existing command UX conventions where this brief does not specify exact prompt text.
