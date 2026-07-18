import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Profile definitions
//
// Each profile has two variants:
//   dev      — applied to developer.md
//              May include controlled mutating commands (formatters, builds)
//              listed as "ask" so the user confirms before they run.
//   readonly — applied to auditor.md and reviewer.md
//              Contains only validation/inspection commands that do not
//              modify files. Formatter commands that write to disk are
//              intentionally excluded from this variant.
//
// Profile entries are the canonical definitions used by opencode-path profiles.
// ---------------------------------------------------------------------------

export interface ProfileEntry {
  pattern: string;
  permission: "allow" | "ask" | "deny";
}

export interface Profile {
  /** Machine-readable profile name (e.g., "javascript-typescript") */
  name: string;
  /** Human-readable label (e.g., "JavaScript / TypeScript") */
  label: string;
  /** Developer variant — includes controlled mutating commands as "ask" */
  dev: ProfileEntry[];
  /** Read-only variant — only validation/inspection commands */
  readonly: ProfileEntry[];
}

// --- JavaScript / TypeScript ------------------------------------------------
// All commands here are read-only validation; both variants are identical.
const JAVASCRIPT_TYPESCRIPT_DEV: ProfileEntry[] = [
  { pattern: "npm test*", permission: "allow" },
  { pattern: "npm run test*", permission: "allow" },
  { pattern: "npm run coverage*", permission: "allow" },
  { pattern: "npm run lint*", permission: "allow" },
  { pattern: "npm run typecheck*", permission: "allow" },
  { pattern: "npm run check*", permission: "allow" },
  { pattern: "pnpm test*", permission: "allow" },
  { pattern: "pnpm coverage*", permission: "allow" },
  { pattern: "pnpm lint*", permission: "allow" },
  { pattern: "pnpm typecheck*", permission: "allow" },
  { pattern: "pnpm check*", permission: "allow" },
  { pattern: "yarn test*", permission: "allow" },
  { pattern: "yarn coverage*", permission: "allow" },
  { pattern: "yarn lint*", permission: "allow" },
  { pattern: "yarn typecheck*", permission: "allow" },
  { pattern: "yarn check*", permission: "allow" },
  { pattern: "npx jest*", permission: "allow" },
  { pattern: "npx vitest*", permission: "allow" },
  { pattern: "npx tsc*", permission: "allow" },
  { pattern: "npx eslint*", permission: "allow" },
  { pattern: "npx prettier --check*", permission: "allow" },
];
const JAVASCRIPT_TYPESCRIPT_READONLY: ProfileEntry[] = JAVASCRIPT_TYPESCRIPT_DEV;

// --- Python -----------------------------------------------------------------
// All commands here are read-only validation; both variants are identical.
const PYTHON_DEV: ProfileEntry[] = [
  { pattern: "pytest*", permission: "allow" },
  { pattern: "python -m pytest*", permission: "allow" },
  { pattern: "python3 -m pytest*", permission: "allow" },
  { pattern: "ruff check*", permission: "allow" },
  { pattern: "mypy*", permission: "allow" },
  { pattern: "pyright*", permission: "allow" },
  { pattern: "python -m unittest*", permission: "allow" },
  { pattern: "python3 -m unittest*", permission: "allow" },
];
const PYTHON_READONLY: ProfileEntry[] = PYTHON_DEV;

// --- Go ---------------------------------------------------------------------
// Developer variant includes go fmt (mutates files) listed as ask.
// Read-only variant omits go fmt / gofmt to preserve Auditor/Reviewer safety.
const GO_DEV: ProfileEntry[] = [
  { pattern: "go test*", permission: "allow" },
  { pattern: "go vet*", permission: "allow" },
  { pattern: "go fmt*", permission: "ask" },
  { pattern: "gofmt*", permission: "ask" },
];
const GO_READONLY: ProfileEntry[] = [
  { pattern: "go test*", permission: "allow" },
  { pattern: "go vet*", permission: "allow" },
];

// --- Rust -------------------------------------------------------------------
// Developer variant includes cargo fmt (mutates files) listed as ask.
// cargo fmt --check is safe for both roles; cargo fmt (without --check) is dev-only.
const RUST_DEV: ProfileEntry[] = [
  { pattern: "cargo test*", permission: "allow" },
  { pattern: "cargo check*", permission: "allow" },
  { pattern: "cargo clippy*", permission: "allow" },
  { pattern: "cargo fmt*", permission: "ask" },
  { pattern: "cargo fmt --check*", permission: "allow" },
];
const RUST_READONLY: ProfileEntry[] = [
  { pattern: "cargo test*", permission: "allow" },
  { pattern: "cargo check*", permission: "allow" },
  { pattern: "cargo clippy*", permission: "allow" },
  { pattern: "cargo fmt --check*", permission: "allow" },
];

// --- Swift ------------------------------------------------------------------
// Developer variant includes swift build and swift format (both may write
// artifacts or reformat files) listed as ask.
// Read-only variant includes only swift test and swift format lint (check mode).
const SWIFT_DEV: ProfileEntry[] = [
  { pattern: "swift test*", permission: "allow" },
  { pattern: "swift build*", permission: "ask" },
  { pattern: "swift format*", permission: "ask" },
  { pattern: "swift format lint*", permission: "allow" },
  { pattern: "xcodebuild test*", permission: "ask" },
];
const SWIFT_READONLY: ProfileEntry[] = [
  { pattern: "swift test*", permission: "allow" },
  { pattern: "swift format lint*", permission: "allow" },
];

// --- Java / Kotlin ----------------------------------------------------------
// All commands here are read-only validation; both variants are identical.
const JAVA_KOTLIN_DEV: ProfileEntry[] = [
  { pattern: "./gradlew test*", permission: "allow" },
  { pattern: "./gradlew check*", permission: "allow" },
  { pattern: "./gradlew ktlintCheck*", permission: "allow" },
  { pattern: "./gradlew detekt*", permission: "allow" },
  { pattern: "gradle test*", permission: "allow" },
  { pattern: "gradle check*", permission: "allow" },
  { pattern: "mvn test*", permission: "allow" },
  { pattern: "mvn verify*", permission: "allow" },
];
const JAVA_KOTLIN_READONLY: ProfileEntry[] = JAVA_KOTLIN_DEV;

// --- Ruby -------------------------------------------------------------------
// All commands here are read-only validation; both variants are identical.
const RUBY_DEV: ProfileEntry[] = [
  { pattern: "bundle exec rspec*", permission: "allow" },
  { pattern: "bundle exec rubocop*", permission: "allow" },
  { pattern: "ruby -c*", permission: "allow" },
  { pattern: "rails test*", permission: "allow" },
];
const RUBY_READONLY: ProfileEntry[] = RUBY_DEV;

// --- PHP --------------------------------------------------------------------
// All commands here are read-only validation; both variants are identical.
const PHP_DEV: ProfileEntry[] = [
  { pattern: "composer test*", permission: "allow" },
  { pattern: "vendor/bin/phpunit*", permission: "allow" },
  { pattern: "vendor/bin/phpstan*", permission: "allow" },
  { pattern: "vendor/bin/psalm*", permission: "allow" },
  { pattern: "vendor/bin/phpcs*", permission: "allow" },
];
const PHP_READONLY: ProfileEntry[] = PHP_DEV;

// ---------------------------------------------------------------------------
// All profiles (ordered)
// ---------------------------------------------------------------------------
export const PROFILES: Profile[] = [
  {
    name: "javascript-typescript",
    label: "JavaScript / TypeScript",
    dev: JAVASCRIPT_TYPESCRIPT_DEV,
    readonly: JAVASCRIPT_TYPESCRIPT_READONLY,
  },
  {
    name: "python",
    label: "Python",
    dev: PYTHON_DEV,
    readonly: PYTHON_READONLY,
  },
  {
    name: "go",
    label: "Go",
    dev: GO_DEV,
    readonly: GO_READONLY,
  },
  {
    name: "rust",
    label: "Rust",
    dev: RUST_DEV,
    readonly: RUST_READONLY,
  },
  {
    name: "swift",
    label: "Swift",
    dev: SWIFT_DEV,
    readonly: SWIFT_READONLY,
  },
  {
    name: "java-kotlin",
    label: "Java / Kotlin",
    dev: JAVA_KOTLIN_DEV,
    readonly: JAVA_KOTLIN_READONLY,
  },
  {
    name: "ruby",
    label: "Ruby",
    dev: RUBY_DEV,
    readonly: RUBY_READONLY,
  },
  {
    name: "php",
    label: "PHP",
    dev: PHP_DEV,
    readonly: PHP_READONLY,
  },
];

export const PROFILE_NAMES = PROFILES.map((p) => p.name);
export type ProfileName = (typeof PROFILE_NAMES)[number];

export type ProfileSelectionStatus = "absent" | "present" | "mixed";

export interface DiscoveredProfileState {
  /** The state is uniform absent/present, or differs between agents. */
  status: ProfileSelectionStatus;
  /**
   * The uniform set, or the ordered union when the state is mixed. This is
   * useful for displaying the current state without choosing a target state.
   */
  profiles: ProfileName[];
  /** Recognized profile names for each inspected agent, in input order. */
  perAgent: ProfileName[][];
}

/**
 * Look up a profile by name.
 */
export function getProfile(name: string): Profile | undefined {
  return PROFILES.find((p) => p.name === name);
}

/**
 * Normalize a user or file-discovered profile list to recognized canonical
 * names, removing duplicates and using the bundled profile order.
 */
export function normalizeProfileNames(
  profileNames: readonly string[]
): ProfileName[] {
  const requested = new Set(profileNames);
  return PROFILE_NAMES.filter((name) => requested.has(name)) as ProfileName[];
}

/**
 * Discover only profile blocks that opencode-path currently recognizes.
 * Unknown blocks are intentionally not treated as supported mutable state.
 */
export function discoverRecognizedProfileNames(content: string): ProfileName[] {
  const discovered = new Set<string>();
  const beginPattern = /^\s*# BEGIN optional profile: ([^\r\n]+?)\s*$/gm;

  for (const match of content.matchAll(beginPattern)) {
    const profileName = match[1].trim();
    if (getProfile(profileName)) {
      discovered.add(profileName);
    }
  }

  return normalizeProfileNames([...discovered]);
}

/**
 * Describe profile state across one or more agents. An empty set is absent;
 * identical non-empty sets are present; differing sets are mixed.
 */
export function describeProfileState(
  profileSets: readonly (readonly string[])[]
): ProfileSelectionStatus {
  if (profileSets.length === 0) {
    return "absent";
  }

  const normalized = profileSets.map((profiles) =>
    normalizeProfileNames(profiles)
  );
  const first = normalized[0];

  if (normalized.every((profiles) => profiles.length === 0)) {
    return "absent";
  }

  const firstKey = first.join("\u0000");
  if (normalized.every((profiles) => profiles.join("\u0000") === firstKey)) {
    return "present";
  }

  return "mixed";
}

/**
 * Discover recognized profile state for multiple agent contents without
 * modifying any content or inferring a desired target state.
 */
export function discoverProfileState(
  agentContents: readonly string[]
): DiscoveredProfileState {
  const perAgent = agentContents.map(discoverRecognizedProfileNames);
  const profiles = normalizeProfileNames(perAgent.flat());

  return {
    status: describeProfileState(perAgent),
    profiles,
    perAgent,
  };
}

// ---------------------------------------------------------------------------
// Snippet generation
// ---------------------------------------------------------------------------

/** Indentation for bash permission entries inside YAML frontmatter */
const INDENT = "    ";

/**
 * The marker line that indicates where profile blocks should be inserted.
 * Must match the marker in the agent template files.
 */
export const PROFILE_MARKER =
  "# Optional stack-specific profiles are inserted here by opencode-path profiles";

/**
 * Legacy marker from the previous CLI name. Kept for backward compatibility
 * so that `opencode-path profiles` still works on agent files installed by
 * the old `oc-workflow` CLI.
 */
const LEGACY_PROFILE_MARKER =
  "# Optional stack-specific profiles are inserted here by oc-workflow profiles";

/**
 * Generate a profile snippet block for insertion into an agent file.
 */
export function generateSnippet(
  entries: ProfileEntry[],
  profileName: string
): string {
  const lines: string[] = [];
  lines.push(INDENT + "# BEGIN optional profile: " + profileName);
  for (const entry of entries) {
    lines.push(INDENT + '"' + entry.pattern + '": "' + entry.permission + '"');
  }
  lines.push(INDENT + "# END optional profile: " + profileName);
  return lines.join("\n");
}

/**
 * Generate the current canonical snippets for a desired profile set.
 * Profile order is always the order of the bundled definitions.
 */
export function generateCanonicalProfileSnippets(
  profileNames: readonly string[],
  variant: "dev" | "readonly"
): string[] {
  return normalizeProfileNames(profileNames).map((profileName) => {
    const profile = getProfile(profileName);
    // normalizeProfileNames only returns recognized names.
    if (!profile) {
      throw new Error(`Unknown profile: ${profileName}`);
    }
    return generateSnippet(
      variant === "dev" ? profile.dev : profile.readonly,
      profile.name
    );
  });
}

const PROFILE_BLOCK_BEGIN = /^\s*# BEGIN optional profile: ([^\r\n]+?)\s*$/;
const PROFILE_BLOCK_END = /^\s*# END optional profile: ([^\r\n]+?)\s*$/;

/**
 * Remove all existing profile blocks and insert the requested canonical
 * snippets. This deliberately rebuilds profile blocks rather than preserving
 * their bytes, so stale entries and duplicate blocks cannot survive.
 */
export function composeProfilesIntoContent(
  content: string,
  profileNames: readonly string[],
  variant: "dev" | "readonly"
): string {
  const lines = content
    .split("\n")
    .map((line) =>
      line.includes(LEGACY_PROFILE_MARKER)
        ? line.replace(LEGACY_PROFILE_MARKER, PROFILE_MARKER)
        : line
    );
  const withoutBlocks: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const begin = lines[index].match(PROFILE_BLOCK_BEGIN);
    if (begin) {
      const profileName = begin[1].trim();
      let endIndex = -1;
      for (let candidate = index + 1; candidate < lines.length; candidate++) {
        const end = lines[candidate].match(PROFILE_BLOCK_END);
        if (end && end[1].trim() === profileName) {
          endIndex = candidate;
          break;
        }
      }

      if (endIndex === -1) {
        throw new Error(`Unclosed profile block: ${profileName}`);
      }

      index = endIndex;
      continue;
    }

    if (PROFILE_BLOCK_END.test(lines[index])) {
      throw new Error(`Unexpected profile block end: ${lines[index].trim()}`);
    }

    withoutBlocks.push(lines[index]);
  }

  const markerIndex = withoutBlocks.findIndex(
    (line) => line.includes(PROFILE_MARKER) || line.includes(LEGACY_PROFILE_MARKER)
  );
  if (markerIndex === -1) {
    throw new Error("Profile marker not found in agent content.");
  }

  // Keep one canonical separator after the marker regardless of how many old
  // blocks and blank lines were removed.
  while (
    withoutBlocks[markerIndex + 1] !== undefined &&
    withoutBlocks[markerIndex + 1].trim() === ""
  ) {
    withoutBlocks.splice(markerIndex + 1, 1);
  }

  const snippets = generateCanonicalProfileSnippets(profileNames, variant);
  withoutBlocks.splice(markerIndex + 1, 0, ...snippets, "");
  return withoutBlocks.join("\n");
}

// ---------------------------------------------------------------------------
// Profile insertion logic
// ---------------------------------------------------------------------------

export interface InsertProfileResult {
  /** Whether the profile was inserted (false = already existed or marker not found) */
  inserted: boolean;
  /** Reason if not inserted */
  reason?: "already_exists" | "marker_not_found";
}

export type PerFileStatus = "inserted" | "already_exists" | "marker_not_found" | "file_missing";

export interface ProfileApplyResult {
  profileName: string;
  profileLabel: string;
  files: { agent: string; status: PerFileStatus }[];
}

export function applyProfileToAgents(
  agentDir: string,
  profile: Profile,
  agents: { name: string; variant: "dev" | "readonly" }[]
): ProfileApplyResult {
  const files: ProfileApplyResult["files"] = [];

  for (const agent of agents) {
    const agentPath = join(agentDir, agent.name + ".md");

    if (!existsSync(agentPath)) {
      files.push({ agent: agent.name, status: "file_missing" });
      continue;
    }

    const result = insertProfileIntoFile(agentPath, profile, agent.variant);

    if (result.inserted) {
      files.push({ agent: agent.name, status: "inserted" });
    } else if (result.reason === "already_exists") {
      files.push({ agent: agent.name, status: "already_exists" });
    } else if (result.reason === "marker_not_found") {
      files.push({ agent: agent.name, status: "marker_not_found" });
    }
  }

  return { profileName: profile.name, profileLabel: profile.label, files };
}

/**
 * Check if a profile block already exists in file content.
 */
export function profileExistsInContent(
  content: string,
  profileName: string
): boolean {
  const beginMarker = "# BEGIN optional profile: " + profileName;
  return content.includes(beginMarker);
}

/**
 * Insert a profile snippet into a file after the marker line.
 * Returns the result indicating whether insertion happened and why not if it didn't.
 *
 * This function is idempotent: if the profile block already exists, it is not
 * duplicated.
 */
export function insertProfileIntoFile(
  filePath: string,
  profile: Profile,
  variant: "dev" | "readonly"
): InsertProfileResult {
  const content = readFileSync(filePath, "utf-8");

  if (profileExistsInContent(content, profile.name)) {
    return { inserted: false, reason: "already_exists" };
  }

  const lines = content.split("\n");
  let markerIndex = -1;
  let isLegacyMarker = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(PROFILE_MARKER)) {
      markerIndex = i;
      break;
    }
    if (lines[i].includes(LEGACY_PROFILE_MARKER)) {
      markerIndex = i;
      isLegacyMarker = true;
      break;
    }
  }

  if (markerIndex === -1) {
    return { inserted: false, reason: "marker_not_found" };
  }

  // Migrate legacy marker to current marker
  if (isLegacyMarker) {
    lines[markerIndex] = lines[markerIndex].replace(LEGACY_PROFILE_MARKER, PROFILE_MARKER);
  }

  const entries = variant === "dev" ? profile.dev : profile.readonly;
  const snippet = generateSnippet(entries, profile.name);

  const newLines = [
    ...lines.slice(0, markerIndex + 1),
    snippet,
    ...lines.slice(markerIndex + 1),
  ];

  writeFileSync(filePath, newLines.join("\n"), "utf-8");
  return { inserted: true };
}
