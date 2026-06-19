import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRuntimeTranscriptionReport,
  parseRuntimeTranscriptionArgs,
  redactRequestId,
  writeRuntimeTranscriptionReport,
} from "../../scripts/runtime-transcription";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("runtime transcription script helpers", () => {
  it("parses dry-run artifact check arguments", () => {
    expect(
      parseRuntimeTranscriptionArgs(["--mode", "artifact-check", "--dry-run"]),
    ).toEqual({
      mode: "artifact-check",
      dryRun: true,
      allowProviderCall: false,
      audioPath: undefined,
    });
  });

  it("requires an explicit provider-call flag for real mode", () => {
    expect(
      parseRuntimeTranscriptionArgs([
        "--mode",
        "groq-real",
        "--allow-provider-call",
        "--audio",
        "artifacts/microphone-capture/audio/capture.wav",
      ]),
    ).toMatchObject({
      mode: "groq-real",
      allowProviderCall: true,
      audioPath: "artifacts/microphone-capture/audio/capture.wav",
    });
  });

  it("creates redacted reports without transcript text or raw payloads", () => {
    const report = createRuntimeTranscriptionReport({
      runId: "runtime-test",
      createdAt: "2026-06-19T00:00:00.000Z",
      mode: "groq-real",
      dryRun: false,
      providerCallsEnabled: true,
      audioPath: "artifacts/microphone-capture/audio/capture.wav",
      result: {
        status: "ok",
        text: "secret transcript text",
        provider: "groq",
        model: "whisper-large-v3",
        latencyMs: 123,
        requestId: "req_abcdefghijklmnopqrstuvwxyz",
      },
      transcriptPath: "artifacts/microphone-capture/transcripts/runtime-test.txt",
    });

    expect(report).toMatchObject({
      ok: true,
      status: "ok",
      transcriptLength: 22,
      transcriptPath: "artifacts/microphone-capture/transcripts/runtime-test.txt",
      rawProviderPayloadStored: false,
      redacted: true,
    });
    expect(JSON.stringify(report)).not.toContain("secret transcript text");
    expect(report.requestId).toBe("req_…wxyz");
  });

  it("writes reports only under the ignored runtime report directory", async () => {
    const report = createRuntimeTranscriptionReport({
      runId: "runtime-test",
      createdAt: "2026-06-19T00:00:00.000Z",
      mode: "groq-dry-run",
      dryRun: true,
      providerCallsEnabled: false,
      reportPath: "artifacts/microphone-capture/reports/runtime-test.json",
      result: {
        status: "setup-error",
        provider: "groq",
        model: "whisper-large-v3",
        latencyMs: 0,
        error: {
          code: "GROQ_API_KEY_MISSING",
          message: "Groq STT provider is not configured.",
          redacted: true,
        },
      },
    });

    await writeRuntimeTranscriptionReport(report);
    const content = await readFile(report.reportPath, "utf8");

    expect(JSON.parse(content)).toMatchObject({
      status: "setup-error",
      error: {
        redacted: true,
      },
    });
  });

  it("rejects report paths outside the ignored report directory", async () => {
    await expect(
      writeRuntimeTranscriptionReport(
        createRuntimeTranscriptionReport({
          runId: "bad-report",
          createdAt: "2026-06-19T00:00:00.000Z",
          mode: "groq-dry-run",
          dryRun: true,
          providerCallsEnabled: false,
          reportPath: "docs/bad-report.json",
        }),
      ),
    ).rejects.toThrow(/artifacts\/microphone-capture\/reports/);
  });

  it("redacts short request ids completely", () => {
    expect(redactRequestId("req1")).toBe("[REDACTED]");
  });
});
