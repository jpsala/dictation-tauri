import type { AssistantIntentResult } from "../assistant/intent-result";
import type { AssistantSurface, DeliveryEvidence, SimulatedRunSummary } from "./types";

export type PipelineUiResult =
  | {
      kind: "empty";
      summary?: SimulatedRunSummary;
    }
  | {
      kind: "dictation";
      transcript: string;
      delivery?: DeliveryEvidence;
      summary: SimulatedRunSummary;
    }
  | {
      kind: "selectionTransform";
      output: string;
      delivery?: DeliveryEvidence;
      summary: SimulatedRunSummary;
    }
  | {
      kind: "assistant";
      output?: string;
      surface: AssistantSurface;
      intent?: AssistantIntentResult;
      delivery?: DeliveryEvidence;
      summary: SimulatedRunSummary;
    };

export function assistantSurfaceFromIntentResult(
  result: AssistantIntentResult | undefined,
  resolvedText?: string,
): AssistantSurface {
  if (!result) {
    return { kind: "none" };
  }

  switch (result.kind) {
    case "insertText":
      return { kind: "insertText", text: result.text, delivery: "paste_send" };
    case "notify":
      return { kind: "notify", message: result.message, level: result.level };
    case "quickChat":
      return {
        kind: "quickChat",
        title: "Quick Chat",
        initialUserText: result.initialUserText,
        initialAssistantText: result.initialAssistantText ?? resolvedText,
      };
    case "showMarkdown":
      return { kind: "showMarkdown", title: result.title, markdown: resolvedText?.trim() || result.markdown };
    case "optionPicker":
      return { kind: "optionPicker", title: result.title, prompt: result.prompt, options: result.options };
    case "toolAction": {
      const text = resolvedText?.trim();
      if (text) {
        if (result.tool === "run_assistant_chat" && text.length > 180) {
          return { kind: "showMarkdown", title: "Lulu", markdown: text };
        }
        return { kind: "notify", message: text, level: result.tool === "preset.activate" ? "success" : "info" };
      }
      return { kind: "toolAction", tool: result.tool, args: result.args };
    }
    case "error":
      return { kind: "error", message: result.message, recoverable: result.recoverable };
  }
}

export function createPipelineUiResult(summary: SimulatedRunSummary | undefined): PipelineUiResult {
  if (!summary || summary.terminalState !== "done") {
    return { kind: "empty", summary };
  }

  const text = summary.deliveryEvidence?.output ?? summary.output ?? summary.transcript;
  const output = text?.trim();
  if (!output) {
    return { kind: "empty", summary };
  }

  if (summary.resultSource === "assistant") {
    return {
      kind: "assistant",
      output,
      surface: summary.assistantSurface ?? { kind: "none" },
      delivery: summary.deliveryEvidence,
      summary,
    };
  }

  if (summary.resultSource === "selection_transform") {
    return {
      kind: "selectionTransform",
      output,
      delivery: summary.deliveryEvidence,
      summary,
    };
  }

  return {
    kind: "dictation",
    transcript: output,
    delivery: summary.deliveryEvidence,
    summary,
  };
}

export function isAssistantHandledBySurface(result: PipelineUiResult): boolean {
  return result.kind === "assistant" && isAssistantSurfaceHandled(result.surface, result.delivery);
}

export function isAssistantSurfaceHandled(
  surface: AssistantSurface | undefined,
  delivery?: DeliveryEvidence,
): boolean {
  if (!surface || surface.kind === "none") {
    return false;
  }

  if (surface.kind === "insertText") {
    return delivery?.status !== "failed" && delivery?.status !== "uncertain";
  }

  if (surface.kind === "error") {
    return false;
  }

  return true;
}

export function shouldExposeTranscriptReview(result: PipelineUiResult): boolean {
  if (result.kind !== "assistant") {
    return result.kind === "dictation" || result.kind === "selectionTransform";
  }

  return !isAssistantHandledBySurface(result);
}

export function getDockResultSourceForPipelineUiResult(
  result: PipelineUiResult,
): "dictation" | "selection_transform" | "assistant" | undefined {
  if (isAssistantHandledBySurface(result)) {
    return "assistant";
  }

  if (result.kind === "selectionTransform") {
    return "selection_transform";
  }

  if (result.kind === "dictation") {
    return "dictation";
  }

  return undefined;
}

export function getCompanionSurfaceForPipelineUiResult(result: PipelineUiResult): AssistantSurface | undefined {
  if (result.kind !== "assistant") {
    return undefined;
  }

  switch (result.surface.kind) {
    case "quickChat":
    case "showMarkdown":
    case "optionPicker":
      return result.surface;
    default:
      return undefined;
  }
}
