/// <reference path="../../../fixvox-api/src/bun-test.d.ts" />

import { describe, expect, test } from "bun:test";
import { BUILTIN_CATALOG_VERSION, BUILTIN_ENGINES, BUILTIN_PROMPTS, BUILTIN_VARIANTS, builtinEngineCatalog, builtinPromptCatalog, builtinVariantCatalog, createBuiltinCatalogManifest, validateBuiltinCatalog, validateBuiltinEngines, validateBuiltinPrompts, validateBuiltinVariants, type BuiltinCatalog, type BuiltinCatalogItem } from "./catalog.ts";

const catalog: BuiltinCatalog = {
  version: BUILTIN_CATALOG_VERSION,
  items: [
    { kind: "prompt", id: "prompt.alpha", promptBody: "prompt-body-must-not-leak" },
    { kind: "engine", id: "engine.alpha" },
    { kind: "profile", id: "profile.alpha" },
  ],
};

describe("built-in catalog infrastructure", () => {
  test("has a non-empty version and validates stable IDs", () => {
    expect(BUILTIN_CATALOG_VERSION).not.toBe("");
    expect(() => validateBuiltinCatalog(catalog)).not.toThrow();
  });

  test("keeps the ten canonical Worker engine identities", () => {
    expect(BUILTIN_ENGINES).toHaveLength(10);
    expect(BUILTIN_ENGINES.map((engine) => engine.id)).toEqual(["stt-off", "stt-groq-whisper-turbo", "postprocess-off", "postprocess-groq-gpt-oss-120b", "transform-off", "transform-groq-llama-70b", "translate-groq-llama-70b", "assistant-groq-8b-instant", "postprocess-openrouter-premium", "transform-openrouter-premium"]);
    expect(() => validateBuiltinEngines()).not.toThrow();
    const first = BUILTIN_ENGINES.at(0);
    if (!first) throw new Error("missing_builtin_engine");
    expect(() => validateBuiltinEngines([...BUILTIN_ENGINES, first])).toThrow("builtin_engine_duplicate_id:stt-off");
  });

  test("keeps the ten productive Worker prompt identities and bodies internal", () => {
    expect(BUILTIN_PROMPTS).toHaveLength(10);
    expect(BUILTIN_PROMPTS.map((prompt) => prompt.id)).toEqual(["none", "transcriptBase", "postProcessBase", "selectionTransformBase", "translateBase", "preset.como-yo-es", "preset.corregir-texto", "preset.fix-writing", "preset.like-me-en", "assistant.quickChat"]);
    expect(BUILTIN_PROMPTS.every((prompt) => prompt.enabled && prompt.body !== undefined)).toBe(true);
    expect(() => validateBuiltinPrompts()).not.toThrow();
  });

  test("keeps nine productive Worker variants without duplicating engine routing", () => {
    expect(BUILTIN_VARIANTS).toHaveLength(9);
    expect(BUILTIN_VARIANTS.map((variant) => variant.id)).toEqual(["owner", "friend", "tester", "trial", "debug-tools", "best-voice", "cheap-model", "new-ui", "private-alpha"]);
    expect(BUILTIN_VARIANTS.every((variant) => variant.engineIds.length === 0)).toBe(true);
    expect(() => validateBuiltinVariants()).not.toThrow();
    const first = BUILTIN_VARIANTS.at(0);
    if (!first) throw new Error("missing_builtin_variant");
    expect(() => validateBuiltinVariants([{ ...first, engineIds: ["missing-engine"] }])).toThrow("builtin_variant_unknown_engine:owner");
  });

  test("rejects duplicate kind/ID pairs", () => {
    expect(() => validateBuiltinCatalog({ ...catalog, items: [...catalog.items, { kind: "engine", id: "engine.alpha" }] })).toThrow("builtin_catalog_duplicate_id:engine:engine.alpha");
  });

  test("creates a stable sorted safe manifest", async () => {
    const reversed: BuiltinCatalog = { ...catalog, items: catalog.items.reduce<BuiltinCatalogItem[]>((items, item) => [item, ...items], []) };
    const [first, second] = await Promise.all([createBuiltinCatalogManifest(catalog), createBuiltinCatalogManifest(reversed)]);
    expect(first).toEqual(second);
    expect(first.ids.engine).toEqual(["engine.alpha"]);
    expect(first.counts).toEqual({ profile: 1, variant: 0, engine: 1, prompt: 1, default: 0 });
  });

  test("includes engine IDs but no sensitive engine fields in its manifest", async () => {
    const manifest = JSON.stringify(await createBuiltinCatalogManifest(builtinEngineCatalog()));
    expect(manifest).toContain("stt-groq-whisper-turbo");
    expect(manifest).not.toMatch(/secret|token|apikey|oauth/i);
  });

  test("includes variant IDs without sensitive metadata", async () => {
    const manifest = JSON.stringify(await createBuiltinCatalogManifest(builtinVariantCatalog()));
    expect(manifest).toContain("best-voice");
    expect(manifest).not.toMatch(/secret|token|apikey|oauth/i);
  });

  test("never includes prompt bodies or sensitive field names", async () => {
    const manifest = JSON.stringify(await createBuiltinCatalogManifest(builtinPromptCatalog()));
    expect(manifest).not.toContain(BUILTIN_PROMPTS[1]?.body ?? "");
    expect(manifest).not.toContain("prompt-body-must-not-leak");
    expect(manifest).not.toMatch(/secret|token|apikey|oauth/i);
  });
});
