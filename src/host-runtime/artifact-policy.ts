export const hostRuntimeArtifactRoot = "artifacts/microphone-capture" as const;

export const hostRuntimeArtifactDirectories = {
  audio: `${hostRuntimeArtifactRoot}/audio`,
  transcripts: `${hostRuntimeArtifactRoot}/transcripts`,
  reports: `${hostRuntimeArtifactRoot}/reports`,
  providerPayloads: `${hostRuntimeArtifactRoot}/provider-payloads`,
} as const;

export type HostRuntimeArtifactKind = keyof typeof hostRuntimeArtifactDirectories;

export type HostRuntimeArtifactPolicy = {
  artifactRoot: typeof hostRuntimeArtifactRoot;
  allowedDirectories: readonly string[];
  gitPolicy: "ignored";
  providerPayloads: {
    status: "reserved";
    enabledByDefault: false;
  };
};

export type HostRuntimeArtifactPathOptions = {
  allowedKinds?: readonly HostRuntimeArtifactKind[];
  allowProviderPayloads?: boolean;
};

export type HostRuntimeArtifactPathResult =
  | {
      ok: true;
      normalizedPath: string;
      artifactKind: HostRuntimeArtifactKind;
      policy: HostRuntimeArtifactPolicy;
    }
  | {
      ok: false;
      code: string;
      reason: string;
      policy: HostRuntimeArtifactPolicy;
    };

const allArtifactKinds = Object.keys(
  hostRuntimeArtifactDirectories,
) as HostRuntimeArtifactKind[];

export function createHostRuntimeArtifactPolicy(): HostRuntimeArtifactPolicy {
  return {
    artifactRoot: hostRuntimeArtifactRoot,
    allowedDirectories: Object.values(hostRuntimeArtifactDirectories),
    gitPolicy: "ignored",
    providerPayloads: {
      status: "reserved",
      enabledByDefault: false,
    },
  };
}

export function validateHostRuntimeArtifactPath(
  artifactPath: string,
  options: HostRuntimeArtifactPathOptions = {},
): HostRuntimeArtifactPathResult {
  const policy = createHostRuntimeArtifactPolicy();
  const normalizedPath = normalizeHostRuntimeArtifactPath(artifactPath);

  if (!artifactPath || !artifactPath.trim()) {
    return invalidArtifactPath(
      "ARTIFACT_PATH_EMPTY",
      "Host runtime artifact paths must be non-empty.",
      policy,
    );
  }

  if (containsNulByte(artifactPath)) {
    return invalidArtifactPath(
      "ARTIFACT_PATH_INVALID",
      "Host runtime artifact paths must not contain NUL bytes.",
      policy,
    );
  }

  if (isAbsoluteArtifactPath(artifactPath)) {
    return invalidArtifactPath(
      "ARTIFACT_PATH_ABSOLUTE",
      "Host runtime artifact paths must be workspace-relative.",
      policy,
    );
  }

  if (containsTraversal(normalizedPath)) {
    return invalidArtifactPath(
      "ARTIFACT_PATH_TRAVERSAL",
      "Host runtime artifact paths must not contain traversal.",
      policy,
    );
  }

  const artifactKind = getArtifactKind(normalizedPath);

  if (!artifactKind) {
    return invalidArtifactPath(
      "ARTIFACT_PATH_OUT_OF_ROOT",
      "Host runtime artifact paths must stay under artifacts/microphone-capture/.",
      policy,
    );
  }

  if (
    artifactKind === "providerPayloads" &&
    options.allowProviderPayloads !== true
  ) {
    return invalidArtifactPath(
      "PROVIDER_PAYLOADS_RESERVED",
      "Provider payload artifacts are reserved and disabled by default.",
      policy,
    );
  }

  const allowedKinds = options.allowedKinds ?? allArtifactKinds;
  if (!allowedKinds.includes(artifactKind)) {
    return invalidArtifactPath(
      "ARTIFACT_KIND_NOT_ALLOWED",
      `Host runtime artifact path must be under ${formatAllowedKinds(allowedKinds)}.`,
      policy,
    );
  }

  return {
    ok: true,
    normalizedPath,
    artifactKind,
    policy,
  };
}

export function validateHostRuntimeAudioPath(
  audioPath: string,
): HostRuntimeArtifactPathResult {
  return validateHostRuntimeArtifactPath(audioPath, { allowedKinds: ["audio"] });
}

export function validateHostRuntimeTranscriptPath(
  transcriptPath: string,
): HostRuntimeArtifactPathResult {
  return validateHostRuntimeArtifactPath(transcriptPath, {
    allowedKinds: ["transcripts"],
  });
}

export function validateHostRuntimeReportPath(
  reportPath: string,
): HostRuntimeArtifactPathResult {
  return validateHostRuntimeArtifactPath(reportPath, { allowedKinds: ["reports"] });
}

export function normalizeHostRuntimeArtifactPath(artifactPath: string): string {
  return artifactPath.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
}

function invalidArtifactPath(
  code: string,
  reason: string,
  policy: HostRuntimeArtifactPolicy,
): HostRuntimeArtifactPathResult {
  return {
    ok: false,
    code,
    reason,
    policy,
  };
}

function getArtifactKind(
  normalizedPath: string,
): HostRuntimeArtifactKind | undefined {
  return allArtifactKinds.find((kind) =>
    normalizedPath.startsWith(`${hostRuntimeArtifactDirectories[kind]}/`),
  );
}

function containsTraversal(normalizedPath: string): boolean {
  return normalizedPath
    .split("/")
    .some((segment) => segment === ".." || segment.toLowerCase() === "%2e%2e");
}

function containsNulByte(artifactPath: string): boolean {
  return artifactPath.includes("\0");
}

function isAbsoluteArtifactPath(artifactPath: string): boolean {
  return (
    artifactPath.startsWith("/") ||
    artifactPath.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(artifactPath) ||
    /^file:\/\//i.test(artifactPath)
  );
}

function formatAllowedKinds(allowedKinds: readonly HostRuntimeArtifactKind[]): string {
  return allowedKinds
    .map((kind) => hostRuntimeArtifactDirectories[kind])
    .join(" or ");
}
