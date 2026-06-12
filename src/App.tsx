import { useMemo, useState } from "react";
import { FakeCaptureGateway } from "./capture/fake-gateway";
import type { CaptureResult, CaptureState } from "./capture/types";
import { createCapturedAudioTranscriptionAdapter } from "./model-gateway/direct-stt";
import { createCapturedAudioPipelineRequest } from "./pipeline/ports";
import { PipelineService } from "./pipeline/service";
import type {
  DeliveryEvidence,
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

  if (!summary.deliveryEvidence?.output) {
    return summary;
  }

  return {
    ...summary,
    deliveryEvidence: {
      status: "copied",
      output: summary.deliveryEvidence.output,
      reason: "Transcript copied as fallback.",
    },
  };
}

export function getRecoveryAction(
  summary?: SimulatedRunSummary,
): string | undefined {
  if (!summary) {
    return undefined;
  }

  if (summary.terminalState === "cancelled") {
    return "Start a new capture when you are ready.";
  }

  if (summary.terminalState === "error") {
    switch (summary.error?.phase) {
      case "listening":
        return "Check microphone permission or device setup, then capture again.";
      case "transcribing":
        return "Check STT provider setup or retry the captured artifact.";
      case "delivering":
        return "Copy the transcript fallback or retry delivery.";
      default:
        return "Retry the captured run after resolving the reported setup issue.";
    }
  }

  switch (summary.deliveryEvidence?.status) {
    case "available":
      return "Copy the transcript when you are ready to recover the result.";
    case "uncertain":
      return "Copy the transcript or retry delivery without claiming paste success.";
    case "copied":
      return "Paste the copied transcript into the target app.";
    case "failed":
      return "Retry the captured run after resolving the reported delivery issue.";
    default:
      return undefined;
  }
}

function describeDeliveryEvidence(
  evidence: DeliveryEvidence | undefined,
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
  const gateway = useMemo(() => new FakeCaptureGateway(), []);
  const pipeline = useMemo(
    () =>
      new PipelineService({
        transcriptionAdapter: createCapturedAudioTranscriptionAdapter(),
      }),
    [],
  );
  const [capture, setCapture] = useState<CaptureUiState>({
    state: "idle",
    message: "Ready for a fake microphone capture check.",
  });
  const [pipelineUi, setPipelineUi] = useState<PipelineUiState>({
    status: "idle",
    message: "Capture an artifact before submitting it to the STT shell.",
  });

  async function startCapture() {
    setPipelineUi({
      status: "idle",
      message: "Capture an artifact before submitting it to the STT shell.",
    });
    setCapture({
      state: "requesting_permission",
      message: "Checking capture permission without opening a real microphone.",
    });

    const permissionStatus = await gateway.getPermissionState();
    if (permissionStatus !== "granted") {
      setCapture({
        state: "permission_needed",
        message: "Microphone capture is not available in this test adapter.",
      });
      return;
    }

    try {
      await gateway.startCapture();
      setCapture({
        state: "recording",
        message: "Listening through the fake capture gateway.",
      });
    } catch {
      setCapture({
        state: "failed",
        message: "A capture session is already active.",
      });
    }
  }

  async function stopCapture() {
    setCapture({
      state: "stopping",
      message: "Finalizing the fake captured audio artifact.",
    });

    const result = await gateway.stopCapture();
    setPipelineUi({
      status: "idle",
      message: result.ok
        ? "Captured artifact can be submitted to the STT shell."
        : "Capture failed before pipeline submission.",
    });
    setCapture({
      state: result.ok ? "captured" : "failed",
      message: result.ok
        ? "Fake captured audio artifact is ready."
        : result.error.message,
      result,
    });
  }

  async function cancelCapture() {
    const result = await gateway.cancelCapture();
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

  async function submitCapturedRun() {
    if (!capture.result?.ok) {
      setPipelineUi({
        status: "error",
        message: "No captured artifact is available for pipeline submission.",
      });
      return;
    }

    setPipelineUi({
      status: "running",
      message: "Submitting captured artifact to the credential-free STT shell.",
    });

    try {
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

  async function copyTranscriptFallback() {
    const summary = pipelineUi.summary;
    const text =
      summary?.deliveryEvidence?.output ?? summary?.output ?? summary?.transcript;

    if (!summary || !text) {
      setPipelineUi({
        status: "error",
        message: "No transcript is available to copy.",
        summary,
      });
      return;
    }

    if (!navigator.clipboard?.writeText) {
      setPipelineUi({
        status: "error",
        message: "Clipboard fallback is unavailable in this environment.",
        summary,
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      const copiedSummary = applyCopiedFallback(summary);
      setPipelineUi({
        status: "done",
        message: describeDeliveryEvidence(copiedSummary.deliveryEvidence) ??
          "Transcript copied as fallback.",
        summary: copiedSummary,
      });
    } catch {
      setPipelineUi({
        status: "error",
        message: "Clipboard copy failed. Transcript remains available in the app.",
        summary,
      });
    }
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
  const canCopyTranscript = Boolean(
    pipelineUi.summary?.deliveryEvidence?.output ??
      pipelineUi.summary?.output ??
      pipelineUi.summary?.transcript,
  );
  const artifact = capture.result?.ok ? capture.result.artifact : undefined;
  const error = capture.result && !capture.result.ok ? capture.result.error : undefined;
  const deliveryEvidence = pipelineUi.summary?.deliveryEvidence;
  const recoveryAction = getRecoveryAction(pipelineUi.summary);
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
            onClick={submitCapturedRun}
          >
            Submit captured run
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={!canCopyTranscript}
            onClick={copyTranscriptFallback}
          >
            Copy transcript
          </button>
        </div>

        <dl className="status-grid" aria-label="Capture evidence">
          <div>
            <dt>Gateway</dt>
            <dd>Fake capture</dd>
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
            <dt>Delivery</dt>
            <dd>{deliveryEvidence?.status ?? "Not available"}</dd>
          </div>
        </dl>

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

        {recoveryAction ? (
          <p className="evidence-line" data-testid="recovery-action">
            {recoveryAction}
          </p>
        ) : null}
      </section>
    </main>
  );
}
