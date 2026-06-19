import { describe, expect, it, vi } from "vitest";
import { createHostRuntimeTranscriber } from "../../src/host-runtime/transcriber";

const configuredEnv = {
  GROQ_API_KEY: "gsk_test_secret_do_not_expose",
  GROQ_STT_MODEL: "whisper-large-v3",
};

const baseRequest = {
  runId: "host-run-001",
  audioPath: "artifacts/microphone-capture/audio/capture-001.wav",
  mode: "real" as const,
  allowProviderCall: true,
};

describe("host runtime transcriber", () => {
  it("transcribes through injected env, fetch, audio reader, and artifact writer", async () => {
    const writes: Array<{ path: string; content: string; kind: string }> = [];
    const readAudioFile = vi.fn(async () => new Blob(["fake audio"], { type: "audio/wav" }));
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ text: " host transcript " }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_safe_123",
        },
      }),
    ) as typeof globalThis.fetch;
    const transcriber = createHostRuntimeTranscriber({
      env: configuredEnv,
      fetch,
      readAudioFile,
      writeArtifact: async (write) => {
        writes.push(write);
      },
    });

    const response = await transcriber.transcribe(baseRequest);

    expect(response).toMatchObject({
      status: "ok",
      text: "host transcript",
      provider: "groq",
      model: "whisper-large-v3",
      requestId: "req_safe_123",
      transcriptPath: "artifacts/microphone-capture/transcripts/host-run-001.txt",
      reportPath: "artifacts/microphone-capture/reports/host-run-001.json",
      redacted: true,
    });
    expect(readAudioFile).toHaveBeenCalledWith({
      audioPath: "artifacts/microphone-capture/audio/capture-001.wav",
      runId: "host-run-001",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({
      path: "artifacts/microphone-capture/transcripts/host-run-001.txt",
      kind: "transcript",
      content: "host transcript",
    });
    expect(writes[1]).toMatchObject({
      path: "artifacts/microphone-capture/reports/host-run-001.json",
      kind: "report",
    });
    expect(writes[1].content).toContain('"transcriptLength": 15');
    expect(writes[1].content).not.toContain("host transcript");
    expect(JSON.stringify(response)).not.toContain(configuredEnv.GROQ_API_KEY);
  });

  it("fails missing config before audio reads or provider fetch", async () => {
    const readAudioFile = vi.fn(async () => new Uint8Array());
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    const transcriber = createHostRuntimeTranscriber({
      env: {},
      fetch,
      readAudioFile,
    });

    const response = await transcriber.transcribe(baseRequest);

    expect(response).toMatchObject({
      status: "setup-error",
      error: {
        code: "GROQ_API_KEY_MISSING",
        message: "Groq STT provider is not configured.",
        redacted: true,
      },
      retryable: true,
      redacted: true,
    });
    expect(readAudioFile).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires explicit provider-call approval for real mode", async () => {
    const readAudioFile = vi.fn(async () => new Uint8Array());
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    const transcriber = createHostRuntimeTranscriber({
      env: configuredEnv,
      fetch,
      readAudioFile,
    });

    const response = await transcriber.transcribe({
      ...baseRequest,
      allowProviderCall: false,
    });

    expect(response).toMatchObject({
      status: "setup-error",
      error: {
        code: "PROVIDER_CALL_NOT_ALLOWED",
        redacted: true,
      },
    });
    expect(readAudioFile).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("redacts provider failures without leaking tokens or transcript text", async () => {
    const readAudioFile = vi.fn(async () => new Blob(["audio"]));
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "bad key gsk_test_secret_do_not_expose" }), {
        status: 401,
        statusText: "Unauthorized",
        headers: { "x-request-id": "Bearer gsk_request_secret" },
      }),
    ) as typeof globalThis.fetch;
    const transcriber = createHostRuntimeTranscriber({
      env: configuredEnv,
      fetch,
      readAudioFile,
    });

    const response = await transcriber.transcribe(baseRequest);

    expect(response).toMatchObject({
      status: "provider-error",
      error: {
        code: "GROQ_HTTP_401",
        redacted: true,
      },
      requestId: "redacted-request-id",
      retryable: true,
      redacted: true,
    });
    expect(JSON.stringify(response)).not.toContain(configuredEnv.GROQ_API_KEY);
    expect(JSON.stringify(response)).not.toContain("gsk_request_secret");
  });

  it("rejects missing or out-of-root audio paths before local reads", async () => {
    const readAudioFile = vi.fn(async () => new Uint8Array());
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    const transcriber = createHostRuntimeTranscriber({
      env: configuredEnv,
      fetch,
      readAudioFile,
    });

    await expect(
      transcriber.transcribe({
        ...baseRequest,
        audioPath: "artifacts/synthetic-audio-stt/audio/sample.wav",
      }),
    ).resolves.toMatchObject({
      status: "missing-audio",
      error: {
        code: "ARTIFACT_PATH_OUT_OF_ROOT",
        redacted: true,
      },
    });

    await expect(
      transcriber.transcribe({
        ...baseRequest,
        audioPath: "artifacts/microphone-capture/audio/../reports/leak.json",
      }),
    ).resolves.toMatchObject({
      status: "missing-audio",
      error: {
        code: "ARTIFACT_PATH_TRAVERSAL",
        redacted: true,
      },
    });

    expect(readAudioFile).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps empty provider successes to retryable empty outcomes", async () => {
    const readAudioFile = vi.fn(async () => new Blob(["audio"]));
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ text: "   " }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof globalThis.fetch;
    const transcriber = createHostRuntimeTranscriber({
      env: configuredEnv,
      fetch,
      readAudioFile,
    });

    const response = await transcriber.transcribe(baseRequest);

    expect(response).toMatchObject({
      status: "empty",
      error: {
        code: "EMPTY_TRANSCRIPT",
        message: "Transcription returned no usable text.",
        redacted: true,
      },
      retryable: true,
      redacted: true,
    });
  });
});
