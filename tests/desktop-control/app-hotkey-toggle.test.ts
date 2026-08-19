// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
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

  it("drains native host commands after the listener registration gap", () => {
    const source = readFileSync("src/desktop-control/tauri-host-control.ts", "utf8");

    expect(source).toContain('"drain_desktop_control_host_commands"');
    expect(source).toContain('"set_desktop_control_host_command_listener_ready"');
    expect(source).toContain("await handler({ ...payload, command });");
  });

  it("does not let saved-selection capture reactivate the starting window in no-focus mode", () => {
    const source = readFileSync("src/App.tsx", "utf8");
    const helperStart = source.indexOf("async function rememberSelectionTransformContext");
    const helperEnd = source.indexOf("async function runSelectionTransformIfNeeded", helperStart);
    const helperBlock = source.slice(helperStart, helperEnd);

    expect(helperBlock).toContain("preferences.pasteWithoutFocusChange");
    expect(helperBlock).toContain("allowCachedFallback: false");
    expect(helperBlock).toContain("foregroundTarget.frameHwnd !== target.frameHwnd");
    expect(helperBlock.indexOf("foregroundTarget.frameHwnd !== target.frameHwnd")).toBeLessThan(
      helperBlock.indexOf("hostSelectionCaptureForTargetCommand"),
    );
  });

  it("synchronizes button-started sessions with the dictation key", () => {
    const source = readFileSync("src/App.tsx", "utf8");
    const startCaptureStart = source.indexOf("async function startCapture");
    const startCaptureEnd = source.indexOf("async function stopCapture", startCaptureStart);
    const startCaptureBlock = source.slice(startCaptureStart, startCaptureEnd);

    expect(startCaptureBlock).toContain("markDictationKeyLatched");
    expect(startCaptureBlock.indexOf('session.state === "listening"')).toBeLessThan(
      startCaptureBlock.indexOf("markDictationKeyLatched"),
    );
  });

  it("shows arming before button and hotkey start prerequisites", () => {
    const source = readFileSync("src/App.tsx", "utf8");
    const startCaptureStart = source.indexOf("async function startCapture");
    const startCaptureEnd = source.indexOf("async function stopCapture", startCaptureStart);
    const startCaptureBlock = source.slice(startCaptureStart, startCaptureEnd);
    const listenerStart = source.indexOf("const handleGlobalHotkey");
    const listenerEnd = source.indexOf("void listenForTauriGlobalHotkey", listenerStart);
    const listenerBlock = source.slice(listenerStart, listenerEnd);

    expect(startCaptureBlock.indexOf('state: "requesting_permission"')).toBeLessThan(
      startCaptureBlock.indexOf("ensureTauriDictationReadiness(invoke)"),
    );
    expect(listenerBlock.indexOf('state: "requesting_permission"')).toBeLessThan(
      listenerBlock.indexOf("await prepareDictationStartContext"),
    );
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
  it("queues stop-submit release while asynchronous start is in flight", () => {
    const source = readFileSync("src/App.tsx", "utf8");
    const pressedStart = source.indexOf("function requestStopSubmitPressed");
    const releaseStart = source.indexOf("function requestStopSubmit()", pressedStart);
    const handlerBlock = source.slice(pressedStart, source.indexOf("function handleVoiceDockCommand", releaseStart));

    expect(handlerBlock).toContain("resolveDictationKeyEvent");
    expect(handlerBlock).toContain("deferStopSubmitUntilStarted");
    expect(source).toContain("pendingStopSubmitRef.current = true");
  });
  it("uses Alt+Space hold/tap semantics for Win+Space", () => {
    const source = readFileSync("src/App.tsx", "utf8");
    const handlerStart = source.indexOf("function requestStopSubmitPressed");
    const handlerEnd = source.indexOf("function handleVoiceDockCommand", handlerStart);
    const handlerBlock = source.slice(handlerStart, handlerEnd);
    const hostCommandStart = source.indexOf("case \"stop_submit_pressed\":");
    const hostCommandEnd = source.indexOf("default:", hostCommandStart);
    const hostCommandBlock = source.slice(hostCommandStart, hostCommandEnd);

    expect(handlerBlock).toContain("createWinSpaceDictationKeyEvent");
    expect(source).toContain("markDictationKeyStarted");
    expect(handlerBlock).toContain("markDictationKeyLatched");
    expect(hostCommandBlock).toContain("requestStopSubmitPressed()");
    expect(hostCommandBlock).toContain("requestStopSubmit(payload.source === \"global_hotkey\")");
  });
  it("allows Win+Space to start from a reviewed run", () => {
    const source = readFileSync("src/App.tsx", "utf8");
    const helperStart = source.indexOf("function isDesktopSessionBusyForWinSpace");
    const helperEnd = source.indexOf("function isCaptureStartable", helperStart);
    const helperBlock = source.slice(helperStart, helperEnd);

    expect(helperBlock).not.toContain('state.state === "reviewing"');
  });

});
