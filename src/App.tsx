import { useEffect, useMemo, useState } from "react";
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
  createCopyDeliveryGateway,
  type DeliveryEvidence as DesktopDeliveryEvidence,
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
import { latestResultFromPipelineSummary } from "./selection-transform";
import { PipelineService } from "./pipeline/service";
import type {
  DeliveryEvidence as PipelineDeliveryEvidence,
  SimulatedRunSummary,
} from "./pipeline/types";

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

export function App() {
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
  const desktopSession = useMemo(() => {
    const controller = new DesktopDictationController({
      capture: createCaptureGatewayControllerAdapter(gateway),
      runtime: createHostRuntimeControllerAdapter(hostRuntime.client),
    });

    return createAppSessionControllerFacade(controller);
  }, [gateway, hostRuntime.client]);
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

  async function refreshHostReadiness() {
    setHostReadinessUi(describeHostReadiness());
    setHostReadinessUi(await loadHostReadinessUi(hostRuntime.client));
  }

  async function startCapture() {
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
      message: "Checking the safe host boundary without a provider call.",
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
      </section>
    </main>
  );
}
