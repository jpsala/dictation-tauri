import { describe, expect, test } from "bun:test";

import {
  buildDeviceRegisterProjection,
  buildExecutionPreflightProjection,
  type EffectiveProfileProjectionInput,
} from "../src/projections.ts";

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

function fixtureProfile(): EffectiveProfileProjectionInput {
  return {
    profileId: "alpha-basic",
    label: "Alpha Basic",
    version: 7,
    source: "published",
    definition: {
      capabilities: ["dictation", "postprocess", "selection_transform", "assistant"],
      quota: { limit: 20 },
      runtimePolicy: {
        assistant: { chat: { promptBase: "Fixture chat contract." } },
        features: { "assistant.mode": true },
        transport: { mode: "proxy-only" },
      },
      engines: {
        transcription: {
          id: "stt-fixture",
          label: "Speech",
          provider: "groq",
          model: "whisper-large-v3-turbo",
          tier: "managed",
        },
        postprocess: {
          id: "post-fixture",
          label: "Post-process",
          provider: "groq",
          model: "openai/gpt-oss-120b",
          tier: "managed",
        },
        selectionTransform: {
          id: "selection-fixture",
          label: "Selection",
          provider: "groq",
          model: "llama-3.3-70b-versatile",
          tier: "managed",
          promptKey: "selection.contract",
        },
      },
      userControls: { "hotkeys.voiceRecord": "editable" },
    },
  };
}

describe("F3R1 API projection contract freeze", () => {
  test("freezes the device register payload including defaults.recipePolicy", () => {
    const projection = buildDeviceRegisterProjection({
      deviceId: "device-contract",
      profile: fixtureProfile(),
      accountId: "account-contract",
    });
    const defaults = projection.defaults as Record<string, unknown>;
    const recipePolicy = defaults.recipePolicy as Record<string, unknown>;

    expect(contractHash(projection)).toBe("3806d96ba24fbed72b5ac59c7cde1fd09fc96fa0a4d8a4b19403a5eeea90a999");
    expect(Object.hasOwn(defaults, "recipePolicy")).toBe(true);
    expect({
      version: recipePolicy.version,
      defaultRecipeId: recipePolicy.defaultRecipeId,
    }).toEqual({
      version: "alpha-default-2026-03-27",
      defaultRecipeId: "polished-dictation",
    });
    expect({
      ok: projection.ok,
      deviceId: projection.deviceId,
      activated: projection.activated,
      policyId: projection.policyId,
      policyLabel: projection.policyLabel,
      accountId: projection.accountId,
      auth: projection.auth,
      cohorts: projection.cohorts,
      transportPolicy: projection.transportPolicy,
    }).toEqual({
      ok: true,
      deviceId: "device-contract",
      activated: true,
      policyId: "alpha-basic",
      policyLabel: "Alpha Basic",
      accountId: null,
      auth: {
        required: false,
        providers: ["google"],
        accessMode: "signed_in",
        provider: "google",
        userId: "user redacted",
        userRedacted: "user redacted",
        groupLabel: "Alpha Basic",
        policyTemplateId: "alpha-basic",
        policyTemplateLabel: "Alpha Basic",
        capabilities: ["dictation", "postprocess", "selection_transform", "assistant"],
        redacted: true,
      },
      cohorts: ["alpha-basic"],
      transportPolicy: {
        llm: { groq: "proxied" },
        speech: { groq: "proxied" },
      },
    });
  });

  test("freezes the execution preflight payload and selected engine", () => {
    const projection = buildExecutionPreflightProjection({
      allowed: false,
      reason: "quota_exhausted",
      profile: fixtureProfile(),
      usageKind: "aiAction",
    });

    expect(contractHash(projection)).toBe("768605e94bdadfbe9641a481254ed7a0bd272876067d5b8bf71e4931e078971a");
    expect({
      ok: projection.ok,
      allowed: projection.allowed,
      reason: projection.reason,
      retryAfterSeconds: projection.retryAfterSeconds,
      profile: projection.profile,
      selectedKind: projection.engines.selectedKind,
      selected: projection.engines.selected,
    }).toEqual({
      ok: true,
      allowed: false,
      reason: "quota_exhausted",
      retryAfterSeconds: 1,
      profile: {
        policyId: "alpha-basic",
        policyLabel: "Alpha Basic",
        policySource: "published",
        accountHandle: null,
        accountBudget: null,
        groups: [],
        matchedGroup: null,
      },
      selectedKind: "selectionTransform",
      selected: {
        id: "selection-fixture",
        kind: "selectionTransform",
        label: "Selection",
        provider: "groq",
        model: "llama-3.3-70b-versatile",
        tier: "managed",
        promptKey: "selection.contract",
        promptSummary: "",
        notes: "",
        source: "profile",
      },
    });
  });
});
