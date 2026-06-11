import type {
  CapturedAudioArtifact,
  CaptureArtifactPolicy,
} from "./types";

export const microphoneCaptureArtifactRoot = "artifacts/microphone-capture";

export const microphoneCaptureArtifactDirectories = {
  audio: `${microphoneCaptureArtifactRoot}/audio`,
  transcripts: `${microphoneCaptureArtifactRoot}/transcripts`,
  providerPayloads: `${microphoneCaptureArtifactRoot}/provider-payloads`,
  reports: `${microphoneCaptureArtifactRoot}/reports`,
} as const;

export type MicrophoneCaptureArtifactPolicy = {
  artifactRoot: string;
  allowedDirectories: readonly string[];
  gitPolicy: "ignored";
  capturePolicy: CaptureArtifactPolicy;
};

export type MicrophoneCaptureArtifactPathResult =
  | {
      ok: true;
      normalizedPath: string;
      policy: MicrophoneCaptureArtifactPolicy;
    }
  | {
      ok: false;
      reason: string;
      policy: MicrophoneCaptureArtifactPolicy;
    };

const allowedDirectories = Object.values(microphoneCaptureArtifactDirectories);

export function createMicrophoneCaptureArtifactPolicy(): MicrophoneCaptureArtifactPolicy {
  return {
    artifactRoot: microphoneCaptureArtifactRoot,
    allowedDirectories,
    gitPolicy: "ignored",
    capturePolicy: "gitignored-local",
  };
}

export function validateMicrophoneCaptureArtifactPath(
  artifactPath: string,
): MicrophoneCaptureArtifactPathResult {
  const policy = createMicrophoneCaptureArtifactPolicy();
  const normalizedPath = normalizeArtifactPath(artifactPath);

  if (isAbsoluteArtifactPath(artifactPath)) {
    return {
      ok: false,
      reason: "Microphone capture artifact paths must be workspace-relative.",
      policy,
    };
  }

  if (normalizedPath.split("/").includes("..")) {
    return {
      ok: false,
      reason: "Microphone capture artifact paths must not contain traversal.",
      policy,
    };
  }

  if (!isUnderAllowedDirectory(normalizedPath)) {
    return {
      ok: false,
      reason:
        "Microphone capture artifact paths must stay under artifacts/microphone-capture/.",
      policy,
    };
  }

  return {
    ok: true,
    normalizedPath,
    policy,
  };
}

export function validateCapturedAudioArtifact(
  artifact: CapturedAudioArtifact,
): MicrophoneCaptureArtifactPathResult {
  const artifactPath = artifact.relativePath ?? artifact.path;

  if (!artifactPath) {
    return {
      ok: false,
      reason: "Captured audio artifacts must include a local artifact path.",
      policy: createMicrophoneCaptureArtifactPolicy(),
    };
  }

  if (artifact.policy !== "gitignored-local") {
    return {
      ok: false,
      reason: "Captured audio artifacts must use the gitignored-local policy.",
      policy: createMicrophoneCaptureArtifactPolicy(),
    };
  }

  if (artifact.sensitivity !== "real-user-audio") {
    return {
      ok: false,
      reason: "Captured audio artifacts must be marked as real-user-audio.",
      policy: createMicrophoneCaptureArtifactPolicy(),
    };
  }

  return validateMicrophoneCaptureArtifactPath(artifactPath);
}

function normalizeArtifactPath(artifactPath: string): string {
  return artifactPath.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function isUnderAllowedDirectory(artifactPath: string): boolean {
  return allowedDirectories.some((directory) =>
    artifactPath.startsWith(`${directory}/`),
  );
}

function isAbsoluteArtifactPath(artifactPath: string): boolean {
  return (
    artifactPath.startsWith("/") ||
    artifactPath.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(artifactPath)
  );
}
