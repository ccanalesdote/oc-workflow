import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveTarget,
  type InstallScope,
  type InstallTarget,
  CORE_SKILLS,
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
  planArchitectReconciliation,
  applyArchitectReconciliation,
  type ArchitectReconciliation,
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
  installManagedSkill,
  listManagedSkillStatuses,
  validateAllSkillTemplates,
  getSkillState,
  planCoreSkillReconciliation,
  applyCoreSkillReconciliation,
  type CoreSkillReconciliation,
  type ManagedSkillStatus,
} from "../lib/skills.js";
import {
  isGraphifyAvailable,
  installGraphifyCli,
  installGraphifyOpenCodeSkill,
} from "../lib/graphify.js";
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
// Optional skill installation (Step 3b) was implemented under the optional-skills
// feature. Core skills are auto-installed; optional skills are user-selectable
// and are unchecked by default. --yes does not install them by surprise.
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
  selectedOptionalSkills: ManagedSkillStatus[];
  graphifyAccepted: boolean;
  graphifyConflict: boolean;
  architectureReconciliations: (ArchitectReconciliation | CoreSkillReconciliation)[];
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
  architectureResult: {
    created: { name: string; path: string }[];
    updated: { name: string; path: string }[];
    unchanged: { name: string; path: string }[];
    conflicts: { name: string; path: string; reason?: string }[];
    failed: { name: string; path: string; error: string }[];
  };
  optionalSkillResult: {
    installed: string[];
    unchanged: string[];
    conflicts: string[];
  };
  graphifyResult: {
    cliInstalled: boolean;
    cliAlreadyPresent: boolean;
    officialSkillInstalled: boolean;
    explorerSkillInstalled: boolean;
    explorerSkillUnchanged: boolean;
    skipped: boolean;
    failed: boolean;
    failedStep?: string;
    failedHint?: string;
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

  // Architecture bundle reconciliation. Every desired target is shown with
  // its path and action inside the existing aggregate approval plan.
  for (const entry of plan.architectureReconciliations) {
    const actionLabel = entry.action === "conflict"
      ? "Skipped conflict"
      : entry.action[0].toUpperCase() + entry.action.slice(1);
    lines.push({
      label: "Architecture:",
      value: `${actionLabel} ${entry.name} — ${entry.path}${entry.reason ? ` (${entry.reason})` : ""}`,
      color: entry.action === "conflict"
        ? "red"
        : entry.action === "unchanged"
          ? "dim"
          : "green",
    });
  }
  if (plan.architectureReconciliations.some((entry) => entry.action === "update")) {
    lines.push({
      label: "Architecture warning:",
      value: "Marked architecture edits will be replaced; only a valid Architect model is preserved.",
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

  // Optional skills (user-selected)
  if (plan.selectedOptionalSkills.length > 0) {
    const optionalToInstall = plan.selectedOptionalSkills.filter((s) => s.state === "missing");
    const optionalActive = plan.selectedOptionalSkills.filter((s) => s.state === "active");
    if (optionalToInstall.length > 0) {
      lines.push({
        label: "Optional skills:",
        value: optionalToInstall.map((s) => s.name).join(", "),
        color: "green",
      });
    } else if (optionalActive.length > 0) {
      lines.push({
        label: "Optional skills:",
        value: "already installed",
        color: "dim",
      });
    }
  } else {
    lines.push({
      label: "Optional skills:",
      value: "skipped",
      color: "yellow",
    });
  }

  // Graphify integration
  if (plan.graphifyAccepted) {
    if (plan.graphifyConflict) {
      lines.push({
        label: "Graphify:",
        value: "conflict — unmarked graphify-explorer file detected",
        color: "red",
      });
    } else {
      lines.push({
        label: "Graphify:",
        value: "will install CLI + skills",
        color: "green",
      });
    }
  } else {
    lines.push({
      label: "Graphify:",
      value: "skipped",
      color: "yellow",
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

  const hasOptionalSkillChanges = plan.selectedOptionalSkills.some(
    (s) => s.state === "missing"
  );

  const hasArchitectureChanges = plan.architectureReconciliations.some(
    (entry) => entry.action === "create" || entry.action === "update"
  );

  return (
    hasAgentChanges ||
    hasSkillChanges ||
    hasOptionalSkillChanges ||
    hasArchitectureChanges ||
    plan.selectedProfiles.length > 0 ||
    plan.modelAssignments.length > 0 ||
    plan.graphifyAccepted
  );
}

function printArchitectureUnchanged(): void {
  console.log("\n   Architecture definitions were not changed; no restart is required.\n");
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
    architectureResult: {
      created: [],
      updated: [],
      unchanged: [],
      conflicts: [],
      failed: [],
    },
    optionalSkillResult: { installed: [], unchanged: [], conflicts: [] },
    graphifyResult: {
      cliInstalled: false,
      cliAlreadyPresent: false,
      officialSkillInstalled: false,
      explorerSkillInstalled: false,
      explorerSkillUnchanged: false,
      skipped: true,
      failed: false,
    },
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

  // 2. Reconcile only Architect and the two architecture core skills. This
  // replaces the old missing-only core-skill install loop; optional skills and
  // Graphify continue through their existing paths below.
  await applyPhaseCheckpoint();
  for (const entry of plan.architectureReconciliations) {
    await applyPhaseCheckpoint();
    try {
      const applied = entry.name === "architect"
        ? applyArchitectReconciliation(entry as ArchitectReconciliation, plan.target)
        : applyCoreSkillReconciliation(entry as CoreSkillReconciliation, plan.target);

      if (applied === "create") {
        result.architectureResult.created.push({ name: entry.name, path: entry.path });
        if (entry.name !== "architect") result.skillResult.installed.push(entry.name);
      } else if (applied === "update") {
        result.architectureResult.updated.push({ name: entry.name, path: entry.path });
      } else if (applied === "unchanged") {
        result.architectureResult.unchanged.push({ name: entry.name, path: entry.path });
        if (entry.name !== "architect") result.skillResult.unchanged.push(entry.name);
      } else {
        result.architectureResult.conflicts.push({
          name: entry.name,
          path: entry.path,
          reason: entry.reason ?? "file changed or lacks the managed marker",
        });
        if (entry.name !== "architect") result.skillResult.conflicts.push(entry.name);
      }
    } catch (error) {
      result.architectureResult.failed.push({
        name: entry.name,
        path: entry.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 2b. Install selected optional skills
  await applyPhaseCheckpoint();
  for (const skill of plan.selectedOptionalSkills) {
    await applyPhaseCheckpoint();
    if (skill.state === "missing") {
      try {
        const installResult = installManagedSkill(skill.name, plan.target);
        if (installResult === "created") {
          result.optionalSkillResult.installed.push(skill.name);
        } else if (installResult === "conflict") {
          result.optionalSkillResult.conflicts.push(skill.name);
        } else {
          result.optionalSkillResult.unchanged.push(skill.name);
        }
      } catch {
        result.optionalSkillResult.conflicts.push(skill.name);
      }
    } else if (skill.state === "active") {
      result.optionalSkillResult.unchanged.push(skill.name);
    } else if (skill.state === "conflict") {
      result.optionalSkillResult.conflicts.push(skill.name);
    }
  }

  // 2c. Graphify integration
  if (plan.graphifyAccepted) {
    await applyPhaseCheckpoint();

    if (plan.graphifyConflict) {
      // Conflicting unmarked graphify-explorer file — skip all Graphify steps
      result.graphifyResult.skipped = true;
      result.graphifyResult.failed = true;
      result.graphifyResult.failedStep = "graphify-explorer";
      result.graphifyResult.failedHint =
        "A conflicting unmarked graphify-explorer/SKILL.md file exists. " +
        "Remove it or add the managed marker, then re-run init with --with-graphify.";
    } else {
      result.graphifyResult.skipped = false;

      // Step A: Graphify CLI
      if (isGraphifyAvailable()) {
        result.graphifyResult.cliAlreadyPresent = true;
      } else {
        await applyPhaseCheckpoint();
        const cliResult = await installGraphifyCli();
        if (cliResult.success) {
          result.graphifyResult.cliInstalled = true;
        } else {
          result.graphifyResult.failed = true;
          result.graphifyResult.failedStep = "CLI install";
          result.graphifyResult.failedHint = cliResult.error;
        }
      }

      // Step B: Official OpenCode skill install (only if CLI is available)
      if (!result.graphifyResult.failed) {
        await applyPhaseCheckpoint();
        const skillResult = await installGraphifyOpenCodeSkill(plan.target.scope);
        if (skillResult.success) {
          result.graphifyResult.officialSkillInstalled = true;
        } else {
          result.graphifyResult.failed = true;
          result.graphifyResult.failedStep = "official skill install";
          result.graphifyResult.failedHint = skillResult.error;
        }
      }

      // Step C: Install graphify-explorer (only if CLI + official skill succeeded)
      if (!result.graphifyResult.failed) {
        await applyPhaseCheckpoint();
        try {
          const explorerResult = installManagedSkill("graphify-explorer", plan.target);
          if (explorerResult === "created") {
            result.graphifyResult.explorerSkillInstalled = true;
          } else if (explorerResult === "already_active") {
            result.graphifyResult.explorerSkillUnchanged = true;
          } else {
            // conflict — should not happen since we preflighted, but handle gracefully
            result.graphifyResult.failed = true;
            result.graphifyResult.failedStep = "graphify-explorer skill";
            result.graphifyResult.failedHint =
              "Could not install graphify-explorer skill (conflict).";
          }
        } catch (err) {
          result.graphifyResult.failed = true;
          result.graphifyResult.failedStep = "graphify-explorer skill";
          result.graphifyResult.failedHint =
            err instanceof Error ? err.message : String(err);
        }
      }
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

  // Validate skill templates before installing skills
  const skillTemplateErrors = validateAllSkillTemplates();
  if (skillTemplateErrors.length > 0) {
    printError(
      `   Malformed skill template detected:`
    );
    for (const err of skillTemplateErrors) {
      console.error(`     • ${err}`);
    }
    console.error(
      `\n   Fix the skill template files and re-run init.\n`
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

  // Scan skill state for conflicts (core skills only; optional skills are handled
  // by the dedicated `skills` command, not by init)
  const allSkillStatuses = listManagedSkillStatuses(target);
  const coreSkillStatuses = allSkillStatuses.filter((s) => s.kind === "core");
  const conflictSkills = coreSkillStatuses.filter((s) => s.state === "conflict");

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
    skillStatuses: coreSkillStatuses,
    selectedOptionalSkills: [],
    graphifyAccepted: false,
    graphifyConflict: false,
    architectureReconciliations: [],
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

  // Active Architect is always retained/reconciled. A missing Architect is
  // desired only when the existing agent-selection flow selected it. Both
  // architecture core skills are mandatory desired targets on every init.
  const architectStatus = statuses.find((status) => status.name === "architect");
  const architectDesired = architectStatus?.state === "active" ||
    (plan.agentChanges?.toInstall.includes("architect") ?? false);
  const architectReconciliation = planArchitectReconciliation(target, architectDesired);
  plan.architectureReconciliations = [
    ...(architectReconciliation ? [architectReconciliation] : []),
    ...CORE_SKILLS.map((skillName) => planCoreSkillReconciliation(skillName, target)),
  ];

  // Step 3b: Optional skill selection (AC-03, AC-04)
  // Core skills are auto-installed; optional skills are unchecked by default.
  // --yes must NOT install optional skills by surprise.
  // Conflicting (unmarked) optional skills are excluded from selection.
  const optionalSkillStatuses = allSkillStatuses.filter((s) => s.kind === "optional");
  const optionalConflictSkills = optionalSkillStatuses.filter((s) => s.state === "conflict");
  const selectableOptionalSkills = optionalSkillStatuses.filter((s) => s.state !== "conflict");
  const SKIP_OPTIONAL_SKILLS_VALUE = "__skip_optional_skills__";

  if (optionalConflictSkills.length > 0) {
    printWarning(
      `Conflicting optional skills (manual files without managed marker): ${optionalConflictSkills
        .map((s) => s.name)
        .join(", ")}`
    );
    console.log(
      "     They cannot be managed here. Resolve manually or add the marker.\n"
    );
  }

  if (selectableOptionalSkills.length > 0 && !options.yes) {
    const skillSelection = await uiSelect<string>(
      "Optional skills:",
      [
        {
          value: "__select__",
          name: "Select optional skills to install...",
          description: `${selectableOptionalSkills.filter((s) => s.state === "active").length} active, ${selectableOptionalSkills.filter((s) => s.state === "missing").length} available`,
        },
        {
          value: SKIP_OPTIONAL_SKILLS_VALUE,
          name: dimText("Skip for now"),
        },
      ]
    );

    if (skillSelection !== SKIP_OPTIONAL_SKILLS_VALUE) {
      const selectedSkillNames = await uiCheckbox<string>(
        "Select optional skills to install (space to toggle, enter to confirm):",
        selectableOptionalSkills.map((skill) => ({
          value: skill.name as string,
          name: skill.name,
          checked: false, // missing optional skills are unchecked by default
        })),
        { required: false }
      );

      const selectedSet = new Set(selectedSkillNames);
      plan.selectedOptionalSkills = selectableOptionalSkills.filter((s) =>
        selectedSet.has(s.name)
      );
    }
  }

  // Step 3c: Graphify integration prompt
  // Appears after optional skills and before profiles. Defaults to no.
  // --with-graphify accepts without prompt; --yes alone does not accept.
  if (options.withGraphify) {
    plan.graphifyAccepted = true;
  } else if (!options.yes && !options.dryRun) {
    const graphifyChoice = await uiConfirmWithCancel(
      "Graphify can improve repository exploration by generating a local code graph. Install optional Graphify integration?",
      { default: false }
    );
    if (graphifyChoice) {
      plan.graphifyAccepted = true;
    }
  }

  // Check for conflicting unmarked graphify-explorer skill
  if (plan.graphifyAccepted) {
    const graphifySkillState = getSkillState("graphify-explorer", target);
    if (graphifySkillState === "conflict") {
      plan.graphifyConflict = true;
    }
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
      (s.state === "active" ||
        (plan.agentChanges &&
          (plan.agentChanges.toInstall.includes(s.name) ||
            plan.agentChanges.toRestore.includes(s.name)))) &&
      !(s.name === "architect" && plan.architectureReconciliations.some(
        (entry) => entry.name === "architect" && entry.action === "conflict"
      ))
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
    const unchangedArchitecture = plan.architectureReconciliations.filter(
      (entry) => entry.action === "unchanged"
    );
    const conflictArchitecture = plan.architectureReconciliations.filter(
      (entry) => entry.action === "conflict"
    );
    if (unchangedArchitecture.length > 0 || conflictArchitecture.length > 0) {
      const noOpArchitectureLines: SummaryLine[] = [
        ...unchangedArchitecture.map((entry) => ({
          label: "Unchanged:",
          value: `${entry.name} — ${entry.path}`,
          color: "dim" as const,
        })),
        ...conflictArchitecture.map((entry) => ({
          label: "Skipped conflict:",
          value: `${entry.name} — ${entry.path}${entry.reason ? ` (${entry.reason})` : ""}`,
          color: "red" as const,
        })),
      ];
      printSummary(noOpArchitectureLines);
      console.log(
        `   Architecture summary: 0 created, 0 updated, ${unchangedArchitecture.length} unchanged, ` +
        `${conflictArchitecture.length} skipped conflict, 0 failed.`
      );
    }
    printArchitectureUnchanged();
    return;
  }

  // Step 7: Final confirm/apply (AC-08, AC-13, AC-39)
  if (options.dryRun) {
    console.log(`\n   ${messages.DRY_RUN_LABEL} No files were modified.\n`);
    printArchitectureUnchanged();
    return;
  }

  if (!options.yes) {
    const proceed = await uiConfirmWithCancel(messages.APPLY_CHANGES, {
      default: true,
    });

    if (!proceed) {
      printCancelled();
      printArchitectureUnchanged();
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
  if (applyResult.optionalSkillResult.installed.length > 0) {
    resultLines.push({
      label: "Optional skills installed:",
      value: applyResult.optionalSkillResult.installed.join(", "),
      color: "green",
    });
  }
  if (applyResult.optionalSkillResult.conflicts.length > 0) {
    resultLines.push({
      label: "Optional skill conflicts:",
      value: applyResult.optionalSkillResult.conflicts.join(", "),
      color: "red",
    });
  }

  // Graphify results
  if (!applyResult.graphifyResult.skipped) {
    if (applyResult.graphifyResult.cliAlreadyPresent) {
      resultLines.push({
        label: "Graphify CLI:",
        value: "already installed",
        color: "dim",
      });
    } else if (applyResult.graphifyResult.cliInstalled) {
      resultLines.push({
        label: "Graphify CLI:",
        value: "installed",
        color: "green",
      });
    }
    if (applyResult.graphifyResult.officialSkillInstalled) {
      resultLines.push({
        label: "Graphify skill:",
        value: "installed (official OpenCode skill)",
        color: "green",
      });
    }
    if (applyResult.graphifyResult.explorerSkillInstalled) {
      resultLines.push({
        label: "Graphify explorer:",
        value: "installed (graphify-explorer)",
        color: "green",
      });
    } else if (applyResult.graphifyResult.explorerSkillUnchanged) {
      resultLines.push({
        label: "Graphify explorer:",
        value: "already installed",
        color: "dim",
      });
    }
    if (applyResult.graphifyResult.failed) {
      resultLines.push({
        label: "Graphify error:",
        value: applyResult.graphifyResult.failedHint ?? "installation failed",
        color: "red",
      });
    }
  } else if (applyResult.graphifyResult.failed) {
    // Conflict case — skipped with error
    resultLines.push({
      label: "Graphify:",
      value: "skipped — graphify-explorer conflict",
      color: "red",
    });
  }

  // Architecture results are reported per file, including unchanged and
  // preserved conflicts, followed by aggregate counts.
  for (const item of applyResult.architectureResult.created) {
    resultLines.push({ label: "Created:", value: `${item.name} — ${item.path}`, color: "green" });
  }
  for (const item of applyResult.architectureResult.updated) {
    resultLines.push({ label: "Updated:", value: `${item.name} — ${item.path}`, color: "green" });
  }
  for (const item of applyResult.architectureResult.unchanged) {
    resultLines.push({ label: "Unchanged:", value: `${item.name} — ${item.path}`, color: "dim" });
  }
  for (const item of applyResult.architectureResult.conflicts) {
    resultLines.push({
      label: "Skipped conflict:",
      value: `${item.name} — ${item.path}${item.reason ? ` (${item.reason})` : ""}`,
      color: "red",
    });
  }
  for (const item of applyResult.architectureResult.failed) {
    resultLines.push({
      label: "Failed:",
      value: `${item.name} — ${item.path} (${item.error})`,
      color: "red",
    });
  }
  if (applyResult.architectureResult.created.length > 0 ||
      applyResult.architectureResult.updated.length > 0 ||
      applyResult.architectureResult.unchanged.length > 0 ||
      applyResult.architectureResult.conflicts.length > 0 ||
      applyResult.architectureResult.failed.length > 0) {
    const ar = applyResult.architectureResult;
    resultLines.push({
      label: "Architecture summary:",
      value: `${ar.created.length} created, ${ar.updated.length} updated, ` +
        `${ar.unchanged.length} unchanged, ${ar.conflicts.length} skipped conflict, ` +
        `${ar.failed.length} failed.`,
      color: ar.failed.length > 0 || ar.conflicts.length > 0 ? "yellow" : "dim",
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

  if (applyResult.graphifyResult.failed && applyResult.graphifyResult.failedHint) {
    printWarning(
      `Graphify installation partially failed. ${applyResult.graphifyResult.failedHint}`
    );
  }

  if (applyResult.architectureResult.failed.length > 0) {
    printWarning(
      "Architecture reconciliation partially failed. Completed paths are listed above; " +
      "re-run init to retry failed paths."
    );
  }

  printPaths(target);
  printNextStep(messages.NEXT_STEP_MODELS);
  const wroteArchitecture =
    applyResult.architectureResult.created.length > 0 ||
    applyResult.architectureResult.updated.length > 0;
  const wroteOtherChanges =
    applyResult.agentResult.installed.length > 0 ||
    applyResult.agentResult.restored.length > 0 ||
    applyResult.profileResult.applied.length > 0 ||
    applyResult.modelResult.configured.length > 0 ||
    applyResult.skillResult.installed.length > 0 ||
    applyResult.optionalSkillResult.installed.length > 0 ||
    applyResult.graphifyResult.cliInstalled ||
    applyResult.graphifyResult.officialSkillInstalled ||
    applyResult.graphifyResult.explorerSkillInstalled;
  if (wroteArchitecture || wroteOtherChanges) {
    printRestartWarning();
  } else {
    printArchitectureUnchanged();
  }
}
