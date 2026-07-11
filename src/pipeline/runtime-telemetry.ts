import type { DeliveryEvidenceStatus, RuntimeTelemetryStage, SimulatedRunSummary } from "./types";

const FORBIDDEN_TELEMETRY_MARKERS = [
  "rawAudio",
  "rawTranscript",
  "selectedText",
  "rawText",
  "secret",
] as const;

export function createRuntimeTelemetryStage(
  stage: RuntimeTelemetryStage,
): RuntimeTelemetryStage {
  return {
    ...stage,
    redacted: true,
  };
}

export function runtimeTelemetryLooksRedacted(stages: readonly RuntimeTelemetryStage[]): boolean {
  const serialized = JSON.stringify(stages).toLowerCase();
  return !FORBIDDEN_TELEMETRY_MARKERS.some((marker) => serialized.includes(marker.toLowerCase()));
}

export type SafeRedactedRunSummary = {
  runId: string;
  source: NonNullable<SimulatedRunSummary["resultSource"]>;
  terminalState: SimulatedRunSummary["terminalState"];
  delivery: {
    status: DeliveryEvidenceStatus | "review_only" | "none";
    confidence: "verified" | "sent_unverified" | "review_only" | "uncertain" | "failed" | "none";
    nextStep: string;
  };
  outputChars?: number;
  durationMs: number;
  stages?: string[];
  redacted: true;
};

export function createSafeRedactedRunSummary(
  summary: SimulatedRunSummary | undefined,
  options: { maxSerializedLength?: number } = {},
): SafeRedactedRunSummary | undefined {
  if (!summary) {
    return undefined;
  }

  if (summary.runtimeTelemetryStages && !runtimeTelemetryLooksRedacted(summary.runtimeTelemetryStages)) {
    return undefined;
  }

  const safe: SafeRedactedRunSummary = {
    runId: compactRunId(summary.runId),
    source: summary.resultSource ?? "dictation",
    terminalState: summary.terminalState,
    delivery: describeDeliveryForRunSummary(summary),
    outputChars: latestTextLength(summary),
    durationMs: summary.durationMs,
    stages: summary.runtimeTelemetryStages?.map((stage) => `${stage.stage}:${stage.status}`).slice(0, 6),
    redacted: true,
  };

  const serialized = JSON.stringify(safe);
  if (
    serialized.length > (options.maxSerializedLength ?? 520) ||
    !safe.runId ||
    containsForbiddenTelemetryMarker(serialized)
  ) {
    return undefined;
  }

  return safe;
}

export function formatSafeRedactedRunSummary(
  summary: SimulatedRunSummary | undefined,
  options: { maxSerializedLength?: number } = {},
): string | undefined {
  const safe = createSafeRedactedRunSummary(summary, options);
  if (!safe) {
    return undefined;
  }

  const output = safe.outputChars === undefined ? "no result text" : `${safe.outputChars} chars`;
  const stages = safe.stages?.length ? `; stages ${safe.stages.join(",")}` : "";
  return `Run ${safe.runId}: ${safe.source}/${safe.terminalState}; delivery ${safe.delivery.status} (${safe.delivery.confidence}); ${output}; next: ${safe.delivery.nextStep}${stages}`;
}

function describeDeliveryForRunSummary(
  summary: SimulatedRunSummary,
): SafeRedactedRunSummary["delivery"] {
  const status = summary.deliveryEvidence?.status;
  if (!status) {
    return {
      status: "none",
      confidence: "none",
      nextStep: "Record again or review setup before retrying.",
    };
  }

  switch (status) {
    case "paste_observed":
      return {
        status,
        confidence: "verified",
        nextStep: "No recovery needed; observer verified target insertion.",
      };
    case "paste_sent":
      return {
        status,
        confidence: "sent_unverified",
        nextStep: "Verify the target; if text is missing, copy or paste last.",
      };
    case "available":
      return {
        status: "review_only",
        confidence: "review_only",
        nextStep: "Review or insert manually; nothing was pasted.",
      };
    case "copied":
      return {
        status,
        confidence: "review_only",
        nextStep: "Paste manually if the target still needs the text.",
      };
    case "uncertain":
      return {
        status,
        confidence: "uncertain",
        nextStep: "Verify the target; use copy or safe paste-last if missing.",
      };
    case "failed":
      return {
        status,
        confidence: "failed",
        nextStep: failedDeliveryGuidance(summary.deliveryEvidence?.reason),
      };
  }
}

function failedDeliveryGuidance(reason: string | undefined): string {
  const normalized = reason?.toLowerCase() ?? "";
  if (normalized.includes("editable target") || normalized.includes("inputlike")) {
    return "Focus an editable target, then copy or paste last if needed.";
  }

  return "Check the target app, then copy manually or retry delivery.";
}

function latestTextLength(summary: SimulatedRunSummary): number | undefined {
  const text = summary.deliveryEvidence?.output ?? summary.output ?? summary.transcript;
  return typeof text === "string" ? text.length : undefined;
}

function compactRunId(runId: string): string {
  return runId.replace(/[^A-Za-z0-9:._-]/g, "_").slice(0, 80);
}

function containsForbiddenTelemetryMarker(serialized: string): boolean {
  const lower = serialized.toLowerCase();
  return FORBIDDEN_TELEMETRY_MARKERS.some((marker) => lower.includes(marker.toLowerCase()));
}
