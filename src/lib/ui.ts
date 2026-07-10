/**
 * Shared command-line presentation helpers for opencode-path.
 *
 * Command files consume these helpers instead of importing picocolors directly.
 * This file centralizes headers, paths, result summaries, prompts, the no-new-
 * dependency spinner, cancellation options, and unified agent row rendering.
 */

import { stdin } from "node:process";
import {
  select,
  checkbox,
  confirm,
  input,
  Separator,
} from "@inquirer/prompts";
import pc from "picocolors";
import {
  detectDefaultScope,
  type InstallScope,
  type InstallTarget,
} from "./paths.js";
import * as messages from "./messages.js";
import type { ManagedAgentState, ManagedAgentStatus } from "./agents.js";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when the user cancels via Ctrl+C or the synthetic ← Cancel option. */
export class CancellationError extends Error {
  constructor() {
    super(messages.CANCELLED);
    this.name = "CancellationError";
  }
}

/** Thrown for usage errors that should exit with code 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

// ---------------------------------------------------------------------------
// Scope / command options
// ---------------------------------------------------------------------------

export interface GlobalProjectOptions {
  /** Force global scope. */
  global?: boolean;
  /** Force project scope. */
  project?: boolean;
}

export interface CommandOptions extends GlobalProjectOptions {
  /** Show planned changes without writing to disk. */
  dryRun?: boolean;
  /** Skip confirmation prompts. */
  yes?: boolean;
  /** Accept Graphify integration without prompting. */
  withGraphify?: boolean;
}

export interface ScopeContext {
  projectViable: boolean;
  globalViable: boolean;
  projectTarget: InstallTarget;
  globalTarget: InstallTarget;
}

/**
 * Resolve the installation scope for a command.
 *
 * Flags take precedence, then auto-detect when only one scope is viable, then
 * an interactive select prompt. In non-interactive mode without a viable flag,
 * throws a UsageError.
 */
export async function resolveScope(
  options: GlobalProjectOptions,
  context: ScopeContext
): Promise<InstallScope> {
  if (options.global && options.project) {
    throw new UsageError(messages.USAGE_SCOPE_EXCLUSIVE);
  }
  if (options.global) return "global";
  if (options.project) return "project";

  if (stdin.isTTY !== true) {
    throw new UsageError(messages.USAGE_NON_INTERACTIVE_SCOPE);
  }

  if (!context.projectViable && !context.globalViable) {
    throw new Error("No manageable installation found. Run 'opencode-path init --project' or 'opencode-path init --global' to create one.");
  }

  if (!context.projectViable) {
    console.log("   Target: Global (auto-detected)");
    return "global";
  }

  if (!context.globalViable) {
    console.log("   Target: Project (auto-detected)");
    return "project";
  }

  const defaultScope = detectDefaultScope();

  return uiSelect<InstallScope>(
    "Which installation do you want to configure?",
    [
      {
        value: "project",
        name: "Project .opencode/",
        description: context.projectTarget.agentDir,
      },
      {
        value: "global",
        name: "Global ~/.config/opencode/",
        description: context.globalTarget.agentDir,
      },
    ],
    { default: defaultScope }
  );
}

// ---------------------------------------------------------------------------
// Text output helpers
// ---------------------------------------------------------------------------

export function printHeader(title: string, emoji: string): void {
  console.log(pc.bold(`\n${emoji} ${title}\n`));
}

export function printPaths(target: { agentDir: string; configPath: string; skillDir?: string }): void {
  console.log(pc.bold(`   Agent dir: ${target.agentDir}`));
  if (target.skillDir) {
    console.log(pc.bold(`   Skill dir: ${target.skillDir}`));
  }
  console.log(pc.bold(`   Config:    ${target.configPath}\n`));
}

export function printWarning(message: string): void {
  console.log(pc.yellow(`   ⚠ ${message}`));
}

export function printError(message: string): void {
  console.error(pc.red(message));
}

export function dimText(text: string): string {
  return pc.dim(text);
}

export function printCancelled(): void {
  console.log(pc.yellow(`\n   ${messages.CANCELLED}\n`));
}

export function printNoChanges(): void {
  console.log(pc.dim(`\n   ${messages.NO_CHANGES}\n`));
}

export function printComplete(name: string): void {
  console.log(pc.bold(`\n✅ ${name} complete!\n`));
}

export function printNextStep(message: string): void {
  console.log(pc.bold(`\n📌 ${message}`));
}

export function printRestartWarning(): void {
  console.log(pc.yellow(`\n${messages.RESTART_WARNING}\n`));
}

export type SummaryColor = "green" | "yellow" | "red" | "dim";

export interface SummaryLine {
  label: string;
  value: string;
  color?: SummaryColor;
}

const SUMMARY_COLORS: Record<SummaryColor, (text: string) => string> = {
  green: pc.green,
  yellow: pc.yellow,
  red: pc.red,
  dim: pc.dim,
};

/**
 * Print a block of result lines with an aligned label column.
 *
 * Labels are padded so the values start on the same column. Each line is
 * tinted with the requested color; value-only rows can omit the label.
 */
export function printSummary(lines: SummaryLine[], options?: { indent?: number }): void {
  const indent = options?.indent ?? 3;
  const maxLabel = Math.max(...lines.map((l) => l.label.length), 1);
  const prefix = " ".repeat(indent);

  for (const line of lines) {
    const content = `${line.label.padEnd(maxLabel)} ${line.value}`;
    const styled = line.color ? SUMMARY_COLORS[line.color](content) : content;
    console.log(`${prefix}${styled}`);
  }
}

// ---------------------------------------------------------------------------
// Prompt wrappers
// ---------------------------------------------------------------------------

/** Sentinel value used for the synthetic ← Cancel option. */
export const CANCEL_VALUE = "__opencode_path_cancel__";

export type SelectChoice<T> = {
  value: T;
  name?: string;
  description?: string;
  disabled?: boolean | string;
};

export type CheckboxChoice<T> = SelectChoice<T> & {
  checked?: boolean;
};

export function isCancelValue(value: unknown): boolean {
  return value === CANCEL_VALUE;
}

function appendCancel<T>(choices: SelectChoice<T>[]): SelectChoice<T>[] {
  return [
    ...choices,
    {
      value: CANCEL_VALUE as unknown as T,
      name: pc.red("← Cancel"),
    },
  ];
}

function isExitPromptError(err: unknown): err is { name: "ExitPromptError" } {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: string }).name === "ExitPromptError"
  );
}

function translatePromptError(err: unknown): never {
  if (isExitPromptError(err)) {
    throw new CancellationError();
  }
  throw err;
}

/**
 * Wrap @inquirer/select with a visible ← Cancel option and normalized
 * cancellation handling.
 */
export async function uiSelect<T>(
  message: string,
  choices: SelectChoice<T>[],
  options?: { default?: T; pageSize?: number }
): Promise<T> {
  try {
    const answer = await select<T>({
      message,
      choices: appendCancel(choices),
      default: options?.default,
      pageSize: options?.pageSize,
    });

    if (isCancelValue(answer)) {
      throw new CancellationError();
    }

    return answer;
  } catch (err) {
    translatePromptError(err);
  }
}

/**
 * Wrap @inquirer/checkbox with a visible ← Cancel option and normalized
 * cancellation handling.
 */
export async function uiCheckbox<T>(
  message: string,
  choices: CheckboxChoice<T>[],
  options?: { required?: boolean; pageSize?: number }
): Promise<T[]> {
  try {
    const answers = await checkbox<T>({
      message,
      choices: appendCancel(choices),
      required: options?.required ?? false,
      pageSize: options?.pageSize,
    });

    if (answers.some(isCancelValue)) {
      throw new CancellationError();
    }

    return answers.filter((value) => !isCancelValue(value));
  } catch (err) {
    translatePromptError(err);
  }
}

/**
 * Wrap @inquirer/confirm with normalized cancellation handling.
 */
export async function uiConfirm(
  message: string,
  options?: { default?: boolean }
): Promise<boolean> {
  try {
    return await confirm({ message, default: options?.default });
  } catch (err) {
    translatePromptError(err);
  }
}

/**
 * Present a confirm-style prompt with a visible ← Cancel option.
 * Returns true for Yes, false for No, throws CancellationError for Cancel.
 * This ensures AC-07 ("every prompt exposes visible ← Cancel") is met
 * for confirmation prompts in init.
 */
export async function uiConfirmWithCancel(
  message: string,
  options?: { default?: boolean }
): Promise<boolean> {
  const answer = await uiSelect<string>(message, [
    { value: "yes", name: "Yes" },
    { value: "no", name: "No" },
  ], { default: options?.default ? "yes" : "no" });

  return answer === "yes";
}

/**
 * Wrap @inquirer/input with normalized cancellation handling.
 */
export async function uiInput(
  message: string,
  options?: {
    default?: string;
    validate?: (value: string) => boolean | string | Promise<boolean | string>;
  }
): Promise<string> {
  try {
    return await input({
      message,
      default: options?.default,
      validate: options?.validate,
    });
  } catch (err) {
    translatePromptError(err);
  }
}

// ---------------------------------------------------------------------------
// Unified agent row rendering
// ---------------------------------------------------------------------------

const STATE_GLYPHS: Record<ManagedAgentState, string> = {
  active: pc.green("●"),
  missing: pc.dim("○"),
  hidden: pc.yellow("◌"),
  conflict: pc.red("✕"),
};

const STATE_SUFFIXES: Record<ManagedAgentState, string> = {
  active: "",
  missing: pc.dim("(not installed)"),
  hidden: pc.yellow("(hidden)"),
  conflict: pc.red("(conflict — manual file)"),
};

export interface AgentRowOptions {
  /** Include the status glyph at the start of the row (default true). */
  showGlyph?: boolean;
}

/**
 * Render a managed agent row in the shared convention:
 * glyph + name + [custom]/[built-in] badge + status suffix when applicable.
 */
export function buildAgentRow(
  agent: ManagedAgentStatus,
  options?: AgentRowOptions
): string {
  const showGlyph = options?.showGlyph !== false;
  const glyph = showGlyph ? `${STATE_GLYPHS[agent.state]} ` : "";
  const badge =
    agent.kind === "builtin" ? pc.dim("[built-in]") : pc.dim("[custom]");
  const suffix =
    agent.state === "active" ? "" : ` ${STATE_SUFFIXES[agent.state]}`;
  return `${glyph}${agent.name} ${badge}${suffix}`;
}

// ---------------------------------------------------------------------------
// Global SIGINT escalation
// ---------------------------------------------------------------------------

let activeController: AbortController | null = null;
let sigintReceived = 0;
let globalSigintHandlerInstalled = false;
let applyPhaseInterrupted = false;

function globalSigintHandler(): void {
  sigintReceived++;

  if (sigintReceived >= 2) {
    process.exit(130);
    return;
  }

  if (activeController && !activeController.signal.aborted) {
    activeController.abort();
    return;
  }

  // No active cancellable context — controlled exit on first signal.
  console.error(pc.yellow(messages.CANCELLED));
  process.exit(130);
}

/**
 * Register the global SIGINT escalation handler. Safe to call multiple times.
 */
export function setupGlobalSigintHandler(): void {
  if (globalSigintHandlerInstalled) return;
  process.on("SIGINT", globalSigintHandler);
  globalSigintHandlerInstalled = true;
}

/**
 * Reset the global SIGINT state. Intended only for unit-test isolation so that
 * one test's `sigintReceived` counter or installed handler does not leak into
 * the next. Production code should never call this.
 *
 * @internal
 */
export function _resetSigintStateForTest(): void {
  if (globalSigintHandlerInstalled) {
    process.off("SIGINT", globalSigintHandler);
    globalSigintHandlerInstalled = false;
  }
  activeController = null;
  sigintReceived = 0;
  applyPhaseInterrupted = false;
}

/**
 * Run an async action with SIGINT-aware cancellation.
 *
 * - First SIGINT aborts the provided `AbortSignal`.
 * - Second SIGINT forces immediate `process.exit(130)`.
 * - If no abort handler is active, the first SIGINT prints `Cancelled.` and exits.
 */
export async function withAbortOnSigint<T>(
  action: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  setupGlobalSigintHandler();
  const controller = new AbortController();
  activeController = controller;
  sigintReceived = 0;

  try {
    const result = await action(controller.signal);
    if (controller.signal.aborted) {
      throw new CancellationError();
    }
    return result;
  } catch (err) {
    if (controller.signal.aborted) {
      throw new CancellationError();
    }
    throw err;
  } finally {
    activeController = null;
    sigintReceived = 0;
  }
}

// ---------------------------------------------------------------------------
// No-new-dependency spinner
// ---------------------------------------------------------------------------

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

/**
 * Minimal TTY spinner. In interactive terminals it prints a rotating frame to
 * stderr; in non-TTY environments it writes a static line and never emits
 * cursor/control characters.
 */
export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private isTTY: boolean;

  constructor(
    private readonly message: string,
    private readonly output: NodeJS.WriteStream = process.stderr
  ) {
    this.isTTY = output.isTTY ?? false;
  }

  start(): void {
    if (this.isTTY) {
      this.output.write(`${SPINNER_FRAMES[0]} ${this.message}`);
      this.timer = setInterval(() => {
        this.frame = (this.frame + 1) % SPINNER_FRAMES.length;
        this.output.write(`\r${SPINNER_FRAMES[this.frame]} ${this.message}`);
      }, SPINNER_INTERVAL_MS);
    } else {
      this.output.write(`${this.message}\n`);
    }
  }

  stop(finalMessage?: string, options?: { symbol?: string; error?: boolean }): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const symbol = options?.symbol ?? (options?.error ? "✖" : undefined);
    const renderedMessage = finalMessage ?? this.message;

    if (this.isTTY) {
      const line = symbol
        ? `${symbol} ${renderedMessage}`
        : renderedMessage;
      this.output.write(`\r${line}\n`);
    } else if (finalMessage && finalMessage !== this.message) {
      this.output.write(`${finalMessage}\n`);
    }
  }

  /**
   * Clear the current spinner line in a TTY without printing a final message.
   * Safe to call when the spinner is not running.
   */
  clear(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.isTTY) {
      const width = this.message.length + 4;
      this.output.write(`\r${" ".repeat(width)}\r`);
    }
  }
}

/**
 * Run an async action while showing a spinner. The action receives an
 * AbortSignal that is triggered if the user sends SIGINT while waiting.
 *
 * The spinner is stopped cleanly on success, error, or cancellation, and any
 * temporary SIGINT handler is removed before returning.
 */
export async function withSpinner<T>(
  message: string,
  action: (signal: AbortSignal) => Promise<T>,
  options?: { output?: NodeJS.WriteStream }
): Promise<T> {
  const spinner = new Spinner(message, options?.output);
  spinner.start();

  try {
    const result = await withAbortOnSigint(action);
    spinner.stop(message, { symbol: "✓" });
    return result;
  } catch (err) {
    if (err instanceof CancellationError) {
      spinner.clear();
      throw err;
    }
    spinner.stop("Failed", { error: true });
    throw err;
  }
}

/**
 * Run an async action during the apply/write phase with a SIGINT guard.
 *
 * During the apply phase (after the user has confirmed changes), a Ctrl+C
 * should interrupt the action so the caller can print a partial-state warning
 * and exit non-zero, because writes may already be in progress.
 *
 * - First SIGINT sets an internal interruption flag. The action can call
 *   `applyPhaseCheckpoint()` or `checkApplyPhaseSigint()` between write steps
 *   to detect the interruption and stop safely.
 * - Second SIGINT forces immediate `process.exit(130)`.
 *
 * The global SIGINT handler is restored in the finally block.
 */
export async function withApplyPhaseSigint<T>(
  action: () => Promise<T>
): Promise<T> {
  setupGlobalSigintHandler();
  applyPhaseInterrupted = false;
  sigintReceived = 0;

  const applyPhaseHandler = (): void => {
    sigintReceived++;

    if (sigintReceived >= 2) {
      process.exit(130);
      return;
    }

    applyPhaseInterrupted = true;
  };

  // Replace the global handler with the apply-phase handler
  process.off("SIGINT", globalSigintHandler);
  process.on("SIGINT", applyPhaseHandler);

  try {
    return await action();
  } finally {
    // Restore the global handler
    process.off("SIGINT", applyPhaseHandler);
    process.on("SIGINT", globalSigintHandler);
    sigintReceived = 0;
    applyPhaseInterrupted = false;
  }
}

/**
 * Throw a CancellationError if the apply phase has been interrupted by SIGINT.
 * Call this between synchronous write batches to stop before the next write.
 */
export function checkApplyPhaseSigint(): void {
  if (applyPhaseInterrupted) {
    throw new CancellationError();
  }
}

/**
 * Yield to the event loop and then throw a CancellationError if the apply
 * phase has been interrupted by SIGINT. Use this between write phases so the
 * signal can be delivered and the apply stops before the next write.
 */
export async function applyPhaseCheckpoint(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  checkApplyPhaseSigint();
}

// Re-export Separator so callers can build mixed lists without importing
// @inquirer/prompts directly.
export { Separator };
