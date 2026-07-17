import { createHash } from "node:crypto";

import { CONTRACT_TEST_VALUES, type ContractFixture } from "./fixtures";

const SENSITIVE_VALUES = Object.values(CONTRACT_TEST_VALUES);
const SENSITIVE_KEY_PATTERN = /^(authorization|cookie|password|client_secret|access_token|refresh_token|api[_-]?key|providerKey|oauthState|oauthToken|transcript|selectedText|audio|rawBody)$/i;
const SAFE_HEADER_NAMES = new Set([
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-allow-origin",
  "access-control-max-age",
  "content-type",
  "location",
  "server-timing",
  "vary",
  "x-fixvox-benchmark-proxy",
  "x-fixvox-completion-tokens",
  "x-fixvox-cost-usd",
  "x-fixvox-engine-id",
  "x-fixvox-init-ms",
  "x-fixvox-limit",
  "x-fixvox-parse-ms",
  "x-fixvox-pricing-source",
  "x-fixvox-profile-id",
  "x-fixvox-proxy-init-ms",
  "x-fixvox-proxy-parse-ms",
  "x-fixvox-proxy-total-ms",
  "x-fixvox-proxy-upstream-ms",
  "x-fixvox-proxy-usage-ms",
  "x-fixvox-prompt-tokens",
  "x-fixvox-remaining",
  "x-fixvox-request-id",
  "x-fixvox-reset-at",
  "x-fixvox-total-tokens",
  "x-fixvox-usage-key",
  "x-provider-request-id",
]);

export type NormalizedResponse = {
  status: number;
  contentType: string | null;
  shape: "json-object" | "json-array" | "html" | "text" | "empty" | "sse";
  bodySchema: unknown;
  topLevelKeys: string[];
  errorCode: string | null;
  safeHeaders: Array<{ name: string; present: boolean; valueClass: "omitted" | "redacted" | "safe" }>;
};

export function hashRedacted(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

export function redactEvidence(value: unknown): unknown {
  if (typeof value === "string") {
    let redacted = value;
    for (const sensitive of SENSITIVE_VALUES) {
      redacted = redacted.split(sensitive).join("[REDACTED]");
    }
    return redacted;
  }
  if (Array.isArray(value)) return value.map((entry) => redactEvidence(entry));
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      return [key, "[REDACTED]"];
    }
    return [key, redactEvidence(entry)];
  }));
}

export function assertNoSensitiveText(value: string, label = "redacted evidence"): void {
  const leaks = SENSITIVE_VALUES.filter((sensitive) => value.includes(sensitive));
  if (leaks.length > 0) {
    throw new Error(`${label} contains raw sensitive fixture material (${leaks.length} leak(s))`);
  }

  if (/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/i.test(value)) {
    throw new Error(`${label} contains a bearer credential`);
  }
  if (/(?:access_token|refresh_token|client_secret)\s*[:=]/i.test(value)) {
    throw new Error(`${label} contains an OAuth credential field`);
  }
}

export function assertFixtureRedactionGuard(): void {
  for (const [kind, value] of Object.entries(CONTRACT_TEST_VALUES)) {
    const unsafe = JSON.stringify({ kind, value });
    let rejected = false;
    try {
      assertNoSensitiveText(unsafe, kind);
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error(`redaction guard did not reject ${kind}`);
    }

    const safe = JSON.stringify(redactEvidence({ kind, value }));
    assertNoSensitiveText(safe, `${kind} redacted projection`);
  }
}

export function summarizeRequest(fixture: ContractFixture): Record<string, unknown> {
  const request = fixture.request;
  return {
    method: fixture.method,
    path: fixture.path.split("?", 1)[0],
    queryKeys: [...new URL(`https://fixture.invalid${fixture.path}`).searchParams.keys()].sort(),
    contentType: request.contentType ?? null,
    bodyKind: request.bodyKind ?? (request.body === undefined && !request.bodyFactory ? "empty" : "json"),
    headerNames: Object.keys(request.headers ?? {}).map((name) => name.toLowerCase()).sort(),
  };
}

export async function normalizeResponse(response: Response): Promise<NormalizedResponse> {
  const contentType = response.headers.get("content-type");
  const text = await response.text();
  const trimmed = text.trim();
  let body: unknown = null;
  let shape: NormalizedResponse["shape"];

  if (response.status === 204 && !trimmed) {
    shape = "empty";
  } else if (contentType?.includes("text/event-stream")) {
    shape = "sse";
  } else if (contentType?.includes("text/html")) {
    shape = "html";
  } else if (contentType?.includes("application/json")) {
    try {
      body = trimmed ? JSON.parse(trimmed) : null;
    } catch {
      body = null;
    }
    shape = Array.isArray(body) ? "json-array" : "json-object";
  } else {
    shape = "text";
  }

  const topLevelKeys = body && typeof body === "object" && !Array.isArray(body)
    ? Object.keys(body as Record<string, unknown>).sort()
    : [];
  const error = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).error
    : null;
  const errorCode = error && typeof error === "object" && !Array.isArray(error) && typeof (error as Record<string, unknown>).code === "string"
    ? (error as Record<string, unknown>).code as string
    : null;

  const bodySchema = summarizeValue(body);
  const safeHeaders = [...SAFE_HEADER_NAMES].sort().map((name) => {
    const present = response.headers.has(name);
    return {
      name,
      present,
      valueClass: present
        ? name === "content-type" || name === "access-control-allow-methods" || name === "access-control-max-age" || name === "vary" || name === "x-fixvox-benchmark-proxy"
          ? "safe"
          : "redacted"
        : "omitted",
    } as const;
  }).filter((header) => header.present);

  return {
    status: response.status,
    contentType,
    shape,
    bodySchema,
    topLevelKeys,
    errorCode,
    safeHeaders,
  };
}

export function summarizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "…";
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      item: value.length > 0 ? summarizeValue(value[0], depth + 1) : null,
    };
  }
  if (typeof value === "object") {
    return {
      type: "object",
      keys: Object.keys(value as Record<string, unknown>).sort(),
      fields: Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(0, 40)
        .map(([key, entry]) => [key, summarizeValue(entry, depth + 1)])),
    };
  }
  return typeof value;
}

export function assertNormalizedContract(fixture: ContractFixture, normalized: NormalizedResponse): void {
  const statuses = Array.isArray(fixture.response.status) ? fixture.response.status : [fixture.response.status];
  if (!statuses.includes(normalized.status)) {
    throw new Error(`${fixture.id}: expected status ${statuses.join("/")}, received ${normalized.status}`);
  }

  if (fixture.response.contentType !== "empty" && fixture.response.contentType !== "missing") {
    const expected = fixture.response.contentType;
    if (!normalized.contentType?.includes(expected)) {
      throw new Error(`${fixture.id}: expected content type ${expected}, received ${normalized.contentType ?? "<missing>"}`);
    }
  }

  if (fixture.response.shape !== normalized.shape) {
    throw new Error(`${fixture.id}: expected shape ${fixture.response.shape}, received ${normalized.shape}`);
  }

  const bodyKeys = new Set(normalized.topLevelKeys);
  if (normalized.status < 400) {
    for (const key of fixture.response.requiredKeys ?? []) {
      if (!bodyKeys.has(key)) {
        throw new Error(`${fixture.id}: response is missing required key ${key}; received keys: ${normalized.topLevelKeys.join(",")}`);
      }
    }
  }

  if (normalized.errorCode && fixture.response.errorCodes && fixture.response.errorCodes.length > 0) {
    if (!fixture.response.errorCodes.includes(normalized.errorCode)) {
      throw new Error(`${fixture.id}: unexpected error code ${normalized.errorCode}`);
    }
  }
}
