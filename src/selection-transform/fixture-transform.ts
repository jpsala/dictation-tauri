import type {
  FixtureTransformPresetId,
  SelectionTransformRequest,
  SelectionTransformResult,
} from "./types";
import { hasSelectedText } from "./context";

const supportedFixturePresets: readonly FixtureTransformPresetId[] = [
  "como-yo-es",
  "corregir-texto",
  "fix-writing",
  "like-me-en",
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
    case "como-yo-es":
      return text;
    case "corregir-texto":
      return correctSpanishFixtureText(text);
    case "fix-writing":
      return correctEnglishFixtureText(text);
    case "like-me-en":
      return text;
  }
}

function correctSpanishFixtureText(text: string): string {
  if (text.trim().toLowerCase() === "hola amigo") {
    return "Hola, amigo.";
  }

  return text;
}

function correctEnglishFixtureText(text: string): string {
  if (text.trim().toLowerCase() === "helo frend") {
    return "Hello friend.";
  }

  return text;
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
