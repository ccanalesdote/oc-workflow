import {
  resolveTarget,
  type InstallScope,
} from "../lib/paths.js";
import {
  listManagedSkillStatuses,
  installManagedSkill,
  deleteManagedSkill,
  validateAllSkillTemplates,
} from "../lib/skills.js";
import {
  printHeader,
  printPaths,
  printWarning,
  printCancelled,
  printNoChanges,
  printComplete,
  printSummary,
  printRestartWarning,
  uiCheckbox,
  uiConfirm,
  resolveScope,
  type CommandOptions,
  type SummaryLine,
} from "../lib/ui.js";
import * as messages from "../lib/messages.js";
import {
  detectManageableScopes,
} from "../lib/agents.js";

interface SkillsPlan {
  toInstall: string[];
  toDelete: string[];
  unchanged: string[];
  conflicts: string[];
  coreInfo: string[];
}

interface SkillsResult {
  installed: string[];
  deleted: string[];
  unchanged: string[];
  conflicts: string[];
}

function buildSkillsSummary(
  result: SkillsPlan | SkillsResult,
  mode: "plan" | "result"
): SummaryLine[] {
  const installed = "toInstall" in result ? result.toInstall : result.installed;
  const deleted = "toDelete" in result ? result.toDelete : result.deleted;
  const unchanged = result.unchanged;
  const conflicts = result.conflicts;
  const coreInfo = "coreInfo" in result ? result.coreInfo : [];

  if (mode === "plan") {
    return [
      ...(installed.length > 0
        ? [
            {
              label: "Install:",
              value: installed.join(", "),
              color: "green" as const,
            },
          ]
        : []),
      ...(deleted.length > 0
        ? [
            {
              label: "Remove:",
              value: deleted.join(", "),
              color: "red" as const,
            },
          ]
        : []),
      ...(unchanged.length > 0
        ? [
            {
              label: "Unchanged:",
              value: unchanged.join(", "),
              color: "dim" as const,
            },
          ]
        : []),
      ...(conflicts.length > 0
        ? [
            {
              label: "Conflicts:",
              value: conflicts.join(", "),
              color: "red" as const,
            },
          ]
        : []),
      ...(coreInfo.length > 0
        ? [
            {
              label: "Core (managed):",
              value: coreInfo.join(", "),
              color: "dim" as const,
            },
          ]
        : []),
    ];
  }

  return [
    ...(installed.length > 0
      ? [
          {
            label: "Installed:",
            value: installed.join(", "),
            color: "green" as const,
          },
        ]
      : []),
    ...(deleted.length > 0
      ? [
          {
            label: "Removed:",
            value: deleted.join(", "),
            color: "red" as const,
          },
        ]
      : []),
    ...(unchanged.length > 0
      ? [
          {
            label: "Unchanged:",
            value: unchanged.join(", "),
            color: "dim" as const,
          },
        ]
      : []),
    ...(conflicts.length > 0
      ? [
          {
            label: "Conflicts:",
            value: conflicts.join(", "),
            color: "red" as const,
          },
        ]
      : []),
  ];
}

/**
 * Run the `opencode-path skills` command — optional skill management.
 *
 * - Checked optional skills will be active (installed if missing).
 * - Unchecked managed optional skills will be removed.
 * - Core skills are shown informationally but cannot be removed.
 * - Conflicting (unmarked) skills are shown but not modifiable.
 */
export async function skillsCommand(
  options: CommandOptions = {}
): Promise<void> {
  printHeader("OpenCode Path Skill Management", "🛠️");

  // Step 1: Resolve target
  const projectTarget = resolveTarget("project");
  const globalTarget = resolveTarget("global");
  const { projectManageable, globalManageable } = detectManageableScopes(
    projectTarget,
    globalTarget
  );

  const scope: InstallScope = await resolveScope(options, {
    projectViable: projectManageable,
    globalViable: globalManageable,
    projectTarget,
    globalTarget,
  });

  const target = resolveTarget(scope);
  printPaths(target);

  // Validate skill templates before managing skills
  const skillTemplateErrors = validateAllSkillTemplates();
  if (skillTemplateErrors.length > 0) {
    console.error(
      `   Malformed skill template detected:`
    );
    for (const err of skillTemplateErrors) {
      console.error(`     • ${err}`);
    }
    console.error(
      `\n   Fix the skill template files and re-run.\n`
    );
    process.exit(1);
  }

  // Step 2: Get skill statuses
  const statuses = listManagedSkillStatuses(target);

  if (statuses.length === 0) {
    printNoChanges();
    return;
  }

  // Separate core and optional for display
  const coreStatuses = statuses.filter((s) => s.kind === "core");
  const optionalStatuses = statuses.filter((s) => s.kind === "optional");

  // Step 3: Build checkbox choices (optional skills only)
  // Show per-skill status with glyphs, consistent with agents command pattern.
  const choices = optionalStatuses.map((skill) => {
    const isConflict = skill.state === "conflict";
    const isActive = skill.state === "active";
    const glyph = isConflict ? "✕" : isActive ? "●" : "○";
    const suffix = isConflict
      ? " (conflict — manual file)"
      : isActive
        ? ""
        : " (not installed)";
    return {
      value: skill.name as string,
      name: `${glyph} ${skill.name}${suffix}`,
      checked: isActive && !isConflict,
      disabled: isConflict ? "Resolve manually or add the marker" : false,
    };
  });

  const hasConflicts = optionalStatuses.some((s) => s.state === "conflict");

  if (hasConflicts) {
    printWarning(
      "Skills marked with ✕ have manual files without the managed marker."
    );
    console.log(
      "     They cannot be managed here. Resolve manually or add the marker.\n"
    );
  }

  console.log(
    "   Checked = active. Unchecked but active = will be removed if managed.\n"
  );

  const selectedNames = await uiCheckbox<string>(
    "Select optional skills to activate (space to toggle, enter to confirm):",
    choices,
    { required: false }
  );

  const selectedSet = new Set(selectedNames);

  // Step 4: Compute planned changes
  const toInstall: string[] = [];
  const toDelete: string[] = [];
  const unchanged: string[] = [];
  const conflicts: string[] = [];

  for (const skill of optionalStatuses) {
    if (skill.state === "conflict") {
      conflicts.push(skill.name);
    } else if (selectedSet.has(skill.name)) {
      // Checked: should be active
      if (skill.state === "missing") {
        toInstall.push(skill.name);
      } else {
        unchanged.push(skill.name);
      }
    } else {
      // Unchecked: should be removed if managed
      if (skill.state === "active") {
        toDelete.push(skill.name);
      }
      // Unchecked + missing = no-op (not shown)
    }
  }

  // Core skills are informational only
  const coreInfo = coreStatuses.map((s) => s.name);

  const hasChanges = toInstall.length > 0 || toDelete.length > 0;

  if (!hasChanges && conflicts.length === 0) {
    printNoChanges();
    return;
  }

  // Step 5: Show plan
  const plan: SkillsPlan = { toInstall, toDelete, unchanged, conflicts, coreInfo };

  console.log("\n   Planned changes:");
  printSummary(buildSkillsSummary(plan, "plan"));

  // Conflict-only: no install/remove actions to apply; show warning and exit
  // without completion or restart messaging since no files were touched.
  if (!hasChanges && conflicts.length > 0) {
    console.log(
      `\n   ${messages.CONFLICT_RESOLVE_HINT}`
    );
    return;
  }

  if (options.dryRun) {
    console.log(`\n   ${messages.DRY_RUN_LABEL} No files were modified.\n`);
    return;
  }

  // Step 6: Confirm and apply
  if (hasChanges && !options.yes) {
    const proceed = await uiConfirm(messages.APPLY_CHANGES, { default: false });

    if (!proceed) {
      printCancelled();
      return;
    }
  }

  // Apply changes
  const result: SkillsResult = { installed: [], deleted: [], unchanged: [], conflicts: [] };

  for (const name of toInstall) {
    const installResult = installManagedSkill(name as any, target);
    if (installResult === "created") {
      result.installed.push(name);
    } else if (installResult === "conflict") {
      result.conflicts.push(name);
    }
  }

  for (const name of toDelete) {
    const wasDeleted = deleteManagedSkill(name as any, target);
    if (wasDeleted) {
      result.deleted.push(name);
    } else {
      result.conflicts.push(name);
    }
  }

  result.unchanged = unchanged;
  // Re-add conflict skills from detection
  for (const name of conflicts) {
    if (!result.conflicts.includes(name)) {
      result.conflicts.push(name);
    }
  }

  // Step 7: Print results
  printComplete("Skill management");
  printSummary(buildSkillsSummary(result, "result"));

  if (result.conflicts.length > 0) {
    console.log(
      `\n   ${messages.CONFLICT_RESOLVE_HINT}`
    );
  }

  printRestartWarning();
}
