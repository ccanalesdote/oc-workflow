# Brief: Optional Graphify Integration

## Objective
Add an optional Graphify integration to `opencode-path` so users can opt into Graphify during `init`, install the official Graphify tooling safely, install an `opencode-path` Explorer-oriented skill, and run a small `opencode-path graphify` command to initialize or incrementally refresh the local graph.

## Problem
Explorer benefits from a repository graph for medium and large reconnaissance, but Graphify must remain optional. Installing Graphify instructions permanently into the built-in Explorer prompt would make an optional tool part of the default behavior and would affect users who did not install Graphify.

## Scope
- Add an optional Graphify prompt to `opencode-path init`, defaulting to no.
- Add `opencode-path init --with-graphify` for non-interactive acceptance of only the Graphify integration.
- Install the official Graphify CLI via the official package/method when missing.
- Run Graphify's official OpenCode skill install command after the CLI is available.
- Install a new managed `opencode-path` skill named `graphify-explorer` only after the official CLI and official skill install succeed.
- Add `opencode-path graphify` to initialize or incrementally update the current repository graph.
- Add minimal documentation and tests for the new behavior.

## Non-goals
- Do not install Graphify hooks in this iteration.
- Do not create branches, worktrees, feature lifecycle commands, or start/end-development workflow automation.
- Do not modify the base prompt/description/configuration of the built-in `explore` agent.
- Do not integrate Graphify with Architect, Developer, Reviewer, Auditor, Spec, or Research.
- Do not fork, copy, or modify Graphify internals.
- Do not duplicate Graphify's official technical documentation beyond the minimum commands needed for installation and usage.
- Do not make Graphify a required dependency of `opencode-path`.
- Do not add update/status/uninstall/admin command families for Graphify.

## Constraints
- Current skill templates live under `templates/skills/<skill-name>/SKILL.md`.
- Managed skills install to `<target.skillDir>/<skill-name>/SKILL.md`, where project scope is `.opencode/skills` and global scope is `~/.config/opencode/skills`.
- Managed skill templates must have frontmatter with matching `name`, a non-empty `description`, and the managed marker `<!-- managed-by: opencode-path -->`.
- `init` currently validates all registered managed skill templates before prompting.
- `init --yes` skips final confirmation only and must not silently opt into Graphify.
- Existing command validation scripts are `npm test`, `npm run typecheck`, `npm run build`, and `npm run validate-dist`.
- Official Graphify docs identify the PyPI package as `graphifyy`, the CLI as `graphify`, the recommended install as `uv tool install graphifyy`, the OpenCode skill install as `graphify install --platform opencode`, and project-scoped assistant installs as accepting `--project`.
- Official Graphify docs state initial graph creation can be run as `graphify .` and incremental update can be run as `graphify update .` or `/graphify . --update`; use the CLI form from `opencode-path`.

## Decisions
- Keep Graphify outside Explorer's base prompt; communicate Explorer behavior via a managed optional skill only.
- Do not add `graphify-explorer` to the normal optional-skill checkbox catalog because it must not be installable without the official Graphify integration.
- Treat `graphify-out/graph.json` as the stable project-level signal that a graph already exists.
- `opencode-path graphify` chooses `graphify .` when `graphify-out/graph.json` is missing and `graphify update .` when it exists.
- Add only one graph command flag in this iteration: `--force`, which maps to `graphify update . --force` when updating an existing graph.
- Do not run `graphify opencode install` in this iteration because the docs describe it as an always-use graph setup that may write broader instruction/plugin files.

## Implementation Contract

### Target files and areas
- `src/cli.ts`: register `--with-graphify` on `init` and add a new `graphify` command with `--force`.
- `src/commands/init.ts`: add Graphify planning, prompt, apply, and result summary behavior.
- `src/commands/graphify.ts`: new command implementation for initialize/update behavior.
- `src/lib/graphify.ts`: new Graphify helper module for CLI detection, official installation, official skill install, graph-state detection, and graph command execution.
- `src/lib/ui.ts`: extend `CommandOptions` only if needed to carry `withGraphify?: boolean`; do not change existing option semantics.
- `templates/skills/graphify-explorer/SKILL.md`: new managed skill template with the exact content specified below.
- `scripts/validate-dist-skill-lookup.mjs`: include `graphify-explorer` in the managed skill template validation list only if `graphify-explorer` is registered as a managed skill type; if implementation uses a separate Graphify-specific installer that reads the template directly, still add equivalent validation for this template.
- `README.md`: minimal documentation for `init --with-graphify`, optional Graphify install prompt, `opencode-path graphify`, and the fact that hooks are intentionally not installed.
- Tests:
  - `src/commands/init.test.ts`
  - `src/commands/graphify.test.ts`
  - `src/lib/graphify.test.ts` if helper behavior is not fully covered through command tests.
  - `src/lib/skills.test.ts` if the new skill is added to managed skill catalog/types.

### Expected changes by area
- `src/lib/graphify.ts` must expose small testable functions. Required behavior:
  - Check Graphify CLI availability with `graphify --version`.
  - Check `uv` availability with `uv --version` before attempting installation.
  - Install Graphify CLI with `uv tool install graphifyy` only when `graphify` is not already available.
  - After CLI install, re-check `graphify --version`; if still unavailable, return an actionable failure mentioning `uv tool update-shell` and PATH.
  - Install the official OpenCode skill with `graphify install --platform opencode`; for project scope append `--project`.
  - Do not call `graphify opencode install`, `graphify hook install`, `graphify watch`, or any Graphify uninstall/admin command.
  - Detect existing graph by checking `graphify-out/graph.json` relative to `process.cwd()` unless a path argument is explicitly introduced later; do not introduce path arguments in this iteration.
  - Run graph initialization as `graphify .` when no graph exists.
  - Run graph update as `graphify update .` when `graphify-out/graph.json` exists.
  - Run forced update as `graphify update . --force` only when `--force` is passed and `graphify-out/graph.json` exists.
  - Use Node child process APIs without adding a new dependency. Prefer `execFile`/`spawn` with argument arrays, not shell strings.
- `src/commands/init.ts` must:
  - Add an `InitPlan` field for Graphify acceptance/status without changing existing agent/profile/model/skill behavior.
  - Prompt interactively after optional-skill selection and before model/profile steps is acceptable; keep the prompt non-invasive and default false.
  - Prompt text must be materially equivalent to: `Graphify can improve repository exploration by generating a local code graph. Install optional Graphify integration?`
  - `--with-graphify` sets Graphify accepted without asking the Graphify prompt.
  - `--yes` does not set Graphify accepted and must not ask the Graphify prompt unless `--with-graphify` is also present.
  - In dry-run mode, show that Graphify would be installed/configured but run no external commands and write no files.
  - Before running external Graphify installation, check the local `graphify-explorer` skill state. If a conflicting unmarked `graphify-explorer/SKILL.md` exists, skip all external Graphify installation steps and report an actionable conflict.
  - If any Graphify external step fails, continue the main `opencode-path` installation, report the failed step/actionable hint, and do not install `graphify-explorer`.
  - Install `graphify-explorer` only after Graphify CLI is available and `graphify install --platform opencode` exits successfully.
  - Include clear result summary lines for Graphify CLI already present/installed, official skill installed, custom Explorer skill installed/unchanged, skipped, or failed.
- `src/commands/graphify.ts` must:
  - Print a normal command header and actionable errors using existing UI/message style.
  - Fail without mutating files if `graphify --version` fails, with instruction to run `opencode-path init --with-graphify` or install Graphify manually.
  - If `graphify-out/graph.json` is missing, run `graphify .` and report initialization.
  - If `graphify-out/graph.json` exists, run `graphify update .` and report incremental update.
  - If `--force` is passed while a graph exists, run `graphify update . --force`.
  - If `--force` is passed and no graph exists, initialize with `graphify .`; do not invent a force-init command.
  - Do not install hooks, create branches, create worktrees, or modify `.path/work`.
- `templates/skills/graphify-explorer/SKILL.md` must be created with exactly this content:

```md
---
name: graphify-explorer
description: Use ONLY when operating as the Explorer agent and doing medium or large repository reconnaissance in a repo where Graphify is installed; use the graph as navigation aid, then verify findings in source files.
---

# Graphify for Explorer

Use this skill only when you are operating as the Explorer agent and Graphify is installed for the current environment.

Graphify can improve repository exploration by generating and querying a local code graph. Treat it as a navigation aid for understanding structure, relationships, likely impact areas, and execution paths. Do not treat it as an absolute source of truth.

## When to use Graphify

Use Graphify for medium or large reconnaissance tasks, especially when the task involves:

- initial exploration of an unfamiliar repository;
- identifying major modules, packages, services, or subsystems;
- mapping dependencies, imports, call paths, ownership boundaries, or execution routes;
- finding likely affected areas before reading source files;
- understanding cross-file or cross-directory relationships;
- comparing multiple possible implementation areas before narrowing the search.

## When not to use Graphify

Do not use Graphify for small or localized work where direct exploration is enough, including:

- questions scoped to one to three known files;
- reading a specific file or function;
- simple text search, symbol lookup, or filename lookup;
- changes where the relevant files have already been identified;
- mechanical edits, formatting, or narrow bug checks.

For localized work, prefer the normal Explorer tools: file globbing, content search, and direct source reads.

## How to use Graphify safely

- Use Graphify results to choose where to look next, not as final evidence.
- Verify every relevant conclusion by reading the actual source files.
- Prefer scoped graph queries over broad report reading when you already know the question.
- Mention when a conclusion came from graph navigation and which source files verified it.
- If graph output conflicts with source code, trust the source code and report the mismatch.

## Graph freshness

- Do not rebuild or update the graph automatically for every task.
- Do not update the graph for small, localized exploration.
- If the task is medium or large and the graph may be stale, prefer asking the user to run `opencode-path graphify` or run it only when explicitly appropriate for the exploration task.
- Do not install Git hooks or automatic graph refresh mechanisms.

## Scope boundary

This skill is for Explorer only. It does not change Architect, Developer, Reviewer, Auditor, Spec, Research, or any other agent workflow.

<!-- managed-by: opencode-path -->
```

### Contracts / invariants / compatibility to preserve
- Preserve existing `init` agent selection, optional-skill selection, profile selection, model configuration, final summary, dry-run, and `--yes` semantics.
- Preserve the current managed skill marker convention and conflict protection. Never overwrite unmarked skill files.
- Preserve project/global target behavior. Project-scoped Graphify official skill install must pass `--project`; global-scoped install must not pass `--project`.
- Preserve the existing OpenCode restart warning after config-time files are installed.
- Do not add Graphify as an npm dependency or package dependency.
- Do not require Graphify for users who reject the integration.
- Do not allow `graphify-explorer` to be installed independently through the normal optional-skill picker unless a future design explicitly adds a managed integration state model.

### Decisions already made
- Official CLI install command: `uv tool install graphifyy`.
- Official OpenCode skill install command: `graphify install --platform opencode`, plus `--project` for project scope.
- Graph initialization command from `opencode-path`: `graphify .`.
- Graph incremental update command from `opencode-path`: `graphify update .`.
- Existing graph detection: `graphify-out/graph.json` exists in the current working directory.
- No Graphify hooks in this iteration.
- No branch/worktree/feature lifecycle command in this iteration.
- No changes to Explorer base prompt/config.

### Normal flow to encode
- Interactive `init`:
  1. User proceeds through existing installer flow.
  2. User sees Graphify recommendation with default `No`.
  3. If user rejects, no Graphify commands run and `graphify-explorer` is not installed.
  4. If user accepts, apply phase checks for `graphify-explorer` conflict, checks/install Graphify CLI, runs official OpenCode skill install, and then installs `graphify-explorer`.
  5. Main `opencode-path` installation continues even if Graphify fails.
- Non-interactive acceptance:
  1. `opencode-path init --project --with-graphify --yes` or `--global --with-graphify --yes` accepts Graphify without a prompt.
  2. `--yes` alone does not accept Graphify.
- Graph command:
  1. User runs `opencode-path graphify` from a repository root.
  2. Command verifies `graphify` exists.
  3. If `graphify-out/graph.json` is absent, command runs `graphify .`.
  4. If `graphify-out/graph.json` is present, command runs `graphify update .`.

### Escalation contract
If Developer finds that any official Graphify command has changed, project/global OpenCode installation semantics differ from the docs, or Graphify's CLI does not support the specified command forms, Developer must stop the affected Graphify work, record the block in `progress.md` with Task/checkpoint, Problem, Evidence, Impact, Proposed options, and Status `blocked awaiting Architect decision`, and await an Architect decision. Material changes must be persisted to `brief.md` and/or `tasks.md`; decisions only in `progress.md` are not binding.

### Do not touch / do not introduce
- Do not modify `opencode.json` Explorer description or built-in Explorer prompt text.
- Do not modify Architect, Developer, Reviewer, Auditor, Spec, or Research templates for Graphify.
- Do not call `graphify hook install`, create Git hooks, or configure automatic graph updates.
- Do not call `graphify opencode install` in this iteration.
- Do not create Git branches, worktrees, or feature lifecycle commands.
- Do not add new agents.
- Do not add new persistent handoff artifacts beyond `.path/work/graphify-integration/brief.md`, `tasks.md`, and `progress.md`.
- Do not add automated enforcement that forces Explorer to use Graphify.
- Do not add mandatory worktrees.
- Do not add new runtime dependencies unless implementation becomes impossible with Node built-ins; if that happens, escalate before adding one.

## Relevant files and areas
- `src/cli.ts`
- `src/commands/init.ts`
- `src/commands/init.test.ts`
- `src/commands/skills.ts`
- `src/lib/skills.ts`
- `src/lib/paths.ts`
- `src/lib/ui.ts`
- `src/lib/opencode-models.ts` as a child-process helper style reference
- `templates/skills/*/SKILL.md`
- `scripts/validate-dist-skill-lookup.mjs`
- `README.md`

## Acceptance Criteria
- AC-01: `opencode-path init` recommends optional Graphify installation with default rejection, and rejecting it performs no Graphify CLI calls and does not install `graphify-explorer`.
- AC-02: `opencode-path init --with-graphify` accepts Graphify without the Graphify prompt; `--yes` alone does not accept Graphify.
- AC-03: When accepted and `graphify` is missing, init installs the official CLI with `uv tool install graphifyy`, verifies `graphify --version`, runs `graphify install --platform opencode` with `--project` for project scope, and then installs `graphify-explorer`.
- AC-04: When accepted and `graphify` is already installed, init skips CLI installation, still runs the official OpenCode skill install, and then installs or leaves unchanged `graphify-explorer`.
- AC-05: If any Graphify external step fails, the main opencode-path installation does not abort, the failure is reported actionably, and `graphify-explorer` is not installed unless CLI availability and official skill install succeeded.
- AC-06: A conflicting unmarked `graphify-explorer/SKILL.md` prevents all Graphify external install steps and is reported without overwriting user files.
- AC-07: `templates/skills/graphify-explorer/SKILL.md` exists with the exact contract-defined content and valid managed-skill frontmatter/marker.
- AC-08: No Graphify instructions are added to Explorer's base prompt/config and no Graphify integration is added to Architect, Developer, Reviewer, Auditor, Spec, or Research.
- AC-09: `opencode-path graphify` runs `graphify .` when `graphify-out/graph.json` is absent and runs `graphify update .` when it is present.
- AC-10: `opencode-path graphify --force` maps to `graphify update . --force` only when an existing graph is present; with no graph it initializes normally.
- AC-11: `opencode-path graphify` reports an actionable error when the Graphify CLI is unavailable and does not attempt installation.
- AC-12: Documentation minimally describes optional init installation, `--with-graphify`, `opencode-path graphify`, `--force`, and explicitly states hooks/automatic refresh are not installed.
- AC-13: Automated tests cover accept, reject, already-installed, external failure, non-interactive `--with-graphify`, graph init, graph update, missing CLI, and force update behavior.

## Edge cases
- `uv` missing: report that Graphify CLI install requires `uv` or manual Graphify install; continue main install and do not install `graphify-explorer`.
- `uv tool install graphifyy` succeeds but `graphify --version` still fails: report PATH/action hint including `uv tool update-shell`; do not install `graphify-explorer`.
- Official Graphify skill install fails after CLI is available: report failure and do not install `graphify-explorer`.
- `graphify-explorer` already managed/active: after successful external install, report unchanged rather than rewriting unnecessarily unless existing managed skill update behavior is intentionally reused.
- `graphify-explorer` unmarked conflict: skip Graphify integration steps to avoid partial enablement.
- `--dry-run --with-graphify`: report planned Graphify work but run no external commands and write no files.
- Existing graph output directory without `graphify-out/graph.json`: treat as no graph and run `graphify .`.

## Open questions
None.

## Assumptions and residual risks
- Graphify's documented CLI commands remain stable for the current release line.
- `graphify-out/graph.json` is a sufficient stable indicator of an existing graph because the official README documents that output path.
