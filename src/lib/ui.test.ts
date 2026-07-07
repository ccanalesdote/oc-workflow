import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ManagedAgentStatus } from "./agents.js";

const EXIT_PROMPT_ERROR = { name: "ExitPromptError" };

vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  checkbox: vi.fn(),
  confirm: vi.fn(),
  input: vi.fn(),
  Separator: class Separator {},
}));

import {
  select,
  checkbox,
  confirm,
  input,
} from "@inquirer/prompts";
import {
  CancellationError,
  UsageError,
  CANCEL_VALUE,
  isCancelValue,
  buildAgentRow,
  printHeader,
  printSummary,
  printPaths,
  printNoChanges,
  printCancelled,
  Spinner,
  withSpinner,
  withAbortOnSigint,
  withApplyPhaseSigint,
  applyPhaseCheckpoint,
  checkApplyPhaseSigint,
  setupGlobalSigintHandler,
  _resetSigintStateForTest,
  uiSelect,
  uiCheckbox,
  uiConfirm,
  uiInput,
  resolveScope,
} from "./ui.js";
import * as messages from "./messages.js";

function fakeStatus(
  overrides: Partial<ManagedAgentStatus> = {}
): ManagedAgentStatus {
  return {
    name: "developer",
    kind: "custom",
    state: "active",
    ...overrides,
  };
}

describe("buildAgentRow", () => {
  it("renders active custom agents with green glyph and no suffix", () => {
    const row = buildAgentRow(fakeStatus({ state: "active" }));
    expect(row).toContain("developer");
    expect(row).toContain("[custom]");
    expect(row).not.toContain("not installed");
    expect(row).not.toContain("hidden");
    expect(row).not.toContain("conflict");
  });

  it("renders missing agents with dim glyph and suffix", () => {
    const row = buildAgentRow(fakeStatus({ state: "missing" }));
    expect(row).toContain("developer");
    expect(row).toContain("(not installed)");
  });

  it("renders hidden agents with yellow glyph and suffix", () => {
    const row = buildAgentRow(fakeStatus({ state: "hidden" }));
    expect(row).toContain("developer");
    expect(row).toContain("(hidden)");
  });

  it("renders conflict agents with red glyph and suffix", () => {
    const row = buildAgentRow(fakeStatus({ state: "conflict" }));
    expect(row).toContain("developer");
    expect(row).toContain("(conflict");
  });

  it("shows the built-in badge", () => {
    const row = buildAgentRow(fakeStatus({ name: "plan", kind: "builtin" }));
    expect(row).toContain("[built-in]");
  });

  it("can hide the glyph", () => {
    const row = buildAgentRow(fakeStatus(), { showGlyph: false });
    expect(row.startsWith("developer")).toBe(true);
  });
});

describe("cancel sentinel", () => {
  it("identifies the cancel value", () => {
    expect(isCancelValue(CANCEL_VALUE)).toBe(true);
  });

  it("rejects other values", () => {
    expect(isCancelValue("foo")).toBe(false);
    expect(isCancelValue(null)).toBe(false);
    expect(isCancelValue(undefined)).toBe(false);
  });
});

describe("text helpers", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("printHeader uses the shared header format", () => {
    printHeader("OpenCode Path Agent Management", "🤖");
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain("🤖 OpenCode Path Agent Management");
  });

  it("printPaths prints aligned bold paths", () => {
    printPaths({
      agentDir: "/project/.opencode/agent",
      configPath: "/project/.opencode/opencode.json",
      skillDir: "/project/.opencode/skills",
    });
    const lines = logSpy.mock.calls.map((c) => c[0] as string);
    expect(lines.some((l) => l.includes("Agent dir:"))).toBe(true);
    expect(lines.some((l) => l.includes("Config:"))).toBe(true);
  });

  it("printSummary aligns labels", () => {
    printSummary([
      { label: "Created:", value: "foo, bar", color: "green" },
      { label: "Conflicts:", value: "baz", color: "red" },
    ]);
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Created:");
    expect(output).toContain("Conflicts:");
  });

  it("printNoChanges prints the shared message", () => {
    printNoChanges();
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain(messages.NO_CHANGES);
  });

  it("printCancelled prints the shared message", () => {
    printCancelled();
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain(messages.CANCELLED);
  });
});

describe("prompt wrappers", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("uiSelect throws CancellationError on ExitPromptError", async () => {
    vi.mocked(select).mockRejectedValueOnce(EXIT_PROMPT_ERROR);
    await expect(uiSelect("pick", [{ value: "a", name: "A" }])).rejects.toBeInstanceOf(
      CancellationError
    );
  });

  it("uiSelect throws CancellationError when cancel is chosen", async () => {
    vi.mocked(select).mockResolvedValueOnce(CANCEL_VALUE);
    await expect(uiSelect("pick", [{ value: "a", name: "A" }])).rejects.toBeInstanceOf(
      CancellationError
    );
  });

  it("uiSelect returns the selected value", async () => {
    vi.mocked(select).mockResolvedValueOnce("a");
    const answer = await uiSelect("pick", [{ value: "a", name: "A" }]);
    expect(answer).toBe("a");
  });

  it("uiCheckbox appends cancel and throws CancellationError when chosen", async () => {
    vi.mocked(checkbox).mockResolvedValueOnce(["foo", CANCEL_VALUE]);
    await expect(
      uiCheckbox("choose", [{ value: "foo", name: "Foo" }])
    ).rejects.toBeInstanceOf(CancellationError);
  });

  it("uiCheckbox filters cancel and returns real selections", async () => {
    vi.mocked(checkbox).mockResolvedValueOnce(["foo"]);
    const answer = await uiCheckbox("choose", [{ value: "foo", name: "Foo" }]);
    expect(answer).toEqual(["foo"]);
  });

  it("uiConfirm throws CancellationError on ExitPromptError", async () => {
    vi.mocked(confirm).mockRejectedValueOnce(EXIT_PROMPT_ERROR);
    await expect(uiConfirm("yes?")).rejects.toBeInstanceOf(CancellationError);
  });

  it("uiInput throws CancellationError on ExitPromptError", async () => {
    vi.mocked(input).mockRejectedValueOnce(EXIT_PROMPT_ERROR);
    await expect(uiInput("value?")).rejects.toBeInstanceOf(CancellationError);
  });
});

describe("Spinner", () => {
  it("writes a static line in non-TTY output", () => {
    const writes: string[] = [];
    const output = {
      isTTY: false,
      write: (chunk: string) => {
        writes.push(chunk);
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    const spinner = new Spinner("working", output);
    spinner.start();
    spinner.stop();

    expect(writes).toEqual(["working\n"]);
  });

  it("writes rotating frames in TTY output", () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const output = {
      isTTY: true,
      write: (chunk: string) => {
        writes.push(chunk);
        return true;
      },
    } as unknown as NodeJS.WriteStream;

    const spinner = new Spinner("working", output);
    spinner.start();

    vi.advanceTimersByTime(80);
    spinner.stop();

    expect(writes.some((w) => w.includes("⠋ working"))).toBe(true);
    expect(writes.some((w) => w.startsWith("\r"))).toBe(true);

    vi.useRealTimers();
  });
});

function fakeOutputStream(options: { isTTY?: boolean } = {}): {
  stream: NodeJS.WriteStream;
  writes: string[];
} {
  const writes: string[] = [];
  const stream = {
    isTTY: options.isTTY ?? true,
    write: (chunk: string) => {
      writes.push(chunk);
      return true;
    },
  } as unknown as NodeJS.WriteStream;
  return { stream, writes };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("withSpinner", () => {
  beforeEach(() => {
    _resetSigintStateForTest();
  });

  afterEach(() => {
    _resetSigintStateForTest();
  });

  it("returns the action result and stops the spinner", async () => {
    const { stream, writes } = fakeOutputStream();

    const result = await withSpinner(
      "loading",
      async () => "models-loaded",
      { output: stream }
    );
    expect(result).toBe("models-loaded");
    expect(writes.some((w) => w.includes("loading"))).toBe(true);
  });

  it("aborts and throws CancellationError when SIGINT is received (single press)", async () => {
    const { stream } = fakeOutputStream();
    const exitSpy = (vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never) as unknown) as ReturnType<
      typeof vi.spyOn
    >;

    const promise = withSpinner(
      "loading",
      async (signal) => {
        return new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      },
      { output: stream }
    );

    await sleep(10);
    process.emit("SIGINT");

    // A single SIGINT should abort the action and throw CancellationError,
    // but it must NOT call process.exit (that is reserved for the second press).
    await expect(promise).rejects.toBeInstanceOf(CancellationError);
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("forces immediate exit when SIGINT is pressed twice in a spinner", async () => {
    const { stream } = fakeOutputStream();
    const exitSpy = (vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never) as unknown) as ReturnType<
      typeof vi.spyOn
    >;

    const promise = withSpinner(
      "loading",
      async (signal) => {
        return new Promise<never>((_resolve, reject) => {
          const t = setTimeout(
            () => reject(new Error("aborted")),
            1000
          );
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("aborted"));
          });
        });
      },
      { output: stream }
    );

    await sleep(10);
    process.emit("SIGINT");
    process.emit("SIGINT");

    expect(exitSpy).toHaveBeenCalledWith(130);
    // The CancellationError is thrown by the wrapper finally block.
    await expect(promise).rejects.toBeInstanceOf(CancellationError);

    exitSpy.mockRestore();
  });
});

describe("withAbortOnSigint / second SIGINT escalation", () => {
  // `process.exit` is typed as `(...args) => never`, which is incompatible with
  // the generic spy signature declared by vitest. We capture the mock via a
  // loose cast here, and re-cast in assertions where typed access is needed.
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _resetSigintStateForTest();
    exitSpy = (vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never) as unknown) as ReturnType<
      typeof vi.spyOn
    >;
  });

  afterEach(() => {
    exitSpy.mockRestore();
    _resetSigintStateForTest();
  });

  it("aborts the action on the first SIGINT and exits on the second", async () => {
    setupGlobalSigintHandler();
    const { stream } = fakeOutputStream();

    const promise = withSpinner(
      "loading",
      async (signal) => {
        // Resolve quickly when aborted so cleanup runs; otherwise the promise
        // would hang and keep the test process alive.
        return new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 500);
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            resolve();
          });
        });
      },
      { output: stream }
    );

    await sleep(10);
    process.emit("SIGINT");
    process.emit("SIGINT");

    expect(exitSpy).toHaveBeenCalledWith(130);
    await expect(promise).rejects.toBeInstanceOf(CancellationError);
  });

  it("prints Cancelled and exits when SIGINT fires without an abortable context", () => {
    setupGlobalSigintHandler();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    process.emit("SIGINT");

    expect(errorSpy).toHaveBeenCalled();
    const output = errorSpy.mock.calls.map((c) => c[0]).join(" ");
    expect(output).toContain("Cancelled");
    expect(exitSpy).toHaveBeenCalledWith(130);

    errorSpy.mockRestore();
  });
});

describe("withApplyPhaseSigint", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _resetSigintStateForTest();
    exitSpy = (vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never) as unknown) as ReturnType<
      typeof vi.spyOn
    >;
  });

  afterEach(() => {
    exitSpy.mockRestore();
    _resetSigintStateForTest();
  });

  it("throws CancellationError when SIGINT is received during the action", async () => {
    const promise = withApplyPhaseSigint(async () => {
      await applyPhaseCheckpoint();
      return "done";
    });

    process.emit("SIGINT");

    await expect(promise).rejects.toBeInstanceOf(CancellationError);
  });

  it("stops before the next write when SIGINT is received", async () => {
    let secondWriteReached = false;

    const promise = withApplyPhaseSigint(async () => {
      await applyPhaseCheckpoint();
      secondWriteReached = true;
      await applyPhaseCheckpoint();
      return "done";
    });

    process.emit("SIGINT");

    await expect(promise).rejects.toBeInstanceOf(CancellationError);
    expect(secondWriteReached).toBe(false);
  });

  it("exits 130 on the second SIGINT during the apply phase", async () => {
    const promise = withApplyPhaseSigint(async () => {
      // Sleep long enough that both SIGINTs arrive before the action checks
      // the interruption flag. The second SIGINT must call process.exit(130).
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      checkApplyPhaseSigint();
      return "done";
    });

    process.emit("SIGINT");
    process.emit("SIGINT");

    expect(exitSpy).toHaveBeenCalledWith(130);
    await expect(promise).rejects.toBeInstanceOf(CancellationError);
  });

  it("restores the global SIGINT handler after the action succeeds", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await withApplyPhaseSigint(async () => {
      await applyPhaseCheckpoint();
      return "done";
    });

    // After withApplyPhaseSigint returns, the global handler should be active
    // again, so a single SIGINT prints "Cancelled." and exits 130.
    process.emit("SIGINT");

    expect(errorSpy).toHaveBeenCalled();
    const output = errorSpy.mock.calls.map((c) => c[0]).join(" ");
    expect(output).toContain("Cancelled");
    expect(exitSpy).toHaveBeenCalledWith(130);

    errorSpy.mockRestore();
  });

  it("restores the global SIGINT handler after the action throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      withApplyPhaseSigint(async () => {
        await applyPhaseCheckpoint();
        throw new Error("apply failed");
      })
    ).rejects.toThrow("apply failed");

    process.emit("SIGINT");

    expect(errorSpy).toHaveBeenCalled();
    const output = errorSpy.mock.calls.map((c) => c[0]).join(" ");
    expect(output).toContain("Cancelled");
    expect(exitSpy).toHaveBeenCalledWith(130);

    errorSpy.mockRestore();
  });

  it("checkApplyPhaseSigint throws when interrupted", async () => {
    const promise = withApplyPhaseSigint(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      checkApplyPhaseSigint();
      return "done";
    });

    process.emit("SIGINT");

    await expect(promise).rejects.toBeInstanceOf(CancellationError);
  });
});

describe("resolveScope", () => {
  it("throws UsageError when both --global and --project are passed", async () => {
    const projectTarget = {
      scope: "project" as const,
      agentDir: "/project/.opencode/agent",
      configPath: "/project/.opencode/opencode.json",
      skillDir: "/project/.opencode/skills",
    };
    const globalTarget = {
      scope: "global" as const,
      agentDir: "/global/agent",
      configPath: "/global/opencode.json",
      skillDir: "/global/skills",
    };

    await expect(
      resolveScope(
        { global: true, project: true },
        { projectViable: true, globalViable: true, projectTarget, globalTarget }
      )
    ).rejects.toBeInstanceOf(UsageError);
  });

  it("throws UsageError with concrete action when both flags are passed", async () => {
    const projectTarget = {
      scope: "project" as const,
      agentDir: "/project/.opencode/agent",
      configPath: "/project/.opencode/opencode.json",
      skillDir: "/project/.opencode/skills",
    };
    const globalTarget = {
      scope: "global" as const,
      agentDir: "/global/agent",
      configPath: "/global/opencode.json",
      skillDir: "/global/skills",
    };

    await expect(
      resolveScope(
        { global: true, project: true },
        { projectViable: true, globalViable: true, projectTarget, globalTarget }
      )
    ).rejects.toThrow(/pass only one at a time/i);
  });

  it("throws actionable error when no scope is manageable", async () => {
    const projectTarget = {
      scope: "project" as const,
      agentDir: "/project/.opencode/agent",
      configPath: "/project/.opencode/opencode.json",
      skillDir: "/project/.opencode/skills",
    };
    const globalTarget = {
      scope: "global" as const,
      agentDir: "/global/agent",
      configPath: "/global/opencode.json",
      skillDir: "/global/skills",
    };

    // Bypass the non-interactive mode check by making stdin appear interactive.
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      process.stdin,
      "isTTY"
    );
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
      writable: true,
    });

    try {
      await expect(
        resolveScope(
          {},
          { projectViable: false, globalViable: false, projectTarget, globalTarget }
        )
      ).rejects.toThrow(
        /run 'opencode-path init --project' or 'opencode-path init --global'/i
      );
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(process.stdin, "isTTY", originalDescriptor);
      } else {
        delete (process.stdin as unknown as Record<string, unknown>).isTTY;
      }
    }
  });

  it("returns the global scope when --global is passed", async () => {
    const projectTarget = {
      scope: "project" as const,
      agentDir: "/project/.opencode/agent",
      configPath: "/project/.opencode/opencode.json",
      skillDir: "/project/.opencode/skills",
    };
    const globalTarget = {
      scope: "global" as const,
      agentDir: "/global/agent",
      configPath: "/global/opencode.json",
      skillDir: "/global/skills",
    };

    const scope = await resolveScope(
      { global: true },
      { projectViable: true, globalViable: true, projectTarget, globalTarget }
    );
    expect(scope).toBe("global");
  });
});
