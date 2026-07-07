import { describe, it, expect } from "vitest";
import {
  resolveTarget,
  detectDefaultScope,
  isPackAgent,
  PACK_AGENTS,
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
