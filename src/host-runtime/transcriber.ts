import {
  buildRawVoicePostProcessSystemPrompt,
  buildRawVoicePostProcessUserMessage,
  materializeFixvoxNormalDictationOutput,
  resolveFixvoxTextRuntimeRoute,
} from "../fixvox-text-runtime";
import { createGroqSttGatewayFromEnv } from "../model-gateway/groq-stt";
import { classifyRuntimeTranscript } from "../model-gateway/runtime-transcription";
import type { PostProcessResult, TranscriptionResult } from "../model-gateway/types";
import {
  hostRuntimeArtifactDirectories,
  validateHostRuntimeAudioPath,
  validateHostRuntimeReportPath,
  validateHostRuntimeTranscriptPath,
} from "./artifact-policy";
import { createHostRuntimeReadiness } from "./readiness";
import {
  createRedactedHostRuntimeError,
  redactHostRuntimeRequestId,
  redactHostTranscriptionResponse,
} from "./redaction";
import type {
  HostRuntimeEnv,
  HostTranscriptionRequest,
  HostTranscriptionResponse,
} from "./types";

export type HostRuntimeAudioReader = (input: {
  audioPath: string;
  runId: string;
}) => Promise<Blob | ArrayBuffer | Uint8Array>;

export type HostRuntimeArtifactWriter = (input: {
  path: string;
  content: string;
  kind: "report" | "transcript";
}) => Promise<void>;

export type HostRuntimePostProcessInput = {
  runId: string;
  transcript: string;
  provider: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
};

export type HostRuntimePostProcessor = (
  input: HostRuntimePostProcessInput,
) => Promise<PostProcessResult>;

export type HostRuntimeTranscriberOptions = {
  env?: HostRuntimeEnv;
  fetch?: typeof fetch;
  readAudioFile?: HostRuntimeAudioReader;
  writeArtifact?: HostRuntimeArtifactWriter;
  postProcessText?: HostRuntimePostProcessor;
  now?: () => number;
};

export type HostRuntimeTranscriber = {
  transcribe(request: HostTranscriptionRequest): Promise<HostTranscriptionResponse>;
};

export function createHostRuntimeTranscriber(
  options: HostRuntimeTranscriberOptions = {},
): HostRuntimeTranscriber {
  return {
    async transcribe(request) {
      return transcribeCapturedAudio(request, options);
    },
  };
}

async function transcribeCapturedAudio(
  request: HostTranscriptionRequest,
  options: HostRuntimeTranscriberOptions,
): Promise<HostTranscriptionResponse> {
  const audioPathResult = validateHostRuntimeAudioPath(request.audioPath);
  if (!audioPathResult.ok) {
    return {
      status: "missing-audio",
      error: createRedactedHostRuntimeError(
        audioPathResult.code,
        audioPathResult.reason,
      ),
      retryable: true,
      redacted: true,
    };
  }

  if (request.mode === "real" && !request.allowProviderCall) {
    return {
      status: "setup-error",
      error: createRedactedHostRuntimeError(
        "PROVIDER_CALL_NOT_ALLOWED",
        "Real provider calls require an explicit host runtime approval flag.",
      ),
      retryable: true,
      redacted: true,
    };
  }

  const readiness = createHostRuntimeReadiness({ env: options.env ?? {} });
  if (!readiness.configured) {
    return {
      status: "setup-error",
      error: readiness.reason ??
        createRedactedHostRuntimeError(
          "HOST_RUNTIME_NOT_CONFIGURED",
          "Host runtime transcription is not configured.",
        ),
      provider: readiness.provider,
      model: readiness.model,
      retryable: true,
      redacted: true,
    };
  }

  if (!options.fetch) {
    return {
      status: "setup-error",
      error: createRedactedHostRuntimeError(
        "FETCH_MISSING",
        "Host runtime fetch boundary is not configured.",
      ),
      provider: readiness.provider,
      model: request.model ?? readiness.model,
      retryable: true,
      redacted: true,
    };
  }

  if (!options.readAudioFile) {
    return {
      status: "setup-error",
      error: createRedactedHostRuntimeError(
        "AUDIO_READER_MISSING",
        "Host runtime audio reader is not configured.",
      ),
      provider: readiness.provider,
      model: request.model ?? readiness.model,
      retryable: true,
      redacted: true,
    };
  }

  const gateway = createGroqSttGatewayFromEnv(options.env ?? {}, {
    fetch: options.fetch,
    readAudioFile: async (input) =>
      options.readAudioFile?.({
        audioPath: input.audioPath,
        runId: input.runId,
      }) ?? new Uint8Array(),
    now: options.now,
  });

  const result = await gateway.transcribe({
    runId: request.runId,
    fixtureId: "host-runtime",
    audioPath: audioPathResult.normalizedPath,
    provider: request.provider,
    model: request.model,
    language: request.language,
    mode: request.mode === "real" ? "real" : "dry-run",
  });
  const response = await applyFixvoxTextMaterialization(
    mapTranscriptionResultToHostResponse(
      result,
      request,
      audioPathResult.normalizedPath,
    ),
    request,
    options,
  );

  await persistHostArtifacts(response, request, options.writeArtifact);

  return redactHostTranscriptionResponse(response, {
    transcriptText: response.status === "ok" ? response.text : undefined,
  });
}

function mapTranscriptionResultToHostResponse(
  result: TranscriptionResult,
  request: HostTranscriptionRequest,
  audioPath: string,
): HostTranscriptionResponse {
  const transcriptPath = createTranscriptPath(request.runId);
  const reportPath = createReportPath(request.runId);

  if (result.status === "ok") {
    const classification = classifyRuntimeTranscript(result.text);
    if (classification.status !== "available") {
      return {
        status: "empty",
        error: createRedactedHostRuntimeError(
          classification.status === "empty"
            ? "EMPTY_TRANSCRIPT"
            : "UNUSABLE_TRANSCRIPT",
          classification.reason,
        ),
        reportPath,
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        requestId: redactHostRuntimeRequestId(result.requestId),
        retryable: true,
        redacted: true,
      };
    }

    return {
      status: "ok",
      text: classification.text,
      transcriptPath,
      reportPath,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      requestId: redactHostRuntimeRequestId(result.requestId),
      redacted: true,
    };
  }

  return {
    status: result.status === "cancelled" ? "cancelled" : result.status,
    error: createRedactedHostRuntimeError(result.error.code, result.error.message),
    reportPath,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    requestId: redactHostRuntimeRequestId(result.requestId),
    retryable: result.status !== "cancelled" && Boolean(audioPath),
    redacted: true,
  };
}

async function applyFixvoxTextMaterialization(
  response: HostTranscriptionResponse,
  request: HostTranscriptionRequest,
  options: HostRuntimeTranscriberOptions,
): Promise<HostTranscriptionResponse> {
  if (response.status !== "ok") {
    return response;
  }

  const postProcess = request.postProcess;
  if (!postProcess) {
    return response;
  }

  const route = resolveFixvoxTextRuntimeRoute({
    transcript: response.text,
    postProcessEnabled: postProcess.enabled,
    postProcessPrompt: postProcess.prompt,
    postProcessProvider: postProcess.provider,
    postProcessModel: postProcess.model,
    postProcessSource: postProcess.source,
    policyId: postProcess.policyId,
    voiceRoutingProfileId: postProcess.voiceRoutingProfileId,
  });
  const rawTranscript = response.text;
  const baseEvidence = {
    enabled: postProcess.enabled,
    source: postProcess.source ?? null,
    policyId: postProcess.policyId ?? null,
    voiceRoutingProfileId: postProcess.voiceRoutingProfileId ?? null,
    rawTranscriptLength: rawTranscript.length,
    redacted: true as const,
  };

  if (route.route !== "post-process" || !route.provider || !route.model) {
    return {
      ...response,
      postProcess: {
        ...baseEvidence,
        ran: false,
        fallbackToRaw: true,
        finalTextLength: rawTranscript.length,
      },
    };
  }

  if (!options.postProcessText) {
    return {
      ...response,
      postProcess: {
        ...baseEvidence,
        ran: false,
        provider: route.provider,
        model: route.model,
        fallbackToRaw: true,
        finalTextLength: rawTranscript.length,
      },
    };
  }

  const systemPrompt = buildRawVoicePostProcessSystemPrompt(postProcess.prompt ?? "");
  const userMessage = buildRawVoicePostProcessUserMessage({ transcript: rawTranscript });
  const postProcessResult = await options.postProcessText({
    runId: request.runId,
    transcript: rawTranscript,
    provider: route.provider,
    model: route.model,
    systemPrompt,
    userMessage,
  });

  if (postProcessResult.status !== "ok") {
    return {
      ...response,
      postProcess: {
        ...baseEvidence,
        ran: true,
        provider: route.provider,
        model: route.model,
        fallbackToRaw: true,
        finalTextLength: rawTranscript.length,
        requestId: redactHostRuntimeRequestId(postProcessResult.requestId),
        redacted: true,
      },
    };
  }

  const materialized = materializeFixvoxNormalDictationOutput({
    transcript: rawTranscript,
    rawPostProcessOutput: postProcessResult.output,
    postProcessAttempted: true,
  });

  return {
    ...response,
    text: materialized.outputText,
    provider: response.provider,
    model: response.model,
    postProcess: {
      ...baseEvidence,
      ran: true,
      provider: postProcessResult.provider,
      model: postProcessResult.model,
      sanitizedChanged: materialized.sanitizer?.changed,
      sanitizerReason: materialized.sanitizer?.reason,
      fallbackToRaw: materialized.outputText === rawTranscript,
      finalTextLength: materialized.outputText.length,
      requestId: redactHostRuntimeRequestId(postProcessResult.requestId),
      redacted: true,
    },
  };
}

async function persistHostArtifacts(
  response: HostTranscriptionResponse,
  request: HostTranscriptionRequest,
  writeArtifact: HostRuntimeArtifactWriter | undefined,
): Promise<void> {
  if (!writeArtifact) {
    return;
  }

  if (response.status === "ok" && response.transcriptPath) {
    const transcriptPathResult = validateHostRuntimeTranscriptPath(response.transcriptPath);
    if (transcriptPathResult.ok) {
      await writeArtifact({
        path: transcriptPathResult.normalizedPath,
        content: response.text,
        kind: "transcript",
      });
    }
  }

  if (response.reportPath) {
    const reportPathResult = validateHostRuntimeReportPath(response.reportPath);
    if (reportPathResult.ok) {
      await writeArtifact({
        path: reportPathResult.normalizedPath,
        content: JSON.stringify(createRedactedReport(response, request), null, 2),
        kind: "report",
      });
    }
  }
}

function createRedactedReport(
  response: HostTranscriptionResponse,
  request: HostTranscriptionRequest,
) {
  return {
    ok: response.status === "ok",
    runId: request.runId,
    status: response.status,
    audioPath: request.audioPath,
    transcriptPath: response.transcriptPath,
    reportPath: response.reportPath,
    provider: response.provider,
    model: response.model,
    latencyMs: response.latencyMs,
    requestId: response.requestId,
    transcriptLength: response.status === "ok" ? response.text.length : undefined,
    postProcess: response.status === "ok" ? response.postProcess : undefined,
    error: response.status === "ok" ? undefined : response.error,
    rawProviderPayloadStored: false,
    redacted: true,
  };
}

function createTranscriptPath(runId: string): string {
  return `${hostRuntimeArtifactDirectories.transcripts}/${sanitizeRunId(runId)}.txt`;
}

function createReportPath(runId: string): string {
  return `${hostRuntimeArtifactDirectories.reports}/${sanitizeRunId(runId)}.json`;
}

function sanitizeRunId(runId: string): string {
  return runId.replace(/[^A-Za-z0-9._-]/g, "-") || "host-runtime-run";
}
