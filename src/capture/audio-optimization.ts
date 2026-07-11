export type AudioOptimizationStatus = "skipped" | "apply" | "applied" | "fallback";
export type AudioOptimizationSource = "original" | "optimized";

export type AudioOptimizationPolicy = {
  enabled: boolean;
  minDurationMs: number;
  minSizeBytes: number;
  targetMimeType: "audio/mpeg";
};

export type AudioOptimizationInput = {
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
  policy?: Partial<AudioOptimizationPolicy>;
};

export type AudioOptimizationDecision = {
  status: AudioOptimizationStatus;
  reason: string;
  source: AudioOptimizationSource;
  originalBytes: number;
  uploadBytes: number;
  mimeType: string;
  targetMimeType?: string;
  redacted: true;
};

export type AudioOptimizationAttempt =
  | { ok: true; optimizedBytes: number; mimeType: string }
  | { ok: false; reason: string };

export const defaultAudioOptimizationPolicy: AudioOptimizationPolicy = {
  enabled: true,
  minDurationMs: 30_000,
  minSizeBytes: 1_000_000,
  targetMimeType: "audio/mpeg",
};

export function createAudioOptimizationPolicy(
  policy: Partial<AudioOptimizationPolicy> = {},
): AudioOptimizationPolicy {
  return {
    ...defaultAudioOptimizationPolicy,
    ...policy,
    minDurationMs: normalizeNonNegativeMs(policy.minDurationMs ?? defaultAudioOptimizationPolicy.minDurationMs),
    minSizeBytes: normalizeNonNegativeBytes(policy.minSizeBytes ?? defaultAudioOptimizationPolicy.minSizeBytes),
    targetMimeType: "audio/mpeg",
  };
}

export function planAudioOptimization(input: AudioOptimizationInput): AudioOptimizationDecision {
  const policy = createAudioOptimizationPolicy(input.policy);
  const originalBytes = normalizeNonNegativeBytes(input.sizeBytes);
  const durationMs = normalizeNonNegativeMs(input.durationMs);
  const base = {
    originalBytes,
    uploadBytes: originalBytes,
    mimeType: input.mimeType,
    redacted: true as const,
  };

  if (!policy.enabled) {
    return {
      ...base,
      status: "skipped",
      reason: "optimization_disabled",
      source: "original",
    };
  }

  if (durationMs < policy.minDurationMs && originalBytes < policy.minSizeBytes) {
    return {
      ...base,
      status: "skipped",
      reason: "below_optimization_threshold",
      source: "original",
    };
  }

  return {
    ...base,
    status: "apply",
    reason: "above_optimization_threshold",
    source: "optimized",
    targetMimeType: policy.targetMimeType,
  };
}

export function resolveAudioOptimizationResult(
  decision: AudioOptimizationDecision,
  attempt: AudioOptimizationAttempt,
): AudioOptimizationDecision {
  if (decision.status !== "apply") {
    return decision;
  }

  if (!attempt.ok) {
    return fallback(decision, `${sanitizeReason(attempt.reason)}_original_audio_used`);
  }

  const optimizedBytes = normalizeNonNegativeBytes(attempt.optimizedBytes);
  if (optimizedBytes <= 0 || optimizedBytes >= decision.originalBytes) {
    return fallback(decision, "optimized_audio_not_smaller_original_audio_used");
  }

  return {
    ...decision,
    status: "applied",
    reason: "optimized_audio_smaller",
    source: "optimized",
    uploadBytes: optimizedBytes,
    mimeType: attempt.mimeType,
    redacted: true,
  };
}

function fallback(decision: AudioOptimizationDecision, reason: string): AudioOptimizationDecision {
  return {
    ...decision,
    status: "fallback",
    reason,
    source: "original",
    uploadBytes: decision.originalBytes,
    mimeType: decision.mimeType,
    targetMimeType: undefined,
    redacted: true,
  };
}

function normalizeNonNegativeMs(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function normalizeNonNegativeBytes(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function sanitizeReason(reason: string): string {
  return reason
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "conversion_failed";
}
