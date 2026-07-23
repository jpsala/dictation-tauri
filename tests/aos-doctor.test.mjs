import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import aosDoctor from "../.pi/extensions/aos-doctor.ts";
import { runAosDoctor } from "../scripts/lib/aos-doctor.ts";

const fixtures = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function write(root, path, content) {
  const target = join(root, ...path.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function projectFixture({ focus, primaryRef = "docs/tracks/current.md", extensions = [] }) {
  const root = mkdtempSync(join(tmpdir(), "dictation-aos-doctor-"));
  fixtures.push(root);
  write(root, "AGENTS.md", "# Agents\n");
  write(root, "docs/TOPICS.md", "# Topics\n");
  write(root, "docs/tracks/current.md", "---\nstatus: complete\n---\n# Current\n");
  write(root, "docs/WORKING_MEMORY.md", `# Working Memory\n\n## Foco Único De Ejecución\n\n${focus}\n`);
  write(root, "docs/topics/example.md", [
    "---",
    "id: example",
    "status: active",
    "kind: reference",
    "triggers:",
    "  - example",
    "primary_refs:",
    `  - ${primaryRef}`,
    "---",
    "# Example",
    "",
  ].join("\n"));
  for (const extension of extensions) write(root, `.pi/extensions/${extension}`, "export default function () {}\n");
  const extensionLine = extensions.length ? `- Extensions: ${extensions.join(", ")}\n` : "";
  write(root, "docs/.generated/context-index.md", `# Context Index\n\n## Pi Resources\n\n${extensionLine}`);
  return root;
}

describe("AOS doctor", () => {
  test("passes exact focus and local references", () => {
    const root = projectFixture({
      focus: "- **Estado:** `complete`.\n- **Referencia:** `docs/tracks/current.md`.\n- **Siguiente acción:** elegir próximo frente.",
    });
    const report = runAosDoctor(root, { includeContextSize: false });
    expect(report.errors).toBe(0);
  });

  test("finds semantic focus and reference drift", () => {
    const root = projectFixture({
      focus: "- **Estado:** `waiting-authorization`.\n- **Referencia:** `docs/tracks/current.md`, extra.",
      primaryRef: "docs/missing.md",
    });
    const report = runAosDoctor(root, { includeContextSize: false });
    expect(report.findings.map((finding) => finding.code)).toContain("focus.invalid");
    expect(report.findings.map((finding) => finding.code)).toContain("topic.ref_missing");
  });

  test("finds stale generated Pi inventory", () => {
    const root = projectFixture({
      focus: "- **Estado:** `complete`.\n- **Referencia:** `docs/tracks/current.md`.\n- **Siguiente acción:** elegir próximo frente.",
    });
    write(root, ".pi/extensions/unindexed.ts", "export default function () {}\n");
    const report = runAosDoctor(root, { includeContextSize: false });
    expect(report.findings.map((finding) => finding.code)).toContain("index.pi_extensions_stale");
  });

  test("rejects ad hoc track states", () => {
    const root = projectFixture({
      focus: "- **Estado:** `complete`.\n- **Referencia:** `docs/tracks/current.md`.\n- **Siguiente acción:** elegir próximo frente.",
    });
    write(root, "docs/tracks/drift.md", "---\nstatus: done-ish\n---\n# Drift\n");
    const report = runAosDoctor(root, { includeContextSize: false });
    expect(report.findings.map((finding) => finding.code)).toContain("track.status_invalid");
  });

  test("Pi adapter exposes read-only /doctor", async () => {
    const root = projectFixture({
      focus: "- **Estado:** `complete`.\n- **Referencia:** `docs/tracks/current.md`.\n- **Siguiente acción:** elegir próximo frente.",
      extensions: ["aos-doctor.ts"],
    });
    let handler;
    const notices = [];
    aosDoctor({ registerCommand: (name, command) => { if (name === "doctor") handler = command.handler; } });
    await handler("", { cwd: root, hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
    expect(notices[0]?.message).toContain("AOS Doctor PASS");
    expect(notices[0]?.level).toBe("info");
  });

  test("repository has no blocking AOS doctor findings", () => {
    expect(runAosDoctor(process.cwd()).errors).toBe(0);
  });
});
