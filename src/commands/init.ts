import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveTarget,
  type InstallScope,
  type InstallTarget,
  CORE_SKILLS,
} from "../lib/paths.js";
import { createOrMergeConfig, ensureConfigStructure } from "../lib/config.js";
import {
  listManagedAgentStatuses,
  detectManageableScopes,
  computeAgentChanges,
  applyAgentChanges,
  type ManagedAgentStatus,
  type AgentChanges,
  type AgentApplyError,
  planCustomAgentReconciliation,
  applyCustomAgentReconciliation,
  type CustomAgentReconciliation,
} from "../lib/agents.js";
import {
  PROFILES,
  getProfile,
  discoverProfileState,
  type ProfileName,
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
  planManagedSkillReconciliation,
  applyManagedSkillReconciliation,
  type ManagedSkillReconciliation,
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
// Core skills are auto-installed; optional skills are user-selectable with
// installed items preselected. Skip preserves the current state, and --yes
// does not install missing optional skills by surprise.
// ---------------------------------------------------------------------------

const PATCHABLE_DEFS = [
  { name: "developer", variant: "dev" as const },
  { name: "reviewer", variant: "readonly" as const },
  { name: "auditor", variant: "readonly" as const },
];

type ConfigReconciliationAction = "create" | "replace" | "unchanged" | "conflict";
type ConfigApplyAction = ConfigReconciliationAction | "failed";

interface ConfigReconciliation {
  path: string;
  action: ConfigReconciliationAction;
  reason?: string;
}

function planConfigReconciliation(configPath: string): ConfigReconciliation {
  if (!existsSync(configPath)) {
    return { path: configPath, action: "create" };
  }

  try {
    const before = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const normalized = ensureConfigStructure(before);
    return {
      path: configPath,
      action: JSON.stringify(before) === JSON.stringify(normalized) ? "unchanged" : "replace",
    };
  } catch (error) {
    return {
      path: configPath,
      action: "conflict",
      reason: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Init plan: collected from all steps before any writes
// ---------------------------------------------------------------------------

interface InitPlan {
  agentChanges: AgentChanges | null;
  configReconciliation: ConfigReconciliation;
  customAgentReconciliations: CustomAgentReconciliation[];
  selectedProfiles: string[];
  profilesManaged: boolean;
  modelAssignments: { agent: ManagedAgentStatus; model: string }[];
  target: InstallTarget;
  skillStatuses: ManagedSkillStatus[];
  selectedOptionalSkills: ManagedSkillStatus[];
  optionalSkillsManaged: boolean;
  skillReconciliations: ManagedSkillReconciliation[];
  graphifyAccepted: boolean;
  graphifyConflict: boolean;
  architectureReconciliations: (CustomAgentReconciliation | ManagedSkillReconciliation)[];
}

interface InitApplyResult {
  applyFailures: { path: string; error: string }[];
  configChanged: boolean;
  configResult?: { action: ConfigApplyAction; path: string; error?: string };
  agentResult: {
    installed: string[];
    deleted: string[];
    restored: string[];
    hidden: string[];
    unchanged: string[];
    conflicts: string[];
  };
  customAgentResult: {
    created: string[];
    replaced: string[];
    removed: string[];
    unchanged: string[];
    conflicts: string[];
    failed: { name: string; path: string; error: string }[];
  };
  profileResult: {
    applied: string[];
    skipped: string[];
    failed: string[];
  };
  modelResult: {
    configured: { agent: string; model: string }[];
    unchanged: { agent: string; model: string }[];
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
    removed: { name: string; path: string }[];
    conflicts: { name: string; path: string; reason?: string }[];
    failed: { name: string; path: string; error: string }[];
  };
  optionalSkillResult: {
    installed: string[];
    replaced: string[];
    removed: string[];
    unchanged: string[];
    conflicts: string[];
    failed: { name: string; path: string; error: string }[];
  };
  graphifyResult: {
    cliInstalled: boolean;
    cliAlreadyPresent: boolean;
    officialSkillInstalled: boolean;
    explorerSkillInstalled: boolean;
    explorerSkillAction?: "created" | "replaced";
    explorerSkillPath?: string;
    explorerSkillUnchanged: boolean;
    explorerConflict: boolean;
    skipped: boolean;
    failed: boolean;
    failedStep?: string;
    failedHint?: string;
    failedPath?: string;
  };
}

interface InitApplyError extends Error {
  partialResult: InitApplyResult;
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

  const actionLabel = (action: string): string => {
    if (action === "conflict") return "Skipped conflict";
    if (action === "replace" || action === "update") return "Replace";
    if (action === "remove") return "Remove";
    if (action === "create") return "Create";
    return "Unchanged";
  };

  const actionColor = (action: string): "green" | "yellow" | "red" | "dim" =>
    action === "conflict"
      ? "red"
      : action === "unchanged"
        ? "dim"
        : action === "remove"
          ? "yellow"
          : "green";

  const managedPlanEntries = [
    ...plan.customAgentReconciliations,
    ...plan.architectureReconciliations,
    ...plan.skillReconciliations,
  ];

  // Show every path and action before the single approval boundary.
  lines.push({
    label: "Plan:",
    value: `${actionLabel(plan.configReconciliation.action)} ${plan.configReconciliation.path}${plan.configReconciliation.reason ? ` (${plan.configReconciliation.reason})` : ""}`,
    color: actionColor(plan.configReconciliation.action),
  });
  for (const entry of managedPlanEntries) {
    lines.push({
      label: "Plan:",
      value: `${actionLabel(entry.action)} ${entry.name} — ${entry.path}${entry.reason ? ` (${entry.reason})` : ""}`,
      color: actionColor(entry.action),
    });
  }

  // Agent changes
  if (plan.agentChanges) {
    const ac = plan.agentChanges;
    if (ac.toRestore.length > 0) {
      lines.push({
        label: "Restore:",
        value: `${ac.toRestore.join(", ")} — ${plan.target.configPath}`,
        color: "green",
      });
    }
    if (ac.toHide.length > 0) {
      lines.push({
        label: "Hide:",
        value: `${ac.toHide.join(", ")} — ${plan.target.configPath}`,
        color: "yellow",
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

  if (plan.customAgentReconciliations.some((entry) => entry.action === "replace") ||
      plan.architectureReconciliations.some((entry) => entry.action === "replace") ||
      plan.skillReconciliations.some((entry) => entry.action === "replace")) {
    lines.push({
      label: "Architecture warning:",
      value: "Marked managed definitions will be replaced; only supported model/profile state is preserved.",
      color: "yellow",
    });
  }

  // Profile changes
  if (plan.profilesManaged) {
    const profileLabels = plan.selectedProfiles.map(
      (name) => getProfile(name)?.label ?? name
    );
    lines.push({
      label: "Profiles:",
      value: profileLabels.length > 0 ? profileLabels.join(", ") : "explicit empty target",
      color: "green",
    });
  } else {
    lines.push({
      label: "Profiles:",
      value: "skipped (preserving current per-agent state)",
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

  const optionalManaged = plan.skillReconciliations.filter((entry) =>
    plan.selectedOptionalSkills.some((skill) => skill.name === entry.name)
  );
  if (plan.optionalSkillsManaged) {
    lines.push({
      label: "Optional skills:",
      value: optionalManaged.length > 0
        ? optionalManaged.map((entry) => `${actionLabel(entry.action)} ${entry.name}`).join(", ")
        : "explicit empty target",
      color: optionalManaged.some((entry) => entry.action === "conflict") ? "red" : "green",
    });
  } else {
    lines.push({
      label: "Optional skills:",
      value: "skipped (preserving current state)",
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
      plan.agentChanges.toRestore.length > 0 ||
      plan.agentChanges.toHide.length > 0);

  const hasDefinitionChanges = [
    ...plan.customAgentReconciliations,
    ...plan.architectureReconciliations,
    ...plan.skillReconciliations,
  ].some((entry) => ["create", "replace", "update", "remove"].includes(entry.action));
  const hasConfigChanges = ["create", "replace"].includes(plan.configReconciliation.action);

  return (
    hasAgentChanges ||
    hasDefinitionChanges ||
    hasConfigChanges ||
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
    applyFailures: [],
    configChanged: false,
    agentResult: { installed: [], deleted: [], restored: [], hidden: [], unchanged: [], conflicts: [] },
    customAgentResult: {
      created: [],
      replaced: [],
      removed: [],
      unchanged: [],
      conflicts: [],
      failed: [],
    },
    profileResult: { applied: [], skipped: [], failed: [] },
    modelResult: { configured: [], unchanged: [], failed: [] },
    skillResult: { installed: [], unchanged: [], conflicts: [] },
    architectureResult: {
      created: [],
      updated: [],
      unchanged: [],
      removed: [],
      conflicts: [],
      failed: [],
    },
    optionalSkillResult: { installed: [], replaced: [], removed: [], unchanged: [], conflicts: [], failed: [] },
    graphifyResult: {
      cliInstalled: false,
      cliAlreadyPresent: false,
      officialSkillInstalled: false,
      explorerSkillInstalled: false,
      explorerSkillUnchanged: false,
      explorerConflict: false,
      skipped: true,
      failed: false,
    },
  };

  try {
    const appliedCustom = new Map<string, string>();

  // 1. Apply built-in agent visibility changes. Custom agents are handled by
  // canonical reconciliation below, never by the legacy install-only helper.
  if (plan.agentChanges) {
    await applyPhaseCheckpoint();

    // Ensure agent directory exists
    if (!existsSync(plan.target.agentDir)) {
      mkdirSync(plan.target.agentDir, { recursive: true });
    }

    await applyPhaseCheckpoint();

    try {
      const agentResult = applyAgentChanges(plan.agentChanges, plan.target);
      result.agentResult = {
        installed: agentResult.installed,
        deleted: agentResult.deleted,
        restored: agentResult.restored,
        hidden: agentResult.hidden,
        unchanged: agentResult.unchanged,
        conflicts: agentResult.conflicts,
      };
    } catch (error) {
      const agentError = error as Partial<AgentApplyError>;
      if (agentError.partialResult && agentError.failure) {
        result.agentResult = agentError.partialResult;
        result.applyFailures.push({
          path: `${plan.target.configPath} (${agentError.failure.action} ${agentError.failure.name})`,
          error: agentError.failure.error,
        });
      } else {
        result.applyFailures.push({
          path: plan.target.configPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // 2. Reconcile every selected/retained custom agent from its current
  // canonical template plus supported model/profile state.
  for (const entry of plan.customAgentReconciliations) {
    await applyPhaseCheckpoint();
    try {
      const applied = applyCustomAgentReconciliation(entry, plan.target);
      appliedCustom.set(entry.name, applied);
      if (applied === "create") result.customAgentResult.created.push(entry.name);
      else if (applied === "replace") result.customAgentResult.replaced.push(entry.name);
      else if (applied === "remove") result.customAgentResult.removed.push(entry.name);
      else if (applied === "unchanged") result.customAgentResult.unchanged.push(entry.name);
      else result.customAgentResult.conflicts.push(entry.name);
    } catch (error) {
      result.customAgentResult.failed.push({
        name: entry.name,
        path: entry.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 3. Reconcile Architect and mandatory core skills through the same
  // marker-safe canonical helpers.
  await applyPhaseCheckpoint();
  for (const entry of plan.architectureReconciliations) {
    await applyPhaseCheckpoint();
    try {
      const applied = entry.name === "architect"
        ? applyCustomAgentReconciliation(entry as CustomAgentReconciliation, plan.target)
        : applyManagedSkillReconciliation(entry as ManagedSkillReconciliation, plan.target);

      if (applied === "create") {
        result.architectureResult.created.push({ name: entry.name, path: entry.path });
        if (entry.name !== "architect") result.skillResult.installed.push(entry.name);
        if (entry.name === "architect") appliedCustom.set(entry.name, applied);
      } else if (applied === "replace") {
        result.architectureResult.updated.push({ name: entry.name, path: entry.path });
        if (entry.name === "architect") appliedCustom.set(entry.name, applied);
      } else if (applied === "remove") {
        result.architectureResult.removed.push({ name: entry.name, path: entry.path });
        if (entry.name === "architect") appliedCustom.set(entry.name, applied);
      } else if (applied === "unchanged") {
        result.architectureResult.unchanged.push({ name: entry.name, path: entry.path });
        if (entry.name !== "architect") result.skillResult.unchanged.push(entry.name);
        if (entry.name === "architect") appliedCustom.set(entry.name, applied);
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

  // 4. Reconcile optional skills and installed-only Graphify Explorer.
  await applyPhaseCheckpoint();
  for (const skill of plan.skillReconciliations) {
    await applyPhaseCheckpoint();
    try {
      const applied = applyManagedSkillReconciliation(skill, plan.target);
      if (skill.name === "graphify-explorer") {
        if (applied === "replace" || applied === "create") {
          result.graphifyResult.explorerSkillInstalled = true;
          result.graphifyResult.explorerSkillAction = applied === "create" ? "created" : "replaced";
          result.graphifyResult.explorerSkillPath = skill.path;
        } else if (applied === "unchanged") {
          result.graphifyResult.explorerSkillUnchanged = true;
          result.graphifyResult.explorerSkillPath = skill.path;
        } else if (applied === "conflict") {
          result.graphifyResult.explorerConflict = true;
          result.graphifyResult.failedPath = skill.path;
        }
      } else if (applied === "create") {
        result.optionalSkillResult.installed.push(skill.name);
      } else if (applied === "replace") {
        result.optionalSkillResult.replaced.push(skill.name);
      } else if (applied === "remove") {
        result.optionalSkillResult.removed.push(skill.name);
      } else if (applied === "unchanged") {
        result.optionalSkillResult.unchanged.push(skill.name);
      } else {
        result.optionalSkillResult.conflicts.push(skill.name);
      }
    } catch (error) {
      if (skill.name === "graphify-explorer") {
        result.graphifyResult.failed = true;
        result.graphifyResult.failedStep = "graphify-explorer";
        result.graphifyResult.failedPath = skill.path;
        result.graphifyResult.failedHint = error instanceof Error ? error.message : String(error);
      } else {
        result.optionalSkillResult.failed.push({
          name: skill.name,
          path: skill.path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // 5. Preserve the existing explicit Graphify integration path. The generic
  // reconciliation above never creates a missing explorer copy unless this
  // explicit option authorizes the external installation flow.
  if (plan.graphifyAccepted) {
    await applyPhaseCheckpoint();

    if (plan.graphifyConflict) {
      // Conflicting unmarked graphify-explorer file — skip all Graphify steps
      result.graphifyResult.skipped = true;
      result.graphifyResult.explorerConflict = true;
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
            result.graphifyResult.explorerSkillAction = "created";
            result.graphifyResult.explorerSkillPath = join(
              plan.target.skillDir,
              "graphify-explorer",
              "SKILL.md"
            );
          } else if (explorerResult === "already_active") {
            result.graphifyResult.explorerSkillUnchanged = true;
            result.graphifyResult.explorerSkillPath = join(
              plan.target.skillDir,
              "graphify-explorer",
              "SKILL.md"
            );
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

  // 6. Create or merge config
  await applyPhaseCheckpoint();
  try {
    const beforeConfig = existsSync(plan.target.configPath)
      ? readFileSync(plan.target.configPath, "utf-8")
      : undefined;
    createOrMergeConfig(plan.target.configPath);
    const afterConfig = readFileSync(plan.target.configPath, "utf-8");
    if (beforeConfig === undefined) {
      result.configChanged = true;
      result.configResult = { action: "create", path: plan.target.configPath };
    } else {
      try {
        result.configChanged = JSON.stringify(JSON.parse(beforeConfig)) !==
          JSON.stringify(JSON.parse(afterConfig));
      } catch {
        result.configChanged = beforeConfig !== afterConfig;
      }
      result.configResult = {
        action: result.configChanged ? "replace" : "unchanged",
        path: plan.target.configPath,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.configResult = {
      action: "failed",
      path: plan.target.configPath,
      error: errorMessage,
    };
    result.applyFailures.push({
      path: plan.target.configPath,
      error: errorMessage,
    });
  }

  // Report profile outcomes from the canonical agent writes. No additive
  // second pass is used, preventing stale or duplicate snippets.
  if (plan.profilesManaged) {
    for (const profileName of plan.selectedProfiles) {
      const label = getProfile(profileName)?.label ?? profileName;
      const affected = plan.customAgentReconciliations.some((entry) =>
        entry.desiredProfiles.includes(profileName) &&
        ["create", "replace", "unchanged"].includes(appliedCustom.get(entry.name) ?? "")
      );
      if (affected) result.profileResult.applied.push(label);
      else result.profileResult.failed.push(label);
    }
  }

  // 7. Apply explicit model assignments. Custom-agent models were composed
  // into their canonical writes; built-ins still use config state.
  await applyPhaseCheckpoint();
  for (const assignment of plan.modelAssignments) {
    await applyPhaseCheckpoint();

    try {
      if (assignment.agent.kind === "custom") {
        const applied = appliedCustom.get(assignment.agent.name);
        if (["create", "replace"].includes(applied ?? "")) {
          result.modelResult.configured.push({ agent: assignment.agent.name, model: assignment.model });
        } else if (applied === "unchanged") {
          result.modelResult.unchanged.push({ agent: assignment.agent.name, model: assignment.model });
        } else {
          throw new Error("custom agent reconciliation did not complete");
        }
      } else {
        setCurrentModel(assignment.agent, plan.target, assignment.model);
        result.modelResult.configured.push({ agent: assignment.agent.name, model: assignment.model });
      }
    } catch {
      result.modelResult.failed.push(assignment.agent.name);
    }
  }

    return result;
  } catch (error) {
    if (error instanceof CancellationError) {
      Object.assign(error, { partialResult: result });
    }
    throw error;
  }
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

  // Scan all managed skill state for conflicts; optional skills are handled here
  // as part of the same desired-state flow.
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
    configReconciliation: planConfigReconciliation(target.configPath),
    customAgentReconciliations: [],
    selectedProfiles: [],
    profilesManaged: false,
    modelAssignments: [],
    target,
    skillStatuses: coreSkillStatuses,
    selectedOptionalSkills: [],
    optionalSkillsManaged: false,
    skillReconciliations: [],
    graphifyAccepted: false,
    graphifyConflict: false,
    architectureReconciliations: [],
  };

  // Step 3: Agent selection (AC-01, AC-10, AC-11)
  // Skip preserves the current state. An explicit checkbox selection is
  // authoritative, including an empty selection. --yes uses current active
  // state and never infers removals.
  const agentChoices = statuses.map((agent) => {
    const isDefaultChecked = agent.state === "active";

    return {
      value: agent.name,
      name: buildAgentRow(agent, { showGlyph: true }),
      checked: isDefaultChecked,
      disabled: agent.state === "conflict" ? "Skipped conflict" : false,
    };
  });

  const SKIP_AGENTS_VALUE = "__skip_agents__";
  const currentActiveNames = new Set(
    statuses.filter((status) => status.state === "active").map((status) => status.name)
  );
  let targetActiveNames = new Set(currentActiveNames);

  if (!options.yes) {
    const agentSelection = await uiSelect<string>(
      "Agent installation:",
      [
        {
          value: "__select__",
          name: "Select agents to activate/deactivate...",
          description: `${statuses.filter((s) => s.state === "active").length} active, ${statuses.filter((s) => s.state === "missing").length} missing, ${statuses.filter((s) => s.state === "hidden").length} hidden`,
        },
        {
          value: SKIP_AGENTS_VALUE,
          name: dimText("Skip for now (preserve current state)"),
        },
      ]
    );

    if (agentSelection !== SKIP_AGENTS_VALUE) {
      const selectedNames = await uiCheckbox<string>(
        "Select agents to activate (space to toggle, enter to confirm):",
        agentChoices,
        { required: false }
      );
      targetActiveNames = new Set(
        selectedNames.filter((name) => !conflictAgents.some((agent) => agent.name === name))
      );
      plan.agentChanges = computeAgentChanges(
        statuses.filter((status) => status.kind === "builtin"),
        targetActiveNames
      );
    }
  }

  // Step 3b: Optional skill selection (AC-02, AC-07, AC-11)
  // Installed optional skills are preselected. Skip preserves them; an entered
  // empty checkbox selection explicitly removes all marked optional skills.
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

  let optionalSelectionManaged = false;
  let targetOptionalNames: Set<string> = new Set(
    optionalSkillStatuses.filter((skill) => skill.state === "active").map((skill) => skill.name)
  );

  if (selectableOptionalSkills.length > 0 && !options.yes) {
    const skillSelection = await uiSelect<string>(
      "Optional skills:",
      [
        {
          value: "__select__",
          name: "Select optional skills to activate/deactivate...",
          description: `${selectableOptionalSkills.filter((s) => s.state === "active").length} active, ${selectableOptionalSkills.filter((s) => s.state === "missing").length} available`,
        },
        {
          value: SKIP_OPTIONAL_SKILLS_VALUE,
          name: dimText("Skip for now (preserve current state)"),
        },
      ]
    );

    if (skillSelection !== SKIP_OPTIONAL_SKILLS_VALUE) {
      optionalSelectionManaged = true;
      plan.optionalSkillsManaged = true;
      const selectedSkillNames = await uiCheckbox<string>(
        "Select optional skills to activate (space to toggle, enter to confirm):",
        selectableOptionalSkills.map((skill) => ({
          value: skill.name as string,
          name: skill.name,
          checked: skill.state === "active",
        })),
        { required: false }
      );

      targetOptionalNames = new Set(selectedSkillNames);
    }
  }
  plan.selectedOptionalSkills = optionalSkillStatuses.filter((skill) =>
    targetOptionalNames.has(skill.name)
  );

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

  // Any existing Graphify Explorer conflict is reported even when external
  // Graphify installation is skipped; it remains outside adoption scope.
  const graphifyStatus = allSkillStatuses.find((status) => status.name === "graphify-explorer");
  if (graphifyStatus?.state === "conflict") {
    plan.graphifyConflict = true;
  }

  // Step 4: Profile selection (AC-04, AC-05, AC-13)
  // Skip preserves each selected agent's recognized set. Managing profiles
  // establishes one explicit target set across the selected patchable agents.
  const willBePatchable = PATCHABLE_DEFS.filter((def) =>
    targetActiveNames.has(def.name)
  );

  const SKIP_PROFILES_VALUE = "__skip_profiles__";

  if (willBePatchable.length > 0 && !options.yes) {
    const profileContents = willBePatchable.map((agent) => {
      const agentPath = join(target.agentDir, `${agent.name}.md`);
      return existsSync(agentPath) ? readFileSync(agentPath, "utf-8") : "";
    });
    const currentProfileState = discoverProfileState(profileContents);
    const profileSelection = await uiSelect<string>(
      "Stack profiles:",
      [
        {
          value: "__select__",
          name: "Manage stack profiles for selected agents...",
          description: `${willBePatchable.map((a) => a.name).join(", ")} current: ${currentProfileState.status}${currentProfileState.profiles.length > 0 ? ` (${currentProfileState.profiles.join(", ")})` : ""}`,
        },
        {
          value: SKIP_PROFILES_VALUE,
          name: dimText("Skip for now (preserve each agent's profiles)"),
        },
      ]
    );

    if (profileSelection !== SKIP_PROFILES_VALUE) {
      plan.profilesManaged = true;
      const selectedProfileNames = await uiCheckbox<ProfileName>(
        "Select the profile target for all selected agents (space to toggle, enter to confirm):",
        [
          ...PROFILES.map((p) => ({
            value: p.name as ProfileName,
            name: p.label,
            checked: currentProfileState.profiles.includes(p.name),
          })),
          {
            value: "__all__" as ProfileName,
            name: "All stacks (apply every profile above)",
          },
        ],
        { required: false }
      );

      plan.selectedProfiles = selectedProfileNames.includes("__all__")
        ? PROFILES.map((p) => p.name)
        : selectedProfileNames.filter((name) => name !== "__all__");
    }
  }

  // Step 5: Model configuration (AC-05, AC-06, AC-07)
  // Determine which agents are active for model config
  const activeModelAgents = statuses.filter(
    (s) =>
      targetActiveNames.has(s.name) && s.state !== "conflict"
  );

  const SKIP_MODELS_VALUE = "__skip_models__";
  const SKIP_ONE_MODEL_VALUE = "__skip_one_model__";

  if (activeModelAgents.length > 0 && !options.yes) {
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
  } else if (!options.yes) {
    console.log("   No active managed agents to configure models for.\n");
  }

  // Build canonical custom-agent targets only after explicit model choices are
  // known. Omitted profiles preserve each installed agent's recognized set.
  const modelByAgent = new Map(
    plan.modelAssignments.map((assignment) => [assignment.agent.name, assignment.model])
  );
  for (const status of statuses.filter((entry) => entry.kind === "custom")) {
    const profileTarget = plan.profilesManaged &&
      PATCHABLE_DEFS.some((agent) => agent.name === status.name)
      ? plan.selectedProfiles
      : undefined;
    const reconciliation = planCustomAgentReconciliation(status.name, target, {
      desired: targetActiveNames.has(status.name),
      profiles: profileTarget,
      model: modelByAgent.get(status.name),
    });
    if (!reconciliation) continue;
    if (status.name === "architect") {
      plan.architectureReconciliations.push(reconciliation);
    } else {
      plan.customAgentReconciliations.push(reconciliation);
    }
  }

  // Core skills are always desired and reconcile automatically.
  plan.architectureReconciliations.push(
    ...CORE_SKILLS.map((skillName) =>
      planManagedSkillReconciliation(skillName, target, {
        desired: true,
        createMissing: true,
      })
    )
  );

  // Optional skills are explicit targets only when their management UI was
  // entered. Skip and --yes retain active definitions and do not create absent
  // optional skills.
  for (const status of optionalSkillStatuses) {
    plan.skillReconciliations.push(
      planManagedSkillReconciliation(status.name, target, {
        desired: targetOptionalNames.has(status.name),
        createMissing: optionalSelectionManaged,
      })
    );
  }

  // Reconcile an installed managed Graphify Explorer but never adopt a missing
  // copy through normal init reconciliation.
  if (graphifyStatus && graphifyStatus.state !== "missing") {
    plan.skillReconciliations.push(
      planManagedSkillReconciliation("graphify-explorer", target, {
        createMissing: false,
      })
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
  let applyResult!: InitApplyResult;
  let applyInterrupted = false;
  try {
    applyResult = await withApplyPhaseSigint(() => applyPlan(plan, statuses));
  } catch (err) {
    if (err instanceof CancellationError) {
      const partialResult = (err as Partial<InitApplyError>).partialResult;
      if (partialResult) {
        // SIGINT received during writes — preserve and render outcomes already
        // completed before the checkpoint observed the interruption.
        applyResult = partialResult;
        applyInterrupted = true;
      } else {
        printWarning(messages.PARTIAL_STATE_WARNING);
        process.exit(1);
      }
    }
    if (!(err instanceof CancellationError)) {
      printError(`\n   Error during apply: ${err instanceof Error ? err.message : String(err)}`);
      printWarning(messages.PARTIAL_STATE_WARNING);
      process.exit(1);
    }
  }

  // Step 8: Print results
  if (!applyInterrupted) printComplete("Installation");

  const resultLines: SummaryLine[] = [];

  if (applyResult.configResult) {
    const configAction = applyResult.configResult.action[0].toUpperCase() +
      applyResult.configResult.action.slice(1);
    resultLines.push({
      label: "Config:",
      value: `${configAction} ${applyResult.configResult.path}${applyResult.configResult.error ? ` (${applyResult.configResult.error})` : ""}`,
      color: applyResult.configResult.action === "failed" ? "red" :
        applyResult.configResult.action === "unchanged" ? "dim" : "green",
    });
  }

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
      value: `${applyResult.agentResult.restored.join(", ")} — ${plan.target.configPath}`,
      color: "green",
    });
  }
  if (applyResult.agentResult.hidden.length > 0) {
    resultLines.push({
      label: "Hidden:",
      value: `${applyResult.agentResult.hidden.join(", ")} — ${plan.target.configPath}`,
      color: "yellow",
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
      label: "Models written:",
      value: applyResult.modelResult.configured
        .map((m) => `${m.agent} → ${m.model}`)
        .join(", "),
      color: "green",
    });
  }
  if (applyResult.modelResult.unchanged.length > 0) {
    resultLines.push({
      label: "Models unchanged:",
      value: applyResult.modelResult.unchanged
        .map((m) => `${m.agent} → ${m.model}`)
        .join(", "),
      color: "dim",
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
  const optionalSkillPath = (name: string): string =>
    plan.skillReconciliations.find((entry) => entry.name === name)?.path ??
    join(plan.target.skillDir, name, "SKILL.md");
  for (const name of applyResult.optionalSkillResult.installed) {
    resultLines.push({
      label: "Optional skill installed:",
      value: `${name} — ${optionalSkillPath(name)}`,
      color: "green",
    });
  }
  for (const name of applyResult.optionalSkillResult.replaced) {
    resultLines.push({
      label: "Optional skill replaced:",
      value: `${name} — ${optionalSkillPath(name)}`,
      color: "green",
    });
  }
  for (const name of applyResult.optionalSkillResult.removed) {
    resultLines.push({
      label: "Optional skill removed:",
      value: `${name} — ${optionalSkillPath(name)}`,
      color: "yellow",
    });
  }
  for (const name of applyResult.optionalSkillResult.unchanged) {
    resultLines.push({
      label: "Optional skill unchanged:",
      value: `${name} — ${optionalSkillPath(name)}`,
      color: "dim",
    });
  }
  for (const name of applyResult.optionalSkillResult.conflicts) {
    const entry = plan.skillReconciliations.find((candidate) => candidate.name === name);
    resultLines.push({
      label: "Optional skill conflict:",
      value: `${name} — ${entry?.path ?? optionalSkillPath(name)}${entry?.reason ? ` (${entry.reason})` : ""}`,
      color: "red",
    });
  }
  for (const failure of applyResult.optionalSkillResult.failed) {
    resultLines.push({
      label: "Optional skill failed:",
      value: `${failure.name} — ${failure.path} (${failure.error})`,
      color: "red",
    });
  }

  // Graphify results
  const explorerPath =
    applyResult.graphifyResult.explorerSkillPath ??
    plan.skillReconciliations.find((entry) => entry.name === "graphify-explorer")?.path ??
    join(plan.target.skillDir, "graphify-explorer", "SKILL.md");
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
  }
  if (applyResult.graphifyResult.explorerSkillInstalled) {
    resultLines.push({
      label: "Graphify explorer:",
      value: `${applyResult.graphifyResult.explorerSkillAction ?? "created"} — ${explorerPath}`,
      color: "green",
    });
  } else if (applyResult.graphifyResult.explorerSkillUnchanged) {
    resultLines.push({
      label: "Graphify explorer:",
      value: `already installed — ${explorerPath}`,
      color: "dim",
    });
  }
  if (applyResult.graphifyResult.failed && applyResult.graphifyResult.failedPath) {
    resultLines.push({
      label: "Graphify Explorer failed:",
      value: `${applyResult.graphifyResult.failedPath ?? "graphify-explorer"}${applyResult.graphifyResult.failedHint ? ` (${applyResult.graphifyResult.failedHint})` : ""}`,
      color: "red",
    });
  } else if (applyResult.graphifyResult.failed) {
    resultLines.push({
      label: "Graphify error:",
      value: applyResult.graphifyResult.failedHint ?? "installation failed",
      color: "red",
    });
  }
  if (applyResult.graphifyResult.explorerConflict) {
    resultLines.push({
      label: "Skipped conflict:",
      value: `graphify-explorer — ${applyResult.graphifyResult.failedPath ?? explorerPath}`,
      color: "red",
    });
  }

  for (const name of applyResult.customAgentResult.created) {
    const path = plan.customAgentReconciliations.find((entry) => entry.name === name)?.path;
    resultLines.push({ label: "Created:", value: `agent ${name}${path ? ` — ${path}` : ""}`, color: "green" });
  }
  for (const name of applyResult.customAgentResult.replaced) {
    const path = plan.customAgentReconciliations.find((entry) => entry.name === name)?.path;
    resultLines.push({ label: "Replaced:", value: `agent ${name}${path ? ` — ${path}` : ""}`, color: "green" });
  }
  for (const name of applyResult.customAgentResult.removed) {
    const path = plan.customAgentReconciliations.find((entry) => entry.name === name)?.path;
    resultLines.push({ label: "Removed:", value: `agent ${name}${path ? ` — ${path}` : ""}`, color: "yellow" });
  }
  for (const name of applyResult.customAgentResult.conflicts) {
    const entry = plan.customAgentReconciliations.find((candidate) => candidate.name === name);
    resultLines.push({ label: "Skipped conflict:", value: `agent ${name} — ${entry?.path ?? "unknown path"}`, color: "red" });
  }
  for (const failure of applyResult.customAgentResult.failed) {
    resultLines.push({
      label: "Failed:",
      value: `agent ${failure.name} — ${failure.path} (${failure.error})`,
      color: "red",
    });
  }
  for (const failure of applyResult.applyFailures) {
    resultLines.push({
      label: "Failed:",
      value: `${failure.path} (${failure.error})`,
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
  for (const item of applyResult.architectureResult.removed) {
    resultLines.push({ label: "Removed:", value: `${item.name} — ${item.path}`, color: "yellow" });
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
       applyResult.architectureResult.removed.length > 0 ||
       applyResult.architectureResult.conflicts.length > 0 ||
      applyResult.architectureResult.failed.length > 0) {
    const ar = applyResult.architectureResult;
    resultLines.push({
      label: "Architecture summary:",
      value: `${ar.created.length} created, ${ar.updated.length} updated, ` +
       `${ar.unchanged.length} unchanged, ${ar.conflicts.length} skipped conflict, ` +
        `${ar.removed.length} removed, ` +
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

  if (
    applyResult.customAgentResult.failed.length > 0 ||
    applyResult.optionalSkillResult.failed.length > 0
  ) {
    printWarning(
      "Managed definition reconciliation partially failed. Completed and failed paths are listed above; " +
      "re-run init to retry failed paths."
    );
  }

  if (
    applyResult.customAgentResult.failed.length > 0 ||
    applyResult.optionalSkillResult.failed.length > 0 ||
    applyResult.architectureResult.failed.length > 0 ||
    applyResult.graphifyResult.failed ||
    applyResult.applyFailures.length > 0
  ) {
    printWarning(messages.PARTIAL_STATE_WARNING);
  }

  printPaths(target);
  printNextStep(messages.NEXT_STEP_MODELS);
  const wroteArchitecture =
    applyResult.architectureResult.created.length > 0 ||
    applyResult.architectureResult.updated.length > 0 ||
    applyResult.architectureResult.removed.length > 0;
  const wroteOtherChanges =
    applyResult.configChanged ||
    applyResult.agentResult.installed.length > 0 ||
    applyResult.agentResult.deleted.length > 0 ||
    applyResult.agentResult.restored.length > 0 ||
    applyResult.agentResult.hidden.length > 0 ||
    applyResult.customAgentResult.created.length > 0 ||
    applyResult.customAgentResult.replaced.length > 0 ||
    applyResult.customAgentResult.removed.length > 0 ||
    applyResult.modelResult.configured.length > 0 ||
    applyResult.modelResult.unchanged.length > 0 ||
    applyResult.skillResult.installed.length > 0 ||
    applyResult.optionalSkillResult.installed.length > 0 ||
    applyResult.optionalSkillResult.replaced.length > 0 ||
    applyResult.optionalSkillResult.removed.length > 0 ||
    applyResult.graphifyResult.cliInstalled ||
    applyResult.graphifyResult.officialSkillInstalled ||
    applyResult.graphifyResult.explorerSkillInstalled;
  if (wroteArchitecture || wroteOtherChanges) {
    printRestartWarning();
  } else {
    printArchitectureUnchanged();
  }

  if (applyInterrupted) {
    printWarning(messages.PARTIAL_STATE_WARNING);
    process.exit(1);
  }
}
