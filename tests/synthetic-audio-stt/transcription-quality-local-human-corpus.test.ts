import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createLocalHumanCorpusManifest,
  localHumanCorpusCatalog,
  runLocalHumanCorpusMetadataOnly,
  verifyLocalHumanCorpus,
  type LocalHumanCorpusCatalogEntry,
} from "../../scripts/transcription-quality-local-human-corpus";
import {
  assertTranscriptionQualityGoldScoreable,
  isTranscriptionQualityGoldScoreable,
  TranscriptionQualityValidationError,
  validateTranscriptionQualityCorpusManifest,
} from "../../src/test-fixtures/transcription-quality-contract";
import type { TranscriptionQualityCorpusManifest } from "../../src/test-fixtures/synthetic-audio-manifest";

const temporaryRoots: string[] = [];
const authorizedIds = [
  "jp-fixvox-bilingual-technical-001",
  "jp-punctuation-list-20260515-094801",
  "jp-pro-dictation-punctuation-20260515-015712",
  "jp-quality-bilingual-technical-20260812",
  "jp-quality-punctuation-list-20260812",
  "jp-quality-model-comparison-20260812",
  "jp-recent-01",
  "jp-recent-06",
] as const;
const approvedIds = authorizedIds.slice(3, 6);
const shadowOnlyIds = [...authorizedIds.slice(0, 3), ...authorizedIds.slice(6)];
const forbiddenPublicKeys =
  /"(?:expectedText|goldRef|gold|raw|final|transcript|notes|providerCalls|runId)"\s*:/i;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function createTemporaryCorpus(): Promise<{
  root: string;
  fixvoxRoot: string;
  workspaceRoot: string;
  catalog: readonly LocalHumanCorpusCatalogEntry[];
}> {
  const root = await mkdtemp(join(tmpdir(), "tq-human-"));
  temporaryRoots.push(root);
  const fixvoxRoot = join(root, "fixvox");
  const workspaceRoot = join(root, "workspace");
  const catalog = localHumanCorpusCatalog.map((entry, index) => {
    const bytes = Buffer.from(`metadata-only-fixture-${index}`, "utf8");
    return {
      ...entry,
      expectedBytes: bytes.length,
      expectedSha256: sha256(bytes),
    };
  });
  await Promise.all(
    catalog.map(async (entry, index) => {
      const bytes = Buffer.from(`metadata-only-fixture-${index}`, "utf8");
      const base = entry.storageRoot === "workspace" ? workspaceRoot : fixvoxRoot;
      const audioRef =
        entry.audioArtifactPath ??
        `docs/reference/ops/audio/human/${entry.id}.wav`;
      const audioPath = audioRef.split("/");
      await mkdir(join(base, ...audioPath.slice(0, -1)), { recursive: true });
      await writeFile(join(base, ...audioPath), bytes);
    }),
  );
  return { root, fixvoxRoot, workspaceRoot, catalog };
}

function manifestWithPrivateField(
  key: "expectedText" | "gold" | "raw" | "final" | "transcript",
): TranscriptionQualityCorpusManifest {
  const manifest = createLocalHumanCorpusManifest();
  return {
    ...manifest,
    samples: [
      { ...manifest.samples[0], [key]: "LOCAL-SENSITIVE-SENTINEL-7b41" },
      ...manifest.samples.slice(1),
    ],
  } as TranscriptionQualityCorpusManifest;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("Batch 1C local-human corpus metadata boundary", () => {
  it("represents exactly eight samples and exact Batch 1C metadata", () => {
    const manifest = createLocalHumanCorpusManifest();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.samples.map((sample) => sample.id)).toEqual(authorizedIds);
    expect(
      manifest.samples
        .filter((sample) => sample.goldStatus === "approved")
        .map((sample) => sample.id),
    ).toEqual(approvedIds);
    expect(
      manifest.samples
        .filter((sample) => sample.goldStatus === "shadow-only")
        .map((sample) => sample.id),
    ).toEqual(shadowOnlyIds);
    expect(manifest.samples.slice(3, 6).map((sample) => [
      sample.language, sample.goldStatus, sample.categories,
    ])).toEqual([
      ["es-en", "approved", ["bilingual", "technical", "controlled"]],
      ["es", "approved", ["punctuation", "list", "spacing", "controlled"]],
      ["es", "approved", ["punctuation", "list", "model", "technical", "controlled"]],
    ]);
    expect(localHumanCorpusCatalog.slice(3, 6).map((entry) => [
      entry.expectedSha256, entry.expectedBytes, entry.storageRoot,
      entry.audioArtifactPath, entry.goldRef,
    ])).toEqual([
      ["ef05d25e169ca3596481f350f87bb81229e5a1645d1b87fce0ac5ba94596b4dc", 5328044, "workspace", "artifacts/transcription-quality/corpus/private/audio/jp-quality-bilingual-technical-20260812.wav", "artifacts/transcription-quality/corpus/private/gold/jp-quality-bilingual-technical-20260812.txt"],
      ["42147ce0c2b41c57641915f5475df3cdd81f92d8bc81fe027cd0852989510af3", 4402604, "workspace", "artifacts/transcription-quality/corpus/private/audio/jp-quality-punctuation-list-20260812.wav", "artifacts/transcription-quality/corpus/private/gold/jp-quality-punctuation-list-20260812.txt"],
      ["bdccb0be75b6aa0bee86aa2d73f4423b77ac3e41757152e6b2fd028dd6063390", 6357164, "workspace", "artifacts/transcription-quality/corpus/private/audio/jp-quality-model-comparison-20260812.wav", "artifacts/transcription-quality/corpus/private/gold/jp-quality-model-comparison-20260812.txt"],
    ]);
    expect(manifest.samples.every((sample) => !("expectedText" in sample))).toBe(true);
    expect(() => validateTranscriptionQualityCorpusManifest(manifest)).not.toThrow();
  });

  it("allows scoring only for the three approved entries", () => {
    const manifest = createLocalHumanCorpusManifest();
    expect(
      manifest.samples
        .filter((sample) => isTranscriptionQualityGoldScoreable(sample.goldStatus))
        .map((sample) => sample.id),
    ).toEqual(approvedIds);
    expect(shadowOnlyIds).toHaveLength(5);
  });

  it("verifies fixvox and workspace roots without producing a run", async () => {
    const { fixvoxRoot, workspaceRoot, catalog } = await createTemporaryCorpus();
    const verified = await verifyLocalHumanCorpus({ fixvoxRoot, workspaceRoot, catalog });
    expect(verified.samples).toHaveLength(8);
    expect(verified.samples.every((sample) => sample.exists && sample.hashStatus === "match" && sample.bytesStatus === "match")).toBe(true);
    expect(verified).not.toHaveProperty("run");
    expect(verified).not.toHaveProperty("providerCalls");
  });

  it.each(["expectedText", "gold", "raw", "final", "transcript"] as const)(
    "rejects private inline %s from a local-sensitive manifest",
    (key) => {
      try {
        validateTranscriptionQualityCorpusManifest(manifestWithPrivateField(key));
      } catch (error) {
        expect(error).toBeInstanceOf(TranscriptionQualityValidationError);
        expect((error as TranscriptionQualityValidationError).code).toBe(
          "PRIVATE_INLINE_TEXT",
        );
        return;
      }
      throw new Error(`Expected PRIVATE_INLINE_TEXT for ${key}.`);
    },
  );

  it("allows scoring only for approved gold", () => {
    expect(isTranscriptionQualityGoldScoreable("approved")).toBe(true);
    expect(isTranscriptionQualityGoldScoreable("provisional")).toBe(false);
    expect(isTranscriptionQualityGoldScoreable("shadow-only")).toBe(false);
    expect(() => assertTranscriptionQualityGoldScoreable("approved")).not.toThrow();
    for (const status of ["provisional", "shadow-only"] as const) {
      expect(() => assertTranscriptionQualityGoldScoreable(status)).toThrowError(
        expect.objectContaining({ code: "INVALID_GOLD_SCORING" }),
      );
    }
  });

  it("reports stable missing, bytes, and hash failures", async () => {
    const missingRoot = await mkdtemp(join(tmpdir(), "tq-human-missing-"));
    temporaryRoots.push(missingRoot);
    await expect(
      verifyLocalHumanCorpus({ fixvoxRoot: missingRoot, workspaceRoot: missingRoot }),
    ).rejects.toMatchObject({ code: "MISSING_REF" });

    const { fixvoxRoot, workspaceRoot, catalog } = await createTemporaryCorpus();
    const bytesMismatch = [
      { ...catalog[0], expectedBytes: catalog[0].expectedBytes + 1 },
      ...catalog.slice(1),
    ];
    await expect(
      verifyLocalHumanCorpus({ fixvoxRoot, workspaceRoot, catalog: bytesMismatch }),
    ).rejects.toMatchObject({ code: "BYTES_MISMATCH" });
    const hashMismatch = [
      { ...catalog[0], expectedSha256: "a".repeat(64) },
      ...catalog.slice(1),
    ];
    await expect(
      verifyLocalHumanCorpus({ fixvoxRoot, workspaceRoot, catalog: hashMismatch }),
    ).rejects.toMatchObject({ code: "HASH_MISMATCH" });
  });

  it.each([
    "C:/private/audio.wav",
    "/private/audio.wav",
    "../private/audio.wav",
    "artifacts/transcription-quality/corpus/private.wav",
    "artifacts/transcription-quality/corpus/private/audio/../outside.wav",
    "docs\\reference\\ops\\audio\\human\\private.wav",
  ])("rejects absolute, traversal, or cross-root ref %s", (audioRef) => {
    expect(() =>
      createLocalHumanCorpusManifest({
        audioRefBySampleId: { [authorizedIds[0]]: audioRef },
      }),
    ).toThrowError(expect.objectContaining({ code: "PATH_ESCAPE" }));

    expect(() =>
      createLocalHumanCorpusManifest({
        audioRefBySampleId: {
          [approvedIds[0]]: `docs/reference/ops/audio/human/${approvedIds[0]}.wav`,
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "PATH_ESCAPE" }));
  });
  it("writes deterministic local manifest and safe projection artifacts", async () => {


    const { fixvoxRoot, workspaceRoot, catalog } = await createTemporaryCorpus();
    const root = workspaceRoot;
    const options = { workspaceRoot, fixvoxRoot, catalog };
    const first = await runLocalHumanCorpusMetadataOnly(options);
    const firstManifest = await readFile(
      join(root, first.artifacts.manifest),
      "utf8",
    );
    const firstProjection = await readFile(
      join(root, first.artifacts.projection),
      "utf8",
    );
    const second = await runLocalHumanCorpusMetadataOnly(options);
    const secondManifest = await readFile(
      join(root, second.artifacts.manifest),
      "utf8",
    );
    const secondProjection = await readFile(
      join(root, second.artifacts.projection),
      "utf8",
    );

    expect(secondManifest).toBe(firstManifest);
    expect(secondProjection).toBe(firstProjection);
    expect(first.sampleCount).toBe(8);
    expect(first.statusCounts).toEqual({
      present: 8,
      hashMatch: 8,
      bytesMatch: 8,
    });
    expect(firstProjection).not.toMatch(forbiddenPublicKeys);
    expect(firstProjection).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(first.projection.samples[0]).toEqual({
      id: catalog[0].id,
      audioSha256: catalog[0].expectedSha256,
      audioBytes: catalog[0].expectedBytes,
      format: "wav",
      categories: catalog[0].categories,
      difficulty: catalog[0].difficulty,
      language: catalog[0].language,
      goldStatus: catalog[0].goldStatus,
      sensitivity: "local-sensitive",
      validation: { exists: true, hash: "match", bytes: "match" },
    });
    expect(first.projection.samples.every((sample) =>
      !("audioArtifactPath" in sample) && !("goldRef" in sample),
    )).toBe(true);
    expect(first).not.toHaveProperty("run");
    expect(first).not.toHaveProperty("providerCalls");
  });
});
