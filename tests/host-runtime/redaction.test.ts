import { describe, expect, it } from "vitest";
import type { HostTranscriptionResponse } from "../../src/host-runtime/types";
import {
  createRedactedHostRuntimeError,
  isRedactedHostRuntimeError,
  redactHostRuntimeRequestId,
  redactHostRuntimeText,
  redactHostTranscriptionResponse,
} from "../../src/host-runtime/redaction";

describe("host runtime redaction", () => {
  it("creates stable redacted errors without leaking API keys or auth headers", () => {
    const error = createRedactedHostRuntimeError(
      "groq-http-401",
      "Authorization: Bearer gsk_test_secret; GROQ_API_KEY=gsk_env_secret; api_key: abc123",
    );

    expect(error).toMatchObject({
      code: "GROQ_HTTP_401",
      redacted: true,
    });
    expect(error.message).toContain("Authorization: Bearer [REDACTED]");
    expect(error.message).toContain("GROQ_API_KEY=[REDACTED]");
    expect(error.message).toContain("api_key: [REDACTED]");
    expect(JSON.stringify(error)).not.toContain("gsk_test_secret");
    expect(JSON.stringify(error)).not.toContain("gsk_env_secret");
    expect(JSON.stringify(error)).not.toContain("abc123");
  });

  it("redacts injected secrets and transcript text from provider diagnostics", () => {
    const diagnostic = {
      error: {
        message:
          "provider failed after seeing transcript hello private dictation and token custom-secret-value",
      },
      debug: "raw payload must not escape",
    };

    const redacted = redactHostRuntimeText(diagnostic, {
      secrets: ["custom-secret-value"],
      transcriptText: "hello private dictation",
    });

    expect(redacted).not.toContain("custom-secret-value");
    expect(redacted).not.toContain("hello private dictation");
    expect(redacted).toContain("[REDACTED]");
  });

  it("keeps request ids only when they are safe labels", () => {
    expect(redactHostRuntimeRequestId("req_123-safe:abc.def")).toBe(
      "req_123-safe:abc.def",
    );
    expect(redactHostRuntimeRequestId("Bearer gsk_request_secret")).toBe(
      "redacted-request-id",
    );
    expect(redactHostRuntimeRequestId("req with spaces")).toBe(
      "redacted-request-id",
    );
  });

  it("marks error responses redacted and strips unsafe request evidence", () => {
    const response: HostTranscriptionResponse = {
      status: "provider-error",
      error: {
        code: "PROVIDER_RAW",
        message:
          "Provider payload includes Authorization: Bearer gsk_test_secret and transcript private words",
        redacted: true,
      },
      provider: "groq",
      model: "whisper-large-v3",
      requestId: "Bearer gsk_request_secret",
      retryable: true,
      redacted: true,
    };

    const redacted = redactHostTranscriptionResponse(response, {
      transcriptText: "private words",
    });

    expect(redacted).toMatchObject({
      status: "provider-error",
      requestId: "redacted-request-id",
      redacted: true,
      error: {
        code: "PROVIDER_RAW",
        redacted: true,
      },
    });
    expect(JSON.stringify(redacted)).not.toContain("gsk_test_secret");
    expect(JSON.stringify(redacted)).not.toContain("private words");
  });

  it("preserves ok transcript text in memory while still redacting unsafe request ids", () => {
    const response: HostTranscriptionResponse = {
      status: "ok",
      text: "reviewable transcript text",
      provider: "groq",
      model: "whisper-large-v3",
      latencyMs: 42,
      requestId: "req_safe_123",
      redacted: true,
    };

    expect(redactHostTranscriptionResponse(response)).toEqual(response);
  });

  it("identifies redacted host runtime errors", () => {
    expect(
      isRedactedHostRuntimeError(
        createRedactedHostRuntimeError("SETUP", "safe message"),
      ),
    ).toBe(true);
    expect(isRedactedHostRuntimeError(new Error("unsafe"))).toBe(false);
  });
});
