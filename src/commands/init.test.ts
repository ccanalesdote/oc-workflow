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

// Mock agents.js so we can intercept applyAgentChanges for the apply-phase
// SIGINT test. The default implementation delegates to the original function.
vi.mock("../lib/agents.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/agents.js")>();
  return {
    ...original,
    applyAgentChanges: vi.fn(original.applyAgentChanges),
  };
});

import { select, checkbox, confirm, input } from "@inquirer/prompts";
import { initCommand } from "./init.js";
import {
  CancellationError,
  UsageError,
  CANCEL_VALUE,
  _resetSigintStateForTest,
} from "../lib/ui.js";
import {
  addManagedMarker,
  MANAGED_MARKER,
  applyAgentChanges,
} from "../lib/agents.js";
import { readTemplate, validateAllTemplates } from "../lib/templates.js";
import { installCoreSkill } from "../lib/skills.js";
import * as opencodeModels from "../lib/opencode-models.js";
import { CUSTOM_MODEL_VALUE } from "../lib/opencode-models.js";
import * as messages from "../lib/messages.js";

const EXIT_PROMPT_ERROR = { name: "ExitPromptError" };
const SKIP_AGENTS_VALUE = "__skip_agents__";
const SKIP_PROFILES_VALUE = "__skip_profiles__";
const SKIP_MODELS_VALUE = "__skip_models__";
const SKIP_ONE_MODEL_VALUE = "__skip_one_model__";

const SKIP_OPTIONAL_SKILLS_VALUE = "__skip_optional_skills__";

/**
 * Build a project fixture at the current cwd with a fresh .opencode/agent
 * directory and a minimal opencode.json.
 */
function setupProjectFixture(opts?: {
  activeCustom?: string[];
  builtinModels?: Record<string, string>;
  activeSkills?: string[];
}): string {
  const tmp = mkdtempSync(join(tmpdir(), "init-cmd-"));
  const agentDir = join(tmp, ".opencode", "agent");
  mkdirSync(agentDir, { recursive: true });

  const configPath = join(tmp, ".opencode", "opencode.json");
  let config: Record<string, unknown> = {
    $schema: "https://opencode.ai/config.json",
    agent: {},
  };
  if (opts?.builtinModels) {
    const agentObj: Record<string, unknown> = {};
    for (const [name, model] of Object.entries(opts.builtinModels)) {
      agentObj[name] = { model };
    }
    config.agent = agentObj;
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

  for (const name of opts?.activeCustom ?? []) {
    const templateContent = readTemplate(name as any);
    const contentWithMarker = addManagedMarker(templateContent);
    writeFileSync(join(agentDir, `${name}.md`), contentWithMarker, "utf-8");
  }

  // Pre-install core skills if requested (for tests that check "no changes")
  if (opts?.activeSkills) {
    const target = {
      scope: "project" as const,
      agentDir,
      configPath,
      skillDir: join(tmp, ".opencode", "skills"),
    };
    for (const skillName of opts.activeSkills) {
      installCoreSkill(skillName as any, target);
    }
  }

  return tmp;
}

describe("initCommand", () => {
  let originalCwd: string;
  let tmpRoot: string;
  let modelsSpy: ReturnType<typeof vi.spyOn>;
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalCwd = process.cwd();
    _resetSigintStateForTest();
    vi.clearAllMocks();
    modelsSpy = (vi
      .spyOn(opencodeModels, "listOpenCodeModelsAsync")
      .mockResolvedValue(["model-a", "model-b"]) as unknown) as ReturnType<
      typeof vi.spyOn
    >;
    stderrWriteSpy = (vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true) as unknown) as ReturnType<
      typeof vi.spyOn
    >;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    _resetSigintStateForTest();
    modelsSpy.mockRestore();
    stderrWriteSpy.mockRestore();
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function chdirToFixture(opts?: {
    activeCustom?: string[];
    builtinModels?: Record<string, string>;
    activeSkills?: string[];
  }): string {
    tmpRoot = setupProjectFixture(opts);
    process.chdir(tmpRoot);
    return tmpRoot;
  }

  /**
   * Helper: mock the model step to skip entirely.
   * The models step first calls select for "Model configuration:", which we
   * set to SKIP_MODELS_VALUE.
   */
  function mockModelsSkip() {
    vi.mocked(select).mockResolvedValueOnce(SKIP_MODELS_VALUE as any);
  }

  /**
   * Helper: mock the optional skills step to skip entirely.
   */
  function mockOptionalSkillsSkip() {
    vi.mocked(select).mockResolvedValueOnce(SKIP_OPTIONAL_SKILLS_VALUE as any);
  }

  /**
   * Helper: mock the model step to configure models for the given number
   * of active agents. Returns the model assigned to each agent.
   *
   * Mock call sequence for models step:
   * 1. select → "__configure__" (enter configure mode)
   * 2. select per agent → model value (or SKIP_ONE_MODEL_VALUE)
   */
  function mockModelsConfigure(
    agentCount: number,
    model: string = "model-a",
    skipCount: number = 0
  ) {
    // First select: choose "configure"
    vi.mocked(select).mockResolvedValueOnce("__configure__" as any);
    // Subsequent selects: one per agent
    for (let i = 0; i < agentCount; i++) {
      if (i < skipCount) {
        vi.mocked(select).mockResolvedValueOnce(
          SKIP_ONE_MODEL_VALUE as any
        );
      } else {
        vi.mocked(select).mockResolvedValueOnce(model as any);
      }
    }
  }

  // ---------------------------------------------------------------------------

  it("rejects with UsageError when both --global and --project are passed", async () => {
    chdirToFixture();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      initCommand({ global: true, project: true })
    ).rejects.toBeInstanceOf(UsageError);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("throws CancellationError when <- Cancel is selected during scope", async () => {
    chdirToFixture();
    vi.mocked(select).mockResolvedValueOnce(CANCEL_VALUE as any);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      initCommand({ project: true })
    ).rejects.toBeInstanceOf(CancellationError);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("prints 'No changes needed.' when all steps are skipped", async () => {
    chdirToFixture({
      activeCustom: [
        "spec",
        "architect",
        "developer",
        "reviewer",
        "auditor",
        "research",
      ],
      activeSkills: ["cross-repo-architecture"],
    });

    // Agent step: skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_AGENTS_VALUE as any);
    // Optional skills step: skip
    mockOptionalSkillsSkip();
    // Profile step: skip (patchable agents are active)
    vi.mocked(select).mockResolvedValueOnce(SKIP_PROFILES_VALUE as any);
    // Model step: skip
    mockModelsSkip();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true });

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("No changes needed.");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("--dry-run prints the plan and writes no files", async () => {
    const root = chdirToFixture(); // no custom installed; builtins active

    // Agent step: select "select agents" then pick developer
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce(["developer"]);
    // Optional skills step: skip
    mockOptionalSkillsSkip();
    // Profile step: developer will be active after install, so patchable → skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_PROFILES_VALUE as any);
    // Model step: 3 built-in agents active (plan, build, explore)
    // → configure, then assign model-a to plan, build, explore
    mockModelsConfigure(3, "model-a");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true, dryRun: true });

    // No file should have been created.
    expect(existsSync(join(root, ".opencode", "agent", "developer.md"))).toBe(
      false
    );
    // The dry-run label was printed.
    expect(
      logSpy.mock.calls.some((c) =>
        String(c[0]).includes("No files were modified")
      )
    ).toBe(true);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("--yes skips final confirmation but still shows prompts", async () => {
    const root = chdirToFixture();

    // Agent step: select agents, pick developer
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce(["developer"]);
    // Profile step: developer will be active after install, so patchable → skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_PROFILES_VALUE as any);
    // Model step: 3 built-in agents (plan, build, explore)
    // → configure, assign model-a to all 3
    mockModelsConfigure(3, "model-a");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true, yes: true });

    // confirm() should NOT have been called when --yes is set.
    expect(confirm).not.toHaveBeenCalled();

    // The agent file was written.
    expect(
      existsSync(join(root, ".opencode", "agent", "developer.md"))
    ).toBe(true);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("full flow installs agent, applies profile, sets model", async () => {
    const root = chdirToFixture();

    // Agent step: select agents, pick developer
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce(["developer"]);
    // Optional skills step: skip
    mockOptionalSkillsSkip();
    // Profile step: select profiles, pick javascript-typescript
    // (developer will be active after install, so patchable includes it)
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce(["javascript-typescript"]);
    // Model step: configure models for all active agents
    // built-in agents (plan, build, explore) + developer = 4 agents
    // But developer won't be installed yet at model-prompt time, only builtins are active
    // Actually: developer IS selected for install, and the code checks
    // plan.agentChanges.toInstall.includes(s.name), so developer is included
    mockModelsConfigure(4, "model-a");
    // Final confirm via uiSelect (uiConfirmWithCancel uses uiSelect)
    vi.mocked(select).mockResolvedValueOnce("yes" as any);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true });

    // Agent file was installed.
    expect(existsSync(join(root, ".opencode", "agent", "developer.md"))).toBe(
      true
    );
    // Profile was applied.
    const content = readFileSync(
      join(root, ".opencode", "agent", "developer.md"),
      "utf-8"
    );
    expect(content).toContain("BEGIN optional profile: javascript-typescript");
    // Model was set.
    expect(content).toContain("model: model-a");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("cancel before confirm writes no files", async () => {
    const root = chdirToFixture();

    // Agent step: select agents, pick developer
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce(["developer"]);
    // Optional skills step: skip
    mockOptionalSkillsSkip();
    // Profile step: developer will be active, so patchable → skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_PROFILES_VALUE as any);
    // Model step: skip
    mockModelsSkip();
    // Final confirm via uiSelect: decline (choose "no")
    vi.mocked(select).mockResolvedValueOnce("no" as any);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true });

    // No file should have been created.
    expect(existsSync(join(root, ".opencode", "agent", "developer.md"))).toBe(
      false
    );
    // Cancelled message was printed.
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Cancelled.");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("idempotent re-run prints 'No changes needed.' when everything is already active", async () => {
    chdirToFixture({
      activeCustom: [
        "spec",
        "architect",
        "developer",
        "reviewer",
        "auditor",
        "research",
      ],
      activeSkills: ["cross-repo-architecture"],
    });

    // Agent step: select agents → all 9 selected → no agent changes
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce([
      "spec",
      "architect",
      "developer",
      "reviewer",
      "auditor",
      "research",
      "plan",
      "build",
      "explore",
    ]);
    // Optional skills step: skip
    mockOptionalSkillsSkip();
    // Profile step: patchable agents (developer, reviewer, auditor) are active → skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_PROFILES_VALUE as any);
    // Model step: skip
    mockModelsSkip();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true });

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("No changes needed.");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("throws CancellationError when <- Cancel is selected in agent step", async () => {
    chdirToFixture();

    // Agent step: select → "__select__", then checkbox → cancel
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce([CANCEL_VALUE]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      initCommand({ project: true })
    ).rejects.toBeInstanceOf(CancellationError);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("throws CancellationError when ExitPromptError bubbles up", async () => {
    chdirToFixture();

    // Agent step: select → ExitPromptError (Ctrl+C)
    vi.mocked(select).mockRejectedValueOnce(EXIT_PROMPT_ERROR);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      initCommand({ project: true })
    ).rejects.toBeInstanceOf(CancellationError);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("exits 1 with template validation errors when templates are malformed", async () => {
    chdirToFixture();

    // Mock validateAllTemplates using vi.spyOn on the already-mocked module
    const spy = vi.spyOn(
      await import("../lib/templates.js"),
      "validateAllTemplates"
    );
    spy.mockReturnValue([
      "developer.md: Invalid frontmatter",
      "spec.md: Missing --- delimiter",
    ]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    try {
      await expect(
        initCommand({ project: true })
      ).rejects.toThrow("process.exit called");

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errorOutput = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(errorOutput).toContain("Malformed template frontmatter");
      expect(errorOutput).toContain("developer.md: Invalid frontmatter");
    } finally {
      spy.mockRestore();
      logSpy.mockRestore();
      errorSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("final confirm shows visible ← Cancel via uiSelect (not uiConfirm)", async () => {
    const root = chdirToFixture();

    // Agent step: select agents, pick developer
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce(["developer"]);
    // Optional skills step: skip
    mockOptionalSkillsSkip();
    // Profile step: skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_PROFILES_VALUE as any);
    // Model step: skip
    mockModelsSkip();
    // Final confirm via uiSelect: choose "no" (Cancel would throw CancellationError)
    vi.mocked(select).mockResolvedValueOnce("no" as any);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true });

    // The final confirm used uiSelect (which has ← Cancel), not uiConfirm
    // The last select call should be the final confirm
    const selectCalls = vi.mocked(select).mock.calls;
    const lastSelect = selectCalls[selectCalls.length - 1];
    // select receives an options object with message property
    expect(lastSelect[0]).toMatchObject({ message: "Apply these changes?" });

    // No file should have been created (user chose "no")
    expect(existsSync(join(root, ".opencode", "agent", "developer.md"))).toBe(false);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("profile idempotency: applies profile when mixed (one already profiled, one new)", async () => {
    // Developer already installed with javascript-typescript profile
    const root = chdirToFixture({ activeCustom: ["developer"] });
    const developerPath = join(root, ".opencode", "agent", "developer.md");
    // Add the profile to developer
    const { insertProfileIntoFile, getProfile } = await import("../lib/profiles.js");
    const jsProfile = getProfile("javascript-typescript")!;
    insertProfileIntoFile(developerPath, jsProfile, "dev");

    // Agent step: select agents → all active, no changes
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce([
      "developer", "reviewer", "auditor",
      "spec", "architect", "research",
      "plan", "build", "explore",
    ]);
    // Optional skills step: skip
    mockOptionalSkillsSkip();
    // Profile step: select javascript-typescript
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce(["javascript-typescript"]);
    // Model step: skip
    mockModelsSkip();
    // Final confirm
    vi.mocked(select).mockResolvedValueOnce("yes" as any);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true });

    // Reviewer should have the profile applied (it was not already applied)
    const reviewerPath = join(root, ".opencode", "agent", "reviewer.md");
    const reviewerContent = readFileSync(reviewerPath, "utf-8");
    expect(reviewerContent).toContain("BEGIN optional profile: javascript-typescript");

    // Developer should still have it (idempotent)
    const devContent = readFileSync(developerPath, "utf-8");
    expect(devContent).toContain("BEGIN optional profile: javascript-typescript");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("custom model path: choosing 'Custom model...' then entering a valid model succeeds", async () => {
    const root = chdirToFixture();

    // Agent step: select agents, pick developer
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce(["developer"]);
    // Optional skills step: skip
    mockOptionalSkillsSkip();
    // Profile step: skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_PROFILES_VALUE as any);
    // Model step: configure, then for each of 4 agents (plan, build, explore, developer)
    vi.mocked(select).mockResolvedValueOnce("__configure__" as any);
    vi.mocked(select).mockResolvedValueOnce(CUSTOM_MODEL_VALUE as any);
    vi.mocked(input).mockResolvedValueOnce("anthropic/claude-sonnet-4-6");
    vi.mocked(select).mockResolvedValueOnce(CUSTOM_MODEL_VALUE as any);
    vi.mocked(input).mockResolvedValueOnce("anthropic/claude-sonnet-4-6");
    vi.mocked(select).mockResolvedValueOnce(CUSTOM_MODEL_VALUE as any);
    vi.mocked(input).mockResolvedValueOnce("anthropic/claude-sonnet-4-6");
    vi.mocked(select).mockResolvedValueOnce(CUSTOM_MODEL_VALUE as any);
    vi.mocked(input).mockResolvedValueOnce("anthropic/claude-sonnet-4-6");
    // Final confirm
    vi.mocked(select).mockResolvedValueOnce("yes" as any);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true });

    // Agent file was installed.
    expect(existsSync(join(root, ".opencode", "agent", "developer.md"))).toBe(true);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("custom model path: cancellation via ← Cancel on confirm throws CancellationError", async () => {
    chdirToFixture();

    // Agent step: select agents, pick developer
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce(["developer"]);
    // Optional skills step: skip
    mockOptionalSkillsSkip();
    // Profile step: skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_PROFILES_VALUE as any);
    // Model step: configure, pick custom model for first agent
    vi.mocked(select).mockResolvedValueOnce("__configure__" as any);
    vi.mocked(select).mockResolvedValueOnce(CUSTOM_MODEL_VALUE as any);
    // User enters a model without "/" to trigger the format confirm
    vi.mocked(input).mockResolvedValueOnce("claude-sonnet");
    // User selects ← Cancel on the confirm (uiConfirmWithCancel uses uiSelect)
    vi.mocked(select).mockResolvedValueOnce(CANCEL_VALUE as any);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      initCommand({ project: true })
    ).rejects.toBeInstanceOf(CancellationError);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("custom model path: cancellation via Ctrl+C on input throws CancellationError", async () => {
    chdirToFixture();

    // Agent step: select agents, pick developer
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce(["developer"]);
    // Optional skills step: skip
    mockOptionalSkillsSkip();
    // Profile step: skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_PROFILES_VALUE as any);
    // Model step: configure, pick custom model for first agent
    vi.mocked(select).mockResolvedValueOnce("__configure__" as any);
    vi.mocked(select).mockResolvedValueOnce(CUSTOM_MODEL_VALUE as any);
    // User presses Ctrl+C on the input → ExitPromptError
    vi.mocked(input).mockRejectedValueOnce(EXIT_PROMPT_ERROR);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      initCommand({ project: true })
    ).rejects.toBeInstanceOf(CancellationError);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("custom model path: cancellation before confirm writes no files", async () => {
    const root = chdirToFixture();

    // Agent step: select agents, pick developer
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce(["developer"]);
    // Optional skills step: skip
    mockOptionalSkillsSkip();
    // Profile step: skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_PROFILES_VALUE as any);
    // Model step: configure, pick custom model for first agent
    vi.mocked(select).mockResolvedValueOnce("__configure__" as any);
    vi.mocked(select).mockResolvedValueOnce(CUSTOM_MODEL_VALUE as any);
    // User presses Ctrl+C on the input
    vi.mocked(input).mockRejectedValueOnce(EXIT_PROMPT_ERROR);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      initCommand({ project: true })
    ).rejects.toBeInstanceOf(CancellationError);

    // No files should have been written.
    expect(existsSync(join(root, ".opencode", "agent", "developer.md"))).toBe(false);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("prints partial-state warning and exits 1 when SIGINT is received during apply", async () => {
    const root = chdirToFixture();

    // Full flow: install developer, apply profile, configure models.
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce(["developer"]);
    // Optional skills step: skip
    mockOptionalSkillsSkip();
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce(["javascript-typescript"]);
    // Built-ins (plan, build, explore) + developer = 4 active model agents
    mockModelsConfigure(4, "model-a");
    // Final confirm: yes
    vi.mocked(select).mockResolvedValueOnce("yes" as any);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    // Emit SIGINT while the agent changes are being applied. The apply-phase
    // handler will set the interruption flag; the next checkpoint throws a
    // CancellationError and init prints the partial-state warning.
    vi.mocked(applyAgentChanges).mockImplementation(() => {
      process.emit("SIGINT");
      return {
        installed: [],
        deleted: [],
        restored: [],
        hidden: [],
        unchanged: [],
        conflicts: [],
      };
    });

    await expect(initCommand({ project: true })).rejects.toThrow(
      "process.exit called"
    );

    expect(applyAgentChanges).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    const output = [
      ...logSpy.mock.calls.map((c) => String(c[0])),
      ...errorSpy.mock.calls.map((c) => String(c[0])),
    ].join("\n");
    expect(output).toContain(messages.PARTIAL_STATE_WARNING);
    // Apply did not complete normally.
    expect(output).not.toContain("Installation complete!");

    vi.mocked(applyAgentChanges).mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Skill-related init tests (AC-07, AC-08, AC-09, AC-11)
  // ---------------------------------------------------------------------------

  it("fresh init installs the core skill alongside agents", async () => {
    const root = chdirToFixture();

    // Agent step: select agents, pick developer
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce(["developer"]);
    // Optional skills step: skip
    mockOptionalSkillsSkip();
    // Profile step: skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_PROFILES_VALUE as any);
    // Model step: skip
    mockModelsSkip();
    // Final confirm: yes
    vi.mocked(select).mockResolvedValueOnce("yes" as any);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true });

    // Agent was installed
    expect(existsSync(join(root, ".opencode", "agent", "developer.md"))).toBe(true);

    // Core skill was installed
    const skillPath = join(root, ".opencode", "skills", "cross-repo-architecture", "SKILL.md");
    expect(existsSync(skillPath)).toBe(true);
    const skillContent = readFileSync(skillPath, "utf-8");
    expect(skillContent).toContain("<!-- managed-by: opencode-path -->");
    expect(skillContent).toContain("Cross-Repo Architecture");

    // Result output mentions skill installation
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Skills installed:");
    expect(output).toContain("cross-repo-architecture");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("init with skill already installed does not reinstall", async () => {
    chdirToFixture({
      activeSkills: ["cross-repo-architecture"],
    });

    // Agent step: skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_AGENTS_VALUE as any);
    // Optional skills step: skip
    mockOptionalSkillsSkip();
    // Profile step: no patchable custom agents active, auto-skipped
    // Model step: skip
    mockModelsSkip();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true });

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    // Should report "No changes needed." since skill is already installed
    // and no agents/profiles/models were selected
    expect(output).toContain("No changes needed.");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("dry-run does not install the core skill", async () => {
    const root = chdirToFixture();

    // Agent step: skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_AGENTS_VALUE as any);
    // Optional skills step: skip
    mockOptionalSkillsSkip();
    // Profile step: no patchable custom agents active, auto-skipped
    // Model step: skip
    mockModelsSkip();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true, dryRun: true });

    // Skill file should NOT exist
    const skillPath = join(root, ".opencode", "skills", "cross-repo-architecture", "SKILL.md");
    expect(existsSync(skillPath)).toBe(false);

    // Dry-run label was printed
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("No files were modified");
    // Skills planned are shown
    expect(output).toContain("cross-repo-architecture");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("init warns about conflicting core skill and does not apply when only conflict exists", async () => {
    const root = chdirToFixture();

    // Create an unmanaged skill file without the managed marker
    const skillDir = join(root, ".opencode", "skills", "cross-repo-architecture");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "# Manual skill\n", "utf-8");

    // Agent step: skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_AGENTS_VALUE as any);
    // Optional skills step: skip
    mockOptionalSkillsSkip();
    // Profile step: no patchable custom agents active, auto-skipped
    // Model step: skip
    mockModelsSkip();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true });

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");

    // Should warn about conflicting skill
    expect(output).toContain("Conflicting skills");

    // Should NOT enter apply mode (no actionable changes)
    expect(output).toContain("No changes needed.");

    // Unmanaged file should NOT be overwritten
    const content = readFileSync(join(skillDir, "SKILL.md"), "utf-8");
    expect(content).toBe("# Manual skill\n");
    expect(content).not.toContain("<!-- managed-by: opencode-path -->");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Optional skill init tests (AC-03, AC-04)
  // ---------------------------------------------------------------------------

  it("--yes does not install optional skills automatically", async () => {
    const root = chdirToFixture();

    // Agent step: skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_AGENTS_VALUE as any);
    // Profile step: no patchable agents, auto-skipped
    // Model step: skip
    mockModelsSkip();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true, yes: true });

    // Optional skills should NOT be installed (--yes skips the step)
    const optSkillPath = join(
      root, ".opencode", "skills", "migration-and-data-change", "SKILL.md"
    );
    expect(existsSync(optSkillPath)).toBe(false);

    // But core skill should still be installed
    const coreSkillPath = join(
      root, ".opencode", "skills", "cross-repo-architecture", "SKILL.md"
    );
    expect(existsSync(coreSkillPath)).toBe(true);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("init does not remove optional skills when unchecked", async () => {
    const root = chdirToFixture({
      activeSkills: ["cross-repo-architecture", "migration-and-data-change"],
    });

    // Agent step: skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_AGENTS_VALUE as any);
    // Optional skills step: select, then uncheck if any checked
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce([]); // leave all unchecked
    // Profile step: no patchable, auto-skipped
    // Model step: skip
    mockModelsSkip();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true });

    // migration-and-data-change should STILL exist (init is add-only)
    const optSkillPath = join(
      root, ".opencode", "skills", "migration-and-data-change", "SKILL.md"
    );
    expect(existsSync(optSkillPath)).toBe(true);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("init installs selected optional skills", async () => {
    const root = chdirToFixture();

    // Agent step: skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_AGENTS_VALUE as any);
    // Optional skills step: select, check migration-and-data-change
    vi.mocked(select).mockResolvedValueOnce("__select__" as any);
    vi.mocked(checkbox).mockResolvedValueOnce(["migration-and-data-change"]);
    // Profile step: no patchable, auto-skipped
    // Model step: skip
    mockModelsSkip();
    // Final confirm: yes
    vi.mocked(select).mockResolvedValueOnce("yes" as any);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true });

    // Optional skill was installed
    const optSkillPath = join(
      root, ".opencode", "skills", "migration-and-data-change", "SKILL.md"
    );
    expect(existsSync(optSkillPath)).toBe(true);
    expect(readFileSync(optSkillPath, "utf-8")).toContain("<!-- managed-by: opencode-path -->");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("init warns about conflicting optional skills and excludes them from selection", async () => {
    const root = chdirToFixture();

    // Create an unmanaged optional skill file
    const skillDir = join(root, ".opencode", "skills", "migration-and-data-change");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "# Manual optional skill\n", "utf-8");

    // Agent step: skip
    vi.mocked(select).mockResolvedValueOnce(SKIP_AGENTS_VALUE as any);
    // Optional skills step: the conflicting one is excluded, but others are selectable
    vi.mocked(select).mockResolvedValueOnce(SKIP_OPTIONAL_SKILLS_VALUE as any);
    // Profile step: no patchable, auto-skipped
    // Model step: skip
    mockModelsSkip();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await initCommand({ project: true });

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    // Should warn about conflicting optional skill
    expect(output).toContain("Conflicting optional skills");
    expect(output).toContain("migration-and-data-change");

    // Unmanaged file should not be overwritten
    expect(readFileSync(join(skillDir, "SKILL.md"), "utf-8")).toBe("# Manual optional skill\n");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
