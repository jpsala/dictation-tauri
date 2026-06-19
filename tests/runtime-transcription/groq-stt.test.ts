import { describe, expect, it } from "vitest";
import {
  createGroqSttGateway,
  createGroqSttGatewayFromEnv,
} from "../../src/model-gateway/groq-stt";

describe("Groq STT runtime gateway", () => {
  it("reports missing API key as redacted setup error without reading audio", async () => {
    let readCalls = 0;
    const gateway = createGroqSttGateway({
      readAudioFile: async () => {
        readCalls += 1;
        return new Blob(["audio"]);
      },
    });

    const result = await gateway.transcribe(baseInput());

    expect(result).toMatchObject({
      status: "setup-error",
      provider: "groq",
      model: "whisper-large-v3",
      error: {
        code: "GROQ_API_KEY_MISSING",
        message: "Groq STT provider is not configured.",
        redacted: true,
      },
    });
    expect(readCalls).toBe(0);
  });

  it("requires real mode so provider calls stay gated", async () => {
    const gateway = createGroqSttGateway({
      apiKey: "gsk_test_secret",
      readAudioFile: async () => new Blob(["audio"]),
    });

    const result = await gateway.transcribe({
      ...baseInput(),
      mode: "dry-run",
    });

    expect(result).toMatchObject({
      status: "setup-error",
      error: {
        code: "REAL_MODE_REQUIRED",
      },
    });
  });

  it("posts multipart audio to Groq and returns text with request evidence", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const gateway = createGroqSttGateway({
      apiKey: "gsk_test_secret",
      readAudioFile: async () => new Blob(["fake wav bytes"], { type: "audio/wav" }),
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ text: "hello runtime" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "req_123",
          },
        });
      },
      now: (() => {
        let tick = 10;
        return () => (tick += 25);
      })(),
    });

    const result = await gateway.transcribe(baseInput());

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://api.groq.com/openai/v1/audio/transcriptions",
    );
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toEqual({
      Authorization: "Bearer gsk_test_secret",
    });
    expect(calls[0].init.body).toBeInstanceOf(FormData);
    expect(result).toEqual({
      status: "ok",
      text: "hello runtime",
      provider: "groq",
      model: "whisper-large-v3",
      latencyMs: 25,
      requestId: "req_123",
    });
  });

  it("redacts provider failures without exposing API keys or raw payloads", async () => {
    const gateway = createGroqSttGateway({
      apiKey: "gsk_test_secret",
      readAudioFile: async () => new Blob(["audio"]),
      fetch: async () =>
        new Response(
          JSON.stringify({ error: { message: "bad key gsk_test_secret" } }),
          {
            status: 401,
            statusText: "Unauthorized",
            headers: { "x-request-id": "req_failed" },
          },
        ),
    });

    const result = await gateway.transcribe(baseInput());

    expect(result).toMatchObject({
      status: "provider-error",
      provider: "groq",
      model: "whisper-large-v3",
      requestId: "req_failed",
      error: {
        code: "GROQ_HTTP_401",
        redacted: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("gsk_test_secret");
  });

  it("can be configured from an injected env object without reading process.env", () => {
    const gateway = createGroqSttGatewayFromEnv({
      GROQ_API_KEY: "gsk_test_secret",
      GROQ_STT_MODEL: "whisper-large-v3-turbo",
    });

    expect(gateway).toBeTruthy();
  });

  it("accepts legacy local env keys that use hyphens", async () => {
    const gateway = createGroqSttGatewayFromEnv(
      {
        "GROQ-API-KEY": "gsk_test_secret",
        "GROQ-STT-MODEL": "whisper-large-v3-turbo",
      },
      {
        readAudioFile: async () => new Blob(["audio"]),
        fetch: async () =>
          new Response(JSON.stringify({ text: "hyphen env works" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      },
    );

    await expect(gateway.transcribe(baseInput())).resolves.toMatchObject({
      status: "ok",
      text: "hyphen env works",
      model: "whisper-large-v3-turbo",
    });
  });
});

function baseInput() {
  return {
    runId: "runtime-groq-run",
    fixtureId: "microphone",
    audioPath: "artifacts/microphone-capture/audio/capture-001.wav",
    mode: "real" as const,
  };
}
