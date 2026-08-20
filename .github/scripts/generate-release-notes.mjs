import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const CATEGORY_ORDER = [
  "Features",
  "Fixes",
  "Performance",
  "Documentation",
  "Maintenance",
];

const OPTION_NAMES = new Map([
  ["base-ref", "baseRef"],
  ["head-ref", "headRef"],
  ["tag", "tag"],
  ["repository", "repository"],
  ["output", "output"],
]);

const RELEASE_COMMIT_PATTERN = /^chore\(release\):(?:\s|$)/i;

/**
 * Parse the small, intentionally dependency-free command-line interface.
 */
export function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    const equalsIndex = argument.indexOf("=");
    const rawName = equalsIndex === -1 ? argument.slice(2) : argument.slice(2, equalsIndex);
    const name = OPTION_NAMES.get(rawName);
    if (!name) {
      throw new Error(`Unknown option: --${rawName}`);
    }

    let value;
    if (equalsIndex === -1) {
      value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Option --${rawName} requires a value.`);
      }
      index += 1;
    } else {
      value = argument.slice(equalsIndex + 1);
    }

    if (options[name] !== undefined) {
      throw new Error(`Option --${rawName} was provided more than once.`);
    }
    options[name] = value;
  }

  if (options.help) {
    return options;
  }

  for (const required of ["headRef", "tag", "repository", "output"]) {
    if (!options[required]) {
      throw new Error(`Missing required option: --${required.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
    }
  }

  return options;
}

/**
 * Run git without invoking a shell. This keeps refs and repository-provided
 * text from becoming shell syntax while still producing useful diagnostics.
 */
export function runGit(args, { cwd = process.cwd() } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error(`Unable to run git ${args.join(" ")}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = (result.stderr || "").trim();
    throw new Error(`git ${args.join(" ")} failed${details ? `: ${details}` : "."}`);
  }
  return result.stdout || "";
}

function resolveCommit(ref, cwd) {
  return runGit(["rev-parse", "--verify", `${ref}^{commit}`], { cwd }).trim();
}

function readPackageAtRef(ref, cwd) {
  const raw = runGit(["show", `${ref}:package.json`], { cwd }).replace(/^\uFEFF/, "");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`package.json at ${ref} is not valid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`package.json at ${ref} must contain a JSON object.`);
  }
  return parsed;
}

function collectCommits(baseRef, headRef, cwd) {
  const range = baseRef ? `${baseRef}..${headRef}` : headRef;
  const raw = runGit(
    ["log", "--reverse", "--no-decorate", "--format=%H%x1f%s%x1e", range],
    { cwd },
  );

  return raw
    .split("\x1e")
    .map((record) => record.replace(/^\n/, "").trimEnd())
    .filter(Boolean)
    .map((record) => {
      const separator = record.indexOf("\x1f");
      if (separator === -1) {
        throw new Error(`Unable to parse git log record: ${record}`);
      }
      return {
        hash: record.slice(0, separator),
        subject: record.slice(separator + 1),
      };
    });
}

export function classifyCommit(subject) {
  const match = subject.match(/^([a-z][a-z0-9-]*)(?:\([^)]*\))?!?:\s*/i);
  const type = match?.[1].toLowerCase();
  switch (type) {
    case "feat":
    case "feature":
      return "Features";
    case "fix":
    case "bugfix":
    case "hotfix":
      return "Fixes";
    case "perf":
      return "Performance";
    case "docs":
    case "doc":
      return "Documentation";
    default:
      return "Maintenance";
  }
}

export function isReleaseCommit(subject) {
  return RELEASE_COMMIT_PATTERN.test(subject);
}

function dependencyMap(packageJson) {
  const dependencies = packageJson?.dependencies;
  if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
    return new Map();
  }
  return new Map(
    Object.entries(dependencies).map(([name, version]) => [name, String(version)]),
  );
}

export function compareDependencies(basePackage, headPackage) {
  const baseDependencies = dependencyMap(basePackage);
  const headDependencies = dependencyMap(headPackage);
  const added = [];
  const removed = [];
  const updated = [];

  for (const [name, version] of headDependencies) {
    if (!baseDependencies.has(name)) {
      added.push({ name, version });
    } else if (baseDependencies.get(name) !== version) {
      updated.push({ name, from: baseDependencies.get(name), to: version });
    }
  }
  for (const [name, version] of baseDependencies) {
    if (!headDependencies.has(name)) {
      removed.push({ name, version });
    }
  }

  const byName = (left, right) => left.name.localeCompare(right.name);
  added.sort(byName);
  removed.sort(byName);
  updated.sort(byName);

  return {
    added,
    removed,
    updated,
    hasChanges: added.length > 0 || removed.length > 0 || updated.length > 0,
  };
}

export function normalizeRepository(repository) {
  let normalized = String(repository).trim();
  normalized = normalized
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/^ssh:\/\/git@github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");

  if (!/^[^/\s]+\/[^/\s]+$/.test(normalized)) {
    throw new Error(`Repository must be in OWNER/REPOSITORY form: ${repository}`);
  }
  return normalized;
}

export function escapeMarkdown(value) {
  return String(value).replace(/[\\`*_\[\]{}()<>#+!|~]/g, "\\$&");
}

function escapeCode(value) {
  return String(value).replace(/`/g, "\\`");
}

function npmPackagePath(packageName) {
  const value = String(packageName);
  if (value.startsWith("@") && value.includes("/")) {
    const [scope, name] = value.split("/", 2);
    return `@${encodeURIComponent(scope.slice(1))}/${encodeURIComponent(name)}`;
  }
  return encodeURIComponent(value);
}

function npmPackageUrl(packageName) {
  return `https://www.npmjs.com/package/${npmPackagePath(packageName)}`;
}

function commitUrl(repository, hash) {
  return `https://github.com/${repository}/commit/${hash}`;
}

function compareUrl(repository, baseRef, headRef, headCommit) {
  if (!baseRef) {
    return `https://github.com/${repository}/commits/${headCommit}`;
  }
  return `https://github.com/${repository}/compare/${baseRef}...${headRef}`;
}

function formatCommit(commit, repository) {
  const shortHash = commit.hash.slice(0, 7);
  return `- [\`${shortHash}\`](${commitUrl(repository, commit.hash)}) ${escapeMarkdown(commit.subject)}`;
}

function formatDependencyItem(dependency, kind) {
  const packageLink = `[\`${escapeCode(dependency.name)}\`](${npmPackageUrl(dependency.name)})`;
  if (kind === "updated") {
    return `- ${packageLink}: \`${escapeCode(dependency.from)}\` -> \`${escapeCode(dependency.to)}\``;
  }
  if (kind === "removed") {
    return `- ${packageLink}: \`${escapeCode(dependency.version)}\` (removed)`;
  }
  return `- ${packageLink}: \`${escapeCode(dependency.version)}\``;
}

function formatDependencySection(dependencies, repository) {
  const lines = ["## Dependency Updates", ""];
  const groups = [
    ["Added", dependencies.added, "added"],
    ["Updated", dependencies.updated, "updated"],
    ["Removed", dependencies.removed, "removed"],
  ];

  for (const [title, entries, kind] of groups) {
    lines.push(`### ${title}`, "");
    if (entries.length === 0) {
      lines.push("None.", "");
      continue;
    }
    for (const entry of entries) {
      lines.push(formatDependencyItem(entry, kind));
    }
    lines.push("");
  }
  return lines;
}

function formatSummary(commits, dependencies) {
  const parts = [];
  for (const category of CATEGORY_ORDER) {
    const count = commits.filter((commit) => commit.category === category).length;
    if (count > 0) {
      parts.push(`${count} ${category.toLowerCase()}`);
    }
  }
  const dependencyCount =
    dependencies.added.length + dependencies.updated.length + dependencies.removed.length;
  if (dependencyCount > 0) {
    parts.push(`${dependencyCount} direct dependency update${dependencyCount === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) {
    return "Maintenance release with no user-facing changes.";
  }
  return `This release contains ${parts.join(", ")}.`;
}

/**
 * Build the Markdown body from already-resolved git data. Keeping this
 * function pure makes the formatting and escaping behavior easy to test.
 */
export function buildReleaseNotes({
  tag,
  repository,
  packageJson,
  baseRef,
  headRef,
  headCommit,
  commits,
  dependencies,
}) {
  const packageName = packageJson.name || "package";
  const packageLink = `[${escapeMarkdown(packageName)}](${npmPackageUrl(packageName)})`;
  const categorizedCommits = commits
    .filter((commit) => !isReleaseCommit(commit.subject))
    .map((commit) => ({ ...commit, category: classifyCommit(commit.subject) }));
  const changelog = compareUrl(repository, baseRef, headRef, headCommit);
  const lines = [
    `# ${escapeMarkdown(tag)}`,
    "",
    `Package: ${packageLink}`,
    "",
    "## Summary",
    "",
    formatSummary(categorizedCommits, dependencies),
    "",
  ];

  for (const category of CATEGORY_ORDER) {
    lines.push(`## ${category}`, "");
    const entries = categorizedCommits.filter((commit) => commit.category === category);
    if (entries.length === 0) {
      lines.push("None.", "");
      continue;
    }
    for (const commit of entries) {
      lines.push(formatCommit(commit, repository));
    }
    lines.push("");
  }

  lines.push(...formatDependencySection(dependencies, repository));
  lines.push("## Full Changelog", "", `[Full Changelog](${changelog}).`, "");
  return `${lines.join("\n").trimEnd()}\n`;
}

export function generateReleaseNotes({
  baseRef = "",
  headRef,
  tag,
  repository,
  output,
  cwd = process.cwd(),
}) {
  const normalizedRepository = normalizeRepository(repository);
  const headCommit = resolveCommit(headRef, cwd);
  const resolvedBaseRef = baseRef ? resolveCommit(baseRef, cwd) : "";
  const headPackage = readPackageAtRef(headCommit, cwd);
  const basePackage = resolvedBaseRef
    ? readPackageAtRef(resolvedBaseRef, cwd)
    : { dependencies: {} };
  const commits = collectCommits(resolvedBaseRef, headCommit, cwd);
  const dependencies = compareDependencies(basePackage, headPackage);
  const notes = buildReleaseNotes({
    tag,
    repository: normalizedRepository,
    packageJson: headPackage,
    baseRef: baseRef || "",
    headRef,
    headCommit,
    commits,
    dependencies,
  });

  if (output === "-") {
    process.stdout.write(notes);
  } else {
    fs.mkdirSync(path.dirname(path.resolve(cwd, output)), { recursive: true });
    fs.writeFileSync(path.resolve(cwd, output), notes, "utf8");
  }
  return notes;
}

function usage() {
  return [
    "Usage: node .github/scripts/generate-release-notes.mjs \\",
    "  --base-ref <ref> --head-ref <ref> --tag <tag> \\",
    "  --repository <owner/repository> --output <path>",
    "",
    "--base-ref may be omitted for the first release.",
  ].join("\n");
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
    } else {
      generateReleaseNotes(options);
    }
  } catch (error) {
    console.error(`generate-release-notes: ${error.message}`);
    process.exitCode = 1;
  }
}
