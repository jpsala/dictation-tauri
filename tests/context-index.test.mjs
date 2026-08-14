import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const fixtures = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function write(root, path, content) {
  const target = join(root, ...path.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function buildIndex({ selectedStatus }) {
  const root = mkdtempSync(join(tmpdir(), "dictation-context-index-"));
  fixtures.push(root);
  write(root, ".specify/feature.json", JSON.stringify({ feature_directory: "specs/002-selected" }));
  write(root, "specs/001-old/spec.md", "# Old\n\n**Status**: Complete\n");
  write(root, "specs/002-selected/spec.md", `# Selected\n\n**Status**: ${selectedStatus}\n`);

  const result = Bun.spawnSync(["bun", join(import.meta.dir, "../scripts/context-index.ts")], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.exitCode).toBe(0);
  return readFileSync(join(root, "docs/.generated/context-index.md"), "utf8");
}

describe("context index spec routing", () => {
  test("marks only a selected open spec active", () => {
    const index = buildIndex({ selectedStatus: "Active" });
    expect(index).toContain("- active: [002-selected]");
    expect(index).toContain("- historical: [001-old]");
  });

  test("does not reactivate a selected completed spec", () => {
    const index = buildIndex({ selectedStatus: "Complete" });
    expect(index).toContain("- No active spec directories found.");
    expect(index).toContain("- historical: [002-selected]");
    expect(index).not.toContain("- active: [002-selected]");
  });
});
