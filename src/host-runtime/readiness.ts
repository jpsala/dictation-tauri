import type {
  HostRuntimeEnv,
  HostRuntimeProvider,
  HostRuntimeReadiness,
  RedactedHostRuntimeError,
} from "./types";

export const hostRuntimeArtifactRoot = "artifacts/microphone-capture" as const;

export type HostRuntimeReadinessOptions = {
  env?: HostRuntimeEnv;
  apiKey?: string;
  provider?: HostRuntimeProvider;
  model?: string;
  supportsRealProviderCall?: boolean;
};

const defaultProvider: HostRuntimeProvider = "groq";
const defaultModel = "whisper-large-v3";

export function createHostRuntimeReadiness(
  input: HostRuntimeEnv | HostRuntimeReadinessOptions = {},
): HostRuntimeReadiness {
  const options = normalizeReadinessInput(input);
  const env = options.env ?? {};
  const apiKey = firstNonBlank(
    options.apiKey,
    env.GROQ_API_KEY,
    env["GROQ-API-KEY"],
  );
  const provider = (firstNonBlank(options.provider, defaultProvider) ??
    defaultProvider) as HostRuntimeProvider;
  const model = firstNonBlank(
    options.model,
    env.GROQ_STT_MODEL,
    env["GROQ-STT-MODEL"],
    defaultModel,
  );

  if (!apiKey) {
    return {
      configured: false,
      artifactRoot: hostRuntimeArtifactRoot,
      supportsRealProviderCall: false,
      reason: createRedactedReadinessReason(
        "GROQ_API_KEY_MISSING",
        "Groq STT provider is not configured.",
      ),
    };
  }

  return {
    configured: true,
    provider,
    model,
    artifactRoot: hostRuntimeArtifactRoot,
    supportsRealProviderCall: options.supportsRealProviderCall ?? true,
  };
}

function normalizeReadinessInput(
  input: HostRuntimeEnv | HostRuntimeReadinessOptions,
): HostRuntimeReadinessOptions {
  if (
    "env" in input ||
    "apiKey" in input ||
    "provider" in input ||
    "model" in input ||
    "supportsRealProviderCall" in input
  ) {
    return input as HostRuntimeReadinessOptions;
  }

  return { env: input as HostRuntimeEnv };
}

function firstNonBlank(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function createRedactedReadinessReason(
  code: string,
  message: string,
): RedactedHostRuntimeError {
  return {
    code,
    message,
    redacted: true,
  };
}
