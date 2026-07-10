import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock child_process to avoid real external commands
const execFileSyncMock = vi.fn();
const execFileMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFileSync: (...args: any[]) => execFileSyncMock(...args),
  execFile: (...args: any[]) => execFileMock(...args),
  ExecFileException: class extends Error {},
}));

import {
  isGraphifyAvailable,
  isUvAvailable,
  installGraphifyCli,
  installGraphifyOpenCodeSkill,
  hasGraph,
  runGraphInit,
  runGraphUpdate,
  getGraphifyVersion,
  GRAPHIFY_INSTALL_SPEC,
  getGraphifyStatePath,
  getGraphifyGitCommit,
  getGraphifyGitDirty,
  writeGraphifyState,
  GRAPHIFY_COMPATIBLE_RANGE,
  type GraphifyState,
} from "./graphify.js";

// ------- helpers -------

/** Set up execFileSync to succeed (uv and graphify both available). */
function mockSyncAvailable() {
  execFileSyncMock.mockReturnValue("ok\n");
}

/** Helper: mock an async execFile call that succeeds. */
function mockExecFileOk(stdout = "ok\n") {
  execFileMock.mockImplementationOnce(
    (_file: string, _args: string[], _opts: any, cb: Function) => {
      cb(null, stdout, "");
    }
  );
}

/** Helper: mock an async execFile call that fails. */
function mockExecFileFail(message = "command failed") {
  execFileMock.mockImplementationOnce(
    (_file: string, _args: string[], _opts: any, cb: Function) => {
      cb(new Error(message), "", message);
    }
  );
}

// ------- availability checks -------

describe("isGraphifyAvailable", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns true when graphify --version succeeds", () => {
    mockSyncAvailable();
    expect(isGraphifyAvailable()).toBe(true);
    expect(execFileSyncMock).toHaveBeenCalledWith("graphify", ["--version"], expect.any(Object));
  });

  it("returns false when graphify --version throws", () => {
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("command not found");
    });
    expect(isGraphifyAvailable()).toBe(false);
  });
});

describe("isUvAvailable", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns true when uv --version succeeds", () => {
    mockSyncAvailable();
    expect(isUvAvailable()).toBe(true);
    expect(execFileSyncMock).toHaveBeenCalledWith("uv", ["--version"], expect.any(Object));
  });

  it("returns false when uv --version throws", () => {
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("command not found");
    });
    expect(isUvAvailable()).toBe(false);
  });
});

// ------- installation -------

describe("installGraphifyCli", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns success immediately when graphify is already available (no-op)", async () => {
    // graphify --version succeeds → skip installation
    execFileSyncMock.mockReturnValueOnce("graphify v1.0.0\n");

    const result = await installGraphifyCli();
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    // Should NOT have attempted to run uv tool install or check uv
    expect(execFileMock).not.toHaveBeenCalled();
    // Only graphify --version was checked
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it("returns success when uv tool install graphifyy succeeds and CLI available", async () => {
    // Call 1: isGraphifyAvailable (preflight) → graphify NOT available
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("command not found: graphify");
    });
    // Call 2: isUvAvailable → uv available
    execFileSyncMock.mockReturnValueOnce("uv 0.5.0\n");
    // Install: uv tool install succeeds
    mockExecFileOk();
    // Call 3: isGraphifyAvailable (post-install) → graphify now available
    execFileSyncMock.mockReturnValueOnce("graphify v1.0.0\n");

    const result = await installGraphifyCli();
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(execFileMock).toHaveBeenCalledWith(
      "uv",
      ["tool", "install", GRAPHIFY_INSTALL_SPEC],
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("returns actionable failure when install succeeds but CLI not on PATH", async () => {
    // Call 1: isGraphifyAvailable (preflight) → NOT available
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("command not found: graphify");
    });
    // Call 2: isUvAvailable → uv available
    execFileSyncMock.mockReturnValueOnce("uv 0.5.0\n");
    // Install: uv tool install succeeds
    mockExecFileOk();
    // Call 3: isGraphifyAvailable (post-install) → STILL not on PATH
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("command not found");
    });

    const result = await installGraphifyCli();
    expect(result.success).toBe(false);
    expect(result.error).toContain("uv tool update-shell");
    expect(result.error).toContain("PATH");
  });

  it("returns actionable failure when uv is not available (preflight)", async () => {
    // Call 1: isGraphifyAvailable (preflight) → NOT available
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("command not found: graphify");
    });
    // Call 2: isUvAvailable → NOT available (uv missing)
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("command not found: uv");
    });

    const result = await installGraphifyCli();
    expect(result.success).toBe(false);
    expect(result.error).toContain("uv");
    expect(result.error).toContain("install Graphify manually");
    // Should NOT have attempted to run uv tool install
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("returns failure when uv tool install itself fails", async () => {
    // Call 1: isGraphifyAvailable (preflight) → NOT available
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("command not found: graphify");
    });
    // Call 2: isUvAvailable → uv available
    execFileSyncMock.mockReturnValueOnce("uv 0.5.0\n");
    // Install: uv tool install fails
    mockExecFileFail("uv install failed");

    const result = await installGraphifyCli();
    expect(result.success).toBe(false);
    expect(result.error).toContain("uv install failed");
  });

  it("respects the AbortSignal", async () => {
    // Call 1: isGraphifyAvailable (preflight) → NOT available
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("command not found: graphify");
    });
    // Call 2: isUvAvailable → uv available
    execFileSyncMock.mockReturnValueOnce("uv 0.5.0\n");

    const controller = new AbortController();
    controller.abort();

    const result = await installGraphifyCli(controller.signal);
    expect(result.success).toBe(false);
  });
});

describe("installGraphifyOpenCodeSkill", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("passes --project for project scope", async () => {
    mockExecFileOk("Skill installed\n");

    const result = await installGraphifyOpenCodeSkill("project");
    expect(result.success).toBe(true);
    expect(execFileMock).toHaveBeenCalledWith(
      "graphify",
      ["install", "--platform", "opencode", "--project"],
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("does NOT pass --project for global scope", async () => {
    mockExecFileOk("Skill installed\n");

    const result = await installGraphifyOpenCodeSkill("global");
    expect(result.success).toBe(true);
    expect(execFileMock).toHaveBeenCalledWith(
      "graphify",
      ["install", "--platform", "opencode"],
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("returns failure when graphify install fails", async () => {
    mockExecFileFail("install failed");

    const result = await installGraphifyOpenCodeSkill("project");
    expect(result.success).toBe(false);
    expect(result.error).toContain("install failed");
  });
});

// ------- version detection -------

describe("getGraphifyVersion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns parsed version and raw output when graphify --version succeeds", () => {
    execFileSyncMock.mockReturnValueOnce("graphify 0.9.11\n");

    const result = getGraphifyVersion();
    expect(result.raw).toBe("graphify 0.9.11");
    expect(result.version).toBe("0.9.11");
    expect(execFileSyncMock).toHaveBeenCalledWith("graphify", ["--version"], expect.any(Object));
  });

  it("parses version without prefix (e.g. '0.9.11')", () => {
    execFileSyncMock.mockReturnValueOnce("0.9.11\n");

    const result = getGraphifyVersion();
    expect(result.raw).toBe("0.9.11");
    expect(result.version).toBe("0.9.11");
  });

  it("returns version: null when output has no semver", () => {
    execFileSyncMock.mockReturnValueOnce("graphify (development build)\n");

    const result = getGraphifyVersion();
    expect(result.raw).toBe("graphify (development build)");
    expect(result.version).toBeNull();
  });

  it("returns raw: null and version: null when command fails", () => {
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("command not found");
    });

    const result = getGraphifyVersion();
    expect(result.raw).toBeNull();
    expect(result.version).toBeNull();
  });

  it("returns raw: null and version: null when output is empty", () => {
    execFileSyncMock.mockReturnValueOnce("   \n");

    const result = getGraphifyVersion();
    expect(result.raw).toBeNull();
    expect(result.version).toBeNull();
  });
});

// ------- freshness state (.path/graphify-state.json) -------

describe("getGraphifyStatePath", () => {
  it("returns .path/graphify-state.json under the given cwd", () => {
    const result = getGraphifyStatePath("/my/repo");
    expect(result).toBe("/my/repo/.path/graphify-state.json");
  });

  it("uses process.cwd() when no cwd argument is given", () => {
    // Should not throw and should end with the expected relative path
    const result = getGraphifyStatePath();
    expect(result).toContain(".path/graphify-state.json");
  });
});

describe("getGraphifyGitCommit", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns commit hash when git rev-parse succeeds", () => {
    execFileSyncMock.mockReturnValueOnce("abc123def456\n");
    const result = getGraphifyGitCommit("/repo");
    expect(result).toBe("abc123def456");
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "--verify", "HEAD"],
      expect.any(Object)
    );
  });

  it("returns null when git rev-parse fails", () => {
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("fatal: not a git repository");
    });
    const result = getGraphifyGitCommit("/not-repo");
    expect(result).toBeNull();
  });

  it("returns null when output is whitespace only", () => {
    execFileSyncMock.mockReturnValueOnce("   \n");
    const result = getGraphifyGitCommit("/repo");
    expect(result).toBeNull();
  });
});

describe("getGraphifyGitDirty", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns true when git status shows changes", () => {
    execFileSyncMock.mockReturnValueOnce(" M src/file.ts\n");
    const result = getGraphifyGitDirty("/repo");
    expect(result).toBe(true);
  });

  it("returns false when git status output is empty", () => {
    execFileSyncMock.mockReturnValueOnce("");
    const result = getGraphifyGitDirty("/repo");
    expect(result).toBe(false);
  });

  it("returns null when git status fails", () => {
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("fatal: not a git repository");
    });
    const result = getGraphifyGitDirty("/not-repo");
    expect(result).toBeNull();
  });
});

describe("writeGraphifyState", () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.resetAllMocks();
    tmpDir = mkdtempSync(join(tmpdir(), "graphify-state-"));
    // Default: graphify --version returns a known version
    execFileSyncMock.mockReturnValue("graphify 0.9.11\n");
  });

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes valid JSON state with all metadata fields", () => {
    // Git commit available
    execFileSyncMock.mockReturnValueOnce("graphify 0.9.11\n");
    execFileSyncMock.mockReturnValueOnce("abc123def456\n"); // git rev-parse
    execFileSyncMock.mockReturnValueOnce(" M src/file.ts\n"); // git status

    const result = writeGraphifyState(tmpDir);
    expect(result.success).toBe(true);

    const statePath = getGraphifyStatePath(tmpDir);
    const raw = readFileSync(statePath, "utf-8");
    const parsed: GraphifyState = JSON.parse(raw);

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.updatedAt).toBeTruthy();
    expect(new Date(parsed.updatedAt).getTime()).toBeGreaterThan(0);
    expect(parsed.graphifyVersion).toBe("0.9.11");
    expect(parsed.graphifyVersionRaw).toBe("graphify 0.9.11");
    expect(parsed.graphifyCompatibleRange).toBe(GRAPHIFY_COMPATIBLE_RANGE);
    expect(parsed.commit).toBe("abc123def456");
    expect(parsed.workingTreeDirty).toBe(true);
  });

  it("records null for commit and workingTreeDirty when git is unavailable", () => {
    // graphify --version succeeds
    execFileSyncMock.mockReturnValueOnce("graphify 0.9.11\n");
    // git rev-parse fails
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("not a git repository");
    });
    // git status also fails
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("not a git repository");
    });

    const result = writeGraphifyState(tmpDir);
    expect(result.success).toBe(true);

    const statePath = getGraphifyStatePath(tmpDir);
    const raw = readFileSync(statePath, "utf-8");
    const parsed: GraphifyState = JSON.parse(raw);

    expect(parsed.commit).toBeNull();
    expect(parsed.workingTreeDirty).toBeNull();
  });

  it("records graphifyVersion: null when version is unparseable", () => {
    // graphify --version returns something without a semver
    execFileSyncMock.mockReturnValueOnce("graphify development\n");
    // git succeeded (but we don't care here)
    execFileSyncMock.mockReturnValueOnce("\n");

    const result = writeGraphifyState(tmpDir);
    expect(result.success).toBe(true);

    const statePath = getGraphifyStatePath(tmpDir);
    const raw = readFileSync(statePath, "utf-8");
    const parsed: GraphifyState = JSON.parse(raw);

    expect(parsed.graphifyVersion).toBeNull();
    expect(parsed.graphifyVersionRaw).toBe("graphify development");
  });

  it("returns failure when state file cannot be written (filesystem error)", () => {
    // Point to a non-existent parent directory above a read-only root
    // Use a path that will fail: /dev/null is not a directory
    // graphify --version succeeds
    execFileSyncMock.mockReturnValueOnce("graphify 0.9.11\n");
    // Both git calls fail gracefully
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("not a git repository");
    });

    // Write to /dev which doesn't allow subdirectory creation
    const result = writeGraphifyState("/dev");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("creates .path directory when it does not exist", () => {
    // graphify --version succeeds
    execFileSyncMock.mockReturnValueOnce("graphify 0.9.11\n");
    execFileSyncMock.mockReturnValueOnce("\n");

    // Ensure .path does not exist yet
    const dotPathDir = join(tmpDir, ".path");
    expect(existsSync(dotPathDir)).toBe(false);

    const result = writeGraphifyState(tmpDir);
    expect(result.success).toBe(true);
    expect(existsSync(dotPathDir)).toBe(true);
  });
});

// ------- graph state detection -------

describe("hasGraph", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "graphify-hasgraph-"));
  });

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns true when graphify-out/graph.json exists", () => {
    const graphOutDir = join(tmpDir, "graphify-out");
    mkdirSync(graphOutDir, { recursive: true });
    writeFileSync(join(graphOutDir, "graph.json"), "{}", "utf-8");

    expect(hasGraph(tmpDir)).toBe(true);
  });

  it("returns false when graphify-out/graph.json does not exist", () => {
    expect(hasGraph(tmpDir)).toBe(false);
  });

  it("returns false when graphify-out directory exists but graph.json missing", () => {
    const graphOutDir = join(tmpDir, "graphify-out");
    mkdirSync(graphOutDir, { recursive: true });

    expect(hasGraph(tmpDir)).toBe(false);
  });

  it("uses process.cwd() when no cwd argument is given", () => {
    expect(() => hasGraph()).not.toThrow();
  });
});

// ------- graph command execution -------

describe("runGraphInit", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("runs 'graphify .' and returns success", async () => {
    mockExecFileOk("Graph initialized\n");

    const result = await runGraphInit();
    expect(result.success).toBe(true);
    expect(execFileMock).toHaveBeenCalledWith(
      "graphify",
      ["."],
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("returns failure when graphify . fails", async () => {
    mockExecFileFail("no files found");

    const result = await runGraphInit();
    expect(result.success).toBe(false);
    expect(result.error).toContain("no files found");
  });
});

describe("runGraphUpdate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("runs 'graphify update .' without force", async () => {
    mockExecFileOk("Graph updated\n");

    const result = await runGraphUpdate();
    expect(result.success).toBe(true);
    expect(execFileMock).toHaveBeenCalledWith(
      "graphify",
      ["update", "."],
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("runs 'graphify update . --force' when force is true", async () => {
    mockExecFileOk("Graph updated with force\n");

    const result = await runGraphUpdate(undefined, true);
    expect(result.success).toBe(true);
    expect(execFileMock).toHaveBeenCalledWith(
      "graphify",
      ["update", ".", "--force"],
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("returns failure when graphify update fails", async () => {
    mockExecFileFail("update failed");

    const result = await runGraphUpdate();
    expect(result.success).toBe(false);
    expect(result.error).toContain("update failed");
  });
});
