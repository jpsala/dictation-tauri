// @ts-expect-error Bun provides this module in `bun test`; root TS config does not ship Bun ambient types.
import { describe, expect, test } from "bun:test";
import {
  buildDefaultRuntimePolicy,
  buildFeatureFlagsFromRuntimePolicy,
  buildRegisterDefaultsFromRuntimePolicy,
  buildTransportPolicyFromRuntimePolicy,
  resolveVoiceRoutingForCohorts,
} from "./runtime-policy";

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

describe("core runtime policy", () => {
  test("owns the frozen default and register transformation", () => {
    const policy = buildDefaultRuntimePolicy();
    const contract = {
      runtimePolicy: policy,
      registerDefaults: buildRegisterDefaultsFromRuntimePolicy(policy, ["fast", "alpha-basic"]),
      features: buildFeatureFlagsFromRuntimePolicy(policy),
      transport: buildTransportPolicyFromRuntimePolicy(policy),
    };

    expect(contractHash(policy)).toBe("d723196afc493c931a7ebcb3dbecca5d41ff6fbf952d6c94ee84bdbb0f83ff5b");
    expect(contractHash({
      registerDefaults: contract.registerDefaults,
      features: contract.features,
      transport: contract.transport,
    })).toBe("27a24c21b4ad733c74361bf9cd0e5f79d9ed4ee0941e7be04f52b9154a41633f");
    expect(contract.registerDefaults).toMatchObject({
      runtimeMode: "managed",
      managed: true,
      transportMode: "proxy-only",
      voiceRouting: {
        label: "speed",
        matchedCohort: "fast",
        source: "backend-cohort",
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

  test("resolves valid and invalid cohort assignments without infrastructure", () => {
    const policy = buildDefaultRuntimePolicy() as Record<string, any>;
    const assignments = policy.voiceRouting.cohortAssignments as Record<string, unknown>;
    assignments.fast = "broken";
    assignments.cheap = "cost";

    expect(resolveVoiceRoutingForCohorts(policy as never, ["fast", "cheap"])).toMatchObject({
      label: "quality",
      matchedCohort: null,
      source: "backend-default",
    });
  });

  test("returns independent default policy clones", () => {
    const policy = buildDefaultRuntimePolicy() as Record<string, unknown>;
    policy.runtimeMode = "changed";
    expect(buildDefaultRuntimePolicy()).toMatchObject({ runtimeMode: "managed" });
  });
});
