// @ts-expect-error Bun provides this module at test runtime; this package intentionally has no Bun type dependency.
import { describe, expect, test } from "bun:test";

// @ts-expect-error Bun resolves explicit TypeScript extensions at test runtime.
import { buildDefaultRecipePolicy } from "./recipe-policy-store.ts";
// @ts-expect-error Bun resolves explicit TypeScript extensions at test runtime.
import { buildDefaultRuntimePolicy, buildFeatureFlagsFromRuntimePolicy, buildRegisterDefaultsFromRuntimePolicy, buildTransportPolicyFromRuntimePolicy } from "./runtime-policy-store.ts";

declare const Bun: {
  CryptoHasher: new (algorithm: "sha256") => {
    update(value: string): { digest(encoding: "hex"): string };
  };
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function contractHash(value: unknown): string {
  const json = JSON.stringify(canonicalize(value));
  if (json === undefined) throw new Error("contract value is not JSON serializable");
  return new Bun.CryptoHasher("sha256").update(json).digest("hex");
}

describe("F3R1 policy contract freeze", () => {
  test("freezes the complete default runtime and recipe policies", () => {
    const runtimePolicy = buildDefaultRuntimePolicy() as Record<string, unknown>;
    const recipePolicy = buildDefaultRecipePolicy() as Record<string, unknown>;

    expect(contractHash(runtimePolicy)).toBe("d723196afc493c931a7ebcb3dbecca5d41ff6fbf952d6c94ee84bdbb0f83ff5b");
    expect(contractHash(recipePolicy)).toBe("5e7483dcbce6a77b693271b0ff8a76985ae494936ea2a83761510ebbc7135e2c");
    expect(runtimePolicy.runtimeMode).toBe("managed");
    expect(runtimePolicy.transport).toEqual({ mode: "proxy-only" });
    expect(recipePolicy).toMatchObject({
      version: "alpha-default-2026-03-27",
      defaultRecipeId: "polished-dictation",
    });
    expect(recipePolicy.recipes).toHaveLength(5);
    expect(recipePolicy.contextMappings).toHaveLength(4);
  });

  test("freezes runtime transformations used by register projections", () => {
    const runtimePolicy = buildDefaultRuntimePolicy();
    const contract = {
      registerDefaults: buildRegisterDefaultsFromRuntimePolicy(runtimePolicy, ["fast", "alpha-basic"]),
      features: buildFeatureFlagsFromRuntimePolicy(runtimePolicy),
      transport: buildTransportPolicyFromRuntimePolicy(runtimePolicy),
    };

    expect(contractHash(contract)).toBe("27a24c21b4ad733c74361bf9cd0e5f79d9ed4ee0941e7be04f52b9154a41633f");
    expect(contract.registerDefaults).toMatchObject({
      runtimeMode: "managed",
      managed: true,
      transportMode: "proxy-only",
      voiceRouting: {
        label: "speed",
        matchedCohort: "fast",
        source: "backend-cohort",
        speech: { provider: "groq", model: "whisper-large-v3-turbo", policy: "locked" },
      },
    });
    expect(contract.features).toMatchObject({
      "presets.edit": true,
      "presets.run": true,
      "results.history": true,
      voiceRouting: true,
    });
    expect(contract.transport).toEqual({
      llm: { groq: "proxied" },
      speech: { groq: "proxied" },
    });
  });

  test("default builders return independent clones", () => {
    const changedRuntime = buildDefaultRuntimePolicy() as Record<string, unknown>;
    const changedRecipe = buildDefaultRecipePolicy() as Record<string, unknown>;
    changedRuntime.runtimeMode = "changed";
    changedRecipe.defaultRecipeId = "changed";

    expect(buildDefaultRuntimePolicy()).toMatchObject({ runtimeMode: "managed" });
    expect(buildDefaultRecipePolicy()).toMatchObject({ defaultRecipeId: "polished-dictation" });
  });
});
