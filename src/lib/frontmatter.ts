import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import YAML from "yaml";

/**
 * Parsed result of a markdown file with YAML frontmatter.
 */
export interface ParsedFrontmatter {
  /** The parsed YAML frontmatter as a plain object */
  frontmatter: Record<string, unknown>;
  /** The body of the document after the closing `---` */
  body: string;
}

/**
 * Return whether a frontmatter model value is supported mutable state.
 * Models must be non-empty strings; whitespace-only and non-string values are
 * invalid for managed Architect reconciliation.
 */
export function isValidAgentModel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

/**
 * Parse a markdown file with YAML frontmatter into its frontmatter and body.
 * Throws if the frontmatter delimiters are missing or the YAML is invalid.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    throw new Error(
      "Content does not have valid YAML frontmatter. Expected --- delimited header."
    );
  }

  const yamlStr = match[1];
  const body = match[2];

  const frontmatter = YAML.parse(yamlStr) as Record<string, unknown>;
  if (
    !frontmatter ||
    typeof frontmatter !== "object" ||
    Array.isArray(frontmatter)
  ) {
    throw new Error("Frontmatter did not parse into a plain object.");
  }

  return { frontmatter, body };
}

/**
 * Stringify a parsed frontmatter object and body back into a markdown string.
 */
export function stringifyFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string
): string {
  const yamlStr = YAML.stringify(frontmatter, {
    lineWidth: 0, // prevent line wrapping
    singleQuote: false,
  }).replace(/\n$/, ""); // trim trailing newline from YAML.stringify

  return `---\n${yamlStr}\n---\n${body}`;
}

/**
 * Read a markdown file and parse its frontmatter.
 */
export function readAgentFile(filePath: string): ParsedFrontmatter {
  const content = readFileSync(filePath, "utf-8");
  return parseFrontmatter(content);
}

/**
 * Write a markdown file with the given frontmatter and body.
 * Creates parent directories if they don't exist.
 */
export function writeAgentFile(
  filePath: string,
  frontmatter: Record<string, unknown>,
  body: string
): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const content = stringifyFrontmatter(frontmatter, body);
  writeFileSync(filePath, content, "utf-8");
}

/**
 * Get the `model` field from an agent file's frontmatter.
 * Returns undefined if the file doesn't exist, has no frontmatter, or has no model.
 */
export function getAgentModel(filePath: string): string | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }
  try {
    const { frontmatter } = readAgentFile(filePath);
    const model = frontmatter.model;
    return typeof model === "string" ? model : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Set the `model` field in an agent file's frontmatter using text-based
 * replacement. This preserves YAML comments, profile markers, and the
 * exact formatting of all other frontmatter lines.
 *
 * Strategy:
 * - If a `model:` line already exists in the frontmatter, replace only that line.
 * - If no `model:` line exists, insert `model: <value>` after the first
 *   non-comment, non-blank line in the frontmatter (typically after `mode:`).
 * - Preserves the body exactly.
 * - Preserves all YAML comments and profile markers.
 */
export function setAgentModel(
  filePath: string,
  model: string,
  templatePath?: string
): void {
  let content: string;

  if (existsSync(filePath)) {
    content = readFileSync(filePath, "utf-8");
  } else if (templatePath && existsSync(templatePath)) {
    content = readFileSync(templatePath, "utf-8");
  } else {
    throw new Error(
      `Agent file not found: ${filePath}. Run 'opencode-path init' first.`
    );
  }

  // Validate that the content has valid frontmatter before modifying
  parseFrontmatter(content);

  const updated = setModelInContent(content, model);

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, updated, "utf-8");
}

/**
 * Text-based insertion/replacement of a `model:` line within YAML frontmatter.
 * Preserves comments, profile markers, and all other lines exactly.
 *
 * @param content  The full markdown file content (frontmatter + body).
 * @param model    The model value to set.
 * @returns        The updated content with the model line set.
 */
export function setModelInContent(content: string, model: string): string {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    throw new Error(
      "Content does not have valid YAML frontmatter. Expected --- delimited header."
    );
  }

  const yamlLines = match[1].split(/\r?\n/);
  const body = match[2];

  // Check if a model: line already exists
  let modelLineIndex = -1;
  for (let i = 0; i < yamlLines.length; i++) {
    if (/^model\s*:/.test(yamlLines[i])) {
      modelLineIndex = i;
      break;
    }
  }

  if (modelLineIndex !== -1) {
    // Replace the existing model line, preserving leading indentation
    const existingLine = yamlLines[modelLineIndex];
    const indent = existingLine.match(/^(\s*)/)?.[1] ?? "";
    yamlLines[modelLineIndex] = `${indent}model: ${serializeYamlScalar(model)}`;
  } else {
    // Insert model: after the `mode:` line (or `description:` if no mode:)
    let insertAfter = -1;

    // Find the `mode:` line first
    for (let i = 0; i < yamlLines.length; i++) {
      if (/^mode\s*:/.test(yamlLines[i])) {
        insertAfter = i;
        break;
      }
    }

    // If no mode:, try after description:
    if (insertAfter === -1) {
      for (let i = 0; i < yamlLines.length; i++) {
        if (/^description\s*:/.test(yamlLines[i])) {
          insertAfter = i;
          break;
        }
      }
    }

    // Fallback: insert after first non-comment, non-blank line
    if (insertAfter === -1) {
      for (let i = 0; i < yamlLines.length; i++) {
        const trimmed = yamlLines[i].trim();
        if (trimmed.length > 0 && !trimmed.startsWith("#")) {
          insertAfter = i;
          break;
        }
      }
    }

    // Insert after the found line
    yamlLines.splice(insertAfter + 1, 0, `model: ${serializeYamlScalar(model)}`);
  }

  const newFrontmatter = yamlLines.join("\n");
  return `---\n${newFrontmatter}\n---\n${body}`;
}

/**
 * Serialize a model as a YAML scalar without changing its string value when
 * the frontmatter is parsed again. YAML.stringify keeps ordinary model IDs
 * readable while quoting values whose syntax could otherwise be interpreted
 * as a comment, indicator, boolean, or another YAML type. Multiline values
 * use JSON's double-quoted scalar form so insertion remains one frontmatter
 * line and the accepted model grammar is not narrowed.
 */
function serializeYamlScalar(value: string): string {
  if (value.includes("\n") || value.includes("\r")) {
    return JSON.stringify(value);
  }

  return YAML.stringify(value, {
    lineWidth: 0,
    singleQuote: false,
  }).trimEnd();
}
