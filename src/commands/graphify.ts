/**
 * opencode-path graphify command.
 *
 * Initializes or incrementally updates the local Graphify repository graph.
 * Does not install Graphify CLI, skills, hooks, or modify .path/work.
 */

import pc from "picocolors";
import {
  isGraphifyAvailable,
  hasGraph,
  runGraphInit,
  runGraphUpdate,
} from "../lib/graphify.js";
import {
  printHeader,
  printError,
  printWarning,
  withAbortOnSigint,
  type CommandOptions,
  type GlobalProjectOptions,
} from "../lib/ui.js";

export interface GraphifyOptions extends GlobalProjectOptions {
  /** Force-update an existing graph (maps to graphify update . --force). */
  force?: boolean;
}

export async function graphifyCommand(
  options: GraphifyOptions = {}
): Promise<void> {
  printHeader("Graphify", "📊");

  // Verify Graphify CLI is available
  if (!isGraphifyAvailable()) {
    printError(
      "   Graphify CLI is not installed or not on PATH.\n" +
        "   Run 'opencode-path init --with-graphify' to install it, or\n" +
        "   install Graphify manually: https://github.com/ggcaponetto/graphify"
    );
    process.exit(1);
  }

  const graphExists = hasGraph();

  console.log(pc.dim(`   Graph exists: ${graphExists ? "yes" : "no"}`));

  if (graphExists) {
    // Update existing graph
    const mode = options.force ? "force update" : "incremental update";
    console.log(pc.dim(`   Mode: ${mode}`));
    console.log();

    try {
      await withAbortOnSigint(async (signal) => {
        const result = await runGraphUpdate(undefined, options.force, signal);
        if (!result.success) {
          throw new Error(result.error ?? "graphify update failed");
        }
      });
      console.log(pc.green(`   ✅ Graph ${options.force ? "force-" : ""}updated successfully.\n`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      printError(`   Graph update failed: ${message}`);
      process.exit(1);
    }
  } else {
    // Initialize new graph
    console.log(pc.dim("   Mode: initialize"));
    console.log();

    try {
      await withAbortOnSigint(async (signal) => {
        const result = await runGraphInit(undefined, signal);
        if (!result.success) {
          throw new Error(result.error ?? "graphify . failed");
        }
      });
      console.log(pc.green("   ✅ Graph initialized successfully.\n"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      printError(`   Graph initialization failed: ${message}`);
      process.exit(1);
    }
  }

  console.log(
    pc.dim(
      "   Graph stored in graphify-out/graph.json. Use Explorer with the\n" +
        "   graphify-explorer skill for medium/large repository reconnaissance."
    )
  );
  console.log();
}
