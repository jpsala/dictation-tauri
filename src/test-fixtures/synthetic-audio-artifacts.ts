import type {
  SyntheticAudioFixture,
  SyntheticAudioVersionPolicy,
} from "./synthetic-audio-manifest";

export const syntheticAudioArtifactRoot = "artifacts/synthetic-audio-stt";

export const syntheticAudioArtifactDirectories = {
  audio: `${syntheticAudioArtifactRoot}/audio`,
  transcripts: `${syntheticAudioArtifactRoot}/transcripts`,
  providerPayloads: `${syntheticAudioArtifactRoot}/provider-payloads`,
  reports: `${syntheticAudioArtifactRoot}/reports`,
} as const;

export type AudioArtifactGitPolicy = "ignored" | "versioned" | "temporary";

export type AudioArtifactPolicy = {
  artifactRoot: string;
  allowedDirectories: readonly string[];
  gitPolicy: AudioArtifactGitPolicy;
};

export type AudioArtifactPathResult =
  | {
      ok: true;
      normalizedPath: string;
      policy: AudioArtifactPolicy;
    }
  | {
      ok: false;
      reason: string;
      policy: AudioArtifactPolicy;
    };

export type AudioArtifactSetupStatus = "ready" | "setup-required";

export type AudioArtifactSetupResult = {
  fixtureId: string;
  artifactPath: string;
  exists: boolean;
  format: SyntheticAudioFixture["format"];
  status: AudioArtifactSetupStatus;
  policy: AudioArtifactPolicy;
  reason?: string;
};

const allowedDirectories = Object.values(syntheticAudioArtifactDirectories);

export function createSyntheticAudioArtifactPolicy(
  versionPolicy: SyntheticAudioVersionPolicy = "gitignored-artifact",
): AudioArtifactPolicy {
  return {
    artifactRoot: syntheticAudioArtifactRoot,
    allowedDirectories,
    gitPolicy: mapVersionPolicyToGitPolicy(versionPolicy),
  };
}

export function validateSyntheticAudioArtifactPath(
  fixture: Pick<SyntheticAudioFixture, "audioArtifactPath" | "versionPolicy">,
): AudioArtifactPathResult {
  const policy = createSyntheticAudioArtifactPolicy(fixture.versionPolicy);
  const normalizedPath = normalizeArtifactPath(fixture.audioArtifactPath);

  if (isAbsoluteArtifactPath(fixture.audioArtifactPath)) {
    return {
      ok: false,
      reason: "Audio artifact paths must be workspace-relative.",
      policy,
    };
  }

  if (!isUnderAllowedDirectory(normalizedPath)) {
    return {
      ok: false,
      reason:
        "Audio artifact path must stay under artifacts/synthetic-audio-stt/.",
      policy,
    };
  }

  return {
    ok: true,
    normalizedPath,
    policy,
  };
}

export function evaluateSyntheticAudioArtifactSetup(
  fixture: SyntheticAudioFixture,
  artifactExists = false,
): AudioArtifactSetupResult {
  const pathResult = validateSyntheticAudioArtifactPath(fixture);
  const policy = createSyntheticAudioArtifactPolicy(fixture.versionPolicy);

  if (!pathResult.ok) {
    return {
      fixtureId: fixture.id,
      artifactPath: normalizeArtifactPath(fixture.audioArtifactPath),
      exists: false,
      format: fixture.format,
      status: "setup-required",
      policy,
      reason: pathResult.reason,
    };
  }

  if (!artifactExists) {
    return {
      fixtureId: fixture.id,
      artifactPath: pathResult.normalizedPath,
      exists: false,
      format: fixture.format,
      status: "setup-required",
      policy,
      reason: "Audio artifact is missing; generate or restore local fixture audio.",
    };
  }

  return {
    fixtureId: fixture.id,
    artifactPath: pathResult.normalizedPath,
    exists: true,
    format: fixture.format,
    status: "ready",
    policy,
  };
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

function mapVersionPolicyToGitPolicy(
  versionPolicy: SyntheticAudioVersionPolicy,
): AudioArtifactGitPolicy {
  switch (versionPolicy) {
    case "versioned-metadata":
    case "gitignored-artifact":
      return "ignored";
    case "temporary":
      return "temporary";
  }
}
