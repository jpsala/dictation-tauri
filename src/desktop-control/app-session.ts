import type { CaptureGateway } from "../capture/gateway";
import type { CapturePermissionStatus, CaptureResult } from "../capture/types";
import { createHostClientTranscriptionAdapter } from "../host-runtime/pipeline-adapter";
import type { HostRuntimeClient } from "../host-runtime/types";
import { createCapturedAudioPipelineRequest } from "../pipeline/ports";
import { PipelineService } from "../pipeline/service";
import type { SimulatedRunSummary } from "../pipeline/types";
import type {
  DesktopCaptureGateway,
  DesktopRuntimeGateway,
  DesktopRuntimeResult,
} from "./controller";
import type {
  DesktopControlAction,
  DesktopControlEvent,
  DesktopControlSource,
  DesktopDictationController,
  DesktopDictationSession,
} from "./types";
import { createDesktopControlEvent } from "./types";

export type AppSessionControllerFacade = {
  start(): Promise<DesktopDictationSession>;
  stop(): Promise<DesktopDictationSession>;
  cancel(): Promise<DesktopDictationSession>;
  retry(): Promise<DesktopDictationSession>;
  toggle(options?: { source?: DesktopControlSource }): Promise<DesktopDictationSession>;
  handle(
    action: DesktopControlAction,
    options?: {
      source?: DesktopControlSource;
      id?: string;
      receivedAt?: string;
    },
  ): Promise<DesktopDictationSession>;
};

export type AppDesktopRuntimeResult = DesktopRuntimeResult & {
  summary: SimulatedRunSummary;
};

export type AppSessionRuntimeOptions = {
  mode?: "dry-run" | "real";
  allowProviderCall?: boolean;
};

export function createAppSessionControllerFacade(
  controller: DesktopDictationController,
  options: {
    source?: DesktopControlSource;
    now?: () => string;
    createEventId?: (action: DesktopControlAction) => string;
  } = {},
): AppSessionControllerFacade {
  return {
    start: () => controller.handleControl(createAppControlEvent("start", options)),
    stop: () => controller.handleControl(createAppControlEvent("stop", options)),
    cancel: () => controller.handleControl(createAppControlEvent("cancel", options)),
    retry: () => controller.handleControl(createAppControlEvent("retry", options)),
    toggle: (toggleOptions = {}) =>
      controller.handleControl(
        createAppControlEvent("toggle", {
          ...options,
          source: toggleOptions.source ?? options.source,
        }),
      ),
    handle: (action, handleOptions = {}) =>
      controller.handleControl(
        createAppControlEvent(action, {
          ...options,
          source: handleOptions.source ?? options.source,
          id: handleOptions.id,
          receivedAt: handleOptions.receivedAt,
        }),
      ),
  };
}

export function createAppControlEvent(
  action: DesktopControlAction,
  options: {
    source?: DesktopControlSource;
    now?: () => string;
    createEventId?: (action: DesktopControlAction) => string;
    id?: string;
    receivedAt?: string;
  } = {},
): DesktopControlEvent {
  const receivedAt = options.receivedAt ?? options.now?.() ?? new Date().toISOString();

  return createDesktopControlEvent({
    id: options.id ?? options.createEventId?.(action),
    source: options.source ?? "app_button",
    action,
    receivedAt,
  });
}

export function createCaptureGatewayControllerAdapter(
  gateway: CaptureGateway,
): DesktopCaptureGateway {
  return {
    async start() {
      const permissionStatus = await gateway.getPermissionState();
      assertCapturePermissionAvailable(permissionStatus);
      return gateway.startCapture();
    },
    async stop() {
      return gateway.stopCapture();
    },
    async cancel() {
      await gateway.cancelCapture();
    },
  };
}

export function createHostRuntimeControllerAdapter(
  client: HostRuntimeClient,
  options: AppSessionRuntimeOptions = {},
): DesktopRuntimeGateway {
  return {
    async transcribe({ capture }) {
      const captureResult = requireSuccessfulCapture(capture);
      const pipeline = new PipelineService({
        transcriptionAdapter: createHostClientTranscriptionAdapter(client, {
          mode: options.mode ?? "dry-run",
          allowProviderCall: options.allowProviderCall ?? false,
        }),
      });
      const summary = await pipeline.run(
        createCapturedAudioPipelineRequest(captureResult),
      );

      return mapSummaryToDesktopRuntimeResult(summary);
    },
  };
}

export function getAppSessionSummary(
  session: DesktopDictationSession,
): SimulatedRunSummary | undefined {
  const runtime = session.runtime;
  if (isAppDesktopRuntimeResult(runtime)) {
    return runtime.summary;
  }

  return undefined;
}

export function getAppSessionCaptureResult(
  session: DesktopDictationSession,
): CaptureResult | undefined {
  if (isCaptureResult(session.capture)) {
    return session.capture;
  }

  return undefined;
}

export function isAppDesktopRuntimeResult(
  runtime: unknown,
): runtime is AppDesktopRuntimeResult {
  return (
    typeof runtime === "object" &&
    runtime !== null &&
    "summary" in runtime &&
    typeof (runtime as { transcript?: unknown }).transcript === "string"
  );
}

function mapSummaryToDesktopRuntimeResult(
  summary: SimulatedRunSummary): AppDesktopRuntimeResult {
  if (summary.terminalState !== "done") {
    throw new Error(summary.error?.message ?? "Captured run failed.");
  }

  const transcript = summary.transcript ?? summary.output ?? "";
  if (!transcript.trim()) {
    throw new Error("Captured run completed without transcript text.");
  }

  const transcriptionEvent = summary.events
    .slice()
    .reverse()
    .find((event) => event.type === "transcription_completed");

  return {
    transcript,
    output: summary.output,
    provider: transcriptionEvent?.data.stt?.provider,
    model: transcriptionEvent?.data.stt?.model,
    latencyMs: transcriptionEvent?.data.latencyMs,
    requestId: transcriptionEvent?.data.stt?.requestId,
    summary,
  };
}

function requireSuccessfulCapture(capture: unknown): Extract<CaptureResult, { ok: true }> {
  if (isCaptureResult(capture) && capture.ok) {
    return capture;
  }

  throw new Error("No successful captured artifact is available for transcription.");
}

function isCaptureResult(capture: unknown): capture is CaptureResult {
  return (
    typeof capture === "object" &&
    capture !== null &&
    "ok" in capture &&
    "metadata" in capture
  );
}

function assertCapturePermissionAvailable(
  permissionStatus: CapturePermissionStatus,
): void {
  if (
    permissionStatus === "denied" ||
    permissionStatus === "unavailable" ||
    permissionStatus === "error"
  ) {
    throw new Error("Microphone capture is not available in this adapter.");
  }
}
