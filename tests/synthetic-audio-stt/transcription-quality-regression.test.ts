import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateTranscriptionRegression, renderDeterministicDriftReport, runLocalShadow, planTranscriptionQualityRetention } from "../../scripts/transcription-quality-regression";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("provider-free regression, drift, shadow, retention", () => {
  it("returns observable pass/fail regression reasons", () => {
    expect(evaluateTranscriptionRegression({ scores: { wer: 0.1 } }, { scores: { wer: 0.12 } }, { "scores.wer": 0.01 }).passed).toBe(false);
    expect(evaluateTranscriptionRegression({ scores: { wer: 0.1 } }, { scores: { wer: 0.105 } }, { "scores.wer": 0.01 }).passed).toBe(true);
  });
  it("treats instruction following as higher-is-better", () => {
    expect(evaluateTranscriptionRegression(
      { scores: { instructionFollowing: 1 } },
      { scores: { instructionFollowing: 0.5 } },
      { "scores.instructionFollowing": 0.1 },
    )).toMatchObject({
      passed: false,
      reasons: ["regression:scores.instructionFollowing"],
    });
    expect(evaluateTranscriptionRegression(
      { scores: { instructionFollowing: 0.5 } },
      { scores: { instructionFollowing: 1 } },
      { "scores.instructionFollowing": 0.1 },
    ).passed).toBe(true);
  });
  it("redacts human text and is deterministic", () => {
    const input = { baseline: { runId: "b", transcript: "secret" }, candidate: { runId: "c", summary: "human" }, regression: { passed: true, reasons: [], metrics: [] } };
    const first = renderDeterministicDriftReport(input); const second = renderDeterministicDriftReport(input);
    expect(first).toBe(second); expect(first).not.toContain("secret"); expect(first).not.toContain("human");
  });
  it("keeps shadow off without opt-in", async () => {
    let called = false;
    expect(await runLocalShadow({ run: () => { called = true; return 1; } })).toEqual({ status: "off" });
    expect(called).toBe(false);
    expect(await runLocalShadow({ optIn: true, run: () => 1 })).toEqual({ status: "completed", result: 1 });
  });
  it("plans dry-run cleanup while preserving canonical artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "tq-retention-")); roots.push(root);
    await mkdir(join(root, "run-a", "private"), { recursive: true });
    await writeFile(join(root, "run-a", "run.json"), "{}"); await writeFile(join(root, "run-a", "private", "x"), "secret");
    const plan = await planTranscriptionQualityRetention({ workspaceRoot: root });
    expect(plan.dryRun).toBe(true); expect(plan.preserved).toContain("run-a/run.json"); expect(plan.removed).toContain("run-a/private/x");
  });
});
