/**
 * Managed skill domain module.
 *
 * Centralizes catalog, state detection, and mutate operations for managed
 * skills that opencode-path manages (both core and optional). Core skills
 * are installed automatically during init; optional skills are user-selectable.
 * Both use the same managed marker convention as agents.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, rmdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname as _dirname, resolve } from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
import {
  CORE_SKILLS,
  OPTIONAL_SKILLS,
  ALL_MANAGED_SKILLS,
  isCoreSkill,
  isOptionalSkill,
  type CoreSkillName,
  type OptionalSkillName,
  type ManagedSkillName,
  type InstallTarget,
} from "./paths.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** HTML comment marker injected into installed managed skill files. */
export const MANAGED_SKILL_MARKER = "<!-- managed-by: opencode-path -->";

/** Reconciliation action for any managed skill definition. */
export type ManagedSkillReconciliationAction =
  | "create"
  | "replace"
  | "unchanged"
  | "remove"
  | "conflict";

/** Options for canonical managed-skill reconciliation. */
export interface ManagedSkillReconciliationOptions {
  /** Desired target for optional skills. Core and Graphify are update-only. */
  desired?: boolean;
  /** Whether a missing definition may be created. */
  createMissing?: boolean;
}

/** Planned canonical reconciliation for a managed skill. */
export interface ManagedSkillReconciliation {
  name: ManagedSkillName;
  path: string;
  action: ManagedSkillReconciliationAction;
  expectedContent?: string;
  /** Effective desired state used when the plan is revalidated at apply time. */
  desired: boolean;
  /** Effective missing-file creation permission used at apply time. */
  createMissing: boolean;
  reason?: string;
}

/** Reconciliation action for a managed architecture core skill. */
export type CoreSkillReconciliationAction =
  | "create"
  | "update"
  | "unchanged"
  | "conflict";

/** Planned canonical reconciliation for an architecture core skill. */
export interface CoreSkillReconciliation {
  name: CoreSkillName;
  path: string;
  action: CoreSkillReconciliationAction;
  expectedContent?: string;
  reason?: string;
}

/** Base name for skill definition files. */
const SKILL_FILE = "SKILL.md";

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the packaged skill templates directory.
 * Packaged skill templates live under templates/skills/ relative to the
 * package root (same as agent templates).
 */
export function getSkillTemplatesDir(): string {
  // Same strategy as getTemplatesDir() in templates.ts
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = _dirname(thisFile);

  // Try from dist/ first (production build): dist/cli.js → ../templates/skills
  const fromDist = resolve(thisDir, "..", "templates", "skills");
  if (existsSync(fromDist)) {
    return fromDist;
  }

  // Try from src/lib/ (development with tsx): src/lib/skills.ts → ../../templates/skills
  const fromSrc = resolve(thisDir, "..", "..", "templates", "skills");
  if (existsSync(fromSrc)) {
    return fromSrc;
  }

  throw new Error(
    "Could not locate skill templates directory. Ensure templates/skills/ exists in the package."
  );
}

/**
 * Get the full path to a packaged skill template directory.
 */
export function getSkillTemplateDir(skillName: ManagedSkillName): string {
  return join(getSkillTemplatesDir(), skillName);
}

/**
 * Get the full path to a packaged SKILL.md file.
 */
export function getSkillTemplatePath(skillName: ManagedSkillName): string {
  return join(getSkillTemplateDir(skillName), SKILL_FILE);
}

/**
 * Read a packaged skill template as a string.
 */
export function readSkillTemplate(skillName: ManagedSkillName): string {
  const templatePath = getSkillTemplatePath(skillName);
  if (!existsSync(templatePath)) {
    throw new Error(`Skill template not found: ${templatePath}`);
  }
  return readFileSync(templatePath, "utf-8");
}

/**
 * List available packaged skill template names.
 * Only returns names that exist in ALL_MANAGED_SKILLS and have a SKILL.md file.
 */
export function listSkillTemplates(): ManagedSkillName[] {
  const found: ManagedSkillName[] = [];
  for (const name of ALL_MANAGED_SKILLS) {
    const templatePath = getSkillTemplatePath(name);
    if (existsSync(templatePath)) {
      found.push(name);
    }
  }
  return found;
}

/**
 * Validate all packaged skill templates.
 * Checks that each managed skill has a readable SKILL.md file with valid
 * frontmatter (matching name, non-empty description) and the managed marker.
 * Returns an array of error messages (empty if all valid).
 */
export function validateAllSkillTemplates(): string[] {
  const errors: string[] = [];
  for (const name of ALL_MANAGED_SKILLS) {
    try {
      const content = readSkillTemplate(name);

      // Validate frontmatter
      const { frontmatter, body } = parseFrontmatter(content);

      if (!frontmatter || typeof frontmatter !== "object") {
        errors.push(`${name}/SKILL.md: missing or invalid frontmatter`);
        continue;
      }

      if (frontmatter.name !== name) {
        errors.push(
          `${name}/SKILL.md: frontmatter name "${String(frontmatter.name)}" does not match skill directory "${name}"`
        );
      }

      const desc = frontmatter.description;
      if (typeof desc !== "string" || desc.trim().length === 0) {
        errors.push(
          `${name}/SKILL.md: frontmatter description is missing or empty`
        );
      }

      // Validate managed marker
      if (!body.includes(MANAGED_SKILL_MARKER)) {
        errors.push(
          `${name}/SKILL.md: missing managed marker "${MANAGED_SKILL_MARKER}"`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${name}/SKILL.md: ${message}`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Marker detection
// ---------------------------------------------------------------------------

/**
 * Check whether file content contains the managed skill marker.
 */
export function contentHasSkillMarker(content: string): boolean {
  return content.includes(MANAGED_SKILL_MARKER);
}

/**
 * Check whether a file at the given path contains the managed skill marker.
 * Returns false if the file does not exist.
 */
export function fileHasSkillMarker(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  try {
    const content = readFileSync(filePath, "utf-8");
    return contentHasSkillMarker(content);
  } catch {
    return false;
  }
}

/**
 * Add the managed marker to skill content. The marker is appended at the
 * end of the file body.
 */
export function addSkillMarker(content: string): string {
  if (contentHasSkillMarker(content)) return content;
  const trimmed = content.endsWith("\n") ? content : content + "\n";
  return trimmed + MANAGED_SKILL_MARKER + "\n";
}

function skillKind(skillName: ManagedSkillName): ManagedSkillKind {
  if (isCoreSkill(skillName)) return "core";
  if (isOptionalSkill(skillName)) return "optional";
  return "graphify";
}

function canonicalManagedSkillContent(skillName: ManagedSkillName): string {
  return addSkillMarker(readSkillTemplate(skillName));
}

function skillConflict(
  skillName: ManagedSkillName,
  filePath: string,
  reason: string,
  desired: boolean,
  createMissing: boolean
): ManagedSkillReconciliation {
  return {
    name: skillName,
    path: filePath,
    action: "conflict",
    desired,
    createMissing,
    reason,
  };
}

/**
 * Plan canonical reconciliation for core, optional, and graphify skills.
 * Core skills are always desired. Graphify Explorer is update-only by default:
 * an absent or unmarked external definition is never adopted automatically.
 */
export function planManagedSkillReconciliation(
  skillName: ManagedSkillName,
  target: InstallTarget,
  options: ManagedSkillReconciliationOptions = {}
): ManagedSkillReconciliation {
  const kind = skillKind(skillName);
  const desired = kind === "core" || kind === "graphify"
    ? true
    : options.desired ?? true;
  const createMissing = options.createMissing ?? kind !== "graphify";
  const filePath = getSkillInstallPath(skillName, target);

  if (!desired) {
    if (!existsSync(filePath)) {
      return { name: skillName, path: filePath, action: "unchanged", desired, createMissing };
    }

    if (!fileHasSkillMarker(filePath)) {
      return skillConflict(skillName, filePath, "file has no managed marker", desired, createMissing);
    }

    return { name: skillName, path: filePath, action: "remove", desired, createMissing };
  }

  if (!existsSync(filePath)) {
    if (!createMissing) {
      return { name: skillName, path: filePath, action: "unchanged", desired, createMissing };
    }

    try {
      return {
        name: skillName,
        path: filePath,
        action: "create",
        expectedContent: canonicalManagedSkillContent(skillName),
        desired,
        createMissing,
      };
    } catch (error) {
      return skillConflict(
        skillName,
        filePath,
        `cannot compose canonical content: ${error instanceof Error ? error.message : String(error)}`,
        desired,
        createMissing
      );
    }
  }

  if (!fileHasSkillMarker(filePath)) {
    return skillConflict(skillName, filePath, "file has no managed marker", desired, createMissing);
  }

  try {
    const installedContent = readFileSync(filePath, "utf-8");
    const expectedContent = canonicalManagedSkillContent(skillName);
    return {
      name: skillName,
      path: filePath,
      action: installedContent === expectedContent ? "unchanged" : "replace",
      expectedContent,
      desired,
      createMissing,
    };
  } catch (error) {
    return skillConflict(
      skillName,
      filePath,
      `cannot reconcile file: ${error instanceof Error ? error.message : String(error)}`,
      desired,
      createMissing
    );
  }
}

/** Apply a previously approved managed-skill reconciliation safely. */
export function applyManagedSkillReconciliation(
  reconciliation: ManagedSkillReconciliation,
  target: InstallTarget
): ManagedSkillReconciliationAction {
  if (reconciliation.action === "unchanged" || reconciliation.action === "conflict") {
    return reconciliation.action;
  }

  const current = planManagedSkillReconciliation(reconciliation.name, target, {
    desired: reconciliation.desired,
    createMissing: reconciliation.createMissing,
  });
  if (current.action === "unchanged") return "unchanged";
  if (current.action !== reconciliation.action) return "conflict";

  if (reconciliation.action === "remove") {
    return deleteManagedSkill(reconciliation.name, target) ? "remove" : "conflict";
  }

  if (!current.expectedContent) return "conflict";
  const dir = dirname(reconciliation.path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(reconciliation.path, current.expectedContent, "utf-8");
  return reconciliation.action;
}

function toCoreSkillReconciliation(
  reconciliation: ManagedSkillReconciliation
): CoreSkillReconciliation {
  return {
    name: reconciliation.name as CoreSkillName,
    path: reconciliation.path,
    action:
      reconciliation.action === "replace"
        ? "update"
        : reconciliation.action === "create" ||
            reconciliation.action === "unchanged" ||
            reconciliation.action === "conflict"
          ? reconciliation.action
          : "conflict",
    expectedContent: reconciliation.expectedContent,
    reason: reconciliation.reason,
  };
}

/** Compare one architecture core skill with its packaged canonical content. */
export function planCoreSkillReconciliation(
  skillName: CoreSkillName,
  target: InstallTarget
): CoreSkillReconciliation {
  return toCoreSkillReconciliation(
    planManagedSkillReconciliation(skillName, target, {
      desired: true,
      createMissing: true,
    })
  );
}

/** Apply a previously approved architecture core-skill reconciliation. */
export function applyCoreSkillReconciliation(
  reconciliation: CoreSkillReconciliation,
  target: InstallTarget
): CoreSkillReconciliationAction {
  if (reconciliation.action === "unchanged" || reconciliation.action === "conflict") {
    return reconciliation.action;
  }

  const result = applyManagedSkillReconciliation(
    {
      name: reconciliation.name,
      path: reconciliation.path,
      action: reconciliation.action === "update" ? "replace" : reconciliation.action,
      expectedContent: reconciliation.expectedContent,
      desired: true,
      createMissing: true,
      reason: reconciliation.reason,
    },
    target
  );
  if (result === "replace") return "update";
  if (result === "remove") return "conflict";
  return result;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/** Whether a managed skill is core, optional, or graphify. */
export type ManagedSkillKind = "core" | "optional" | "graphify";

/** State of a managed skill at a given target. */
export type SkillState = "active" | "missing" | "conflict";

/** A managed skill entry with its resolved state at a specific target. */
export interface ManagedSkillStatus {
  name: ManagedSkillName;
  state: SkillState;
  kind: ManagedSkillKind;
}

/**
 * Build the full managed skill catalog from ALL_MANAGED_SKILLS.
 */
export function listManagedSkillCatalog(): ManagedSkillName[] {
  return [...ALL_MANAGED_SKILLS];
}

/**
 * Get only the core skill names from the catalog.
 */
export function listCoreSkillCatalog(): CoreSkillName[] {
  return [...CORE_SKILLS];
}

/**
 * Get only the optional skill names from the catalog.
 */
export function listOptionalSkillCatalog(): OptionalSkillName[] {
  return [...OPTIONAL_SKILLS];
}

/**
 * Get the install path for a managed skill at a target.
 */
export function getSkillInstallPath(skillName: ManagedSkillName, target: InstallTarget): string {
  return join(target.skillDir, skillName, SKILL_FILE);
}

/**
 * Determine the state of a managed skill at a given target.
 *
 * - `active`  — file exists AND has managed marker
 * - `missing` — file does not exist
 * - `conflict` — file exists but lacks managed marker
 */
export function getSkillState(
  skillName: ManagedSkillName,
  target: InstallTarget
): SkillState {
  const filePath = getSkillInstallPath(skillName, target);
  if (!existsSync(filePath)) return "missing";
  if (fileHasSkillMarker(filePath)) return "active";
  return "conflict";
}

/**
 * Get the full status for all managed skills at a target.
 */
export function listManagedSkillStatuses(target: InstallTarget): ManagedSkillStatus[] {
  return listManagedSkillCatalog().map((name) => ({
    name,
    state: getSkillState(name, target),
    kind: isCoreSkill(name) ? "core" : isOptionalSkill(name) ? "optional" : "graphify",
  }));
}

/**
 * Get only the active managed skills at a target.
 */
export function listActiveManagedSkills(target: InstallTarget): ManagedSkillStatus[] {
  return listManagedSkillStatuses(target).filter((s) => s.state === "active");
}

// ---------------------------------------------------------------------------
// Mutate operations
// ---------------------------------------------------------------------------

/**
 * Result of a skill install operation.
 */
export type SkillInstallResult = "created" | "conflict" | "already_active";

/**
 * Install a managed skill: write the template with the managed marker.
 * Creates the skill directory (e.g., `.opencode/skills/<name>/`) if needed.
 *
 * Returns:
 * - "created"     — file was written successfully
 * - "conflict"    — file exists without managed marker, refused to overwrite
 * - "already_active" — file already exists with managed marker (no-op)
 */
export function installManagedSkill(
  skillName: ManagedSkillName,
  target: InstallTarget
): SkillInstallResult {
  const filePath = getSkillInstallPath(skillName, target);

  if (existsSync(filePath)) {
    if (fileHasSkillMarker(filePath)) {
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
  const templateContent = readSkillTemplate(skillName);
  const contentWithMarker = addSkillMarker(templateContent);
  writeFileSync(filePath, contentWithMarker, "utf-8");
  return "created";
}

/**
 * Install a managed core skill. Convenience wrapper around installManagedSkill
 * that accepts CoreSkillName for type safety at call sites that should only
 * install core skills.
 */
export function installCoreSkill(
  skillName: CoreSkillName,
  target: InstallTarget
): SkillInstallResult {
  return installManagedSkill(skillName, target);
}

/**
 * Update a managed skill: overwrite the existing managed file with the
 * latest packaged template. Only updates files that have the managed marker
 * (safe guard against overwriting user-modified skills).
 *
 * Returns:
 * - "updated"        — managed file was overwritten with the latest template
 * - "not_managed"   — file exists but lacks managed marker; refused to touch
 * - "not_installed" — file does not exist; call installManagedSkill instead
 */
export function updateManagedSkill(
  skillName: ManagedSkillName,
  target: InstallTarget
): "updated" | "not_managed" | "not_installed" {
  const filePath = getSkillInstallPath(skillName, target);

  if (!existsSync(filePath)) return "not_installed";
  if (!fileHasSkillMarker(filePath)) return "not_managed";

  const templateContent = readSkillTemplate(skillName);
  const contentWithMarker = addSkillMarker(templateContent);
  writeFileSync(filePath, contentWithMarker, "utf-8");
  return "updated";
}

/**
 * Delete a managed skill file.
 * Only deletes if the file has the managed marker (safe guard).
 * Also removes the parent skill directory if empty after deletion.
 * Returns true if deleted, false if not found or not managed.
 */
export function deleteManagedSkill(
  skillName: ManagedSkillName,
  target: InstallTarget
): boolean {
  const filePath = getSkillInstallPath(skillName, target);

  if (!existsSync(filePath)) return false;
  if (!fileHasSkillMarker(filePath)) return false;

  rmSync(filePath);

  // Remove parent directory if empty
  const skillDir = dirname(filePath);
  try {
    const entries = readdirSync(skillDir);
    if (entries.length === 0) {
      rmdirSync(skillDir);
    }
  } catch {
    // Directory may not exist or have contents; ignore cleanup errors
  }

  return true;
}

/**
 * Delete a managed core skill file. Convenience wrapper around deleteManagedSkill
 * that accepts CoreSkillName for type safety at call sites that should only
 * delete core skills.
 */
export function deleteCoreSkill(
  skillName: CoreSkillName,
  target: InstallTarget
): boolean {
  return deleteManagedSkill(skillName, target);
}

/**
 * Update a managed core skill. Convenience wrapper around updateManagedSkill
 * that accepts CoreSkillName for type safety at call sites that should only
 * update core skills.
 */
export function updateCoreSkill(
  skillName: CoreSkillName,
  target: InstallTarget
): "updated" | "not_managed" | "not_installed" {
  return updateManagedSkill(skillName, target);
}
