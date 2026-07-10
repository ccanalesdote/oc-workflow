# Brief: Graphify Code-Only Default

## Objective
Make `opencode-path graphify` safe by default by running Graphify in code-only/local mode, and improve the README enough to clearly explain the workflow, the `skills` command, and the boundary between `opencode-path` Graphify support and Graphify's direct semantic/LLM mode.

## Problem
The current `opencode-path graphify` command initializes a graph with `graphify .` and updates with `graphify update .`. On repositories containing docs, PDFs, images, or other non-code files, Graphify may require an LLM API key and may send non-code content to an external backend. That creates surprise token usage and privacy/trust-boundary risk for a command that users expect to be a safe workflow helper. The README also lacks `skills` command documentation and uses a Mermaid workflow diagram that does not render reliably everywhere and does not precisely communicate the current agent flow.

## Scope
- Change `opencode-path graphify` so initial graph creation uses Graphify's explicit code-only/local extraction mode, and existing-graph refresh uses Graphify's documented no-LLM `update` command.
- Keep semantic/full extraction out of `opencode-path` in this iteration; users who intentionally want semantic extraction should use the `graphify` CLI directly and manage any backend/API-key setup with Graphify.
- Add concise runtime messaging that tells users `opencode-path graphify` is using code-only/local mode and points advanced semantic users to the direct Graphify CLI.
- Record the Graphify mode used by `opencode-path graphify` in `.path/graphify-state.json` after a successful refresh.
- Update README Graphify documentation to explain code-only default, no API-key/token behavior, and direct Graphify semantic usage.
- Moderately simplify README only where needed: replace the initial Mermaid diagram with a plain-text flow, correct the described agent flow, and add missing `skills` command documentation.

## Non-goals
- Do not add `opencode-path graphify --semantic`, `--with-llm`, `--backend`, or generic pass-through Graphify flags in this iteration.
- Do not ask users for API keys, read API-key values, store API keys, validate API keys, or print API-key values.
- Do not make `opencode-path` a full wrapper over the Graphify CLI.
- Do not install Graphify hooks, background refresh, watch mode, or always-use assistant integration.
- Do not rewrite the README from scratch or remove core installation/troubleshooting information.
- Do not change agent prompts/templates except where README references require no template change.
- Do not change the optional Graphify installation flow except for documentation or result text needed to align with code-only default.

## Constraints
- Current Graphify helper code lives in `src/lib/graphify.ts` and uses Node child process APIs with argument arrays.
- Current graph command lives in `src/commands/graphify.ts` and initializes or updates based on `graphify-out/graph.json`.
- Current state-file support writes `.path/graphify-state.json` after successful graph refreshes from `src/lib/graphify.ts` / `src/commands/graphify.ts`.
- Current README command documentation lives in `README.md` and already includes `init`, `graphify`, `agents`, `models`, `profiles`, and `uninstall` sections.
- The `skills` command implementation is expected under `src/commands/skills.ts`, with CLI registration in `src/cli.ts`; Developer must inspect those files to document the command accurately.
- Known validation commands for this project are `npm test`, `npm run typecheck`, `npm run build`, and `npm run validate-dist`.
- Graphify's current CLI accepts `--code-only` for initial extraction (`graphify . --code-only` and/or `graphify extract . --code-only`) but rejects `--code-only` on `graphify update`. Official documentation describes `graphify update <path>` as re-extracting code files with no LLM needed. Developer must preserve child-process argument arrays and must not use shell strings.

## Decisions
- `opencode-path graphify` will use local/no-LLM Graphify behavior by default: explicit `--code-only` for initial extraction and documented no-LLM `graphify update` for existing graphs.
- `opencode-path` will not expose semantic/full Graphify mode in this iteration.
- Advanced semantic extraction belongs to the direct Graphify CLI, not to `opencode-path`.
- Runtime output should include a short mode line, not an interactive prompt.
- README should include the complete semantic-mode explanation; runtime output should stay concise.
- The initial README workflow diagram should be plain text, not Mermaid.
- README simplification should be moderate: improve clarity and remove the fragile diagram, but do not perform a broad documentation rewrite.

## Implementation Contract

### Target files and areas
- `src/lib/graphify.ts`: update Graphify init argument builder for explicit code-only mode, preserve documented no-LLM update/force command forms, and update state shape/write behavior for mode metadata.
- `src/commands/graphify.ts`: update runtime messaging and preserve existing init/update/force behavior while using local/no-LLM Graphify command forms.
- `src/lib/graphify.test.ts`: update helper tests for code-only init args, documented update/force args, and state mode metadata.
- `src/commands/graphify.test.ts`: update command tests for runtime messaging, init/update/force calls, state writes, and failure behavior.
- `README.md`: update workflow overview, Graphify docs, and add `skills` command documentation with moderate simplification only.
- Optional if tests already exist for CLI registration/docs consistency: relevant README or command tests. Do not add broad new testing infrastructure.

### Expected changes by area
- `src/lib/graphify.ts` must:
  - Preserve existing `isGraphifyAvailable`, install, version, graph detection, and state-file behavior except where explicitly changed below.
  - Run graph initialization with an explicit code-only extraction form. Prefer `graphify . --code-only` because it was verified locally to route to Graphify extraction; `graphify extract . --code-only` is also acceptable if tests/helper structure make the explicit subcommand clearer. Pick one form and document it consistently in tests/README.
  - Run existing-graph refresh as `graphify update .`. Do not append `--code-only` to `update`; Graphify rejects that flag on update, and official documentation describes `update` as re-extracting code files with no LLM needed.
  - Run forced existing-graph refresh as `graphify update . --force`. Do not append `--code-only` to forced update.
  - Developer must record evidence that the chosen init form is accepted locally and that Graphify documentation/help describes `update` as no-LLM/code-file re-extraction. If documentation or CLI behavior changes so `update` is no longer no-LLM, block and escalate; do not silently fall back to semantic extraction.
  - Continue using `execFile`/`execFileSync` with argument arrays; do not use shell strings.
  - Add state metadata for the mode used by `opencode-path graphify`, using a stable field such as `graphifyMode: "local-code"` or `graphifyMode: "code-only"`. Prefer `graphifyMode: "local-code"` if using different command forms for init (`--code-only`) and update (`update` no-LLM), because it accurately describes the invariant rather than a literal flag.
  - Write mode metadata only after successful Graphify init/update, together with the existing state metadata.
  - Never write or modify `.path/graphify-state.json` when Graphify CLI is missing or the graph init/update command fails.
- `src/commands/graphify.ts` must:
  - Keep existing command shape: `opencode-path graphify [--force]`.
  - Print a concise mode line before running Graphify, materially equivalent to: `Mode: local code graph — no LLM/API keys.`
  - Print a concise advanced-use hint, materially equivalent to: `For full semantic docs/media extraction, use Graphify directly: graphify .`
  - Preserve current missing-CLI behavior directing users to `opencode-path init --with-graphify` or manual Graphify install.
  - Preserve existing graph detection behavior: no `graphify-out/graph.json` means initialize; existing graph means update; `--force` affects only existing graph updates.
  - Preserve no hooks, no install behavior, no branches/worktrees, and no `.path/work` modification from this command.
- `README.md` must:
  - Replace the initial Mermaid diagram with a plain-text workflow description.
  - Correctly state the normal path: `Spec -> Architect -> Developer -> Reviewer`, with Auditor as optional/user-invoked audit and Research/Explore as support paths.
  - State that Research may support Spec or Architect when docs/APIs/facts are needed.
  - State that Explore may be invoked by workflow agents for codebase reconnaissance, and is not a primary workflow owner.
  - State that Developer must invoke Reviewer before declaring implementation done.
  - Add a `skills` command section in the Commands area. Developer must inspect `src/commands/skills.ts` and `src/cli.ts` and document the real flags and behavior; do not invent flags. At minimum, explain that the command manages optional skills in the selected scope and respects managed-marker conflict protection if that matches the implementation.
  - Update Graphify docs so `opencode-path graphify` is described as code-only/local by default, with no API keys, no token usage, and no repository content sent to external LLM providers by `opencode-path`.
  - Explain that users who intentionally want Graphify semantic/full extraction for docs, PDFs, images, or media should use the direct `graphify` CLI and Graphify's own backend/API-key documentation.
  - Keep README simplification moderate: avoid a full rewrite and do not delete important installation, scope, conflict, restart, or troubleshooting information.

### Contracts / invariants / compatibility to preserve
- Preserve `opencode-path graphify` command compatibility: existing users can still run the command with no new required flags.
- Preserve `--force` compatibility for existing graph updates.
- Preserve optional Graphify installation through `init --with-graphify`, including official CLI install, official OpenCode skill install, and managed `graphify-explorer` skill install.
- Preserve the compatible Graphify install range behavior from the freshness feature.
- Preserve `.path/graphify-state.json` as advisory metadata. Adding mode metadata must not make older state files invalid for readers; readers must tolerate the field being absent.
- Preserve no automatic hooks/background refresh and no Explorer auto-refresh-on-use.
- Preserve README accuracy over brevity; do not remove important safety caveats.
- Preserve security boundary: `opencode-path` must not request, store, inspect, log, or manage API-key values.

### Decisions already made
- Default mode for `opencode-path graphify`: local/no-LLM code graphing. Initial extraction uses explicit code-only mode; existing-graph refresh uses Graphify's documented no-LLM update command.
- No `--semantic`, `--with-llm`, `--backend`, or pass-through mode in this iteration.
- Semantic/full Graphify extraction is an advanced direct-Graphify workflow.
- Runtime user education is a short message, not a prompt.
- README contains the full explanation of code-only vs semantic responsibilities.
- README initial flow uses plain text instead of Mermaid.
- README simplification is moderate and targeted.

### Normal flow to encode
- User runs `opencode-path graphify` from a repository.
- Command verifies `graphify` exists.
- Command prints that it is using local/no-LLM code graphing and that semantic docs/media extraction should be run directly with Graphify.
- If `graphify-out/graph.json` is absent, command runs Graphify initialization with explicit code-only extraction.
- If `graphify-out/graph.json` exists, command runs Graphify's documented no-LLM update command.
- If `--force` is passed and a graph exists, command runs Graphify's documented forced update command.
- If Graphify succeeds, command writes `.path/graphify-state.json` with existing metadata plus mode metadata.
- If Graphify fails, command reports the failure and does not write or modify `.path/graphify-state.json`.

### Escalation contract
If Developer finds that the chosen initial extraction form is not accepted by the installed/supported Graphify CLI, or finds that Graphify documentation/help no longer describes `graphify update <path>` as no-LLM/code-file re-extraction, Developer must stop the affected Graphify command work, record the block in `progress.md` with Task/checkpoint, Problem, Evidence, Impact, Proposed options, and Status `blocked awaiting Architect decision`, and await an Architect decision. Developer must not silently fall back to semantic/full extraction, add a semantic flag, ask for API keys, append `--code-only` to `update`, or pass through arbitrary Graphify arguments. Any material decision change must be persisted to `brief.md` and/or `tasks.md`; decisions only in `progress.md` are not binding.

### Do not touch / do not introduce
- Do not add `opencode-path graphify --semantic`, `--with-llm`, `--backend`, or arbitrary pass-through args.
- Do not ask for, store, validate, print, or manage LLM API keys.
- Do not add new agents.
- Do not add new runtime dependencies.
- Do not install or document Graphify hooks as default behavior.
- Do not call `graphify hook install`, `graphify watch`, or `graphify opencode install`.
- Do not create branches, worktrees, or feature lifecycle commands.
- Do not modify `.path/work` from runtime commands.
- Do not add new persistent handoff artifacts beyond `.path/work/graphify-code-only-default/brief.md`, `tasks.md`, and `progress.md`.
- Do not rewrite the README wholesale or move large content to new documentation files unless existing repo conventions already support that and Reviewer agrees it is still moderate.

## Relevant files and areas
- `src/lib/graphify.ts`
- `src/lib/graphify.test.ts`
- `src/commands/graphify.ts`
- `src/commands/graphify.test.ts`
- `src/commands/skills.ts`
- `src/cli.ts`
- `README.md`
- Existing validation commands: `npm test`, `npm run typecheck`, `npm run build`, `npm run validate-dist`

## Acceptance Criteria
- AC-01: `opencode-path graphify` initializes a missing graph using Graphify explicit code-only extraction and does not require an LLM API key for code-only repositories.
- AC-02: `opencode-path graphify` updates an existing graph using Graphify's documented no-LLM `update` command; `--force` preserves forced update behavior using `graphify update . --force`.
- AC-03: Runtime output clearly states local/no-LLM code graphing mode and briefly directs users who want semantic docs/media extraction to use the direct `graphify` CLI.
- AC-04: `opencode-path` does not introduce semantic/full Graphify flags, backend flags, API-key prompts, API-key storage, or arbitrary Graphify pass-through arguments.
- AC-05: `.path/graphify-state.json` is written only after successful graph init/update and includes existing freshness metadata plus the mode used by `opencode-path graphify`; no state write occurs when Graphify fails or is missing.
- AC-06: README explains Graphify code-only default, no API-key/token behavior, no external LLM content sending by `opencode-path`, and direct Graphify usage for semantic/full extraction.
- AC-07: README replaces the initial Mermaid diagram with a portable plain-text flow that accurately represents Spec, Research, Architect, Developer, Reviewer, Auditor, and Explore relationships.
- AC-08: README documents the `skills` command accurately based on the current implementation.
- AC-09: README simplification is moderate and preserves important installation, scope, conflict, restart, Graphify, and troubleshooting information.
- AC-10: Automated tests cover explicit code-only init args, documented no-LLM update/force args, runtime messaging, no state write on failure, state mode metadata, and no semantic/API-key behavior in `opencode-path graphify`.
- AC-11: Full project validation passes with `npm test`, `npm run typecheck`, `npm run build`, and `npm run validate-dist`.

## Edge cases
- Graphify CLI missing: keep current actionable error and do not write state.
- Graphify explicit code-only init fails: report failure and do not write state.
- Graphify documented no-LLM update fails: report failure and do not write state; do not retry in semantic mode.
- Existing graph was previously built semantically: `opencode-path graphify` still performs future refreshes using Graphify's no-LLM update command unless a future design changes this.
- Existing `.path/graphify-state.json` lacks mode metadata: readers must tolerate missing mode; next successful `opencode-path graphify` writes mode metadata.
- Repo contains docs/images/PDFs: default `opencode-path graphify` must not require an LLM API key for initial graph creation because it uses explicit code-only extraction; existing graph refresh uses Graphify's documented no-LLM update path.
- User wants semantic extraction: README/runtime hint points to direct `graphify`; `opencode-path` does not provide the semantic flow.
- Graphify documentation/help no longer describes `update` as no-LLM/code-file re-extraction: block and escalate rather than falling back to LLM-backed extraction.

## Open questions
None.

## Assumptions and residual risks
- Graphify supports explicit `--code-only` extraction for initial graph creation, and Graphify's documented `update` behavior remains code-file/no-LLM in the compatible release line. If implementation proves otherwise, the escalation contract applies.
