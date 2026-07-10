import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock graphify helper functions
vi.mock("../lib/graphify.js", () => ({
  isGraphifyAvailable: vi.fn(),
  hasGraph: vi.fn(),
  runGraphInit: vi.fn(),
  runGraphUpdate: vi.fn(),
  writeGraphifyState: vi.fn(),
  getGraphifyStatePath: vi.fn(),
}));

import {
  isGraphifyAvailable,
  hasGraph,
  runGraphInit,
  runGraphUpdate,
  writeGraphifyState,
  getGraphifyStatePath,
} from "../lib/graphify.js";
import { graphifyCommand } from "./graphify.js";

describe("graphifyCommand", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined as never) as any);

    // Default: state write succeeds with a known path
    vi.mocked(writeGraphifyState).mockReturnValue({ success: true });
    vi.mocked(getGraphifyStatePath).mockReturnValue("/repo/.path/graphify-state.json");
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Missing CLI
  // ---------------------------------------------------------------------------

  it("reports actionable error when Graphify CLI is unavailable", async () => {
    vi.mocked(isGraphifyAvailable).mockReturnValue(false);

    await graphifyCommand();

    const errorOutput = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(errorOutput).toContain("Graphify CLI is not installed");
    expect(errorOutput).toContain("opencode-path init --with-graphify");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("does NOT write state when Graphify CLI is unavailable", async () => {
    vi.mocked(isGraphifyAvailable).mockReturnValue(false);

    await graphifyCommand();

    expect(writeGraphifyState).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Initialize graph (no existing graph)
  // ---------------------------------------------------------------------------

  it("initializes new graph and writes state file", async () => {
    vi.mocked(isGraphifyAvailable).mockReturnValue(true);
    vi.mocked(hasGraph).mockReturnValue(false);
    vi.mocked(runGraphInit).mockResolvedValue({ success: true });

    await graphifyCommand();

    expect(runGraphInit).toHaveBeenCalled();
    expect(runGraphUpdate).not.toHaveBeenCalled();
    expect(writeGraphifyState).toHaveBeenCalled();

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Graph initialized successfully");
    expect(output).toContain("Graph exists: no");
    expect(output).toContain("Graphify state updated at");
  });

  it("reports failure when graph init fails and does NOT write state", async () => {
    vi.mocked(isGraphifyAvailable).mockReturnValue(true);
    vi.mocked(hasGraph).mockReturnValue(false);
    vi.mocked(runGraphInit).mockResolvedValue({
      success: false,
      error: "no Python files found",
    });

    await graphifyCommand();

    expect(runGraphInit).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(writeGraphifyState).not.toHaveBeenCalled();

    const errorOutput = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(errorOutput).toContain("no Python files found");
  });

  it("reports warning when init succeeds but state write fails", async () => {
    vi.mocked(isGraphifyAvailable).mockReturnValue(true);
    vi.mocked(hasGraph).mockReturnValue(false);
    vi.mocked(runGraphInit).mockResolvedValue({ success: true });
    vi.mocked(writeGraphifyState).mockReturnValue({
      success: false,
      error: "EACCES: permission denied",
    });

    await graphifyCommand();

    // Should NOT exit with error — the graph was initialized successfully
    expect(exitSpy).not.toHaveBeenCalled();

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("state file could not be written");
    expect(output).toContain("EACCES");
    expect(output).toContain("Graph initialized successfully");
  });

  // ---------------------------------------------------------------------------
  // Update existing graph
  // ---------------------------------------------------------------------------

  it("updates existing graph incrementally and writes state", async () => {
    vi.mocked(isGraphifyAvailable).mockReturnValue(true);
    vi.mocked(hasGraph).mockReturnValue(true);
    vi.mocked(runGraphUpdate).mockResolvedValue({ success: true });

    await graphifyCommand();

    expect(runGraphUpdate).toHaveBeenCalledWith(undefined, undefined, expect.any(Object));
    expect(runGraphInit).not.toHaveBeenCalled();
    expect(writeGraphifyState).toHaveBeenCalled();

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Graph updated successfully");
    expect(output).toContain("Graph exists: yes");
    expect(output).toContain("Graphify state updated at");
  });

  it("force-updates existing graph when --force is passed and writes state", async () => {
    vi.mocked(isGraphifyAvailable).mockReturnValue(true);
    vi.mocked(hasGraph).mockReturnValue(true);
    vi.mocked(runGraphUpdate).mockResolvedValue({ success: true });

    await graphifyCommand({ force: true });

    expect(runGraphUpdate).toHaveBeenCalledWith(undefined, true, expect.any(Object));
    expect(runGraphInit).not.toHaveBeenCalled();
    expect(writeGraphifyState).toHaveBeenCalled();

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Graph force-updated successfully");
  });

  it("reports failure when graph update fails and does NOT write state", async () => {
    vi.mocked(isGraphifyAvailable).mockReturnValue(true);
    vi.mocked(hasGraph).mockReturnValue(true);
    vi.mocked(runGraphUpdate).mockResolvedValue({
      success: false,
      error: "update failed",
    });

    await graphifyCommand();

    expect(runGraphUpdate).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(writeGraphifyState).not.toHaveBeenCalled();

    const errorOutput = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(errorOutput).toContain("update failed");
  });

  it("reports warning when update succeeds but state write fails", async () => {
    vi.mocked(isGraphifyAvailable).mockReturnValue(true);
    vi.mocked(hasGraph).mockReturnValue(true);
    vi.mocked(runGraphUpdate).mockResolvedValue({ success: true });
    vi.mocked(writeGraphifyState).mockReturnValue({
      success: false,
      error: "ENOSPC: no space left on device",
    });

    await graphifyCommand();

    // Should NOT exit — graph updated successfully
    expect(exitSpy).not.toHaveBeenCalled();

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("state file could not be written");
    expect(output).toContain("ENOSPC");
    expect(output).toContain("Graph updated successfully");
  });

  // ---------------------------------------------------------------------------
  // --force with no graph → initialize normally
  // ---------------------------------------------------------------------------

  it("--force with no graph initializes normally and writes state", async () => {
    vi.mocked(isGraphifyAvailable).mockReturnValue(true);
    vi.mocked(hasGraph).mockReturnValue(false);
    vi.mocked(runGraphInit).mockResolvedValue({ success: true });

    await graphifyCommand({ force: true });

    // Should initialize (not force-update) when no graph exists
    expect(runGraphInit).toHaveBeenCalled();
    expect(runGraphUpdate).not.toHaveBeenCalled();
    expect(writeGraphifyState).toHaveBeenCalled();

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Graph initialized successfully");
  });
});
