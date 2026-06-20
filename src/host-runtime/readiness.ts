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
  fixvoxBackendUrl?: string;
  fixvoxDeviceId?: string;
};

const defaultProvider: HostRuntimeProvider = "groq";
const defaultModel = "whisper-large-v3";
const defaultFixvoxBackendUrl = "https://auth-fixvox.jpsala.dev";
const staleFixvoxBackendUrl = "https://fixvox-api.jpsala.dev";

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

  const managedCloud = createManagedCloudReadiness(options, env);

  if (!apiKey) {
    return {
      configured: false,
      artifactRoot: hostRuntimeArtifactRoot,
      supportsRealProviderCall: false,
      directByokConfigured: false,
      managedCloudConfigured: managedCloud.configured,
      managedDeviceRegistered: managedCloud.deviceRegistered,
      managedBackendBaseUrl: managedCloud.backendBaseUrl,
      ...(managedCloud.reason ? { managedCloudReason: managedCloud.reason } : {}),
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
    directByokConfigured: true,
    managedCloudConfigured: managedCloud.configured,
    managedDeviceRegistered: managedCloud.deviceRegistered,
    managedBackendBaseUrl: managedCloud.backendBaseUrl,
    ...(managedCloud.reason ? { managedCloudReason: managedCloud.reason } : {}),
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
    "supportsRealProviderCall" in input ||
    "fixvoxBackendUrl" in input ||
    "fixvoxDeviceId" in input
  ) {
    return input as HostRuntimeReadinessOptions;
  }

  return { env: input as HostRuntimeEnv };
}

function createManagedCloudReadiness(
  options: HostRuntimeReadinessOptions,
  env: HostRuntimeEnv,
): {
  configured: boolean;
  deviceRegistered: boolean;
  backendBaseUrl?: string;
  reason?: RedactedHostRuntimeError;
} {
  const backendUrl = normalizeBackendUrl(
    firstNonBlank(
      options.fixvoxBackendUrl,
      env.FIXVOX_BACKEND_URL,
      env.FIXVOX_API_BASE_URL,
      env.PROXY_BASE_URL,
      defaultFixvoxBackendUrl,
    ),
  );

  if (!backendUrl || backendUrl === staleFixvoxBackendUrl) {
    return {
      configured: false,
      deviceRegistered: false,
      reason: createRedactedReadinessReason(
        "FIXVOX_BACKEND_URL_STALE",
        "Configured Fixvox backend URL is stale; use the current auth/proxy backend.",
      ),
    };
  }

  return {
    configured: true,
    deviceRegistered: Boolean(
      firstNonBlank(options.fixvoxDeviceId, env.FIXVOX_DEVICE_ID),
    ),
    backendBaseUrl: backendUrl,
  };
}

function normalizeBackendUrl(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\/+$/u, "");
  return normalized && normalized.length > 0 ? normalized : undefined;
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
