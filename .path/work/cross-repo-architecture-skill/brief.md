# Brief: Cross-Repo Architecture Skill

## Objective
Add a lightweight cross-repo architecture workflow to opencode-path without further bloating the base Architect agent prompt.

Architect should detect multi-repo / multi-service features, load a managed core skill for the detailed cross-repo protocol, produce a robust parent-level contract, and later consume repo-specific cross drafts as binding upstream contracts when run inside an affected repo.

## Problem
The current Architect workflow is optimized for one repository. For features that affect multiple repos, services, frontends, backends, packages, or deployment units, running Architect independently in each repo from the same vague idea can cause incompatible API contracts, DTO drift, mismatched events, divergent auth/error behavior, unclear rollout ordering, and no single source of truth for end-to-end validation.

Putting all cross-repo rules directly into the Architect prompt would make an already large prompt larger and noisier. The desired design is to keep Architect focused while giving it a specialized workflow for this case.

## Scope
- Introduce a managed core skill named `cross-repo-architecture`.
- Add a short trigger/stub to the Architect template so Architect loads or applies that skill when a feature is cross-repo.
- Define cross-mode output as a parent-level coordination handoff plus repo-specific contract drafts.
- Define local-mode behavior for Architect when run inside a repo with a cross-repo draft.
- Ensure repo-local final handoffs remain in each repo's Git history.
- Add support for installing the core skill as a managed template in the same global/project scope selected by the user.
- Document future technical debt for optional skill management and update flows without building optional-skill selection now.

## Non-goals
- Do not create a separate `cross-architect` agent for the first version.
- Do not make Architect write application code.
- Do not make cross-mode Architect write directly inside child repos by default.
- Do not require broad child-repo edit permissions.
- Do not make repo-local Architect redesign shared contracts.
- Do not add optional skill selection to `init` until optional skills exist.
- Do not turn a parent workspace into a monorepo or assume all repos share stack, commands, or architecture.

## Constraints
- Existing packaged agent templates live under `templates/*.md`.
- `src/lib/templates.ts` currently validates and reads only agent templates listed by `PACK_AGENTS` in `src/lib/paths.ts`.
- `src/lib/paths.ts` currently resolves `agentDir` and `configPath`, but not a skills directory.
- CLI commands are registered in `src/cli.ts`: `init`, `agents`, `models`, `profiles`, and `uninstall`.
- `src/commands/init.ts` is the guided installer and is already large; avoid unnecessary interactive expansion in this feature.
- Package publication currently includes `dist` and `templates` via `package.json` `files`.
- opencode skills live under `.opencode/skills/<skill-name>/SKILL.md` for project scope or `~/.config/opencode/skills/<skill-name>/SKILL.md` for global scope.
- Managed files should use the existing marker convention: `<!-- managed-by: opencode-path -->`.

## Decisions
- Use a core skill, not a new agent, for the detailed cross-repo workflow.
- Treat `cross-repo-architecture` as a core managed skill installed with the workflow pack, not as an optional user-selected skill in the first version.
- Architect template receives only a concise cross-repo trigger and local-consumption rule; detailed protocol lives in the skill.
- Cross-mode handoff may extend the usual work folder with `repos/{repo}.md` drafts because the parent cross handoff is a coordination artifact, not a standard repo-local implementation handoff.
- Repo-local handoffs must still use the normal three-file structure: `brief.md`, `tasks.md`, `progress.md`.
- `repos/{repo}.md` files are contract-bound drafts, not final implementation plans.
- Local Architect may choose local files, helpers, commands, validation steps, and task breakdown, but must not change shared API/DTO/event/auth/error/compatibility/rollout decisions.
- If local constraints conflict with the cross contract, local Architect must block and escalate back to the cross handoff instead of silently adapting the contract.
- Since the parent cross handoff may not live in Git, each repo-local `brief.md` must copy the relevant cross-contract constraints into that repo's persistent handoff.

## Relevant files and areas
- `templates/architect.md` — add the concise trigger/stub for cross-repo mode and cross-draft consumption.
- `templates/skills/cross-repo-architecture/SKILL.md` or equivalent packaged template path — new managed core skill content.
- `src/lib/templates.ts` — extend template discovery/reading/validation to include managed skill templates or add separate skill-template helpers.
- `src/lib/paths.ts` — add project/global skill directory resolution while preserving existing agent path behavior.
- `src/commands/init.ts` — install core skills in the selected scope without adding optional skill selection yet.
- `src/commands/uninstall.ts` — decide whether managed core skills are removed with uninstall, or explicitly document/implement separate behavior.
- `src/cli.ts` — future technical debt only if a dedicated `skills` command is later added.
- `src/lib/agents.ts` — useful reference for managed-file state and apply patterns; do not force skill logic into agent-specific names if a separate `src/lib/skills.ts` is cleaner.
- `package.json` — ensure any new skill template directory is included in package files if needed.
- Tests near `src/commands/init.test.ts`, `src/lib/templates.test.ts`, and `src/lib/paths.test.ts`.

## Acceptance Criteria
- AC-01: A managed core skill named `cross-repo-architecture` exists in the packaged templates and contains the detailed cross-repo architecture workflow.
- AC-02: The Architect template contains a concise trigger requiring use of the cross-repo skill when a feature affects multiple repositories, services, packages, frontends, backends, or deployment units.
- AC-03: The Architect template or skill defines local consumption behavior: when run inside a repo with a cross draft, Architect treats it as a binding upstream contract and creates a normal local handoff without changing shared contracts.
- AC-04: The cross-repo skill defines parent-level output including `brief.md`, `tasks.md`, `progress.md`, and `repos/{repo}.md` contract-bound drafts.
- AC-05: The cross-repo skill clearly separates decisions owned by cross Architect from decisions allowed to repo-local Architect.
- AC-06: Repo-local handoffs are required to copy relevant cross-contract constraints because the parent cross handoff may not be committed to Git.
- AC-07: Init installs the core skill in the selected global or project scope using opencode's expected skill path layout.
- AC-08: Managed skill files include the `<!-- managed-by: opencode-path -->` marker or an equivalent existing managed-file marker convention.
- AC-09: The first version does not add optional skill selection prompts to `init`.
- AC-10: Future optional skill management is documented as technical debt, including a possible `skills` command and update/refresh support.
- AC-11: Existing agent installation, profile, model, and uninstall flows continue to pass their current tests.
- AC-12: Validation commands documented by the project pass: `npm run typecheck`, `npm run test`, and, if packaging behavior changed, `npm run build`.

## Edge cases
- A feature initially appears single-repo but Architect discovers another repo/service must change; Architect should switch to cross mode before finalizing implementation handoff.
- A user runs Architect locally inside a repo and provides only a parent `brief.md` but no matching `repos/{repo}.md`; Architect should ask for the relevant repo draft or block if the local responsibility is ambiguous.
- Repo names in `repos/{repo}.md` may not match directory names exactly; the cross handoff should state the intended repo/service identity clearly.
- The parent cross handoff may live outside Git and later disappear; local handoffs must preserve copied contractual constraints.
- A local repo cannot implement the contract due to real architecture or compatibility constraints; local Architect must block and escalate rather than weakening the contract.
- Existing managed agent workflows should not be broken if skill installation partially fails; implementation should choose a clear failure strategy and test it.
- Project and global installations should place skills in the correct opencode paths and not confuse `agent` vs `skills` directories.
- Existing users with manually created skills of the same name may have conflicts; implementation must avoid silent overwrite and follow managed-file safety principles.

## Open questions
- Should `uninstall` remove managed core skills immediately, or should skill removal wait for a future dedicated `skills` command? Developer should inspect current uninstall semantics and choose the least surprising behavior.
- Should managed skill support be implemented in a new `src/lib/skills.ts` or generalized with existing agent template helpers? Prefer separation if it keeps agent-specific code clear.
- Should `validateAllTemplates()` validate skills too, or should there be a separate validation step with skill-specific rules? Prefer skill-specific validation if frontmatter requirements differ.
