import { describe, expect, it } from "vitest";
import { getSimulatedFixture } from "../../src/pipeline/fixtures";
import { runSimulatedPipeline } from "../../src/pipeline/runner";

describe("simulated pipeline failure and recovery paths", () => {
  it("surfaces a redacted transcription failure without attempting delivery", async () => {
    const fixture = getSimulatedFixture("transcription-timeout");
    let tick = 2_000;

    const summary = await runSimulatedPipeline(
      { fixtureId: "transcription-timeout" },
      {
        createRunId: () => "run-failure-001",
        now: () => tick++,
      },
    );

    expect(summary.states).toEqual([
      "idle",
      "listening",
      "transcribing",
      "error",
    ]);
    expect(summary.terminalState).toBe("error");
    expect(summary.output).toBeUndefined();
    expect(summary.delivery).toBeUndefined();
    expect(summary.error).toEqual(fixture?.failureMode);
    expect(summary.error?.message).not.toContain(fixture?.sourceText ?? "");
  });

  it("keeps uncertain delivery distinct from delivered", async () => {
    const fixture = getSimulatedFixture("uncertain-delivery");
    let tick = 3_000;

    const summary = await runSimulatedPipeline(
      { fixtureId: "uncertain-delivery" },
      {
        createRunId: () => "run-uncertain-001",
        now: () => tick++,
      },
    );

    expect(summary.terminalState).toBe("done");
    expect(summary.output).toBe(fixture?.expectedOutput);
    expect(summary.delivery).toEqual({
      status: "uncertain",
      output: fixture?.expectedOutput,
      reason: "Simulated delivery could not be confirmed.",
    });
    expect(summary.delivery?.status).not.toBe("delivered");
  });

  it("reports copy fallback as available text, not observed paste", async () => {
    const fixture = getSimulatedFixture("copied-fallback");
    let tick = 4_000;

    const summary = await runSimulatedPipeline(
      { fixtureId: "copied-fallback" },
      {
        createRunId: () => "run-fallback-001",
        now: () => tick++,
      },
    );

    expect(summary.terminalState).toBe("done");
    expect(summary.output).toBe(fixture?.expectedOutput);
    expect(summary.delivery).toEqual({
      status: "copiedFallback",
      output: fixture?.expectedOutput,
      reason: "Simulated paste unavailable; output is available as fallback.",
    });
  });

  it("ends in error when simulated delivery fails without fallback", async () => {
    const fixture = getSimulatedFixture("delivery-failure");
    let tick = 5_000;

    const summary = await runSimulatedPipeline(
      { fixtureId: "delivery-failure" },
      {
        createRunId: () => "run-delivery-failure-001",
        now: () => tick++,
      },
    );

    expect(summary.states).toEqual([
      "idle",
      "listening",
      "transcribing",
      "delivering",
      "error",
    ]);
    expect(summary.terminalState).toBe("error");
    expect(summary.output).toBe(fixture?.expectedOutput);
    expect(summary.delivery).toEqual({
      status: "failed",
      reason: fixture?.failureMode?.message,
    });
    expect(summary.error).toEqual(fixture?.failureMode);
  });
});
