export type HostRuntimeMode = "dry-run" | "real";

export type HostRuntimeProvider = "groq" | (string & {});

export type RedactedHostRuntimeError = {
  code: string;
  message: string;
  redacted: true;
};

export type HostRuntimeReadiness = {
  configured: boolean;
  provider?: HostRuntimeProvider;
  model?: string;
  artifactRoot: "artifacts/microphone-capture";
  supportsRealProviderCall: boolean;
  directByokConfigured: boolean;
  managedCloudConfigured: boolean;
  managedDeviceRegistered: boolean;
  managedBackendBaseUrl?: string;
  managedCloudReason?: RedactedHostRuntimeError;
  reason?: RedactedHostRuntimeError;
};

export type HostPostProcessPolicy = {
  enabled: boolean;
  prompt?: string | null;
  provider?: string | null;
  model?: string | null;
  source?: string | null;
  policyId?: string | null;
  voiceRoutingProfileId?: string | null;
};

export type HostTranscriptionRequest = {
  runId: string;
  audioPath: string;
  provider?: HostRuntimeProvider;
  model?: string;
  language?: string;
  mode: HostRuntimeMode;
  allowProviderCall: boolean;
  postProcess?: HostPostProcessPolicy;
};

export type RedactedFixvoxResponseMetadata = {
  fixvoxRequestId?: string;
  providerRequestId?: string;
  costUsd?: string;
  pricingSource?: string;
  limit?: number;
  remaining?: number;
  resetAt?: string;
  usageKey?: string;
  proxyParseMs?: number;
  proxyUsageMs?: number;
  proxyUpstreamMs?: number;
  proxyInitMs?: number;
  proxyTotalMs?: number;
  serverTiming?: string;
  redacted: true;
};

export type HostTranscriptionResponse =
  | {
      status: "ok";
      text: string;
      transcriptPath?: string;
      reportPath?: string;
      provider: string;
      model: string;
      latencyMs: number;
      requestId?: string;
      fixvoxMetadata?: RedactedFixvoxResponseMetadata;
      postProcess?: HostPostProcessEvidence;
      redacted: true;
    }
  | {
      status:
        | "setup-error"
        | "provider-error"
        | "missing-audio"
        | "empty"
        | "cancelled";
      error: RedactedHostRuntimeError;
      transcriptPath?: string;
      reportPath?: string;
      provider?: string;
      model?: string;
      latencyMs?: number;
      requestId?: string;
      fixvoxMetadata?: RedactedFixvoxResponseMetadata;
      retryable: boolean;
      redacted: true;
    };

export type HostPostProcessEvidence = {
  enabled: boolean;
  ran: boolean;
  provider?: string;
  model?: string;
  source?: string | null;
  policyId?: string | null;
  voiceRoutingProfileId?: string | null;
  sanitizedChanged?: boolean;
  sanitizerReason?: "final_marker" | "explanation_marker" | "too_long" | null;
  fallbackToRaw: boolean;
  rawTranscriptLength: number;
  finalTextLength: number;
  requestId?: string;
  redacted: true;
};

export type HostRuntimeClient = {
  getReadiness(): Promise<HostRuntimeReadiness>;
  transcribeCapturedAudio(
    request: HostTranscriptionRequest,
  ): Promise<HostTranscriptionResponse>;
};

export type HostRuntimeEnv = {
  GROQ_API_KEY?: string;
  "GROQ-API-KEY"?: string;
  GROQ_STT_MODEL?: string;
  "GROQ-STT-MODEL"?: string;
  GROQ_STT_LANGUAGE?: string;
  "GROQ-STT-LANGUAGE"?: string;
  FIXVOX_BACKEND_URL?: string;
  FIXVOX_API_BASE_URL?: string;
  PROXY_BASE_URL?: string;
  FIXVOX_DEVICE_ID?: string;
  FIXVOX_INSTALL_ID?: string;
  FIXVOX_STT_MODEL?: string;
  FIXVOX_STT_LANGUAGE?: string;
};
