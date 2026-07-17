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
import { CORE_SKILLS } from "../lib/paths.js";
import { readTemplate } from "../lib/templates.js";

const EXIT_PROMPT_ERROR = { name: "ExitPromptError" };
const CORE_SKILL_NAMES = [...CORE_SKILLS];

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
      activeSkills: CORE_SKILL_NAMES,
    });

    vi.mocked(confirm).mockResolvedValueOnce(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true });

    // Managed agent file deleted
    expect(
      existsSync(join(root, ".opencode", "agent", "developer.md"))
    ).toBe(false);

    // Both managed core skill files and directories are deleted
    for (const skillName of CORE_SKILL_NAMES) {
      const skillPath = join(root, ".opencode", "skills", skillName, "SKILL.md");
      expect(existsSync(skillPath)).toBe(false);
      const skillDir = join(root, ".opencode", "skills", skillName);
      expect(existsSync(skillDir)).toBe(false);
    }

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("uninstall preserves unmarked skill files", async () => {
    const root = chdirToFixture({
      activeSkills: CORE_SKILL_NAMES,
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

    // Both managed core skills deleted
    for (const skillName of CORE_SKILL_NAMES) {
      expect(existsSync(join(root, ".opencode", "skills", skillName, "SKILL.md"))).toBe(false);
    }

    // Unmarked skill preserved
    expect(
      existsSync(join(manualSkillDir, "SKILL.md"))
    ).toBe(true);

    const unmarkedContent = readFileSync(
      join(manualSkillDir, "SKILL.md"), "utf-8"
    );
    expect(unmarkedContent).toBe("# Custom skill\n");

    // Warning/summary about preserved unmarked skills
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Skip skills:");
    expect(output).toContain("custom-skill");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("uninstall preserves unmarked core skill files without markers", async () => {
    const root = chdirToFixture({ activeCustom: ["developer"] });

    // Create unmarked core skill files (simulating user-created files without markers)
    const userContent = "# My architecture notes\n## Custom content\n";
    for (const skillName of CORE_SKILL_NAMES) {
      const skillDir = join(root, ".opencode", "skills", skillName);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, "SKILL.md"), userContent, "utf-8");
    }

    vi.mocked(confirm).mockResolvedValueOnce(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true });

    // Managed agent file deleted
    expect(
      existsSync(join(root, ".opencode", "agent", "developer.md"))
    ).toBe(false);

    // Unmarked core skills preserved
    for (const skillName of CORE_SKILL_NAMES) {
      const skillPath = join(root, ".opencode", "skills", skillName, "SKILL.md");
      expect(existsSync(skillPath)).toBe(true);
      expect(readFileSync(skillPath, "utf-8")).toBe(userContent);
    }

    // Warning about skipped skills
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Skip skills:");
    for (const skillName of CORE_SKILL_NAMES) {
      expect(output).toContain(skillName);
    }

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Optional skill uninstall tests (AC-08)
  // ---------------------------------------------------------------------------

  it("uninstall removes managed optional skills", async () => {
    const root = chdirToFixture({
      activeSkills: [...CORE_SKILL_NAMES, "migration-and-data-change"],
    });

    vi.mocked(confirm).mockResolvedValueOnce(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true });

    // Both core skills deleted
    for (const skillName of CORE_SKILL_NAMES) {
      expect(existsSync(join(root, ".opencode", "skills", skillName, "SKILL.md"))).toBe(false);
    }

    // Optional skill deleted
    expect(
      existsSync(join(root, ".opencode", "skills", "migration-and-data-change", "SKILL.md"))
    ).toBe(false);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("uninstall preserves unmarked optional skill files", async () => {
    const root = chdirToFixture({
      activeSkills: ["migration-and-data-change"],
    });

    // Create an unmarked optional skill file (different from the managed one)
    const unmarkedSkillDir = join(root, ".opencode", "skills", "api-contracts");
    mkdirSync(unmarkedSkillDir, { recursive: true });
    writeFileSync(join(unmarkedSkillDir, "SKILL.md"), "# Custom API notes\n", "utf-8");

    vi.mocked(confirm).mockResolvedValueOnce(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true });

    // Managed optional skill deleted
    expect(
      existsSync(join(root, ".opencode", "skills", "migration-and-data-change", "SKILL.md"))
    ).toBe(false);

    // Unmarked optional skill preserved
    const unmarkedPath = join(unmarkedSkillDir, "SKILL.md");
    expect(existsSync(unmarkedPath)).toBe(true);
    expect(readFileSync(unmarkedPath, "utf-8")).toBe("# Custom API notes\n");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("uninstall removes both core and optional managed skills together", async () => {
    const root = chdirToFixture({
      activeSkills: [...CORE_SKILL_NAMES, "migration-and-data-change", "test-strategy"],
    });

    vi.mocked(confirm).mockResolvedValueOnce(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true });

    // All managed skills deleted
    for (const skillName of CORE_SKILL_NAMES) {
      expect(existsSync(join(root, ".opencode", "skills", skillName, "SKILL.md"))).toBe(false);
    }
    expect(
      existsSync(join(root, ".opencode", "skills", "migration-and-data-change", "SKILL.md"))
    ).toBe(false);
    expect(
      existsSync(join(root, ".opencode", "skills", "test-strategy", "SKILL.md"))
    ).toBe(false);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("uninstall preserves unknown skill folders not in the managed catalog", async () => {
    const root = chdirToFixture({
      activeSkills: CORE_SKILL_NAMES,
    });

    // Create an unknown skill folder (not in the managed catalog)
    const unknownSkillDir = join(root, ".opencode", "skills", "my-custom-tool");
    mkdirSync(unknownSkillDir, { recursive: true });
    // Even if it contains the managed marker, it should be preserved
    writeFileSync(
      join(unknownSkillDir, "SKILL.md"),
      `# My custom tool\n<!-- managed-by: opencode-path -->\n`,
      "utf-8"
    );

    vi.mocked(confirm).mockResolvedValueOnce(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await uninstallCommand({ project: true });

    // Both core managed skills deleted
    for (const skillName of CORE_SKILL_NAMES) {
      expect(existsSync(join(root, ".opencode", "skills", skillName, "SKILL.md"))).toBe(false);
    }

    // Unknown skill preserved even with marker
    expect(
      existsSync(join(unknownSkillDir, "SKILL.md"))
    ).toBe(true);

    // Reported as skipped
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Skip skills:");
    expect(output).toContain("my-custom-tool");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
