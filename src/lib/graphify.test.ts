import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
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
      ["tool", "install", "graphifyy"],
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
