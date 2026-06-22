import type { SimulatedRunSummary } from "../pipeline/types";
import type { LatestResult, LatestResultSource, SelectionTransformResult } from "./types";

export function latestResultFromPipelineSummary(
  summary: SimulatedRunSummary | undefined,
): LatestResult | undefined {
  if (!summary || summary.terminalState !== "done") {
    return undefined;
  }

  return createLatestResult({
    runId: summary.runId,
    text: summary.deliveryEvidence?.output ?? summary.output ?? summary.transcript,
    source: "dictation",
    deliveryEvidence: summary.deliveryEvidence,
  });
}

export function latestResultFromSelectionTransform(input: {
  runId: string;
  result: SelectionTransformResult;
  createdAt?: string;
}): LatestResult | undefined {
  if (input.result.status !== "ok") {
    return undefined;
  }

  return createLatestResult({
    runId: input.runId,
    text: input.result.output,
    source: "selection_transform",
    createdAt: input.createdAt,
  });
}

function createLatestResult(input: {
  runId: string;
  text: string | undefined;
  source: LatestResultSource;
  createdAt?: string;
  deliveryEvidence?: LatestResult["deliveryEvidence"];
}): LatestResult | undefined {
  const text = input.text?.trim();

  if (!text) {
    return undefined;
  }

  return {
    runId: input.runId,
    text,
    source: input.source,
    createdAt: input.createdAt,
    deliveryEvidence: input.deliveryEvidence,
  };
}
