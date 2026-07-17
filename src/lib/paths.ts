import { homedir } from "node:os";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

export type InstallScope = "project" | "global";

export interface InstallTarget {
  scope: InstallScope;
  agentDir: string;
  configPath: string;
  skillDir: string;
}

/**
 * Resolve the install target paths for a given scope.
 * - project: resolves relative to the given working directory
 * - global: resolves to ~/.config/opencode/
 */
export function resolveTarget(scope: InstallScope, cwd?: string): InstallTarget {
  if (scope === "project") {
    const base = cwd ?? process.cwd();
    return {
      scope: "project",
      agentDir: resolve(base, ".opencode", "agent"),
      configPath: resolve(base, ".opencode", "opencode.json"),
      skillDir: resolve(base, ".opencode", "skills"),
    };
  }

  const globalBase = resolve(homedir(), ".config", "opencode");
  return {
    scope: "global",
    agentDir: resolve(globalBase, "agent"),
    configPath: resolve(globalBase, "opencode.json"),
    skillDir: resolve(globalBase, "skills"),
  };
}

/**
 * Detect which installation scope to suggest as default.
 * If a project-level installation exists (./.opencode/agent/), return 'project'.
 * Otherwise, return 'global'.
 */
export function detectDefaultScope(cwd?: string): InstallScope {
  const base = cwd ?? process.cwd();
  const projectAgentDir = resolve(base, ".opencode", "agent");
  if (existsSync(projectAgentDir)) {
    return "project";
  }
  return "global";
}

/**
 * List of pack agent template names (without .md extension).
 * Used by both init and models commands.
 */
export const PACK_AGENTS = [
  "spec",
  "architect",
  "developer",
  "reviewer",
  "auditor",
  "research",
] as const;

export type PackAgentName = (typeof PACK_AGENTS)[number];

/**
 * List of core managed skill names.
 * Core skills are installed automatically with the workflow pack and are not
 * optional. They use the same managed marker convention as agents.
 */
export const CORE_SKILLS = [
  "local-architecture",
  "cross-repo-architecture",
] as const;

export type CoreSkillName = (typeof CORE_SKILLS)[number];

/**
 * List of optional managed skill names.
 * Optional skills are user-selectable and are not installed automatically.
 * They use the same managed marker convention as agents and core skills.
 */
export const OPTIONAL_SKILLS = [
  "migration-and-data-change",
  "api-contracts",
  "security-boundary-review",
  "incident-recovery",
  "test-strategy",
] as const;

export type OptionalSkillName = (typeof OPTIONAL_SKILLS)[number];

/**
 * List of Graphify-specific managed skill names.
 * These skills are managed by opencode-path but are NOT user-selectable in the
 * normal optional-skill picker. They are installed only as part of the Graphify
 * integration flow and only after the official Graphify CLI and OpenCode skill
 * install succeed.
 */
export const GRAPHIFY_SKILLS = [
  "graphify-explorer",
] as const;

export type GraphifySkillName = (typeof GRAPHIFY_SKILLS)[number];

/**
 * Union of all managed skill names (core + optional + graphify).
 */
export type ManagedSkillName = CoreSkillName | OptionalSkillName | GraphifySkillName;

/**
 * All managed skill names (core + optional + graphify), in catalog order.
 */
export const ALL_MANAGED_SKILLS: readonly ManagedSkillName[] = [
  ...CORE_SKILLS,
  ...OPTIONAL_SKILLS,
  ...GRAPHIFY_SKILLS,
];

/**
 * Type guard: check if a skill name is a core skill.
 */
export function isCoreSkill(name: string): name is CoreSkillName {
  return (CORE_SKILLS as readonly string[]).includes(name);
}

/**
 * Type guard: check if a skill name is an optional skill.
 */
export function isOptionalSkill(name: string): name is OptionalSkillName {
  return (OPTIONAL_SKILLS as readonly string[]).includes(name);
}

/**
 * Type guard: check if a skill name is a Graphify-specific skill.
 */
export function isGraphifySkill(name: string): name is GraphifySkillName {
  return (GRAPHIFY_SKILLS as readonly string[]).includes(name);
}

/**
 * Check if a skill name is a managed skill (core, optional, or graphify).
 */
export function isManagedSkill(name: string): name is ManagedSkillName {
  return isCoreSkill(name) || isOptionalSkill(name) || isGraphifySkill(name);
}

/**
 * Check if an agent name is a pack agent (has a .md template file).
 */
export function isPackAgent(name: string): name is PackAgentName {
  return (PACK_AGENTS as readonly string[]).includes(name);
}
