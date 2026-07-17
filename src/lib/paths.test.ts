import { describe, it, expect } from "vitest";
import {
  resolveTarget,
  detectDefaultScope,
  isPackAgent,
  isCoreSkill,
  isOptionalSkill,
  isGraphifySkill,
  isManagedSkill,
  PACK_AGENTS,
  CORE_SKILLS,
  OPTIONAL_SKILLS,
  GRAPHIFY_SKILLS,
  ALL_MANAGED_SKILLS,
} from "./paths.js";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

describe("resolveTarget", () => {
  it("resolves project target to .opencode/ in the given cwd", () => {
    const target = resolveTarget("project", "/my/project");
    expect(target.scope).toBe("project");
    expect(target.agentDir).toBe(resolve("/my/project", ".opencode", "agent"));
    expect(target.configPath).toBe(
      resolve("/my/project", ".opencode", "opencode.json")
    );
    expect(target.skillDir).toBe(
      resolve("/my/project", ".opencode", "skills")
    );
  });

  it("resolves project target using process.cwd() when no cwd given", () => {
    const target = resolveTarget("project");
    expect(target.scope).toBe("project");
    expect(target.agentDir).toContain(".opencode");
    expect(target.skillDir).toContain(".opencode");
  });

  it("resolves global target to ~/.config/opencode/", () => {
    const target = resolveTarget("global");
    expect(target.scope).toBe("global");
    expect(target.agentDir).toBe(
      resolve(homedir(), ".config", "opencode", "agent")
    );
    expect(target.configPath).toBe(
      resolve(homedir(), ".config", "opencode", "opencode.json")
    );
    expect(target.skillDir).toBe(
      resolve(homedir(), ".config", "opencode", "skills")
    );
  });
});

describe("detectDefaultScope", () => {
  it("returns 'global' by default", () => {
    // Use a temp dir that doesn't have .opencode
    const result = detectDefaultScope("/tmp/nonexistent-project-path");
    expect(result).toBe("global");
  });
});

describe("isPackAgent", () => {
  it("identifies pack agents", () => {
    expect(isPackAgent("spec")).toBe(true);
    expect(isPackAgent("architect")).toBe(true);
    expect(isPackAgent("developer")).toBe(true);
    expect(isPackAgent("reviewer")).toBe(true);
    expect(isPackAgent("auditor")).toBe(true);
    expect(isPackAgent("research")).toBe(true);
  });

  it("does not identify explore as a pack agent", () => {
    expect(isPackAgent("explore")).toBe(false);
  });
});

describe("PACK_AGENTS", () => {
  it("contains exactly the six pack agents", () => {
    expect(PACK_AGENTS).toEqual([
      "spec",
      "architect",
      "developer",
      "reviewer",
      "auditor",
      "research",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Graphify skill catalog wiring
// ---------------------------------------------------------------------------

describe("Graphify skill catalog", () => {
  it("graphify-explorer is in ALL_MANAGED_SKILLS", () => {
    expect(ALL_MANAGED_SKILLS).toContain("graphify-explorer");
  });

  it("graphify-explorer is NOT in CORE_SKILLS", () => {
    expect(CORE_SKILLS).not.toContain("graphify-explorer");
  });

  it("graphify-explorer is NOT in OPTIONAL_SKILLS", () => {
    expect(OPTIONAL_SKILLS).not.toContain("graphify-explorer");
  });

  it("graphify-explorer is in GRAPHIFY_SKILLS", () => {
    expect(GRAPHIFY_SKILLS).toContain("graphify-explorer");
  });

  it("isGraphifySkill returns true for graphify-explorer", () => {
    expect(isGraphifySkill("graphify-explorer")).toBe(true);
  });

  it("isGraphifySkill returns false for core skills", () => {
    expect(isGraphifySkill("cross-repo-architecture")).toBe(false);
  });

  it("isGraphifySkill returns false for optional skills", () => {
    expect(isGraphifySkill("migration-and-data-change")).toBe(false);
  });

  it("isManagedSkill returns true for graphify skills", () => {
    expect(isManagedSkill("graphify-explorer")).toBe(true);
  });

  it("isManagedSkill returns true for core skills", () => {
    expect(isManagedSkill("cross-repo-architecture")).toBe(true);
  });

  it("isManagedSkill returns true for optional skills", () => {
    expect(isManagedSkill("migration-and-data-change")).toBe(true);
  });

  it("isManagedSkill returns false for unknown skills", () => {
    expect(isManagedSkill("nonexistent-skill")).toBe(false);
  });

  it("isCoreSkill returns false for graphify-explorer", () => {
    expect(isCoreSkill("graphify-explorer")).toBe(false);
  });

  it("isOptionalSkill returns false for graphify-explorer", () => {
    expect(isOptionalSkill("graphify-explorer")).toBe(false);
  });
});

describe("architecture core skill catalog", () => {
  it("contains exactly the local and cross architecture playbooks", () => {
    expect(CORE_SKILLS).toEqual([
      "local-architecture",
      "cross-repo-architecture",
    ]);
  });

  it("classifies both architecture playbooks as core managed skills", () => {
    expect(isCoreSkill("local-architecture")).toBe(true);
    expect(isCoreSkill("cross-repo-architecture")).toBe(true);
    expect(isManagedSkill("local-architecture")).toBe(true);
    expect(isManagedSkill("cross-repo-architecture")).toBe(true);
  });

  it("keeps both architecture playbooks out of optional skills", () => {
    expect(OPTIONAL_SKILLS).not.toContain("local-architecture");
    expect(OPTIONAL_SKILLS).not.toContain("cross-repo-architecture");
  });
});
