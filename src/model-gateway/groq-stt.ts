import type { ModelGateway, ModelGatewayMode, TranscriptionInput } from "./types";
import { createRedactedModelGatewayError } from "./types";
import { createRuntimeRedactedError } from "./runtime-transcription";

export const groqTranscriptionEndpoint =
  "https://api.groq.com/openai/v1/audio/transcriptions";

export type AudioFileData = Blob | ArrayBuffer | Uint8Array;

export type GroqSttGatewayOptions = {
  apiKey?: string;
  provider?: string;
  model?: string;
  endpoint?: string;
  language?: string;
  prompt?: string;
  responseFormat?: "json" | "text" | "verbose_json";
  fetch?: typeof fetch;
  readAudioFile?: (input: TranscriptionInput) => Promise<AudioFileData>;
  fileName?: (input: TranscriptionInput) => string;
  now?: () => number;
};

export type GroqSttEnv = {
  GROQ_API_KEY?: string;
  GROQ_STT_MODEL?: string;
  GROQ_STT_LANGUAGE?: string;
};

const defaultProvider = "groq";
const defaultModel = "whisper-large-v3";

export function createGroqSttGateway(
  options: GroqSttGatewayOptions = {},
): ModelGateway {
  const provider = options.provider ?? defaultProvider;
  const model = options.model ?? defaultModel;
  const endpoint = options.endpoint ?? groqTranscriptionEndpoint;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => globalThis.performance?.now() ?? Date.now());

  return {
    async transcribe(input) {
      if (input.mode !== "real") {
        return {
          status: "setup-error",
          error: createRedactedModelGatewayError(
            "REAL_MODE_REQUIRED",
            "Groq STT provider requires real mode.",
          ),
          provider,
          model,
          latencyMs: 0,
        };
      }

      if (!options.apiKey) {
        return {
          status: "setup-error",
          error: createRedactedModelGatewayError(
            "GROQ_API_KEY_MISSING",
            "Groq STT provider is not configured.",
          ),
          provider,
          model,
          latencyMs: 0,
        };
      }

      if (!fetchImpl || !globalThis.FormData || !globalThis.Blob) {
        return {
          status: "setup-error",
          error: createRedactedModelGatewayError(
            "GROQ_RUNTIME_UNAVAILABLE",
            "Groq STT runtime primitives are unavailable.",
          ),
          provider,
          model,
          latencyMs: 0,
        };
      }

      if (!options.readAudioFile) {
        return {
          status: "setup-error",
          error: createRedactedModelGatewayError(
            "AUDIO_READER_MISSING",
            "Groq STT audio reader is not configured.",
          ),
          provider,
          model,
          latencyMs: 0,
        };
      }

      const startedAt = now();
      let audio: AudioFileData;

      try {
        audio = await options.readAudioFile(input);
      } catch {
        return {
          status: "setup-error",
          error: createRedactedModelGatewayError(
            "AUDIO_READ_FAILED",
            "Captured audio could not be read for transcription.",
          ),
          provider,
          model,
          latencyMs: elapsedMs(startedAt, now()),
        };
      }

      const form = new FormData();
      form.append("model", input.model ?? model);
      form.append("response_format", options.responseFormat ?? "json");

      if (input.language ?? options.language) {
        form.append("language", input.language ?? options.language ?? "");
      }

      if (options.prompt) {
        form.append("prompt", options.prompt);
      }

      form.append(
        "file",
        toBlob(audio),
        options.fileName?.(input) ?? fileNameFromAudioPath(input.audioPath),
      );

      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
          },
          body: form,
        });
        const requestId = response.headers.get("x-request-id") ?? undefined;
        const latencyMs = elapsedMs(startedAt, now());

        if (!response.ok) {
          return {
            status: "provider-error",
            error: createRuntimeRedactedError(
              `GROQ_HTTP_${response.status}`,
              `Groq STT provider returned HTTP ${response.status} ${response.statusText}.`,
            ),
            provider,
            model: input.model ?? model,
            latencyMs,
            requestId,
          };
        }

        const text = await parseGroqTranscriptText(response);

        return {
          status: "ok",
          text,
          provider,
          model: input.model ?? model,
          latencyMs,
          requestId,
        };
      } catch (error) {
        return {
          status: "provider-error",
          error: createRuntimeRedactedError(
            "GROQ_REQUEST_FAILED",
            error instanceof Error
              ? error.message
              : "Groq STT request failed before a response was received.",
          ),
          provider,
          model: input.model ?? model,
          latencyMs: elapsedMs(startedAt, now()),
        };
      }
    },
  };
}

export function createGroqSttGatewayFromEnv(
  env: GroqSttEnv,
  options: Omit<GroqSttGatewayOptions, "apiKey" | "model" | "language"> = {},
): ModelGateway {
  return createGroqSttGateway({
    ...options,
    apiKey: env.GROQ_API_KEY,
    model: env.GROQ_STT_MODEL,
    language: env.GROQ_STT_LANGUAGE,
  });
}

async function parseGroqTranscriptText(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return await response.text();
  }

  const body = (await response.json()) as { text?: unknown };

  return typeof body.text === "string" ? body.text : "";
}

function toBlob(audio: AudioFileData): Blob {
  if (audio instanceof Blob) {
    return audio;
  }

  if (audio instanceof Uint8Array) {
    const copy = new Uint8Array(audio.byteLength);
    copy.set(audio);
    return new Blob([copy.buffer]);
  }

  return new Blob([audio]);
}

function fileNameFromAudioPath(audioPath: string): string {
  return audioPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "captured-audio.wav";
}

function elapsedMs(startedAt: number, endedAt: number): number {
  return Math.max(0, Math.round(endedAt - startedAt));
}
