import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock @inquirer/prompts so we never block on a real terminal.
vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  checkbox: vi.fn(),
  confirm: vi.fn(),
  input: vi.fn(),
  Separator: class Separator {},
}));

import { confirm } from "@inquirer/prompts";
import { uninstallCommand } from "./uninstall.js";
import {
  CancellationError,
  UsageError,
  CANCEL_VALUE,
  _resetSigintStateForTest,
} from "../lib/ui.js";
import { addManagedMarker, MANAGED_MARKER } from "../lib/agents.js";
import { installCoreSkill } from "../lib/skills.js";
import { readTemplate } from "../lib/templates.js";

const EXIT_PROMPT_ERROR = { name: "ExitPromptError" };

/**
 * Build a project fixture at the current cwd.
 */
function setupProjectFixture(opts?: {
  activeCustom?: string[];
  config?: Record<string, unknown>;
  manualFiles?: string[];
  activeSkills?: string[];
}): string {
  const tmp = mkdtempSync(join(tmpdir(), "uninstall-cmd-"));
  const agentDir = join(tmp, ".opencode", "agent");
  mkdirSync(agentDir, { recursive: true });

  const configPath = join(tmp, ".opencode", "opencode.json");
  const config = opts?.config ?? {
    $schema: "https://opencode.ai/config.json",
    agent: {},
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

  for (const name of opts?.activeCustom ?? []) {
    const templateContent = readTemplate(name as any);
    const contentWithMarker = addManagedMarker(templateContent);
    writeFileSync(join(agentDir, `${name}.md`), contentWithMarker, "utf-8");
  }

  for (const name of opts?.manualFiles ?? []) {
    writeFileSync(
      join(agentDir, `${name}.md`),
      `---\ndescription: manual\nmode: primary\n---\n\nmanual body\n`,
      "utf-8"
    );
  }

  // Pre-install core skills if requested
  if (opts?.activeSkills) {
    const skillDir = join(tmp, ".opencode", "skills");
    const target = {
      scope: "project" as const,
      agentDir,
      configPath,
      skillDir,
    };
    for (const skillName of opts.activeSkills) {
      installCoreSkill(skillName as any, target);
    }
  }

  return tmp;
}

describe("uninstallCommand", () => {
  let originalCwd: string;
  let tmpRoot: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    _resetSigintStateForTest();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    _resetSigintStateForTest();
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function chdirToFixture(opts?: {
    activeCustom?: string[];
    config?: Record<string, unknown>;
    manualFiles?: string[];
    activeSkills?: string[];
  }): string {
    tmpRoot = setupProjectFixture(opts);
    process.chdir(tmpRoot);
    return tmpRoot;
  }

  // ---------------------------------------------------------------------------

  it("rejects with UsageError when both --global and --project are passed", async () => {
    chdirToFixture();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      uninstallCommand({ global: true, project: true })
    ).rejects.toBeInstanceOf(UsageError);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("prints 'No changes needed.' when no managed files or config entries exist", async () => {
    chdirToFixture(); // empty project

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true });

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("No changes needed.");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("--yes removes managed files without asking for confirmation", async () => {
    const root = chdirToFixture({ activeCustom: ["developer", "reviewer"] });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true, yes: true });

    // confirm should NOT have been called
    expect(confirm).not.toHaveBeenCalled();

    // Managed files should be deleted.
    expect(existsSync(join(root, ".opencode", "agent", "developer.md"))).toBe(
      false
    );
    expect(existsSync(join(root, ".opencode", "agent", "reviewer.md"))).toBe(
      false
    );

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("removes only managed files and skips unmarked files", async () => {
    const root = chdirToFixture({
      activeCustom: ["developer"],
      manualFiles: ["custom-agent"],
    });

    // Confirm the removal.
    vi.mocked(confirm).mockResolvedValueOnce(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true });

    // Confirmation prompt only references files, not config entries.
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Remove the files listed above?" })
    );

    // Managed file deleted.
    expect(existsSync(join(root, ".opencode", "agent", "developer.md"))).toBe(
      false
    );
    // Unmarked file preserved.
    expect(
      existsSync(join(root, ".opencode", "agent", "custom-agent.md"))
    ).toBe(true);

    // Warning about skipped files.
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Unmarked files");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("preserves all built-in agent config entries (disable and model) during uninstall", async () => {
    const root = chdirToFixture({
      activeCustom: ["developer"],
      config: {
        $schema: "https://opencode.ai/config.json",
        agent: {
          plan: { model: "model-a", disable: true },
          build: { model: "model-b" },
          explore: {},
        },
      },
    });

    vi.mocked(confirm).mockResolvedValueOnce(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true });

    // opencode.json still exists.
    expect(existsSync(join(root, ".opencode", "opencode.json"))).toBe(true);

    // Config entries are all preserved (disable AND model).
    const config = JSON.parse(
      readFileSync(join(root, ".opencode", "opencode.json"), "utf-8")
    );
    // plan: disable AND model both preserved
    expect(config.agent.plan).toBeDefined();
    expect(config.agent.plan.model).toBe("model-a");
    expect(config.agent.plan.disable).toBe(true);
    // build: model preserved
    expect(config.agent.build).toBeDefined();
    expect(config.agent.build.model).toBe("model-b");
    // The $schema and agent object are preserved.
    expect(config.$schema).toBe("https://opencode.ai/config.json");

    // Managed file deleted.
    expect(existsSync(join(root, ".opencode", "agent", "developer.md"))).toBe(false);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("preserves all config fields including disable and custom fields", async () => {
    const root = chdirToFixture({
      config: {
        $schema: "https://opencode.ai/config.json",
        agent: {
          plan: { model: "model-a", disable: true, customField: "keep-me" },
        },
      },
    });

    vi.mocked(confirm).mockResolvedValueOnce(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true });

    const config = JSON.parse(
      readFileSync(join(root, ".opencode", "opencode.json"), "utf-8")
    );
    // All config fields preserved: model, disable, and customField
    expect(config.agent.plan).toBeDefined();
    expect(config.agent.plan.customField).toBe("keep-me");
    expect(config.agent.plan.model).toBe("model-a");
    expect(config.agent.plan.disable).toBe(true);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("cancel declines removal and leaves files intact", async () => {
    const root = chdirToFixture({ activeCustom: ["developer"] });

    vi.mocked(confirm).mockResolvedValueOnce(false);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true });

    // File still exists.
    expect(existsSync(join(root, ".opencode", "agent", "developer.md"))).toBe(
      true
    );
    // Cancel message printed.
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Cancelled.");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("preserves manually disabled built-in agents (provenance unknown)", async () => {
    // User manually set disable: true on plan and explore — uninstall must
    // not re-enable them because we cannot prove opencode-path created the entry.
    const root = chdirToFixture({
      config: {
        $schema: "https://opencode.ai/config.json",
        agent: {
          plan: { disable: true },
          explore: { disable: true, model: "user-picked-model" },
        },
      },
    });

    // No managed files → no changes needed.
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true });

    // Config is completely untouched.
    const config = JSON.parse(
      readFileSync(join(root, ".opencode", "opencode.json"), "utf-8")
    );
    expect(config.agent.plan.disable).toBe(true);
    expect(config.agent.explore.disable).toBe(true);
    expect(config.agent.explore.model).toBe("user-picked-model");

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("No changes needed.");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("never deletes opencode.json even when all agents are managed", async () => {
    const root = chdirToFixture({
      activeCustom: ["developer", "reviewer"],
      config: {
        $schema: "https://opencode.ai/config.json",
        agent: {
          plan: { disable: true, model: "m1" },
          build: { model: "m2" },
        },
      },
    });

    vi.mocked(confirm).mockResolvedValueOnce(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true });

    // opencode.json still exists and is untouched.
    expect(existsSync(join(root, ".opencode", "opencode.json"))).toBe(true);
    const config = JSON.parse(
      readFileSync(join(root, ".opencode", "opencode.json"), "utf-8")
    );
    expect(config.agent.plan.disable).toBe(true);
    expect(config.agent.plan.model).toBe("m1");
    expect(config.agent.build.model).toBe("m2");

    // Managed files deleted.
    expect(existsSync(join(root, ".opencode", "agent", "developer.md"))).toBe(false);
    expect(existsSync(join(root, ".opencode", "agent", "reviewer.md"))).toBe(false);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Skill-related uninstall tests (AC-07, AC-08, AC-11)
  // ---------------------------------------------------------------------------

  it("uninstall removes managed core skills alongside agents", async () => {
    const root = chdirToFixture({
      activeCustom: ["developer"],
      activeSkills: ["cross-repo-architecture"],
    });

    vi.mocked(confirm).mockResolvedValueOnce(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true });

    // Managed agent file deleted
    expect(
      existsSync(join(root, ".opencode", "agent", "developer.md"))
    ).toBe(false);

    // Managed skill file deleted
    const skillPath = join(
      root, ".opencode", "skills", "cross-repo-architecture", "SKILL.md"
    );
    expect(existsSync(skillPath)).toBe(false);

    // Skill directory cleaned up
    const skillDir = join(root, ".opencode", "skills", "cross-repo-architecture");
    expect(existsSync(skillDir)).toBe(false);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("uninstall preserves unmarked skill files", async () => {
    const root = chdirToFixture({
      activeSkills: ["cross-repo-architecture"],
    });

    // Create a manual skill file without the managed marker
    const manualSkillDir = join(root, ".opencode", "skills", "custom-skill");
    mkdirSync(manualSkillDir, { recursive: true });
    writeFileSync(
      join(manualSkillDir, "SKILL.md"),
      "# Custom skill\n",
      "utf-8"
    );

    vi.mocked(confirm).mockResolvedValueOnce(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true });

    // Managed skill deleted
    expect(
      existsSync(join(root, ".opencode", "skills", "cross-repo-architecture", "SKILL.md"))
    ).toBe(false);

    // Unmarked skill preserved
    expect(
      existsSync(join(manualSkillDir, "SKILL.md"))
    ).toBe(true);

    const unmarkedContent = readFileSync(
      join(manualSkillDir, "SKILL.md"), "utf-8"
    );
    expect(unmarkedContent).toBe("# Custom skill\n");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("uninstall preserves unmarked core skill file (cross-repo-architecture without marker)", async () => {
    const root = chdirToFixture({ activeCustom: ["developer"] });

    // Create an unmarked core skill file (simulating user-created file without managed marker)
    const skillDir = join(root, ".opencode", "skills", "cross-repo-architecture");
    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, "SKILL.md");
    const userContent = "# My cross-repo notes\n## Custom content\n";
    writeFileSync(skillPath, userContent, "utf-8");

    vi.mocked(confirm).mockResolvedValueOnce(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true });

    // Managed agent file deleted
    expect(
      existsSync(join(root, ".opencode", "agent", "developer.md"))
    ).toBe(false);

    // Unmarked core skill preserved
    expect(existsSync(skillPath)).toBe(true);
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toBe(userContent);

    // Warning about skipped skills
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Skip skills (unmarked)");
    expect(output).toContain("cross-repo-architecture");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
