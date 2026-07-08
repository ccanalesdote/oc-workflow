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
  getSkillInstallPath,
  getSkillState,
  listManagedSkillStatuses,
  listActiveManagedSkills,
  installCoreSkill,
  updateCoreSkill,
  deleteCoreSkill,
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
import { resolveTarget, CORE_SKILLS, type InstallTarget, type CoreSkillName } from "./paths.js";

const FIXTURE_DIR = join(import.meta.dirname, "__fixtures__", "skills");

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
    const dir = getSkillTemplateDir("cross-repo-architecture");
    expect(dir).toContain("cross-repo-architecture");
    expect(existsSync(dir)).toBe(true);
  });
});

describe("getSkillTemplatePath", () => {
  it("returns path ending in SKILL.md", () => {
    const path = getSkillTemplatePath("cross-repo-architecture");
    expect(path).toContain("SKILL.md");
    expect(existsSync(path)).toBe(true);
  });
});

describe("readSkillTemplate", () => {
  it("reads the cross-repo-architecture template", () => {
    const content = readSkillTemplate("cross-repo-architecture");
    expect(content).toContain("Cross-Repo Architecture");
    expect(content).toContain(MANAGED_SKILL_MARKER);
  });

  it("throws for non-existent skill", () => {
    expect(() => readSkillTemplate("nonexistent" as any)).toThrow(
      "Skill template not found"
    );
  });
});

describe("listSkillTemplates", () => {
  it("lists cross-repo-architecture", () => {
    const skills = listSkillTemplates();
    expect(skills).toContain("cross-repo-architecture");
  });
});

describe("validateAllSkillTemplates", () => {
  it("returns empty array when all skills are valid", () => {
    const errors = validateAllSkillTemplates();
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Skill template frontmatter (AC-01, AC-02)
// ---------------------------------------------------------------------------

describe("skill template frontmatter", () => {
  it("cross-repo-architecture SKILL.md has valid YAML frontmatter (AC-01)", () => {
    const content = readSkillTemplate("cross-repo-architecture");
    const { frontmatter, body } = parseFrontmatter(content);

    // Frontmatter exists and has required fields
    expect(frontmatter).toBeDefined();
    expect(frontmatter.name).toBe("cross-repo-architecture");

    const desc = frontmatter.description;
    expect(typeof desc).toBe("string");
    expect((desc as string).length).toBeGreaterThan(0);

    // Body still contains the expected heading and marker
    expect(body).toContain("# Cross-Repo Architecture");
    expect(body).toContain(MANAGED_SKILL_MARKER);
  });

  it("installed skill preserves frontmatter and managed marker (AC-02)", () => {
    const target = fixtureTarget();
    const result = installCoreSkill("cross-repo-architecture", target);
    expect(result).toBe("created");

    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    const content = readFileSync(filePath, "utf-8");

    // Frontmatter is preserved
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter.name).toBe("cross-repo-architecture");
    expect(typeof frontmatter.description).toBe("string");
    expect((frontmatter.description as string).length).toBeGreaterThan(0);

    // Body content and marker are preserved
    expect(body).toContain("# Cross-Repo Architecture");
    expect(body).toContain(MANAGED_SKILL_MARKER);
  });

  it("updateCoreSkill preserves frontmatter through update cycle (AC-02)", () => {
    const target = fixtureTarget();
    installCoreSkill("cross-repo-architecture", target);

    // Simulate older version
    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    writeFileSync(
      filePath,
      `---
name: cross-repo-architecture
description: Old description.
---
# Old content
${MANAGED_SKILL_MARKER}
`,
      "utf-8"
    );

    const result = updateCoreSkill("cross-repo-architecture", target);
    expect(result).toBe("updated");

    const content = readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);

    // Updated frontmatter has current description
    expect(frontmatter.name).toBe("cross-repo-architecture");
    expect(typeof frontmatter.description).toBe("string");
    expect((frontmatter.description as string)).not.toBe("Old description.");
    expect((frontmatter.description as string).length).toBeGreaterThan(0);

    // Body is updated to current template
    expect(body).toContain("# Cross-Repo Architecture");
    expect(body).toContain(MANAGED_SKILL_MARKER);
  });
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
  it("includes cross-repo-architecture", () => {
    const catalog = listManagedSkillCatalog();
    expect(catalog).toContain("cross-repo-architecture");
    expect(catalog.length).toBe(CORE_SKILLS.length);
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
  it("returns statuses for all core skills", () => {
    const target = fixtureTarget();
    const statuses = listManagedSkillStatuses(target);
    expect(statuses.length).toBe(CORE_SKILLS.length);
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

describe("updateCoreSkill", () => {
  it("updates a managed skill file", () => {
    const target = fixtureTarget();
    installCoreSkill("cross-repo-architecture", target);
    // Modify the installed file to simulate an older version
    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    writeFileSync(filePath, `# Old content\n${MANAGED_SKILL_MARKER}\n`, "utf-8");
    
    const result = updateCoreSkill("cross-repo-architecture", target);
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
    
    const result = updateCoreSkill("cross-repo-architecture", target);
    expect(result).toBe("not_managed");
    // File should be untouched
    expect(readFileSync(filePath, "utf-8")).toBe("# Manual\n");
  });

  it("returns 'not_installed' when file does not exist", () => {
    const target = fixtureTarget();
    const result = updateCoreSkill("cross-repo-architecture", target);
    expect(result).toBe("not_installed");
  });
});

describe("deleteCoreSkill", () => {
  it("deletes a managed skill file", () => {
    const target = fixtureTarget();
    installCoreSkill("cross-repo-architecture", target);
    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    expect(existsSync(filePath)).toBe(true);
    
    const result = deleteCoreSkill("cross-repo-architecture", target);
    expect(result).toBe(true);
    expect(existsSync(filePath)).toBe(false);
  });

  it("returns false for non-existent file", () => {
    const target = fixtureTarget();
    const result = deleteCoreSkill("cross-repo-architecture", target);
    expect(result).toBe(false);
  });

  it("returns false for file without managed marker (conflict protection)", () => {
    const target = fixtureTarget();
    const filePath = getSkillInstallPath("cross-repo-architecture", target);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, "# Manual\n", "utf-8");
    
    const result = deleteCoreSkill("cross-repo-architecture", target);
    expect(result).toBe(false);
    expect(existsSync(filePath)).toBe(true);
  });

  it("removes empty parent directory after deletion", () => {
    const target = fixtureTarget();
    installCoreSkill("cross-repo-architecture", target);
    const skillDir = join(target.skillDir, "cross-repo-architecture");
    expect(existsSync(skillDir)).toBe(true);
    
    deleteCoreSkill("cross-repo-architecture", target);
    expect(existsSync(skillDir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("project target without init has missing skills", () => {
    const target = fixtureTarget();
    const statuses = listManagedSkillStatuses(target);
    expect(statuses.every((s) => s.state === "missing")).toBe(true);
  });

  it("global target without init has missing skills", () => {
    const target = fixtureTarget("global");
    const statuses = listManagedSkillStatuses(target);
    expect(statuses.every((s) => s.state === "missing")).toBe(true);
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
