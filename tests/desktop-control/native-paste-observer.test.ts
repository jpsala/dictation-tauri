import { describe, expect, it } from "vitest";
import {
  createTauriNativePasteObserver,
  isTauriNativePasteObserverEnabled,
  type TauriDesktopDeliveryTarget,
} from "../../src/delivery";

describe("Tauri native paste observer gate", () => {
  it("is disabled unless the explicit Vite gate is enabled", () => {
    expect(isTauriNativePasteObserverEnabled({})).toBe(false);
    expect(isTauriNativePasteObserverEnabled({ VITE_ENABLE_NATIVE_PASTE_OBSERVER: "0" })).toBe(false);
    expect(isTauriNativePasteObserverEnabled({ VITE_ENABLE_NATIVE_PASTE_OBSERVER: "1" })).toBe(true);
    expect(isTauriNativePasteObserverEnabled({ VITE_ENABLE_NATIVE_PASTE_OBSERVER: "true" })).toBe(true);
    expect(isTauriNativePasteObserverEnabled({ VITE_ENABLE_NATIVE_PASTE_OBSERVER: true })).toBe(true);
  });

  it("maps observer requests to the native observe_desktop_paste command", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const target = createNativeTarget();
    const observer = createTauriNativePasteObserver({
      invoke: async (command, args) => {
        calls.push({ command, args });
        return {
          status: "observed",
          confidence: "high",
          reason: "Native Windows observer confirmed the saved target contains the inserted text.",
          targetAfter: {
            confidence: "high",
            appLabel: "Notepad",
            windowLabel: "Scratchpad - Notepad",
          },
        };
      },
      options: { timeoutMs: 1234 },
    });

    await expect(
      observer.observe({
        sessionId: "session-native-observer",
        text: "desktop control transcript",
        target,
      }),
    ).resolves.toMatchObject({
      status: "observed",
      confidence: "high",
      targetAfter: { confidence: "high" },
    });

    expect(calls).toEqual([
      {
        command: "observe_desktop_paste",
        args: {
          text: "desktop control transcript",
          target,
          timeoutMs: 1234,
        },
      },
    ]);
  });
});

function createNativeTarget(): TauriDesktopDeliveryTarget {
  return {
    frameHwnd: "123",
    windowTitle: "Scratchpad - Notepad",
    windowClass: "Notepad",
    processId: 1,
    inputLike: true,
    reason: "foreground target captured before dictation",
  };
}
