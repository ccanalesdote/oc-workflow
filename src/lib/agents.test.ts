import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  listManagedCatalog,
  listCustomManagedAgents,
  listBuiltinManagedAgents,
  getManagedAgent,
  isManagedAgentName,
  isCustomManagedAgent,
  isBuiltinManagedAgent,
  contentHasManagedMarker,
  fileHasManagedMarker,
  addManagedMarker,
  MANAGED_MARKER,
  BUILTIN_MANAGED_AGENTS,
  getManagedAgentState,
  listManagedAgentStatuses,
  listActiveManagedAgents,
  listActiveManagedModelAgents,
  detectManageableScopes,
  installCustomAgent,
  planArchitectReconciliation,
  applyArchitectReconciliation,
  deleteCustomAgent,
  hideBuiltinAgent,
  restoreBuiltinAgent,
  isBuiltinAgentHidden,
  type ManagedAgentKind,
  type ManagedAgentState,
  type ManagedAgent,
  type ManagedAgentStatus,
} from "./agents.js";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { resolveTarget, type InstallTarget } from "./paths.js";
import { readTemplate } from "./templates.js";
import { parseFrontmatter, setModelInContent } from "./frontmatter.js";

const FIXTURE_DIR = join(import.meta.dirname, "__fixtures__", "agents");

beforeEach(() => {
  mkdirSync(FIXTURE_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

function fixtureTarget(scope: "project" | "global" = "project"): InstallTarget {
  // Use a subdirectory as the fixture target
  if (scope === "project") {
    const base = join(FIXTURE_DIR, "project");
    mkdirSync(join(base, ".opencode", "agent"), { recursive: true });
    return {
      scope: "project",
      agentDir: join(base, ".opencode", "agent"),
      configPath: join(base, ".opencode", "opencode.json"),
      skillDir: join(base, ".opencode", "skills"),
    };
  }
  const base = join(FIXTURE_DIR, "global");
  mkdirSync(join(base, "agent"), { recursive: true });
  return {
    scope: "global",
    agentDir: join(base, "agent"),
    configPath: join(base, "opencode.json"),
    skillDir: join(base, "skills"),
  };
}

function writeConfig(
  configPath: string,
  config: Record<string, unknown>
): void {
  mkdirSync(join(configPath, ".."), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

function writeAgentFile(
  agentDir: string,
  name: string,
  content: string
): void {
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, `${name}.md`), content, "utf-8");
}

const SAMPLE_AGENT_CONTENT = `---
description: Test agent
mode: primary
permission:
  edit: deny
  write: deny
  bash: deny
  task: allow
---

You are Test, a test agent.
`;

const SAMPLE_AGENT_WITH_MARKER = `${SAMPLE_AGENT_CONTENT}${MANAGED_MARKER}\n`;

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

describe("listManagedCatalog", () => {
  it("includes custom template agents", () => {
    const catalog = listManagedCatalog();
    const customNames = catalog.filter((a) => a.kind === "custom").map((a) => a.name);
    // Should include the six template agents
    expect(customNames).toContain("spec");
    expect(customNames).toContain("architect");
    expect(customNames).toContain("developer");
    expect(customNames).toContain("reviewer");
    expect(customNames).toContain("auditor");
    expect(customNames).toContain("research");
  });

  it("includes built-in managed agents (plan, build, and explore)", () => {
    const catalog = listManagedCatalog();
    const builtinNames = catalog.filter((a) => a.kind === "builtin").map((a) => a.name);
    expect(builtinNames).toContain("plan");
    expect(builtinNames).toContain("build");
    expect(builtinNames).toContain("explore");
  });

  it("custom agents come before built-ins", () => {
    const catalog = listManagedCatalog();
    const firstBuiltinIdx = catalog.findIndex((a) => a.kind === "builtin");
    const lastCustomIdx = catalog.filter((a) => a.kind === "custom").length - 1;
    expect(firstBuiltinIdx).toBeGreaterThan(lastCustomIdx);
  });
});

describe("listCustomManagedAgents", () => {
  it("returns only custom agents", () => {
    const agents = listCustomManagedAgents();
    expect(agents.every((a) => a.kind === "custom")).toBe(true);
    expect(agents.length).toBeGreaterThanOrEqual(6);
  });
});

describe("listBuiltinManagedAgents", () => {
  it("returns only builtin agents", () => {
    const agents = listBuiltinManagedAgents();
    expect(agents.every((a) => a.kind === "builtin")).toBe(true);
    expect(agents.map((a) => a.name)).toEqual(["plan", "build", "explore"]);
  });
});

describe("getManagedAgent", () => {
  it("returns the agent for a known managed name", () => {
    const agent = getManagedAgent("plan");
    expect(agent).toBeDefined();
    expect(agent!.kind).toBe("builtin");
  });

  it("returns builtin agent for explore", () => {
    const agent = getManagedAgent("explore");
    expect(agent).toBeDefined();
    expect(agent!.kind).toBe("builtin");
  });

  it("returns custom agent for a template name", () => {
    const agent = getManagedAgent("developer");
    expect(agent).toBeDefined();
    expect(agent!.kind).toBe("custom");
  });

  it("returns undefined for a non-managed name", () => {
    expect(getManagedAgent("general")).toBeUndefined();
    expect(getManagedAgent("task")).toBeUndefined();
  });
});

describe("isManagedAgentName", () => {
  it("recognizes managed agent names", () => {
    expect(isManagedAgentName("plan")).toBe(true);
    expect(isManagedAgentName("build")).toBe(true);
    expect(isManagedAgentName("explore")).toBe(true);
    expect(isManagedAgentName("developer")).toBe(true);
  });

  it("does not match non-managed names", () => {
    expect(isManagedAgentName("general")).toBe(false);
    expect(isManagedAgentName("task")).toBe(false);
  });
});

describe("isCustomManagedAgent", () => {
  it("returns true for custom managed agents", () => {
    expect(isCustomManagedAgent("developer")).toBe(true);
    expect(isCustomManagedAgent("spec")).toBe(true);
  });

  it("returns false for builtin agents", () => {
    expect(isCustomManagedAgent("plan")).toBe(false);
    expect(isCustomManagedAgent("build")).toBe(false);
    expect(isCustomManagedAgent("explore")).toBe(false);
  });

  it("returns false for non-managed names", () => {
    expect(isCustomManagedAgent("general")).toBe(false);
  });
});

describe("isBuiltinManagedAgent", () => {
  it("returns true for plan, build, and explore", () => {
    expect(isBuiltinManagedAgent("plan")).toBe(true);
    expect(isBuiltinManagedAgent("build")).toBe(true);
    expect(isBuiltinManagedAgent("explore")).toBe(true);
  });

  it("returns false for custom agents", () => {
    expect(isBuiltinManagedAgent("developer")).toBe(false);
  });
});

describe("BUILTIN_MANAGED_AGENTS", () => {
  it("includes explore alongside plan and build", () => {
    expect(BUILTIN_MANAGED_AGENTS).toContain("plan");
    expect(BUILTIN_MANAGED_AGENTS).toContain("build");
    expect(BUILTIN_MANAGED_AGENTS).toContain("explore");
  });
});

// ---------------------------------------------------------------------------
// Marker
// ---------------------------------------------------------------------------

describe("contentHasManagedMarker", () => {
  it("detects the marker in content", () => {
    const content = `${SAMPLE_AGENT_CONTENT}${MANAGED_MARKER}\n`;
    expect(contentHasManagedMarker(content)).toBe(true);
  });

  it("returns false when marker is absent", () => {
    expect(contentHasManagedMarker(SAMPLE_AGENT_CONTENT)).toBe(false);
  });
});

describe("fileHasManagedMarker", () => {
  it("returns true for a file with the marker", () => {
    const filePath = join(FIXTURE_DIR, "with-marker.md");
    writeFileSync(filePath, SAMPLE_AGENT_WITH_MARKER, "utf-8");
    expect(fileHasManagedMarker(filePath)).toBe(true);
  });

  it("returns false for a file without the marker", () => {
    const filePath = join(FIXTURE_DIR, "without-marker.md");
    writeFileSync(filePath, SAMPLE_AGENT_CONTENT, "utf-8");
    expect(fileHasManagedMarker(filePath)).toBe(false);
  });

  it("returns false for a non-existent file", () => {
    expect(fileHasManagedMarker("/nonexistent/file.md")).toBe(false);
  });
});

describe("addManagedMarker", () => {
  it("adds the marker to content without it", () => {
    const result = addManagedMarker(SAMPLE_AGENT_CONTENT);
    expect(result).toContain(MANAGED_MARKER);
    expect(result.endsWith("\n")).toBe(true);
  });

  it("does not duplicate the marker if already present", () => {
    const content = SAMPLE_AGENT_WITH_MARKER;
    const result = addManagedMarker(content);
    const markerCount = result.split(MANAGED_MARKER).length - 1;
    expect(markerCount).toBe(1);
  });
});

describe("Architect reconciliation", () => {
  it("plans and applies a missing Architect as create", () => {
    const target = fixtureTarget();
    const plan = planArchitectReconciliation(target);

    expect(plan?.name).toBe("architect");
    expect(plan?.action).toBe("create");
    expect(plan?.path).toBe(join(target.agentDir, "architect.md"));

    expect(applyArchitectReconciliation(plan!, target)).toBe("create");
    expect(readFileSync(plan!.path, "utf-8")).toContain(MANAGED_MARKER);
  });

  it("plans marked canonical Architect as unchanged", () => {
    const target = fixtureTarget();
    installCustomAgent("architect", target);

    const plan = planArchitectReconciliation(target);
    expect(plan?.action).toBe("unchanged");
  });

  it("updates marked drift while preserving the exact valid model", () => {
    const target = fixtureTarget();
    const content = addManagedMarker(
      readTemplate("architect")
        .replace("mode: primary", "mode: primary\nmodel: saved/provider-model")
        .replace("You are Architect, a strategic design partner.", "Legacy Architect body.")
    );
    writeAgentFile(target.agentDir, "architect", content);

    const plan = planArchitectReconciliation(target);
    expect(plan?.action).toBe("update");
    expect(plan?.expectedContent).toContain("model: saved/provider-model");
    expect(applyArchitectReconciliation(plan!, target)).toBe("update");

    const updated = readFileSync(plan!.path, "utf-8");
    expect(updated).toContain("model: saved/provider-model");
    expect(updated).not.toContain("Legacy Architect body.");
  });

  it.each(["provider/model #pinned", "provider/model:variant"])(
    "revalidates and preserves a newer YAML-sensitive model before apply: %s",
    (model) => {
      const target = fixtureTarget();
      const initial = addManagedMarker(
        readTemplate("architect")
          .replace("mode: primary", "mode: primary\nmodel: old/provider")
          .replace("You are Architect, a strategic design partner.", "Legacy Architect body.")
      );
      writeAgentFile(target.agentDir, "architect", initial);

      const plan = planArchitectReconciliation(target);
      expect(plan?.action).toBe("update");

      const changedDuringApproval = setModelInContent(initial, model);
      writeAgentFile(target.agentDir, "architect", changedDuringApproval);

      expect(applyArchitectReconciliation(plan!, target)).toBe("update");
      const updated = readFileSync(plan!.path, "utf-8");
      expect(parseFrontmatter(updated).frontmatter.model).toBe(model);
      expect(updated).not.toContain("Legacy Architect body.");
    }
  );

  it("returns unchanged without rewriting when Architect becomes canonical before apply", () => {
    const target = fixtureTarget();
    const initial = addManagedMarker(
      readTemplate("architect").replace(
        "You are Architect, a strategic design partner.",
        "Legacy Architect body."
      )
    );
    writeAgentFile(target.agentDir, "architect", initial);

    const plan = planArchitectReconciliation(target);
    expect(plan?.action).toBe("update");
    writeAgentFile(target.agentDir, "architect", plan!.expectedContent!);
    const canonical = readFileSync(plan!.path, "utf-8");

    expect(applyArchitectReconciliation(plan!, target)).toBe("unchanged");
    expect(readFileSync(plan!.path, "utf-8")).toBe(canonical);
  });

  it.each([
    ["frontmatter becomes invalid", `---\nmodel: [broken\n---\n${MANAGED_MARKER}\n`],
    ["managed marker is removed", readTemplate("architect").replace(MANAGED_MARKER, "")],
  ])("preserves Architect when %s after planning", (_label, changedContent) => {
    const target = fixtureTarget();
    const initial = addManagedMarker(
      readTemplate("architect").replace(
        "You are Architect, a strategic design partner.",
        "Legacy Architect body."
      )
    );
    writeAgentFile(target.agentDir, "architect", initial);

    const plan = planArchitectReconciliation(target);
    expect(plan?.action).toBe("update");
    writeAgentFile(target.agentDir, "architect", changedContent);
    const beforeApply = readFileSync(plan!.path, "utf-8");

    expect(applyArchitectReconciliation(plan!, target)).toBe("conflict");
    expect(readFileSync(plan!.path, "utf-8")).toBe(beforeApply);
  });

  it("does not overwrite a file that appears during a create race", () => {
    const target = fixtureTarget();
    const plan = planArchitectReconciliation(target);
    expect(plan?.action).toBe("create");

    const manualFile = "# Manual Architect appeared during approval\n";
    writeAgentFile(target.agentDir, "architect", manualFile);

    expect(applyArchitectReconciliation(plan!, target)).toBe("conflict");
    expect(readFileSync(plan!.path, "utf-8")).toBe(manualFile);
  });

  it("does not rewrite a compatible file that wins a create race", () => {
    const target = fixtureTarget();
    const plan = planArchitectReconciliation(target);
    expect(plan?.action).toBe("create");
    writeAgentFile(target.agentDir, "architect", plan!.expectedContent!);
    const canonical = readFileSync(plan!.path, "utf-8");

    expect(applyArchitectReconciliation(plan!, target)).toBe("unchanged");
    expect(readFileSync(plan!.path, "utf-8")).toBe(canonical);
  });

  it.each([
    ["unmarked file", "# Manual Architect\n"],
    ["malformed frontmatter", `---\nmodel: [broken\n---\n${MANAGED_MARKER}\n`],
    ["invalid model", addManagedMarker(readTemplate("architect").replace("mode: primary", "mode: primary\nmodel: \"\""))],
  ])("preserves %s as conflict", (_label, content) => {
    const target = fixtureTarget();
    writeAgentFile(target.agentDir, "architect", content);

    const plan = planArchitectReconciliation(target);
    expect(plan?.action).toBe("conflict");
    expect(() => applyArchitectReconciliation(plan!, target)).not.toThrow();
    expect(readFileSync(plan!.path, "utf-8")).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// State detection
// ---------------------------------------------------------------------------

describe("getManagedAgentState", () => {
  it("returns 'missing' for a custom agent with no file", () => {
    const target = fixtureTarget();
    const agent: ManagedAgent = { name: "developer", kind: "custom" };
    expect(getManagedAgentState(agent, target)).toBe("missing");
  });

  it("returns 'active' for a custom agent with managed marker", () => {
    const target = fixtureTarget();
    writeAgentFile(target.agentDir, "developer", SAMPLE_AGENT_WITH_MARKER);

    const agent: ManagedAgent = { name: "developer", kind: "custom" };
    expect(getManagedAgentState(agent, target)).toBe("active");
  });

  it("returns 'conflict' for a custom agent with file but no marker", () => {
    const target = fixtureTarget();
    writeAgentFile(target.agentDir, "developer", SAMPLE_AGENT_CONTENT);

    const agent: ManagedAgent = { name: "developer", kind: "custom" };
    expect(getManagedAgentState(agent, target)).toBe("conflict");
  });

  it("returns 'active' for a builtin agent by default (no config)", () => {
    const target = fixtureTarget();
    const agent: ManagedAgent = { name: "plan", kind: "builtin" };
    expect(getManagedAgentState(agent, target)).toBe("active");
  });

  it("returns 'active' for explore builtin agent by default (no config)", () => {
    const target = fixtureTarget();
    const agent: ManagedAgent = { name: "explore", kind: "builtin" };
    expect(getManagedAgentState(agent, target)).toBe("active");
  });

  it("returns 'hidden' for a builtin agent with disable: true", () => {
    const target = fixtureTarget();
    writeConfig(target.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: {
        plan: { disable: true },
      },
    });

    const agent: ManagedAgent = { name: "plan", kind: "builtin" };
    expect(getManagedAgentState(agent, target)).toBe("hidden");
  });

  it("returns 'hidden' for explore with disable: true", () => {
    const target = fixtureTarget();
    writeConfig(target.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: {
        explore: { disable: true },
      },
    });

    const agent: ManagedAgent = { name: "explore", kind: "builtin" };
    expect(getManagedAgentState(agent, target)).toBe("hidden");
  });

  it("returns 'active' for a builtin agent with disable: false", () => {
    const target = fixtureTarget();
    writeConfig(target.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: {
        plan: { disable: false },
      },
    });

    const agent: ManagedAgent = { name: "plan", kind: "builtin" };
    expect(getManagedAgentState(agent, target)).toBe("active");
  });

  it("returns 'active' for a builtin agent with other config but no disable", () => {
    const target = fixtureTarget();
    writeConfig(target.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: {
        build: { model: "anthropic/claude-sonnet-4-6" },
      },
    });

    const agent: ManagedAgent = { name: "build", kind: "builtin" };
    expect(getManagedAgentState(agent, target)).toBe("active");
  });
});

describe("listManagedAgentStatuses", () => {
  it("returns statuses for all managed agents", () => {
    const target = fixtureTarget();
    const statuses = listManagedAgentStatuses(target);

    // Should have entries for all catalog agents
    expect(statuses.length).toBe(listManagedCatalog().length);

    // All should have state
    expect(statuses.every((s) => ["active", "missing", "hidden", "conflict"].includes(s.state))).toBe(true);
  });
});

describe("listActiveManagedAgents", () => {
  it("returns only active agents", () => {
    const target = fixtureTarget();
    // By default, built-ins are active, custom agents are missing
    const active = listActiveManagedAgents(target);

    // Only built-ins should be active by default
    expect(active.every((a) => a.state === "active")).toBe(true);
    expect(active.some((a) => a.name === "plan")).toBe(true);
    expect(active.some((a) => a.name === "build")).toBe(true);
    expect(active.some((a) => a.name === "explore")).toBe(true);

    // Custom agents without files should not be active
    expect(active.some((a) => a.name === "developer")).toBe(false);
  });

  it("includes active custom agents", () => {
    const target = fixtureTarget();
    writeAgentFile(target.agentDir, "developer", SAMPLE_AGENT_WITH_MARKER);

    const active = listActiveManagedAgents(target);
    expect(active.some((a) => a.name === "developer" && a.kind === "custom")).toBe(true);
  });
});

describe("listActiveManagedModelAgents", () => {
  it("returns the same result as listActiveManagedAgents", () => {
    const target = fixtureTarget();
    const active = listActiveManagedAgents(target);
    const modelAgents = listActiveManagedModelAgents(target);
    expect(modelAgents).toEqual(active);
  });
});

// ---------------------------------------------------------------------------
// Mutate operations
// ---------------------------------------------------------------------------

describe("installCustomAgent", () => {
  it("creates a new agent file with the managed marker", () => {
    const target = fixtureTarget();
    const result = installCustomAgent("developer", target);

    expect(result).toBe("created");
    const filePath = join(target.agentDir, "developer.md");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain(MANAGED_MARKER);
    expect(content).toContain("description:");
  });

  it("returns 'already_active' for an existing managed file", () => {
    const target = fixtureTarget();
    writeAgentFile(target.agentDir, "developer", SAMPLE_AGENT_WITH_MARKER);

    const result = installCustomAgent("developer", target);
    expect(result).toBe("already_active");
  });

  it("returns 'conflict' for an existing file without the marker", () => {
    const target = fixtureTarget();
    writeAgentFile(target.agentDir, "developer", SAMPLE_AGENT_CONTENT);

    const result = installCustomAgent("developer", target);
    expect(result).toBe("conflict");
  });
});

describe("deleteCustomAgent", () => {
  it("deletes a managed agent file", () => {
    const target = fixtureTarget();
    writeAgentFile(target.agentDir, "developer", SAMPLE_AGENT_WITH_MARKER);

    const result = deleteCustomAgent("developer", target);
    expect(result).toBe(true);
    expect(existsSync(join(target.agentDir, "developer.md"))).toBe(false);
  });

  it("returns false for a non-existent file", () => {
    const target = fixtureTarget();
    const result = deleteCustomAgent("developer", target);
    expect(result).toBe(false);
  });

  it("returns false for a file without the managed marker (conflict protection)", () => {
    const target = fixtureTarget();
    writeAgentFile(target.agentDir, "developer", SAMPLE_AGENT_CONTENT);

    const result = deleteCustomAgent("developer", target);
    expect(result).toBe(false);
    // File should still exist
    expect(existsSync(join(target.agentDir, "developer.md"))).toBe(true);
  });
});

describe("hideBuiltinAgent", () => {
  it("sets disable: true in the config", () => {
    const target = fixtureTarget();
    writeConfig(target.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: {
        plan: { model: "anthropic/claude-sonnet-4-6" },
      },
    });

    hideBuiltinAgent("plan", target);

    const config = JSON.parse(readFileSync(target.configPath, "utf-8"));
    expect(config.agent.plan.disable).toBe(true);
    // Model should be preserved
    expect(config.agent.plan.model).toBe("anthropic/claude-sonnet-4-6");
  });

  it("creates agent config if it does not exist", () => {
    const target = fixtureTarget();
    writeConfig(target.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: {},
    });

    hideBuiltinAgent("build", target);

    const config = JSON.parse(readFileSync(target.configPath, "utf-8"));
    expect(config.agent.build.disable).toBe(true);
  });

  it("creates config file if it does not exist", () => {
    const target = fixtureTarget();
    // Don't create a config file
    const configPath = target.configPath;
    if (existsSync(configPath)) {
      rmSync(configPath);
    }

    hideBuiltinAgent("plan", target);

    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.agent.plan.disable).toBe(true);
  });
});

describe("restoreBuiltinAgent", () => {
  it("removes disable from the config", () => {
    const target = fixtureTarget();
    writeConfig(target.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: {
        plan: { disable: true, model: "anthropic/claude-sonnet-4-6" },
      },
    });

    restoreBuiltinAgent("plan", target);

    const config = JSON.parse(readFileSync(target.configPath, "utf-8"));
    expect(config.agent.plan.disable).toBeUndefined();
    // Model should be preserved
    expect(config.agent.plan.model).toBe("anthropic/claude-sonnet-4-6");
  });

  it("is a no-op if disable is not set", () => {
    const target = fixtureTarget();
    writeConfig(target.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: {
        build: { model: "some-model" },
      },
    });

    restoreBuiltinAgent("build", target);

    const config = JSON.parse(readFileSync(target.configPath, "utf-8"));
    expect(config.agent.build.disable).toBeUndefined();
    expect(config.agent.build.model).toBe("some-model");
  });
});

describe("isBuiltinAgentHidden", () => {
  it("returns true when agent is hidden", () => {
    const target = fixtureTarget();
    writeConfig(target.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: {
        plan: { disable: true },
      },
    });

    expect(isBuiltinAgentHidden("plan", target)).toBe(true);
  });

  it("returns false when agent is active", () => {
    const target = fixtureTarget();
    writeConfig(target.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: {
        plan: {},
      },
    });

    expect(isBuiltinAgentHidden("plan", target)).toBe(false);
  });

  it("returns false when no config exists", () => {
    const target = fixtureTarget();
    expect(isBuiltinAgentHidden("plan", target)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("models candidate list excludes inactive/conflict agents", () => {
    const target = fixtureTarget();
    // No custom agents installed, all missing
    const modelCandidates = listActiveManagedModelAgents(target);
    const customCandidates = modelCandidates.filter((a) => a.kind === "custom");

    // Only built-ins should be active by default
    expect(customCandidates.length).toBe(0);
    expect(modelCandidates.some((a) => a.name === "plan")).toBe(true);
    expect(modelCandidates.some((a) => a.name === "build")).toBe(true);
    expect(modelCandidates.some((a) => a.name === "explore")).toBe(true);
  });

  it("models candidate list excludes hidden built-ins", () => {
    const target = fixtureTarget();
    writeConfig(target.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: {
        plan: { disable: true },
      },
    });

    const modelCandidates = listActiveManagedModelAgents(target);
    expect(modelCandidates.some((a) => a.name === "plan")).toBe(false);
    expect(modelCandidates.some((a) => a.name === "build")).toBe(true);
  });

  it("conflict custom agents are not in active list", () => {
    const target = fixtureTarget();
    writeAgentFile(target.agentDir, "developer", SAMPLE_AGENT_CONTENT); // No marker

    const active = listActiveManagedAgents(target);
    expect(active.some((a) => a.name === "developer")).toBe(false);

    const statuses = listManagedAgentStatuses(target);
    const devStatus = statuses.find((a) => a.name === "developer");
    expect(devStatus?.state).toBe("conflict");
  });

  it("hiding then restoring builtin preserves model", () => {
    const target = fixtureTarget();
    writeConfig(target.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: {
        plan: { model: "anthropic/claude-sonnet-4-6", description: "Plan agent" },
      },
    });

    hideBuiltinAgent("plan", target);
    let config = JSON.parse(readFileSync(target.configPath, "utf-8"));
    expect(config.agent.plan.disable).toBe(true);
    expect(config.agent.plan.model).toBe("anthropic/claude-sonnet-4-6");
    expect(config.agent.plan.description).toBe("Plan agent");

    restoreBuiltinAgent("plan", target);
    config = JSON.parse(readFileSync(target.configPath, "utf-8"));
    expect(config.agent.plan.disable).toBeUndefined();
    expect(config.agent.plan.model).toBe("anthropic/claude-sonnet-4-6");
    expect(config.agent.plan.description).toBe("Plan agent");
  });

  it("hiding then restoring explore preserves model", () => {
    const target = fixtureTarget();
    writeConfig(target.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: {
        explore: { model: "anthropic/claude-sonnet-4-6" },
      },
    });

    hideBuiltinAgent("explore", target);
    let config = JSON.parse(readFileSync(target.configPath, "utf-8"));
    expect(config.agent.explore.disable).toBe(true);
    expect(config.agent.explore.model).toBe("anthropic/claude-sonnet-4-6");

    restoreBuiltinAgent("explore", target);
    config = JSON.parse(readFileSync(target.configPath, "utf-8"));
    expect(config.agent.explore.disable).toBeUndefined();
    expect(config.agent.explore.model).toBe("anthropic/claude-sonnet-4-6");
  });

  it("external agents like general or task are not in managed catalog", () => {
    const catalog = listManagedCatalog();
    expect(catalog.some((a) => a.name === "general")).toBe(false);
    expect(catalog.some((a) => a.name === "task")).toBe(false);
  });

  it("compute-then-apply pattern: no mutation until explicitly applied", () => {
    const target = fixtureTarget();

    // Initially no custom agents are installed
    const initialStatuses = listManagedAgentStatuses(target);
    const devInitial = initialStatuses.find((a) => a.name === "developer");
    expect(devInitial?.state).toBe("missing");
    expect(devInitial?.kind).toBe("custom");

    // Compute the plan: developer should be installed
    const plan = initialStatuses
      .filter((a) => a.kind === "custom" && a.state === "missing")
      .map((a) => a.name);

    expect(plan).toContain("developer");

    // BEFORE applying, verify no mutation has occurred
    const filePath = join(target.agentDir, "developer.md");
    expect(existsSync(filePath)).toBe(false);

    // NOW apply the install
    const result = installCustomAgent("developer", target);
    expect(result).toBe("created");
    expect(existsSync(filePath)).toBe(true);
  });

  it("active agents remain active when selection correction is applied", () => {
    const target = fixtureTarget();
    writeAgentFile(target.agentDir, "developer", SAMPLE_AGENT_WITH_MARKER);

    // Developer is active
    const statuses = listManagedAgentStatuses(target);
    const devStatus = statuses.find((a) => a.name === "developer");
    expect(devStatus?.state).toBe("active");

    // Simulate the init command's selection correction:
    // If the user deselects an active agent, init should re-add it.
    // This tests the principle, not the interactive prompt.
    const activeNames = statuses
      .filter((a) => a.state === "active")
      .map((a) => a.name);

    // Simulate user deselecting "developer"
    const userSelection = new Set(activeNames.filter((n) => n !== "developer"));

    // Init command's correction logic:
    for (const name of activeNames) {
      userSelection.add(name); // Force re-add
    }

    // Developer should be back in the selection
    expect(userSelection.has("developer")).toBe(true);

    // After correction, developer should still be active
    expect(devStatus?.state).toBe("active");
  });

  it("conflict agents cannot be selected for modification", () => {
    const target = fixtureTarget();
    writeAgentFile(target.agentDir, "reviewer", SAMPLE_AGENT_CONTENT); // No marker = conflict

    const statuses = listManagedAgentStatuses(target);
    const reviewerStatus = statuses.find((a) => a.name === "reviewer");
    expect(reviewerStatus?.state).toBe("conflict");

    // Simulate init command's correction logic:
    // conflict agents must be removed from selection
    const userSelection = new Set(["reviewer"]);
    const conflictNames = statuses
      .filter((a) => a.state === "conflict")
      .map((a) => a.name);

    for (const name of conflictNames) {
      userSelection.delete(name);
    }

    expect(userSelection.has("reviewer")).toBe(false);

    // Verify the conflict file was NOT modified
    const filePath = join(target.agentDir, "reviewer.md");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).not.toContain(MANAGED_MARKER);
  });

  it("zero active agents: models and profiles see empty candidate lists", () => {
    const target = fixtureTarget();

    // Hide all built-ins
    hideBuiltinAgent("plan", target);
    hideBuiltinAgent("build", target);
    hideBuiltinAgent("explore", target);

    // No custom agents installed
    const activeAgents = listActiveManagedAgents(target);
    expect(activeAgents.length).toBe(0);

    const modelCandidates = listActiveManagedModelAgents(target);
    expect(modelCandidates.length).toBe(0);
  });

  it("project target without init still has manageable built-in agents", () => {
    // Simulate a target with no config file and no agent directory
    // (i.e., opencode-path init has never been run in this project)
    const base = join(FIXTURE_DIR, "no-init-project");
    const noInitTarget: InstallTarget = {
      scope: "project",
      agentDir: join(base, ".opencode", "agent"),
      configPath: join(base, ".opencode", "opencode.json"),
      skillDir: join(base, ".opencode", "skills"),
    };
    // Intentionally do NOT create directories or config

    // The catalog should still list all managed agents
    const statuses = listManagedAgentStatuses(noInitTarget);
    expect(statuses.length).toBeGreaterThan(0);

    // Built-ins (plan, build, explore) should be active even without config
    const builtinStatuses = statuses.filter((a) => a.kind === "builtin");
    expect(builtinStatuses.length).toBe(3); // plan, build, explore
    expect(builtinStatuses.every((s) => s.state === "active")).toBe(true);

    // Custom agents should be missing (no files)
    const customStatuses = statuses.filter((a) => a.kind === "custom");
    expect(customStatuses.every((s) => s.state === "missing")).toBe(true);

    // Active list should contain the 3 built-ins
    const active = listActiveManagedAgents(noInitTarget);
    expect(active.length).toBe(3);
    expect(active.map((a) => a.name).sort()).toEqual(["build", "explore", "plan"]);
  });

  it("project target without init: agents command can hide built-in at project level", () => {
    const base = join(FIXTURE_DIR, "hide-no-init-project");
    const noInitTarget: InstallTarget = {
      scope: "project",
      agentDir: join(base, ".opencode", "agent"),
      configPath: join(base, ".opencode", "opencode.json"),
      skillDir: join(base, ".opencode", "skills"),
    };

    // Initially active
    const agent: ManagedAgent = { name: "explore", kind: "builtin" };
    expect(getManagedAgentState(agent, noInitTarget)).toBe("active");

    // Hide explore (this creates the config file on demand)
    hideBuiltinAgent("explore", noInitTarget);

    // Now explore should be hidden
    expect(getManagedAgentState(agent, noInitTarget)).toBe("hidden");

    // Other built-ins should still be active
    const planAgent: ManagedAgent = { name: "plan", kind: "builtin" };
    expect(getManagedAgentState(planAgent, noInitTarget)).toBe("active");
  });

  it("project target without init: models sees active built-ins", () => {
    const base = join(FIXTURE_DIR, "models-no-init-project");
    const noInitTarget: InstallTarget = {
      scope: "project",
      agentDir: join(base, ".opencode", "agent"),
      configPath: join(base, ".opencode", "opencode.json"),
      skillDir: join(base, ".opencode", "skills"),
    };

    // models uses listActiveManagedModelAgents
    const modelAgents = listActiveManagedModelAgents(noInitTarget);
    expect(modelAgents.length).toBe(3);
    expect(modelAgents.map((a) => a.name).sort()).toEqual(["build", "explore", "plan"]);
  });

  it("global config exists but project has no init: project target still manageable", () => {
    // Set up a global config with some agents hidden
    const globalBase = join(FIXTURE_DIR, "global-with-config");
    mkdirSync(join(globalBase, "agent"), { recursive: true });
    const globalTarget: InstallTarget = {
      scope: "global",
      agentDir: join(globalBase, "agent"),
      configPath: join(globalBase, "opencode.json"),
      skillDir: join(globalBase, "skills"),
    };
    writeConfig(globalTarget.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: {
        explore: { disable: true },
      },
    });

    // Set up a project with no init (no dirs, no config)
    const projectBase = join(FIXTURE_DIR, "project-no-init-with-global");
    const projectTarget: InstallTarget = {
      scope: "project",
      agentDir: join(projectBase, ".opencode", "agent"),
      configPath: join(projectBase, ".opencode", "opencode.json"),
      skillDir: join(projectBase, ".opencode", "skills"),
    };

    // Both targets should have manageable agents
    const projectStatuses = listManagedAgentStatuses(projectTarget);
    expect(projectStatuses.length).toBeGreaterThan(0);

    const globalStatuses = listManagedAgentStatuses(globalTarget);
    expect(globalStatuses.length).toBeGreaterThan(0);

    // At project, explore is active (no config to disable it)
    const projectExplore = projectStatuses.find((a) => a.name === "explore");
    expect(projectExplore?.state).toBe("active");

    // At global, explore is hidden
    const globalExplore = globalStatuses.find((a) => a.name === "explore");
    expect(globalExplore?.state).toBe("hidden");

    // Project target has active built-ins for models
    const projectActive = listActiveManagedAgents(projectTarget);
    expect(projectActive.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Target detection (detectManageableScopes)
// ---------------------------------------------------------------------------

describe("detectManageableScopes", () => {
  it("both targets manageable by default (no config, no init)", () => {
    const projectBase = join(FIXTURE_DIR, "detect-both-empty-project");
    const projectTarget: InstallTarget = {
      scope: "project",
      agentDir: join(projectBase, ".opencode", "agent"),
      configPath: join(projectBase, ".opencode", "opencode.json"),
      skillDir: join(projectBase, ".opencode", "skills"),
    };

    const globalBase = join(FIXTURE_DIR, "detect-both-empty-global");
    const globalTarget: InstallTarget = {
      scope: "global",
      agentDir: join(globalBase, "agent"),
      configPath: join(globalBase, "opencode.json"),
      skillDir: join(globalBase, "skills"),
    };

    const result = detectManageableScopes(projectTarget, globalTarget);
    expect(result.projectManageable).toBe(true);
    expect(result.globalManageable).toBe(true);
  });

  it("project still manageable when global config exists and project has no init", () => {
    // Global config with hidden explore
    const globalBase = join(FIXTURE_DIR, "detect-global-exists");
    mkdirSync(join(globalBase, "agent"), { recursive: true });
    const globalTarget: InstallTarget = {
      scope: "global",
      agentDir: join(globalBase, "agent"),
      configPath: join(globalBase, "opencode.json"),
      skillDir: join(globalBase, "skills"),
    };
    writeConfig(globalTarget.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: { explore: { disable: true } },
    });

    // Project with no init
    const projectBase = join(FIXTURE_DIR, "detect-project-no-init");
    const projectTarget: InstallTarget = {
      scope: "project",
      agentDir: join(projectBase, ".opencode", "agent"),
      configPath: join(projectBase, ".opencode", "opencode.json"),
      skillDir: join(projectBase, ".opencode", "skills"),
    };

    const result = detectManageableScopes(projectTarget, globalTarget);
    expect(result.projectManageable).toBe(true); // This is the key assertion
    expect(result.globalManageable).toBe(true);
  });

  it("both targets remain manageable when all project built-ins are hidden", () => {
    // Project config with all built-ins hidden
    const projectBase = join(FIXTURE_DIR, "detect-project-all-hidden");
    mkdirSync(join(projectBase, ".opencode", "agent"), { recursive: true });
    const projectTarget: InstallTarget = {
      scope: "project",
      agentDir: join(projectBase, ".opencode", "agent"),
      configPath: join(projectBase, ".opencode", "opencode.json"),
      skillDir: join(projectBase, ".opencode", "skills"),
    };
    writeConfig(projectTarget.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: {
        plan: { disable: true },
        build: { disable: true },
        explore: { disable: true },
      },
    });

    // Global with no config (built-ins active by default)
    const globalBase = join(FIXTURE_DIR, "detect-global-default");
    const globalTarget: InstallTarget = {
      scope: "global",
      agentDir: join(globalBase, "agent"),
      configPath: join(globalBase, "opencode.json"),
      skillDir: join(globalBase, "skills"),
    };

    const result = detectManageableScopes(projectTarget, globalTarget);
    // Project still has catalog entries (managed agents exist even if all hidden)
    // "manageable" means agents in the catalog, not just active ones
    expect(result.projectManageable).toBe(true);
    expect(result.globalManageable).toBe(true);
  });

  it("gracefully handles invalid JSON in non-selected target config", () => {
    // Project with invalid JSON config
    const projectBase = join(FIXTURE_DIR, "detect-project-invalid-json");
    mkdirSync(join(projectBase, ".opencode"), { recursive: true });
    const projectTarget: InstallTarget = {
      scope: "project",
      agentDir: join(projectBase, ".opencode", "agent"),
      configPath: join(projectBase, ".opencode", "opencode.json"),
      skillDir: join(projectBase, ".opencode", "skills"),
    };
    writeFileSync(projectTarget.configPath, "{ invalid json !!!", "utf-8");

    // Global with valid config
    const globalBase = join(FIXTURE_DIR, "detect-global-valid-json");
    mkdirSync(join(globalBase, "agent"), { recursive: true });
    const globalTarget: InstallTarget = {
      scope: "global",
      agentDir: join(globalBase, "agent"),
      configPath: join(globalBase, "opencode.json"),
      skillDir: join(globalBase, "skills"),
    };
    writeConfig(globalTarget.configPath, {
      $schema: "https://opencode.ai/config.json",
      agent: {},
    });

    // Should NOT throw — falls back to considering target manageable
    const result = detectManageableScopes(projectTarget, globalTarget);
    expect(result.projectManageable).toBe(true); // Built-ins active by default
    expect(result.globalManageable).toBe(true);
  });
});
