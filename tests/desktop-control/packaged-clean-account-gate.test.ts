// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("packaged clean account-first smoke contract", () => {
  it("expects the dock to stay hidden and Cuenta to open before any provider work", () => {
    const source = readFileSync("scripts/packaged-clean-smoke.ps1", "utf8");

    expect(source).toContain("clean account-first launch hides the dock");
    expect(source).toContain("clean account-first launch opens Settings");
    expect(source).toContain("clean account-first launch performs no provider, login, or clipboard work");
    expect(source).not.toContain("dock shell configures in packaged clean launch");
    expect(source).not.toContain("smoke uses Ctrl+Shift+F9 instead of Alt+Space");
  });
});
