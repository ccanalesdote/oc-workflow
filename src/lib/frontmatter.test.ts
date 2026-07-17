import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseFrontmatter,
  stringifyFrontmatter,
  readAgentFile,
  writeAgentFile,
  getAgentModel,
  setAgentModel,
  setModelInContent,
  isValidAgentModel,
} from "./frontmatter.js";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";

const FIXTURE_DIR = join(import.meta.dirname, "__fixtures__", "frontmatter");

beforeEach(() => {
  mkdirSync(FIXTURE_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

function fixturePath(...segments: string[]) {
  return join(FIXTURE_DIR, ...segments);
}

const SAMPLE_AGENT = `---
description: Test agent
mode: primary
permission:
  edit: deny
  write: deny
  bash: deny
  task: allow
---

You are Test, a test agent.

Some body content here.
`;

const SAMPLE_AGENT_WITH_MODEL = `---
description: Test agent
mode: primary
model: anthropic/claude-sonnet-4-6
permission:
  edit: deny
  write: deny
  bash: deny
  task: allow
---

You are Test, a test agent.
`;

// Agent with YAML comments and profile marker (realistic developer.md excerpt)
const AGENT_WITH_COMMENTS_AND_MARKER = `---
description: Implements code changes end-to-end
mode: primary
permission:
  edit: allow
  write: allow
  bash:
    # Default: ask for anything not explicitly allowed or denied
    "*": "ask"

    # Universal read-only inspection
    "pwd": "allow"
    "ls*": "allow"

    # Optional stack-specific profiles are inserted here by opencode-path profiles

    # Git read-only inspection
    "git status*": "allow"
    "git diff*": "allow"

    # Shell compound operators are denied
    "*;*": "deny"
  task: allow
---

You are Developer, the execution agent.

Some body content.
`;

// Agent with an existing profile block embedded
const AGENT_WITH_PROFILE_BLOCK = `---
description: Implements code changes end-to-end
mode: primary
permission:
  edit: allow
  write: allow
  bash:
    "*": "ask"
    # Optional stack-specific profiles are inserted here by opencode-path profiles
    # BEGIN optional profile: python
    "pytest*": "allow"
    "mypy*": "allow"
    # END optional profile: python
    "git status*": "allow"
  task: allow
---

You are Developer.
`;

describe("parseFrontmatter", () => {
  it("parses frontmatter and body from a valid markdown file", () => {
    const result = parseFrontmatter(SAMPLE_AGENT);
    expect(result.frontmatter.description).toBe("Test agent");
    expect(result.frontmatter.mode).toBe("primary");
    expect(result.frontmatter.model).toBeUndefined();
    expect(result.body).toContain("You are Test, a test agent.");
  });

  it("parses frontmatter with an existing model field", () => {
    const result = parseFrontmatter(SAMPLE_AGENT_WITH_MODEL);
    expect(result.frontmatter.model).toBe("anthropic/claude-sonnet-4-6");
  });

  it("throws if no frontmatter delimiters are present", () => {
    expect(() => parseFrontmatter("Just some text")).toThrow(
      "does not have valid YAML frontmatter"
    );
  });

  it("throws if frontmatter is not a valid YAML object", () => {
    const content = "---\njust a string\n---\nBody";
    expect(() => parseFrontmatter(content)).toThrow();
  });

  it("handles complex nested frontmatter (bash permissions)", () => {
    const content = `---
description: Developer
mode: primary
permission:
  edit: allow
  write: allow
  bash:
    "*": "ask"
    "git status*": "allow"
  task: allow
---

Body here.
`;
    const result = parseFrontmatter(content);
    const bash = result.frontmatter.permission as Record<string, unknown>;
    expect(bash.bash).toBeDefined();
    const bashRules = bash.bash as Record<string, string>;
    expect(bashRules["*"]).toBe("ask");
    expect(bashRules["git status*"]).toBe("allow");
  });
});

describe("isValidAgentModel", () => {
  it("accepts non-empty model strings and rejects invalid mutable state", () => {
    expect(isValidAgentModel("provider/model")).toBe(true);
    expect(isValidAgentModel(" model-without-provider ")).toBe(true);
    expect(isValidAgentModel("")).toBe(false);
    expect(isValidAgentModel("   ")).toBe(false);
    expect(isValidAgentModel(undefined)).toBe(false);
    expect(isValidAgentModel(null)).toBe(false);
    expect(isValidAgentModel({ value: "provider/model" })).toBe(false);
  });
});

describe("stringifyFrontmatter", () => {
  it("round-trips frontmatter and body", () => {
    const { frontmatter, body } = parseFrontmatter(SAMPLE_AGENT);
    const result = stringifyFrontmatter(frontmatter, body);
    expect(result).toContain("---");
    expect(result).toContain("You are Test, a test agent.");
    expect(result).toContain("description: Test agent");
  });

  it("produces valid output that can be parsed again", () => {
    const { frontmatter, body } = parseFrontmatter(SAMPLE_AGENT);
    const result = stringifyFrontmatter(frontmatter, body);
    const reparsed = parseFrontmatter(result);
    expect(reparsed.frontmatter.description).toBe("Test agent");
    expect(reparsed.body).toContain("You are Test, a test agent.");
  });
});

describe("readAgentFile / writeAgentFile", () => {
  it("writes and reads an agent file preserving frontmatter", () => {
    const filePath = fixturePath("test-agent.md");
    const { frontmatter, body } = parseFrontmatter(SAMPLE_AGENT);
    writeAgentFile(filePath, frontmatter, body);

    const read = readAgentFile(filePath);
    expect(read.frontmatter.description).toBe("Test agent");
    expect(read.body).toContain("You are Test, a test agent.");
  });

  it("creates parent directories when writing", () => {
    const filePath = fixturePath("nested", "dir", "agent.md");
    const { frontmatter, body } = parseFrontmatter(SAMPLE_AGENT);
    writeAgentFile(filePath, frontmatter, body);
    expect(existsSync(filePath)).toBe(true);
  });
});

describe("getAgentModel", () => {
  it("returns undefined for a file without model", () => {
    const filePath = fixturePath("no-model.md");
    writeFileSync(filePath, SAMPLE_AGENT, "utf-8");
    expect(getAgentModel(filePath)).toBeUndefined();
  });

  it("returns the model from a file with model", () => {
    const filePath = fixturePath("with-model.md");
    writeFileSync(filePath, SAMPLE_AGENT_WITH_MODEL, "utf-8");
    expect(getAgentModel(filePath)).toBe("anthropic/claude-sonnet-4-6");
  });

  it("returns undefined for a non-existent file", () => {
    expect(getAgentModel("/nonexistent/agent.md")).toBeUndefined();
  });

  it("returns undefined for a file with invalid frontmatter", () => {
    const filePath = fixturePath("invalid.md");
    writeFileSync(filePath, "Just some text without frontmatter", "utf-8");
    expect(getAgentModel(filePath)).toBeUndefined();
  });
});

describe("setAgentModel", () => {
  it("adds model to an existing agent file without model", () => {
    const filePath = fixturePath("add-model.md");
    writeFileSync(filePath, SAMPLE_AGENT, "utf-8");

    setAgentModel(filePath, "openai/gpt-5.5");

    const model = getAgentModel(filePath);
    expect(model).toBe("openai/gpt-5.5");

    // Verify other frontmatter is preserved
    const { frontmatter } = readAgentFile(filePath);
    expect(frontmatter.description).toBe("Test agent");
    expect(frontmatter.mode).toBe("primary");
  });

  it("replaces model in an existing agent file that already has a model", () => {
    const filePath = fixturePath("replace-model.md");
    writeFileSync(filePath, SAMPLE_AGENT_WITH_MODEL, "utf-8");

    setAgentModel(filePath, "anthropic/claude-haiku-4-5");

    const model = getAgentModel(filePath);
    expect(model).toBe("anthropic/claude-haiku-4-5");
  });

  it("preserves the body when adding a model", () => {
    const filePath = fixturePath("body-preserve.md");
    writeFileSync(filePath, SAMPLE_AGENT, "utf-8");

    setAgentModel(filePath, "openai/gpt-5.5");

    const { body } = readAgentFile(filePath);
    expect(body).toContain("You are Test, a test agent.");
    expect(body).toContain("Some body content here.");
  });

  it("creates file from template if the file does not exist", () => {
    const filePath = fixturePath("from-template.md");
    const templatePath = fixturePath("template.md");
    writeFileSync(templatePath, SAMPLE_AGENT, "utf-8");

    setAgentModel(filePath, "openai/gpt-5.5", templatePath);

    expect(existsSync(filePath)).toBe(true);
    const model = getAgentModel(filePath);
    expect(model).toBe("openai/gpt-5.5");
  });

  it("throws if file does not exist and no template is provided", () => {
    const filePath = fixturePath("nonexistent.md");
    expect(() => setAgentModel(filePath, "openai/gpt-5.5")).toThrow(
      "Agent file not found"
    );
  });

  it("preserves YAML comments when adding a model", () => {
    const filePath = fixturePath("preserve-comments.md");
    writeFileSync(filePath, AGENT_WITH_COMMENTS_AND_MARKER, "utf-8");

    setAgentModel(filePath, "openai/gpt-5.5");

    const content = readFileSync(filePath, "utf-8");
    // Comments must be preserved
    expect(content).toContain("# Default: ask for anything not explicitly allowed or denied");
    expect(content).toContain("# Universal read-only inspection");
    expect(content).toContain("# Optional stack-specific profiles are inserted here by opencode-path profiles");
    expect(content).toContain("# Git read-only inspection");
    expect(content).toContain("# Shell compound operators are denied");
    // Model must be set
    expect(content).toContain("model: openai/gpt-5.5");
  });

  it("preserves profile markers and blocks when adding a model", () => {
    const filePath = fixturePath("preserve-profiles.md");
    writeFileSync(filePath, AGENT_WITH_PROFILE_BLOCK, "utf-8");

    setAgentModel(filePath, "anthropic/claude-sonnet-4-6");

    const content = readFileSync(filePath, "utf-8");
    // Profile marker must be preserved
    expect(content).toContain("# Optional stack-specific profiles are inserted here by opencode-path profiles");
    // Profile block must be preserved
    expect(content).toContain("# BEGIN optional profile: python");
    expect(content).toContain('"pytest*": "allow"');
    expect(content).toContain("# END optional profile: python");
    // Model must be set
    expect(content).toContain("model: anthropic/claude-sonnet-4-6");
  });

  it("preserves profile markers and blocks when replacing a model", () => {
    // Start with a file that already has a model and a profile block
    const contentWithModel = AGENT_WITH_PROFILE_BLOCK.replace(
      "mode: primary",
      "mode: primary\nmodel: old-model/id"
    );
    const filePath = fixturePath("replace-preserve-profiles.md");
    writeFileSync(filePath, contentWithModel, "utf-8");

    setAgentModel(filePath, "anthropic/claude-haiku-4-5");

    const content = readFileSync(filePath, "utf-8");
    // Profile block must be preserved
    expect(content).toContain("# BEGIN optional profile: python");
    expect(content).toContain("# END optional profile: python");
    // Model must be updated
    expect(content).toContain("model: anthropic/claude-haiku-4-5");
    expect(content).not.toContain("model: old-model/id");
  });

  it("does not modify the body when adding a model", () => {
    const filePath = fixturePath("body-untouched.md");
    writeFileSync(filePath, AGENT_WITH_COMMENTS_AND_MARKER, "utf-8");

    setAgentModel(filePath, "openai/gpt-5.5");

    const content = readFileSync(filePath, "utf-8");
    // Body must be exactly preserved
    expect(content).toContain("You are Developer, the execution agent.");
    expect(content).toContain("Some body content.");
    // Frontmatter closing --- must still exist
    expect(content.match(/^---/gm)).toHaveLength(2);
  });

  it("preserves permission entries and order when adding a model", () => {
    const filePath = fixturePath("perm-order.md");
    writeFileSync(filePath, AGENT_WITH_COMMENTS_AND_MARKER, "utf-8");

    setAgentModel(filePath, "openai/gpt-5.5");

    const content = readFileSync(filePath, "utf-8");
    // Verify permission entries are preserved in order
    const askIdx = content.indexOf('"*": "ask"');
    const pwdIdx = content.indexOf('"pwd": "allow"');
    const lsIdx = content.indexOf('"ls*": "allow"');
    const gitIdx = content.indexOf('"git status*": "allow"');
    const denyIdx = content.indexOf('"*;*": "deny"');

    expect(askIdx).toBeGreaterThan(-1);
    expect(pwdIdx).toBeGreaterThan(askIdx);
    expect(lsIdx).toBeGreaterThan(pwdIdx);
    expect(gitIdx).toBeGreaterThan(lsIdx);
    expect(denyIdx).toBeGreaterThan(gitIdx);
  });
});

describe("setModelInContent", () => {
  const yamlSensitiveModels = [
    "provider/model #pinned",
    "provider/model:variant",
    'provider/model "quoted"',
    " provider/model ",
  ];

  it("inserts model after mode: line when no model exists", () => {
    const result = setModelInContent(SAMPLE_AGENT, "openai/gpt-5.5");
    expect(result).toContain("model: openai/gpt-5.5");
    // Model should appear after mode: line
    const modeIdx = result.indexOf("mode: primary");
    const modelIdx = result.indexOf("model: openai/gpt-5.5");
    expect(modelIdx).toBeGreaterThan(modeIdx);
  });

  it("replaces an existing model line", () => {
    const result = setModelInContent(SAMPLE_AGENT_WITH_MODEL, "new/model");
    expect(result).toContain("model: new/model");
    expect(result).not.toContain("model: anthropic/claude-sonnet-4-6");
  });

  it.each(yamlSensitiveModels)(
    "preserves the exact YAML-sensitive model value when inserting: %j",
    (model) => {
      const original = parseFrontmatter(AGENT_WITH_COMMENTS_AND_MARKER);
      const result = setModelInContent(AGENT_WITH_COMMENTS_AND_MARKER, model);
      const reparsed = parseFrontmatter(result);

      expect(reparsed.frontmatter.model).toBe(model);
      expect(reparsed.body).toBe(original.body);
      expect(result).toContain("# Optional stack-specific profiles are inserted here by opencode-path profiles");
      expect(result).toContain('"*": "ask"');
    }
  );

  it.each(yamlSensitiveModels)(
    "preserves the exact YAML-sensitive model value when replacing: %j",
    (model) => {
      const original = parseFrontmatter(SAMPLE_AGENT_WITH_MODEL);
      const result = setModelInContent(SAMPLE_AGENT_WITH_MODEL, model);
      const reparsed = parseFrontmatter(result);

      expect(reparsed.frontmatter.model).toBe(model);
      expect(reparsed.body).toBe(original.body);
    }
  );

  it("is idempotent across parse, write, and parse for a sensitive model", () => {
    const model = "provider/model #pinned";
    const first = setModelInContent(AGENT_WITH_COMMENTS_AND_MARKER, model);
    const second = setModelInContent(first, parseFrontmatter(first).frontmatter.model as string);

    expect(parseFrontmatter(first).frontmatter.model).toBe(model);
    expect(second).toBe(first);
  });

  it("preserves comments in the frontmatter", () => {
    const result = setModelInContent(AGENT_WITH_COMMENTS_AND_MARKER, "openai/gpt-5.5");
    expect(result).toContain("# Default: ask for anything not explicitly allowed or denied");
    expect(result).toContain("# Optional stack-specific profiles are inserted here by opencode-path profiles");
  });

  it("preserves profile blocks (# BEGIN/# END)", () => {
    const result = setModelInContent(AGENT_WITH_PROFILE_BLOCK, "openai/gpt-5.5");
    expect(result).toContain("# BEGIN optional profile: python");
    expect(result).toContain('"pytest*": "allow"');
    expect(result).toContain("# END optional profile: python");
  });

  it("preserves the body exactly", () => {
    const result = setModelInContent(AGENT_WITH_COMMENTS_AND_MARKER, "openai/gpt-5.5");
    // Extract body from result
    const bodyMatch = result.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
    expect(bodyMatch).toBeDefined();
    expect(bodyMatch![1]).toContain("You are Developer, the execution agent.");
    expect(bodyMatch![1]).toContain("Some body content.");
  });
});
