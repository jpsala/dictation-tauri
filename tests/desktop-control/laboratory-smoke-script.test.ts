// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("real Tauri Dictation Laboratory smoke", () => {
  it("uses native resize, live CDP surface discovery, and hermetic replay controls", () => {
    const smoke = readFileSync("scripts/tauri-laboratory-smoke.ps1", "utf8");
    const cdp = readFileSync("scripts/cdp-evaluate.mjs", "utf8");

    expect(smoke).toContain("SetWindowPos");
    expect(smoke).toContain("FindVisibleWindow('Dictation Laboratory')");
    expect(smoke).toContain("IsHungAppWindow");
    expect(smoke).toContain("windowsResponding = $windowsResponding");
    expect(smoke).toContain("@(720, 620)");
    expect(smoke).toMatch(/document\.documentElement\.style\.zoom\s*=\s*'2'/);
    expect(smoke).toContain("Settings command opens Dictation Laboratory");
    expect(smoke).toContain("Laboratory responds at 200 percent zoom");
    expect(smoke).toContain("[switch]$Offline");
    expect(smoke).toContain("[switch]$AutoShow");
    expect(smoke).toContain("[switch]$Replay");
    expect(smoke).toContain("DICTATION_LAB_SMOKE_OFFLINE");
    expect(smoke).toContain("FIXVOX_BACKEND_URL = $offlineAuthorityEndpoint");
    expect(smoke).toContain("Offline smoke records no cloud, bootstrap, device, provider, or mutation activity");
    expect(smoke).not.toContain("DICTATION_LAB_SMOKE_CDP_WS");
    expect(smoke).not.toMatch(/SendKeys|keybd_event|Win\+|Super|Snap/);

    expect(cdp).toContain("data-app-surface");
    expect(cdp).toContain("Page.getFrameTree");
    expect(cdp).toContain("discoverTargets");
    expect(cdp).not.toContain("targets[0]");
    expect(cdp).not.toContain("webSocketDebuggerUrl =");
  });
});
