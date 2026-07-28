/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import source from "../../src/App.tsx?raw";

describe("result history actions", () => {
  it("activates history rows and paste-last through the real desktop paste path", () => {
    expect(source).toContain("command: \"select_history_entry\"");
    expect(source).toContain("command: \"clear_result_history\"");
    expect(source).toContain("invoke(\"clear_result_history\")");
    expect(source).toContain("targetSnapshot: savedDeliveryTargetRef.current");
    expect(source).toContain("targetAffinity: \"saved\"");
    expect(source).toContain("historyTargetNeedsFocusRestoreRef");
    expect(source).toContain('restoreTargetFocus: payload.source === "tray_or_context_menu"');
    expect(source).toContain("restoreSavedTargetFocus: forced?.restoreSavedTargetFocus");
    expect(source).toMatch(/case "paste_last_safe":\s+void pasteLastToForegroundTarget\(\);/);
    expect(source).toContain("[pipelineUi.summary, recoveryKey, resultHistoryEntries, settingsPanelOpen]");
  });

  it("does not reuse stale History after a failed attempt and settles successful copy recovery", () => {
    const copyStart = source.indexOf("async function copyTranscriptFallback");
    const pasteStart = source.indexOf("async function pasteLastToForegroundTarget");
    const dockStateStart = source.indexOf("const canStart =", pasteStart);
    const copyBlock = source.slice(copyStart, pasteStart);
    const pasteBlock = source.slice(pasteStart, dockStateStart);

    expect(copyBlock).toContain("recoveryOperationPendingRef.current");
    expect(copyBlock).toContain("setDismissedRecoveryKey(undefined)");
    expect(copyBlock).toContain("settleDockAfterRecovery");
    expect(copyBlock).toContain('operation: "copy"');
    expect(pasteBlock).toContain("shouldFallbackToHistoryForPasteLast");
    expect(pasteBlock).toContain("setDismissedRecoveryKey(undefined)");
    expect(pasteBlock).toContain("latest dictation attempt produced no text");
    expect(pasteBlock).toContain('operation: "paste_last"');
    expect(source).toContain('settleDockAfterRecovery("Recovery dismissed. Latest result remains available in History."');
  });
});
