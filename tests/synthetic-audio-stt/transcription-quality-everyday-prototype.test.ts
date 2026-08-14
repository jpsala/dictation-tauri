import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import {
  applyEverydayAdjudication,
  classifyEverydayText,
  deduplicateAndSelect,
  discoverEverydayEntries,
  runEverydayPrototype,
  type EverydayDiscoveredEntry,
} from "../../scripts/transcription-quality-everyday-prototype";

const PRIVATE_RAW = "Che, eh, mandame el informe mañana, no, mejor dicho el jueves.";
const PRIVATE_FINAL = PRIVATE_RAW;

function entry(id: string, rawText = PRIVATE_RAW, finalText = PRIVATE_FINAL): EverydayDiscoveredEntry {
  return { sourceId: "fixture", sourceRecordId: id, provenance: { pipeline: "fixture" }, rawText, finalText, audioPath: null, createdAt: "2026-08-12T00:00:00Z" };
}

async function addArtifact(root: string, runId: string, text: string): Promise<void> {
  const audioPath = join(root, "audio", `${runId}.wav`);
  await writeFile(audioPath, new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]));
  await writeFile(join(root, "transcripts", `${runId}.txt`), `${text}\n`, "utf8");
  await writeFile(join(root, "reports", `${runId}.json`), JSON.stringify({ runId, status: "ok", audioPath, redacted: true, postProcess: { enabled: false, ran: false } }), "utf8");
}

async function fixtureWorkspace(): Promise<{ root: string; artifactSource: string }> {
  const root = await mkdtemp(join(tmpdir(), "everyday-prototype-"));
  const artifactSource = join(root, "microphone-capture");
  await Promise.all(["audio", "transcripts", "reports"].map((name) => mkdir(join(artifactSource, name), { recursive: true })));
  await addArtifact(artifactSource, "one", PRIVATE_RAW);
  await addArtifact(artifactSource, "duplicate", PRIVATE_RAW);
  await addArtifact(artifactSource, "question", "Che, ¿podés decirme cuándo nos vemos?");
  await writeFile(join(artifactSource, "reports", "corrupt.json"), "{", "utf8");
  return { root, artifactSource };
}

const sourceConfig = (path: string) => [{ id: "microphone-fixture", kind: "microphone-artifacts" as const, databasePath: path }];

describe("everyday transcription prototype", () => {
  it("discovers only usable audio/raw/final joins and preserves provenance", async () => {
    const fixture = await fixtureWorkspace();
    const rows = await discoverEverydayEntries(sourceConfig(fixture.artifactSource));
    expect(rows).toHaveLength(3);
    expect(rows[0]?.provenance).toMatchObject({ pipeline: "dictation-tauri-microphone-capture", rawFinalRelation: "identical-no-postprocess" });
    expect(rows.every((row) => row.rawText.length > 0 && row.finalText.length > 0 && row.audioPath?.endsWith(".wav"))).toBe(true);
  });

  it("deduplicates by content hash and selects deterministically across everyday categories", () => {
    const rows = [entry("b"), entry("a"), entry("question", "Che, ¿podés venir mañana?", "Che, ¿podés venir mañana?"), entry("technical", "Ejecutá npm con GPTModel.ts", "Ejecutá npm con GPTModel.ts")];
    const forward = deduplicateAndSelect(rows, 3);
    const reverse = deduplicateAndSelect([...rows].reverse(), 3);
    expect(forward.map((row) => row.contentHash)).toEqual(reverse.map((row) => row.contentHash));
    expect(new Set(forward.map((row) => row.contentHash)).size).toBe(forward.length);
    expect(forward.flatMap((row) => row.categories)).toContain("question");
  });

  it("classifies questions, corrections, fillers and Rioplatense usage observably", () => {
    const classified = classifyEverydayText(PRIVATE_RAW, PRIVATE_FINAL);
    expect(classified.categories).toEqual(expect.arrayContaining(["message", "spoken-correction", "fillers-repetition", "rioplatense"]));
    expect(classified.technicalPenalty).toBe(0);
  });

  it("writes redacted public artifacts and a private side-by-side adjudication queue", async () => {
    const fixture = await fixtureWorkspace();
    const result = await runEverydayPrototype({ workspaceRoot: fixture.root, sources: sourceConfig(fixture.artifactSource), limit: 2, runId: "everyday-prototype-fixture" });
    const artifactRoot = join(fixture.root, result.artifactRoot);
    const renderedPublic = (await Promise.all(["manifest.json", "results.jsonl", "summary.json"].map((name) => readFile(join(artifactRoot, name), "utf8")))).join("\n");
    expect(renderedPublic).not.toContain(PRIVATE_RAW);
    expect(renderedPublic).toContain("historical-final-unadjudicated");
    expect(renderedPublic).toContain("redacted");
    const queue = await readFile(join(artifactRoot, "private", "adjudication-queue.json"), "utf8");
    expect(queue).toContain(PRIVATE_RAW);
    expect(result.queueCount).toBeLessThanOrEqual(12);
  });

  it("promotes only complete human decisions and keeps the public summary redacted", async () => {
    const fixture = await fixtureWorkspace();
    const result = await runEverydayPrototype({ workspaceRoot: fixture.root, sources: sourceConfig(fixture.artifactSource), limit: 2, runId: "everyday-prototype-adjudicated" });
    const artifactRoot = join(fixture.root, result.artifactRoot);
    const queue = JSON.parse(await readFile(join(artifactRoot, "private", "adjudication-queue.json"), "utf8")) as {
      cases: Array<{ sampleId: string }>;
    };
    const decisions = queue.cases.map(({ sampleId }) => ({ sampleId, choice: "equivalent" as const }));
    const adjudicated = await applyEverydayAdjudication({ workspaceRoot: fixture.root, runId: result.runId, decisions });
    expect(adjudicated).toMatchObject({ approvedCount: 2, rejectedCount: 0, choiceCounts: { equivalent: 2 } });
    const publicSummary = await readFile(join(artifactRoot, "adjudication-summary.json"), "utf8");
    expect(publicSummary).toContain("human-adjudicated");
    expect(publicSummary).not.toContain(PRIVATE_RAW);
    const privateResult = await readFile(join(artifactRoot, "private", "adjudication.json"), "utf8");
    expect(privateResult).toContain("approved-preference-reference");
    expect(privateResult).toContain("/raw.txt");
  });

  it("rejects partial adjudication instead of silently promoting a subset", async () => {
    const fixture = await fixtureWorkspace();
    const result = await runEverydayPrototype({ workspaceRoot: fixture.root, sources: sourceConfig(fixture.artifactSource), limit: 2, runId: "everyday-prototype-partial" });
    await expect(applyEverydayAdjudication({
      workspaceRoot: fixture.root,
      runId: result.runId,
      decisions: [],
    })).rejects.toThrow("decide every queued sample exactly once");
  });

  it("reports accepted and fallback decisions without treating finals as gold", async () => {
    const fixture = await fixtureWorkspace();
    await addArtifact(fixture.artifactSource, "fallback", "Che, avisame si venís mañana temprano");
    const discovered = await discoverEverydayEntries(sourceConfig(fixture.artifactSource));
    const altered = discovered.map((row) => row.sourceRecordId === "fallback" ? { ...row, finalText: "Claro, puedo ayudarte con eso" } : row);
    const selected = deduplicateAndSelect(altered, 4);
    expect(selected.some((row) => row.sourceRecordId === "fallback")).toBe(true);
    const result = await runEverydayPrototype({ workspaceRoot: fixture.root, sources: sourceConfig(fixture.artifactSource), limit: 3, runId: "everyday-prototype-decisions" });
    const manifest = await readFile(join(fixture.root, result.artifactRoot, "manifest.json"), "utf8");
    expect(manifest).not.toMatch(/\bgold\b/iu);
    expect(manifest).toContain("historical-final-unadjudicated");
  });
});
