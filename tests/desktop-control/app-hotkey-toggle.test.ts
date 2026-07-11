import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createAppSessionControllerFacade,
} from "../../src/desktop-control/app-session";

describe("App global hotkey dictation-key seam", () => {
  it("routes global hotkey press/release decisions through explicit controller actions", async () => {
    const handleControl = vi
      .fn()
      .mockResolvedValueOnce({
        sessionId: "session-hotkey",
        controlSource: "global_hotkey",
        state: "listening",
      })
      .mockResolvedValueOnce({
        sessionId: "session-hotkey",
        controlSource: "global_hotkey",
        state: "reviewing",
      });
    const facade = createAppSessionControllerFacade(
      {
        getState: () => ({ state: "idle" }),
        handleControl,
      },
      {
        now: () => "2026-06-23T14:40:00.000Z",
        createEventId: (action) => `app-${action}`,
      },
    );

    await facade.handle("start", { source: "global_hotkey" });
    await facade.handle("stop", { source: "global_hotkey" });

    expect(handleControl).toHaveBeenNthCalledWith(1, {
      id: "app-start",
      source: "global_hotkey",
      action: "start",
      receivedAt: "2026-06-23T14:40:00.000Z",
    });
    expect(handleControl).toHaveBeenNthCalledWith(2, {
      id: "app-stop",
      source: "global_hotkey",
      action: "stop",
      receivedAt: "2026-06-23T14:40:00.000Z",
    });
  });

  it("keeps the App hotkey listener on the dictation-key resolver path", () => {
    const source = readFileSync("src/App.tsx", "utf8");
    const listenerStart = source.indexOf("const handleGlobalHotkey");
    const listenerEnd = source.indexOf("void listenForTauriGlobalHotkey", listenerStart);
    const listenerBlock = source.slice(listenerStart, listenerEnd + 700);

    expect(listenerBlock).toContain("resolveDictationKeyEvent");
    expect(listenerBlock).toContain("desktopSession.handle");
    expect(listenerBlock).toContain("drainTauriGlobalHotkeyEvents(handleGlobalHotkey)");
    expect(listenerBlock).toContain('source: "global_hotkey"');
    expect(listenerBlock).not.toContain("desktopSession.toggle");
    expect(listenerBlock).not.toContain("canStart");
    expect(listenerBlock).not.toContain("canStop");
  });

  it("prepares equivalent start context for button and hotkey starts", () => {
    const source = readFileSync("src/App.tsx", "utf8");
    const helperStart = source.indexOf("async function prepareDictationStartContext");
    const helperEnd = source.indexOf("async function rememberSelectionTransformContext", helperStart);
    const helperBlock = source.slice(helperStart, helperEnd);
    const startCaptureStart = source.indexOf("async function startCapture");
    const startCaptureEnd = source.indexOf("async function stopCapture", startCaptureStart);
    const startCaptureBlock = source.slice(startCaptureStart, startCaptureEnd);
    const listenerStart = source.indexOf("const handleGlobalHotkey");
    const listenerEnd = source.indexOf("void listenForTauriGlobalHotkey", listenerStart);
    const listenerBlock = source.slice(listenerStart, listenerEnd);

    expect(helperBlock).toContain("selectionContextRef.current = undefined");
    expect(helperBlock).toContain("savedDeliveryTargetRef.current = options.targetSnapshot?.inputLike");
    expect(startCaptureBlock).toContain("await prepareDictationStartContext();");
    expect(listenerBlock).toContain("await prepareDictationStartContext({ targetSnapshot: event.targetSnapshot });");
    expect(listenerBlock).not.toContain("savedDeliveryTargetRef.current = event.targetSnapshot");
  });
});
