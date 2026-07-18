import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getSkillTemplatesDir,
  getSkillTemplateDir,
  getSkillTemplatePath,
  readSkillTemplate,
  listSkillTemplates,
  validateAllSkillTemplates,
  contentHasSkillMarker,
  fileHasSkillMarker,
  addSkillMarker,
  MANAGED_SKILL_MARKER,
  listManagedSkillCatalog,
  listCoreSkillCatalog,
  listOptionalSkillCatalog,
  getSkillInstallPath,
  getSkillState,
  listManagedSkillStatuses,
  listActiveManagedSkills,
  installManagedSkill,
  installCoreSkill,
  updateManagedSkill,
  deleteManagedSkill,
  planCoreSkillReconciliation,
  applyCoreSkillReconciliation,
  planManagedSkillReconciliation,
  applyManagedSkillReconciliation,
} from "./skills.js";
import { parseFrontmatter } from "./frontmatter.js";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { resolveTarget, CORE_SKILLS, OPTIONAL_SKILLS, GRAPHIFY_SKILLS, ALL_MANAGED_SKILLS, type InstallTarget, type CoreSkillName, type ManagedSkillName } from "./paths.js";

const FIXTURE_DIR = join(import.meta.dirname, "__fixtures__", "skills");
const ARCHITECTURE_SKILLS = [
  "local-architecture",
  "cross-repo-architecture",
] as const;

beforeEach(() => {
  mkdirSync(FIXTURE_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

function fixtureTarget(scope: "project" | "global" = "project"): InstallTarget {
  if (scope === "project") {
    const base = join(FIXTURE_DIR, "project");
    mkdirSync(join(base, ".opencode", "skills"), { recursive: true });
    return {
      scope: "project",
      agentDir: join(base, ".opencode", "agent"),
      configPath: join(base, ".opencode", "opencode.json"),
      skillDir: join(base, ".opencode", "skills"),
    };
  }
  const base = join(FIXTURE_DIR, "global");
  mkdirSync(join(base, "skills"), { recursive: true });
  return {
    scope: "global",
    agentDir: join(base, "agent"),
    configPath: join(base, "opencode.json"),
    skillDir: join(base, "skills"),
  };
}

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

describe("getSkillTemplatesDir", () => {
  it("returns a directory that exists", () => {
    const dir = getSkillTemplatesDir();
    expect(existsSync(dir)).toBe(true);
  });
});

describe("getSkillTemplateDir", () => {
  it("returns path containing the skill name", () => {
    for (const skillName of ARCHITECTURE_SKILLS) {
      const dir = getSkillTemplateDir(skillName);
      expect(dir).toContain(skillName);
      expect(existsSync(dir)).toBe(true);
    }
  });
});

describe("getSkillTemplatePath", () => {
  it("returns path ending in SKILL.md", () => {
    for (const skillName of ARCHITECTURE_SKILLS) {
      const path = getSkillTemplatePath(skillName);
      expect(path).toContain("SKILL.md");
      expect(existsSync(path)).toBe(true);
    }
  });
});

describe("readSkillTemplate", () => {
  it("reads both architecture templates", () => {
    expect(readSkillTemplate("local-architecture")).toContain("Local Architecture");
    expect(readSkillTemplate("cross-repo-architecture")).toContain("Cross-Repo Architecture");
    for (const skillName of ARCHITECTURE_SKILLS) {
      expect(readSkillTemplate(skillName)).toContain(MANAGED_SKILL_MARKER);
    }
  });

  it("throws for non-existent skill", () => {
    expect(() => readSkillTemplate("nonexistent" as any)).toThrow(
      "Skill template not found"
    );
  });
});

describe("architecture core-skill reconciliation", () => {
  it("classifies missing, canonical, and marked drift independently", () => {
    const target = fixtureTarget();
    const missing = planCoreSkillReconciliation("local-architecture", target);
    expect(missing.action).toBe("create");

    installCoreSkill("local-architecture", target);
    expect(planCoreSkillReconciliation("local-architecture", target).action).toBe("unchanged");

    const filePath = getSkillInstallPath("local-architecture", target);
    writeFileSync(filePath, `# Drift\n${MANAGED_SKILL_MARKER}\n`, "utf-8");
    expect(planCoreSkillReconciliation("local-architecture", target).action).toBe("update");
  });

  it("applies canonical create/update and preserves unmarked conflicts", () => {
    const target = fixtureTarget();
    const create = planCoreSkillReconciliation("cross-repo-architecture", target);
    expect(applyCoreSkillReconciliation(create, target)).toBe("create");
    expect(readFileSync(create.path, "utf-8")).toContain("Cross-Repo Architecture");

    writeFileSync(create.path, `# Drift\n${MANAGED_SKILL_MARKER}\n`, "utf-8");
    const update = planCoreSkillReconciliation("cross-repo-architecture", target);
    expect(applyCoreSkillReconciliation(update, target)).toBe("update");
    expect(readFileSync(create.path, "utf-8")).toContain("Cross-Repo Architecture");

    writeFileSync(create.path, "# Manual skill\n", "utf-8");
    const conflict = planCoreSkillReconciliation("cross-repo-architecture", target);
    expect(conflict.action).toBe("conflict");
    expect(applyCoreSkillReconciliation(conflict, target)).toBe("conflict");
    expect(readFileSync(create.path, "utf-8")).toBe("# Manual skill\n");
  });
});

describe("generic managed-skill reconciliation", () => {
  it("keeps core skills always desired and creates missing core definitions", () => {
    for (const skillName of CORE_SKILLS) {
      const target = fixtureTarget();
      const plan = planManagedSkillReconciliation(skillName, target, {
        desired: false,
      });

      expect(plan.action).toBe("create");
      expect(plan.expectedContent).toContain(MANAGED_SKILL_MARKER);
    }
  });

  it("plans selected missing optional skills for creation", () => {
    for (const skillName of OPTIONAL_SKILLS) {
      const target = fixtureTarget();
      const plan = planManagedSkillReconciliation(skillName, target, {
        desired: true,
      });

      expect(plan.action).toBe("create");
      expect(plan.expectedContent).toContain(`name: ${skillName}`);
    }
  });

  it("can disable missing optional creation for reconciliation-only runs", () => {
    const target = fixtureTarget();
    const plan = planManagedSkillReconciliation(OPTIONAL_SKILLS[0], target, {
      desired: true,
      createMissing: false,
    });

    expect(plan.action).toBe("unchanged");
    expect(existsSync(plan.path)).toBe(false);
  });

  it("replaces retained marked core and optional drift from current templates", () => {
    const target = fixtureTarget();
    const skillName = OPTIONAL_SKILLS[0];
    installManagedSkill(skillName, target);
    const filePath = getSkillInstallPath(skillName, target);
    writeFileSync(filePath, `# old optional content\n${MANAGED_SKILL_MARKER}\n`);

    const plan = planManagedSkillReconciliation(skillName, target, {
      desired: true,
    });
    expect(plan.action).toBe("replace");
    expect(applyManagedSkillReconciliation(plan, target)).toBe("replace");
    expect(readFileSync(filePath, "utf-8")).toBe(readSkillTemplate(skillName));
  });

  it("removes explicitly deselected marked optional skills only", () => {
    const target = fixtureTarget();
    const skillName = OPTIONAL_SKILLS[0];
    installManagedSkill(skillName, target);
    const plan = planManagedSkillReconciliation(skillName, target, {
      desired: false,
    });

    expect(plan.action).toBe("remove");
    expect(applyManagedSkillReconciliation(plan, target)).toBe("remove");
    expect(existsSync(getSkillInstallPath(skillName, target))).toBe(false);
  });

  it("leaves unmarked optional files as conflicts during removal", () => {
    const target = fixtureTarget();
    const skillName = OPTIONAL_SKILLS[0];
    const filePath = getSkillInstallPath(skillName, target);
    mkdirSync(join(filePath, ".."), { recursive: true });
    const manual = "# manual optional skill\n";
    writeFileSync(filePath, manual);

    const plan = planManagedSkillReconciliation(skillName, target, {
      desired: false,
    });
    expect(plan.action).toBe("conflict");
    expect(applyManagedSkillReconciliation(plan, target)).toBe("conflict");
    expect(readFileSync(filePath, "utf-8")).toBe(manual);
  });

  it("reconciles installed marked Graphify Explorer without installing an absent copy", () => {
    const target = fixtureTarget();
    const missing = planManagedSkillReconciliation("graphify-explorer", target);
    expect(missing.action).toBe("unchanged");
    expect(existsSync(missing.path)).toBe(false);

    const filePath = getSkillInstallPath("graphify-explorer", target);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, `# old graphify content\n${MANAGED_SKILL_MARKER}\n`);
    const installed = planManagedSkillReconciliation("graphify-explorer", target);
    expect(installed.action).toBe("replace");
    expect(applyManagedSkillReconciliation(installed, target)).toBe("replace");
    expect(readFileSync(filePath, "utf-8")).toBe(readSkillTemplate("graphify-explorer"));
  });

  it("skips an unmarked Graphify Explorer copy and preserves it byte-for-byte", () => {
    const target = fixtureTarget();
    const filePath = getSkillInstallPath("graphify-explorer", target);
    mkdirSync(join(filePath, ".."), { recursive: true });
    const manual = "# externally owned graphify skill\n";
    writeFileSync(filePath, manual);

    const plan = planManagedSkillReconciliation("graphify-explorer", target);
    expect(plan.action).toBe("conflict");
    expect(applyManagedSkillReconciliation(plan, target)).toBe("conflict");
    expect(readFileSync(filePath, "utf-8")).toBe(manual);
  });

  it("is idempotent after canonical skill reconciliation", () => {
    const target = fixtureTarget();
    const skillName = OPTIONAL_SKILLS[0];
    const first = planManagedSkillReconciliation(skillName, target, {
      desired: true,
    });
    expect(applyManagedSkillReconciliation(first, target)).toBe("create");

    const second = planManagedSkillReconciliation(skillName, target, {
      desired: true,
    });
    expect(second.action).toBe("unchanged");
    expect(applyManagedSkillReconciliation(second, target)).toBe("unchanged");
  });
});

describe("listSkillTemplates", () => {
  it("lists all managed skill templates (core + optional + graphify)", () => {
    const skills = listSkillTemplates();
    expect(skills).toContain("cross-repo-architecture");
    expect(skills).toContain("migration-and-data-change");
    expect(skills).toContain("api-contracts");
    expect(skills).toContain("security-boundary-review");
    expect(skills).toContain("incident-recovery");
    expect(skills).toContain("test-strategy");
    expect(skills).toContain("graphify-explorer");
    expect(skills.length).toBe(ALL_MANAGED_SKILLS.length);
  });
});

describe("validateAllSkillTemplates", () => {
  it("returns empty array when all managed templates are valid", () => {
    const errors = validateAllSkillTemplates();
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Skill template frontmatter (AC-01, AC-02)
// ---------------------------------------------------------------------------

describe("skill template frontmatter", () => {
  for (const skillName of ARCHITECTURE_SKILLS) {
    it(`${skillName} SKILL.md has valid YAML frontmatter`, () => {
      const content = readSkillTemplate(skillName);
      const { frontmatter, body } = parseFrontmatter(content);

      expect(frontmatter).toBeDefined();
      expect(frontmatter.name).toBe(skillName);
      expect(typeof frontmatter.description).toBe("string");
      expect((frontmatter.description as string).length).toBeGreaterThan(0);
      expect(body).toContain(MANAGED_SKILL_MARKER);
    });
  }

  it("installed architecture skills preserve frontmatter and managed marker", () => {
    for (const skillName of ARCHITECTURE_SKILLS) {
      const target = fixtureTarget();
      const result = installCoreSkill(skillName, target);
      expect(result).toBe("created");

      const filePath = getSkillInstallPath(skillName, target);
      const content = readFileSync(filePath, "utf-8");
      const { frontmatter, body } = parseFrontmatter(content);
      expect(frontmatter.name).toBe(skillName);
      expect(typeof frontmatter.description).toBe("string");
      expect((frontmatter.description as string).length).toBeGreaterThan(0);
      expect(body).toContain(MANAGED_SKILL_MARKER);
    }
  });

  it("updateManagedSkill preserves frontmatter through architecture update cycles", () => {
    for (const skillName of ARCHITECTURE_SKILLS) {
      const target = fixtureTarget();
      installCoreSkill(skillName, target);

      const filePath = getSkillInstallPath(skillName, target);
      writeFileSync(
        filePath,
        `---
name: ${skillName}
description: Old description.
---
# Old content
${MANAGED_SKILL_MARKER}
`,
        "utf-8"
      );

      const result = updateManagedSkill(skillName, target);
      expect(result).toBe("updated");

      const content = readFileSync(filePath, "utf-8");
      const { frontmatter, body } = parseFrontmatter(content);
      expect(frontmatter.name).toBe(skillName);
      expect(typeof frontmatter.description).toBe("string");
      expect(frontmatter.description as string).not.toBe("Old description.");
      expect((frontmatter.description as string).length).toBeGreaterThan(0);
      expect(body).toContain(MANAGED_SKILL_MARKER);
    }
  });
});

describe("cross-repo architecture playbook", () => {
  it("defines the minimal coordination artifact shape", () => {
    const content = readSkillTemplate("cross-repo-architecture");

    expect(content).toContain(".path/work/{feature-slug}/");
    expect(content).toContain("brief.md");
    expect(content).toContain("repos/{repo}.md");
    expect(content).toContain("one `repos/{repo}.md` draft for each affected implementation boundary");
    expect(content).toContain("no `tasks.md` and no `progress.md`");
    expect(content).toContain("## Participating repositories and responsibilities");
    expect(content).toContain("## Compatibility matrix");
    expect(content).toContain("## Development ordering constraints");
    expect(content).toContain("## Open cross decisions");
  });

  it("separates shared contracts from local decision space", () => {
    const content = readSkillTemplate("cross-repo-architecture");

    for (const section of [
      "## Assigned responsibility",
      "## Binding shared contracts",
      "## Compatibility obligations",
      "## Local decision space",
      "## Prohibited local decisions",
      "## Escalation",
    ]) {
      expect(content).toContain(section);
    }

    expect(content).toContain("internal data access and query design");
    expect(content).toContain("migrations internal to that repository");
    expect(content).toMatch(/Coordination context stays in the\s+cross artifact/);
  });

  it("prohibits local planning and post-commit operational ownership", () => {
    const content = readSkillTemplate("cross-repo-architecture");

    for (const prohibited of [
      "local acceptance criteria",
      "Developer implementation tasks",
      "checkpoints or local progress logs",
      "QA or production deployment management",
      "operational migration execution",
      "feature-flag or runtime activation",
      "scheduler activation",
      "deployed smoke requirements",
    ]) {
      expect(content).toContain(prohibited);
    }

    expect(content).toContain("Do not create a separate `cross-architect`");
    expect(content).toContain("Compatibility-preserving development order may be stated");
    expect(content).toContain("does not manage or prove the later deployment or operations");
  });
});

describe("architecture protocol traceability", () => {
  it("local playbook defines exact local schemas and AC/task/checkpoint mapping", () => {
    const content = readSkillTemplate("local-architecture");

    expect(content).toContain(".path/work/{feature-slug}/");
    expect(content).toContain("brief.md\n  tasks.md\n  progress.md");
    expect(content).toContain("## `tasks.md` local schema");
    expect(content).toContain("## `progress.md` local execution log");
    expect(content).toContain("| ID | Status | Owner | Files / areas | Technical objective | Covers | Dependencies | Verification | Notes |");
    expect(content).toContain("| ID | Included tasks | Intended ACs closed | Reviewer focus | Expected evidence | Reviewer required |");
    expect(content).toMatch(/Every criterion must be\s+covered by at least one task/);
    expect(content).toContain("Every task belongs to a checkpoint");
    expect(content).toMatch(/Reviewer required:\s+yes/);
  });

  it("local cross-draft consumption is binding and stops when the playbook is unavailable", () => {
    const content = readSkillTemplate("local-architecture");

    expect(content).toMatch(/Load this local playbook only/i);
    expect(content).toMatch(/Treat code-affecting shared API, DTO, event, auth, error, and compatibility\s+obligations as binding input/);
    expect(content).toMatch(/internal data access, query design, module layout, files, tests,\s+migrations internal to this repository, and local configuration/);
    expect(content).toMatch(/If the required\s+`local-architecture` skill is unavailable or cannot be loaded/);
    expect(content).toContain("stop and report the problem");
  });

  it("cross playbook has exact artifact exclusions and keeps the shared preflight in the kernel", () => {
    const content = readSkillTemplate("cross-repo-architecture");

    expect(content).toContain("no `tasks.md` and no `progress.md`");
    expect(content).toContain("Cross artifacts must not contain or own:");
    expect(content).toContain("local acceptance criteria");
    expect(content).toContain("Developer implementation tasks");
    expect(content).toContain("checkpoints or local progress logs");
    expect(content).toContain("repository validation commands, evidence receipts, or post-commit proof");
    expect(content).toMatch(/Use the Architect\s+kernel's complete common Mode 3\s+preflight/i);
    expect(content).toMatch(/resulting cross\s+artifacts remain only `brief.md` plus\s+`repos\/\{repo\}\.md` drafts/);
  });
});

describe("test-strategy capability-aware validation", () => {
  it("discovers existing capabilities and requires relevant available checks", () => {
    const content = readSkillTemplate("test-strategy");

    expect(content).toMatch(/discovering the repository's existing validation capabilities/i);
    expect(content).toContain("test frameworks and commands");
    expect(content).toContain("smoke checks");
    expect(content).toContain("E2E facilities");
    expect(content).toContain("build/typecheck commands");
    expect(content).toContain("CI configuration");
    expect(content).toContain("documented manual checks");
    expect(content).toMatch(/relevant test framework exists, require focused tests/i);
    expect(content).toMatch(/relevant smoke or E2E facility exists, require its applicable checks/i);
    expect(content).toMatch(/do not skip an available check/i);
  });

  it("treats absent infrastructure as disclosed non-blocking risk without adding it", () => {
    const content = readSkillTemplate("test-strategy");

    expect(content).toMatch(/no suitable test or E2E platform exists/i);
    expect(content).toMatch(/best available local check/i);
    expect(content).toMatch(/non-blocking pre-existing debt or residual risk/i);
    expect(content).toMatch(/do not introduce incidental infrastructure/i);
    expect(content).toMatch(/must never be presented as passing validation/i);
  });

  it("allows explicit acceptance only for an unavailable sensitive validation mechanism", () => {
    const content = readSkillTemplate("test-strategy");

    expect(content).toMatch(/sensitive change whose adequate validation mechanism is unavailable/i);
    expect(content).toMatch(/explicit user risk decision/i);
    expect(content).toMatch(/does not require an attached evidence artifact/i);

    for (const prohibitedWaiver of [
      "known defect",
      "failed or omitted relevant available check",
      "undefined security",
      "compatibility",
      "rollback/compensation",
      "migration strategy",
    ]) {
      expect(content).toContain(prohibitedWaiver);
    }

    expect(content).toMatch(/Risk acceptance cannot waive a known defect, a failed or omitted relevant available check, or an undefined security, compatibility, rollback\/compensation, or migration strategy/i);
  });
});

describe("migration and API contract local closure boundaries", () => {
  it("keeps migration safety planning local and execution receipts post-commit", () => {
    const content = readSkillTemplate("migration-and-data-change");

    for (const requiredSafetyRule of [
      "expand/contract",
      "invalid-existing-data handling",
      "rollback/compensation",
      "compatibility",
      "development/deployment ordering",
      "lock risk",
    ]) {
      expect(content).toContain(requiredSafetyRule);
    }

    expect(content).toMatch(/Execution in a real environment, deployment, activation, monitoring, and execution receipts are post-commit responsibilities/i);
    expect(content).toMatch(/manual migration project may close locally without a QA or production execution receipt/i);
    expect(content).toMatch(/available local validation/i);
    expect(content).toMatch(/must not be represented as completed local evidence or block local commit closure/i);
  });

  it("does not let risk acceptance replace migration safety strategy or known-defect handling", () => {
    const content = readSkillTemplate("migration-and-data-change");

    expect(content).toMatch(/explicit user risk decision may cover unavailable execution or validation evidence/i);
    for (const prohibitedWaiver of [
      "known unsafe defect",
      "undefined migration/rollback/compensation/compatibility strategy",
      "omitted or failed available check",
    ]) {
      expect(content).toContain(prohibitedWaiver);
    }
  });

  it("keeps API compatibility verification local and rollout execution outside closure", () => {
    const content = readSkillTemplate("api-contracts");

    expect(content).toMatch(/relevant capabilities already available in the repository/i);
    expect(content).toMatch(/deployed rollout execution, QA\/production evidence, activation, and operational receipts are outside local closure responsibility/i);
    expect(content).toMatch(/Do not treat absent deployed evidence as a passing contract check/i);
    expect(content).toMatch(/development order and compatibility\/rollout constraints may be documented locally/i);
    expect(content).toMatch(/Do not require deployed evidence for local closure/i);

    for (const prohibitedWaiver of [
      "known defect",
      "omitted or failed available check",
      "undefined contract",
      "compatibility",
      "rollout strategy",
    ]) {
      expect(content).toContain(prohibitedWaiver);
    }
  });
});

// ---------------------------------------------------------------------------
// Optional skill template frontmatter validation (AC-11)
// ---------------------------------------------------------------------------

describe("optional skill template frontmatter", () => {
  const optionalSkills = OPTIONAL_SKILLS as readonly string[];

  for (const skillName of optionalSkills) {
    it(`${skillName} SKILL.md has valid frontmatter with matching name`, () => {
      const content = readSkillTemplate(skillName as ManagedSkillName);
      const { frontmatter, body } = parseFrontmatter(content);

      expect(frontmatter).toBeDefined();
      expect(frontmatter.name).toBe(skillName);

      const desc = frontmatter.description;
      expect(typeof desc).toBe("string");
      expect((desc as string).length).toBeGreaterThan(0);

      // Body contains managed marker
      expect(body).toContain(MANAGED_SKILL_MARKER);
    });

    it(`${skillName} can be installed with managed marker`, () => {
      const target = fixtureTarget();
      const result = installManagedSkill(skillName as ManagedSkillName, target);
      expect(result).toBe("created");

      const filePath = getSkillInstallPath(skillName as ManagedSkillName, target);
      const content = readFileSync(filePath, "utf-8");

      const { frontmatter, body } = parseFrontmatter(content);
      expect(frontmatter.name).toBe(skillName);
      expect(typeof frontmatter.description).toBe("string");
      expect((frontmatter.description as string).length).toBeGreaterThan(0);
      expect(body).toContain(MANAGED_SKILL_MARKER);
    });
  }
});

// ---------------------------------------------------------------------------
// Marker detection
// ---------------------------------------------------------------------------

describe("contentHasSkillMarker", () => {
  it("detects the marker in content", () => {
    const content = `# Some skill\n${MANAGED_SKILL_MARKER}\n`;
    expect(contentHasSkillMarker(content)).toBe(true);
  });

  it("returns false when marker is absent", () => {
    expect(contentHasSkillMarker("# Some skill\n")).toBe(false);
  });
});

describe("fileHasSkillMarker", () => {
  it("returns true for a file with the marker", () => {
    const filePath = join(FIXTURE_DIR, "with-marker.md");
    writeFileSync(filePath, `# Test\n${MANAGED_SKILL_MARKER}\n`, "utf-8");
    expect(fileHasSkillMarker(filePath)).toBe(true);
  });

  it("returns false for a file without the marker", () => {
    const filePath = join(FIXTURE_DIR, "without-marker.md");
    writeFileSync(filePath, "# Test\n", "utf-8");
    expect(fileHasSkillMarker(filePath)).toBe(false);
  });

  it("returns false for a non-existent file", () => {
    expect(fileHasSkillMarker("/nonexistent/file.md")).toBe(false);
  });
});

describe("addSkillMarker", () => {
  it("adds the marker to content without it", () => {
    const result = addSkillMarker("# Test\n");
    expect(result).toContain(MANAGED_SKILL_MARKER);
    expect(result.endsWith("\n")).toBe(true);
  });

  it("does not duplicate the marker if already present", () => {
    const content = `# Test\n${MANAGED_SKILL_MARKER}\n`;
    const result = addSkillMarker(content);
    const markerCount = result.split(MANAGED_SKILL_MARKER).length - 1;
    expect(markerCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

describe("listManagedSkillCatalog", () => {
  it("includes all managed skills (core + optional + graphify)", () => {
    const catalog = listManagedSkillCatalog();
    expect(catalog).toContain("cross-repo-architecture");
    expect(catalog).toContain("migration-and-data-change");
    expect(catalog).toContain("api-contracts");
    expect(catalog).toContain("security-boundary-review");
    expect(catalog).toContain("incident-recovery");
    expect(catalog).toContain("test-strategy");
    expect(catalog).toContain("graphify-explorer");
    expect(catalog.length).toBe(ALL_MANAGED_SKILLS.length);
  });

  it("distinguishes core vs optional in ManagedSkillStatus kind field", () => {
    const target = fixtureTarget();
    const statuses = listManagedSkillStatuses(target);
    for (const skillName of CORE_SKILLS) {
      const coreStatus = statuses.find((s) => s.name === skillName);
      expect(coreStatus).toBeDefined();
      expect(coreStatus!.kind).toBe("core");
    }
    const optionalStatus = statuses.find((s) => s.name === "migration-and-data-change");
    expect(optionalStatus).toBeDefined();
    expect(optionalStatus!.kind).toBe("optional");
  });

  it("classifies graphify-explorer with kind 'graphify'", () => {
    const target = fixtureTarget();
    const statuses = listManagedSkillStatuses(target);
    const graphifyStatus = statuses.find((s) => s.name === "graphify-explorer");
    expect(graphifyStatus).toBeDefined();
    expect(graphifyStatus!.kind).toBe("graphify");
  });
});

describe("listCoreSkillCatalog", () => {
  it("returns only core skills", () => {
    const catalog = listCoreSkillCatalog();
    expect(catalog).toEqual([...CORE_SKILLS]);
    expect(catalog).toContain("cross-repo-architecture");
    expect(catalog).not.toContain("migration-and-data-change");
  });
});

describe("listOptionalSkillCatalog", () => {
  it("returns only optional skills", () => {
    const catalog = listOptionalSkillCatalog();
    expect(catalog).toEqual([...OPTIONAL_SKILLS]);
    expect(catalog).toContain("migration-and-data-change");
    expect(catalog).not.toContain("cross-repo-architecture");
  });
});

describe("getSkillInstallPath", () => {
  it("returns path under .opencode/skills/<name>/SKILL.md for project scope", () => {
    const target = fixtureTarget("project");
    const path = getSkillInstallPath("cross-repo-architecture", target);
    expect(path).toContain(".opencode/skills/cross-repo-architecture/SKILL.md");
  });

  it("returns path under skills/<name>/SKILL.md for global scope", () => {
    const target = fixtureTarget("global");
    const path = getSkillInstallPath("cross-repo-architecture", target);
    expect(path).toContain("skills/cross-repo-architecture/SKILL.md");
  });
});

// ---------------------------------------------------------------------------
// State detection
// ---------------------------------------------------------------------------

describe("getSkillState", () => {
  it("returns 'missing' when no file exists", () => {
    const target = fixtureTarget();
    expect(getSkillState("cross-repo-architecture", target)).toBe("missing");
  });

  it("returns 'active' when file exists with managed marker", () => {
    const target = fixtureTarget();
    installCoreSkill("cross-repo-architecture", target);
    expect(getSkillState("cross-repo-architecture", target)).toBe("active");
  });

  it("returns 'conflict' when file exists without managed marker", () => {
    const target = fixtureTarget();
    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, "# Manual skill\n", "utf-8");
    expect(getSkillState("cross-repo-architecture", target)).toBe("conflict");
  });
});

describe("listManagedSkillStatuses", () => {
  it("returns statuses for all managed skills", () => {
    const target = fixtureTarget();
    const statuses = listManagedSkillStatuses(target);
    expect(statuses.length).toBe(ALL_MANAGED_SKILLS.length);
    expect(statuses.every((s) => ["active", "missing", "conflict"].includes(s.state))).toBe(true);
  });
});

describe("listActiveManagedSkills", () => {
  it("returns empty when no skills installed", () => {
    const target = fixtureTarget();
    const active = listActiveManagedSkills(target);
    expect(active.length).toBe(0);
  });

  it("returns installed skills", () => {
    const target = fixtureTarget();
    installCoreSkill("cross-repo-architecture", target);
    const active = listActiveManagedSkills(target);
    expect(active.length).toBe(1);
    expect(active[0].name).toBe("cross-repo-architecture");
    expect(active[0].state).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// Mutate operations
// ---------------------------------------------------------------------------

describe("installCoreSkill", () => {
  it("creates a new skill file with the managed marker", () => {
    const target = fixtureTarget();
    const result = installCoreSkill("cross-repo-architecture", target);
    expect(result).toBe("created");
    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain(MANAGED_SKILL_MARKER);
    expect(content).toContain("Cross-Repo Architecture");
  });

  it("returns 'already_active' for an existing managed file", () => {
    const target = fixtureTarget();
    installCoreSkill("cross-repo-architecture", target);
    const result = installCoreSkill("cross-repo-architecture", target);
    expect(result).toBe("already_active");
  });

  it("returns 'conflict' for an existing file without the marker", () => {
    const target = fixtureTarget();
    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, "# Manual skill\n", "utf-8");
    const result = installCoreSkill("cross-repo-architecture", target);
    expect(result).toBe("conflict");
    // File should not be overwritten
    const content = readFileSync(filePath, "utf-8");
    expect(content).toBe("# Manual skill\n");
    expect(content).not.toContain(MANAGED_SKILL_MARKER);
  });

  it("installs to project scope", () => {
    const target = fixtureTarget("project");
    const result = installCoreSkill("cross-repo-architecture", target);
    expect(result).toBe("created");
    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    expect(filePath).toContain(".opencode/skills/cross-repo-architecture/SKILL.md");
  });

  it("installs to global scope", () => {
    const target = fixtureTarget("global");
    const result = installCoreSkill("cross-repo-architecture", target);
    expect(result).toBe("created");
    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    expect(filePath).toContain("skills/cross-repo-architecture/SKILL.md");
  });
});

describe("updateManagedSkill", () => {
  it("updates a managed skill file", () => {
    const target = fixtureTarget();
    installCoreSkill("cross-repo-architecture", target);
    // Modify the installed file to simulate an older version
    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    writeFileSync(filePath, `# Old content\n${MANAGED_SKILL_MARKER}\n`, "utf-8");
    
    const result = updateManagedSkill("cross-repo-architecture", target);
    expect(result).toBe("updated");
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Cross-Repo Architecture");
    expect(content).toContain(MANAGED_SKILL_MARKER);
  });

  it("returns 'not_managed' for a file without marker", () => {
    const target = fixtureTarget();
    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, "# Manual\n", "utf-8");
    
    const result = updateManagedSkill("cross-repo-architecture", target);
    expect(result).toBe("not_managed");
    // File should be untouched
    expect(readFileSync(filePath, "utf-8")).toBe("# Manual\n");
  });

  it("returns 'not_installed' when file does not exist", () => {
    const target = fixtureTarget();
    const result = updateManagedSkill("cross-repo-architecture", target);
    expect(result).toBe("not_installed");
  });
});

describe("deleteManagedSkill", () => {
  it("deletes a managed skill file", () => {
    const target = fixtureTarget();
    installCoreSkill("cross-repo-architecture", target);
    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    expect(existsSync(filePath)).toBe(true);
    
    const result = deleteManagedSkill("cross-repo-architecture", target);
    expect(result).toBe(true);
    expect(existsSync(filePath)).toBe(false);
  });

  it("returns false for non-existent file", () => {
    const target = fixtureTarget();
    const result = deleteManagedSkill("cross-repo-architecture", target);
    expect(result).toBe(false);
  });

  it("returns false for file without managed marker (conflict protection)", () => {
    const target = fixtureTarget();
    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, "# Manual\n", "utf-8");
    
    const result = deleteManagedSkill("cross-repo-architecture", target);
    expect(result).toBe(false);
    expect(existsSync(filePath)).toBe(true);
  });

  it("removes empty parent directory after deletion", () => {
    const target = fixtureTarget();
    installCoreSkill("cross-repo-architecture", target);
    const skillDir = join(target.skillDir, "cross-repo-architecture");
    expect(existsSync(skillDir)).toBe(true);
    
    deleteManagedSkill("cross-repo-architecture", target);
    expect(existsSync(skillDir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("project target without init has missing core skills", () => {
    const target = fixtureTarget();
    const statuses = listManagedSkillStatuses(target);
    const coreStatuses = statuses.filter((s) => s.kind === "core");
    expect(coreStatuses.every((s) => s.state === "missing")).toBe(true);
  });

  it("global target without init has missing core skills", () => {
    const target = fixtureTarget("global");
    const statuses = listManagedSkillStatuses(target);
    const coreStatuses = statuses.filter((s) => s.kind === "core");
    expect(coreStatuses.every((s) => s.state === "missing")).toBe(true);
  });

  it("already_active does not modify file content", () => {
    const target = fixtureTarget();
    installCoreSkill("cross-repo-architecture", target);
    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    const beforeContent = readFileSync(filePath, "utf-8");
    
    const result = installCoreSkill("cross-repo-architecture", target);
    expect(result).toBe("already_active");
    
    const afterContent = readFileSync(filePath, "utf-8");
    expect(afterContent).toBe(beforeContent);
  });

  it("conflict does not overwrite user content", () => {
    const target = fixtureTarget();
    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    mkdirSync(join(filePath, ".."), { recursive: true });
    const userContent = "# My custom skill content\n## Important notes\n";
    writeFileSync(filePath, userContent, "utf-8");
    
    const result = installCoreSkill("cross-repo-architecture", target);
    expect(result).toBe("conflict");
    
    const content = readFileSync(filePath, "utf-8");
    expect(content).toBe(userContent);
  });

  it("managed marker appears in installed skill", () => {
    const target = fixtureTarget();
    installCoreSkill("cross-repo-architecture", target);
    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    expect(fileHasSkillMarker(filePath)).toBe(true);
  });
});
