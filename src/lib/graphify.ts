/**
 * Graphify integration helpers for opencode-path.
 *
 * Provides small testable functions for:
 * - CLI/uv availability checks
 * - Official Graphify CLI installation via uv
 * - Official OpenCode skill installation via graphify
 * - Graph state detection (graphify-out/graph.json)
 * - Graph init/update command execution
 *
 * Uses Node child process APIs (execFile/execFileSync) exclusively.
 * No new dependencies.
 */

import { execFileSync, execFile, type ExecFileException } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Low-level child-process helper
// ---------------------------------------------------------------------------

/**
 * Run a command with argument array and return stdout/stderr.
 * The returned promise rejects when the child process exits with a non-zero
 * code. The rejection error message includes stderr when available.
 */
function execFilePromise(
  file: string,
  args: string[],
  options?: { cwd?: string; signal?: AbortSignal }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (options?.signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }

    const child = execFile(
      file,
      args,
      {
        encoding: "utf-8",
        cwd: options?.cwd,
        maxBuffer: 50 * 1024 * 1024,
      },
      (err: ExecFileException | null, stdout: string, stderr: string) => {
        if (options?.signal?.aborted) {
          reject(new Error("Aborted"));
          return;
        }

        if (err) {
          const detail = stderr ? `\n${stderr.trim()}` : "";
          reject(new Error(`${err.message}${detail}`));
          return;
        }

        resolve({ stdout, stderr });
      }
    );

    options?.signal?.addEventListener("abort", () => {
      child.kill();
    });
  });
}

// ---------------------------------------------------------------------------
// Availability checks
// ---------------------------------------------------------------------------

/**
 * Check whether the `graphify` CLI is available on PATH by running
 * `graphify --version`. Returns true when the command exits 0, false otherwise.
 */
export function isGraphifyAvailable(): boolean {
  try {
    execFileSync("graphify", ["--version"], {
      encoding: "utf-8",
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether `uv` is available on PATH by running `uv --version`.
 * Returns true when the command exits 0, false otherwise.
 */
export function isUvAvailable(): boolean {
  try {
    execFileSync("uv", ["--version"], {
      encoding: "utf-8",
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Installation (async — these may take a while)
// ---------------------------------------------------------------------------

/**
 * Install the official Graphify CLI via `uv tool install graphifyy`.
 *
 * Before attempting installation, checks that `uv` is available. If `uv` is
 * missing, returns a failure with an actionable hint. If the user does not
 * want to install `uv`, they must install Graphify manually.
 *
 * After installation, re-checks `isGraphifyAvailable()`. If the CLI is still
 * not on PATH, returns a failure with an actionable hint.
 *
 * Must only be called when `isGraphifyAvailable()` returns false.
 */
export async function installGraphifyCli(
  signal?: AbortSignal
): Promise<{ success: boolean; error?: string }> {
  // If graphify is already available, skip installation entirely
  if (isGraphifyAvailable()) {
    return { success: true };
  }

  // Preflight: uv must be available to install Graphify CLI
  if (!isUvAvailable()) {
    return {
      success: false,
      error:
        "Graphify CLI is not installed and `uv` was not found. " +
        "Install `uv` (https://docs.astral.sh/uv/) or install Graphify " +
        "manually, then re-run `opencode-path init --with-graphify`.",
    };
  }

  try {
    await execFilePromise("uv", ["tool", "install", "graphifyy"], { signal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }

  // Re-check availability after install
  if (!isGraphifyAvailable()) {
    return {
      success: false,
      error:
        "Graphify CLI installed but not found on PATH. " +
        "Run 'uv tool update-shell' and restart your terminal, or add the uv " +
        "tools directory to your PATH.",
    };
  }

  return { success: true };
}

/**
 * Install the official Graphify OpenCode skill:
 *   graphify install --platform opencode [--project]
 *
 * `--project` is only appended when scope is "project".
 *
 * Does NOT call `graphify opencode install`, `graphify hook install`,
 * `graphify watch`, or any uninstall/admin command.
 */
export async function installGraphifyOpenCodeSkill(
  scope: "project" | "global",
  signal?: AbortSignal
): Promise<{ success: boolean; error?: string }> {
  const args = ["install", "--platform", "opencode"];
  if (scope === "project") {
    args.push("--project");
  }

  try {
    await execFilePromise("graphify", args, { signal });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Graph state detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a Graphify graph already exists by checking for
 * `graphify-out/graph.json` relative to `process.cwd()` (or an explicit dir).
 *
 * Returns true when the file exists, false otherwise.
 */
export function hasGraph(cwd?: string): boolean {
  const dir = cwd ?? process.cwd();
  return existsSync(join(dir, "graphify-out", "graph.json"));
}

// ---------------------------------------------------------------------------
// Graph command execution
// ---------------------------------------------------------------------------

/**
 * Run `graphify .` to initialize a new graph in the current directory.
 * Assumes the caller has already verified `isGraphifyAvailable()`.
 */
export async function runGraphInit(
  cwd?: string,
  signal?: AbortSignal
): Promise<{ success: boolean; error?: string }> {
  try {
    await execFilePromise("graphify", ["."], { cwd, signal });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Run `graphify update .` to incrementally update an existing graph.
 *
 * When `force` is true, appends `--force` to the argument list, resulting in
 * `graphify update . --force`.
 *
 * Assumes the caller has already verified `isGraphifyAvailable()`.
 */
export async function runGraphUpdate(
  cwd?: string,
  force?: boolean,
  signal?: AbortSignal
): Promise<{ success: boolean; error?: string }> {
  const args = ["update", "."];
  if (force) {
    args.push("--force");
  }

  try {
    await execFilePromise("graphify", args, { cwd, signal });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
