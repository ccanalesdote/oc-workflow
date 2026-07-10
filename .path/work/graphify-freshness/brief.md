# Brief: Graphify Freshness and Close Refresh

## Objective
Improve the optional Graphify integration so repositories can record when their graph was last refreshed, install a safe compatible Graphify release line for new installs, and let Developer offer a pre-commit graph refresh during feature close so Explorer usually finds a ready graph in later Spec/Architect reconnaissance.

## Problem
The first Graphify integration can initialize or update a graph, but the workflow cannot tell when the graph was last refreshed or which code state it represents. Hooks would make refresh more automatic, but they add path fragility and can leave the working tree dirty after commits. Refreshing on Explorer use would also add latency exactly when reconnaissance should begin.

## Scope
- Add `.path/graphify-state.json` as the official local Graphify freshness state written by `opencode-path graphify` after successful graph initialization or update.
- Record enough metadata for agents to judge freshness: schema version, update timestamp, Graphify version, compatible version range, current Git commit when available, and whether the working tree was dirty at refresh time.
- Change new Graphify CLI installs to use the compatible `0.9.x` release line instead of unconstrained latest.
- Preserve existing installed Graphify CLIs without automatic downgrade, reinstall, or upgrade.
- Update `graphify-explorer` so Explorer treats the state file as a freshness hint, does not auto-refresh during reconnaissance, and still verifies conclusions in source files.
- Update Developer's close/finish procedure so, when `.path/graphify-state.json` exists, Developer suggests running `opencode-path graphify` before creating commits; if the user accepts, Developer runs it and includes resulting changes in the normal commit flow unless the user says otherwise.
- Add cross-repo guidance that Graphify state is per repo and must not become a combined cross-repo graph or shared contract source.
- Add minimal README documentation and tests.

## Non-goals
- Do not install Git hooks.
- Do not add background/watch refresh.
- Do not make Explorer run a heavy graph refresh automatically when it wants to explore.
- Do not make Graphify mandatory for any agent or workflow.
- Do not create a combined graph across multiple repositories.
- Do not make `.path/graphify-state.json` automatically ignored or automatically tracked; leave that choice to the user's repo policy.
- Do not require Developer to verify Graphify CLI installation just to decide whether to show the close suggestion.
- Do not push commits automatically.

## Constraints
- Current Graphify helper code lives in `src/lib/graphify.ts` and already uses Node child process APIs with argument arrays.
- Current graph command lives in `src/commands/graphify.ts` and initializes with `graphify .` or updates with `graphify update .` based on `graphify-out/graph.json`.
- Current Developer close/finish instructions live in `templates/developer.md` under `## Close / finish procedure`.
- Current Explorer Graphify guidance lives in `templates/skills/graphify-explorer/SKILL.md`.
- Current cross-repo architecture guidance lives in `templates/skills/cross-repo-architecture/SKILL.md`.
- Known validation commands for this project are `npm test`, `npm run typecheck`, `npm run build`, and `npm run validate-dist`.
- PyPI currently publishes `graphifyy` version `0.9.11`; use the `0.9.x` compatible range for new installs.
- `uv tool install` supports version specifiers, including range specifiers such as `graphifyy>=0.9.0,<0.10.0`.

## Decisions
- Use `.path/graphify-state.json` as the single freshness signal for `opencode-path` Graphify refreshes.
- Treat the state file as advisory metadata, not a guarantee that the graph is fully current or that Graphify is still installed.
- Use compatible range `>=0.9.0,<0.10.0` for new `uv tool install` installs.
- Do not reinstall, downgrade, or upgrade an already available Graphify CLI automatically.
- Developer should suggest refresh before commits only when `.path/graphify-state.json` exists in the repo root; existence of this state is sufficient signal to offer the option.
- If the user declines the refresh, closing and committing remain valid.
- If the user accepts and `opencode-path graphify` fails, Developer reports the failure and asks whether to continue with commits without refresh.
- If refresh runs before commits, `workingTreeDirty: true` in the state file is expected and valid because it records that the graph was refreshed against uncommitted feature changes.

## Implementation Contract

### Target files and areas
- `src/lib/graphify.ts`: add Graphify version/range helpers, Git metadata helpers, state-file path/read/write helpers, and update the install command spec.
- `src/commands/graphify.ts`: after successful graph init/update, write `.path/graphify-state.json` and report the state path.
- `src/lib/graphify.test.ts`: cover version range install args, state writing, Git metadata fallbacks, and no state write on graph failure.
- `src/commands/graphify.test.ts`: cover command-level state write/reporting and failure behavior if not already covered via helper tests.
- `src/commands/init.test.ts`: update install expectation from unconstrained `graphifyy` to compatible range if init tests assert the helper command arguments.
- `templates/developer.md`: insert optional Graphify refresh into close/finish procedure before commit creation.
- `templates/skills/graphify-explorer/SKILL.md`: update Graph freshness guidance to use `.path/graphify-state.json` and to avoid automatic on-use refresh.
- `templates/skills/cross-repo-architecture/SKILL.md`: add concise Graphify-per-repo guidance for cross-repo exploration.
- `README.md`: document compatible install range, state file, close-time refresh suggestion, and no hooks/default auto-refresh.

### Expected changes by area
- `src/lib/graphify.ts` must:
  - Define constants equivalent to `GRAPHIFY_COMPATIBLE_RANGE = ">=0.9.0,<0.10.0"` and `GRAPHIFY_INSTALL_SPEC = "graphifyy>=0.9.0,<0.10.0"`.
  - Change new CLI installation from `uv tool install graphifyy` to `uv tool install graphifyy>=0.9.0,<0.10.0` using an argument array entry, not a shell string. Do not include shell quotes in the actual argument.
  - Preserve the no-op path when `graphify --version` already succeeds; do not reinstall existing Graphify just to enforce the range.
  - Expose a helper to obtain the Graphify version from `graphify --version`. It may return both raw output and parsed semantic version; if parsing fails, preserve raw output and use `null` for parsed version.
  - Add a state shape for `.path/graphify-state.json` with at least:
    - `schemaVersion: 1`
    - `updatedAt`: ISO timestamp generated after successful graph command completion
    - `graphifyVersion`: parsed version string or `null`
    - `graphifyVersionRaw`: raw `graphify --version` output trimmed, or `null` if unavailable
    - `graphifyCompatibleRange`: `>=0.9.0,<0.10.0`
    - `commit`: current `HEAD` commit hash or `null` when Git metadata is unavailable
    - `workingTreeDirty`: boolean when Git status is available, otherwise `null`
  - Write state to `.path/graphify-state.json` relative to the command cwd, creating `.path/` if needed.
  - Gather Git metadata with child process APIs and argument arrays (`git rev-parse --verify HEAD`, `git status --porcelain` or equivalent); if Git is missing, the cwd is not a repo, or HEAD is unavailable, do not fail the graph command solely because metadata is unavailable.
  - Return actionable errors when the state file cannot be written after a successful graph refresh. The command may exit non-zero for state write failure, but must not claim that state was written.
- `src/commands/graphify.ts` must:
  - Keep existing init/update/force behavior unchanged.
  - Write `.path/graphify-state.json` only after `runGraphInit` or `runGraphUpdate` succeeds.
  - Never write or modify the state file when Graphify CLI is missing or the graph init/update command fails.
  - Print a clear success line mentioning that Graphify state was updated at `.path/graphify-state.json`.
  - Continue to avoid installing hooks, skills, branches, worktrees, or `.path/work` artifacts.
- `templates/developer.md` must:
  - Add a pre-commit optional step in `## Close / finish procedure` after checking changes and before committing.
  - The step triggers only when `.path/graphify-state.json` exists in the current repo root.
  - The step asks the user whether to run `opencode-path graphify` before commits so the graph/state can be included in the commit set for the finished feature.
  - If the user declines, Developer proceeds with the existing commit procedure.
  - If the user accepts, Developer runs `opencode-path graphify`, then re-runs `git status` and `git diff` before committing.
  - If `opencode-path graphify` fails, Developer reports the failure and asks whether to continue with commits without refreshed graph state.
  - The procedure must still require explicit user confirmation for commits and must never push automatically.
- `templates/skills/graphify-explorer/SKILL.md` must:
  - State that `.path/graphify-state.json`, when present, is a freshness hint for graphs refreshed through `opencode-path graphify`.
  - Explain that `commit` may be the pre-commit HEAD and `workingTreeDirty: true` is expected when Developer refreshed before committing feature changes.
  - Tell Explorer not to run `opencode-path graphify` automatically at the start of reconnaissance by default.
  - Tell Explorer to verify Graphify conclusions in source files and to fall back to normal exploration or ask the user when the graph appears stale.
- `templates/skills/cross-repo-architecture/SKILL.md` must:
  - Add guidance that Graphify graph/state is per repository.
  - In cross-repo work, Explorer may use each repo's graph/state independently as an optional navigation aid.
  - Do not combine repo graphs into one shared contract source.
  - Shared API/DTO/auth/error/rollout decisions must still be verified from source files and explicit contracts, not inferred from Graphify output alone.
- `README.md` must:
  - Document `.path/graphify-state.json` fields at a high level.
  - Document that new installs use `graphifyy>=0.9.0,<0.10.0` and existing installs are not automatically replaced.
  - Document that hooks/background/watch refresh are not installed by default.
  - Document that Developer may suggest a pre-commit refresh when the state file exists and that skipping it is valid.

### Contracts / invariants / compatibility to preserve
- Preserve all existing `opencode-path graphify` command behavior for choosing init/update/force commands.
- Preserve the first integration's rule that Graphify remains optional and not an npm/package dependency.
- Preserve project/global `init --with-graphify` behavior and official OpenCode skill install behavior.
- Preserve existing child-process safety: use `execFile`/`execFileSync` with argument arrays, not shell strings.
- Preserve managed skill frontmatter and `<!-- managed-by: opencode-path -->` marker conventions.
- Preserve Developer's rule that commits require explicit user confirmation and push is never automatic.
- Preserve Reviewer invocation requirements in Developer's final checkpoint/final feature review flow.
- The state file must be valid JSON and stable enough for agents to read without brittle parsing.
- The state file is advisory and must not become a hard blocker for Explorer, Developer, Reviewer, Auditor, Spec, or Architect.

### Decisions already made
- State path: `.path/graphify-state.json` relative to the repository/current command cwd.
- State file default policy: normal file in `.path`; do not automatically add it to `.gitignore`.
- Compatible Graphify install range: `>=0.9.0,<0.10.0`.
- Safe new install command: `uv tool install graphifyy>=0.9.0,<0.10.0` as argument array `['tool', 'install', 'graphifyy>=0.9.0,<0.10.0']`.
- Existing Graphify installs are not automatically downgraded, upgraded, or reinstalled.
- No hooks in this feature.
- No Explorer auto-refresh on use in this feature.
- Developer close suggestion is based only on `.path/graphify-state.json` existence, not on pre-checking CLI availability.
- Omitted or failed Graphify refresh does not invalidate the feature close or commits.
- Cross-repo use is per repo, not a combined graph.

### Normal flow to encode
- Graph command:
  1. User runs `opencode-path graphify` from a repo.
  2. Command verifies `graphify` exists.
  3. Command runs existing init/update/force behavior.
  4. After successful graph command completion, command gathers Graphify version and Git metadata.
  5. Command writes `.path/graphify-state.json`.
  6. Command reports graph success and state update.
- New Graphify install through init:
  1. If `graphify --version` already succeeds, skip CLI installation as before.
  2. If CLI is missing and `uv` exists, run `uv tool install graphifyy>=0.9.0,<0.10.0`.
  3. Re-check `graphify --version` and continue with existing official OpenCode skill install/custom skill install flow.
- Developer close:
  1. User explicitly asks to finish/close/commit.
  2. Developer verifies working tree and checks changes.
  3. If `.path/graphify-state.json` exists, Developer asks whether to run `opencode-path graphify` before commits.
  4. If accepted, Developer runs it and re-checks status/diff.
  5. If declined, Developer proceeds.
  6. Developer commits in logical units only with explicit user permission.
- Explorer use:
  1. Explorer uses Graphify only for medium/large reconnaissance.
  2. If `.path/graphify-state.json` exists, Explorer may compare its metadata to current repo state as a freshness hint.
  3. If graph appears stale, Explorer does not auto-refresh by default; it falls back to normal source exploration or asks the user.
  4. Explorer verifies relevant findings by reading source files.

### Escalation contract
If Developer finds that `uv tool install` does not accept the specified Graphify version range, Graphify `--version` cannot be obtained reliably, Graphify changed its init/update command forms, or the close procedure cannot safely determine `.path/graphify-state.json` existence in the current repo root, Developer must stop the affected area, record the block in `progress.md` with Task/checkpoint, Problem, Evidence, Impact, Proposed options, and Status `blocked awaiting Architect decision`, and await an Architect decision. Material changes must be persisted to `brief.md` and/or `tasks.md`; decisions only in `progress.md` are not binding.

### Do not touch / do not introduce
- Do not install or document Git hooks as default behavior.
- Do not call `graphify hook install`, `graphify watch`, or any automatic background refresh command.
- Do not make Explorer, Architect, Spec, Developer, Reviewer, or Auditor auto-run Graphify refresh during normal tasks.
- Do not add new agents.
- Do not add new runtime dependencies.
- Do not add new persistent handoff artifacts beyond `.path/work/graphify-freshness/brief.md`, `tasks.md`, and `progress.md`.
- Do not create a combined cross-repo graph or make Graphify output a shared-contract authority.
- Do not modify `.gitignore` automatically for `.path/graphify-state.json` or `graphify-out/`.
- Do not push, create worktrees, or create branches as part of this feature.
- Do not change unrelated init prompts, skill picker behavior, model/profile flows, or Reviewer/Auditor behavior.

## Relevant files and areas
- `src/lib/graphify.ts`
- `src/lib/graphify.test.ts`
- `src/commands/graphify.ts`
- `src/commands/graphify.test.ts`
- `src/commands/init.test.ts`
- `templates/developer.md`
- `templates/skills/graphify-explorer/SKILL.md`
- `templates/skills/cross-repo-architecture/SKILL.md`
- `README.md`

## Acceptance Criteria
- AC-01: New Graphify CLI installs use `uv tool install graphifyy>=0.9.0,<0.10.0` through argument arrays; existing Graphify installs are not automatically reinstalled, downgraded, or upgraded.
- AC-02: After successful `opencode-path graphify` initialization or update, `.path/graphify-state.json` is written as valid JSON with schema version, timestamp, Graphify version/raw version, compatible range, commit, and working tree dirty metadata.
- AC-03: `opencode-path graphify` does not write or modify `.path/graphify-state.json` when the Graphify CLI is missing or graph initialization/update fails.
- AC-04: Git metadata failures do not fail an otherwise successful graph refresh; unavailable `commit` and `workingTreeDirty` are represented as `null`.
- AC-05: Developer close/finish procedure suggests running `opencode-path graphify` before commits when `.path/graphify-state.json` exists, lets the user decline, re-checks status/diff after accepted refresh, and does not commit or push without existing explicit permissions.
- AC-06: `graphify-explorer` documents state-file freshness semantics, no default on-use refresh, stale graph handling, and required source-file verification.
- AC-07: `cross-repo-architecture` documents that Graphify state/graphs are per repo and cannot replace shared cross-repo contracts or source verification.
- AC-08: README documents the state file, compatible install range, optional pre-commit refresh suggestion, and no default hooks/background refresh.
- AC-09: Automated tests cover install-range arguments, state write success, no state write on graph failure/missing CLI, Git metadata fallbacks, and close/skill documentation changes where practical.
- AC-10: Full project validation passes with `npm test`, `npm run typecheck`, `npm run build`, and `npm run validate-dist`.

## Edge cases
- Graphify already installed with unknown or non-`0.9.x` version: do not reinstall automatically; record parsed/raw version where possible and optionally warn, but do not block graph refresh solely for version mismatch.
- `graphify --version` output is not parseable: write `graphifyVersion: null` and preserve `graphifyVersionRaw`.
- Cwd is not a Git repo: still write state with `commit: null` and `workingTreeDirty: null` after successful graph refresh.
- Git repo has no commits yet: write `commit: null`; `workingTreeDirty` may still be detected if feasible, otherwise `null`.
- Refresh before commit with feature changes: `workingTreeDirty: true` is valid and should not be treated as failure.
- `.path/` does not exist: create it before writing state.
- State file exists but Graphify CLI was later removed: Developer may still suggest refresh; if user accepts and command fails, report and ask whether to continue commits without refresh.
- User declines Developer's refresh suggestion: continue close/commit flow normally.
- Graphify refresh creates or changes large graph output: include in commit flow only under the existing user-confirmed commit procedure; do not silently discard.

## Open questions
None.

## Assumptions and residual risks
- The `0.9.x` Graphify line remains compatible with the documented CLI forms until a future manual compatibility review expands the range.
- Some repositories may choose to ignore `.path/graphify-state.json` or `graphify-out/` themselves; this feature does not enforce either policy.
