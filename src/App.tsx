import { useMemo, useState } from "react";
import { FakeCaptureGateway } from "./capture/fake-gateway";
import type { CaptureResult, CaptureState } from "./capture/types";
import { createCapturedAudioTranscriptionAdapter } from "./model-gateway/direct-stt";
import { createCapturedAudioPipelineRequest } from "./pipeline/ports";
import { PipelineService } from "./pipeline/service";
import type { SimulatedRunSummary } from "./pipeline/types";

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
        setPipelineUi({
          status: "done",
          message: summary.transcript
            ? "Transcript is available from the captured run."
            : "Captured run completed without transcript text.",
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
  const artifact = capture.result?.ok ? capture.result.artifact : undefined;
  const error = capture.result && !capture.result.ok ? capture.result.error : undefined;
  const pipelineTone =
    pipelineUi.status === "done"
      ? "captured"
      : pipelineUi.status === "error"
        ? "failed"
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
      </section>
    </main>
  );
}
