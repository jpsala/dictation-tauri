import { useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
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
import { DesktopDictationController } from "./desktop-control/controller";
import type { DesktopRecoveryAction } from "./desktop-control";
import {
  captureTauriDesktopDeliveryTarget,
  createCopyDeliveryGateway,
  createTauriSavedTargetDeliveryGateway,
  type DeliveryEvidence as DesktopDeliveryEvidence,
  type TauriDesktopDeliveryTarget,
} from "./delivery";
import { createHostClientTranscriptionAdapter } from "./host-runtime/pipeline-adapter";
import {
  describeHostReadiness,
  describeHostReadinessFailure,
  type HostReadinessUiState,
} from "./host-runtime/readiness-ui";
import { createHostRuntimeClientRuntime } from "./host-runtime/runtime-selection";
import type { HostRuntimeClient } from "./host-runtime/types";
import {
  deriveRuntimeRecoveryAction,
  type RuntimeRecoveryAction,
} from "./model-gateway/runtime-transcription";
import { createCapturedAudioPipelineRequest } from "./pipeline/ports";
import {
  listenForTauriGlobalHotkey,
  listenForTauriHostCommands,
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
import { latestResultFromPipelineSummary } from "./selection-transform";
import { PipelineService } from "./pipeline/service";
import type {
  DeliveryEvidence as PipelineDeliveryEvidence,
  SimulatedRunSummary,
} from "./pipeline/types";
import {
  createVoiceDockState,
  VoiceDock,
  type DockActivePreset,
  type DockCommand,
} from "./voice-dock";
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
  provider?: string;
  model?: string;
  latencyMs?: number;
  requestId?: string;
};

type ResultHistoryEntry = {
  schemaVersion: 1;
  id: string;
  runId: string;
  source: "dictation" | "selection_transform";
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

type CaptureGatewayRuntime = {
  gateway: CaptureGateway;
  label: string;
  readyMessage: string;
  permissionMessage: string;
  listeningMessage: string;
  stoppingMessage: string;
  capturedMessage: string;
};

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

const captureStateLabels: Record<CaptureState, string> = {
  idle: "Idle",
  permission_needed: "Permission needed",
  requesting_permission: "Checking microphone",
  recording: "Listening",
  stopping: "Stopping",
  captured: "Captured",
  failed: "Failed",
  cancelled: "Cancelled",
};

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
      return deriveRuntimeRecoveryAction({
        status: classifyTranscriptionFailure(summary.error.message),
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

export function getTranscriptReview(
  summary?: SimulatedRunSummary,
): TranscriptReview | undefined {
  const latestResult = latestResultFromPipelineSummary(summary);

  if (!summary || !latestResult) {
    return undefined;
  }

  const transcriptionEvent = findTranscriptionCompletedEvent(summary);

  return {
    text: latestResult.text,
    provider: transcriptionEvent?.data.stt?.provider,
    model: transcriptionEvent?.data.stt?.model,
    latencyMs: transcriptionEvent?.data.latencyMs,
    requestId: transcriptionEvent?.data.stt?.requestId,
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

function presetDisplayName(presetId: "rewrite" | "shorten" | "bulletize"): string {
  switch (presetId) {
    case "rewrite":
      return "Rewrite";
    case "shorten":
      return "Shorten";
    case "bulletize":
      return "Bulletize";
  }
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
    normalized.includes("unavailable")
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

function describeDeliveryEvidence(
  evidence: PipelineDeliveryEvidence | undefined,
): string | undefined {
  switch (evidence?.status) {
    case "available":
      return "Transcript is available locally. Delivery has not been observed.";
    case "copied":
      return evidence.reason ?? "Transcript copied as fallback.";
    case "uncertain":
      return evidence.reason ?? "Delivery remains uncertain; transcript is still available.";
    case "paste_sent":
      return "Paste was sent, but observation is not implemented in this batch.";
    case "failed":
      return evidence.reason ?? "Delivery failed before a confirmed handoff.";
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

function mapPipelineEvidenceToDesktopEvidence(
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
  const status =
    output && (evidence.status === "uncertain" || evidence.status === "failed")
      ? "available"
      : evidence.status;

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

function getAppSurface(): "dock" | "companion" {
  if (typeof window === "undefined") {
    return "dock";
  }
  return new URLSearchParams(window.location.search).get("surface") === "companion"
    ? "companion"
    : "dock";
}

function CompanionSurface() {
  return (
    <main className="companion-shell" aria-label="Dock companion">
      <section className="dock-companion-card dock-companion-card--standalone">
        <p className="dock-companion-kicker">Companion</p>
        <strong>Recovery and history surface</strong>
        <p>Dictation Tauri keeps the dock compact and uses this no-activate companion window for richer recovery, history, and settings.</p>
      </section>
    </main>
  );
}

export function App() {
  if (getAppSurface() === "companion") {
    return <CompanionSurface />;
  }

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
  const pressEnterAfterPasteRef = useRef(false);
  const desktopDelivery = useMemo(
    () =>
      isTauri()
        ? createTauriSavedTargetDeliveryGateway({
            invoke,
            getTarget: () => savedDeliveryTargetRef.current,
            getPressEnterAfterPaste: () => pressEnterAfterPasteRef.current,
          })
        : undefined,
    [],
  );
  const desktopSession = useMemo(() => {
    const controller = new DesktopDictationController({
      capture: createCaptureGatewayControllerAdapter(gateway),
      runtime: createHostRuntimeControllerAdapter(
        hostRuntime.client,
        isTauri() ? { mode: "real", allowProviderCall: true } : undefined,
      ),
      delivery: desktopDelivery,
      allowDesktopDeliverySideEffects: isTauri(),
    });

    return createAppSessionControllerFacade(controller);
  }, [desktopDelivery, gateway, hostRuntime.client]);
  const dictationKeyStateRef = useRef(createInitialDictationKeyState());
  const deferredStopEventIdRef = useRef<string | undefined>(undefined);
  const copyDelivery = useMemo(
    () =>
      createCopyDeliveryGateway({
        async copyText(text) {
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
  const [dockVu, setDockVu] = useState({
    level: 0,
    bands: [0, 0, 0, 0, 0, 0, 0],
  });
  const [effectiveHotkeyLabel, setEffectiveHotkeyLabel] = useState(tauriGlobalHotkeyShortcut);
  const [activePreset, setActivePreset] = useState<DockActivePreset | undefined>();
  const [resultHistoryEntries, setResultHistoryEntries] = useState<ResultHistoryEntry[]>([]);
  const [resultHistoryOpen, setResultHistoryOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const persistedHistoryEntryIdRef = useRef<string | undefined>(undefined);

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

  async function rememberDeliveryTarget() {
    if (!isTauri()) {
      savedDeliveryTargetRef.current = undefined;
      return;
    }

    savedDeliveryTargetRef.current = await captureTauriDesktopDeliveryTarget(invoke);
  }

  async function startCapture() {
    await rememberDeliveryTarget();
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
      setCapture({
        state: "recording",
        message: captureRuntime.listeningMessage,
      });
      return;
    }

    setCapture({
      state: session.error?.code === "capture-start-failed" ? "permission_needed" : "failed",
      message: session.error?.message ?? "A capture session is already active.",
    });
  }

  async function stopCapture() {
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

    setPipelineUi({
      status: "error",
      message: session.error?.message ?? summary?.error?.message ?? "Captured run failed.",
      summary,
    });
  }

  async function cancelCapture() {
    const session = await desktopSession.cancel();
    setDesktopRecoveryAction(session.recoveryAction);
    const result = getAppSessionCaptureResult(session);
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
            ? { mode: "real", allowProviderCall: true }
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

      setPipelineUi({
        status: "error",
        message: summary.error?.message ?? "Captured run failed.",
        summary,
      });
    } catch {
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
          ? "Clipboard copy failed. Transcript remains available in the app."
          : "Transcript copied as fallback."),
      summary: nextSummary,
    });
  }

  function markSafePasteLastRecovery() {
    const summary = pipelineUi.summary;
    const latestResult = latestResultFromPipelineSummary(summary);

    if (!summary || !latestResult) {
      setPipelineUi({
        status: "error",
        message: "No latest transcript is available for paste-last recovery.",
        summary,
      });
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

  const canStart =
    capture.state === "idle" ||
    capture.state === "captured" ||
    capture.state === "failed" ||
    capture.state === "cancelled" ||
    capture.state === "permission_needed";
  const canStop = capture.state === "recording";
  const canCancel =
    capture.state === "recording" || capture.state === "requesting_permission";
  const canSubmit = Boolean(capture.result?.ok) && pipelineUi.status !== "running";
  const canTranscribeWithProvider =
    canSubmit && hostReadinessUi.status === "configured";
  const canCopyTranscript = Boolean(
    latestResultFromPipelineSummary(pipelineUi.summary),
  );
  const artifact = capture.result?.ok ? capture.result.artifact : undefined;
  const error = capture.result && !capture.result.ok ? capture.result.error : undefined;
  const deliveryEvidence = pipelineUi.summary?.deliveryEvidence;
  const transcriptReview = getTranscriptReview(pipelineUi.summary);
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
      vuLevel: capture.state === "recording" ? dockVu.level : pipelineUi.status === "running" ? 0.42 : 0,
      vuBands: createDockVuBands(capture.state, pipelineUi.status, dockVu.bands),
    },
  );
  const voiceDockHotkey = isTauri()
    ? effectiveHotkeyLabel
    : "Dock button";

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    void invoke("update_dock_shell_state", { state: voiceDockState.phase }).catch(() => {
      // Dock shell updates are best-effort; renderer state remains the source of truth.
    });
  }, [voiceDockState.phase]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const shouldShowCompanion = Boolean(resultHistoryOpen || settingsPanelOpen || voiceDockState.recovery);
    void invoke(shouldShowCompanion ? "show_companion" : "hide_companion").catch(() => undefined);
  }, [resultHistoryOpen, settingsPanelOpen, voiceDockState.recovery]);

  async function loadResultHistory() {
    if (!isTauri()) {
      setResultHistoryOpen(true);
      return;
    }

    const entries = await invoke<ResultHistoryEntry[]>("list_result_history_entries");
    setResultHistoryEntries(entries);
    setResultHistoryOpen(true);
  }

  function handleHostCommandPayload(payload: Required<Pick<TauriHostCommandPayload, "command">> & Omit<TauriHostCommandPayload, "command">) {
    switch (payload.command) {
      case "select_preset":
        if (payload.presetId) {
          setActivePreset({
            presetId: payload.presetId,
            presetName: presetDisplayName(payload.presetId),
            appKey: "global",
          });
        }
        break;
      case "clear_preset":
        setActivePreset(undefined);
        break;
      case "show_result_history":
        void loadResultHistory();
        break;
      case "open_settings":
        setSettingsPanelOpen(true);
        break;
      default:
        handleVoiceDockCommand(payload.command);
    }
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
        pressEnterAfterPasteRef.current = true;
        void stopCapture().finally(() => {
          pressEnterAfterPasteRef.current = false;
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
        markSafePasteLastRecovery();
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
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForTauriHostCommands((payload) => {
      handleHostCommandPayload(payload);
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
  }, [voiceDockState.phase, pipelineUi.summary]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForTauriGlobalHotkey(async (event) => {
      const resolution = resolveDictationKeyEvent(
        dictationKeyStateRef.current,
        event,
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
        await rememberDeliveryTarget();
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
  }, [desktopSession]);

  return (
    <main className="app-shell" data-testid="capture-surface">
      <section className="voice-panel" aria-labelledby="voice-title">
        <div className="voice-header">
          <div>
            <p className="eyebrow">MVP 3 capture</p>
            <h1 id="voice-title">Dictation Tauri</h1>
          </div>
          <span
            className={`status-chip status-chip--${capture.state}`}
            data-testid="capture-state"
          >
            {captureStateLabels[capture.state]}
          </span>
        </div>

        <VoiceDock
          state={voiceDockState}
          hotkeyLabel={voiceDockHotkey}
          transcriptPreview={transcriptReview?.text}
          onCommand={handleVoiceDockCommand}
          onContextMenuRequest={() => {
            if (!isTauri()) {
              return;
            }

            void invoke("show_dock_context_menu").catch(() => undefined);
          }}
        />

        {(resultHistoryOpen || settingsPanelOpen || voiceDockState.recovery) && (
          <section className="dock-companion-panel" aria-label="Dock companion">
            {voiceDockState.recovery && (
              <div className="dock-companion-card">
                <p className="dock-companion-kicker">Recovery</p>
                <strong>{voiceDockState.recovery.title}</strong>
                <p>{voiceDockState.recovery.message}</p>
              </div>
            )}
            {resultHistoryOpen && (
              <div className="dock-companion-card">
                <p className="dock-companion-kicker">Result history</p>
                {resultHistoryEntries.length === 0 ? (
                  <p>No reusable results saved yet.</p>
                ) : (
                  <ul>
                    {resultHistoryEntries.slice(-5).reverse().map((entry) => (
                      <li key={entry.id}>
                        {entry.source.replace("_", " ")} · {entry.textLength} chars · {entry.deliveryEvidence?.status ?? "available"}
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setResultHistoryOpen(false)}
                >
                  Dismiss
                </button>
              </div>
            )}
            {settingsPanelOpen && (
              <div className="dock-companion-card">
                <p className="dock-companion-kicker">Settings</p>
                <strong>Dock settings are staged.</strong>
                <p>Use the tray/context menu for presets while the full settings surface is built.</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setSettingsPanelOpen(false)}
                >
                  Dismiss
                </button>
              </div>
            )}
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
            onClick={startCapture}
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
            Copy transcript
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
            <dd>{deliveryEvidence?.status ?? "Not available"}</dd>
          </div>
          <div>
            <dt>Hotkey</dt>
            <dd>{isTauri() ? tauriGlobalHotkeyShortcut : "Unavailable in browser"}</dd>
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

        {transcriptReview ? (
          <section className="transcript-review" data-testid="transcript-review">
            <h2>Transcript review</h2>
            <p>{transcriptReview.text}</p>
            <p className="evidence-line" data-testid="latest-result-recovery">
              Latest transcript is recoverable in this session. Paste-last safe mode does not send keys or observe insertion.
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
