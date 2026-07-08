#!/usr/bin/env node

import { Command } from "commander";
import pc from "picocolors";
import { initCommand } from "./commands/init.js";
import { modelsCommand } from "./commands/models.js";
import { profilesCommand } from "./commands/profiles.js";
import { agentsCommand } from "./commands/agents.js";
import { uninstallCommand } from "./commands/uninstall.js";
import {
  CancellationError,
  UsageError,
  setupGlobalSigintHandler,
} from "./lib/ui.js";
import * as messages from "./lib/messages.js";

const program = new Command();

program
  .name("opencode-path")
  .description("Structured multi-agent workflow CLI for opencode")
  .version("0.4.2");

program
  .command("init")
  .description("Install the workflow pack into a project or global OpenCode config")
  .option("--global", "Use global scope")
  .option("--project", "Use project scope")
  .option("--dry-run", "Show planned changes without applying them")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(runWithExitCode(async (options) => {
    await initCommand(options);
  }));

program
  .command("agents")
  .description("Manage which workflow agents are active (install, delete, hide, restore)")
  .option("--global", "Use global scope")
  .option("--project", "Use project scope")
  .option("--dry-run", "Show planned changes without applying them")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(runWithExitCode(async (options) => {
    await agentsCommand(options);
  }));

program
  .command("models")
  .description("Configure model IDs for active agents")
  .option("--global", "Use global scope")
  .option("--project", "Use project scope")
  .action(runWithExitCode(async (options) => {
    await modelsCommand(options);
  }));

program
  .command("profiles")
  .description("Apply stack-specific permission profiles to installed agents")
  .option("--global", "Use global scope")
  .option("--project", "Use project scope")
  .option("--dry-run", "Show planned changes without applying them")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(runWithExitCode(async (options) => {
    await profilesCommand(options);
  }));

program
  .command("uninstall")
  .description("Remove managed custom agent files and core skills")
  .option("--global", "Use global scope")
  .option("--project", "Use project scope")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(runWithExitCode(async (options) => {
    await uninstallCommand(options);
  }));

// ---------------------------------------------------------------------------
// Technical debt (AC-10): Future CLI commands
// ---------------------------------------------------------------------------
// When optional skills are introduced, consider adding:
// - `skills` command: list, install, update, delete optional skills
//   (register in src/commands/skills.ts, add to the program below uninstall)
// - `--update` flag on `init` to refresh managed agent/skill files to
//   latest packaged versions without re-running the full guided flow
// - Update/refresh semantics in src/lib/skills.ts for managed skill files
// Core skill installation (auto-installed during init) and uninstall
// already handle managed skills; the dedicated `skills` command would
// handle optional/user-selected skills and independent update flows.

setupGlobalSigintHandler();

program.parse();

function runWithExitCode(
  action: (options: Record<string, unknown>) => Promise<void>
) {
  return async (options: Record<string, unknown>): Promise<void> => {
    try {
      await action(options);
    } catch (err) {
      if (err instanceof CancellationError) {
        console.error(pc.yellow(messages.CANCELLED));
        process.exit(130);
      }

      if (err instanceof UsageError) {
        console.error(pc.yellow(`${messages.USAGE_ERROR_PREFIX}${err.message}`));
        process.exit(2);
      }

      console.error(pc.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  };
}
