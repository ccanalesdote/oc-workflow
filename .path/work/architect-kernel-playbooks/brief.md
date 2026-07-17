# Brief: Architect Kernel and Exclusive Architecture Playbooks

## Objective

Refactor the single user-facing Architect into a small routing kernel backed by two automatically installed core skills: `local-architecture` and `cross-repo-architecture`. Architect must classify each feature as local or cross, load exactly one architecture playbook for the handoff being produced, and preserve a simple user experience without introducing a separate Cross Architect agent.

## Problem

`templates/architect.md` currently contains the complete local implementation-handoff protocol while `cross-repo-architecture` adds a second, materially different coordination protocol. The skill therefore has to reinterpret instructions already present in the agent prompt. This makes the prompt large, blurs whether a cross artifact is an implementation plan, and can cause cross coordination requirements to become local acceptance criteria, tasks, checkpoints, or evidence requirements.

The two outputs are different products:

- A local architecture handoff is an executable implementation plan for one repo or implementation boundary.
- A cross-repo handoff is a minimal coordination contract that aligns responsibilities and compatibility across boundaries; it is not an implementation plan.

## Scope

- Reduce `templates/architect.md` to the common Architect role, design protocol, mode classifier, playbook-loading contract, shared handoff transport/safety rules, and common scope guardrails.
- Add `templates/skills/local-architecture/SKILL.md` as a core skill containing the existing local implementation-handoff protocol.
- Simplify `templates/skills/cross-repo-architecture/SKILL.md` into a compatibility and responsibility coordination playbook.
- Register both architecture skills as core managed skills for fresh installations and add safe automatic architecture-bundle reconciliation to normal init so existing managed installations receive the new Architect kernel and both architecture playbooks.
- Define mutually exclusive local and cross handoff shapes.
- Add regression coverage for mode selection, playbook exclusivity, artifact schemas, core-skill installation, update, conflict, and distribution lookup.
- Preserve all other agents and optional skills unchanged.

## Non-goals

- Creating a `cross-architect` agent.
- Creating or changing Cross Auditor; that is a later phase.
- Changing Developer, Reviewer, Auditor, Spec, or Research behavior.
- Redesigning commit ownership or the pre-commit validation workflow.
- Managing deploys to QA or production, runtime activation, operational migration execution, or post-commit evidence.
- Reclassifying all historical work folders.
- Adding plugins, hooks, runtime enforcement, executable schemas, or middleware that technically prevents a missing skill load.
- Redesigning the optional migration, API, security, incident, or test-strategy skills.
- Automatically refreshing every managed agent or every optional/Graphify skill.

## Constraints

- Architect remains the only user-facing architecture agent.
- Both architecture playbooks are core skills: installed automatically, but loaded into context only when selected.
- The normal case is local. However, folder layout, feature difficulty, or file count alone must never determine the mode.
- Cross mode is selected only when implementation requires coordinated changes across independent repos/services/deployment units or changes a shared contract consumed across a boundary.
- A feature contained in one repo/boundary remains local even when the workspace contains several repos.
- Architect may load optional domain skills in addition to one architecture playbook. Exclusivity applies to the handoff-producing architecture playbooks, not to every skill.
- Existing local handoff capabilities and safety rules must be preserved unless this brief explicitly changes them.
- Normal `opencode-path init` reconciles the architecture bundle automatically; users do not need to discover or run a separate update command.
- The automatic reconciliation is deliberately limited to managed `architect.md`, managed `local-architecture/SKILL.md`, and managed `cross-repo-architecture/SKILL.md`. General reconciliation of all managed agents/skills is deferred to a future feature.
- A managed marker grants opencode-path permission to replace that file after the aggregate init plan and overwrite warning are shown. Interactive approval or invocation with `--yes` authorizes the replacement. Files without the marker are conflicts and must never be overwritten or deleted.
- Normal init remains add/restore-only for agents. An active Architect is always retained and eligible for reconciliation; this phase does not add agent removal through init.
- A valid Architect `model:` frontmatter value is product-managed mutable state and must survive reconciliation. No other Architect frontmatter field is designated mutable in this phase.
- Existing project validation commands are `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`, and `npm run validate-dist`.

## Decisions

1. Keep one Architect agent; do not add Cross Architect.
2. Introduce two core skills named exactly `local-architecture` and `cross-repo-architecture`.
3. Treat `templates/architect.md` as a kernel that selects a mode and delegates mode-specific procedure.
4. Require Architect to state the selected mode and reason before applying a mode-specific playbook.
5. Require exactly one architecture playbook to be loaded before producing or persisting a handoff.
6. A local Architect consuming a repo-specific cross draft selects `local` mode and loads only `local-architecture`; the draft is binding input, not a reason to rerun cross coordination.
7. Local persistent handoffs retain `brief.md`, `tasks.md`, and `progress.md`.
8. Cross persistent handoffs contain `brief.md` plus `repos/{repo}.md` drafts only. They contain no `tasks.md`, `progress.md`, local ACs, Developer tasks, or checkpoints.
9. Cross Architect owns shared compatibility and repo responsibilities, not local implementation details, evidence collection, deploy, QA, production, or activation.
10. No automated playbook-load enforcement is introduced in this phase; explicit kernel rules, distinct artifact shapes, examples, and static tests provide the guardrails.
11. Normal `opencode-path init` compares the desired architecture bundle with packaged canonical templates and includes create/update/unchanged/conflict outcomes in its existing preview and confirmation flow. No separate architecture-refresh flag or command is introduced.
12. Reconciliation safety is marker-based: active Architect is always retained; missing Architect follows existing selection/restore behavior; both core architecture skills are always desired; differing marked canonical content is replaced; and unmarked files are skipped as conflicts. The flow does not add agent removal and does not refresh other agents, optional skills, or Graphify.
13. Successful architecture create/update output must instruct the user to quit and restart OpenCode. A no-change, declined, dry-run, or conflicts-only result must say that no architecture definitions changed and must not claim restart is required.
14. Dedicated-worktree preflight is common transport safety and therefore belongs in the Architect kernel. `local-architecture` owns the local three-file schema; `cross-repo-architecture` owns the cross `brief.md` + `repos/` schema. Neither playbook duplicates or weakens the kernel's worktree preflight.
15. Architect reconciliation preserves a valid installed `model:` value by reapplying it to the packaged Architect definition before comparison and write. Other marked Architect drift is replaceable. An unreadable/malformed marked Architect frontmatter or non-string/empty `model` is reported as a conflict and preserved rather than normalized destructively.
16. `init --yes` is explicit authorization for every eligible architecture create/update shown in the aggregate plan, including replacement of marked drift. It suppresses the confirmation prompt but not the plan or overwrite warning. `--dry-run` always wins over `--yes` and performs no writes.

## Implementation Contract

### Target files and areas

- `templates/architect.md`
- `templates/skills/local-architecture/SKILL.md` (new)
- `templates/skills/cross-repo-architecture/SKILL.md`
- `src/lib/paths.ts`
- `src/lib/agents.ts`
- `src/lib/agents.test.ts`
- `src/lib/skills.ts`
- `src/lib/frontmatter.ts`
- `src/lib/frontmatter.test.ts`
- `src/lib/paths.test.ts`
- `src/lib/skills.test.ts`
- `src/lib/templates.test.ts`
- `src/commands/init.ts`
- `src/commands/init.test.ts`
- `src/commands/skills.test.ts`
- `src/commands/uninstall.test.ts`
- `scripts/validate-dist-skill-lookup.mjs`
- `README.md`
- Other existing skill lifecycle tests may be changed only when a hard-coded single-core-skill expectation must become a two-core-skill expectation. Any such additional file must be named in `progress.md` before editing and must not change production behavior outside core-skill catalog iteration.

### Expected changes by area

#### `templates/architect.md`

- Retain Architect's role, five-step design protocol, minimal implementation check, codebase reconnaissance requirement, chat-first behavior, write boundaries, and generic handoff transport choices.
- Replace embedded local and cross implementation procedures with a mode-selection contract.
- Define these modes:
  - `local`: one repo or bounded implementation unit can implement the feature without negotiating a changed shared contract.
  - `cross`: coordinated changes are required across independent repos/services/deployment units, or a shared contract consumed across a boundary changes.
  - `local consuming cross contract`: a local subtype of `local`; load `local-architecture` and treat the matching repo draft as binding input.
- State explicitly that complexity, number of files, monorepo/workspace layout, and the mere presence of other repos do not trigger cross mode.
- Require bounded reconnaissance before classification when repository context is needed. If a material boundary remains ambiguous, ask whether another independently owned/deployed unit or shared consumer must change.
- Require the visible declaration `Mode`, `Playbook`, and `Reason` before mode-specific design/handoff work.
- Require loading exactly one architecture playbook in the current session before producing or persisting that handoff. If the required skill is unavailable, stop rather than reconstructing it from memory.
- Allow optional domain skills alongside the selected architecture playbook.
- Define safe transition behavior:
  - local → cross: stop before persisting the local handoff, explain the newly discovered boundary, load the cross playbook, and create a fresh cross artifact.
  - apparent cross → local: explain why no shared boundary changes, load the local playbook, and avoid empty repo drafts.
- Keep generic persistence mode selection and all dedicated-worktree collision/preflight safety in the kernel because Mode 3 is shared transport for local and cross handoffs. Mode-specific artifact schemas and completion gates belong in their skills.
- For Mode 3, require this exact sequence before creation:
  1. run `pwd`, derive the repo basename without shell command substitution, then derive the sibling worktree path, work-folder path, `feature/{slug}` branch, and current `HEAD` base;
  2. run `ls -d "../{repo-name}-{slug}"` to check whether the sibling directory exists independently of Git registration;
  3. run `git worktree list` and check for an already registered worktree at that path;
  4. run `git branch --list feature/{slug}` to check whether the branch already exists;
  5. if any collision exists, stop and ask how to proceed; never overwrite, silently reuse, or auto-increment;
  6. when collision-free, present worktree path, work-folder path, branch, and base together in one message and wait for explicit approval before `git worktree add` or any work-folder creation.
- Remove duplicated mode-specific schemas and instructions once they have been transferred. Do not leave stale statements that every handoff always has exactly `brief.md`, `tasks.md`, and `progress.md`.

#### `templates/skills/local-architecture/SKILL.md`

- Add valid OpenCode skill frontmatter and the managed marker.
- State that it is loaded only after Architect selects local mode, including local consumption of a cross draft.
- Own the complete local handoff procedure currently embedded in Architect: direct chat/current checkout/worktree modes as applicable, slug/collision handling, local work-folder schema, Implementation Contract, acceptance criteria, task table, checkpoints, progress log, coverage mapping, technology-agnostic verification, and implementation-ready exit gate.
- Preserve the current local write shape: `.path/work/{slug}/brief.md`, `tasks.md`, and `progress.md`.
- Preserve binding shared API/DTO/event/auth/error/compatibility constraints from a matching cross draft inside the local Implementation Contract.
- Convert only repo-controlled implementation behavior into local ACs/tasks/checkpoints. Do not copy cross coordination metadata as local work.
- Make the local handoff self-contained because the parent cross brief may not be in the repo.
- Keep all material local decisions in `brief.md`/`tasks.md`, not only chat or `progress.md`.
- Reference the kernel's binding Mode 3 preflight rather than replacing it with a shorter or weaker local rule.

#### `templates/skills/cross-repo-architecture/SKILL.md`

- Retain activation criteria based on actual boundary/contract impact, with explicit negative examples for multi-repo workspaces that still contain a local feature.
- Define a minimal cross coordination brief covering: objective, participating repos and responsibilities, shared API/DTO/event/auth/error contracts, compatibility matrix or equivalent old/new compatibility rules, ordering constraints required for compatibility, repo drafts, open cross decisions, and escalation.
- Define one `repos/{repo}.md` draft per affected implementation boundary. Each draft must contain target identity, assigned responsibility, binding shared contracts, compatibility obligations, ordering constraints that affect development, local decision space, prohibited local decisions, and escalation format.
- Make internal data access, query design, module layout, tests, files, migrations internal to a repo, and local configuration the local Architect's decision space unless they alter a shared contract.
- Define the persistent cross shape as `.path/work/{slug}/brief.md` plus `.path/work/{slug}/repos/{repo}.md`; explicitly prohibit cross `tasks.md` and `progress.md`.
- Prohibit local acceptance criteria, Developer tasks, checkpoints, validation commands, evidence receipts, deployed smoke requirements, QA/production deploy management, runtime migration execution, flag activation, and scheduler activation in cross artifacts.
- Permit compatibility-preserving development-order constraints, but distinguish stating the constraint from managing or proving the later deployment.
- Remove the current rule to copy all binding cross constraints indiscriminately into a local Implementation Contract. Only code-affecting shared contracts and compatibility obligations are copied; coordination context remains cross.
- Preserve the kernel's shared Mode 3 preflight when a cross coordination handoff is placed in a dedicated worktree; the cross artifact remains `brief.md` plus `repos/{repo}.md` and gains no tasks or progress file.

#### Automatic architecture reconciliation during normal init

- Do not add a new command or flag. Integrate architecture reconciliation into normal `opencode-path init` planning, confirmation, apply, and result reporting.
- Scope the reconciliation allowlist to the Architect agent plus the two core architecture skills. Other agents, optional skills, and Graphify retain their current lifecycle behavior.
- Derive desired state from the normal init plan:
  - both core architecture skills are always desired and therefore created, updated, left unchanged, or preserved as conflicts on every init;
  - an active managed Architect is forcibly retained by existing add/restore-only init semantics and is reconciled;
  - a missing Architect is created only when selected through the existing agent-selection behavior;
  - init has no active-Agent deselection/removal state, and this feature must not add one; agent deletion remains in the existing separate management flow.
- Reuse existing template resolution, managed markers, target scope selection, dry-run behavior, and write helpers where safe. Bounded reconnaissance inside the named agent/skill/init files is allowed to identify those helpers; do not redesign unrelated management flows.
- Define canonical skill comparison bytes as each packaged skill definition normalized through the existing managed-marker insertion/preservation helper used for installation. Comparison must not report perpetual drift merely because a marker is injected or preserved.
- Define Architect comparison/update as frontmatter-aware:
  1. require the installed Architect to have the managed marker and parseable frontmatter;
  2. read its `model` field; preserve it when it is a non-empty string accepted by the existing frontmatter/model helper;
  3. build expected content from the packaged Architect template plus managed marker;
  4. when an installed valid `model` exists, reapply that exact value to the expected packaged content using `src/lib/frontmatter.ts` rather than copying the old frontmatter wholesale;
  5. compare installed content against this model-preserving expected content;
  6. on update, write exactly that expected content: packaged Architect frontmatter/body/permissions plus the preserved model and managed marker.
- If the installed Architect has no `model`, use the packaged template's model presence/value unchanged. If frontmatter cannot be parsed or `model` exists but is not a non-empty string, classify the Architect target as `conflict`, preserve it, and report the reason. Do not silently erase or coerce supported mutable state.
- Only `model` is preserved. Other marked changes to Architect frontmatter, comments, permissions, or body are treated as managed drift and replaced after authorization.
- Classify each target independently:
  - `create`: target file is missing;
  - `update`: target file has the opencode-path managed marker and differs from the packaged canonical definition;
  - `unchanged`: target file has the marker and is byte-equivalent to the canonical managed definition;
  - `conflict`: target exists without the expected marker.
- Include architecture actions in the existing aggregate init plan, listing path and action for every desired architecture target. For every `update`, state that marked local edits will be replaced by the packaged definition. For every `conflict`, state that the file will be skipped and preserved.
- Use init's existing single explicit approval boundary before applying any planned changes; do not add a second architecture-only confirmation. Interactive rejection leaves the complete init plan untouched.
- `--yes` constitutes explicit approval for all eligible architecture actions shown in the aggregate plan, including replacement of marked drift. It skips the prompt but must still print paths/actions and the warning that marked local changes other than preserved `model` will be replaced before applying writes.
- `--dry-run`, whether used alone or with `--yes`, displays the aggregate plan/warnings and performs no writes or confirmation.
- On approval, create/update only eligible targets. Never delete a target, overwrite a conflict, refresh another agent, or mutate optional/Graphify skills.
- Result output must list architecture `Created`, `Updated`, `Unchanged`, and `Skipped conflict` entries as applicable, followed by architecture summary counts within the normal init result.
- If at least one file was created or updated, print that the user must quit and restart OpenCode. Otherwise print that architecture definitions were not changed and no restart is required.
- The flow is idempotent: immediately rerunning init produces unchanged architecture targets and no architecture writes, including when Architect has a preserved non-template `model` value.
- Each eligible file write must use the repository's safest existing write primitive. If an apply error can leave earlier files updated, report the completed and failed paths explicitly, require restart when any write succeeded, and make rerun safe/idempotent; do not claim all-or-nothing transactionality or silently roll back user files.
- Marked user modifications other than valid Architect `model` are intentionally replaceable because the marker declares managed ownership, but replacement is never silent: exact target/action preview, overwrite warning, interactive approval or explicit `--yes`, dry-run, and conflict preservation are mandatory. No automatic backup artifact is introduced; users who need to retain other marked customizations must copy or version them before authorization.

#### Core-skill catalog and lifecycle

- Add `local-architecture` to `CORE_SKILLS` alongside `cross-repo-architecture` in `src/lib/paths.ts`.
- Preserve the existing generic install/update/delete/conflict behavior for ordinary init, optional skills, Graphify, and uninstall.
- Add the minimum production logic outside `CORE_SKILLS` needed by normal-init architecture reconciliation: canonical comparison and safe marked-file replacement for Architect and both architecture skills, integration into init planning/apply/result messaging, and dry-run/idempotence.
- Update hard-coded tests and distribution validation so both core skills are installed and reconciled automatically, excluded from optional selection/removal, updated with retained Architect during normal init, preserved on unmarked conflict, and packaged with valid frontmatter and managed markers.
- Prefer parameterized assertions over duplicating an entire test suite for each core skill when the behavior is identical.

#### Protocol regression tests

- Move Architect Implementation Contract schema assertions from `architect.md` to `local-architecture/SKILL.md` rather than deleting coverage.
- Assert the kernel names both playbooks, defines local/cross triggers, states that complexity/workspace layout are insufficient, requires one architecture playbook before handoff, supports safe mode transition, and does not embed the complete local task/checkpoint schema.
- Assert the local playbook contains `brief.md`, `tasks.md`, `progress.md`, all required Implementation Contract subsections, AC/task/checkpoint mapping, and the local exit gate.
- Assert the cross playbook contains `brief.md` plus `repos/{repo}.md`, responsibility and compatibility sections, and explicit prohibitions on local tasks/checkpoints and post-commit operations.
- Assert local task/checkpoint/progress schemas, coverage mapping, binding cross-draft consumption, and stop-on-unavailable-playbook behavior directly rather than relying only on broad prose substrings.
- Assert the kernel contains all three collision checks, the four-item confirmation, and explicit approval before creation.
- Cover four classification examples in prompt text or table-driven tests: single-repo local; multi-repo workspace with only one affected repo; BFF/frontend contract change; local mode discovering a cross boundary and switching before persistence.
- Add command/library tests proving normal init updates an older active marked Architect and both older marked core skills in one approved run; always retains active Architect; creates a missing Architect only when selected; adds no removal state; preserves a valid non-template Architect model across comparison/update/idempotent rerun; treats malformed mutable frontmatter safely; handles interactive approval, interactive rejection, `--dry-run`, `--dry-run --yes`, and `--yes` separately; preserves/reports unmarked conflicts; handles mixed results; requests restart only after writes; and does not mutate other agents/optional/Graphify skills.
- Preserve unrelated permission and Reviewer-invocation invariants.

### Contracts / invariants / compatibility to preserve

- Architect remains named `architect`; no new agent is added to `PACK_AGENTS`.
- Architect's existing file permission boundary remains limited to allowed `.path/work/**` handoff artifacts; no broader application-code writes are granted.
- Local handoff consumers continue receiving the same required Implementation Contract subsections and task/checkpoint schemas.
- Developer, Reviewer, and Auditor templates remain byte-for-byte untouched in this phase unless an existing test fixture references the changed core-skill count; agent prompts themselves must not change.
- Core skills remain automatically installed by `init` and non-removable through the optional skill picker.
- User-authored unmarked skill conflicts remain protected from overwrite/deletion.
- Unmarked Architect conflicts receive the same protection during architecture reconciliation.
- Normal init retains its existing selection and confirmation UX while adding automatic reconciliation only for the architecture bundle.
- Normal init remains add/restore-only: every active Architect remains selected/retained, and no new removal UX or compatibility behavior is introduced.
- Existing supported Architect model assignment survives reconciliation exactly; reconciliation does not reset the selected provider/model.
- Managed markers and skill frontmatter validation remain mandatory.
- Existing optional and Graphify skill classification remains unchanged.
- Existing handoff modes remain available; this feature changes the artifact schema by architecture mode, not the user's ability to choose chat/current checkout/worktree where supported.

### Decisions already made

- Use one intelligent Architect rather than a separate Cross Architect.
- Use skills as procedural playbooks, not as instructions that override the agent's identity.
- Both playbooks are core and automatically installed.
- Existing managed architecture installations are upgraded during normal `opencode-path init`; replacement of marked drift is shown in the aggregate plan and requires interactive approval or explicit authorization via `--yes`.
- Active Architect is always retained during init. The earlier deselection/removal concept is rejected as incompatible with current init and is not part of this feature.
- Preserve `model` as the sole supported mutable Architect frontmatter field during reconciliation.
- `--yes` is explicit noninteractive authorization for displayed architecture updates; `--dry-run` remains non-mutating even when combined with `--yes`.
- The kernel performs mode routing and the selected playbook owns detailed procedure.
- Architecture playbooks are mutually exclusive for a single produced handoff.
- Cross coordination ends at development compatibility and preparation; post-commit QA/production operations are out of scope.
- Cross Auditor will be designed in a later phase and must not be introduced here.
- Static prompt/template tests are sufficient for this phase; no runtime enforcement.

### Normal flow to encode

1. Architect clarifies the feature and performs bounded reconnaissance when boundaries are not already known.
2. Architect classifies the feature by affected implementation/deployment boundaries and shared-contract impact.
3. Architect declares `Mode`, `Playbook`, and `Reason`.
4. Architect loads exactly one architecture playbook.
5. In local mode, Architect debates local design and, when requested, produces the normal implementation handoff.
6. In cross mode, Architect defines only responsibilities, shared contracts, compatibility, necessary ordering constraints, and repo drafts.
7. A later Architect session inside each repo consumes its matching draft in local mode and produces that repo's implementation handoff.
8. If reconnaissance changes the classification before persistence, Architect explicitly transitions playbooks and does not mix or reuse incompatible artifact schemas.
9. If the required playbook is missing or cannot be loaded, Architect reports the problem and stops before producing a handoff.
10. Before Mode 3 creation, Architect performs the sibling-directory, registered-worktree, and branch checks, then shows worktree path, work-folder path, branch, and base together and waits for explicit approval.

The existing-installation reconciliation flow is separate from feature design:

1. User runs normal `opencode-path init` with the usual project/global scope and optional `--dry-run`.
2. Init retains/reconciles any active Architect, creates Architect only when missing and selected, and always includes both core architecture skills. It does not remove active agents.
3. Init classifies and displays the desired architecture definitions inside the aggregate plan.
4. Conflicts are preserved; marked outdated definitions are visibly identified as replacements.
5. Dry-run stops after preview. Interactive execution uses the existing single init confirmation; `--yes` displays the same plan/warning and authorizes writes without prompting.
6. Approval preserves/reapplies valid Architect `model`, applies eligible creates/updates, prints per-file results and summary, and requires an OpenCode restart only when architecture content changed.
7. A repeated run with the same desired selection is unchanged and performs no architecture writes.

### Escalation contract

If Developer encounters a contradiction while implementing this phase, record it in `.path/work/architect-kernel-playbooks/progress.md` with the current task/checkpoint, problem, file/line evidence, impact, options, and status `blocked awaiting Architect decision`; stop only the affected area. Material resolutions must be persisted into this `brief.md` and/or `tasks.md` by Architect. No material product, scope, compatibility, or artifact-shape decision is valid only in chat or `progress.md`.

Escalate specifically if:

- OpenCode skill loading semantics make the declared kernel/playbook contract impossible.
- Moving a local rule would remove behavior required by Developer/Reviewer/Auditor consumers.
- Reconciliation implementation would need to update any agent or skill outside the explicit Architect/two-playbook allowlist.
- The cross-only `brief.md` + `repos/` shape conflicts with an actual runtime requirement rather than prompt text or tests.

### Do not touch / do not introduce

- Do not modify `templates/developer.md`, `templates/reviewer.md`, `templates/auditor.md`, `templates/spec.md`, or `templates/research.md`.
- Do not add agents, including Cross Architect or Cross Auditor.
- Do not modify application behavior unrelated to skill catalog registration, normal-init architecture reconciliation, and managed core-skill lifecycle.
- Do not add dependencies, plugins, hooks, runtime enforcement, automated mode classifiers, or executable handoff schemas.
- Do not add mandatory worktrees.
- Do not redesign optional skills.
- Do not add persistent handoff artifacts beyond the local `brief.md`/`tasks.md`/`progress.md` shape, the cross `brief.md`/`repos/{repo}.md` shape, and this phase's own `.path/work/architect-kernel-playbooks/brief.md`, `tasks.md`, and `progress.md`.
- Do not manage or require evidence for deploys, QA, production, runtime activation, or other post-commit operations.

## Relevant files and areas

- `templates/architect.md`: current monolithic Architect instructions.
- `templates/skills/cross-repo-architecture/SKILL.md`: current cross-mode protocol and local consumption rules.
- `src/lib/paths.ts`: managed skill classification and core catalog.
- `src/lib/agents.ts`, `src/lib/skills.ts`: managed marker/template comparison and narrow safe reconciliation helpers for Architect and core skills.
- `src/lib/frontmatter.ts`: parse and reapply the supported Architect `model` field onto canonical packaged content without preserving unrelated drift.
- `src/lib/templates.test.ts`: current Architect schema and agent permission invariants.
- `src/lib/skills.test.ts`: skill template and lifecycle coverage.
- `src/commands/init.ts`: integrate architecture reconciliation into normal plan/confirmation/apply/result flow, dry-run, and restart messaging.
- `src/commands/init.test.ts`, `src/commands/skills.test.ts`, `src/commands/uninstall.test.ts`: hard-coded core-skill fixture expectations.
- `scripts/validate-dist-skill-lookup.mjs`: packaged managed-skill list.
- `README.md`: normal-init reconciliation behavior, marked overwrite/unmarked conflict semantics, idempotence, and restart requirement.

## Acceptance Criteria

- AC-01: `architect.md` operates as a routing kernel, visibly classifies local/cross mode by boundary impact, and does not treat complexity, file count, workspace layout, or mere multi-repo presence as sufficient cross triggers.
- AC-02: Architect must load exactly one handoff-producing architecture playbook before mode-specific handoff output and must stop if that playbook is unavailable; optional domain skills remain allowed.
- AC-03: `local-architecture` is a valid core managed skill and contains the complete local handoff contract, including `brief.md`, `tasks.md`, `progress.md`, Implementation Contract, AC/task/checkpoint mapping, and exit gate.
- AC-04: `cross-repo-architecture` is a compatibility-focused core playbook that defines responsibilities, shared contracts, compatibility, necessary ordering constraints, and one draft per affected repo.
- AC-05: A persistent cross handoff contains `brief.md` and `repos/{repo}.md` only and explicitly excludes `tasks.md`, `progress.md`, local ACs, Developer tasks, and checkpoints.
- AC-06: Local mode consuming a cross draft preserves code-affecting shared contracts and compatibility obligations while leaving internal data access, module structure, tests, migrations, files, and local configuration to the local Architect.
- AC-07: Architect supports explicit local→cross and apparent-cross→local transitions before persistence without mixing artifact schemas.
- AC-08: Normal `opencode-path init` installs/reconciles both core architecture skills and updates every active managed Architect in the same aggregate plan; active Architect is always retained under existing add/restore-only semantics, missing Architect is created only when selected, no init-removal state is introduced, canonical targets remain unchanged, unmarked conflicts are preserved, and other agents/optional/Graphify definitions are untouched.
- AC-09: Regression tests cover the four classification scenarios, local task/checkpoint/progress schemas, AC coverage mapping, binding cross-draft consumption, cross artifact exclusions, and stopping when the selected playbook is unavailable.
- AC-10: No agent other than Architect and no optional skill is modified; no Cross Architect, Cross Auditor, runtime enforcement, dependency, hook, or plugin is introduced.
- AC-11: `npm test`, `npm run typecheck`, `npm run build`, `npm run validate-dist`, and `npm run smoke` complete successfully.
- AC-12: Cross artifacts state development-time compatibility constraints but contain no responsibility for QA/production deploy, operational migration execution, activation, or other post-commit evidence.
- AC-13: Dedicated-worktree mode checks the sibling directory, registered worktrees, and `feature/{slug}` branch; on any collision it stops without overwrite/reuse/auto-increment, and when clear it presents worktree path, work-folder path, branch, and base together and waits for explicit approval before creation.
- AC-14: Architecture reconciliation is idempotent and safe: interactive rejection and `--dry-run` write nothing; `--dry-run --yes` also writes nothing; `--yes` displays the plan/warning and authorizes eligible replacements without prompting; a repeated approved init reports architecture targets unchanged; and conflicts without markers are never overwritten or deleted.
- AC-15: Normal init reports per-file architecture actions and summary counts, warns that authorized updates replace marked drift except preserved Architect `model`, requires an OpenCode restart only after at least one architecture create/update, and documents interactive/`--yes`/dry-run behavior in `README.md`.
- AC-16: Reconciliation preserves an installed valid non-empty Architect `model` exactly by reapplying it to the packaged managed definition before comparison/write; model-only differences do not cause perpetual drift, the first prompt/body update retains the model, the next init is unchanged, and malformed frontmatter/model is preserved as a reported conflict.

## Edge cases

- A parent folder contains many repos but only one repo changes: local mode.
- A feature changes many files in one repo but no external contract: local mode.
- A producer changes a contract consumed by another repo even if only producer code changes initially: cross mode because compatibility must be negotiated.
- Multiple packages in one repo are cross only when they represent independent ownership/deployment or a shared contract boundary requiring coordination; directory count alone is insufficient.
- Architect starts local and discovers a consumer during reconnaissance: stop before writing the local handoff and switch to cross.
- Architect starts cross because of workspace layout, then proves only one boundary is affected: switch to local and do not create empty drafts.
- A local repo has a matching cross draft: load local playbook only, copy binding code contracts, and choose local implementation details.
- The required skill is installed but fails to load in the session: no handoff is produced from memory.
- Optional migration/API/security/test skills are needed: they may be loaded alongside the one selected architecture playbook.
- A core skill target already contains an unmarked user file: report conflict and do not overwrite.
- Active Architect and both skills are older marked versions: one approved normal init updates all three and requires restart while retaining Architect's valid installed model.
- One architecture target is unmarked while the other two are marked/outdated: preserve and report the conflict, update only eligible targets after approval, and require restart because content changed.
- A marked definition contains user customization: preserve valid Architect `model`, preview other drift as `update`, warn that other marked edits will be replaced, and require interactive approval or `--yes`; dry-run/rejection preserves it.
- Init runs immediately after a successful reconciliation with the same Architect selection: architecture definitions are unchanged, no architecture writes occur, and no architecture restart notice is requested.
- Architect is missing and not selected: init does not create it, while both core skills are still reconciled.
- Architect is active: normal init forces it retained/selected, reconciles it, and offers no removal path.
- Architect has a valid model set by `opencode-path models` or prior init: a prompt update preserves the exact model and the subsequent init is unchanged.
- Architect has malformed marked frontmatter or an invalid model value: preserve it as a conflict and report why instead of replacing it.
- `init --yes` sees marked drift: show the update warning, skip the confirmation prompt, and apply eligible changes; unmarked conflicts remain untouched.
- `init --dry-run --yes`: show the same planned actions/warnings and write nothing.
- Mode 3 sibling directory, registered worktree, or branch already exists: stop and ask; do not reuse or invent a new slug.

## Open questions

None material. Post-audit decisions bind add/restore-only Architect retention, model-preserving canonicalization, `--yes` authorization, bounded automatic reconciliation, and complete Mode 3 preflight safety.

## Assumptions and residual risks

- Skill loading is instruction-driven rather than technically enforced. The kernel declaration, differentiated schemas, and tests reduce but do not eliminate model non-compliance.
- Cross-plan compatibility is not independently audited in this phase because Cross Auditor is explicitly deferred.
- Existing installations receive this architecture version during normal `opencode-path init`. OpenCode must be restarted only when init creates or updates at least one architecture definition.
