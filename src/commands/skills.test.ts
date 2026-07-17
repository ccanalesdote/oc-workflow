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

// Mock @inquirer/prompts
vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  checkbox: vi.fn(),
  confirm: vi.fn(),
  input: vi.fn(),
  Separator: class Separator {},
}));

import { checkbox, confirm } from "@inquirer/prompts";
import { skillsCommand } from "./skills.js";
import {
  UsageError,
  _resetSigintStateForTest,
} from "../lib/ui.js";
import { installManagedSkill } from "../lib/skills.js";
import { CORE_SKILLS } from "../lib/paths.js";
import { MANAGED_MARKER } from "../lib/agents.js";

const CORE_SKILL_NAMES = [...CORE_SKILLS];

function setupProjectFixture(opts?: {
  activeSkills?: string[];
  manualSkills?: string[];
}): string {
  const tmp = mkdtempSync(join(tmpdir(), "skills-cmd-"));
  const agentDir = join(tmp, ".opencode", "agent");
  mkdirSync(agentDir, { recursive: true });

  const configPath = join(tmp, ".opencode", "opencode.json");
  writeFileSync(
    configPath,
    JSON.stringify({ $schema: "https://opencode.ai/config.json", agent: {} }, null, 2),
    "utf-8"
  );

  const skillDir = join(tmp, ".opencode", "skills");
  const target = {
    scope: "project" as const,
    agentDir,
    configPath,
    skillDir,
  };

  if (opts?.activeSkills) {
    for (const skillName of opts.activeSkills) {
      installManagedSkill(skillName as any, target);
    }
  }

  if (opts?.manualSkills) {
    for (const skillName of opts.manualSkills) {
      const dir = join(skillDir, skillName);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "SKILL.md"),
        `# ${skillName}\n`,
        "utf-8"
      );
    }
  }

  return tmp;
}

describe("skillsCommand", () => {
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
    activeSkills?: string[];
    manualSkills?: string[];
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
      skillsCommand({ global: true, project: true })
    ).rejects.toBeInstanceOf(UsageError);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("prints 'No changes needed.' when no optional skills exist to manage", async () => {
    chdirToFixture(); // empty, no skills installed

    // All optional skills are "missing", so checkbox has them all unchecked
    // User doesn't check any → no install, no delete → no changes
    vi.mocked(checkbox).mockResolvedValueOnce([]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await skillsCommand({ project: true });

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("No changes needed.");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("installs checked missing optional skills", async () => {
    const root = chdirToFixture();

    // User checks migration-and-data-change (missing) → install
    vi.mocked(checkbox).mockResolvedValueOnce(["migration-and-data-change"]);
    vi.mocked(confirm).mockResolvedValueOnce(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await skillsCommand({ project: true });

    const skillPath = join(
      root, ".opencode", "skills", "migration-and-data-change", "SKILL.md"
    );
    expect(existsSync(skillPath)).toBe(true);
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toContain("<!-- managed-by: opencode-path -->");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("removes unchecked active optional skills", async () => {
    const root = chdirToFixture({
      activeSkills: ["migration-and-data-change", "api-contracts"],
    });

    // api-contracts was active but user unchecks it → remove
    vi.mocked(checkbox).mockResolvedValueOnce(["migration-and-data-change"]);
    vi.mocked(confirm).mockResolvedValueOnce(true);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await skillsCommand({ project: true });

    // migration-and-data-change still active
    expect(
      existsSync(join(root, ".opencode", "skills", "migration-and-data-change", "SKILL.md"))
    ).toBe(true);

    // api-contracts removed
    expect(
      existsSync(join(root, ".opencode", "skills", "api-contracts", "SKILL.md"))
    ).toBe(false);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("does not remove core skills even if unchecked", async () => {
    const root = chdirToFixture({
      activeSkills: CORE_SKILL_NAMES,
    });

    // Core skills are not shown in checkbox; user selects nothing
    vi.mocked(checkbox).mockResolvedValueOnce([]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await skillsCommand({ project: true });

    // Both core skills still exist (unmodified)
    for (const skillName of CORE_SKILL_NAMES) {
      const skillPath = join(root, ".opencode", "skills", skillName, "SKILL.md");
      expect(existsSync(skillPath)).toBe(true);
      expect(readFileSync(skillPath, "utf-8")).toContain("<!-- managed-by: opencode-path -->");
    }

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("leaves checked active optional skills unchanged", async () => {
    const root = chdirToFixture({
      activeSkills: ["migration-and-data-change"],
    });

    // Keep it checked → unchanged
    vi.mocked(checkbox).mockResolvedValueOnce(["migration-and-data-change"]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await skillsCommand({ project: true });

    const skillPath = join(
      root, ".opencode", "skills", "migration-and-data-change", "SKILL.md"
    );
    expect(existsSync(skillPath)).toBe(true);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("refuses to overwrite unmarked conflicts and shows conflict warning", async () => {
    const root = chdirToFixture({
      manualSkills: ["migration-and-data-change"],
    });

    // User tries to check migration-and-data-change (conflict state)
    // The checkbox marks it disabled so it can't actually be selected,
    // but the mock simulates the user trying
    vi.mocked(checkbox).mockResolvedValueOnce([]); // conflict disabled, user picks none

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await skillsCommand({ project: true });

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    // Should warn about conflict
    expect(output).toContain("manual files without the managed marker");

    const skillPath = join(
      root, ".opencode", "skills", "migration-and-data-change", "SKILL.md"
    );
    // Original content preserved
    expect(readFileSync(skillPath, "utf-8")).toBe("# migration-and-data-change\n");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("shows conflict plan but does not print completion or restart when only conflicts exist", async () => {
    // Setup: manual (unmarked) skill files exist, no managed skills
    chdirToFixture({
      manualSkills: ["migration-and-data-change", "api-contracts"],
    });

    // No optional skills are selectable (all in conflict state)
    vi.mocked(checkbox).mockResolvedValueOnce([]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await skillsCommand({ project: true });

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");

    // Should show conflict warning
    expect(output).toContain("manual files without the managed marker");
    // Should show planned changes summary with Conflicts line
    expect(output).toContain("Planned changes:");
    expect(output).toContain("Conflicts:");
    // Should show conflict resolution hint
    expect(output).toContain("manual files without the managed marker");
    // Should NOT print completion message since no files were changed
    expect(output).not.toContain("Complete");
    // Should NOT print restart warning since no files were changed
    expect(output).not.toContain("Restart");
    // confirm() should not have been called (no changes to confirm)
    expect(confirm).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("--dry-run shows planned changes but writes no files", async () => {
    const root = chdirToFixture();

    // User checks migration-and-data-change (missing) → would install
    vi.mocked(checkbox).mockResolvedValueOnce(["migration-and-data-change"]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await skillsCommand({ project: true, dryRun: true });

    // No file was created
    expect(
      existsSync(join(root, ".opencode", "skills", "migration-and-data-change", "SKILL.md"))
    ).toBe(false);

    // Dry-run label printed
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("No files were modified");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("--yes applies changes without confirmation", async () => {
    const root = chdirToFixture();

    vi.mocked(checkbox).mockResolvedValueOnce(["migration-and-data-change"]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await skillsCommand({ project: true, yes: true });

    // confirm() should not have been called
    expect(confirm).not.toHaveBeenCalled();

    // File was installed
    expect(
      existsSync(join(root, ".opencode", "skills", "migration-and-data-change", "SKILL.md"))
    ).toBe(true);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("cancel declines removal and leaves files intact", async () => {
    const root = chdirToFixture({
      activeSkills: ["migration-and-data-change"],
    });

    vi.mocked(checkbox).mockResolvedValueOnce([]); // uncheck → would delete
    vi.mocked(confirm).mockResolvedValueOnce(false); // decline

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await skillsCommand({ project: true });

    // File still exists
    expect(
      existsSync(join(root, ".opencode", "skills", "migration-and-data-change", "SKILL.md"))
    ).toBe(true);

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Cancelled.");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("supports global scope flag (dry-run to avoid real writes)", async () => {
    // Test that --global flag resolves global target path (dry-run only)
    chdirToFixture();

    // User checks no skills
    vi.mocked(checkbox).mockResolvedValueOnce([]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Use dry-run to avoid writing to real ~/.config/opencode
    await skillsCommand({ global: true, dryRun: true });

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    // Should reference ~/.config/opencode/ path
    expect(output).toContain(".config/opencode");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
