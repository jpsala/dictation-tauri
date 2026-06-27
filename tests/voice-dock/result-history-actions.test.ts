import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("result history actions", () => {
  it("activates history rows and paste-last through the real desktop paste path", () => {
    const source = readFileSync("src/App.tsx", "utf8");

    expect(source).toContain("command: \"select_history_entry\"");
    expect(source).toContain("void pasteLastToForegroundTarget({ summary, text: entry.text })");
    expect(source).toMatch(/case "paste_last_safe":\s+void pasteLastToForegroundTarget\(\);/);
    expect(source).toContain("[pipelineUi.summary, recoveryKey, resultHistoryEntries]");
  });
});
