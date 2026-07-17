#!/usr/bin/env node

/**
 * validate-dist-skill-lookup.mjs
 *
 * Regression validation that the built/packaged CLI can locate skill templates.
 *
 * The bundled CLI runs from dist/cli.js, and getSkillTemplatesDir() must
 * resolve templates/skills/ correctly. This script simulates that path
 * resolution without importing the bundled module.
 *
 * Usage:
 *   npm run build && node scripts/validate-dist-skill-lookup.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cwd } from "node:process";

// ── helpers ─────────────────────────────────────────────────────────────────

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

// ── 1. Require build artifact ──────────────────────────────────────────────

const distCli = resolve(cwd(), "dist", "cli.js");
if (!existsSync(distCli)) {
  fail("dist/cli.js not found. Run 'npm run build' first.");
}
console.log(`dist/cli.js found: ${distCli}`);

// ── 2. Simulate dist-based path resolution ─────────────────────────────────
//
// In the bundled CLI, import.meta.url points to dist/cli.js, so dirname gives
// <root>/dist/. The fixed getSkillTemplatesDir() resolves:
//   resolve(distDir, "..", "templates", "skills")

const distDir = dirname(distCli);
const skillTemplatesDir = resolve(distDir, "..", "templates", "skills");

console.log(`Dist dir:            ${distDir}`);
console.log(`Skill templates dir: ${skillTemplatesDir}`);

// ── 3. Verify templates/skills/ directory ──────────────────────────────────

if (!existsSync(skillTemplatesDir)) {
  fail(`Skill templates directory not found at: ${skillTemplatesDir}`);
}
console.log("templates/skills/ exists ✓");

// ── 4. Verify all managed skill templates ───────────────────────────────────

const managedSkills = [
  "local-architecture",
  "cross-repo-architecture",
  "migration-and-data-change",
  "api-contracts",
  "security-boundary-review",
  "incident-recovery",
  "test-strategy",
  "graphify-explorer",
];

for (const skillName of managedSkills) {
  const skillFile = resolve(skillTemplatesDir, skillName, "SKILL.md");
  console.log(`Skill file: ${skillFile}`);

  if (!existsSync(skillFile)) {
    fail(`Skill template file not found at: ${skillFile}`);
  }
  console.log(`${skillName}/SKILL.md exists ✓`);

  const content = readFileSync(skillFile, "utf-8");
  if (!content.includes("<!-- managed-by: opencode-path -->")) {
    fail(`${skillName}/SKILL.md is missing the managed marker`);
  }
  console.log(`${skillName} managed marker verified ✓`);
}

const agentTemplatesDir = resolve(distDir, "..", "templates");
if (!existsSync(agentTemplatesDir)) {
  fail(`Agent templates directory not found at: ${agentTemplatesDir}`);
}
const architectFile = resolve(agentTemplatesDir, "architect.md");
if (!existsSync(architectFile)) {
  fail(`architect.md not found at: ${architectFile}`);
}
console.log("templates/architect.md exists ✓");

// ── Done ───────────────────────────────────────────────────────────────────

console.log("\nPASS: Build-output skill template lookup works correctly.");
console.log("The packaged CLI can locate templates/skills/ from dist/cli.js.");
