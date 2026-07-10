import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock graphify helper functions
vi.mock("../lib/graphify.js", () => ({
  isGraphifyAvailable: vi.fn(),
  hasGraph: vi.fn(),
  runGraphInit: vi.fn(),
  runGraphUpdate: vi.fn(),
}));

import {
  isGraphifyAvailable,
  hasGraph,
  runGraphInit,
  runGraphUpdate,
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

  // ---------------------------------------------------------------------------
  // Initialize graph (no existing graph)
  // ---------------------------------------------------------------------------

  it("initializes new graph when graphify-out/graph.json does not exist", async () => {
    vi.mocked(isGraphifyAvailable).mockReturnValue(true);
    vi.mocked(hasGraph).mockReturnValue(false);
    vi.mocked(runGraphInit).mockResolvedValue({ success: true });

    await graphifyCommand();

    expect(runGraphInit).toHaveBeenCalled();
    expect(runGraphUpdate).not.toHaveBeenCalled();

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Graph initialized successfully");
    expect(output).toContain("Graph exists: no");
  });

  it("reports failure when graph init fails", async () => {
    vi.mocked(isGraphifyAvailable).mockReturnValue(true);
    vi.mocked(hasGraph).mockReturnValue(false);
    vi.mocked(runGraphInit).mockResolvedValue({
      success: false,
      error: "no Python files found",
    });

    await graphifyCommand();

    expect(runGraphInit).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);

    const errorOutput = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(errorOutput).toContain("no Python files found");
  });

  // ---------------------------------------------------------------------------
  // Update existing graph
  // ---------------------------------------------------------------------------

  it("updates existing graph incrementally", async () => {
    vi.mocked(isGraphifyAvailable).mockReturnValue(true);
    vi.mocked(hasGraph).mockReturnValue(true);
    vi.mocked(runGraphUpdate).mockResolvedValue({ success: true });

    await graphifyCommand();

    expect(runGraphUpdate).toHaveBeenCalledWith(undefined, undefined, expect.any(Object));
    expect(runGraphInit).not.toHaveBeenCalled();

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Graph updated successfully");
    expect(output).toContain("Graph exists: yes");
  });

  it("force-updates existing graph when --force is passed", async () => {
    vi.mocked(isGraphifyAvailable).mockReturnValue(true);
    vi.mocked(hasGraph).mockReturnValue(true);
    vi.mocked(runGraphUpdate).mockResolvedValue({ success: true });

    await graphifyCommand({ force: true });

    expect(runGraphUpdate).toHaveBeenCalledWith(undefined, true, expect.any(Object));
    expect(runGraphInit).not.toHaveBeenCalled();

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Graph force-updated successfully");
  });

  it("reports failure when graph update fails", async () => {
    vi.mocked(isGraphifyAvailable).mockReturnValue(true);
    vi.mocked(hasGraph).mockReturnValue(true);
    vi.mocked(runGraphUpdate).mockResolvedValue({
      success: false,
      error: "update failed",
    });

    await graphifyCommand();

    expect(runGraphUpdate).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);

    const errorOutput = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(errorOutput).toContain("update failed");
  });

  // ---------------------------------------------------------------------------
  // --force with no graph → initialize normally
  // ---------------------------------------------------------------------------

  it("--force with no graph initializes normally (no force-init)", async () => {
    vi.mocked(isGraphifyAvailable).mockReturnValue(true);
    vi.mocked(hasGraph).mockReturnValue(false);
    vi.mocked(runGraphInit).mockResolvedValue({ success: true });

    await graphifyCommand({ force: true });

    // Should initialize (not force-update) when no graph exists
    expect(runGraphInit).toHaveBeenCalled();
    expect(runGraphUpdate).not.toHaveBeenCalled();

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Graph initialized successfully");
  });
});
