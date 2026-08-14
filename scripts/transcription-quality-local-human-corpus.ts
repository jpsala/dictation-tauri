import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import {
  validateTranscriptionQualityCorpusManifest,
} from "../src/test-fixtures/transcription-quality-contract";
import type {
  SyntheticAudioDifficulty,
  SyntheticAudioFixture,
  SyntheticAudioGoldStatus,
  TranscriptionQualityCorpusManifest,
} from "../src/test-fixtures/synthetic-audio-manifest";

export const localHumanCorpusArtifactRoot =
  "artifacts/transcription-quality/corpus";
const fixvoxHumanAudioRoot = "docs/reference/ops/audio/human";
const fixvoxVoiceManifestRef =
  "docs/reference/ops/voice-reference-manifest.yaml";

export type LocalHumanCorpusCatalogEntry = {
  id: string;
  expectedSha256: string;
  expectedBytes: number;
  categories: readonly string[];
  difficulty: SyntheticAudioDifficulty;
  language: string;
  goldStatus: SyntheticAudioGoldStatus;
  sourceType: "local-human-reference";
  format: "wav";
  sensitivity: "local-sensitive";
  versionPolicy: "gitignored-artifact";
  audioArtifactPath?: string;
  goldRef?: string;
  storageRoot?: "fixvox" | "workspace";
};

export const localHumanCorpusCatalog = [
  {
    id: "jp-fixvox-bilingual-technical-001",
    expectedSha256:
      "28a84aa5fe65a76c4b47e02d5a9a25b457a6d07374894530b07ee5038dbc5b12",
    expectedBytes: 1_075_244,
    categories: ["bilingual", "technical"],
    difficulty: "hard",
    language: "es-en",
    goldStatus: "shadow-only",
    sourceType: "local-human-reference",
    format: "wav",
    sensitivity: "local-sensitive",
    versionPolicy: "gitignored-artifact",
  },
  {
    id: "jp-punctuation-list-20260515-094801",
    expectedSha256:
      "702778a78832aa5325e51110de98f3b9384ad3da14398d4335a180a681205995",
    expectedBytes: 1_726_444,
    categories: ["punctuation", "list", "spacing"],
    difficulty: "hard",
    language: "es",
    goldStatus: "shadow-only",
    sourceType: "local-human-reference",
    format: "wav",
    sensitivity: "local-sensitive",
    versionPolicy: "gitignored-artifact",
  },
  {
    id: "jp-pro-dictation-punctuation-20260515-015712",
    expectedSha256:
      "615fe609b8f457522e0baf4d6afaea910e8e1d1d40125e8a0a5d237f07b1934f",
    expectedBytes: 2_001_644,
    categories: ["punctuation", "list", "model"],
    difficulty: "hard",
    language: "es-en",
    goldStatus: "shadow-only",
    sourceType: "local-human-reference",
    format: "wav",
    sensitivity: "local-sensitive",
    versionPolicy: "gitignored-artifact",
    audioArtifactPath: `${fixvoxHumanAudioRoot}/jp-pro-dictation-punctuation-20260515-015712.wav`,
    goldRef: fixvoxVoiceManifestRef,
    storageRoot: "fixvox",
  },
  {
    id: "jp-quality-bilingual-technical-20260812",
    expectedSha256: "ef05d25e169ca3596481f350f87bb81229e5a1645d1b87fce0ac5ba94596b4dc",
    expectedBytes: 5328044,
    categories: ["bilingual", "technical", "controlled"],
    difficulty: "hard",
    language: "es-en",
    goldStatus: "approved",
    sourceType: "local-human-reference",
    format: "wav",
    sensitivity: "local-sensitive",
    versionPolicy: "gitignored-artifact",
    audioArtifactPath: "artifacts/transcription-quality/corpus/private/audio/jp-quality-bilingual-technical-20260812.wav",
    goldRef: "artifacts/transcription-quality/corpus/private/gold/jp-quality-bilingual-technical-20260812.txt",
    storageRoot: "workspace",
  },
  {
    id: "jp-quality-punctuation-list-20260812",
    expectedSha256: "42147ce0c2b41c57641915f5475df3cdd81f92d8bc81fe027cd0852989510af3",
    expectedBytes: 4402604,
    categories: ["punctuation", "list", "spacing", "controlled"],
    difficulty: "hard",
    language: "es",
    goldStatus: "approved",
    sourceType: "local-human-reference",
    format: "wav",
    sensitivity: "local-sensitive",
    versionPolicy: "gitignored-artifact",
    audioArtifactPath: "artifacts/transcription-quality/corpus/private/audio/jp-quality-punctuation-list-20260812.wav",
    goldRef: "artifacts/transcription-quality/corpus/private/gold/jp-quality-punctuation-list-20260812.txt",
    storageRoot: "workspace",
  },
  {
    id: "jp-quality-model-comparison-20260812",
    expectedSha256: "bdccb0be75b6aa0bee86aa2d73f4423b77ac3e41757152e6b2fd028dd6063390",
    expectedBytes: 6357164,
    categories: ["punctuation", "list", "model", "technical", "controlled"],
    difficulty: "hard",
    language: "es",
    goldStatus: "approved",
    sourceType: "local-human-reference",
    format: "wav",
    sensitivity: "local-sensitive",
    versionPolicy: "gitignored-artifact",
    audioArtifactPath: "artifacts/transcription-quality/corpus/private/audio/jp-quality-model-comparison-20260812.wav",
    goldRef: "artifacts/transcription-quality/corpus/private/gold/jp-quality-model-comparison-20260812.txt",
    storageRoot: "workspace",
  },
  {
    id: "jp-recent-01",
    expectedSha256:
      "7771cd13a947606554c7c44c49108b4d36ca5bf8edf4dbc0af71cb6dba0ae52f",
    expectedBytes: 366_444,
    categories: ["recent", "dictation"],
    difficulty: "baseline",
    language: "es-en",
    goldStatus: "shadow-only",
    sourceType: "local-human-reference",
    format: "wav",
    sensitivity: "local-sensitive",
    versionPolicy: "gitignored-artifact",
  },
  {
    id: "jp-recent-06",
    expectedSha256:
      "ffc2796dc6ad1e06fa579c87c58c0ff9a9558027d9b4eab3f6383fe38cd5b41c",
    expectedBytes: 64_044,
    categories: ["recent", "short"],
    difficulty: "edge",
    language: "es-en",
    goldStatus: "shadow-only",
    sourceType: "local-human-reference",
    format: "wav",
    sensitivity: "local-sensitive",
    versionPolicy: "gitignored-artifact",
  },
] as const satisfies readonly LocalHumanCorpusCatalogEntry[];

export type LocalHumanCorpusErrorCode =
  | "MISSING_REF"
  | "HASH_MISMATCH"
  | "BYTES_MISMATCH"
  | "PATH_ESCAPE";

export class LocalHumanCorpusError extends Error {
  constructor(
    readonly code: LocalHumanCorpusErrorCode,
    readonly sampleId: string,
  ) {
    super(`${code}: ${sampleId}`);
    this.name = "LocalHumanCorpusError";
  }
}

export type LocalHumanCorpusOptions = {
  fixvoxRoot?: string;
  workspaceRoot?: string;
  catalog?: readonly LocalHumanCorpusCatalogEntry[];
  audioRefBySampleId?: Readonly<Record<string, string>>;
};

export type LocalHumanCorpusObservation = {
  id: string;
  exists: true;
  hashStatus: "match";
  bytesStatus: "match";
};

export type LocalHumanCorpusProjectionSample = Pick<
  SyntheticAudioFixture,
  | "id"
  | "audioSha256"
  | "audioBytes"
  | "format"
  | "categories"
  | "difficulty"
  | "language"
  | "goldStatus"
  | "sensitivity"
> & {
  validation: {
    exists: true;
    hash: "match";
    bytes: "match";
  };
};

export type LocalHumanCorpusProjection = {
  schemaVersion: 1;
  corpusId: string;
  corpusVersion: string;
  samples: readonly LocalHumanCorpusProjectionSample[];
};

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

function canonicalize(value: unknown): CanonicalValue {
  if (value === null || typeof value !== "object") {
    return value as CanonicalValue;
  }
  if (Array.isArray(value)) return value.map(canonicalize);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}


function validateHumanAudioRef(ref: string, sampleId: string, storageRoot: "fixvox" | "workspace"): string {
  if (ref.length === 0 || ref.includes("\0") || ref.includes("\\") ||
      ref.startsWith("/") || /^[A-Za-z]:[\\/]/.test(ref)) {
    throw new LocalHumanCorpusError("PATH_ESCAPE", sampleId);
  }
  const expectedRoot = storageRoot === "fixvox" ? `${fixvoxHumanAudioRoot}/` : `${localHumanCorpusArtifactRoot}/private/audio/`;
  const segments = ref.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..") ||
      !ref.startsWith(expectedRoot) || !ref.endsWith(".wav")) {
    throw new LocalHumanCorpusError("PATH_ESCAPE", sampleId);
  }
  return ref;
}

function resolveUnderRoot(root: string, ref: string, sampleId: string): string {
  const base = resolve(root);
  const target = resolve(base, ...ref.split("/"));
  const fromBase = relative(base, target);
  if (fromBase === ".." || fromBase.startsWith(`..${sep}`) || fromBase.includes("\0")) {
    throw new LocalHumanCorpusError("PATH_ESCAPE", sampleId);
  }
  return target;
}

function audioRefFor(entry: LocalHumanCorpusCatalogEntry, options: LocalHumanCorpusOptions): string {
  const storageRoot = entry.storageRoot ?? "fixvox";
  return validateHumanAudioRef(options.audioRefBySampleId?.[entry.id] ?? entry.audioArtifactPath ??
    `${fixvoxHumanAudioRoot}/${entry.id}.wav`, entry.id, storageRoot);
}

function goldRefFor(entry: LocalHumanCorpusCatalogEntry): string {
  return entry.goldRef ?? fixvoxVoiceManifestRef;
}



export function createLocalHumanCorpusManifest(
  options: LocalHumanCorpusOptions = {},
): TranscriptionQualityCorpusManifest {
  const entries = options.catalog ?? localHumanCorpusCatalog;
  const manifest: TranscriptionQualityCorpusManifest = {
    schemaVersion: 1,
    corpusId: "transcription-quality-local-human",
    corpusVersion: "batch-1c",
    samples: entries.map((entry) => ({
      id: entry.id,
      language: entry.language,
      audioArtifactPath: audioRefFor(entry, options),
      audioSha256: entry.expectedSha256,
      audioBytes: entry.expectedBytes,
      sourceType: entry.sourceType,
      format: entry.format,
      categories: entry.categories,
      difficulty: entry.difficulty,
      goldRef: goldRefFor(entry),
      goldStatus: entry.goldStatus,
      sensitivity: entry.sensitivity,
      versionPolicy: entry.versionPolicy,
    })),
  };
  validateTranscriptionQualityCorpusManifest(manifest);
  return manifest;
}

async function sha256File(path: string): Promise<string> {
  const { promise, resolve: resolveDigest, reject } =
    Promise.withResolvers<string>();
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.on("error", reject);
  stream.on("end", () => resolveDigest(hash.digest("hex")));
  return await promise;
}

async function verifyManifest(
  manifest: TranscriptionQualityCorpusManifest,
  entries: readonly LocalHumanCorpusCatalogEntry[],
  fixvoxRoot: string,
  workspaceRoot: string,
): Promise<readonly LocalHumanCorpusObservation[]> {
  const observations: LocalHumanCorpusObservation[] = [];
  for (const [index, sample] of manifest.samples.entries()) {
    const storageRoot = entries[index].storageRoot ?? "fixvox";
    const root = storageRoot === "fixvox" ? fixvoxRoot : workspaceRoot;
    const path = resolveUnderRoot(root, sample.audioArtifactPath, sample.id);
    let info;
    try {
      info = await stat(path);
    } catch {
      throw new LocalHumanCorpusError("MISSING_REF", sample.id);
    }
    if (!info.isFile()) {
      throw new LocalHumanCorpusError("MISSING_REF", sample.id);
    }
    if (info.size !== entries[index].expectedBytes) {
      throw new LocalHumanCorpusError("BYTES_MISMATCH", sample.id);
    }

    const observedHash = await sha256File(path);
    if (observedHash !== entries[index].expectedSha256) {
      throw new LocalHumanCorpusError("HASH_MISMATCH", sample.id);
    }
    observations.push({
      id: sample.id,
      exists: true,
      hashStatus: "match",
      bytesStatus: "match",
    });
  }
  return observations;
}

export async function verifyLocalHumanCorpus(
  options: LocalHumanCorpusOptions = {},
): Promise<{
  manifest: TranscriptionQualityCorpusManifest;
  samples: readonly LocalHumanCorpusObservation[];
}> {
  const entries = options.catalog ?? localHumanCorpusCatalog;
  const manifest = createLocalHumanCorpusManifest(options);
  const samples = await verifyManifest(
    manifest,
    entries,
    options.fixvoxRoot ?? "C:/dev/fixvox",
    options.workspaceRoot ?? process.cwd(),
  );
  return { manifest, samples };
}

function createSafeProjection(
  manifest: TranscriptionQualityCorpusManifest,
  observations: readonly LocalHumanCorpusObservation[],
): LocalHumanCorpusProjection {
  const observationById = new Map(observations.map((item) => [item.id, item]));
  return {
    schemaVersion: 1,
    corpusId: manifest.corpusId,
    corpusVersion: manifest.corpusVersion,
    samples: manifest.samples.map((sample) => {
      const observation = observationById.get(sample.id);
      if (!observation || sample.audioBytes === undefined) {
        throw new Error(`Validated observation missing for ${sample.id}.`);
      }
      return {
        id: sample.id,
        audioSha256: sample.audioSha256,
        audioBytes: sample.audioBytes,
        format: sample.format,
        categories: sample.categories,
        difficulty: sample.difficulty,
        language: sample.language,
        goldStatus: sample.goldStatus,
        sensitivity: sample.sensitivity,
        validation: {
          exists: observation.exists,
          hash: observation.hashStatus,
          bytes: observation.bytesStatus,
        },
      };
    }),
  };
}

export async function runLocalHumanCorpusMetadataOnly(
  options: LocalHumanCorpusOptions = {},
): Promise<{
  ok: true;
  sampleCount: number;
  artifacts: { manifest: string; projection: string };
  statusCounts: { present: number; hashMatch: number; bytesMatch: number };
  projection: LocalHumanCorpusProjection;
}> {
  const { manifest, samples } = await verifyLocalHumanCorpus(options);
  const projection = createSafeProjection(manifest, samples);
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const absoluteRoot = resolve(
    workspaceRoot,
    ...localHumanCorpusArtifactRoot.split("/"),
  );
  const relativeRoot = relative(resolve(workspaceRoot), absoluteRoot);
  if (
    relativeRoot === ".." ||
    relativeRoot.startsWith(`..${sep}`) ||
    relativeRoot.includes("\0")
  ) {
    throw new LocalHumanCorpusError("PATH_ESCAPE", "artifact-root");
  }

  await mkdir(absoluteRoot, { recursive: true });
  await writeFile(join(absoluteRoot, "manifest.json"), canonicalJson(manifest), "utf8");
  await writeFile(
    join(absoluteRoot, "projection.json"),
    canonicalJson(projection),
    "utf8",
  );

  return {
    ok: true,
    sampleCount: samples.length,
    artifacts: {
      manifest: `${localHumanCorpusArtifactRoot}/manifest.json`,
      projection: `${localHumanCorpusArtifactRoot}/projection.json`,
    },
    statusCounts: {
      present: samples.length,
      hashMatch: samples.length,
      bytesMatch: samples.length,
    },
    projection,
  };
}

if (import.meta.main) {
  runLocalHumanCorpusMetadataOnly()
    .then((result) => {
      console.log(
        JSON.stringify({
          ok: result.ok,
          sampleCount: result.sampleCount,
          artifacts: result.artifacts,
          statusCounts: result.statusCounts,
        }),
      );
    })
    .catch((error: unknown) => {
      const code =
        error instanceof LocalHumanCorpusError ? error.code : "UNEXPECTED_ERROR";
      console.error(JSON.stringify({ ok: false, code }));
      process.exitCode = 1;
    });
}
