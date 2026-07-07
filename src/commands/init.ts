import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveTarget,
  type InstallScope,
  type InstallTarget,
} from "../lib/paths.js";
import { createOrMergeConfig } from "../lib/config.js";
import {
  listManagedAgentStatuses,
  listActiveManagedAgents,
  listActiveManagedModelAgents,
  detectManageableScopes,
  computeAgentChanges,
  applyAgentChanges,
  type ManagedAgentStatus,
  type AgentChanges,
} from "../lib/agents.js";
import {
  PROFILES,
  getProfile,
  applyProfileToAgents,
  profileExistsInContent,
  type ProfileName,
  type ProfileApplyResult,
} from "../lib/profiles.js";
import { getAgentModel, setAgentModel } from "../lib/frontmatter.js";
import { getConfigAgentModel, setConfigAgentModel } from "../lib/config.js";
import {
  CUSTOM_MODEL_VALUE,
  buildModelOptions,
  listOpenCodeModelsAsync,
} from "../lib/opencode-models.js";
import { validateAllTemplates } from "../lib/templates.js";
import {
  installCoreSkill,
  listManagedSkillStatuses,
  type ManagedSkillStatus,
} from "../lib/skills.js";
import {
  printHeader,
  printPaths,
  printWarning,
  printError,
  printCancelled,
  printNoChanges,
  printComplete,
  printSummary,
  printNextStep,
  printRestartWarning,
  buildAgentRow,
  dimText,
  uiCheckbox,
  uiSelect,
  uiInput,
  uiConfirmWithCancel,
  resolveScope,
  withSpinner,
  withApplyPhaseSigint,
  applyPhaseCheckpoint,
  CancellationError,
  type CommandOptions,
  type SummaryLine,
} from "../lib/ui.js";
import * as messages from "../lib/messages.js";

// ---------------------------------------------------------------------------
// Technical debt (AC-10): Future init expansion
// ---------------------------------------------------------------------------
// When optional skills are introduced, `init` should gain an optional
// skill-selection step (similar to today's agent-selection step) that lets
// users pick which optional skills to install alongside the always-installed
// core skills. This should be implemented after optional skills exist and
// a dedicated `skills` command is available.
//
// The current core-skill installation (unconditional, no prompts) is
// intentionally simple. Do not expand it until optional skills are defined.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Patchable agents for profiles (same as standalone profiles command)
// ---------------------------------------------------------------------------

const PATCHABLE_DEFS = [
  { name: "developer", variant: "dev" as const },
  { name: "reviewer", variant: "readonly" as const },
  { name: "auditor", variant: "readonly" as const },
];

function getActivePatchableAgents(
  target: InstallTarget
): { name: string; variant: "dev" | "readonly" }[] {
  const activeAgents = listActiveManagedAgents(target);
  const activeCustomNames = new Set(
    activeAgents.filter((a) => a.kind === "custom").map((a) => a.name)
  );
  return PATCHABLE_DEFS.filter((def) => activeCustomNames.has(def.name));
}

// ---------------------------------------------------------------------------
// Init plan: collected from all steps before any writes
// ---------------------------------------------------------------------------

interface InitPlan {
  agentChanges: AgentChanges | null;
  selectedProfiles: string[];
  modelAssignments: { agent: ManagedAgentStatus; model: string }[];
  target: InstallTarget;
  skillStatuses: ManagedSkillStatus[];
}

interface InitApplyResult {
  agentResult: {
    installed: string[];
    restored: string[];
    unchanged: string[];
    conflicts: string[];
  };
  profileResult: {
    applied: string[];
    skipped: string[];
    failed: string[];
  };
  modelResult: {
    configured: { agent: string; model: string }[];
    failed: string[];
  };
  skillResult: {
    installed: string[];
    unchanged: string[];
    conflicts: string[];
  };
}

// ---------------------------------------------------------------------------
// Model helpers (adapted from standalone models command)
// ---------------------------------------------------------------------------

function getCurrentModel(
  agent: ManagedAgentStatus,
  target: { agentDir: string; configPath: string }
): string | undefined {
  if (agent.kind === "builtin") {
    return getConfigAgentModel(target.configPath, agent.name);
  }
  const agentPath = join(target.agentDir, `${agent.name}.md`);
  return getAgentModel(agentPath);
}

function setCurrentModel(
  agent: ManagedAgentStatus,
  target: { agentDir: string; configPath: string },
  model: string
): void {
  if (agent.kind === "builtin") {
    setConfigAgentModel(target.configPath, agent.name, model);
    return;
  }
  const agentPath = join(target.agentDir, `${agent.name}.md`);
  if (!existsSync(agentPath)) {
    throw new Error(`Agent file not found: ${agentPath}`);
  }
  setAgentModel(agentPath, model);
}

async function promptCustomModel(agentName: string): Promise<string> {
  let newModel = await uiInput(
    `Enter model for ${agentName} (Ctrl+C to cancel):`,
    {
      validate: (value: string) => {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          return "Model cannot be empty. Enter a model ID like 'anthropic/claude-sonnet-4-6'.";
        }
        return true;
      },
    }
  );

  let trimmedModel = newModel.trim();

  if (trimmedModel.length > 0 && !trimmedModel.includes("/")) {
    const proceed = await uiConfirmWithCancel(
      "OpenCode models normally use 'provider/model-id' format (e.g., 'anthropic/claude-sonnet-4-6'). Continue anyway?",
      { default: false }
    );

    if (!proceed) {
      newModel = await uiInput(
        `Enter model for ${agentName} (Ctrl+C to cancel):`,
        {
          validate: (value: string) => {
            const trimmed = value.trim();
            if (trimmed.length === 0) {
              return "Model cannot be empty.";
            }
            if (!trimmed.includes("/")) {
              return "Model must use 'provider/model-id' format.";
            }
            return true;
          },
        }
      );
      trimmedModel = newModel.trim();
    }
  }

  return trimmedModel;
}

async function promptModelFromOpenCode(
  agentName: string,
  availableModels: string[],
  currentModel?: string
): Promise<string> {
  const modelOptions = buildModelOptions(availableModels, currentModel);

  if (modelOptions.length === 0) {
    return promptCustomModel(agentName);
  }

  const selectedModel = await uiSelect<string>(
    `Choose a model for: ${agentName}`,
    [
      ...modelOptions.map((model) => ({
        value: model,
        name: model === currentModel ? `${model} (current)` : model,
      })),
      {
        value: CUSTOM_MODEL_VALUE,
        name: "Custom model...",
      },
    ]
  );

  if (selectedModel === CUSTOM_MODEL_VALUE) {
    return promptCustomModel(agentName);
  }

  return selectedModel;
}

// ---------------------------------------------------------------------------
// Summary builders
// ---------------------------------------------------------------------------

function buildConsolidatedSummary(
  plan: InitPlan,
  statuses: ManagedAgentStatus[]
): SummaryLine[] {
  const lines: SummaryLine[] = [];

  // Agent changes
  if (plan.agentChanges) {
    const ac = plan.agentChanges;
    if (ac.toInstall.length > 0) {
      lines.push({
        label: "Install:",
        value: ac.toInstall.join(", "),
        color: "green",
      });
    }
    if (ac.toRestore.length > 0) {
      lines.push({
        label: "Restore:",
        value: ac.toRestore.join(", "),
        color: "green",
      });
    }
    const skippedAgents = statuses
      .filter(
        (s) =>
          s.state === "missing" &&
          !ac.toInstall.includes(s.name) &&
          s.kind === "custom"
      )
      .map((s) => s.name)
      .concat(
        statuses
          .filter(
            (s) =>
              s.state === "hidden" &&
              !ac.toRestore.includes(s.name) &&
              s.kind === "builtin"
          )
          .map((s) => s.name)
      );
    if (skippedAgents.length > 0) {
      lines.push({
        label: "Skip (agents):",
        value: skippedAgents.join(", "),
        color: "yellow",
      });
    }
    if (ac.conflicts.length > 0) {
      lines.push({
        label: "Conflicts:",
        value: ac.conflicts.join(", "),
        color: "red",
      });
    }
  } else {
    lines.push({
      label: "Agents:",
      value: "skipped",
      color: "yellow",
    });
  }

  // Profile changes
  if (plan.selectedProfiles.length > 0) {
    const profileLabels = plan.selectedProfiles.map(
      (name) => getProfile(name)?.label ?? name
    );
    lines.push({
      label: "Profiles:",
      value: profileLabels.join(", "),
      color: "green",
    });
  } else {
    lines.push({
      label: "Profiles:",
      value: "skipped",
      color: "yellow",
    });
  }

  // Model assignments
  if (plan.modelAssignments.length > 0) {
    lines.push({
      label: "Models:",
      value: plan.modelAssignments
        .map((m) => `${m.agent.name} → ${m.model}`)
        .join(", "),
      color: "green",
    });
  } else {
    lines.push({
      label: "Models:",
      value: "skipped",
      color: "yellow",
    });
  }

  // Core skills (always installed, no prompt)
  const skillsToInstall = plan.skillStatuses.filter((s) => s.state === "missing");
  const skillsActive = plan.skillStatuses.filter((s) => s.state === "active");
  const skillsConflict = plan.skillStatuses.filter((s) => s.state === "conflict");
  
  if (skillsConflict.length > 0) {
    lines.push({
      label: "Skill conflicts:",
      value: skillsConflict.map((s) => s.name).join(", "),
      color: "red",
    });
  }
  if (skillsToInstall.length > 0) {
    lines.push({
      label: "Skills:",
      value: skillsToInstall.map((s) => s.name).join(", "),
      color: "green",
    });
  } else if (skillsConflict.length === 0 && skillsActive.length > 0) {
    lines.push({
      label: "Skills:",
      value: "already installed",
      color: "dim",
    });
  }

  return lines;
}

function hasPlannedChanges(plan: InitPlan): boolean {
  const hasAgentChanges =
    plan.agentChanges !== null &&
    (plan.agentChanges.toInstall.length > 0 ||
      plan.agentChanges.toRestore.length > 0);

  const hasSkillChanges = plan.skillStatuses.some((s) => s.state === "missing");

  return (
    hasAgentChanges ||
    hasSkillChanges ||
    plan.selectedProfiles.length > 0 ||
    plan.modelAssignments.length > 0
  );
}

// ---------------------------------------------------------------------------
// Apply logic
// ---------------------------------------------------------------------------

async function applyPlan(
  plan: InitPlan,
  statuses: ManagedAgentStatus[]
): Promise<InitApplyResult> {
  const result: InitApplyResult = {
    agentResult: { installed: [], restored: [], unchanged: [], conflicts: [] },
    profileResult: { applied: [], skipped: [], failed: [] },
    modelResult: { configured: [], failed: [] },
    skillResult: { installed: [], unchanged: [], conflicts: [] },
  };

  // 1. Apply agent changes
  if (plan.agentChanges) {
    await applyPhaseCheckpoint();

    // Ensure agent directory exists
    if (!existsSync(plan.target.agentDir)) {
      mkdirSync(plan.target.agentDir, { recursive: true });
    }

    await applyPhaseCheckpoint();

    const agentResult = applyAgentChanges(plan.agentChanges, plan.target);
    result.agentResult = {
      installed: agentResult.installed,
      restored: agentResult.restored,
      unchanged: agentResult.unchanged,
      conflicts: agentResult.conflicts,
    };
  }

  // 2. Install core skills (always, no user prompt)
  await applyPhaseCheckpoint();
  for (const skill of plan.skillStatuses) {
    await applyPhaseCheckpoint();
    if (skill.state === "missing") {
      try {
        const installResult = installCoreSkill(skill.name, plan.target);
        if (installResult === "created") {
          result.skillResult.installed.push(skill.name);
        } else if (installResult === "conflict") {
          result.skillResult.conflicts.push(skill.name);
        } else {
          result.skillResult.unchanged.push(skill.name);
        }
      } catch {
        result.skillResult.conflicts.push(skill.name);
      }
    } else if (skill.state === "active") {
      result.skillResult.unchanged.push(skill.name);
    } else if (skill.state === "conflict") {
      result.skillResult.conflicts.push(skill.name);
    }
  }

  // 3. Create or merge config
  await applyPhaseCheckpoint();
  createOrMergeConfig(plan.target.configPath);

  // 4. Apply profile changes
  if (plan.selectedProfiles.length > 0) {
    await applyPhaseCheckpoint();

    const patchableAgents = getActivePatchableAgents(plan.target);
    if (patchableAgents.length > 0) {
      for (const profileName of plan.selectedProfiles) {
        await applyPhaseCheckpoint();

        const profile = getProfile(profileName);
        if (!profile) continue;

        const applyResult = applyProfileToAgents(
          plan.target.agentDir,
          profile,
          patchableAgents
        );

        const inserted = applyResult.files.filter(
          (f) => f.status === "inserted"
        );
        const errors = applyResult.files.filter(
          (f) => f.status === "marker_not_found"
        );

        if (inserted.length > 0) {
          result.profileResult.applied.push(profile.label);
        }
        if (errors.length > 0) {
          result.profileResult.failed.push(profile.label);
        }
        if (
          inserted.length === 0 &&
          errors.length === 0
        ) {
          result.profileResult.skipped.push(profile.label);
        }
      }
    }
  }

  // 5. Apply model assignments
  await applyPhaseCheckpoint();
  for (const assignment of plan.modelAssignments) {
    await applyPhaseCheckpoint();

    try {
      setCurrentModel(assignment.agent, plan.target, assignment.model);
      result.modelResult.configured.push({
        agent: assignment.agent.name,
        model: assignment.model,
      });
    } catch {
      result.modelResult.failed.push(assignment.agent.name);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main init command
// ---------------------------------------------------------------------------

export async function initCommand(
  options: CommandOptions = {}
): Promise<void> {
  printHeader("OpenCode Path Installer", "🔧");

  // Step 0: Validate template frontmatter (AC-31)
  const templateErrors = validateAllTemplates();
  if (templateErrors.length > 0) {
    printError(
      `   Malformed template frontmatter detected:`
    );
    for (const err of templateErrors) {
      console.error(`     • ${err}`);
    }
    console.error(
      `\n   Fix the template files and re-run init.\n`
    );
    process.exit(1);
  }

  // Step 1: Resolve scope
  const projectTarget = resolveTarget("project");
  const globalTarget = resolveTarget("global");
  const { projectManageable, globalManageable } = detectManageableScopes(
    projectTarget,
    globalTarget
  );

  const scope: InstallScope = await resolveScope(options, {
    projectViable: projectManageable,
    globalViable: globalManageable,
    projectTarget,
    globalTarget,
  });

  const target = resolveTarget(scope);
  printPaths(target);

  // Step 2: Scan state and display conflict warnings (AC-02)
  const statuses = listManagedAgentStatuses(target);
  const conflictAgents = statuses.filter((s) => s.state === "conflict");

  if (conflictAgents.length > 0) {
    printWarning(
      `Conflicting agents (manual files without managed marker): ${conflictAgents
        .map((a) => a.name)
        .join(", ")}`
    );
    console.log(
      "     They cannot be managed here. Resolve manually or add the marker.\n"
    );
  }

  // Scan skill state for conflicts
  const skillStatuses = listManagedSkillStatuses(target);
  const conflictSkills = skillStatuses.filter((s) => s.state === "conflict");

  if (conflictSkills.length > 0) {
    printWarning(
      `Conflicting skills (manual files without managed marker): ${conflictSkills
        .map((s) => s.name)
        .join(", ")}`
    );
    console.log(
      "     Core skills cannot be installed here. Resolve manually or add the marker.\n"
    );
  }

  // Build the plan
  const plan: InitPlan = {
    agentChanges: null,
    selectedProfiles: [],
    modelAssignments: [],
    target,
    skillStatuses,
  };

  // Step 3: Agent selection (AC-03, AC-06, AC-07)
  const agentChoices = statuses.map((agent) => {
    const isDefaultChecked = agent.state === "active";

    return {
      value: agent.name,
      name: buildAgentRow(agent, { showGlyph: true }),
      checked: isDefaultChecked,
    };
  });

  const SKIP_AGENTS_VALUE = "__skip_agents__";

  const agentSelection = await uiSelect<string>(
    "Agent installation:",
    [
      {
        value: "__select__",
        name: "Select agents to install/restore...",
        description: `${statuses.filter((s) => s.state === "active").length} active, ${statuses.filter((s) => s.state === "missing").length} missing, ${statuses.filter((s) => s.state === "hidden").length} hidden`,
      },
      {
        value: SKIP_AGENTS_VALUE,
        name: dimText("Skip for now"),
      },
    ]
  );

  if (agentSelection !== SKIP_AGENTS_VALUE) {
    // Show the checkbox for agent selection
    const selectedNames = await uiCheckbox<string>(
      "Select agents to install/restore (space to toggle, enter to confirm):",
      agentChoices,
      { required: false }
    );

    // Compute agent changes
    const selectedSet = new Set(selectedNames);
    // Active agents must remain selected (init is add/restore only)
    const activeAgents = statuses
      .filter((a) => a.state === "active")
      .map((a) => a.name);
    for (const name of activeAgents) {
      selectedSet.add(name);
    }
    // Conflict agents cannot be selected
    for (const agent of conflictAgents) {
      selectedSet.delete(agent.name);
    }

    plan.agentChanges = computeAgentChanges(statuses, selectedSet);
  }

  // Step 4: Profile selection (AC-04, AC-06, AC-07)
  // Determine which patchable agents will be active after agent step
  const willBeActive = new Set<string>();
  if (plan.agentChanges) {
    for (const name of plan.agentChanges.toInstall) willBeActive.add(name);
    for (const name of plan.agentChanges.toRestore) willBeActive.add(name);
    for (const name of plan.agentChanges.unchanged) willBeActive.add(name);
  } else {
    // If agents step was skipped, use current active state
    for (const s of statuses.filter((a) => a.state === "active")) {
      willBeActive.add(s.name);
    }
  }

  const willBePatchable = PATCHABLE_DEFS.filter((def) =>
    willBeActive.has(def.name)
  );

  const SKIP_PROFILES_VALUE = "__skip_profiles__";

  if (willBePatchable.length > 0) {
    const profileSelection = await uiSelect<string>(
      "Stack profiles:",
      [
        {
          value: "__select__",
          name: "Select stack profiles to apply...",
          description: `${willBePatchable.map((a) => a.name).join(", ")} will receive profiles`,
        },
        {
          value: SKIP_PROFILES_VALUE,
          name: dimText("Skip for now"),
        },
      ]
    );

    if (profileSelection !== SKIP_PROFILES_VALUE) {
      const selectedProfileNames = await uiCheckbox<ProfileName>(
        "Select stack profiles to apply (space to toggle, enter to confirm):",
        [
          ...PROFILES.map((p) => ({
            value: p.name as ProfileName,
            name: p.label,
          })),
          {
            value: "__all__" as ProfileName,
            name: "All stacks (apply every profile above)",
          },
        ],
        { required: false }
      );

      if (selectedProfileNames.length > 0) {
        const allSelected = selectedProfileNames.includes("__all__")
          ? PROFILES.map((p) => p.name)
          : selectedProfileNames;

        // Filter out profiles that are already applied to ALL agents that will
        // be patchable after this init run (not just currently active ones).
        // This handles the mixed case: developer already profiled + reviewer
        // newly installed in the same run.
        const newProfiles: string[] = [];
        for (const profileName of allSelected) {
          const alreadyApplied = willBePatchable.every((a) => {
            const agentPath = join(target.agentDir, `${a.name}.md`);
            if (!existsSync(agentPath)) return false;
            try {
              const content = readFileSync(agentPath, "utf-8");
              return profileExistsInContent(content, profileName);
            } catch {
              return false;
            }
          });
          if (!alreadyApplied) {
            newProfiles.push(profileName);
          }
        }
        plan.selectedProfiles = newProfiles;
      }
    }
  }

  // Step 5: Model configuration (AC-05, AC-06, AC-07)
  // Determine which agents are active for model config
  const activeModelAgents = statuses.filter(
    (s) =>
      s.state === "active" ||
      (plan.agentChanges &&
        (plan.agentChanges.toInstall.includes(s.name) ||
          plan.agentChanges.toRestore.includes(s.name)))
  );

  const SKIP_MODELS_VALUE = "__skip_models__";
  const SKIP_ONE_MODEL_VALUE = "__skip_one_model__";

  if (activeModelAgents.length > 0) {
    // Load available models with spinner
    let availableModels: string[] = [];
    try {
      availableModels = await withSpinner(
        "Loading models from OpenCode...",
        async (signal) => listOpenCodeModelsAsync({ signal })
      );
    } catch (err) {
      if (err instanceof CancellationError) throw err;
      availableModels = [];
    }

    if (availableModels.length > 0) {
      console.log(
        `   Loaded ${availableModels.length} models from OpenCode.\n`
      );
    } else {
      console.log(
        `   Could not read models from opencode. Falling back to manual input.\n`
      );
    }

    const modelStepChoice = await uiSelect<string>(
      "Model configuration:",
      [
        {
          value: "__configure__",
          name: "Configure models for active agents...",
          description: `${activeModelAgents.length} agent(s) to configure`,
        },
        {
          value: SKIP_MODELS_VALUE,
          name: dimText("Skip for now"),
        },
      ]
    );

    if (modelStepChoice !== SKIP_MODELS_VALUE) {
      // Iterate active agents, prompting once per agent
      for (const agent of activeModelAgents) {
        const currentModel = getCurrentModel(agent, target);
        const modelDisplay = currentModel
          ? ` (current: ${currentModel})`
          : " (no model set)";

        const modelChoice = await uiSelect<string>(
          `Choose a model for: ${agent.name}`,
          [
            ...buildModelOptions(availableModels, currentModel).map(
              (model) => ({
                value: model,
                name: model === currentModel ? `${model} (current)` : model,
              })
            ),
            {
              value: CUSTOM_MODEL_VALUE,
              name: "Custom model...",
            },
            {
              value: SKIP_ONE_MODEL_VALUE,
              name: dimText("Skip for now"),
            },
          ]
        );

        if (modelChoice !== SKIP_ONE_MODEL_VALUE) {
          let selectedModel: string;
          if (modelChoice === CUSTOM_MODEL_VALUE) {
            selectedModel = await promptCustomModel(agent.name);
          } else {
            selectedModel = modelChoice;
          }
          // Only add if the model actually differs from the current one
          const currentModel = getCurrentModel(agent, target);
          if (selectedModel !== currentModel) {
            plan.modelAssignments.push({ agent, model: selectedModel });
          }
        }
      }
    }
  } else {
    console.log(
      "   No active managed agents to configure models for.\n"
    );
  }

  // Step 6: Consolidated summary (AC-08)
  console.log("\n   Planned changes:");
  printSummary(buildConsolidatedSummary(plan, statuses));

  // Check for no changes (AC-09)
  if (!hasPlannedChanges(plan)) {
    printNoChanges();
    return;
  }

  // Step 7: Final confirm/apply (AC-08, AC-13, AC-39)
  if (options.dryRun) {
    console.log(`\n   ${messages.DRY_RUN_LABEL} No files were modified.\n`);
    return;
  }

  if (!options.yes) {
    const proceed = await uiConfirmWithCancel(messages.APPLY_CHANGES, {
      default: true,
    });

    if (!proceed) {
      printCancelled();
      return;
    }
  }

  // Apply the plan (guarded by apply-phase SIGINT handler per AC-13)
  let applyResult: InitApplyResult;
  try {
    applyResult = await withApplyPhaseSigint(() => applyPlan(plan, statuses));
  } catch (err) {
    if (err instanceof CancellationError) {
      // SIGINT received during writes — changes may be partially applied.
      printWarning(messages.PARTIAL_STATE_WARNING);
      process.exit(1);
    }
    printError(`\n   Error during apply: ${err instanceof Error ? err.message : String(err)}`);
    printWarning(messages.PARTIAL_STATE_WARNING);
    process.exit(1);
  }

  // Step 8: Print results
  printComplete("Installation");

  const resultLines: SummaryLine[] = [];

  if (applyResult.agentResult.installed.length > 0) {
    resultLines.push({
      label: "Installed:",
      value: applyResult.agentResult.installed.join(", "),
      color: "green",
    });
  }
  if (applyResult.agentResult.restored.length > 0) {
    resultLines.push({
      label: "Restored:",
      value: applyResult.agentResult.restored.join(", "),
      color: "green",
    });
  }
  if (applyResult.agentResult.conflicts.length > 0) {
    resultLines.push({
      label: "Conflicts:",
      value: applyResult.agentResult.conflicts.join(", "),
      color: "red",
    });
  }
  if (applyResult.profileResult.applied.length > 0) {
    resultLines.push({
      label: "Profiles:",
      value: applyResult.profileResult.applied.join(", "),
      color: "green",
    });
  }
  if (applyResult.profileResult.failed.length > 0) {
    resultLines.push({
      label: "Profile errors:",
      value: applyResult.profileResult.failed.join(", "),
      color: "red",
    });
  }
  if (applyResult.modelResult.configured.length > 0) {
    resultLines.push({
      label: "Models:",
      value: applyResult.modelResult.configured
        .map((m) => `${m.agent} → ${m.model}`)
        .join(", "),
      color: "green",
    });
  }
  if (applyResult.modelResult.failed.length > 0) {
    resultLines.push({
      label: "Model errors:",
      value: applyResult.modelResult.failed.join(", "),
      color: "red",
    });
  }
  if (applyResult.skillResult.installed.length > 0) {
    resultLines.push({
      label: "Skills installed:",
      value: applyResult.skillResult.installed.join(", "),
      color: "green",
    });
  }
  if (applyResult.skillResult.conflicts.length > 0) {
    resultLines.push({
      label: "Skill conflicts:",
      value: applyResult.skillResult.conflicts.join(", "),
      color: "red",
    });
  }

  if (resultLines.length > 0) {
    printSummary(resultLines);
  }

  if (applyResult.agentResult.conflicts.length > 0) {
    console.log(`\n   ${messages.CONFLICT_RESOLVE_HINT}`);
  }

  if (applyResult.profileResult.failed.length > 0) {
    console.log(
      "     Profile marker may have been removed from the agent file."
    );
  }

  if (applyResult.modelResult.failed.length > 0) {
    printWarning(messages.PARTIAL_STATE_WARNING);
  }

  printPaths(target);
  printNextStep(messages.NEXT_STEP_MODELS);
  printRestartWarning();
}


