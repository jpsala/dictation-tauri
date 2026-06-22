import type {
  FixtureTransformPresetId,
  SelectionTransformRequest,
  SelectionTransformResult,
} from "./types";
import { hasSelectedText } from "./context";

const supportedFixturePresets: readonly FixtureTransformPresetId[] = [
  "rewrite",
  "shorten",
  "bulletize",
];

export function runFixtureSelectionTransform(
  request: SelectionTransformRequest,
): SelectionTransformResult {
  if (request.mode !== "fixture" || request.allowProviderCall) {
    return failureResult(
      request,
      "Fixture selection transforms must run with allowProviderCall=false.",
    );
  }

  if (!hasSelectedText(request.selection)) {
    return {
      status: "skipped",
      action: "review_only",
      presetId: request.presetId,
      evidence: {
        selectionAvailable: false,
        source: request.selection.source,
        presetId: request.presetId,
        provider: "fixture",
        model: "deterministic-selection-transform",
        reason: "No selected text is available; direct dictation should be used.",
      },
      recoveryAction: {
        kind: "record_again",
        label: "Dictate normally",
        reason: "No selected text was available, so use direct dictation or select text first.",
        clipAvailable: false,
      },
    };
  }

  if (!isSupportedFixturePreset(request.presetId)) {
    return failureResult(request, `Unsupported selection transform preset: ${request.presetId}.`);
  }

  const input = request.selection.selectedText ?? "";
  const output = applyPreset(input, request.presetId);

  return {
    status: "ok",
    output,
    action: "replace_selection",
    presetId: request.presetId,
    evidence: {
      selectionAvailable: true,
      source: request.selection.source,
      presetId: request.presetId,
      provider: "fixture",
      model: "deterministic-selection-transform",
      reason: "Provider-free fixture transform.",
    },
  };
}

export function isSupportedFixturePreset(
  presetId: string,
): presetId is FixtureTransformPresetId {
  return supportedFixturePresets.includes(presetId as FixtureTransformPresetId);
}

function applyPreset(text: string, presetId: FixtureTransformPresetId): string {
  switch (presetId) {
    case "rewrite":
      return `Rewritten: ${text}`;
    case "shorten":
      return shortenText(text);
    case "bulletize":
      return text
        .split(/[.]\s+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => `- ${part.replace(/[.]$/, "")}`)
        .join("\n");
  }
}

function shortenText(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 8) {
    return text;
  }

  return `${words.slice(0, 8).join(" ")}…`;
}

function failureResult(
  request: SelectionTransformRequest,
  reason: string,
): SelectionTransformResult {
  return {
    status: "failed",
    action: "review_only",
    presetId: request.presetId,
    evidence: {
      selectionAvailable: hasSelectedText(request.selection),
      source: request.selection.source,
      presetId: request.presetId,
      provider: "fixture",
      model: "deterministic-selection-transform",
      reason,
    },
    recoveryAction: {
      kind: "copy_manually",
      label: "Review selected text",
      reason,
      clipAvailable: false,
    },
  };
}
