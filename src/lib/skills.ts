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

function canonicalCoreSkillContent(skillName: CoreSkillName): string {
  return addSkillMarker(readSkillTemplate(skillName));
}

/** Compare one architecture core skill with its packaged canonical content. */
export function planCoreSkillReconciliation(
  skillName: CoreSkillName,
  target: InstallTarget
): CoreSkillReconciliation {
  const filePath = getSkillInstallPath(skillName, target);
  if (!existsSync(filePath)) {
    return {
      name: skillName,
      path: filePath,
      action: "create",
      expectedContent: canonicalCoreSkillContent(skillName),
    };
  }

  if (!fileHasSkillMarker(filePath)) {
    return {
      name: skillName,
      path: filePath,
      action: "conflict",
      reason: "file has no managed marker",
    };
  }

  try {
    const installedContent = readFileSync(filePath, "utf-8");
    const expectedContent = canonicalCoreSkillContent(skillName);
    return {
      name: skillName,
      path: filePath,
      action: installedContent === expectedContent ? "unchanged" : "update",
      expectedContent,
    };
  } catch (error) {
    return {
      name: skillName,
      path: filePath,
      action: "conflict",
      reason: `cannot read file: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Apply a previously approved architecture core-skill reconciliation. */
export function applyCoreSkillReconciliation(
  reconciliation: CoreSkillReconciliation,
  target: InstallTarget
): CoreSkillReconciliationAction {
  if (reconciliation.action === "unchanged" || reconciliation.action === "conflict") {
    return reconciliation.action;
  }

  const expectedContent = reconciliation.expectedContent;
  if (!expectedContent) {
    throw new Error(`Missing canonical skill content for ${reconciliation.path}`);
  }

  if (existsSync(reconciliation.path)) {
    const current = readFileSync(reconciliation.path, "utf-8");
    if (!contentHasSkillMarker(current)) return "conflict";
    if (reconciliation.action === "create" && current === expectedContent) {
      return "create";
    }
  }

  const dir = dirname(reconciliation.path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(reconciliation.path, expectedContent, "utf-8");
  return reconciliation.action;
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
