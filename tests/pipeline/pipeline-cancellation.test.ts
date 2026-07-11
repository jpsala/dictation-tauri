import { describe, expect, it } from "vitest";
import { deriveRunSummaryFromEvents } from "../../src/pipeline/events";
import { runSimulatedPipeline } from "../../src/pipeline/runner";
import {
  ActivePipelineRunError,
  PipelineService,
} from "../../src/pipeline/service";
import type { MockTranscriptionResult } from "../../src/pipeline/types";
import type { PipelineEvent } from "../../src/pipeline/types";

describe("simulated pipeline cancellation and evidence", () => {
  it("cancels at a requested state and keeps cancellation terminal", async () => {
    const events: PipelineEvent[] = [];
    let tick = 10_000;

    const summary = await runSimulatedPipeline(
      {
        fixtureId: "clean-note",
        cancelAtState: "transcribing",
      },
      {
        createRunId: () => "run-cancel-001",
        now: () => tick++,
        onEvent: (event) => events.push(event),
      },
    );

    expect(summary.terminalState).toBe("cancelled");
    expect(summary.states).toEqual([
      "idle",
      "listening",
      "transcribing",
      "cancelled",
    ]);
    expect(summary.output).toBeUndefined();
    expect(summary.delivery).toBeUndefined();
    expect(summary.error).toBeUndefined();
    expect(summary.events).toEqual(events);
    expect(summary.events.map((event) => event.type)).toEqual([
      "run_started",
      "state_changed",
      "state_changed",
      "state_changed",
      "run_cancelled",
    ]);
    expect(summary.events.at(-1)?.type).toBe("run_cancelled");
    expect(summary.events.some((event) => event.type === "run_completed")).toBe(
      false,
    );
    expect(summary.events.some((event) => event.type === "delivery_completed")).toBe(
      false,
    );
    expect(deriveRunSummaryFromEvents(events)).toEqual(summary);
  });

  it("cancels at delivering before running delivery side effects", async () => {
    let deliveryCalls = 0;
    const service = new PipelineService({
      createRunId: () => "run-cancel-delivery-001",
      transcriptionAdapter: {
        async transcribe() {
          return {
            text: "transcript ready before cancellation",
            latencyMs: 12,
          };
        },
      },
      deliveryAdapter: {
        async deliver() {
          deliveryCalls += 1;
          return { status: "delivered" };
        },
      },
    });

    const summary = await service.run({
      fixtureId: "clean-note",
      cancelAtState: "delivering",
    });

    expect(summary.terminalState).toBe("cancelled");
    expect(summary.states).toEqual([
      "idle",
      "listening",
      "transcribing",
      "delivering",
      "cancelled",
    ]);
    expect(summary.output).toBeUndefined();
    expect(summary.delivery).toBeUndefined();
    expect(deliveryCalls).toBe(0);
    expect(summary.events.some((event) => event.type === "delivery_completed")).toBe(false);
  });

  it("rejects overlapping runs without mutating the active run", async () => {
    const events: PipelineEvent[] = [];
    const runIds = ["run-overlap-001", "run-overlap-002"];
    let tick = 20_000;
    let releaseTranscription:
      | ((result: MockTranscriptionResult) => void)
      | undefined;

    const service = new PipelineService({
      createRunId: () => runIds.shift() ?? "unexpected-run",
      now: () => tick++,
      onEvent: (event) => events.push(event),
      transcriptionAdapter: {
        transcribe: async () =>
          new Promise<MockTranscriptionResult>((resolve) => {
            releaseTranscription = resolve;
          }),
      },
    });

    const firstRun = service.run({ fixtureId: "clean-note" });

    expect(service.activeRunId).toBe("run-overlap-001");
    await expect(service.run({ fixtureId: "clean-note" })).rejects.toBeInstanceOf(
      ActivePipelineRunError,
    );
    await expect(service.run({ fixtureId: "clean-note" })).rejects.toMatchObject({
      activeRunId: "run-overlap-001",
    });

    for (let index = 0; index < 10 && !releaseTranscription; index += 1) {
      await Promise.resolve();
    }

    expect(releaseTranscription).toBeDefined();

    releaseTranscription?.({
      text: "Create a short project note about testing the dictation pipeline.",
      latencyMs: 12,
    });

    const summary = await firstRun;

    expect(summary.terminalState).toBe("done");
    expect(summary.runId).toBe("run-overlap-001");
    expect(service.activeRunId).toBeUndefined();
    expect(events.every((event) => event.runId === "run-overlap-001")).toBe(
      true,
    );
    expect(events.some((event) => event.runId === "run-overlap-002")).toBe(
      false,
    );
  });

  it("supports service-owned external cancellation while a run is active", async () => {
    const events: PipelineEvent[] = [];
    let tick = 30_000;
    let cancelRequested = false;

    const service = new PipelineService({
      createRunId: () => "run-external-cancel-001",
      now: () => tick++,
      onEvent: (event) => events.push(event),
      onState: (event) => {
        if (event.state === "transcribing" && !cancelRequested) {
          cancelRequested = service.cancelActiveRun();
        }
      },
    });

    const summary = await service.run({ fixtureId: "clean-note" });

    expect(cancelRequested).toBe(true);
    expect(summary.terminalState).toBe("cancelled");
    expect(summary.states).toEqual([
      "idle",
      "listening",
      "transcribing",
      "cancelled",
    ]);
    expect(summary.events.at(-1)?.type).toBe("run_cancelled");
    expect(summary.events.some((event) => event.type === "run_completed")).toBe(
      false,
    );
    expect(service.cancelActiveRun()).toBe(false);
  });
});
