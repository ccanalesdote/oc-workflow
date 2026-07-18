# Brief: Declarative Init Reconciliation

## Objective

Turn `opencode-path init` into a transparent, declarative installation assistant for the selected scope. It must show the current managed state, let the user explicitly choose the desired agents, optional skills, and profiles, preserve model choices unless explicitly changed, and then create, canonically replace, or remove only files owned by opencode-path.

Success means a normal interactive `init` upgrades every retained managed agent and skill without requiring uninstall/reinstall, applies explicit deselections as removals, leaves skipped categories unchanged, and never modifies or deletes an unmarked file.

## Problem

Normal `init` currently behaves mostly as add/restore-only. Existing active agents and optional skills can remain on older packaged definitions because only the Architect bundle (`architect.md`, `local-architecture`, and `cross-repo-architecture`) receives canonical reconciliation. Profile selection is additive, so an unchecked profile does not express removal.

This makes an upgrade through `init` inconsistent: the Architect bundle updates, while other managed definitions may require explicit removal and reinstallation. The desired model is simpler for users: show what is currently active, preserve checked items, remove explicitly unchecked items, and reconstruct retained managed definitions from current packaged templates.

## Scope

- Make interactive `init` treat agent, optional-skill, and profile selections as explicit desired state.
- Preselect currently active managed agents, installed optional skills, and currently applied profiles.
- Distinguish skipping a category from explicitly selecting an empty target state.
- Remove managed custom agents and optional skills that the user explicitly deselects.
- Hide or restore built-in agents using the existing config behavior when explicitly deselected or selected.
- Canonically reconcile every retained/selected managed custom agent and every retained/selected managed skill.
- Preserve each retained agent's valid installed `model` unless the user explicitly chooses a different model.
- Rebuild profile blocks from current canonical profile definitions according to the explicit profile target state.
- Continue to install and reconcile core skills automatically; core skills remain non-removable through `init`.
- Reconcile the internal managed `graphify-explorer` skill only when it is already installed and marked as managed.
- Preserve preview, one confirmation, `--dry-run`, `--yes`, conflict safety, idempotence, partial-result reporting, and restart messaging.
- Update focused and full regression coverage and user documentation.
- Set the opencode-path release version to `0.6.3` in every project-owned version declaration and exposed CLI version location.

## Non-goals

- Installing, updating, removing, or otherwise managing the Graphify CLI/library.
- Installing or updating Graphify's externally owned official OpenCode skill.
- Installing `graphify-explorer` merely because `init` runs.
- Managing, overwriting, deleting, or adopting files without the opencode-path managed marker.
- Merging arbitrary user edits inside marked managed definitions.
- Adding a generic three-way merge engine, backup system, transaction layer, plugin, hook, dependency, or runtime hot reload.
- Changing OpenCode itself or making configuration-time definitions hot-reload.
- Removing the standalone `agents`, `skills`, `profiles`, `models`, or `uninstall` commands.
- Changing project/global scope resolution.

## Constraints

- Files without the expected managed marker are outside opencode-path responsibility. They must be preserved byte-for-byte and reported as skipped conflicts.
- A category-level `Skip` means preserve its current desired state; it must never be interpreted as an empty selection.
- Interactive deselection is authoritative only after the user enters that category's management UI and confirms the checkbox selection.
- `--yes` must derive desired state from the installed managed state, reconcile retained definitions, create mandatory missing core skills, and perform no inferred removals.
- Missing optional skills and missing `graphify-explorer` must not be installed under `--yes` unless another existing explicit option already authorizes their installation.
- Valid installed agent models are mutable user state and must survive canonical replacement unless explicitly changed in the same run.
- Core skills remain always desired and cannot be removed through `init`.
- Existing permissions, managed markers, conflict safety, scope handling, cancellation behavior, and partial-state warnings must be preserved.
- Configuration-time changes still require quitting and restarting OpenCode.
- Validation must use the repository's existing Vitest, typecheck, build, distribution validation, and smoke facilities.
- The release version must be consistent across `package.json`, the root package entries in `package-lock.json`, and `src/cli.ts`; dependency versions and historical `.path/work/**` evidence are not product-version declarations and must not be rewritten.

## Decisions

- Interactive `init` is a desired-state installation assistant rather than add/restore-only.
- Existing active items are preselected; checked means retain/activate, and explicitly unchecked means remove/deactivate.
- `Skip` preserves current state and is not equivalent to selecting no items.
- Retained managed definitions are rebuilt from current canonical templates rather than patched through arbitrary merge logic.
- Unknown marked drift is replaceable after a visible preview and confirmation; valid agent `model` and recognized profile selection are the supported preserved state.
- Profile selection is a target-state choice for all selected patchable agents. Existing, absent, and mixed profile states must be visible. If the user manages profiles, the confirmed set becomes uniform across selected patchable agents; if the user skips profiles, each agent retains its currently recognized profile set.
- Profile snippets are regenerated from current bundled profile definitions, so retained profiles are upgraded together with their agents.
- Unmarked files are skipped conflicts, never update or removal candidates.
- `graphify-explorer` is reconciled only when already installed and managed; all other Graphify components are excluded.
- `--yes` performs safe reconciliation without removals.
- One aggregate preview and one existing approval boundary remain sufficient.
- This feature's release version is `0.6.3`; no project-owned runtime or package metadata location may continue exposing `0.6.2` or another prior opencode-path version.

## Implementation Contract

### Target files and areas

- `src/commands/init.ts`
- `src/commands/init.test.ts`
- `src/lib/agents.ts`
- `src/lib/agents.test.ts`
- `src/lib/skills.ts`
- `src/lib/skills.test.ts`
- `src/lib/profiles.ts`
- `src/lib/profiles.test.ts`
- `src/lib/frontmatter.ts` and `src/lib/frontmatter.test.ts` only if the existing model-preservation helpers require bounded generalization
- `src/lib/ui.ts` and `src/lib/messages.ts` only if existing UI/summary primitives cannot represent current, mixed, replace, and remove states
- `src/commands/agents.test.ts`, `src/commands/skills.test.ts`, `src/commands/profiles.test.ts`, and `src/commands/uninstall.test.ts` for regression coverage of preserved standalone behavior
- `README.md`
- `package.json`
- `package-lock.json`
- `src/cli.ts`
- `scripts/validate-dist-skill-lookup.mjs` only if managed-skill distribution validation must be extended for the generalized reconciliation path

Any additional product file must be tied to a concrete unmet acceptance criterion or implementation contradiction and recorded in `progress.md` before editing.

### Expected changes by area

- `src/commands/init.ts`: replace active-item forced retention and install-only optional/profile planning with explicit category target-state planning. Preserve separate `Skip` choices. Build one aggregate plan containing per-file `Create`, `Replace`, `Remove`, `Unchanged`, and `Skipped conflict` outcomes. Under `--yes`, use installed managed state as the target and schedule no removals. Apply the approved plan through generalized managed-definition helpers and retain one confirmation boundary.
- `src/lib/agents.ts`: generalize canonical reconciliation from Architect-only to all `PACK_AGENTS`. For selected managed custom agents, compose canonical content with the preserved or newly selected valid model and the desired recognized profiles. For explicitly deselected managed custom agents, reuse marker-safe deletion. Keep built-in hide/restore behavior separate because built-ins have no packaged custom-agent file to reconcile.
- `src/lib/skills.ts`: generalize canonical comparison and replacement from core architecture skills to managed core and optional skills. Core skills are always desired. Optional skills follow explicit target state. `graphify-explorer` is update-only when already installed and managed. Missing or unmarked Graphify definitions do not trigger installation or adoption.
- `src/lib/profiles.ts`: add bounded helpers to discover recognized applied profile names and compose canonical profile snippets into canonical agent content without preserving stale snippet bytes. Support the current/mixed status required by preview. Do not create arbitrary profile merge behavior.
- `src/lib/frontmatter.ts`: continue YAML-safe exact model preservation for every managed custom agent. Reuse existing helpers where possible; do not preserve unrelated frontmatter drift.
- Tests: prove desired-state selection, skip preservation, explicit empty selection, canonical replacement, model preservation/change, profile regeneration/removal, unmarked conflict exclusion, core invariants, installed-only Graphify Explorer reconciliation, `--yes` no-removal behavior, dry-run, idempotence, partial failures, and unchanged standalone commands.
- `README.md`: document `init` as a desired-state assistant, preselected current state, explicit removals, skip semantics, marker ownership, canonical replacement, preserved models, profile regeneration, Graphify boundary, preview/confirmation, `--yes`, dry-run, and restart requirement.
- `package.json`, `package-lock.json`, and `src/cli.ts`: set every opencode-path package/runtime version declaration to exactly `0.6.3`, keeping lockfile root metadata synchronized and leaving dependency versions untouched.

### Contracts / invariants / compatibility to preserve

- Only files with the correct opencode-path marker are writable or removable.
- An unmarked file at a managed path is a conflict regardless of user selection; it is never adopted, overwritten, or deleted.
- Core skills are always desired, automatically installed/reconciled, and non-removable through `init` or the optional-skill picker.
- Optional skills are installed only by explicit interactive selection or an existing explicit installation path; installed managed optional skills are preselected and reconciled.
- `graphify-explorer` is reconciled only if already installed with the managed marker. Its absence is unchanged, and Graphify CLI/library and official skill behavior are untouched.
- Interactive `Skip` preserves the category's current state. Explicitly opening the checkbox and confirming an empty set is a valid remove-all decision for removable managed items in that category.
- Existing active agents and skills are initially checked. Conflicts are disabled/excluded and clearly reported.
- Built-in agents continue to use existing hide/restore config behavior; no custom files are invented for them.
- Every retained managed custom agent is based on the latest packaged template.
- A valid non-empty installed `model` survives replacement exactly unless the user assigns a different model in the same run. Invalid or unreadable managed frontmatter remains a conflict rather than being destructively normalized.
- If profile management is skipped, each retained patchable agent keeps its recognized profile-name set, but snippets are regenerated from current canonical profile definitions during agent reconciliation.
- If profile management is entered, the confirmed profile set becomes the desired set for every retained/selected patchable agent. A mixed current state must be disclosed before confirmation.
- Marked custom drift outside supported `model` and recognized profile state is replaceable only after the plan and overwrite warning are shown and approved.
- `--yes` does not infer deselection: it retains current managed agents, optional skills, and profile selections; reconciles them; creates/reconciles mandatory core skills; and performs no removals.
- `--dry-run`, including with `--yes`, performs no writes or deletions.
- Cancellation before apply performs no writes. Apply-phase interruption or failure may be partial and must report completed/failed paths honestly and remain safe to rerun.
- Repeating `init` with the same desired state is idempotent and reports no content changes.
- Project/global scope resolution, frontmatter permission content, model provider values, profile permission semantics, and standalone command contracts remain compatible.
- Any created or replaced configuration-time file requires a restart warning; a no-write result does not.
- `package.json`, both root opencode-path version fields in `package-lock.json`, the Commander version exposed by `src/cli.ts`, the built CLI, and packed-package metadata must all report exactly `0.6.3`.

### Decisions already made

- The feature is local to this repository and changes no external contract.
- All six managed pack-agent templates are eligible for canonical reconciliation when retained/selected.
- Interactive `init` may delete managed custom-agent and optional-skill files after explicit deselection.
- Interactive `init` may hide built-in agents after explicit deselection using existing behavior.
- Existing installed items are preselected, so continuing through the assistant without deselection preserves them.
- Skipping a section preserves it; it is not a deletion signal.
- Models are preserved unless explicitly changed.
- Profiles are desired state when their management UI is entered; unchecked means remove from selected patchable agents.
- Managed files are rebuilt from canonical templates plus supported mutable state; arbitrary marked edits are not merged.
- Files without markers are outside responsibility and are skipped.
- Graphify as a library and its official skill are out of scope; only an already-installed managed `graphify-explorer` may be refreshed.
- `--yes` is reconciliation-only and never removal-by-default.
- No new dependency, command, flag, second confirmation, backup artifact, or transaction framework is required.
- Version `0.6.3` supersedes the previously accepted `0.6.2` product-file changes. Historical progress entries mentioning earlier versions remain append-only evidence and are not product metadata to rewrite.

### Normal flow to encode

1. Resolve project/global scope and validate packaged templates using existing facilities.
2. Discover agents, core skills, optional skills, `graphify-explorer`, installed models, and recognized profile state.
3. Show agent management with active items checked and conflicts disabled. If skipped, preserve current agent state. If managed, use the confirmed set as desired state, including explicit removals/hides.
4. Show optional skills with installed managed items checked and conflicts disabled. If skipped, preserve current state. If managed, install checked missing skills and remove unchecked installed managed skills.
5. Keep core skills always desired; they are not offered for deselection.
6. If managed `graphify-explorer` is installed, include its canonical state in reconciliation. If absent, do nothing. Preserve the existing separate Graphify integration choice for explicit installation without broadening library ownership.
7. Determine selected patchable agents and show profile current state, including mixed state. If skipped, preserve each agent's recognized profile-name set. If managed, use the confirmed profile set for every selected patchable agent; unchecked profiles are removed by omission from rebuilt canonical content.
8. Offer existing model configuration for selected agents. If skipped for an agent or category, preserve its valid installed model. Explicit assignments override preserved values.
9. Compose a complete aggregate plan. Retained marked agents/skills compare against canonical desired bytes and become `Replace` or `Unchanged`; selected missing items become `Create`; explicitly deselected managed items become `Remove`; unmarked/invalid items become `Skipped conflict`.
10. Warn that approved replacements discard unsupported marked drift while preserving supported model/profile state. Show exact paths and actions.
11. On `--dry-run`, stop without writes. In interactive mode, use the existing single final confirmation. Under `--yes`, use current installed state as desired state, perform no removals, and apply eligible reconciliation without prompting.
12. Apply marker-safe removals and canonical creates/replacements. Report actual per-file outcomes and any partial failures. Never claim all-or-nothing transactionality.
13. Print restart guidance only when configuration-time files or built-in config state changed. A repeated run with the same state must be unchanged.
14. Keep the package manifests, CLI `--version`, built output, and packed package metadata synchronized at release version `0.6.3`.

### Escalation contract

If Developer finds a contradiction, technical impossibility, or material gap, append the following to this plan's `progress.md` and stop only the affected area:

```markdown
## Escalation to Architect

### Task / checkpoint
<task and checkpoint>

### Problem
<specific contract or implementation problem>

### Evidence
<paths, line numbers, contract quotes, errors, or command output>

### Impact
<blocked tasks, acceptance criteria, or checkpoint>

### Proposed options
<at least one concrete path with tradeoffs>

### Status
blocked awaiting Architect decision
```

Material changes to desired-state semantics, mutable-state preservation, conflict ownership, Graphify scope, `--yes`, artifact scope, or removal safety must be persisted in `brief.md` and/or `tasks.md`; chat or `progress.md` alone is not contractual.

### Do not touch / do not introduce

- Do not modify templates for agents, skills, or profiles merely to simplify reconciliation unless a concrete incompatibility is escalated and approved.
- Do not manage Graphify CLI/library or its official OpenCode skill.
- Do not adopt, overwrite, rename, move, or delete unmarked files.
- Do not add arbitrary merge behavior, backups, transactions, migrations, plugins, hooks, dependencies, runtime enforcement, or hot reload.
- Do not change agent permissions, skill instructions, profile permission entries, or model values as part of this lifecycle feature.
- Do not remove standalone lifecycle commands or silently change their public semantics.
- Do not add mandatory worktrees or post-commit operations.
- Do not create persistent artifacts outside `.path/work/declarative-init-reconciliation/brief.md`, `tasks.md`, and `progress.md` for this handoff.
- Do not alter dependency versions, create a Git tag, publish a package, or rewrite historical `.path/work/**` entries as part of the `0.6.3` version synchronization.

## Relevant files and areas

- `src/commands/init.ts`: current guided flow, forced active-agent retention, install-only optional-skill selection, additive profiles, architecture-only reconciliation, aggregate confirmation, and result reporting.
- `src/lib/agents.ts`: reusable target-state computation/removal plus Architect-only canonical reconciliation and model preservation.
- `src/lib/skills.ts`: core-skill reconciliation, managed catalog, installation, and marker-safe deletion.
- `src/lib/profiles.ts`: profile markers, detection, canonical snippet generation, and additive insertion.
- `src/lib/frontmatter.ts`: YAML-safe model parsing and writing.
- `src/commands/agents.ts`: existing checked-active/unchecked-deactivate UX and reusable semantics.
- `src/commands/skills.ts`: existing optional-skill target-state UX and marker-safe removal semantics.
- `src/commands/models.ts`, `src/commands/profiles.ts`, and their tests: mutable state and standalone compatibility.
- `src/lib/paths.ts`: `PACK_AGENTS`, `CORE_SKILLS`, `OPTIONAL_SKILLS`, `GRAPHIFY_SKILLS`, and `ALL_MANAGED_SKILLS` catalogs.
- `README.md`: command behavior and safety documentation.
- `package.json`, `package-lock.json`, and `src/cli.ts`: authoritative package metadata and CLI-visible release version locations.

## Acceptance Criteria

- AC-01: Interactive `init` displays current managed agent state with active items preselected; explicitly deselecting a managed custom agent schedules marker-safe deletion, deselecting a built-in schedules existing hide behavior, and skipping agent management preserves current state.
- AC-02: Interactive `init` displays installed optional skills preselected; checked missing skills are created, retained managed skills are canonically reconciled, explicitly unchecked installed managed skills are removed, and skipping skill management preserves current state.
- AC-03: Every retained/selected marked custom agent is compared with a canonical desired definition built from the latest packaged template, its preserved or explicitly changed valid model, and its desired recognized profiles; it is reported as `Replace` or `Unchanged` accordingly.
- AC-04: Profile management shows current and mixed states. Skipping preserves each selected patchable agent's recognized profile-name set; managing profiles applies the confirmed set to all selected patchable agents, and unchecked profiles are absent from rebuilt files.
- AC-05: Retained profile snippets are regenerated from current bundled profile definitions, so canonical agent reconciliation does not retain stale snippet bytes or duplicate profile blocks.
- AC-06: A valid installed model is preserved exactly for every retained managed custom agent unless explicitly replaced in the same run; invalid/unreadable model frontmatter is a skipped conflict and is not destructively normalized.
- AC-07: Core skills remain always desired, installed/reconciled automatically, and non-removable. All retained/selected marked optional skills are reconciled against current canonical templates.
- AC-08: An already-installed marked `graphify-explorer` skill is canonically reconciled. A missing copy is not installed by reconciliation, an unmarked copy is skipped, and no Graphify CLI/library or official-skill operation is added.
- AC-09: Any agent or skill file without the expected managed marker is excluded from create/update/remove responsibility, remains byte-identical, and is reported as `Skipped conflict` in preview/results where applicable.
- AC-10: The aggregate preview lists exact paths and `Create`, `Replace`, `Remove`, `Unchanged`, and `Skipped conflict` actions and warns before replacing unsupported marked drift; one existing confirmation authorizes the aggregate interactive plan.
- AC-11: `--yes` preserves current managed agent, optional-skill, and profile selections; reconciles retained definitions and mandatory core skills; performs no inferred removals; and does not install missing optional or Graphify Explorer skills without an existing explicit authorization.
- AC-12: `--dry-run`, including `--dry-run --yes`, performs no writes, deletes, config hides/restores, or profile/model mutations while showing the same applicable plan.
- AC-13: Repeating `init` with the same target state produces no definition changes, no duplicated profiles, and no restart requirement.
- AC-14: Apply and result reporting remain interruption/failure honest: completed, skipped, and failed paths are distinguishable, partial state is disclosed, and rerun is safe.
- AC-15: Existing project/global resolution, unmarked conflict safety, standalone `agents`/`skills`/`profiles`/`models`/`uninstall` behavior, and managed permission/frontmatter contracts continue to pass regression tests.
- AC-16: Focused and full repository validation passes, including `npm test`, `npm run typecheck`, `npm run build`, `npm run validate-dist`, `npm run smoke`, and scoped diff hygiene.
- AC-17: Every project-owned opencode-path version declaration reports exactly `0.6.3`: `package.json`, both root package version fields in `package-lock.json`, `src/cli.ts`, built CLI `--version`, and packed package metadata agree; no product-owned `0.6.2` declaration remains, while dependency versions and historical work-folder evidence are unchanged.

## Edge cases

- The user skips agents but manages profiles: profiles apply only to currently active patchable agents; agent activation state remains unchanged.
- The user enters agent management and confirms an empty set: all removable marked custom agents are scheduled for deletion and active built-ins for hiding; conflicts remain untouched.
- The user skips optional skills: installed optional skills are retained and reconciled, not removed; missing optional skills remain absent.
- The user enters optional-skill management and confirms an empty set: all installed marked optional skills are removed; core skills remain.
- The same profile is present on one selected patchable agent and absent on another: show mixed state. Entering profile management resolves all selected patchable agents to the confirmed uniform set; skipping preserves the mixed state per agent.
- A retained profile exists in an older snippet form: detect its recognized name and regenerate current canonical bytes without duplication.
- A marked agent has valid model text containing YAML-sensitive characters: preserve the exact parsed string using existing safe serialization.
- A marked agent has malformed frontmatter or an invalid model: skip it as conflict rather than rebuilding it.
- A marked agent contains unsupported manual edits: preview it as `Replace`, warn that unsupported drift will be discarded, and replace only after approval.
- An unmarked file occupies a selected or deselected managed path: exclude it from both installation and removal and report conflict.
- `graphify-explorer` is installed and marked while Graphify installation is not selected: reconcile only the internal skill file; do not invoke Graphify installation.
- `graphify-explorer` is absent: no reconciliation action creates it.
- A write fails after earlier removals or replacements: report partial state and exact outcomes; do not claim rollback.
- `--yes` runs on an old installation: update all retained marked definitions and create mandatory missing core skills without removing anything.
- The user cancels the final interactive confirmation after making selections: no target-state changes are applied.
- A version scan finds `0.6.2` in historical `.path/work/**` evidence or unrelated dependency metadata: preserve it; only project-owned opencode-path package/runtime declarations are required to become `0.6.3`.

## Open questions

- None material. Desired-state, skip, model, profile, conflict, Graphify, and `--yes` semantics are decided.

## Assumptions and residual risks

- Marked files are treated as opencode-path-owned; unsupported edits inside them may be replaced after explicit preview and approval.
- A category-wide profile target state is intentionally simpler than per-agent profile selection. Mixed state is disclosed, and users can preserve it by skipping profile management.
- The apply flow is not transactional. Existing partial-state reporting and safe rerun behavior are accepted instead of introducing rollback complexity.
- Static and command tests can prove filesystem outcomes but cannot hot-reload the running OpenCode session; restart guidance remains required.
