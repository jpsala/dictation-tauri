// @ts-expect-error Bun provides this module in `bun test`; root TS config does not ship Bun ambient types.
import { describe, expect, test } from "bun:test";
import { buildDefaultRecipePolicy } from "./recipe-policy";

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

describe("core recipe policy", () => {
  test("owns the frozen default recipe policy", () => {
    const policy = buildDefaultRecipePolicy() as Record<string, unknown>;

    expect(contractHash(policy)).toBe("5e7483dcbce6a77b693271b0ff8a76985ae494936ea2a83761510ebbc7135e2c");
    expect(policy).toMatchObject({
      version: "alpha-default-2026-03-27",
      defaultRecipeId: "polished-dictation",
    });
    expect(policy.recipes).toHaveLength(5);
    expect(policy.contextMappings).toHaveLength(4);
  });

  test("returns independent default recipe clones", () => {
    const policy = buildDefaultRecipePolicy() as Record<string, unknown>;
    policy.defaultRecipeId = "changed";
    expect(buildDefaultRecipePolicy()).toMatchObject({ defaultRecipeId: "polished-dictation" });
  });
});
