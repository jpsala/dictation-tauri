import { describe, expect, it } from "vitest";
import {
  createHostRuntimeArtifactPolicy,
  hostRuntimeArtifactDirectories,
  hostRuntimeArtifactRoot,
  validateHostRuntimeArtifactPath,
  validateHostRuntimeAudioPath,
  validateHostRuntimeReportPath,
  validateHostRuntimeTranscriptPath,
} from "../../src/host-runtime/artifact-policy";

describe("host runtime artifact policy", () => {
  it("defines ignored local roots for audio, transcripts, reports, and reserved provider payloads", () => {
    expect(createHostRuntimeArtifactPolicy()).toEqual({
      artifactRoot: hostRuntimeArtifactRoot,
      allowedDirectories: Object.values(hostRuntimeArtifactDirectories),
      gitPolicy: "ignored",
      providerPayloads: {
        status: "reserved",
        enabledByDefault: false,
      },
    });
  });

  it("accepts workspace-relative paths under allowed host runtime roots", () => {
    expect(
      validateHostRuntimeAudioPath(
        "artifacts/microphone-capture/audio/capture-001.wav",
      ),
    ).toMatchObject({
      ok: true,
      normalizedPath: "artifacts/microphone-capture/audio/capture-001.wav",
      artifactKind: "audio",
    });

    expect(
      validateHostRuntimeTranscriptPath(
        ".\\artifacts\\microphone-capture\\transcripts\\run-001.txt",
      ),
    ).toMatchObject({
      ok: true,
      normalizedPath: "artifacts/microphone-capture/transcripts/run-001.txt",
      artifactKind: "transcripts",
    });

    expect(
      validateHostRuntimeReportPath(
        "./artifacts/microphone-capture/reports/run-001.json",
      ),
    ).toMatchObject({
      ok: true,
      normalizedPath: "artifacts/microphone-capture/reports/run-001.json",
      artifactKind: "reports",
    });
  });

  it("rejects absolute paths, traversal, encoded traversal, and out-of-root reads", () => {
    expect(validateHostRuntimeAudioPath("C:/private/capture.wav")).toMatchObject({
      ok: false,
      code: "ARTIFACT_PATH_ABSOLUTE",
      reason: "Host runtime artifact paths must be workspace-relative.",
    });

    expect(validateHostRuntimeAudioPath("/tmp/capture.wav")).toMatchObject({
      ok: false,
      code: "ARTIFACT_PATH_ABSOLUTE",
    });

    expect(
      validateHostRuntimeAudioPath(
        "artifacts/microphone-capture/audio/../reports/leak.json",
      ),
    ).toMatchObject({
      ok: false,
      code: "ARTIFACT_PATH_TRAVERSAL",
      reason: "Host runtime artifact paths must not contain traversal.",
    });

    expect(
      validateHostRuntimeAudioPath(
        "artifacts/microphone-capture/audio/%2e%2e/reports/leak.json",
      ),
    ).toMatchObject({
      ok: false,
      code: "ARTIFACT_PATH_TRAVERSAL",
    });

    expect(
      validateHostRuntimeAudioPath("artifacts/synthetic-audio-stt/audio/sample.wav"),
    ).toMatchObject({
      ok: false,
      code: "ARTIFACT_PATH_OUT_OF_ROOT",
      reason:
        "Host runtime artifact paths must stay under artifacts/microphone-capture/.",
    });
  });

  it("requires audio requests to stay in the audio subtree before any read", () => {
    expect(
      validateHostRuntimeAudioPath(
        "artifacts/microphone-capture/transcripts/run-001.txt",
      ),
    ).toMatchObject({
      ok: false,
      code: "ARTIFACT_KIND_NOT_ALLOWED",
    });
  });

  it("keeps provider payload storage reserved unless explicitly enabled later", () => {
    expect(
      validateHostRuntimeArtifactPath(
        "artifacts/microphone-capture/provider-payloads/raw.json",
      ),
    ).toMatchObject({
      ok: false,
      code: "PROVIDER_PAYLOADS_RESERVED",
      reason: "Provider payload artifacts are reserved and disabled by default.",
    });

    expect(
      validateHostRuntimeArtifactPath(
        "artifacts/microphone-capture/provider-payloads/redacted.json",
        { allowProviderPayloads: true, allowedKinds: ["providerPayloads"] },
      ),
    ).toMatchObject({
      ok: true,
      normalizedPath:
        "artifacts/microphone-capture/provider-payloads/redacted.json",
      artifactKind: "providerPayloads",
    });
  });
});
