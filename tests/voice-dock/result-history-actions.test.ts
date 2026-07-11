/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import source from "../../src/App.tsx?raw";

describe("result history actions", () => {
  it("activates history rows and paste-last through the real desktop paste path", () => {
    expect(source).toContain("command: \"select_history_entry\"");
    expect(source).toContain("targetSnapshot: savedDeliveryTargetRef.current");
    expect(source).toContain("targetAffinity: \"saved\"");
    expect(source).toMatch(/case "paste_last_safe":\s+void pasteLastToForegroundTarget\(\);/);
    expect(source).toContain("[pipelineUi.summary, recoveryKey, resultHistoryEntries, settingsPanelOpen]");
  });
});
