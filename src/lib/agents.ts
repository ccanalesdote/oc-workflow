/**
 * Managed agent domain module.
 *
 * Centralizes the catalog of agents that opencode-path manages, their
 * state detection, and mutate operations (install, delete, hide, restore).
 *
 * Managed catalog = custom workflow template agents + built-in "plan", "build", and "explore".
 * No agent is mandatory. External/manual agents are ignored.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { listTemplates, readTemplate } from "./templates.js";
import {
  isValidAgentModel,
  parseFrontmatter,
  setModelInContent,
} from "./frontmatter.js";
import type { PackAgentName } from "./paths.js";
import {
  readConfig,
  writeConfig,
  ensureConfigStructure,
  type OpenCodeConfig,
} from "./config.js";
import type { InstallTarget } from "./paths.js";

// ---------------------------------------------------------------------------
// Kinds and states
// ---------------------------------------------------------------------------

/** Whether a managed agent is custom (file-based) or built-in (config-based). */
export type ManagedAgentKind = "custom" | "builtin";

/** The current state of a managed agent at a given target. */
export type ManagedAgentState = "active" | "missing" | "hidden" | "conflict";

/** A managed agent entry in the catalog. */
export interface ManagedAgent {
  name: string;
  kind: ManagedAgentKind;
}

/** A managed agent with its resolved state at a specific target. */
export interface ManagedAgentStatus extends ManagedAgent {
  state: ManagedAgentState;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Built-in opencode agents that opencode-path manages visibility for. */
export const BUILTIN_MANAGED_AGENTS: readonly string[] = ["plan", "build", "explore"];

/** HTML comment marker injected into installed custom agent files. */
export const MANAGED_MARKER = "<!-- managed-by: opencode-path -->";

/** Reconciliation action for the managed Architect definition. */
export type ArchitectReconciliationAction =
  | "create"
  | "update"
  | "unchanged"
  | "conflict";

/** Planned canonical reconciliation for the managed Architect file. */
export interface ArchitectReconciliation {
  name: "architect";
  path: string;
  action: ArchitectReconciliationAction;
  expectedContent?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * Build the full managed agent catalog.
 * Custom agents come from the templates directory; built-ins are plan, build, and explore.
 * The catalog is ordered: custom first, then built-ins.
 */
export function listManagedCatalog(): ManagedAgent[] {
  const templates = listTemplates();
  const custom: ManagedAgent[] = templates.map((name) => ({
    name,
    kind: "custom" as const,
  }));
  const builtins: ManagedAgent[] = BUILTIN_MANAGED_AGENTS.map((name) => ({
    name,
    kind: "builtin" as const,
  }));
  return [...custom, ...builtins];
}

/**
 * Return only the custom managed agents from the catalog.
 */
export function listCustomManagedAgents(): ManagedAgent[] {
  return listManagedCatalog().filter((a) => a.kind === "custom");
}

/**
 * Return only the built-in managed agents from the catalog.
 */
export function listBuiltinManagedAgents(): ManagedAgent[] {
  return listManagedCatalog().filter((a) => a.kind === "builtin");
}

/**
 * Look up a managed agent by name. Returns undefined if not in the catalog.
 */
export function getManagedAgent(name: string): ManagedAgent | undefined {
  return listManagedCatalog().find((a) => a.name === name);
}

/**
 * Check if a given name is in the managed catalog.
 */
export function isManagedAgentName(name: string): boolean {
  return listManagedCatalog().some((a) => a.name === name);
}

/**
 * Check if a given name is a custom managed agent.
 */
export function isCustomManagedAgent(name: string): boolean {
  const agent = getManagedAgent(name);
  return agent?.kind === "custom";
}

/**
 * Check if a given name is a built-in managed agent.
 */
export function isBuiltinManagedAgent(name: string): boolean {
  return BUILTIN_MANAGED_AGENTS.includes(name);
}

// ---------------------------------------------------------------------------
// Marker detection
// ---------------------------------------------------------------------------

/**
 * Check whether file content contains the managed marker.
 */
export function contentHasManagedMarker(content: string): boolean {
  return content.includes(MANAGED_MARKER);
}

/**
 * Check whether a file at the given path contains the managed marker.
 * Returns false if the file does not exist.
 */
export function fileHasManagedMarker(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  try {
    const content = readFileSync(filePath, "utf-8");
    return contentHasManagedMarker(content);
  } catch {
    return false;
  }
}

/**
 * Add the managed marker to template content. The marker is appended at the
 * end of the file body (after the last line of the markdown content).
 */
export function addManagedMarker(content: string): string {
  // Don't add if already present
  if (contentHasManagedMarker(content)) return content;

  // Ensure content ends with a newline, then add marker
  const trimmed = content.endsWith("\n") ? content : content + "\n";
  return trimmed + MANAGED_MARKER + "\n";
}

function canonicalArchitectContent(): string {
  return addManagedMarker(readTemplate("architect"));
}

/**
 * Compare the installed managed Architect with the packaged canonical
 * definition. Only a valid, non-empty model is carried into the expected
 * content; all other marked drift is intentionally replaceable.
 */
export function planArchitectReconciliation(
  target: InstallTarget,
  desired = true
): ArchitectReconciliation | null {
  const filePath = join(target.agentDir, "architect.md");
  if (!desired) return null;

  if (!existsSync(filePath)) {
    return {
      name: "architect",
      path: filePath,
      action: "create",
      expectedContent: canonicalArchitectContent(),
    };
  }

  let installedContent: string;
  try {
    installedContent = readFileSync(filePath, "utf-8");
  } catch (error) {
    return {
      name: "architect",
      path: filePath,
      action: "conflict",
      reason: `cannot read file: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!contentHasManagedMarker(installedContent)) {
    return {
      name: "architect",
      path: filePath,
      action: "conflict",
      reason: "file has no managed marker",
    };
  }

  let expectedContent = canonicalArchitectContent();
  try {
    const { frontmatter } = parseFrontmatter(installedContent);
    if (Object.prototype.hasOwnProperty.call(frontmatter, "model")) {
      const model = frontmatter.model;
      if (!isValidAgentModel(model)) {
        return {
          name: "architect",
          path: filePath,
          action: "conflict",
          reason: "frontmatter model must be a non-empty string",
        };
      }
      expectedContent = setModelInContent(expectedContent, model);
    }
  } catch (error) {
    return {
      name: "architect",
      path: filePath,
      action: "conflict",
      reason: `invalid frontmatter: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return {
    name: "architect",
    path: filePath,
    action: installedContent === expectedContent ? "unchanged" : "update",
    expectedContent,
  };
}

/**
 * Apply a previously approved Architect reconciliation. The marker is checked
 * again at write time so a newly-created manual conflict is never overwritten.
 */
export function applyArchitectReconciliation(
  reconciliation: ArchitectReconciliation,
  target: InstallTarget
): ArchitectReconciliationAction {
  if (reconciliation.action === "unchanged" || reconciliation.action === "conflict") {
    return reconciliation.action;
  }

  const filePath = join(target.agentDir, "architect.md");
  // Re-plan immediately before writing. The aggregate init plan is created
  // before confirmation, so the file may have changed while the user was
  // deciding whether to apply it. This also re-applies the newest valid model
  // instead of writing stale expectedContent from the preview.
  const current = planArchitectReconciliation(target);
  if (!current) {
    reconciliation.reason = "Architect reconciliation is no longer desired";
    return "conflict";
  }

  if (reconciliation.action === "create") {
    if (current.action === "unchanged") {
      // Another compatible writer completed the create between plan and apply.
      return "unchanged";
    }
    if (current.action !== "create") {
      reconciliation.reason = current.reason ??
        "file appeared or changed between plan and apply";
      return "conflict";
    }
  } else {
    if (current.action === "unchanged") {
      // The file became canonical while confirmation was pending.
      return "unchanged";
    }
    if (current.action !== "update") {
      reconciliation.reason = current.reason ??
        "file changed or disappeared between plan and apply";
      return "conflict";
    }
  }

  const expectedContent = current.expectedContent;
  if (!expectedContent) {
    reconciliation.reason = "missing canonical Architect content after revalidation";
    return "conflict";
  }

  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, expectedContent, "utf-8");
  return reconciliation.action;
}

// ---------------------------------------------------------------------------
// State detection
// ---------------------------------------------------------------------------

/**
 * Determine the state of a managed agent at a given target.
 *
 * - Custom agents:
 *   - `active`  — file exists AND has managed marker
 *   - `missing` — file does not exist
 *   - `conflict` — file exists but lacks managed marker (manual/external file)
 *
 * - Built-in agents:
 *   - `active` — not disabled in config
 *   - `hidden` — disabled in config (agent.<name>.disable === true)
 *   - Built-ins never have a conflict or missing state
 */
export function getManagedAgentState(
  agent: ManagedAgent,
  target: InstallTarget
): ManagedAgentState {
  if (agent.kind === "custom") {
    const filePath = join(target.agentDir, `${agent.name}.md`);
    if (!existsSync(filePath)) return "missing";
    if (fileHasManagedMarker(filePath)) return "active";
    return "conflict";
  }

  // Built-in: check config disable flag
  const config = readConfig(target.configPath);
  if (!config) return "active"; // No config means no disable flag

  const agentObj = config.agent as Record<string, unknown> | undefined;
  if (!agentObj) return "active";

  const agentConfig = agentObj[agent.name] as Record<string, unknown> | undefined;
  if (!agentConfig) return "active";

  if (agentConfig.disable === true) return "hidden";
  return "active";
}

/**
 * Get the full status (agent + state) for all managed agents at a target.
 */
export function listManagedAgentStatuses(target: InstallTarget): ManagedAgentStatus[] {
  return listManagedCatalog().map((agent) => ({
    ...agent,
    state: getManagedAgentState(agent, target),
  }));
}

/**
 * Get only the active managed agents at a target.
 */
export function listActiveManagedAgents(target: InstallTarget): ManagedAgentStatus[] {
  return listManagedAgentStatuses(target).filter((a) => a.state === "active");
}

/**
 * List active managed agents that are candidates for model configuration.
 * This excludes built-ins that are hidden, custom agents that are
 * missing/conflict, and built-ins without model support.
 *
 * Custom managed agents store models in frontmatter.
 * Built-in managed agents (plan, build, explore) store models in opencode config.
 */
export function listActiveManagedModelAgents(target: InstallTarget): ManagedAgentStatus[] {
  return listActiveManagedAgents(target);
}

// ---------------------------------------------------------------------------
// Target detection helpers
// ---------------------------------------------------------------------------

/** Result of scope detection for commands that need target selection. */
export interface ScopeDetectionResult {
  /** Whether the project target has manageable agents. */
  projectManageable: boolean;
  /** Whether the global target has manageable agents. */
  globalManageable: boolean;
}

/**
 * Detect which installation scopes have manageable agents.
 *
 * Built-ins (plan, build, explore) are active by default even without init,
 * so the project target is always manageable unless explicitly proven otherwise.
 *
 * If a target's config file contains invalid JSON, the target is still
 * considered manageable — built-ins don't require a config to exist, and
 * a broken config shouldn't prevent the user from choosing that target.
 * The actual config error will surface when the user tries to perform
 * an operation on that target.
 */
export function detectManageableScopes(
  projectTarget: InstallTarget,
  globalTarget: InstallTarget
): ScopeDetectionResult {
  let projectManageable = true;
  let globalManageable = true;

  try {
    projectManageable = listManagedAgentStatuses(projectTarget).length > 0;
  } catch {
    // Config may be unreadable; built-ins are still active by default
    projectManageable = true;
  }

  try {
    globalManageable = listManagedAgentStatuses(globalTarget).length > 0;
  } catch {
    globalManageable = true;
  }

  return { projectManageable, globalManageable };
}

// ---------------------------------------------------------------------------
// Mutate operations
// ---------------------------------------------------------------------------

/**
 * Install a custom managed agent: write the template with the managed marker.
 * Refuses to overwrite an existing file unless `force` is true.
 *
 * Returns:
 * - "created"     — file was written successfully
 * - "conflict"    — file exists without managed marker, refused to overwrite
 * - "already_active" — file already exists with managed marker (no-op)
 */
export function installCustomAgent(
  agentName: PackAgentName,
  target: InstallTarget,
  options?: { force?: boolean }
): "created" | "conflict" | "already_active" {
  const filePath = join(target.agentDir, `${agentName}.md`);

  if (existsSync(filePath)) {
    if (fileHasManagedMarker(filePath)) {
      return "already_active";
    }
    // File exists without marker — conflict
    return "conflict";
  }

  // Create directory if needed
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Read template, add marker, write
  const templateContent = readTemplate(agentName);
  const contentWithMarker = addManagedMarker(templateContent);
  writeFileSync(filePath, contentWithMarker, "utf-8");
  return "created";
}

/**
 * Delete a custom managed agent file.
 * Only deletes if the file has the managed marker (safe guard).
 * Returns true if deleted, false if not found or not managed.
 */
export function deleteCustomAgent(
  agentName: string,
  target: InstallTarget
): boolean {
  const filePath = join(target.agentDir, `${agentName}.md`);

  if (!existsSync(filePath)) return false;
  if (!fileHasManagedMarker(filePath)) return false;

  rmSync(filePath);
  return true;
}

/**
 * Hide a built-in managed agent by setting agent.<name>.disable = true
 * in the opencode config. Preserves all other config fields.
 */
export function hideBuiltinAgent(
  agentName: string,
  target: InstallTarget
): void {
  let config = readConfig(target.configPath);
  if (!config) {
    config = {};
  }
  config = ensureConfigStructure(config);

  const agent = config.agent as Record<string, unknown>;
  if (!agent[agentName] || typeof agent[agentName] !== "object" || Array.isArray(agent[agentName])) {
    agent[agentName] = {};
  }

  const agentConfig = agent[agentName] as Record<string, unknown>;
  agentConfig.disable = true;

  writeConfig(target.configPath, config);
}

/**
 * Restore a built-in managed agent by removing agent.<name>.disable or
 * setting it to false. Preserves all other config fields (model, permissions, etc.).
 */
export function restoreBuiltinAgent(
  agentName: string,
  target: InstallTarget
): void {
  let config = readConfig(target.configPath);
  if (!config) {
    config = {};
  }
  config = ensureConfigStructure(config);

  const agent = config.agent as Record<string, unknown>;
  if (!agent[agentName] || typeof agent[agentName] !== "object" || Array.isArray(agent[agentName])) {
    agent[agentName] = {};
  }

  const agentConfig = agent[agentName] as Record<string, unknown>;

  // Remove the disable key entirely to restore
  if ("disable" in agentConfig) {
    delete agentConfig.disable;
  }

  writeConfig(target.configPath, config);
}

/**
 * Check whether a built-in agent is hidden at a given target.
 */
export function isBuiltinAgentHidden(
  agentName: string,
  target: InstallTarget
): boolean {
  const config = readConfig(target.configPath);
  if (!config) return false;

  const agent = config.agent as Record<string, unknown> | undefined;
  if (!agent) return false;

  const agentConfig = agent[agentName] as Record<string, unknown> | undefined;
  if (!agentConfig) return false;

  return agentConfig.disable === true;
}

// ---------------------------------------------------------------------------
// Reusable plan/apply logic
// ---------------------------------------------------------------------------

/** Planned agent state changes computed from a user selection. */
export interface AgentChanges {
  toInstall: string[];
  toDelete: string[];
  toRestore: string[];
  toHide: string[];
  unchanged: string[];
  conflicts: string[];
}

/**
 * Compute planned agent state changes from the current statuses and the
 * user's selection set. Reusable by both the standalone `agents` command
 * and the guided `init` flow.
 */
export function computeAgentChanges(
  statuses: ManagedAgentStatus[],
  selectedSet: Set<string>
): AgentChanges {
  const toInstall: string[] = [];
  const toDelete: string[] = [];
  const toRestore: string[] = [];
  const toHide: string[] = [];
  const unchanged: string[] = [];
  const conflicts: string[] = [];

  for (const agent of statuses) {
    const shouldBeActive = selectedSet.has(agent.name);

    if (agent.state === "conflict") {
      conflicts.push(agent.name);
      continue;
    }

    if (agent.kind === "custom") {
      if (agent.state === "missing" && shouldBeActive) {
        toInstall.push(agent.name);
      } else if (agent.state === "active" && !shouldBeActive) {
        toDelete.push(agent.name);
      } else {
        unchanged.push(agent.name);
      }
      continue;
    }

    if (agent.kind === "builtin") {
      if (agent.state === "hidden" && shouldBeActive) {
        toRestore.push(agent.name);
      } else if (agent.state === "active" && !shouldBeActive) {
        toHide.push(agent.name);
      } else {
        unchanged.push(agent.name);
      }
    }
  }

  return { toInstall, toDelete, toRestore, toHide, unchanged, conflicts };
}

/** Result of applying agent changes. */
export interface AgentApplyResult {
  installed: string[];
  deleted: string[];
  restored: string[];
  hidden: string[];
  unchanged: string[];
  conflicts: string[];
}

/**
 * Apply planned agent changes to the target. Returns the actual result
 * (which may differ from the plan if conflicts arise at write time).
 */
export function applyAgentChanges(
  changes: AgentChanges,
  target: InstallTarget
): AgentApplyResult {
  const result: AgentApplyResult = {
    installed: [],
    deleted: [],
    restored: [],
    hidden: [],
    unchanged: [],
    conflicts: [...changes.conflicts],
  };

  for (const name of changes.toInstall) {
    const installResult = installCustomAgent(name as PackAgentName, target);
    if (installResult === "created") {
      result.installed.push(name);
    } else if (installResult === "conflict") {
      result.conflicts.push(name);
    } else {
      result.unchanged.push(name);
    }
  }

  for (const name of changes.toDelete) {
    const deleted = deleteCustomAgent(name, target);
    if (deleted) {
      result.deleted.push(name);
    } else {
      result.unchanged.push(name);
    }
  }

  for (const name of changes.toRestore) {
    restoreBuiltinAgent(name, target);
    result.restored.push(name);
  }

  for (const name of changes.toHide) {
    hideBuiltinAgent(name, target);
    result.hidden.push(name);
  }

  result.unchanged.push(...changes.unchanged);

  return result;
}
