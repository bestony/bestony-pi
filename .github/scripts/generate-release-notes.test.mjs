import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildReleaseNotes,
  compareDependencies,
  generateReleaseNotes,
  parseArgs,
} from "./generate-release-notes.mjs";

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function makeRepository() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "release-notes-"));
  git(directory, ["init", "-q", "-b", "main"]);
  git(directory, ["config", "user.name", "Release Notes Test"]);
  git(directory, ["config", "user.email", "release-notes@example.test"]);

  const writePackage = (version, dependencies) => {
    fs.writeFileSync(
      path.join(directory, "package.json"),
      `${JSON.stringify({ name: "example-package", version, dependencies }, null, 2)}\n`,
    );
  };

  writePackage("1.0.0", { unchanged: "^1.0.0", removed: "^2.0.0", upgraded: "^3.0.0" });
  git(directory, ["add", "package.json"]);
  git(directory, ["commit", "-qm", "chore(release): 1.0.0"]);
  const baseRef = git(directory, ["rev-parse", "HEAD"]);

  fs.writeFileSync(path.join(directory, "feature.md"), "feature\n");
  git(directory, ["add", "feature.md"]);
  git(directory, ["commit", "-qm", "feat(cli): add release output"]);
  fs.writeFileSync(path.join(directory, "fix.md"), "fix\n");
  git(directory, ["add", "fix.md"]);
  git(directory, ["commit", "-qm", "fix: handle empty history"]);

  writePackage("1.1.0", {
    unchanged: "^1.0.0",
    upgraded: "^3.1.0",
    added: "^4.0.0",
  });
  git(directory, ["add", "package.json"]);
  git(directory, ["commit", "-qm", "chore(release): 1.1.0"]);
  const headRef = git(directory, ["rev-parse", "HEAD"]);

  return { directory, baseRef, headRef };
}

test("classifies commits, filters release commits, and creates links", () => {
  const notes = buildReleaseNotes({
    tag: "v1.1.0",
    repository: "owner/repository",
    packageJson: { name: "example-package" },
    baseRef: "v1.0.0",
    headRef: "v1.1.0",
    headCommit: "abcdef0123456789",
    commits: [
      { hash: "1111111111111111", subject: "feat(ui): add [safe]" },
      { hash: "2222222222222222", subject: "fix: close (edge)" },
      { hash: "4444444444444444", subject: "perf: reduce startup time" },
      { hash: "5555555555555555", subject: "docs: explain release flow" },
      { hash: "6666666666666666", subject: "refactor: simplify notes" },
      { hash: "3333333333333333", subject: "chore(release): 1.1.0" },
    ],
    dependencies: { added: [], removed: [], updated: [], hasChanges: false },
  });

  assert.match(notes, /## Features/);
  assert.match(notes, /## Fixes/);
  assert.match(notes, /## Performance[\s\S]*reduce startup time/);
  assert.match(notes, /## Documentation[\s\S]*explain release flow/);
  assert.match(notes, /## Maintenance[\s\S]*simplify notes/);
  assert.match(notes, /\[\`1111111\`\]\(https:\/\/github\.com\/owner\/repository\/commit\/1111111111111111\)/);
  assert.ok(notes.includes("feat\\(ui\\): add \\[safe\\]"));
  assert.ok(!notes.includes("chore(release): 1.1.0"));
  assert.match(notes, /https:\/\/github\.com\/owner\/repository\/compare\/v1\.0\.0\.\.\.v1\.1\.0/);
  assert.match(notes, /https:\/\/www\.npmjs\.com\/package\/example-package/);
});

test("compares added, removed, and upgraded direct dependencies", () => {
  const changes = compareDependencies(
    { dependencies: { removed: "^1.0.0", upgraded: "^2.0.0" } },
    { dependencies: { added: "^3.0.0", upgraded: "^2.1.0" } },
  );

  assert.deepEqual(changes.added, [{ name: "added", version: "^3.0.0" }]);
  assert.deepEqual(changes.removed, [{ name: "removed", version: "^1.0.0" }]);
  assert.deepEqual(changes.updated, [{ name: "upgraded", from: "^2.0.0", to: "^2.1.0" }]);
  assert.equal(changes.hasChanges, true);
});

test("states when a forced release has no user-facing changes", () => {
  const notes = buildReleaseNotes({
    tag: "v2.0.0",
    repository: "owner/repository",
    packageJson: { name: "example-package" },
    baseRef: "v1.1.0",
    headRef: "v2.0.0",
    headCommit: "abcdef0123456789",
    commits: [{ hash: "3333333333333333", subject: "chore(release): 2.0.0" }],
    dependencies: { added: [], removed: [], updated: [], hasChanges: false },
  });

  assert.match(notes, /Maintenance release with no user-facing changes\./);
});

test("generates notes from real git refs", () => {
  const { directory, baseRef, headRef } = makeRepository();
  const output = path.join(directory, "notes.md");
  try {
    generateReleaseNotes({
      baseRef,
      headRef,
      tag: "v1.1.0",
      repository: "owner/repository",
      output,
      cwd: directory,
    });
    const notes = fs.readFileSync(output, "utf8");
    assert.ok(notes.includes("feat\\(cli\\): add release output"));
    assert.match(notes, /fix: close empty history|fix: handle empty history/);
    assert.match(notes, /\[\`added\`\].*\^4\.0\.0/);
    assert.match(notes, /\[\`removed\`\].*removed/);
    assert.match(notes, /\^3\.0\.0.*\^3\.1\.0/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("parses the documented CLI interface", () => {
  assert.deepEqual(
    parseArgs([
      "--base-ref",
      "v1.0.0",
      "--head-ref=v1.1.0",
      "--tag",
      "v1.1.0",
      "--repository",
      "owner/repository",
      "--output",
      "notes.md",
    ]),
    {
      baseRef: "v1.0.0",
      headRef: "v1.1.0",
      tag: "v1.1.0",
      repository: "owner/repository",
      output: "notes.md",
    },
  );
});
