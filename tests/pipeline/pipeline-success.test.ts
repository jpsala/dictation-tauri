import { describe, expect, it } from "vitest";
import { getSimulatedFixture } from "../../src/pipeline/fixtures";
import { runSimulatedPipeline } from "../../src/pipeline/runner";
import type { PipelineStateEvent } from "../../src/pipeline/types";

describe("simulated pipeline success flow", () => {
  it("runs a fixture-backed dictation flow to deterministic output", async () => {
    const fixture = getSimulatedFixture("clean-note");
    const events: PipelineStateEvent[] = [];
    let tick = 1_000;

    const summary = await runSimulatedPipeline(
      { fixtureId: "clean-note" },
      {
        createRunId: () => "run-success-001",
        now: () => tick++,
        onState: (event) => events.push(event),
      },
    );

    expect(summary).toMatchObject({
      runId: "run-success-001",
      fixtureId: "clean-note",
      states: ["idle", "listening", "transcribing", "delivering", "done"],
      terminalState: "done",
      output: fixture?.expectedOutput,
      delivery: {
        status: "delivered",
        output: fixture?.expectedOutput,
      },
      durationMs: 7,
    });
    expect(fixture).toBeDefined();
    expect(summary.error).toBeUndefined();
    expect(summary.events.map((event) => event.type)).toEqual([
      "run_started",
      "state_changed",
      "state_changed",
      "transcription_completed",
      "state_changed",
      "delivery_completed",
      "state_changed",
      "run_completed",
    ]);
    expect(events.map((event) => event.state)).toEqual(summary.states);
    expect(events.every((event) => event.runId === summary.runId)).toBe(true);
    expect(events.every((event) => event.fixtureId === summary.fixtureId)).toBe(
      true,
    );
  });
});
