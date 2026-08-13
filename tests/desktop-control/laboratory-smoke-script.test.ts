// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("real Tauri Dictation Laboratory smoke", () => {
  it("uses native resize and keeps the replay provider-free, redacted, and hotkey-safe", () => {
    const smoke = readFileSync("scripts/tauri-laboratory-smoke.ps1", "utf8");

    expect(smoke).toContain("SetWindowPos");
    expect(smoke).toContain("FindVisibleWindow('Dictation Laboratory')");
    expect(smoke).toContain("IsHungAppWindow");
    expect(smoke).toContain("windowsResponding = $windowsResponding");
    expect(smoke).toContain("@(720, 620)");
    expect(smoke).toMatch(/document\.documentElement\.style\.zoom\s*=\s*'2'/);
    expect(smoke).toContain("Settings opens Dictation Laboratory");
    expect(smoke).toContain("Laboratory responds at 200 percent zoom");
    expect(smoke).toContain("providerFree = $true");
    expect(smoke).toContain("Real Tauri provider-free replay completes with zero provider calls");
    expect(smoke).toContain("providerCalls.maxRequests -eq 0");
    expect(smoke).toContain("noProviderActions");
    expect(smoke).not.toMatch(/SendKeys|keybd_event|Win\+|Super|Snap/);
  });
});
