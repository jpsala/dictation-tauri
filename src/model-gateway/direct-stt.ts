import type { ModelGateway, ModelGatewayMode, TranscriptionInput } from "./types";
import { createRedactedModelGatewayError } from "./types";

export type DirectLocalSttGatewayOptions = {
  provider?: string;
  model?: string;
  providerConfigured?: boolean;
  audioAvailable?: (input: TranscriptionInput) => boolean;
};

const defaultProvider = "direct-local";
const defaultModel = "not-configured";

export function createDirectLocalSttGateway(
  options: DirectLocalSttGatewayOptions = {},
): ModelGateway {
  const provider = options.provider ?? defaultProvider;
  const model = options.model ?? defaultModel;

  return {
    async transcribe(input) {
      const modeError = validateDirectMode(input.mode);
      if (modeError) {
        return modeError;
      }

      if (!options.providerConfigured) {
        return {
          status: "setup-error",
          error: createRedactedModelGatewayError(
            "PROVIDER_SETUP_MISSING",
            "Direct local STT provider is not configured.",
          ),
          provider,
          model,
          latencyMs: 0,
        };
      }

      if (!input.audioPath || options.audioAvailable?.(input) === false) {
        return {
          status: "setup-error",
          error: createRedactedModelGatewayError(
            "AUDIO_SETUP_MISSING",
            "Local fixture audio is missing or unavailable.",
          ),
          provider,
          model,
          latencyMs: 0,
        };
      }

      return {
        status: "provider-error",
        error: createRedactedModelGatewayError(
          "PROVIDER_CALL_DISABLED",
          "Direct local STT network calls are disabled in this dry-run shell.",
        ),
        provider,
        model,
        latencyMs: 0,
      };
    },
  };
}

function validateDirectMode(mode: ModelGatewayMode) {
  if (mode === "real") {
    return undefined;
  }

  return {
    status: "setup-error" as const,
    error: createRedactedModelGatewayError(
      "REAL_MODE_REQUIRED",
      "Direct local STT adapter shell requires real mode.",
    ),
    provider: defaultProvider,
    model: defaultModel,
    latencyMs: 0,
  };
}
