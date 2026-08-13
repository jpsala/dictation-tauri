import { describe, expect, it } from "vitest";
import {
  adaptLabRunInput,
  adaptPipelineRunToLabEvidence,
  adaptResultHistoryEntryToLabEvidence,
  compareLabRuns,
  createUnavailableEvidenceAdapter,
  effectiveRecipeIdentity,
  evaluateRunEligibility,
  selectEligibleRuns,
} from "../../src/dictation-lab";
import type { SimulatedRunSummary } from "../../src/pipeline/types";

describe("dictation lab evaluation model", () => {
  it("keeps configured, resolved, and observed identity layers with observed precedence", () => {
    const identity = effectiveRecipeIdentity({
      configured: { profileId: "configured", version: 1, revision: "c", recipeId: "draft" },
      resolved: { profileId: "resolved", version: 2, revision: "r", recipeId: "assigned" },
      observed: { profileId: "observed", version: 3, revision: "o", recipeId: "executed" },
    });

    expect(identity).toMatchObject({ profileId: "observed", version: 3, revision: "o", recipeId: "executed", source: "mixed" });
  });

  it("adapts a run to lengths and opaque refs without exposing transcript text", () => {
    const summary: SimulatedRunSummary = {
      runId: "run-private-1",
      fixtureId: "fixture",
      resultSource: "dictation",
      inputKind: "simulated",
      events: [],
      states: ["idle", "done"],
      terminalState: "done",
      transcript: "PRIVATE TRANSCRIPT SHOULD NEVER ESCAPE",
      output: "Private final output",
      deliveryEvidence: { status: "paste_sent", output: "Private final output" },
      durationMs: 230,
      runtimeTelemetryStages: [{ stage: "stt", status: "ok", provider: "provider", model: "model", redacted: true }],
    };

    const evidence = adaptPipelineRunToLabEvidence(summary);
    const serialized = JSON.stringify(evidence);
    expect(evidence.raw.length).toBe(summary.transcript?.length);
    expect(evidence.final.length).toBe(summary.output?.length);
    expect(evidence.raw.ref).toContain("run:run-private-1:raw");
    expect(serialized).not.toContain("PRIVATE TRANSCRIPT");
    expect(serialized).not.toContain("Private final output");
  });

  it("marks history-only and unavailable evidence honestly", () => {
    const history = adaptResultHistoryEntryToLabEvidence({ runId: "history-1", source: "dictation", text: "private", textLength: 7 });
    expect(history.final).toMatchObject({ length: 7, availability: { status: "available" } });
    expect(history.raw.availability.status).toBe("unavailable");
    expect(history.latency.availability.status).toBe("unavailable");

    const unavailable = createUnavailableEvidenceAdapter("telemetry_not_recorded")({ runId: "missing-1", terminalState: "done" });
    expect(unavailable.semanticSafety.status).toBe("unavailable");
    expect(unavailable.cost.availability).toMatchObject({ status: "unavailable", missing: ["telemetry_not_recorded"] });
  });

  it("compares bounded redacted metrics and records missing evidence", () => {
    const make = (runId: string, durationMs: number): SimulatedRunSummary => ({
      runId,
      fixtureId: "fixture",
      resultSource: "dictation",
      inputKind: "simulated",
      events: [],
      states: ["idle", "done"],
      terminalState: "done",
      transcript: "one two",
      output: "one two",
      durationMs,
      runtimeTelemetryStages: [{ stage: "stt", status: "ok", redacted: true }],
    });
    const baseline = adaptPipelineRunToLabEvidence(make("baseline", 300));
    const candidate = adaptPipelineRunToLabEvidence(make("candidate", 200));
    const comparison = compareLabRuns(baseline, candidate);

    expect(comparison.finalLength.delta).toBe(0);
    expect(comparison.latencyMs.delta).toBe(-100);
    expect(comparison.costUsd.estimated.availability.status).toBe("unavailable");
    expect(comparison.evidence.status).toBe("partial");
    expect(JSON.stringify(comparison)).not.toContain("one two");
  });

  it("selects only completed, eligible dictation runs within the bound", () => {
    const eligibility = evaluateRunEligibility({ runId: "done", source: "dictation", terminalState: "done" });
    expect(eligibility.eligible).toBe(true);
    expect(evaluateRunEligibility({ runId: "failed", source: "dictation", terminalState: "error" }).eligible).toBe(false);
    expect(selectEligibleRuns([
      { runId: "done", source: "dictation", terminalState: "done", eligibility, raw: { availability: { status: "unavailable", missing: ["raw"], redacted: true }, redacted: true }, final: { availability: { status: "unavailable", missing: ["final"], redacted: true }, redacted: true }, semanticSafety: { status: "unavailable", redacted: true }, latency: { availability: { status: "unavailable", missing: ["latency"], redacted: true }, redacted: true }, cost: { currency: "USD", availability: { status: "unavailable", missing: ["cost"], redacted: true }, redacted: true }, fallback: { used: false, stages: [], availability: { status: "unavailable", missing: ["fallback"], redacted: true }, redacted: true }, observed: { availability: { status: "unavailable", missing: ["observed"], redacted: true }, redacted: true }, identity: {}, humanVerdict: "unreviewed", redacted: true },
    ], { limit: 1 })).toHaveLength(1);
  });
});
describe("dictation lab generic evidence adapter", () => {
  it("accepts redacted cost and semantic signals without copying text", () => {
    const evidence = adaptLabRunInput({
      runId: "generic-1",
      source: "dictation",
      terminalState: "done",
      transcript: "private",
      output: "private final",
      durationMs: 90,
      semanticSafety: { status: "pass", omissions: 1, additions: 2, unsafeChanges: 0 },
      cost: { estimatedUsd: 0.01, observedUsd: 0.02 },
      observed: { profileId: "p", version: 2, revision: "r" },
    });

    expect(evidence.cost).toMatchObject({ estimatedUsd: 0.01, observedUsd: 0.02 });
    expect(evidence.semanticSafety).toMatchObject({ status: "pass", omissions: 1, additions: 2 });
    expect(JSON.stringify(evidence)).not.toContain("private");
  });
});
