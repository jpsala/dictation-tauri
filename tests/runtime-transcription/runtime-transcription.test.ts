import { describe, expect, it } from "vitest";
import {
  classifyRuntimeTranscript,
  mapModelGatewayTranscriptionResult,
  redactSensitiveText,
} from "../../src/model-gateway/runtime-transcription";
import { createRuntimeClip, createSetupFailure } from "./runtime-fixtures";

describe("runtime transcription outcomes", () => {
  it("redacts common secret-bearing diagnostics", () => {
    const redacted = redactSensitiveText(
      "Authorization: Bearer sk-live-secret; GROQ_API_KEY=gsk_hidden; api_key: abc123",
    );

    expect(redacted).not.toContain("sk-live-secret");
    expect(redacted).not.toContain("gsk_hidden");
    expect(redacted).not.toContain("abc123");
    expect(redacted).toContain("Bearer [REDACTED]");
    expect(redacted).toContain("GROQ_API_KEY=[REDACTED]");
    expect(redacted).toContain("api_key: [REDACTED]");
  });

  it("maps setup failures to retryable redacted runtime outcomes", () => {
    const outcome = mapModelGatewayTranscriptionResult(
      createSetupFailure(),
      createRuntimeClip(),
    );

    expect(outcome).toMatchObject({
      status: "setup-error",
      provider: "groq",
      model: "whisper-large-v3",
      retryable: true,
      error: {
        code: "PROVIDER_SETUP_MISSING",
        redacted: true,
      },
    });
    expect(JSON.stringify(outcome)).not.toContain("sk-secret-123");
  });

  it("maps successful provider results to transcript availability evidence", () => {
    const outcome = mapModelGatewayTranscriptionResult(
      {
        status: "ok",
        text: "  hello from captured audio  ",
        provider: "groq",
        model: "whisper-large-v3",
        latencyMs: 321,
        requestId: "req-redacted",
      },
      createRuntimeClip(),
    );

    expect(outcome).toEqual({
      status: "ok",
      text: "hello from captured audio",
      provider: "groq",
      model: "whisper-large-v3",
      latencyMs: 321,
      requestId: "req-redacted",
      requestEvidence: "present",
    });
  });

  it("classifies whitespace-only transcripts as empty", () => {
    expect(classifyRuntimeTranscript(" \n\t ")).toEqual({
      status: "empty",
      reason: "Transcription returned no usable text.",
    });
  });

  it("classifies known non-speech placeholders as unusable", () => {
    expect(classifyRuntimeTranscript("[BLANK_AUDIO]")).toEqual({
      status: "unusable",
      reason: "Transcription looks like a non-speech placeholder.",
    });
  });
});
