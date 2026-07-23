import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FakeCaptureGateway } from "./capture/fake-gateway";
import type { CaptureGateway } from "./capture/gateway";
import { NativeTauriCaptureGateway } from "./capture/native-tauri-gateway";
import type { CaptureResult, CaptureState } from "./capture/types";
import {
  createAppSessionControllerFacade,
  createCaptureGatewayControllerAdapter,
  createHostRuntimeControllerAdapter,
  getAppSessionCaptureResult,
  getAppSessionSummary,
} from "./desktop-control/app-session";
import { DesktopDictationController, type DesktopRuntimeResult } from "./desktop-control/controller";
import type { DesktopRecoveryAction } from "./desktop-control";
import {
  captureTauriDesktopDeliveryTarget,
  createCopyDeliveryGateway,
  createTauriNativePasteObserver,
  createTauriSavedTargetDeliveryGateway,
  isTauriNativePasteObserverEnabled,
  type DeliveryEvidence as DesktopDeliveryEvidence,
  type DeliveryTargetAffinity,
  type TauriDesktopDeliveryTarget,
} from "./delivery";
import { createHostClientTranscriptionAdapter } from "./host-runtime/pipeline-adapter";
import {
  describeHostReadiness,
  describeHostReadinessFailure,
  type HostReadinessUiState,
} from "./host-runtime/readiness-ui";
import { createHostRuntimeClientRuntime } from "./host-runtime/runtime-selection";
import type { HostPostProcessPolicy, HostRuntimeClient } from "./host-runtime/types";
import {
  deriveRuntimeRecoveryAction,
  type RuntimeRecoveryAction,
} from "./model-gateway/runtime-transcription";
import { createCapturedAudioPipelineRequest } from "./pipeline/ports";
import { formatSafeRedactedRunSummary } from "./pipeline/runtime-telemetry";
import {
  drainTauriGlobalHotkeyEvents,
  getTauriActionHotkeyConfig,
  listenForTauriGlobalHotkey,
  listenForTauriHostCommands,
  setTauriGlobalHotkeyListenerReady,
  tauriGlobalHotkeyShortcut,
  type TauriGlobalHotkeyConfig,
  type TauriHostCommandPayload,
} from "./desktop-control/tauri-host-control";
import {
  createInitialDictationKeyState,
  dictationKeyDecisionToControlAction,
  markDictationKeyStarted,
  resetDictationKeyState,
  resolveDictationKeyEvent,
} from "./desktop-control/dictation-key";
import {
  hostSelectionCaptureCommand,
  hostSelectionCaptureForTargetCommand,
  hostSelectionCaptureForTargetWithClipboardCommand,
  isSelectionTransformPresetAvailable,
  latestResultFromPipelineSummary,
  listSelectionTransformPresets,
  routeSelectionCaptureOutcome,
  runFixtureSelectionTransform,
  selectionTransformInstructionForPreset,
  selectionTransformPresetDisplayName,
  selectionTransformPresetPickerKey,
  transformSelectedTextWithHost,
  type SelectionCaptureOutcome,
  type SelectionCaptureStatus,
  type SelectionContext,
} from "./selection-transform";
import { PipelineService } from "./pipeline/service";
import type {
  DeliveryEvidence as PipelineDeliveryEvidence,
  SimulatedRunSummary,
} from "./pipeline/types";
import {
  assistantSurfaceFromIntentResult,
  createPipelineUiResult,
  getCompanionSurfaceForPipelineUiResult,
  getDockResultSourceForPipelineUiResult,
  isAssistantHandledBySurface,
  shouldExposeTranscriptReview,
} from "./pipeline/ui-result";
import {
  createDockCompanionSnapshot,
  createDockCompanionSyncKey,
  createEmptyDockCompanionSnapshot,
  createVoiceDockState,
  dockCompanionCommandEvent,
  dockCompanionStateEvent,
  VoiceDock,
  type DockActivePreset,
  type DockCommand,
  type DockCompanionCommandPayload,
  type DockDragEvent,
  type DockCompanionPresetId,
  type DockCompanionSnapshot,
} from "./voice-dock";
import {
  createSoundCuePolicy,
  requestDictationSoundCue,
  type DictationSoundCue,
} from "./voice-dock/sound-cues";
import { runAssistantChatWithHost, type HostAssistantChatMessage } from "./assistant/managed-chat";
import { createAssistantQuickResponse, type AssistantQuickResponse } from "./assistant/quick-response";
import { parseAssistantVoicePrefix } from "./assistant/voice-prefix";
import { SettingsSurface } from "./settings/SettingsSurface";
import { OnboardingSurface } from "./onboarding/OnboardingSurface";
import { createAccountFirstFixtureController } from "./onboarding/account-first-flow";
import { SetupReadinessRouter } from "./onboarding/SetupReadinessRouter";
import {
  ensureTauriDictationReadiness,
  TauriAccountGate,
} from "./onboarding/tauri-account-gate";
import { loadSelectionPresetStore } from "./settings/preset-store-control";
import {
  createAutoStopSilencePolicy,
  createMuteOutputPolicy,
  defaultUserPreferences,
  getUserPreferences,
  userPreferencesChangedEvent,
  type UserPreferences,
} from "./settings/user-preferences-control";
import type {
  DesktopDictationSession,
  IdleDesktopDictationState,
} from "./desktop-control/types";

type CaptureUiState = {
  state: CaptureState;
  message: string;
  result?: CaptureResult;
};

type PipelineUiState = {
  status: "idle" | "running" | "done" | "error" | "cancelled";
  message: string;
  summary?: SimulatedRunSummary;
};

type TranscriptReview = {
  text: string;
  source: "dictation" | "selection_transform" | "assistant";
  provider?: string;
  model?: string;
  latencyMs?: number;
  requestId?: string;
};

type ResultHistoryEntry = {
  schemaVersion: 1;
  id: string;
  runId: string;
  source: "dictation" | "selection_transform" | "assistant";
  text: string;
  textLength: number;
  createdAt: string;
  deliveryEvidence?: {
    status: string;
    reason?: string;
  };
  provider?: string;
  model?: string;
};

type DockShellPosition = {
  x: number;
  y: number;
};

type CaptureGatewayRuntime = {
  gateway: CaptureGateway;
  label: string;
  readyMessage: string;
  permissionMessage: string;
  listeningMessage: string;
  stoppingMessage: string;
  capturedMessage: string;
};

type ResolvedTauriHostCommandPayload = Required<Pick<TauriHostCommandPayload, "command">> &
  Omit<TauriHostCommandPayload, "command">;

async function loadHostReadinessUi(
  client: HostRuntimeClient,
): Promise<HostReadinessUiState> {
  try {
    return describeHostReadiness(await client.getReadiness());
  } catch (error) {
    return describeHostReadinessFailure(error);
  }
}

function createCaptureGatewayRuntime(): CaptureGatewayRuntime {
  if (isTauri()) {
    return {
      gateway: new NativeTauriCaptureGateway(),
      label: "Native microphone",
      readyMessage: "Ready for a real microphone capture check.",
      permissionMessage: "Checking native microphone setup through Tauri.",
      listeningMessage: "Listening through the native microphone recorder.",
      stoppingMessage: "Writing the captured WAV artifact.",
      capturedMessage: "Captured WAV artifact is ready.",
    };
  }

  return {
    gateway: new FakeCaptureGateway(),
    label: "Fake capture",
    readyMessage: "Ready for a fake microphone capture check.",
    permissionMessage: "Checking capture permission without opening a real microphone.",
    listeningMessage: "Listening through the fake capture gateway.",
    stoppingMessage: "Finalizing the fake captured audio artifact.",
    capturedMessage: "Fake captured audio artifact is ready.",
  };
}

const pipelineStatusLabels: Record<PipelineUiState["status"], string> = {
  idle: "Not submitted",
  running: "Transcribing",
  done: "Transcript ready",
  error: "Setup needed",
  cancelled: "Cancelled",
};

export function applyCopiedFallback(
  summary: SimulatedRunSummary,
): SimulatedRunSummary {
  if (summary.deliveryEvidence?.status === "copied") {
    return summary;
  }

  const output = summary.deliveryEvidence?.output;
  if (!output) {
    return summary;
  }

  return applyDeliveryEvidenceFallback(summary, {
    status: "copied",
    output,
    strategy: "copy",
    message: "Transcript was copied; target insertion was not observed.",
    reason: "Transcript copied as fallback.",
  });
}

export function applyDeliveryEvidenceFallback(
  summary: SimulatedRunSummary,
  evidence: DesktopDeliveryEvidence,
): SimulatedRunSummary {
  const output =
    evidence.output ??
    summary.deliveryEvidence?.output ??
    summary.output ??
    summary.transcript;

  if (!output) {
    return summary;
  }

  return {
    ...summary,
    deliveryEvidence: {
      status: evidence.status,
      output,
      reason: evidence.reason ?? evidence.message,
    },
  };
}

export function applySafePasteLastRecovery(
  summary: SimulatedRunSummary,
): SimulatedRunSummary {
  const latestResult = latestResultFromPipelineSummary(summary);

  if (!latestResult) {
    return summary;
  }

  return applyDeliveryEvidenceFallback(summary, {
    status: "uncertain",
    output: latestResult.text,
    strategy: "paste_send",
    message:
      "Paste last was not sent in safe mode; transcript remains available for manual copy.",
    reason:
      "Paste last was not sent in safe mode; transcript remains available for manual copy.",
  });
}

export type AssistantRoutingTelemetry = {
  event: "assistant_routed";
  sessionId: string;
  parsedKind: "assistant" | "invalid-assistant";
  intentKind: string;
  quickResponseIntent?: AssistantQuickResponse["intent"];
  surfaceKind: string;
  deliveryStrategy: "paste_send" | "review_only";
  actionKind?: string;
  tool?: string;
  confirmation?: "required" | "none";
  promptLength: number;
  outputLength: number;
  managedAssistantUsed: boolean;
  redacted: true;
};

export function createAssistantRoutingTelemetry(input: {
  sessionId: string;
  parsed: ReturnType<typeof parseAssistantVoicePrefix>;
  assistantResponse?: AssistantQuickResponse;
  assistantSurface: SimulatedRunSummary["assistantSurface"];
  deliveryStrategy: "paste_send" | "review_only";
  output: string;
  managedAssistantText?: string;
}): AssistantRoutingTelemetry {
  const result = input.assistantResponse?.result;
  return {
    event: "assistant_routed",
    sessionId: input.sessionId,
    parsedKind: input.parsed.kind === "assistant" ? "assistant" : "invalid-assistant",
    intentKind: result?.kind ?? "parse-error",
    quickResponseIntent: input.assistantResponse?.intent,
    surfaceKind: input.assistantSurface?.kind ?? "none",
    deliveryStrategy: input.deliveryStrategy,
    actionKind: input.assistantResponse?.action?.kind,
    tool: result?.kind === "toolAction" ? result.tool : undefined,
    confirmation: result?.kind === "toolAction" ? result.confirmation : undefined,
    promptLength: input.parsed.kind === "assistant" ? input.parsed.prompt.length : 0,
    outputLength: input.output.length,
    managedAssistantUsed: Boolean(input.managedAssistantText?.trim()),
    redacted: true,
  };
}

export function logAssistantRoutingTelemetry(telemetry: AssistantRoutingTelemetry): void {
  console.info("[dictation-tauri][assistant] routed", JSON.stringify(telemetry));
}

export function applyAssistantVoicePrefixToRuntimeResult(input: {
  runtime: DesktopRuntimeResult;
  sessionId: string;
  activePreset?: DockActivePreset;
  availablePresets?: readonly { id: DockCompanionPresetId; name: string }[];
  managedAssistantText?: string;
}): DesktopRuntimeResult {
  const parsed = parseAssistantVoicePrefix(input.runtime.transcript);
  if (parsed.kind === "not-assistant") {
    return input.runtime;
  }

  const assistantResponse = parsed.kind === "assistant"
    ? createAssistantQuickResponse(parsed.prompt, {
        activePresetId: input.activePreset?.presetId ?? undefined,
        activePresetName: input.activePreset?.presetName,
        availablePresetNames: input.availablePresets?.map((preset) => preset.name),
        availablePresets: input.availablePresets,
        lastActivatedPresetId: input.activePreset?.presetId ?? undefined,
      })
    : undefined;
  const assistantUnavailableText =
    "Assistant managed chat is unavailable; configure Fixvox Cloud/managed assistant to answer this Lulu request.";
  const output = parsed.kind === "assistant"
    ? input.managedAssistantText?.trim() ||
      (assistantResponse?.intent === "assistant-chat" ? assistantUnavailableText : assistantResponse?.text) ||
      assistantUnavailableText
    : `Assistant parse error: ${parsed.reason}`;
  const assistantDeliveryStrategy = assistantResponse?.intent === "insert-answer" ? "paste_send" : "review_only";
  const assistantSurface = parsed.kind === "assistant"
    ? assistantSurfaceFromIntentResult(assistantResponse?.result, output)
    : { kind: "none" as const };
  logAssistantRoutingTelemetry(createAssistantRoutingTelemetry({
    sessionId: input.sessionId,
    parsed,
    assistantResponse,
    assistantSurface,
    deliveryStrategy: assistantDeliveryStrategy,
    output,
    managedAssistantText: input.managedAssistantText,
  }));

  const summary = isSimulatedRunSummary(input.runtime.summary)
    ? applyDeliveryEvidenceFallback(
        {
          ...input.runtime.summary,
          transcript: parsed.kind === "assistant" ? parsed.prompt : input.runtime.transcript,
          output,
          resultSource: "assistant",
          assistantSurface,
        },
        {
          status: "available",
          output,
          strategy: assistantDeliveryStrategy,
          message: assistantDeliveryStrategy === "paste_send"
            ? "Assistant-prefixed answer is ready for Fixvox-like paste delivery."
            : "Assistant-prefixed dictation was routed to assistant review instead of normal delivery.",
          reason: parsed.kind === "assistant"
            ? assistantDeliveryStrategy === "paste_send"
              ? "Assistant prefix detected; local answer will be pasted like Fixvox."
              : "Assistant prefix detected; normal dictation delivery skipped."
            : parsed.reason,
        },
      )
    : input.runtime.summary;

  return {
    ...input.runtime,
    transcript: parsed.kind === "assistant" ? parsed.prompt : input.runtime.transcript,
    output,
    assistantAction: assistantResponse?.action,
    assistantSurface,
    deliveryStrategy: assistantDeliveryStrategy,
    deliveryReason: parsed.kind === "assistant"
      ? assistantDeliveryStrategy === "paste_send"
        ? "Assistant prefix detected; local answer will be pasted like Fixvox."
        : "Assistant prefix detected; normal dictation delivery skipped."
      : parsed.reason,
    deliveryTargetAffinity: "current",
    summary,
  };
}

export function resolveDictationPostProcessPolicy(input: {
  selection?: SelectionContext;
  presetId?: DockCompanionPresetId;
}): HostPostProcessPolicy | undefined {
  return input.selection?.selectedText?.trim() || input.presetId
    ? { enabled: false, source: "exclusive-transform-route" }
    : undefined;
}

export function applySelectionTransformOutputToRuntimeResult(input: {
  runtime: DesktopRuntimeResult;
  output: string;
  reason?: string;
  deliveryStrategy?: "review_only" | "paste_send";
}): DesktopRuntimeResult {
  const output = input.output.trim();
  if (!output) {
    return input.runtime;
  }

  const deliveryStrategy = input.deliveryStrategy ?? "review_only";
  const deliveryReason = input.reason ?? (
    deliveryStrategy === "paste_send"
      ? "Selection transform will replace the captured selection."
      : "Selection transform is ready for review before automatic replace-selection."
  );
  const summary = isSimulatedRunSummary(input.runtime.summary)
    ? applyDeliveryEvidenceFallback(
        {
          ...input.runtime.summary,
          output,
          resultSource: "selection_transform",
        },
        {
          status: deliveryStrategy === "paste_send" ? "paste_sent" : "available",
          output,
          strategy: deliveryStrategy,
          message: deliveryStrategy === "paste_send"
            ? "Selection transform was sent to replace the selected text."
            : "Selection transform is ready for review and manual copy.",
          reason: deliveryReason,
        },
      )
    : input.runtime.summary;

  return {
    ...input.runtime,
    output,
    deliveryStrategy,
    deliveryReason,
    deliveryTargetAffinity: "saved",
    summary,
  };
}

export function applySelectionTransformFailureToRuntimeResult(input: {
  runtime: DesktopRuntimeResult;
  code?: string;
  reason?: string;
}): DesktopRuntimeResult {
  const text = (input.runtime.output ?? input.runtime.transcript).trim();
  if (!text) {
    return input.runtime;
  }

  const reason = input.reason ?? "Selection transform failed after transcription; transcript is available for review and manual copy.";
  const summary = isSimulatedRunSummary(input.runtime.summary)
    ? {
        ...input.runtime.summary,
        output: text,
        deliveryEvidence: {
          status: "available" as const,
          output: text,
          reason,
        },
        error: {
          phase: "selection_transform" as const,
          message: reason,
        },
        runtimeTelemetryStages: [
          ...(input.runtime.summary.runtimeTelemetryStages ?? []),
          {
            stage: "selection_transform" as const,
            status: "failed" as const,
            reason: input.code,
            redacted: true as const,
          },
        ],
      }
    : input.runtime.summary;

  return {
    ...input.runtime,
    output: text,
    deliveryStrategy: "review_only",
    deliveryReason: reason,
    deliveryTargetAffinity: "saved",
    summary,
  };
}

export function applySelectionTransformToRuntimeResult(input: {
  runtime: DesktopRuntimeResult;
  sessionId: string;
  selection?: SelectionContext;
  presetId?: DockCompanionPresetId;
}): DesktopRuntimeResult {
  if (!input.selection || !input.presetId) {
    return input.runtime;
  }

  const result = runFixtureSelectionTransform({
    requestId: `${input.sessionId}:selection-transform`,
    sessionId: input.sessionId,
    selection: input.selection,
    instructionTranscript: input.runtime.transcript,
    presetId: input.presetId,
    mode: "fixture",
    allowProviderCall: false,
  });

  if (result.status !== "ok" || !result.output) {
    return input.runtime;
  }

  return applySelectionTransformOutputToRuntimeResult({
    runtime: input.runtime,
    output: result.output,
    reason: "Selection transform used the active preset without automatic replace-selection.",
  });
}

function isSimulatedRunSummary(value: unknown): value is SimulatedRunSummary {
  return typeof value === "object" && value !== null && "terminalState" in value;
}

export function getRuntimeRecoveryAction(
  summary?: SimulatedRunSummary,
): RuntimeRecoveryAction | undefined {
  if (!summary) {
    return undefined;
  }

  const clipAvailable = Boolean(summary.capture?.artifact);
  const transcriptAvailable = Boolean(getTranscriptReview(summary));

  if (summary.terminalState === "cancelled") {
    return deriveRuntimeRecoveryAction({
      status: "cancelled",
      clipAvailable,
      transcriptAvailable,
    });
  }

  if (summary.terminalState === "done" && transcriptAvailable) {
    return deriveRuntimeRecoveryAction({
      status: "ok",
      clipAvailable,
      transcriptAvailable,
      deliveryStatus: summary.deliveryEvidence?.status,
    });
  }

  if (summary.terminalState === "error") {
    if (summary.error?.phase === "listening") {
      return {
        kind: "record_again",
        label: "Check microphone setup",
        reason: "Check microphone permission or device setup, then capture again.",
        clipAvailable: false,
      };
    }

    if (summary.error?.phase === "delivering" && transcriptAvailable) {
      return deriveRuntimeRecoveryAction({
        status: "ok",
        clipAvailable,
        transcriptAvailable,
        deliveryStatus: "failed",
      });
    }

    if (summary.error?.phase === "transcribing") {
      const failure = classifyTranscriptionFailure(summary.error.message);
      if (failure === "setup-error" && isAccountSetupFailure(summary.error.message)) {
        return accountSetupRecoveryAction(clipAvailable);
      }
      return deriveRuntimeRecoveryAction({
        status: failure,
        clipAvailable,
        transcriptAvailable,
      });
    }

    return {
      kind: clipAvailable ? "retry_transcription" : "record_again",
      label: clipAvailable ? "Retry captured run" : "Record again",
      reason: "Retry the captured run after resolving the reported setup issue.",
      clipAvailable,
    };
  }

  return undefined;
}

export function getRecoveryAction(
  summary?: SimulatedRunSummary,
): string | undefined {
  const action = getRuntimeRecoveryAction(summary);

  if (!action || action.kind === "none") {
    return undefined;
  }

  return `${action.label}: ${action.reason}`;
}

export function formatDesktopRecoveryAction(
  action?: DesktopRecoveryAction,
): string | undefined {
  if (!action || action.kind === "dismiss") {
    return undefined;
  }

  return `${action.label}: ${action.reason}`;
}

export function getReviewCopyLabel(
  summary?: SimulatedRunSummary,
): string {
  const latestResult = latestResultFromPipelineSummary(summary);
  return latestResult?.source === "selection_transform"
    ? "Copy transform"
    : latestResult?.source === "assistant"
      ? "Copy assistant reply"
      : "Copy transcript";
}

function describeLatestResultNoun(summary?: SimulatedRunSummary): string {
  const latestResult = latestResultFromPipelineSummary(summary);
  return latestResult?.source === "selection_transform"
    ? "transform"
    : latestResult?.source === "assistant"
      ? "assistant reply"
      : "transcript";
}

export function getTranscriptReview(
  summary?: SimulatedRunSummary,
): TranscriptReview | undefined {
  const latestResult = latestResultFromPipelineSummary(summary);
  const uiResult = createPipelineUiResult(summary);

  if (!summary || !latestResult || !shouldExposeTranscriptReview(uiResult)) {
    return undefined;
  }

  const transcriptionEvent = findTranscriptionCompletedEvent(summary);

  return {
    text: latestResult.text,
    source: latestResult.source,
    provider: transcriptionEvent?.data.stt?.provider,
    model: transcriptionEvent?.data.stt?.model,
    latencyMs: transcriptionEvent?.data.latencyMs,
    requestId: transcriptionEvent?.data.stt?.requestId,
  };
}

function createAssistantQuickChatSummary(input: {
  runId: string;
  prompt: string;
  output: string;
}): SimulatedRunSummary {
  return {
    runId: input.runId,
    fixtureId: "assistant-quick-chat",
    inputKind: "microphone",
    events: [],
    states: ["done"],
    terminalState: "done",
    transcript: input.prompt,
    output: input.output,
    resultSource: "assistant",
    assistantSurface: {
      kind: "quickChat",
      title: "Quick Chat",
      initialUserText: input.prompt,
      initialAssistantText: input.output,
    },
    deliveryEvidence: {
      status: "available",
      output: input.output,
      reason: "Quick Chat local reply; normal dictation delivery skipped.",
    },
    durationMs: 0,
  };
}

function createAssistantChatHistoryWindow(
  messages: readonly HostAssistantChatMessage[],
): HostAssistantChatMessage[] {
  return messages
    .map((message) => ({
      role: message.role,
      text: message.text.trim(),
    }))
    .filter((message) => message.text.length > 0)
    .slice(-8);
}

function createHistorySummary(entry: ResultHistoryEntry): SimulatedRunSummary {
  return {
    runId: entry.runId,
    fixtureId: "result-history",
    inputKind: "microphone",
    events: [],
    states: ["done"],
    terminalState: "done",
    transcript: entry.text,
    output: entry.text,
    deliveryEvidence: entry.deliveryEvidence
      ? {
          status: entry.deliveryEvidence.status as NonNullable<SimulatedRunSummary["deliveryEvidence"]>["status"],
          output: entry.text,
          reason: entry.deliveryEvidence.reason,
        }
      : undefined,
    durationMs: 0,
  };
}

function createHistoryEntryFromSummary(
  summary: SimulatedRunSummary | undefined,
): ResultHistoryEntry | undefined {
  const latestResult = latestResultFromPipelineSummary(summary);
  if (!summary || !latestResult) {
    return undefined;
  }

  const transcription = findTranscriptionCompletedEvent(summary);
  const deliveryEvidence = summary.deliveryEvidence?.status === "paste_observed"
    ? undefined
    : summary.deliveryEvidence;

  return {
    schemaVersion: 1,
    id: `${summary.runId}:${latestResult.source}`,
    runId: summary.runId,
    source: latestResult.source,
    text: latestResult.text,
    textLength: latestResult.text.length,
    createdAt: latestResult.createdAt ?? new Date().toISOString(),
    deliveryEvidence: deliveryEvidence
      ? {
          status: deliveryEvidence.status,
          reason: deliveryEvidence.reason,
        }
      : undefined,
    provider: transcription?.data.stt?.provider,
    model: transcription?.data.stt?.model,
  };
}

function normalizeDockPresetId(presetId: string | null | undefined): DockCompanionPresetId | undefined {
  return isSelectionTransformPresetAvailable(presetId) ? presetId : undefined;
}

export function resolvePresetPickerAction(
  selectedText: string | null | undefined,
  captureStatus?: SelectionCaptureStatus,
): "transform_selection" | "activate_dictation_preset" | "selection_capture_failed" {
  if (selectedText?.trim()) {
    return "transform_selection";
  }
  return captureStatus && captureStatus !== "no_selection"
    ? "selection_capture_failed"
    : "activate_dictation_preset";
}

function presetDisplayName(presetId: DockCompanionPresetId): string {
  return selectionTransformPresetDisplayName(presetId);
}

function presetPickerShortcut(presetId: DockCompanionPresetId): string {
  return selectionTransformPresetPickerKey(presetId);
}

function normalizePresetChordKey(value: string | null | undefined): string | undefined {
  const key = value?.trim();
  if (!key || key.length !== 1) {
    return undefined;
  }
  return key.toUpperCase();
}

function presetChordKeyCandidates(input: { pickerKey: string; hotkey?: string | null }): string[] {
  const keys = [normalizePresetChordKey(input.pickerKey)];
  const finalChord = input.hotkey?.split(",").at(-1);
  keys.push(normalizePresetChordKey(finalChord));
  return [...new Set(keys.filter((key): key is string => Boolean(key)))];
}

function formatPresetChordLabel(rootShortcut: string, chordKey: string): string {
  return `${rootShortcut} then ${chordKey}`;
}

function resolvePresetPickerChord(chordKey: string | null | undefined): DockCompanionPresetId | undefined {
  const normalized = normalizePresetChordKey(chordKey);
  if (!normalized) {
    return undefined;
  }

  return listSelectionTransformPresets().find((preset) => {
    const pickerKey = presetPickerShortcut(preset.id);
    return presetChordKeyCandidates({ pickerKey, hotkey: preset.hotkey }).some(
      (key) => key === normalized,
    );
  })?.id;
}

function accountSetupRecoveryAction(clipAvailable = false): DesktopRecoveryAction & RuntimeRecoveryAction {
  return {
    kind: "inspect_setup",
    label: "Completar configuración",
    reason: "Conectá tu cuenta antes de volver a dictar.",
    clipAvailable,
  };
}

function isAccountSetupFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("registered device") || normalized.includes("device id");
}

function classifyTranscriptionFailure(
  message: string,
): "setup-error" | "provider-error" | "empty" | "unusable" {
  const normalized = message.toLowerCase();

  if (normalized.includes("no usable text") || normalized.includes("empty")) {
    return "empty";
  }

  if (normalized.includes("non-speech") || normalized.includes("unusable")) {
    return "unusable";
  }

  if (
    normalized.includes("setup") ||
    normalized.includes("not configured") ||
    normalized.includes("missing") ||
    normalized.includes("unavailable") ||
    normalized.includes("registered device") ||
    normalized.includes("device id")
  ) {
    return "setup-error";
  }

  return "provider-error";
}

function findTranscriptionCompletedEvent(summary: SimulatedRunSummary) {
  for (let index = summary.events.length - 1; index >= 0; index -= 1) {
    const event = summary.events[index];

    if (event.type === "transcription_completed") {
      return event;
    }
  }

  return undefined;
}

function describeTranscriptReviewTitle(review: TranscriptReview): string {
  return review.source === "selection_transform"
    ? "Selection transform review"
    : review.source === "assistant"
      ? "Assistant review"
      : "Transcript review";
}

function describeLatestResultRecovery(review: TranscriptReview): string {
  return review.source === "selection_transform"
    ? "Transform result is recoverable in this session. It is review-only for now; copy manually before replacing selected text."
    : review.source === "assistant"
      ? "Assistant-prefixed dictation is review-only for now; normal text delivery was skipped."
      : "Latest transcript is recoverable in this session. Paste-last safe mode does not send keys or observe insertion.";
}

export function describeDeveloperDeliveryStatus(
  evidence: PipelineDeliveryEvidence | undefined,
): string {
  switch (evidence?.status) {
    case "available":
      return "review_only / available (not inserted)";
    case "copied":
      return "copied (clipboard fallback, not inserted)";
    case "uncertain":
      return "uncertain (verify target)";
    case "paste_sent":
      return "paste_sent (sent, not observer-verified)";
    case "paste_observed":
      return "paste_observed (verified by observer)";
    case "failed":
      return "failed (not inserted)";
    default:
      return "Not available";
  }
}

function describeDeliveryEvidence(
  evidence: PipelineDeliveryEvidence | undefined,
): string | undefined {
  switch (evidence?.status) {
    case "available":
      return evidence.reason?.includes("Selection transform failed")
        ? evidence.reason
        : "Review-only result is available locally. Nothing was inserted; review or copy manually.";
    case "copied":
      return evidence.reason ?? "Transcript copied as fallback; target insertion was not observed.";
    case "uncertain":
      return "Delivery is uncertain. Verify the target; if text is missing, copy or use safe paste-last.";
    case "paste_sent":
      return "Paste command was sent, but target insertion was not observer-verified. Verify the target before retrying.";
    case "paste_observed":
      return "Paste insertion was observed by a verified desktop observer.";
    case "failed":
      return "Delivery failed before a confirmed handoff. Check the editable target, then copy or retry.";
    default:
      return undefined;
  }
}

function createDockInputFromUi(input: {
  capture: CaptureUiState;
  pipelineUi: PipelineUiState;
  deliveryEvidence?: PipelineDeliveryEvidence;
  transcriptReview?: TranscriptReview;
  recoveryAction?: DesktopRecoveryAction;
}): DesktopDictationSession | IdleDesktopDictationState {
  const sessionBase = {
    sessionId: input.pipelineUi.summary?.runId ?? "dock-ui-session",
    controlSource: "app_button" as const,
  };

  if (input.pipelineUi.status === "running") {
    return { ...sessionBase, state: "transcribing" };
  }

  if (input.pipelineUi.status === "done") {
    const uiResult = createPipelineUiResult(input.pipelineUi.summary);

    if (isAssistantHandledBySurface(uiResult)) {
      return { ...sessionBase, state: "idle" };
    }

    return {
      ...sessionBase,
      state:
        input.deliveryEvidence?.status === "failed" && !input.transcriptReview?.text
          ? "done"
          : "reviewing",
      delivery: mapPipelineEvidenceToDesktopEvidence(
        input.deliveryEvidence,
        input.transcriptReview?.text,
      ),
    };
  }

  if (input.pipelineUi.status === "error") {
    return {
      ...sessionBase,
      state: "error",
      error: { message: input.pipelineUi.message, code: "pipeline-error" },
      recoveryAction: input.recoveryAction,
      delivery: mapPipelineEvidenceToDesktopEvidence(
        input.deliveryEvidence,
        input.transcriptReview?.text,
      ),
    };
  }

  if (input.pipelineUi.status === "cancelled") {
    return { ...sessionBase, state: "cancelled" };
  }

  switch (input.capture.state) {
    case "requesting_permission":
      return { ...sessionBase, state: "arming" };
    case "recording":
      return { ...sessionBase, state: "listening" };
    case "stopping":
      return { ...sessionBase, state: "stopping" };
    case "failed":
    case "permission_needed":
      return {
        ...sessionBase,
        state: "error",
        error: { message: input.capture.message, code: input.capture.state },
        recoveryAction: input.recoveryAction,
      };
    case "cancelled":
      return { ...sessionBase, state: "cancelled" };
    case "captured":
      return { ...sessionBase, state: "postprocessing" };
    case "idle":
      return { state: "idle" };
  }
}

export function mapPipelineEvidenceToDesktopEvidence(
  evidence: PipelineDeliveryEvidence | undefined,
  fallbackOutput: string | undefined,
): DesktopDeliveryEvidence | undefined {
  if (!evidence) {
    return fallbackOutput
      ? {
          status: "available",
          output: fallbackOutput,
          strategy: "review_only",
          message: "Transcript is available locally. Delivery has not been observed.",
        }
      : undefined;
  }

  const output = evidence.output ?? fallbackOutput;
  const status = evidence.status;

  return {
    status,
    output,
    strategy:
      status === "copied"
        ? "copy"
        : status === "paste_sent" || status === "paste_observed"
          ? "paste_send"
          : "review_only",
    message:
      status === "available" && output
        ? "Transcript is available locally. Delivery has not been observed."
        : describeDeliveryEvidence(evidence) ??
          evidence.reason ??
          "Delivery evidence is available.",
    reason: status === evidence.status ? evidence.reason : undefined,
  };
}

function createDockVuBands(
  captureState: CaptureState,
  pipelineStatus: PipelineUiState["status"],
  liveBands: number[],
): number[] {
  if (captureState === "recording") {
    return liveBands;
  }

  if (captureState === "requesting_permission" || pipelineStatus === "running") {
    return [0.22, 0.36, 0.5, 0.64, 0.5, 0.36, 0.22];
  }

  return [0, 0, 0, 0, 0, 0, 0];
}

type CaptureLevelGateway = CaptureGateway & {
  getCaptureLevel?: () => Promise<{
    active: boolean;
    vuLevel: number;
    vuBands: number[];
  }>;
};

async function getGatewayCaptureLevel(gateway: CaptureGateway) {
  const getCaptureLevel = (gateway as CaptureLevelGateway).getCaptureLevel;
  if (!getCaptureLevel) {
    return undefined;
  }

  try {
    const level = await getCaptureLevel.call(gateway);
    return level.active ? level : undefined;
  } catch {
    return undefined;
  }
}

function createSyntheticDockVu(tick: number) {
  const bands = Array.from({ length: 7 }, (_, index) => {
    const wave = Math.sin((tick + index * 1.7) / 2.6);
    return Math.max(0.08, Math.min(0.88, 0.35 + wave * 0.3));
  });
  const level = bands.reduce((sum, band) => sum + band, 0) / bands.length;

  return { level, bands };
}

function getAppSurface(): "dock" | "companion" | "preset-picker" | "settings" | "onboarding" {
  if (typeof window === "undefined") {
    return "dock";
  }

  const surface = new URLSearchParams(window.location.search).get("surface");
  if (surface === "companion" || surface === "preset-picker" || surface === "settings" || surface === "onboarding") {
    return surface;
  }

  return window.location.hash === "#settings" ? "settings" : "dock";
}

function exitOnboarding() {
  if (isTauri()) {
    void getCurrentWindow().close();
    return;
  }
  window.close();
}

type CompanionSurfaceViewProps = {
  snapshot: DockCompanionSnapshot;
  onCommand?: (payload: DockCompanionCommandPayload) => void;
  showRecoveryActions?: boolean;
  showChromeClose?: boolean;
};

function companionActionLabel(command: DockCommand): string {
  switch (command) {
    case "copy":
      return "Copy transcript";
    case "paste_last_safe":
      return "Paste last (safe)";
    case "retry":
      return "Record again";
    case "start":
      return "Start";
    case "stop":
      return "Stop";
    case "stop_submit":
      return "Stop & submit";
    case "cancel":
      return "Cancel";
    case "clear_preset":
      return "Disable preset";
  }
}

function companionCommandForDockCommand(
  command: DockCommand,
): DockCompanionCommandPayload | undefined {
  if (
    command === "copy" ||
    command === "paste_last_safe" ||
    command === "retry" ||
    command === "clear_preset"
  ) {
    return { source: "dock_companion", command };
  }

  return undefined;
}

function CompanionCommandButton({
  payload,
  children,
  onCommand,
  className = "secondary-button",
  ariaLabel,
}: {
  payload: DockCompanionCommandPayload;
  children: ReactNode;
  onCommand?: (payload: DockCompanionCommandPayload) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      data-command={payload.command}
      data-entry-id={"entryId" in payload ? payload.entryId : undefined}
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={() => onCommand?.(payload)}
    >
      {children}
    </button>
  );
}

export function CompanionSurfaceView({
  snapshot,
  onCommand,
  showRecoveryActions = true,
  showChromeClose = true,
}: CompanionSurfaceViewProps) {
  const recoveryActions = (showRecoveryActions ? [
    snapshot.recovery?.primaryAction,
    snapshot.recovery?.secondaryAction,
  ] : [])
    .map((command) => {
      const payload = command ? companionCommandForDockCommand(command) : undefined;
      return payload && command
        ? { payload, label: companionActionLabel(command) }
        : undefined;
    })
    .filter(
      (action): action is { payload: DockCompanionCommandPayload; label: string } =>
        Boolean(action),
    );
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerIndex, setPickerIndex] = useState(0);
  const [pickerPresetVersion, setPickerPresetVersion] = useState(0);
  const [presetPickerHotkeyLabel, setPresetPickerHotkeyLabel] = useState("Alt+Q");
  const [assistantDraft, setAssistantDraft] = useState("");
  const pickerInputRef = useRef<HTMLInputElement>(null);
  const pickerPresets = useMemo(
    () => listSelectionTransformPresets().map((preset) => {
      const pickerKey = presetPickerShortcut(preset.id);
      const chordKeys = presetChordKeyCandidates({ pickerKey, hotkey: preset.hotkey });
      const primaryChordKey = chordKeys[0] ?? pickerKey;
      return {
        presetId: preset.id,
        name: presetDisplayName(preset.id),
        pickerKey,
        chordKeys,
        hotkey: formatPresetChordLabel(presetPickerHotkeyLabel, primaryChordKey),
      };
    }),
    [pickerPresetVersion, presetPickerHotkeyLabel],
  );
  const pickerMode = snapshot.settings.presetPickerMode ?? "dictation";
  const filteredPickerPresets = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    return query
      ? pickerPresets.filter((preset) => [
        preset.name,
        preset.presetId,
        preset.pickerKey,
        preset.hotkey,
        ...preset.chordKeys,
      ].some((value) => value.toLowerCase().includes(query)))
      : pickerPresets;
  }, [pickerPresets, pickerQuery]);

  useEffect(() => {
    if (!snapshot.settings.open) {
      recordPresetPickerDebug({ open: false, lastAction: "closed" });
      return;
    }
    void loadSelectionPresetStore().then(() => setPickerPresetVersion((version) => version + 1));
    void getTauriActionHotkeyConfig()
      .then((config) => setPresetPickerHotkeyLabel(config?.presetPicker || "Alt+Q"))
      .catch(() => setPresetPickerHotkeyLabel("Alt+Q"));
    setPickerQuery("");
    setPickerIndex(0);
    recordPresetPickerDebug({ open: true, lastAction: "opened" });
    requestAnimationFrame(() => {
      pickerInputRef.current?.focus();
      pickerInputRef.current?.select();
      recordPresetPickerDebug({ inputFocused: document.activeElement === pickerInputRef.current });
    });
  }, [snapshot.settings.open]);

  useEffect(() => {
    if (pickerIndex >= filteredPickerPresets.length) {
      setPickerIndex(Math.max(0, filteredPickerPresets.length - 1));
    }
  }, [filteredPickerPresets.length, pickerIndex]);

  const recordPresetPickerDebug = (patch: Record<string, unknown>) => {
    const previous = ((window as unknown as { __dictationPresetPickerDebug?: Record<string, unknown> })
      .__dictationPresetPickerDebug) ?? {};
    (window as unknown as { __dictationPresetPickerDebug: Record<string, unknown> })
      .__dictationPresetPickerDebug = {
        ...previous,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
  };

  const executePickerPreset = (presetId: DockCompanionPresetId) => {
    const presetName = presetDisplayName(presetId);
    recordPresetPickerDebug({
      lastAction: "execute",
      lastExecutedPresetId: presetId,
      lastExecutedPresetName: presetName,
      query: pickerQuery,
      selectedIndex: pickerIndex,
    });
    console.info("[dictation-tauri][preset-picker] execute", {
      presetId,
      presetName,
      queryLength: pickerQuery.length,
      selectedIndex: pickerIndex,
    });
    onCommand?.({ source: "dock_companion", command: "select_preset", presetId });
  };

  useEffect(() => {
    if (!snapshot.settings.open) {
      return;
    }
    const selectedPreset = filteredPickerPresets[pickerIndex];
    recordPresetPickerDebug({
      open: true,
      query: pickerQuery,
      selectedIndex: pickerIndex,
      selectedPresetId: selectedPreset?.presetId ?? null,
      selectedPresetName: selectedPreset?.name ?? null,
      filteredCount: filteredPickerPresets.length,
      inputFocused: document.activeElement === pickerInputRef.current,
    });
  }, [filteredPickerPresets, pickerIndex, pickerQuery, snapshot.settings.open]);

  useEffect(() => {
    if (!snapshot.settings.open) {
      return;
    }

    const handlePickerKeydown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      recordPresetPickerDebug({
        lastAction: "keydown",
        lastKey: event.key,
        query: pickerQuery,
        selectedIndex: pickerIndex,
        inputFocused: document.activeElement === pickerInputRef.current,
      });

      if (event.key === "Escape") {
        event.preventDefault();
        onCommand?.({ source: "dock_companion", command: "close_companion" });
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setPickerIndex((index) => Math.min(index + 1, filteredPickerPresets.length - 1));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setPickerIndex((index) => Math.max(index - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const preset = filteredPickerPresets[pickerIndex];
        if (preset) {
          executePickerPreset(preset.presetId);
        }
        return;
      }

      if (event.key.length === 1 && pickerQuery.trim() === "") {
        const preset = filteredPickerPresets.find(
          (candidate) => candidate.chordKeys.some((key) => key.toLowerCase() === event.key.toLowerCase()),
        );
        if (preset) {
          event.preventDefault();
          executePickerPreset(preset.presetId);
          return;
        }
      }

      if (event.key.length === 1 && document.activeElement !== pickerInputRef.current) {
        event.preventDefault();
        setPickerQuery((query) => `${query}${event.key}`);
        setPickerIndex(0);
        pickerInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handlePickerKeydown);
    return () => window.removeEventListener("keydown", handlePickerKeydown);
  }, [filteredPickerPresets, onCommand, pickerIndex, snapshot.settings.open]);

  const closeButton = showChromeClose ? (
    <CompanionCommandButton
      payload={{ source: "dock_companion", command: "close_companion" }}
      onCommand={onCommand}
      className="dock-companion-close-button"
      ariaLabel="Close companion"
    >
      ×
    </CompanionCommandButton>
  ) : null;
  const assistantSurface = snapshot.assistant.surface;
  const assistantTitle = assistantSurface?.kind === "quickChat" ||
    assistantSurface?.kind === "showMarkdown" ||
    assistantSurface?.kind === "optionPicker"
      ? assistantSurface.title
      : "Assistant reply";
  const assistantBody = assistantSurface?.kind === "showMarkdown"
    ? assistantSurface.markdown ?? snapshot.assistant.message ?? "Lulu markdown is available."
    : assistantSurface?.kind === "optionPicker"
      ? assistantSurface.prompt
      : assistantSurface?.kind === "quickChat"
        ? assistantSurface.initialAssistantText ?? snapshot.assistant.message ?? "Quick Chat is ready."
        : snapshot.assistant.message ?? "Lulu result is available.";

  return (
    <>
      {snapshot.recovery ? (
        <section className="dock-companion-card dock-companion-card--standalone">
          <div className="dock-companion-title-row">
            <p className="dock-companion-kicker">Recovery</p>
            {closeButton}
          </div>
          <strong>{snapshot.recovery.title}</strong>
          <p>{snapshot.recovery.message}</p>
          <div className="dock-companion-actions" aria-label="Recovery actions">
            {recoveryActions.map((action) => (
              <CompanionCommandButton
                key={action.payload.command}
                payload={action.payload}
                onCommand={onCommand}
              >
                {action.label}
              </CompanionCommandButton>
            ))}
          </div>
        </section>
      ) : null}

      {snapshot.history.open ? (
        <section className="dock-companion-card dock-companion-card--standalone">
          <div className="dock-companion-title-row">
            <p className="dock-companion-kicker">Result history</p>
            <div className="dock-companion-title-actions">
              {snapshot.history.items.length > 0 ? (
                <CompanionCommandButton
                  payload={{ source: "dock_companion", command: "clear_result_history" }}
                  onCommand={onCommand}
                  className="secondary-button"
                  ariaLabel="Clear result history"
                >
                  Clear history
                </CompanionCommandButton>
              ) : null}
              {closeButton}
            </div>
          </div>
          {snapshot.history.items.length === 0 ? (
            <p>No reusable results saved yet.</p>
          ) : (
            <div className="dock-companion-history-list" aria-label="Reusable result history">
              {snapshot.history.items.map((entry) => (
                <CompanionCommandButton
                  key={entry.id}
                  payload={{
                    source: "dock_companion",
                    command: "select_history_entry",
                    entryId: entry.id,
                  }}
                  onCommand={onCommand}
                  className="dock-companion-history-item"
                  ariaLabel={`Paste history result: ${entry.hoverPreview}`}
                >
                  <span className="dock-companion-history-preview">
                    {entry.textPreview}
                  </span>
                  <span className="dock-companion-history-meta">
                    {`${entry.label} · ${entry.textLength} chars · ${entry.deliveryStatus}`}
                  </span>
                  <span className="dock-companion-history-hover" aria-hidden="true">
                    {entry.hoverPreview}
                  </span>
                </CompanionCommandButton>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {snapshot.settings.open ? (
        <section
          className="dock-companion-card dock-companion-card--standalone dock-preset-picker"
          data-testid="preset-picker"
          data-query={pickerQuery}
          data-selected-index={pickerIndex}
          data-filtered-count={filteredPickerPresets.length}
          data-mode={pickerMode}
        >
          <div className="dock-companion-title-row">
            <div className="dock-preset-picker-heading">
              <strong>Presets</strong>
              <span>
                {pickerMode === "selection"
                  ? "Apply a preset to the selected text."
                  : "Set a persistent preset for future dictation."}
              </span>
            </div>
            {closeButton}
          </div>
          <label className="dock-preset-picker-search" htmlFor="dock-preset-picker-search">
            <span aria-hidden="true">⌕</span>
            <input
              id="dock-preset-picker-search"
              ref={pickerInputRef}
              autoFocus
              value={pickerQuery}
              onChange={(event) => {
                setPickerQuery(event.currentTarget.value);
                setPickerIndex(0);
              }}
              placeholder="Search presets…"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="dock-preset-picker-list" role="listbox" aria-label="Preset picker results">
            {filteredPickerPresets.length === 0 ? (
              <div className="dock-preset-picker-empty">No presets found</div>
            ) : filteredPickerPresets.map((preset, index) => {
              const isActive = pickerMode === "dictation" &&
                preset.presetId === snapshot.settings.activePreset?.presetId;
              return (
                <button
                  key={preset.presetId}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={[
                    "dock-preset-picker-item",
                    index === pickerIndex ? "selected" : "",
                    isActive ? "active" : "",
                  ].filter(Boolean).join(" ")}
                  onMouseEnter={() => setPickerIndex(index)}
                  onClick={() => executePickerPreset(preset.presetId)}
                  title={preset.hotkey}
                >
                  <span className="dock-preset-picker-item-label">
                    <span>{preset.name}</span>
                    {isActive ? <small>Active</small> : null}
                  </span>
                  <kbd>{preset.chordKeys[0] ?? preset.pickerKey}</kbd>
                </button>
              );
            })}
          </div>
          <div className="dock-preset-picker-footer">
            <span><kbd>↑↓</kbd><kbd>↵</kbd> navigate &amp; select</span>
            <span><kbd>Esc</kbd> close</span>
          </div>
        </section>
      ) : null}

      {snapshot.assistant.open ? (
        <section className="dock-companion-card dock-companion-card--standalone dock-companion-assistant-card" data-testid={snapshot.assistant.surface?.kind === "quickChat" ? "assistant-quick-chat-card" : "assistant-surface-card"}>
          <div className="dock-companion-title-row">
            <p className="dock-companion-kicker">
              {snapshot.assistant.surface?.kind === "quickChat" ? "Quick Chat" : "Lulu"}
            </p>
            <CompanionCommandButton
              payload={{ source: "dock_companion", command: "dismiss_assistant" }}
              onCommand={onCommand}
              className="dock-companion-icon-button"
              ariaLabel="Dismiss assistant reply"
            >
              ×
            </CompanionCommandButton>
          </div>
          <strong>{assistantTitle}</strong>
          <p>{assistantBody}</p>
          {snapshot.assistant.surface?.kind === "optionPicker" ? (
            <div className="dock-preset-picker-list" role="listbox" aria-label={snapshot.assistant.surface.title}>
              {snapshot.assistant.surface.options.map((option) => {
                const presetId = isSelectionTransformPresetAvailable(option.id) ? option.id : undefined;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className="dock-preset-picker-item"
                    disabled={!presetId}
                    title={option.description ?? (presetId ? "Run preset option" : "This assistant option is not wired yet")}
                    onClick={presetId
                      ? () => onCommand?.({ source: "dock_companion", command: "select_preset", presetId })
                      : undefined}
                  >
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {snapshot.assistant.surface?.kind === "quickChat" ? (
            <>
              <form
                className="dock-companion-assistant-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const message = assistantDraft.trim();
                  if (!message) {
                    return;
                  }
                  onCommand?.({ source: "dock_companion", command: "send_assistant_message", message });
                  setAssistantDraft("");
                }}
              >
                <input
                  aria-label="Quick Chat message"
                  value={assistantDraft}
                  onChange={(event) => setAssistantDraft(event.currentTarget.value)}
                  placeholder="Ask Lulu…"
                />
                <button type="submit" className="button button-secondary">Send</button>
              </form>
              {snapshot.assistant.messages.length > 1 ? (
                <div className="dock-companion-history-list" aria-label="Assistant quick chat history">
                  {snapshot.assistant.messages.map((message) => (
                    <div key={message.id} className="dock-companion-history-item" title={message.hoverPreview}>
                      <span className="dock-companion-history-preview">{message.textPreview}</span>
                      <span className="dock-companion-history-meta">assistant · {message.textLength} chars</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {!snapshot.recovery && !snapshot.history.open && !snapshot.settings.open && !snapshot.assistant.open ? (
        <section className="dock-companion-card dock-companion-card--standalone">
          <div className="dock-companion-title-row">
            <p className="dock-companion-kicker">Companion</p>
            {closeButton}
          </div>
          <strong>{snapshot.status.statusText}</strong>
          <p>
            {snapshot.status.statusDetail ??
              "Waiting for recovery, history, or settings from the dock."}
          </p>
        </section>
      ) : null}
    </>
  );
}

const dockCompanionSnapshotStorageKey = "dictation-dock-companion-snapshot.v1";
const dockCompanionCommandStorageKey = "dictation-dock-companion-command.v1";

function readStoredDockCompanionSnapshot(): DockCompanionSnapshot | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(dockCompanionSnapshotStorageKey);
    return raw ? JSON.parse(raw) as DockCompanionSnapshot : undefined;
  } catch {
    return undefined;
  }
}

function readStoredActivePreset(): DockActivePreset | undefined {
  const storedPreset = readStoredDockCompanionSnapshot()?.settings.activePreset;
  const presetId = storedPreset?.presetId?.trim();
  return presetId
    ? {
        presetId,
        presetName: storedPreset?.presetName?.trim() || presetId,
        appKey: "global",
      }
    : undefined;
}

function storeDockCompanionSnapshot(snapshot: DockCompanionSnapshot): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(dockCompanionSnapshotStorageKey, JSON.stringify(snapshot));
  } catch {
    // Snapshot persistence is best-effort; Tauri events remain the live channel.
  }
}

function storeActivePreset(activePreset: DockActivePreset | undefined): void {
  const snapshot = readStoredDockCompanionSnapshot() ?? createEmptyDockCompanionSnapshot();
  storeDockCompanionSnapshot({
    ...snapshot,
    settings: {
      ...snapshot.settings,
      activePreset,
    },
  });
}

function createPresetPickerSnapshot(): DockCompanionSnapshot {
  return createEmptyDockCompanionSnapshot();
}

function dispatchDockCompanionCommand(payload: DockCompanionCommandPayload): void {
  if (!isTauri()) {
    return;
  }

  try {
    window.localStorage.setItem(
      dockCompanionCommandStorageKey,
      JSON.stringify({ id: `${Date.now()}-${Math.random()}`, payload }),
    );
  } catch {
    // Best-effort fallback bridge; Tauri events remain the primary route.
  }

  void emitTo("main", dockCompanionCommandEvent, payload)
    .catch(() => emit(dockCompanionCommandEvent, payload).catch(() => undefined));
}

function CompanionSurface({ surface }: { surface: "companion" | "preset-picker" }) {
  const [snapshot, setSnapshot] = useState<DockCompanionSnapshot>(() =>
    surface === "preset-picker"
      ? createPresetPickerSnapshot()
      : readStoredDockCompanionSnapshot() ?? createEmptyDockCompanionSnapshot(),
  );

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<DockCompanionSnapshot>(dockCompanionStateEvent, (event) => {
      if (disposed) {
        return;
      }
      if (surface === "preset-picker" && !event.payload.settings.open) {
        return;
      }
      setSnapshot(event.payload);
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten?.();
        return;
      }

      unlisten = nextUnlisten;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [surface]);

  useEffect(() => {
    if (surface !== "preset-picker") {
      return;
    }

    const refreshPickerSnapshot = () => {
      const stored = readStoredDockCompanionSnapshot();
      if (stored?.settings.open) {
        setSnapshot(stored);
      }
    };
    refreshPickerSnapshot();
    window.addEventListener("focus", refreshPickerSnapshot);
    return () => window.removeEventListener("focus", refreshPickerSnapshot);
  }, [surface]);

  return (
    <main className="companion-shell" aria-label="Dock companion">
      <CompanionSurfaceView
        snapshot={snapshot}
        onCommand={dispatchDockCompanionCommand}
        showChromeClose={false}
      />
    </main>
  );
}

export function DockSurface() {
  const captureRuntime = useMemo(() => createCaptureGatewayRuntime(), []);
  const hostRuntime = useMemo(
    () =>
      createHostRuntimeClientRuntime({
        isTauriRuntime: isTauri(),
        invokeImpl: invoke,
      }),
    [],
  );
  const gateway = captureRuntime.gateway;
  const savedDeliveryTargetRef = useRef<TauriDesktopDeliveryTarget | undefined>(undefined);
  const stopDeliveryTargetRef = useRef<TauriDesktopDeliveryTarget | undefined>(undefined);
  const activePresetRef = useRef<DockActivePreset | undefined>(readStoredActivePreset());
  const selectionContextRef = useRef<SelectionContext | undefined>(undefined);
  const presetPickerSelectionCaptureStatusRef = useRef<SelectionCaptureStatus | undefined>(undefined);
  const dockDragRef = useRef<{
    startScreenX: number;
    startScreenY: number;
    startWindowX: number;
    startWindowY: number;
    scale: number;
  } | undefined>(undefined);
  const userPreferencesRef = useRef<UserPreferences>(defaultUserPreferences);
  const assistantChatHistoryRef = useRef<HostAssistantChatMessage[]>([]);
  const autoStopSilencePolicyRef = useRef(createAutoStopSilencePolicy(defaultUserPreferences));
  const muteOutputPolicyRef = useRef(createMuteOutputPolicy(defaultUserPreferences));
  const soundCuePolicyRef = useRef(createSoundCuePolicy(defaultUserPreferences));
  const forcePressEnterAfterPasteRef = useRef(false);
  const nativePasteObserver = useMemo(
    () =>
      isTauri() && isTauriNativePasteObserverEnabled()
        ? createTauriNativePasteObserver({ invoke })
        : undefined,
    [],
  );
  const desktopDelivery = useMemo(
    () =>
      isTauri()
        ? createTauriSavedTargetDeliveryGateway({
            invoke,
            getTarget: () => savedDeliveryTargetRef.current,
            getStopTarget: () => stopDeliveryTargetRef.current,
            getFollowFocusUntilDelivery: () => userPreferencesRef.current.followFocusUntilDelivery,
            getPressEnterAfterPaste: () =>
              userPreferencesRef.current.pressEnterAfterPaste ||
              forcePressEnterAfterPasteRef.current,
            observer: nativePasteObserver,
          })
        : undefined,
    [nativePasteObserver],
  );
  const desktopSession = useMemo(() => {
    const baseRuntime = createHostRuntimeControllerAdapter(
      hostRuntime.client,
      isTauri()
        ? {
            mode: "real",
            allowProviderCall: true,
          }
        : undefined,
    );
    const controller = new DesktopDictationController({
      capture: createCaptureGatewayControllerAdapter(gateway),
      runtime: {
        async transcribe(input) {
            await loadSelectionPresetStore().catch(() => undefined);
            const storedPresetId = activePresetRef.current?.presetId;
            const activePresetId = normalizeDockPresetId(storedPresetId);
            if (activePresetId) {
              selectActivePreset(activePresetId);
            } else if (storedPresetId) {
              clearActivePreset();
            }
            const postProcess = resolveDictationPostProcessPolicy({
              selection: selectionContextRef.current,
              presetId: activePresetId,
            });
            const runtimeForRoute = postProcess
              ? createHostRuntimeControllerAdapter(hostRuntime.client, {
                  mode: "real",
                  allowProviderCall: true,
                  postProcess,
                })
              : baseRuntime;
            const base = await runtimeForRoute.transcribe(input);
            const parsedAssistant = parseAssistantVoicePrefix(base.transcript);
            const availablePresets = listSelectionTransformPresets().map((preset) => ({
              id: preset.id,
              name: presetDisplayName(preset.id),
            }));
            const localAssistantResponse = parsedAssistant.kind === "assistant"
              ? createAssistantQuickResponse(parsedAssistant.prompt, {
                  activePresetId: activePresetRef.current?.presetId ?? undefined,
                  activePresetName: activePresetRef.current?.presetName,
                  availablePresetNames: availablePresets.map((preset) => preset.name),
                  availablePresets,
                  lastActivatedPresetId: activePresetRef.current?.presetId ?? undefined,
                })
              : undefined;
            let managedAssistantText: string | undefined;
            if (
              parsedAssistant.kind === "assistant" &&
              (!localAssistantResponse?.handledLocally || localAssistantResponse.intent === "show-markdown") &&
              isTauri()
            ) {
              const managed = await runAssistantChatWithHost(invoke, {
                runId: input.sessionId,
                prompt: parsedAssistant.prompt,
                mode: "real",
                allowProviderCall: true,
                history: createAssistantChatHistoryWindow(assistantChatHistoryRef.current),
              });
              managedAssistantText = managed.status === "ok"
                ? managed.text
                : `Assistant unavailable: ${managed.error.message}`;
            }
            const runtime = applyAssistantVoicePrefixToRuntimeResult({
              runtime: base,
              sessionId: input.sessionId,
              activePreset: activePresetRef.current,
              availablePresets,
              managedAssistantText,
            });
            const assistantPresetId = runtime.assistantAction?.kind === "activate-preset"
              ? normalizeDockPresetId(runtime.assistantAction.presetId)
              : undefined;
            if (assistantPresetId) {
              selectActivePreset(assistantPresetId);
            }
            if (runtime.assistantAction?.kind === "open-settings") {
              if (isTauri()) {
                void invoke("show_settings_window").catch(() => setSettingsPanelOpen(true));
              } else {
                setSettingsPanelOpen(true);
              }
            }
            if (runtime.assistantAction?.kind === "show-history") {
              void loadResultHistory();
            }
            return transformSelectionAfterTranscription({
            runtime,
            sessionId: input.sessionId,
            selection: selectionContextRef.current,
            presetId: normalizeDockPresetId(activePresetRef.current?.presetId),
          });
        },
      },
      delivery: desktopDelivery,
      allowDesktopDeliverySideEffects: isTauri(),
      autoStop: autoStopSilencePolicyRef.current,
      prepareDeliveryTargetOnStop: async () => {
        if (!isTauri() || userPreferencesRef.current.followFocusUntilDelivery) {
          return;
        }
        stopDeliveryTargetRef.current = await captureTauriDesktopDeliveryTarget(invoke);
      },
    });

    return createAppSessionControllerFacade(controller);
  }, [desktopDelivery, gateway, hostRuntime.client]);
  const dictationKeyStateRef = useRef(createInitialDictationKeyState());
  const deferredStopEventIdRef = useRef<string | undefined>(undefined);
  const canCancelDictationRef = useRef(false);
  const copyDelivery = useMemo(
    () =>
      createCopyDeliveryGateway({
        async copyText(text) {
          if (isTauri()) {
            await invoke("copy_text_to_clipboard", { text });
            return;
          }

          const writer = navigator.clipboard?.writeText;
          if (!writer) {
            throw new Error("Clipboard fallback is unavailable in this environment.");
          }

          await writer.call(navigator.clipboard, text);
        },
        successReason: "Transcript copied as fallback.",
      }),
    [],
  );
  const [capture, setCapture] = useState<CaptureUiState>({
    state: "idle",
    message: captureRuntime.readyMessage,
  });
  const [pipelineUi, setPipelineUi] = useState<PipelineUiState>({
    status: "idle",
    message: "Capture an artifact before checking the safe host boundary.",
  });
  const [hostReadinessUi, setHostReadinessUi] = useState<HostReadinessUiState>(
    () => describeHostReadiness(),
  );
  const [desktopRecoveryAction, setDesktopRecoveryAction] =
    useState<DesktopRecoveryAction>();
  const [dismissedRecoveryKey, setDismissedRecoveryKey] = useState<string>();
  const [dockVu, setDockVu] = useState({
    level: 0,
    bands: [0, 0, 0, 0, 0, 0, 0],
  });
  const [effectiveHotkeyLabel, setEffectiveHotkeyLabel] = useState(tauriGlobalHotkeyShortcut);
  const [activePreset, setActivePreset] = useState<DockActivePreset | undefined>(
    activePresetRef.current,
  );
  const [resultHistoryEntries, setResultHistoryEntries] = useState<ResultHistoryEntry[]>([]);
  const [resultHistoryOpen, setResultHistoryOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [dismissedAssistantRunId, setDismissedAssistantRunId] = useState<string | undefined>(undefined);
  const persistedHistoryEntryIdRef = useRef<string | undefined>(undefined);
  const companionSyncKeyRef = useRef<string | undefined>(undefined);
  const hostCommandHandlerRef = useRef<
    ((payload: ResolvedTauriHostCommandPayload) => void | Promise<void>) | undefined
  >(undefined);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    void loadSelectionPresetStore()
      .then(() => {
        const storedPresetId = activePresetRef.current?.presetId;
        const presetId = normalizeDockPresetId(storedPresetId);
        if (presetId) {
          selectActivePreset(presetId);
        } else if (storedPresetId) {
          clearActivePreset();
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    void invoke<TauriGlobalHotkeyConfig>("get_desktop_control_hotkey_config")
      .then((config) => {
        setEffectiveHotkeyLabel(config.shortcut || tauriGlobalHotkeyShortcut);
      })
      .catch(() => {
        setEffectiveHotkeyLabel(tauriGlobalHotkeyShortcut);
      });
  }, []);

  useEffect(() => {
    const applyPreferences = (preferences: UserPreferences) => {
      userPreferencesRef.current = {
        ...defaultUserPreferences,
        ...preferences,
        schemaVersion: 1,
      };
      Object.assign(
        autoStopSilencePolicyRef.current,
        createAutoStopSilencePolicy(userPreferencesRef.current),
      );
      Object.assign(
        muteOutputPolicyRef.current,
        createMuteOutputPolicy(userPreferencesRef.current),
      );
      Object.assign(
        soundCuePolicyRef.current,
        createSoundCuePolicy(userPreferencesRef.current),
      );
    };

    if (!isTauri()) {
      applyPreferences(defaultUserPreferences);
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;
    const loadPreferences = () => {
      void getUserPreferences()
        .then((preferences) => {
          if (!disposed) {
            applyPreferences(preferences);
          }
        })
        .catch(() => {
          if (!disposed) {
            applyPreferences(defaultUserPreferences);
          }
        });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadPreferences();
      }
    };

    loadPreferences();
    void listen<UserPreferences>(userPreferencesChangedEvent, (event) => {
      if (!disposed) {
        applyPreferences(event.payload);
      }
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }
      unlisten = cleanup;
    });
    window.addEventListener("focus", loadPreferences);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("focus", loadPreferences);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    const entry = createHistoryEntryFromSummary(pipelineUi.summary);
    if (!entry || persistedHistoryEntryIdRef.current === entry.id || !isTauri()) {
      return;
    }

    persistedHistoryEntryIdRef.current = entry.id;
    void invoke<ResultHistoryEntry[]>("append_result_history_entry", { entry })
      .then((entries) => setResultHistoryEntries(entries))
      .catch(() => undefined);
  }, [pipelineUi.summary]);

  useEffect(() => {
    let cancelled = false;

    setHostReadinessUi(describeHostReadiness());
    void loadHostReadinessUi(hostRuntime.client).then((nextReadiness) => {
      if (!cancelled) {
        setHostReadinessUi(nextReadiness);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hostRuntime.client]);

  useEffect(() => {
    if (capture.state !== "recording" && capture.state !== "requesting_permission") {
      setDockVu({ level: 0, bands: [0, 0, 0, 0, 0, 0, 0] });
      return;
    }

    let disposed = false;
    let tick = 0;

    const updateVu = async () => {
      const nativeLevel = await getGatewayCaptureLevel(gateway);
      if (disposed) {
        return;
      }

      if (nativeLevel) {
        setDockVu({
          level: nativeLevel.vuLevel,
          bands: nativeLevel.vuBands,
        });
        return;
      }

      tick += 1;
      setDockVu(createSyntheticDockVu(tick));
    };

    void updateVu();
    const interval = window.setInterval(() => void updateVu(), 80);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [capture.state, gateway]);

  async function refreshHostReadiness() {
    setHostReadinessUi(describeHostReadiness());
    setHostReadinessUi(await loadHostReadinessUi(hostRuntime.client));
  }

  async function prepareDictationStartContext(options: { targetSnapshot?: TauriDesktopDeliveryTarget } = {}) {
    selectionContextRef.current = undefined;
    stopDeliveryTargetRef.current = undefined;
    if (!isTauri()) {
      savedDeliveryTargetRef.current = undefined;
      return;
    }

    savedDeliveryTargetRef.current = options.targetSnapshot?.inputLike
      ? options.targetSnapshot
      : await captureTauriDesktopDeliveryTarget(invoke);
  }

  async function rememberSelectionTransformContext(
    options: { forceTargetClipboardFallback?: boolean } = {},
  ): Promise<SelectionCaptureOutcome | undefined> {
    selectionContextRef.current = undefined;
    if (!isTauri()) {
      return undefined;
    }

    try {
      const target = savedDeliveryTargetRef.current;
      const targetCommand = options.forceTargetClipboardFallback
        ? hostSelectionCaptureForTargetWithClipboardCommand
        : hostSelectionCaptureForTargetCommand;
      const outcome = target?.frameHwnd
        ? await invoke<SelectionCaptureOutcome>(targetCommand, {
            frameHwnd: target.frameHwnd,
          })
        : await invoke<SelectionCaptureOutcome>(hostSelectionCaptureCommand);
      const route = routeSelectionCaptureOutcome(outcome);
      selectionContextRef.current = route.kind === "selection_transform"
        ? route.selection
        : undefined;
      return outcome;
    } catch {
      selectionContextRef.current = undefined;
      return undefined;
    }
  }

  async function waitForHotkeyRelease() {
    await new Promise((resolve) => window.setTimeout(resolve, 180));
  }

  async function transformSelectionAfterTranscription(input: {
    runtime: DesktopRuntimeResult;
    sessionId: string;
    selection?: SelectionContext;
    presetId?: DockCompanionPresetId;
  }): Promise<DesktopRuntimeResult> {
    if (isSimulatedRunSummary(input.runtime.summary) && input.runtime.summary.resultSource === "assistant") {
        return input.runtime;
    }

    const selectedText = input.selection?.selectedText?.trim();
    if (!selectedText && !input.presetId) {
      return input.runtime;
    }

    if (!selectedText && input.presetId && isTauri()) {
      try {
        const response = await transformSelectedTextWithHost(invoke, {
          runId: input.sessionId,
          selectedText: input.runtime.transcript,
          instruction: selectionTransformInstructionForPreset({ presetId: input.presetId }),
          presetId: input.presetId,
          mode: "real",
          allowProviderCall: true,
        });
        if (response.status !== "ok") {
          return applySelectionTransformFailureToRuntimeResult({
            runtime: input.runtime,
            code: response.error.code,
            reason: `Selection transform failed (${response.error.code}); dictated transcript is available for review and manual copy.`,
          });
        }
        return applySelectionTransformOutputToRuntimeResult({
          runtime: input.runtime,
          output: response.text,
          deliveryStrategy: userPreferencesRef.current.reviewBeforeDelivery ? "review_only" : "paste_send",
          reason: userPreferencesRef.current.reviewBeforeDelivery
            ? "Managed preset voice transform is available for review before delivery."
            : "Managed preset voice transform inserted the preset output.",
        });
      } catch {
        return applySelectionTransformFailureToRuntimeResult({
          runtime: input.runtime,
        });
      }
    }

    if (!selectedText) {
      return applySelectionTransformToRuntimeResult(input);
    }

    if (isTauri()) {
      try {
        const response = await transformSelectedTextWithHost(invoke, {
          runId: input.sessionId,
          selectedText,
          instruction: input.presetId
            ? selectionTransformInstructionForPreset({
                presetId: input.presetId,
                dictatedInstruction: input.runtime.transcript,
              })
            : input.runtime.transcript,
          ...(input.presetId ? { presetId: input.presetId } : {}),
          mode: "real",
          allowProviderCall: true,
        });
        if (response.status === "ok") {
          return applySelectionTransformOutputToRuntimeResult({
            runtime: input.runtime,
            output: response.text,
            deliveryStrategy: userPreferencesRef.current.reviewBeforeDelivery ? "review_only" : "paste_send",
            reason: userPreferencesRef.current.reviewBeforeDelivery
              ? "Managed selection transform is available for review before replacing the captured selection."
              : "Managed selection transform replaced the captured selection like Fixvox.",
          });
        }

        return applySelectionTransformFailureToRuntimeResult({
          runtime: input.runtime,
          code: response.error.code,
          reason: `Selection transform failed (${response.error.code}); dictated transcript is available for review and manual copy.`,
        });
      } catch {
        return applySelectionTransformFailureToRuntimeResult({
          runtime: input.runtime,
        });
      }
    }

    return applySelectionTransformToRuntimeResult(input);
  }

  function queueDictationSoundCue(cue: DictationSoundCue) {
    requestDictationSoundCue(soundCuePolicyRef.current, cue);
  }

  async function startCapture(options: { keepCurrentContext?: boolean } = {}) {
    if (isTauri() && !(await ensureTauriDictationReadiness(invoke))) {
      setDesktopRecoveryAction(accountSetupRecoveryAction());
      setPipelineUi({
        status: "idle",
        message: "Completá la configuración de tu cuenta antes de dictar.",
      });
      setCapture({
        state: "idle",
        message: "Abrimos Cuenta para continuar la configuración.",
      });
      return;
    }

    if (!options.keepCurrentContext) {
      setResultHistoryOpen(false);
      setSettingsPanelOpen(false);
      setDismissedAssistantRunId(companionSnapshot.assistant.runId);
      await prepareDictationStartContext();
    }
    setDesktopRecoveryAction(undefined);
    setPipelineUi({
      status: "idle",
      message: "Capture an artifact before checking the safe host boundary.",
    });
    setCapture({
      state: "requesting_permission",
      message: captureRuntime.permissionMessage,
    });

    const session = await desktopSession.start();
    setDesktopRecoveryAction(session.recoveryAction);
    if (session.state === "listening") {
      queueDictationSoundCue("start");
      setCapture({
        state: "recording",
        message: captureRuntime.listeningMessage,
      });
      return;
    }

    queueDictationSoundCue("error");
    setCapture({
      state: session.error?.code === "capture-start-failed" ? "permission_needed" : "failed",
      message: session.error?.message ?? "A capture session is already active.",
    });
  }

  async function stopCapture() {
    queueDictationSoundCue("stop");
    setCapture({
      state: "stopping",
      message: captureRuntime.stoppingMessage,
    });
    setPipelineUi({
      status: "running",
      message: isTauri()
        ? "Submitting captured audio for transcription."
        : "Checking the safe host boundary without a provider call.",
    });

    try {
      await rememberSelectionTransformContext();
      const session = await desktopSession.stop();
      setDesktopRecoveryAction(session.recoveryAction);
      const result = getAppSessionCaptureResult(session);
      const summary = getAppSessionSummary(session);

      setCapture({
        state: result?.ok ? "captured" : session.state === "cancelled" ? "cancelled" : "failed",
        message: result?.ok
          ? captureRuntime.capturedMessage
          : session.error?.message ?? "Capture failed before pipeline submission.",
        result,
      });

      if (summary?.terminalState === "done") {
        const deliveryMessage =
          describeDeliveryEvidence(summary.deliveryEvidence) ??
          (summary.transcript
            ? "Transcript is available from the captured run."
            : "Captured run completed without transcript text.");

        queueDictationSoundCue(summary.transcript ? "success" : "no-speech");
        setPipelineUi({
          status: "done",
          message: deliveryMessage,
          summary,
        });
        return;
      }

      if (session.state === "cancelled" || summary?.terminalState === "cancelled") {
        setPipelineUi({
          status: "cancelled",
          message: "Captured run was cancelled before completion.",
          summary,
        });
        return;
      }

      queueDictationSoundCue("error");
      const failureMessage = session.error?.message ?? summary?.error?.message ?? "Captured run failed.";
      const setupFailure = isAccountSetupFailure(failureMessage);
      if (setupFailure) {
        setDesktopRecoveryAction(accountSetupRecoveryAction(Boolean(summary?.capture?.artifact)));
      }
      setPipelineUi({
        status: "error",
        message: setupFailure
          ? "Completá la configuración de tu cuenta antes de dictar."
          : failureMessage,
        summary,
      });
    } finally {
      selectionContextRef.current = undefined;
    }
  }

  async function cancelCapture() {
    const session = await desktopSession.cancel();
    setDesktopRecoveryAction(session.recoveryAction);
    const result = getAppSessionCaptureResult(session);
    queueDictationSoundCue("stop");
    setPipelineUi({
      status: "cancelled",
      message: "Pipeline submission was skipped because capture was cancelled.",
    });
    setCapture({
      state: "cancelled",
      message: "Capture cancelled before transcription.",
      result,
    });
  }

  async function submitCapturedRun(options: { useRealProvider?: boolean } = {}) {
    if (!capture.result?.ok) {
      queueDictationSoundCue("error");
      setPipelineUi({
        status: "error",
        message: "No captured artifact is available for pipeline submission.",
      });
      return;
    }

    const useRealProvider = options.useRealProvider === true;
    setPipelineUi({
      status: "running",
      message: useRealProvider
        ? "Submitting captured artifact to the configured host provider."
        : "Checking the safe host boundary without a provider call.",
    });

    try {
      const pipeline = new PipelineService({
        transcriptionAdapter: createHostClientTranscriptionAdapter(
          hostRuntime.client,
          useRealProvider
            ? {
                mode: "real",
                allowProviderCall: true,
              }
            : undefined,
        ),
      });
      const summary = await pipeline.run(
        createCapturedAudioPipelineRequest(capture.result),
      );

      if (summary.terminalState === "done") {
        const deliveryMessage =
          describeDeliveryEvidence(summary.deliveryEvidence) ??
          (summary.transcript
            ? "Transcript is available from the captured run."
            : "Captured run completed without transcript text.");

        queueDictationSoundCue(summary.transcript ? "success" : "no-speech");
        setPipelineUi({
          status: "done",
          message: deliveryMessage,
          summary,
        });
        return;
      }

      if (summary.terminalState === "cancelled") {
        setPipelineUi({
          status: "cancelled",
          message: "Captured run was cancelled before completion.",
          summary,
        });
        return;
      }

      queueDictationSoundCue("error");
      setPipelineUi({
        status: "error",
        message: summary.error?.message ?? "Captured run failed.",
        summary,
      });
    } catch {
      queueDictationSoundCue("error");
      setPipelineUi({
        status: "error",
        message: "Captured run could not start because another run is active.",
      });
    }
  }

  async function transcribeCapturedRunWithProvider() {
    await submitCapturedRun({ useRealProvider: true });
  }

  async function copyTranscriptFallback() {
    const summary = pipelineUi.summary;
    const latestResult = latestResultFromPipelineSummary(summary);

    if (!summary || !latestResult) {
      setPipelineUi({
        status: "error",
        message: "No transcript is available to copy.",
        summary,
      });
      return;
    }

    const resultNoun = describeLatestResultNoun(summary);
    const evidence = await copyDelivery.deliver({
      sessionId: summary.runId,
      text: latestResult.text,
      strategy: "copy",
      allowDesktopSideEffects: true,
    });
    const nextSummary = applyDeliveryEvidenceFallback(summary, evidence);

    setPipelineUi({
      status: evidence.status === "failed" ? "error" : "done",
      message: describeDeliveryEvidence(nextSummary.deliveryEvidence) ??
        (evidence.status === "failed"
          ? `Clipboard copy failed. Latest ${resultNoun} remains available in the app.`
          : `Latest ${resultNoun} copied as fallback.`),
      summary: nextSummary,
    });
  }

  function markSafePasteLastRecovery() {
    const summary = pipelineUi.summary;
    const latestResult = latestResultFromPipelineSummary(summary);

    if (!summary || !latestResult) {
      setPipelineUi({
        status: "idle",
        message: "No latest transcript is available for paste-last recovery.",
        summary,
      });
      setDesktopRecoveryAction(undefined);
      return;
    }

    const nextSummary = applySafePasteLastRecovery(summary);

    setPipelineUi({
      status: "done",
      message:
        describeDeliveryEvidence(nextSummary.deliveryEvidence) ??
        "Paste last was not sent in safe mode; transcript remains available for manual copy.",
      summary: nextSummary,
    });
  }

  async function pasteLastToForegroundTarget(forced?: {
    summary?: SimulatedRunSummary;
    text?: string;
    targetSnapshot?: TauriDesktopDeliveryTarget;
    targetAffinity?: DeliveryTargetAffinity;
  }) {
    const summary = forced?.summary ?? pipelineUi.summary;
    const latestResult = latestResultFromPipelineSummary(summary);
    let pasteSummary = summary;
    let pasteText = forced?.text ?? latestResult?.text;

    if (!pasteText && isTauri()) {
      try {
        const entries = await invoke<ResultHistoryEntry[]>("list_result_history_entries");
        const entry = entries
          .slice()
          .reverse()
          .find((candidate) => candidate.text.trim().length > 0);
        if (entry) {
          pasteSummary = createHistorySummary(entry);
          pasteText = entry.text;
          setResultHistoryEntries(entries);
        }
      } catch {
        // Fall through to the no-latest-result branch below.
      }
    }

    if (!pasteSummary || !pasteText) {
      setPipelineUi({
        status: "idle",
        message: "No latest transcript is available for paste-last.",
        summary,
      });
      setDesktopRecoveryAction(undefined);
      return;
    }

    if (isTauri()) {
      const nextTarget = forced?.targetSnapshot?.inputLike
        ? forced.targetSnapshot
        : await captureTauriDesktopDeliveryTarget(invoke);
      if (nextTarget?.inputLike) {
        savedDeliveryTargetRef.current = nextTarget;
      }
    }

    if (!desktopDelivery) {
      markSafePasteLastRecovery();
      return;
    }

    const evidence = await desktopDelivery.deliver({
      sessionId: pasteSummary.runId,
      text: pasteText,
      strategy: "paste_send",
      allowDesktopSideEffects: true,
      targetAffinity: forced?.targetAffinity,
    });
    const nextSummary = applyDeliveryEvidenceFallback(pasteSummary, evidence);

    setPipelineUi({
      status: evidence.status === "failed" ? "error" : "done",
      message:
        describeDeliveryEvidence(nextSummary.deliveryEvidence) ??
        (evidence.status === "failed"
          ? "Paste last failed. Transcript remains available in the app."
          : "Paste last was sent to the foreground target."),
      summary: nextSummary,
    });
  }

  const canStart =
    capture.state === "idle" ||
    capture.state === "captured" ||
    capture.state === "failed" ||
    capture.state === "cancelled" ||
    capture.state === "permission_needed";
  const canStop = capture.state === "recording";
  const canCancel =
    capture.state === "recording" || capture.state === "requesting_permission";
  canCancelDictationRef.current = canCancel;
  const canSubmit = Boolean(capture.result?.ok) && pipelineUi.status !== "running";
  const canTranscribeWithProvider =
    canSubmit && hostReadinessUi.status === "configured";
  const canCopyTranscript = Boolean(
    latestResultFromPipelineSummary(pipelineUi.summary),
  );
  const reviewCopyLabel = getReviewCopyLabel(pipelineUi.summary);
  const artifact = capture.result?.ok ? capture.result.artifact : undefined;
  const error = capture.result && !capture.result.ok ? capture.result.error : undefined;
  const deliveryEvidence = pipelineUi.summary?.deliveryEvidence;
  const pipelineUiResult = createPipelineUiResult(pipelineUi.summary);
  const transcriptReview = getTranscriptReview(pipelineUi.summary);
  const redactedRunSummary = formatSafeRedactedRunSummary(pipelineUi.summary);
  const assistantHandledBySurface = isAssistantHandledBySurface(pipelineUiResult);
  const recoveryAction =
    getRecoveryAction(pipelineUi.summary) ??
    formatDesktopRecoveryAction(desktopRecoveryAction);
  const pipelineTone =
    pipelineUi.status === "done" &&
    deliveryEvidence?.status !== "uncertain" &&
    deliveryEvidence?.status !== "failed"
      ? "captured"
      : pipelineUi.status === "error" || deliveryEvidence?.status === "failed"
        ? "failed"
        : deliveryEvidence?.status === "uncertain"
          ? "cancelled"
        : pipelineUi.status === "running"
          ? "requesting_permission"
          : pipelineUi.status === "cancelled"
            ? "cancelled"
            : "idle";
  const voiceDockState = createVoiceDockState(
    createDockInputFromUi({
      capture,
      pipelineUi,
      deliveryEvidence,
      transcriptReview,
      recoveryAction: desktopRecoveryAction,
    }),
    {
      canPasteLastSafe: canCopyTranscript,
      activePreset,
      resultSource: getDockResultSourceForPipelineUiResult(pipelineUiResult),
      assistantModeEnabled: pipelineUiResult.kind === "assistant" && !assistantHandledBySurface,
      vuLevel: capture.state === "recording" ? dockVu.level : pipelineUi.status === "running" ? 0.42 : 0,
      vuBands: createDockVuBands(capture.state, pipelineUi.status, dockVu.bands),
    },
  );
  const voiceDockHotkey = isTauri()
    ? effectiveHotkeyLabel
    : "Dock button";
  const recoveryKey = voiceDockState.recovery
    ? `${voiceDockState.phase}:${voiceDockState.recovery.title}:${voiceDockState.recovery.message}`
    : undefined;
  const companionVoiceDockState = recoveryKey && dismissedRecoveryKey === recoveryKey
    ? { ...voiceDockState, recovery: undefined }
    : voiceDockState;
  const assistantSurface = getCompanionSurfaceForPipelineUiResult(pipelineUiResult);
  const assistantShouldOpen = Boolean(
    assistantSurface &&
      deliveryEvidence?.status !== "paste_sent" &&
      deliveryEvidence?.status !== "paste_observed",
  );
  const assistantRunId = assistantShouldOpen ? pipelineUi.summary?.runId : undefined;
  const assistantMessage = pipelineUiResult.kind === "assistant"
    ? assistantSurface?.kind === "showMarkdown"
      ? assistantSurface.markdown
      : assistantSurface?.kind === "optionPicker"
        ? assistantSurface.prompt
        : pipelineUiResult.output
    : undefined;
  const companionSnapshot = createDockCompanionSnapshot({
    voiceDockState: companionVoiceDockState,
    resultHistoryOpen,
    resultHistoryEntries,
    settingsPanelOpen,
    activePreset,
    presetPickerMode: selectionContextRef.current?.selectedText?.trim()
      ? "selection"
      : "dictation",
    assistant: {
      open: Boolean(assistantShouldOpen && assistantRunId !== dismissedAssistantRunId),
      runId: assistantRunId,
      message: assistantShouldOpen ? assistantMessage : undefined,
      surface: assistantShouldOpen ? assistantSurface : undefined,
    },
  });

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const syncDockShellState = () => {
      void invoke("update_dock_shell_state", { state: voiceDockState.phase }).catch(() => {
        // Dock shell updates are best-effort; renderer state remains the source of truth.
      });
    };

    syncDockShellState();
    const startupRetry = window.setTimeout(syncDockShellState, 250);

    return () => window.clearTimeout(startupRetry);
  }, [voiceDockState.phase]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    void invoke("set_desktop_control_escape_cancel_enabled", {
      enabled: canCancel,
    }).catch(() => {
      // Escape cancel is best-effort; explicit dock cancel remains available.
    });

    return () => {
      void invoke("set_desktop_control_escape_cancel_enabled", {
        enabled: false,
      }).catch(() => undefined);
    };
  }, [canCancel]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const syncKey = createDockCompanionSyncKey(companionSnapshot);
    if (companionSyncKeyRef.current === syncKey) {
      return;
    }
    companionSyncKeyRef.current = syncKey;
    storeDockCompanionSnapshot(companionSnapshot);

    const pickerVisible = companionSnapshot.settings.open;
    const companionVisible = Boolean(companionSnapshot.recovery || companionSnapshot.history.open || companionSnapshot.assistant.open);
    const emitPickerSnapshot = () => emitTo(
      "preset-picker",
      dockCompanionStateEvent,
      companionSnapshot,
    );
    const syncPicker = pickerVisible
      ? emitPickerSnapshot()
        .then(() => invoke("show_preset_picker"))
        .then(() => {
          void window.setTimeout(() => void emitPickerSnapshot().catch(() => undefined), 120);
          void window.setTimeout(() => void emitPickerSnapshot().catch(() => undefined), 350);
        })
      : invoke("hide_preset_picker");
    const syncCompanion = invoke(companionVisible ? "show_companion" : "hide_companion")
      .then(() =>
        companionVisible
          ? emitTo("dock-companion", dockCompanionStateEvent, companionSnapshot)
          : undefined,
      );

    void Promise.all([syncPicker, syncCompanion]).catch(() => {
      companionSyncKeyRef.current = undefined;
    });
  }, [companionSnapshot]);

  async function clearResultHistory() {
    if (isTauri()) {
      await invoke("clear_result_history");
    }
    setResultHistoryEntries([]);
  }

  async function loadResultHistory(options: { targetSnapshot?: TauriDesktopDeliveryTarget } = {}) {
    if (!isTauri()) {
      setResultHistoryOpen(true);
      return;
    }

    const historyTarget = options.targetSnapshot?.inputLike
      ? options.targetSnapshot
      : await captureTauriDesktopDeliveryTarget(invoke);
    if (historyTarget?.inputLike) {
      savedDeliveryTargetRef.current = historyTarget;
    }

    const entries = await invoke<ResultHistoryEntry[]>("list_result_history_entries");
    setResultHistoryEntries(entries);
    setResultHistoryOpen(true);
  }

  function selectActivePreset(presetId: DockCompanionPresetId) {
    const nextPreset: DockActivePreset = {
      presetId,
      presetName: presetDisplayName(presetId),
      appKey: "global",
    };
    activePresetRef.current = nextPreset;
    setActivePreset(nextPreset);
    storeActivePreset(nextPreset);
  }

  function clearActivePreset() {
    activePresetRef.current = undefined;
    selectionContextRef.current = undefined;
    setActivePreset(undefined);
    storeActivePreset(undefined);
  }

  function closeCompanionSurfaces() {
    if (recoveryKey) {
      setDismissedRecoveryKey(recoveryKey);
    }
    setResultHistoryOpen(false);
    setSettingsPanelOpen(false);
    setDismissedAssistantRunId(companionSnapshot.assistant.runId);
  }

  function selectHistoryEntry(entryId: string) {
    const entry = resultHistoryEntries.find((candidate) => candidate.id === entryId);
    if (!entry) {
      return;
    }

    const summary = createHistorySummary(entry);
    setPipelineUi({
      status: "done",
      message: "History result selected; paste-last is being sent to the saved target.",
      summary,
    });
    setResultHistoryOpen(false);
    setDesktopRecoveryAction(undefined);
    void pasteLastToForegroundTarget({
      summary,
      text: entry.text,
      targetSnapshot: savedDeliveryTargetRef.current,
      targetAffinity: "saved",
    });
  }

  function recordPresetPickerMainDebug(patch: Record<string, unknown>) {
    (window as unknown as { __dictationPresetPickerMainDebug: Record<string, unknown> })
      .__dictationPresetPickerMainDebug = {
        ...((window as unknown as { __dictationPresetPickerMainDebug?: Record<string, unknown> })
          .__dictationPresetPickerMainDebug ?? {}),
        ...patch,
        updatedAt: new Date().toISOString(),
      };
  }

  async function openPresetPicker(targetSnapshot?: TauriDesktopDeliveryTarget) {
    presetPickerSelectionCaptureStatusRef.current = isTauri() ? "failed" : undefined;
    if (isTauri()) {
      savedDeliveryTargetRef.current = targetSnapshot?.inputLike
        ? targetSnapshot
        : await captureTauriDesktopDeliveryTarget(invoke);
      const outcome = await rememberSelectionTransformContext({
        forceTargetClipboardFallback: true,
      });
      presetPickerSelectionCaptureStatusRef.current = outcome?.status ?? "failed";
    }

    const hasSelection = Boolean(selectionContextRef.current?.selectedText?.trim());
    const selectionStatus = hasSelection
      ? "selected"
      : presetPickerSelectionCaptureStatusRef.current === "no_selection" || !isTauri()
        ? "none"
        : "uncertain";
    const message = hasSelection
      ? "Action picker captured selected text for a preset transform."
      : selectionStatus === "none"
        ? "Action picker is ready. Choose a preset to keep active for future dictation."
        : "Selected text could not be captured safely. Choosing a preset will not activate a persistent mode.";

    recordPresetPickerMainDebug({
      lastAction: "opened",
      hadTarget: Boolean(savedDeliveryTargetRef.current?.inputLike),
      selectionStatus,
      captureStatus: presetPickerSelectionCaptureStatusRef.current ?? null,
    });

    setResultHistoryOpen(false);
    setSettingsPanelOpen(true);
    setDesktopRecoveryAction(undefined);
    setCapture({ state: "idle", message });
    if (isTauri()) {
      window.setTimeout(() => {
        void invoke("focus_preset_picker").catch(() => undefined);
      }, 120);
    }
    setPipelineUi({ status: "idle", message, summary: pipelineUi.summary });
  }

  async function runPickerPreset(presetId: DockCompanionPresetId) {
    await loadSelectionPresetStore().catch(() => undefined);
    recordPresetPickerMainDebug({ lastAction: "run_requested", presetId });
    setSettingsPanelOpen(false);
    setResultHistoryOpen(false);
    if (isTauri()) {
      await invoke("hide_preset_picker").catch(() => undefined);
    }

    const selectedText = selectionContextRef.current?.selectedText?.trim();
    const captureStatus = presetPickerSelectionCaptureStatusRef.current;
    const action = resolvePresetPickerAction(selectedText, captureStatus);
    recordPresetPickerMainDebug({
      lastAction: action,
      presetId,
      captureStatus: captureStatus ?? null,
      selectedTextLength: selectedText?.length ?? 0,
    });
    if (action === "selection_capture_failed") {
      clearActivePreset();
      presetPickerSelectionCaptureStatusRef.current = undefined;
      const message = "Selected text could not be captured safely. No preset was activated.";
      setCapture({ state: "idle", message });
      setPipelineUi({ status: "error", message, summary: pipelineUi.summary });
      return;
    }
    if (action === "activate_dictation_preset") {
      selectActivePreset(presetId);
      selectionContextRef.current = undefined;
      presetPickerSelectionCaptureStatusRef.current = undefined;
      const message = `${presetDisplayName(presetId)} is active for future dictation.`;
      setCapture({ state: "idle", message });
      setPipelineUi({ status: "idle", message, summary: pipelineUi.summary });
      return;
    }
    if (!selectedText) {
      return;
    }

    clearActivePreset();
    const runId = `preset-picker-${Date.now()}`;
    const startedAt = Date.now();
    setPipelineUi({
      status: "running",
      message: `Running ${presetDisplayName(presetId)} on captured selected text.`,
      summary: pipelineUi.summary,
    });

    try {
      const response = await transformSelectedTextWithHost(invoke, {
        runId,
        selectedText,
        instruction: selectionTransformInstructionForPreset({ presetId }),
        presetId,
        mode: "real",
        allowProviderCall: true,
      });

      if (response.status !== "ok") {
        throw new Error(`Preset transform failed (${response.error.code}); selected text was not replaced.`);
      }

      const baseSummary: SimulatedRunSummary = {
        runId,
        fixtureId: "preset-picker",
        resultSource: "selection_transform",
        inputKind: "simulated",
        events: [],
        states: ["transcribing", "delivering", "done"],
        terminalState: "done",
        output: response.text,
        delivery: {
          status: "skipped",
          output: response.text,
          reason: "Preset picker transform completed before desktop delivery.",
        },
        deliveryEvidence: {
          status: "available",
          output: response.text,
          reason: "Preset picker transform completed before desktop delivery.",
        },
        durationMs: Date.now() - startedAt,
      };

      if (!desktopDelivery) {
        setPipelineUi({
          status: "done",
          message: "Preset transform is available. Desktop delivery is unavailable in this surface.",
          summary: baseSummary,
        });
        return;
      }

      const evidence = await desktopDelivery.deliver({
        sessionId: runId,
        text: response.text,
        strategy: "paste_send",
        allowDesktopSideEffects: true,
        targetAffinity: "saved",
      });
      const deliveredSummary = applyDeliveryEvidenceFallback(baseSummary, evidence);

      setPipelineUi({
        status: evidence.status === "failed" ? "error" : "done",
        message:
          describeDeliveryEvidence(deliveredSummary.deliveryEvidence) ??
          (evidence.status === "failed"
            ? "Preset transform failed during desktop delivery. The transformed text remains available."
            : "Preset transform was sent to the captured target."),
        summary: deliveredSummary,
      });
    } catch (error) {
      setPipelineUi({
        status: "error",
        message: error instanceof Error
          ? error.message
          : "Preset transform failed; selected text was not replaced.",
        summary: pipelineUi.summary,
      });
    } finally {
      selectionContextRef.current = undefined;
      presetPickerSelectionCaptureStatusRef.current = undefined;
    }
  }

  function handleHostCommandPayload(payload: ResolvedTauriHostCommandPayload) {
    switch (payload.command) {
      case "select_preset":
        if (payload.presetId) {
          selectActivePreset(payload.presetId);
        }
        break;
      case "clear_preset":
        clearActivePreset();
        break;
      case "show_result_history":
        void loadResultHistory({ targetSnapshot: payload.targetSnapshot });
        break;
      case "show_preset_picker":
        void openPresetPicker(payload.targetSnapshot);
        break;
      case "run_preset_picker_chord": {
        const presetId = resolvePresetPickerChord(payload.chordKey);
        recordPresetPickerMainDebug({
          lastAction: presetId ? "native_chord_run" : "native_chord_unknown",
          chordKey: payload.chordKey ?? null,
          presetId: presetId ?? null,
        });
        if (presetId) {
          void (async () => {
            if (!settingsPanelOpen) {
              await openPresetPicker(payload.targetSnapshot);
            }
            await runPickerPreset(presetId);
          })();
        } else {
          void openPresetPicker(payload.targetSnapshot);
        }
        break;
      }
      case "open_settings":
        if (isTauri()) {
          void invoke("show_settings_window").catch(() => setSettingsPanelOpen(true));
        } else {
          setSettingsPanelOpen(true);
        }
        break;
      case "paste_last_safe":
        void pasteLastToForegroundTarget({ targetSnapshot: payload.targetSnapshot });
        break;
      default:
        handleVoiceDockCommand(payload.command);
    }
  }

  async function handleAssistantQuickChatMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    const availablePresets = listSelectionTransformPresets().map((preset) => ({
      id: preset.id,
      name: presetDisplayName(preset.id),
    }));
    const localResponse = createAssistantQuickResponse(trimmed, {
      activePresetId: activePresetRef.current?.presetId ?? undefined,
      activePresetName: activePresetRef.current?.presetName,
      availablePresetNames: availablePresets.map((preset) => preset.name),
      availablePresets,
      lastActivatedPresetId: activePresetRef.current?.presetId ?? undefined,
    });
    if (localResponse.action?.kind === "activate-preset") {
      const presetId = normalizeDockPresetId(localResponse.action.presetId);
      if (presetId) {
        selectActivePreset(presetId);
      }
    }
    if (localResponse.action?.kind === "open-settings") {
      if (isTauri()) {
        void invoke("show_settings_window").catch(() => setSettingsPanelOpen(true));
      } else {
        setSettingsPanelOpen(true);
      }
    }
    if (localResponse.action?.kind === "show-history") {
      void loadResultHistory();
    }

    const runId = `assistant-chat-${Date.now()}`;
    let output = localResponse.text;
    let statusMessage = "Quick Chat local reply is available.";

    if (!localResponse.handledLocally && isTauri()) {
      setPipelineUi({
        status: "running",
        message: "Sending Quick Chat to managed assistant.",
        summary: pipelineUi.summary,
      });
      const managed = await runAssistantChatWithHost(invoke, {
        runId,
        prompt: trimmed,
        mode: "real",
        allowProviderCall: true,
        history: createAssistantChatHistoryWindow(assistantChatHistoryRef.current),
      });
      if (managed.status === "ok") {
        output = managed.text;
        statusMessage = "Quick Chat managed reply is available.";
      } else {
        output = `Assistant unavailable: ${managed.error.message}`;
        statusMessage = "Quick Chat managed reply failed closed.";
      }
    }

    assistantChatHistoryRef.current = createAssistantChatHistoryWindow([
      ...assistantChatHistoryRef.current,
      { role: "user", text: trimmed },
      { role: "assistant", text: output },
    ]);

    setDismissedAssistantRunId(undefined);
    setPipelineUi({
      status: "done",
      message: statusMessage,
      summary: createAssistantQuickChatSummary({
        runId,
        prompt: trimmed,
        output,
      }),
    });
  }

  function handleCompanionCommandPayload(payload: DockCompanionCommandPayload) {
    switch (payload.command) {
      case "copy":
      case "retry":
        handleVoiceDockCommand(payload.command);
        break;
      case "paste_last_safe":
        void pasteLastToForegroundTarget();
        break;
      case "select_preset":
        if (settingsPanelOpen) {
          void runPickerPreset(payload.presetId);
        } else {
          selectActivePreset(payload.presetId);
        }
        setSettingsPanelOpen(false);
        break;
      case "clear_preset":
        clearActivePreset();
        setSettingsPanelOpen(false);
        break;
      case "dismiss_recovery":
        if (recoveryKey) {
          setDismissedRecoveryKey(recoveryKey);
        }
        break;
      case "dismiss_result_history":
        setResultHistoryOpen(false);
        break;
      case "dismiss_settings":
        setSettingsPanelOpen(false);
        break;
      case "dismiss_assistant":
        setDismissedAssistantRunId(companionSnapshot.assistant.runId);
        break;
      case "send_assistant_message":
        void handleAssistantQuickChatMessage(payload.message);
        break;
      case "select_history_entry":
        selectHistoryEntry(payload.entryId);
        break;
      case "clear_result_history":
        void clearResultHistory();
        break;
      case "close_companion":
        closeCompanionSurfaces();
        break;
    }
  }

  async function handleDockDragStart(event: DockDragEvent) {
    if (!isTauri()) {
      return;
    }

    try {
      const windowPosition = await invoke<DockShellPosition>("get_dock_shell_position");
      dockDragRef.current = {
        startScreenX: event.startScreenX,
        startScreenY: event.startScreenY,
        startWindowX: windowPosition.x,
        startWindowY: windowPosition.y,
        scale: window.devicePixelRatio || 1,
      };
      await moveDockToDragPosition(event);
    } catch {
      dockDragRef.current = undefined;
    }
  }

  async function handleDockDragMove(event: DockDragEvent) {
    if (!isTauri()) {
      return;
    }

    await moveDockToDragPosition(event);
  }

  async function handleDockDragEnd(event: DockDragEvent) {
    if (!isTauri()) {
      return;
    }

    await moveDockToDragPosition(event);
    dockDragRef.current = undefined;
    void invoke("save_dock_shell_position").catch(() => undefined);
  }

  async function moveDockToDragPosition(event: DockDragEvent) {
    const drag = dockDragRef.current;
    if (!drag) {
      return;
    }

    const nextX = Math.round(
      drag.startWindowX + (event.screenX - drag.startScreenX) * drag.scale,
    );
    const nextY = Math.round(
      drag.startWindowY + (event.screenY - drag.startScreenY) * drag.scale,
    );

    await invoke("move_dock_shell_position", { x: nextX, y: nextY });
  }

  function handleVoiceDockCommand(command: DockCommand) {
    switch (command) {
      case "start":
        void startCapture();
        break;
      case "stop":
        void stopCapture();
        break;
      case "stop_submit":
        forcePressEnterAfterPasteRef.current = true;
        void stopCapture().finally(() => {
          forcePressEnterAfterPasteRef.current = false;
        });
        break;
      case "cancel":
        void cancelCapture();
        break;
      case "retry":
        void startCapture();
        break;
      case "copy":
        void copyTranscriptFallback();
        break;
      case "paste_last_safe":
        void pasteLastToForegroundTarget();
        break;
      case "clear_preset":
        clearActivePreset();
        break;
    }
  }

  function applyDesktopControlSessionToUi(
    session: DesktopDictationSession,
    failureMessage: string,
  ) {
    setDesktopRecoveryAction(session.recoveryAction);

    if (session.state === "listening") {
      setPipelineUi({
        status: "idle",
        message: "Capture an artifact before checking the safe host boundary.",
      });
      setCapture({
        state: "recording",
        message: captureRuntime.listeningMessage,
      });
      return;
    }

    const result = getAppSessionCaptureResult(session);
    const summary = getAppSessionSummary(session);

    setCapture({
      state: result?.ok ? "captured" : session.state === "cancelled" ? "cancelled" : "failed",
      message: result?.ok
        ? captureRuntime.capturedMessage
        : session.error?.message ?? failureMessage,
      result,
    });

    if (summary?.terminalState === "done") {
      setPipelineUi({
        status: "done",
        message:
          describeDeliveryEvidence(summary.deliveryEvidence) ??
          (summary.transcript
            ? "Transcript is available from the captured run."
            : "Captured run completed without transcript text."),
        summary,
      });
      return;
    }

    if (session.state === "cancelled" || summary?.terminalState === "cancelled") {
      setPipelineUi({
        status: "cancelled",
        message: "Captured run was cancelled before completion.",
        summary,
      });
      return;
    }

    setPipelineUi({
      status: "error",
      message: session.error?.message ?? summary?.error?.message ?? "Captured run failed.",
      summary,
    });
  }

  useEffect(() => {
    hostCommandHandlerRef.current = handleHostCommandPayload;
  });

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForTauriHostCommands((payload) => {
      void hostCommandHandlerRef.current?.(payload);
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten?.();
        return;
      }

      unlisten = nextUnlisten;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    const handleSmokeHostCommand = (event: Event) => {
      const payload = event instanceof CustomEvent ? event.detail : undefined;
      const command = payload?.command;
      if (typeof command !== "string") {
        return;
      }

      handleHostCommandPayload({ ...payload, command });
    };

    window.addEventListener(
      "dictation-tauri:host-command",
      handleSmokeHostCommand,
    );

    return () => {
      window.removeEventListener(
        "dictation-tauri:host-command",
        handleSmokeHostCommand,
      );
    };
  }, [voiceDockState.phase, pipelineUi.summary]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;
    const handledStorageCommandIds = new Set<string>();

    const handleStoredCommand = (raw: string | null) => {
      if (!raw) {
        return;
      }
      try {
        const parsed = JSON.parse(raw) as { id?: string; payload?: DockCompanionCommandPayload };
        if (!parsed.id || !parsed.payload || handledStorageCommandIds.has(parsed.id)) {
          return;
        }
        handledStorageCommandIds.add(parsed.id);
        handleCompanionCommandPayload(parsed.payload);
      } catch {
        // Ignore malformed fallback bridge payloads.
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === dockCompanionCommandStorageKey) {
        handleStoredCommand(event.newValue);
      }
    };

    window.addEventListener("storage", handleStorage);

    void listen<DockCompanionCommandPayload>(dockCompanionCommandEvent, (event) => {
      if (!disposed) {
        handleCompanionCommandPayload(event.payload);
      }
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten?.();
        return;
      }

      unlisten = nextUnlisten;
    });

    return () => {
      disposed = true;
      window.removeEventListener("storage", handleStorage);
      unlisten?.();
    };
  }, [pipelineUi.summary, recoveryKey, resultHistoryEntries, settingsPanelOpen]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const handleGlobalHotkey = async (event: Parameters<typeof resolveDictationKeyEvent>[1]) => {
      if (disposed) {
        return;
      }

      const resolution = resolveDictationKeyEvent(
        dictationKeyStateRef.current,
        event,
        { activeSessionCanCancel: canCancelDictationRef.current },
      );
      dictationKeyStateRef.current = resolution.state;

      if (resolution.decision.action === "defer_stop_until_started") {
        deferredStopEventIdRef.current = event.eventId ?? event.receivedAt;
        return;
      }

      const controlAction = dictationKeyDecisionToControlAction(resolution.decision);
      if (!controlAction) {
        return;
      }

      if (controlAction === "start") {
        await prepareDictationStartContext({ targetSnapshot: event.targetSnapshot });
        setCapture({
          state: "requesting_permission",
          message: captureRuntime.permissionMessage,
        });
      }

      if (controlAction === "stop") {
        setCapture({
          state: "stopping",
          message: captureRuntime.stoppingMessage,
        });
        setPipelineUi({
          status: "running",
          message: isTauri()
            ? "Submitting captured audio for transcription."
            : "Checking the safe host boundary without a provider call.",
        });
        await waitForHotkeyRelease();
        await rememberSelectionTransformContext();
      }

      const session = await desktopSession.handle(controlAction, {
        source: "global_hotkey",
        id: event.eventId,
        receivedAt: event.receivedAt,
      });

      if (controlAction === "start" && session.state === "listening") {
        dictationKeyStateRef.current = markDictationKeyStarted(
          dictationKeyStateRef.current,
          session.sessionId,
        );
      }

      applyDesktopControlSessionToUi(
        session,
        "Dictation key did not produce a captured artifact.",
      );

      if (controlAction === "start" && session.state !== "listening") {
        dictationKeyStateRef.current = resetDictationKeyState(
          dictationKeyStateRef.current,
        );
        deferredStopEventIdRef.current = undefined;
        return;
      }

      if (controlAction !== "start") {
        dictationKeyStateRef.current = resetDictationKeyState(
          dictationKeyStateRef.current,
        );
        deferredStopEventIdRef.current = undefined;
        return;
      }

      const deferredStopEventId = deferredStopEventIdRef.current;
      if (!deferredStopEventId || session.state !== "listening") {
        return;
      }

      deferredStopEventIdRef.current = undefined;
      const stopped = await desktopSession.handle("stop", {
        source: "global_hotkey",
        id: `${deferredStopEventId}:deferred-stop`,
        receivedAt: event.receivedAt,
      });
      dictationKeyStateRef.current = resetDictationKeyState(
        dictationKeyStateRef.current,
      );
      applyDesktopControlSessionToUi(
        stopped,
        "Dictation key release did not produce a captured artifact.",
      );
    };

    void listenForTauriGlobalHotkey(handleGlobalHotkey).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten?.();
        return;
      }

      unlisten = nextUnlisten;
      void drainTauriGlobalHotkeyEvents(handleGlobalHotkey).catch(() => undefined);
    });

    return () => {
      disposed = true;
      unlisten?.();
      void setTauriGlobalHotkeyListenerReady(false).catch(() => undefined);
    };
  }, [desktopSession]);

  return (
    <main className="app-shell" data-testid="capture-surface">
      <section className="voice-panel" aria-labelledby="voice-title">
        <div className="voice-header">
          <div>
            <p className="eyebrow">Desktop dictation</p>
            <h1 id="voice-title">Dictation Dock</h1>
          </div>
          <span
            className={`status-chip status-chip--${voiceDockState.phase === "idle" ? "idle" : capture.state}`}
            data-testid="capture-state"
          >
            {voiceDockState.statusText}
          </span>
        </div>

        <VoiceDock
          state={voiceDockState}
          hotkeyLabel={voiceDockHotkey}
          transcriptPreview={assistantHandledBySurface ? undefined : transcriptReview?.text}
          onCommand={handleVoiceDockCommand}
          onDockDragStart={handleDockDragStart}
          onDockDragMove={handleDockDragMove}
          onDockDragEnd={handleDockDragEnd}
          onContextMenuRequest={() => {
            if (!isTauri()) {
              return;
            }

            void invoke("show_dock_context_menu").catch(() => undefined);
          }}
        />

        {companionSnapshot.visible && (
          <section className="dock-companion-panel" aria-label="Dock companion">
            <CompanionSurfaceView
              snapshot={companionSnapshot}
              onCommand={handleCompanionCommandPayload}
              showRecoveryActions={false}
            />
          </section>
        )}

        <details className="debug-details">
          <summary>Developer evidence</summary>

        <div className="capture-readout" aria-live="polite">
          <span className={`state-dot state-dot--${capture.state}`} />
          <p>{capture.message}</p>
        </div>

        <div className="control-row" aria-label="Capture controls">
          <button
            type="button"
            className="button button-primary"
            disabled={!canStart}
            onClick={() => void startCapture()}
          >
            Start capture
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={!canStop}
            onClick={stopCapture}
          >
            Stop capture
          </button>
          <button
            type="button"
            className="button button-ghost"
            disabled={!canCancel}
            onClick={cancelCapture}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={!canSubmit}
            onClick={() => void submitCapturedRun()}
          >
            Check host boundary
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={!canTranscribeWithProvider}
            onClick={transcribeCapturedRunWithProvider}
          >
            Transcribe with provider
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={!canCopyTranscript}
            onClick={copyTranscriptFallback}
          >
            {reviewCopyLabel}
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={!canCopyTranscript}
            onClick={markSafePasteLastRecovery}
          >
            Paste last (safe)
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={refreshHostReadiness}
          >
            Refresh readiness
          </button>
        </div>

        <dl className="status-grid" aria-label="Capture evidence">
          <div>
            <dt>Gateway</dt>
            <dd>{captureRuntime.label}</dd>
          </div>
          <div>
            <dt>Permission</dt>
            <dd>{capture.result?.metadata.permissionStatus ?? "granted"}</dd>
          </div>
          <div>
            <dt>Artifact</dt>
            <dd>{artifact ? `${artifact.extension}, ${artifact.sizeBytes} B` : "None"}</dd>
          </div>
          <div>
            <dt>Pipeline</dt>
            <dd data-testid="pipeline-state">
              {pipelineStatusLabels[pipelineUi.status]}
            </dd>
          </div>
          <div>
            <dt>Host</dt>
            <dd>{hostRuntime.label}</dd>
          </div>
          <div>
            <dt>Readiness</dt>
            <dd data-testid="host-readiness-state">
              {hostReadinessUi.statusLabel}
            </dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd data-testid="host-readiness-provider">
              {hostReadinessUi.providerLabel}
            </dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd data-testid="host-readiness-model">
              {hostReadinessUi.modelLabel}
            </dd>
          </div>
          <div>
            <dt>Host calls</dt>
            <dd>{hostReadinessUi.supportsRealProviderCallLabel}</dd>
          </div>
          <div>
            <dt>Managed cloud</dt>
            <dd>{hostReadinessUi.managedCloudLabel}</dd>
          </div>
          <div>
            <dt>Device</dt>
            <dd>{hostReadinessUi.managedDeviceLabel}</dd>
          </div>
          <div>
            <dt>Direct BYOK</dt>
            <dd>{hostReadinessUi.directByokLabel}</dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>{describeDeveloperDeliveryStatus(deliveryEvidence)}</dd>
          </div>
          <div>
            <dt>Result</dt>
            <dd>{transcriptReview?.source === "selection_transform" ? "Selection transform" : transcriptReview ? "Dictation" : "Not available"}</dd>
          </div>
          <div>
            <dt>Hotkey</dt>
            <dd>{isTauri() ? effectiveHotkeyLabel : "Unavailable in browser"}</dd>
          </div>
        </dl>

        <p
          className={`readiness-line readiness-line--${hostReadinessUi.status}`}
          data-testid="host-readiness-message"
        >
          {hostReadinessUi.detail}
        </p>

        {artifact ? (
          <p className="evidence-line" data-testid="capture-artifact">
            {artifact.relativePath}
          </p>
        ) : null}

        {error ? (
          <p className="error-line" role="status">
            {error.message}
          </p>
        ) : null}

        <p
          className={`pipeline-line pipeline-line--${pipelineTone}`}
          data-testid="pipeline-message"
        >
          {pipelineUi.message}
        </p>

        {redactedRunSummary ? (
          <p className="evidence-line" data-testid="redacted-run-summary">
            {redactedRunSummary}
          </p>
        ) : null}

        {transcriptReview ? (
          <section className="transcript-review" data-testid="transcript-review" data-source={transcriptReview.source}>
            <h2>{describeTranscriptReviewTitle(transcriptReview)}</h2>
            <p>{transcriptReview.text}</p>
            <p className="evidence-line" data-testid="latest-result-recovery">
              {describeLatestResultRecovery(transcriptReview)}
            </p>
            <dl>
              <div>
                <dt>Provider</dt>
                <dd>{transcriptReview.provider ?? "unknown"}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{transcriptReview.model ?? "unknown"}</dd>
              </div>
              <div>
                <dt>Latency</dt>
                <dd>
                  {transcriptReview.latencyMs === undefined
                    ? "unknown"
                    : `${transcriptReview.latencyMs} ms`}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        {recoveryAction ? (
          <p className="evidence-line" data-testid="recovery-action">
            {recoveryAction}
          </p>
        ) : null}
        </details>
      </section>
    </main>
  );
}

export function App() {
  const appSurface = getAppSurface();
  if (appSurface === "companion" || appSurface === "preset-picker") {
    return <CompanionSurface surface={appSurface} />;
  }
  if (appSurface === "settings") {
    return <SettingsSurface />;
  }
  if (appSurface === "onboarding") {
    if (isTauri()) {
      return <SetupReadinessRouter invoke={invoke} renderReady={() => <DockSurface />} onExit={exitOnboarding} />;
    }
    return (
      <OnboardingSurface
        controller={createAccountFirstFixtureController({
          callback: "signed_in",
          link: "linked",
          microphone: "granted",
          shortcut: "recommended",
        })}
        onExit={exitOnboarding}
      />
    );
  }

  if (isTauri()) {
    return <TauriAccountGate invoke={invoke} renderReady={() => <DockSurface />} />;
  }

  return <DockSurface />;
}
