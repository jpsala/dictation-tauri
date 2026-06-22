import type {
  HostTranscriptionResponse,
  RedactedHostRuntimeError,
} from "./types";

export type HostRuntimeRedactionOptions = {
  secrets?: readonly (string | undefined | null)[];
  transcriptText?: string;
  maxMessageLength?: number;
};

const defaultMaxMessageLength = 240;
const redactedToken = "[REDACTED]";

export function createRedactedHostRuntimeError(
  code: string,
  message: unknown,
  options: HostRuntimeRedactionOptions = {},
): RedactedHostRuntimeError {
  return {
    code: normalizeErrorCode(code),
    message: redactHostRuntimeText(message, options),
    redacted: true,
  };
}

export function redactHostRuntimeText(
  value: unknown,
  options: HostRuntimeRedactionOptions = {},
): string {
  const maxLength = options.maxMessageLength ?? defaultMaxMessageLength;
  const serialized = serializeRedactionInput(value);
  const withKnownSecretsRedacted = redactKnownValues(serialized, [
    ...(options.secrets ?? []),
    options.transcriptText,
  ]);

  const sanitized = withKnownSecretsRedacted
    .replace(/Authorization\s*:\s*Bearer\s+[^\s;,}\]]+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/Bearer\s+[^\s;,}\]]+/gi, "Bearer [REDACTED]")
    .replace(
      /((?:[A-Z0-9_]*API[_-]?KEY|TOKEN|SECRET)\s*=\s*)[^\s;,}\]]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /("(?:[A-Z0-9_]*API[_-]?KEY|TOKEN|SECRET|api[_-]?key|token|secret)"\s*:\s*")[^"]+/gi,
      "$1[REDACTED]",
    )
    .replace(/((?:api[_-]?key|token|secret)\s*:\s*)[^\s;,}\]]+/gi, "$1[REDACTED]")
    .replace(/\b(?:sk|gsk|xoxb|ghp|github_pat)[_-][A-Za-z0-9_-]+\b/g, redactedToken)
    .replace(/\b[A-Za-z0-9+/]{32,}={0,2}\b/g, redactedToken);

  return truncateForUi(sanitized.replace(/\[REDACTED\]\]+/g, redactedToken), maxLength);
}

export function redactHostRuntimeRequestId(
  requestId: string | undefined,
): string | undefined {
  if (!requestId) {
    return undefined;
  }

  const redacted = redactHostRuntimeText(requestId, { maxMessageLength: 128 });
  if (redacted.includes(redactedToken)) {
    return "redacted-request-id";
  }

  const normalized = redacted.trim();
  if (!normalized) {
    return undefined;
  }

  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(normalized)) {
    return "redacted-request-id";
  }

  return normalized;
}

export function redactHostTranscriptionResponse(
  response: HostTranscriptionResponse,
  options: HostRuntimeRedactionOptions = {},
): HostTranscriptionResponse {
  if (response.status === "ok") {
    return {
      ...response,
      requestId: redactHostRuntimeRequestId(response.requestId),
      redacted: true,
    };
  }

  return {
    ...response,
    error: createRedactedHostRuntimeError(
      response.error.code,
      response.error.message,
      options,
    ),
    requestId: redactHostRuntimeRequestId(response.requestId),
    redacted: true,
  };
}

export function isRedactedHostRuntimeError(
  error: unknown,
): error is RedactedHostRuntimeError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    "redacted" in error &&
    (error as RedactedHostRuntimeError).redacted === true
  );
}

function serializeRedactionInput(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value === undefined || value === null) {
    return "Host runtime error.";
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function redactKnownValues(
  message: string,
  values: readonly (string | undefined | null)[],
): string {
  return values.reduce<string>((current, value) => {
    if (!value) {
      return current;
    }

    const trimmed = value.trim();
    if (trimmed.length < 3) {
      return current;
    }

    return current.replaceAll(trimmed, redactedToken);
  }, message);
}

function normalizeErrorCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  return normalized || "HOST_RUNTIME_ERROR";
}

function truncateForUi(message: string, maxLength: number): string {
  if (message.length <= maxLength) {
    return message;
  }

  return `${message.slice(0, Math.max(0, maxLength - 1))}…`;
}
