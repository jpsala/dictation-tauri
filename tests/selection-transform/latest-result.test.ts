import { describe, expect, it } from "vitest";
import {
  latestResultFromPipelineSummary,
  latestResultFromSelectionTransform,
} from "../../src/selection-transform";
import type { SelectionTransformResult } from "../../src/selection-transform";
import type { SimulatedRunSummary } from "../../src/pipeline/types";

describe("latest result recovery", () => {
  it("keeps only the latest successful dictation output in memory shape", () => {
    const latest = latestResultFromPipelineSummary(
      createSummary({
        transcript: " raw transcript ",
        output: " processed output ",
        deliveryEvidence: {
          status: "uncertain",
          output: " delivered output ",
          reason: "Delivery was not observed.",
        },
      }),
    );

    expect(latest).toEqual({
      runId: "latest-run",
      text: "delivered output",
      source: "dictation",
      deliveryEvidence: {
        status: "uncertain",
        output: " delivered output ",
        reason: "Delivery was not observed.",
      },
    });
  });

  it("preserves selection transform source from a pipeline summary", () => {
    const latest = latestResultFromPipelineSummary(
      createSummary({
        resultSource: "selection_transform",
        output: " transformed selection ",
      }),
    );

    expect(latest).toMatchObject({
      runId: "latest-run",
      text: "transformed selection",
      source: "selection_transform",
    });
  });

  it("does not create a latest dictation result for failed or empty runs", () => {
    expect(
      latestResultFromPipelineSummary(
        createSummary({ terminalState: "error", transcript: "partial text" }),
      ),
    ).toBeUndefined();

    expect(
      latestResultFromPipelineSummary(
        createSummary({ transcript: " ", output: undefined, deliveryEvidence: undefined }),
      ),
    ).toBeUndefined();
  });

  it("keeps selection transform latest results provider-free and ephemeral", () => {
    const result: SelectionTransformResult = {
      status: "ok",
      output: " transformed selection ",
      action: "replace_selection",
      presetId: "corregir-texto",
      evidence: {
        selectionAvailable: true,
        source: "fixture",
        provider: "fixture",
      },
    };

    expect(
      latestResultFromSelectionTransform({
        runId: "selection-run",
        result,
      }),
    ).toEqual({
      runId: "selection-run",
      text: "transformed selection",
      source: "selection_transform",
    });
  });

  it("does not keep failed or empty selection transform output", () => {
    expect(
      latestResultFromSelectionTransform({
        runId: "selection-run",
        result: {
          status: "failed",
          output: "do not keep",
          action: "review_only",
          evidence: { selectionAvailable: true, source: "fixture" },
        },
      }),
    ).toBeUndefined();

    expect(
      latestResultFromSelectionTransform({
        runId: "selection-run",
        result: {
          status: "ok",
          output: " ",
          action: "replace_selection",
          evidence: { selectionAvailable: true, source: "fixture" },
        },
      }),
    ).toBeUndefined();
  });
});

function createSummary(
  overrides: Partial<SimulatedRunSummary> = {},
): SimulatedRunSummary {
  return {
    runId: "latest-run",
    fixtureId: "latest-fixture",
    inputKind: "microphone",
    events: [],
    states: ["idle", "listening", "transcribing", "delivering", "done"],
    terminalState: "done",
    transcript: "transcript",
    output: "output",
    durationMs: 10,
    ...overrides,
  };
}
