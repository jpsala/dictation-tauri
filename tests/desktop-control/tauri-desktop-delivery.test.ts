import { describe, expect, it } from "vitest";
import {
  captureTauriDesktopDeliveryTarget,
  createTauriSavedTargetDeliveryGateway,
  type TauriInvoke,
} from "../../src/delivery/tauri-desktop-delivery";

const asTauriInvoke = (
  invoke: (command: string, args?: Record<string, unknown>) => unknown,
): TauriInvoke => invoke as unknown as TauriInvoke;

describe("Tauri desktop delivery target capture", () => {
  it("prefers the current foreground editable target over a stale cached target", async () => {
    const calls: string[] = [];
    const target = await captureTauriDesktopDeliveryTarget(asTauriInvoke((command) => {
      calls.push(command);
      if (command === "capture_desktop_delivery_target") {
        return {
          frameHwnd: "browser-hwnd",
          windowTitle: "Browser input",
          windowClass: "Chrome_WidgetWin_1",
          processId: 100,
          inputLike: true,
          reason: "foreground target captured before dictation",
        };
      }
      if (command === "get_cached_desktop_delivery_target") {
        return {
          frameHwnd: "stale-terminal-hwnd",
          windowTitle: "Terminal",
          windowClass: "Chrome_WidgetWin_1",
          processId: 200,
          inputLike: true,
          reason: "stale cached target",
        };
      }
      throw new Error(`unexpected command ${command}`);
    }));

    expect(target?.frameHwnd).toBe("browser-hwnd");
    expect(calls).toEqual(["capture_desktop_delivery_target", "get_cached_desktop_delivery_target"]);
  });

  it("returns Windows Terminal when it is the explicit current foreground target", async () => {
    const target = await captureTauriDesktopDeliveryTarget(asTauriInvoke((command) => {
      if (command === "capture_desktop_delivery_target") {
        return {
          frameHwnd: "terminal-hwnd",
          windowTitle: "PowerShell",
          windowClass: "CASCADIA_HOSTING_WINDOW_CLASS",
          processId: 200,
          processName: "WindowsTerminal.exe",
          inputLike: true,
          reason: "foreground target captured before dictation",
        };
      }
      if (command === "get_cached_desktop_delivery_target") {
        return {
          frameHwnd: "browser-hwnd",
          windowTitle: "Browser input",
          windowClass: "Chrome_WidgetWin_1",
          processId: 100,
          inputLike: true,
          reason: "previous editable target",
        };
      }
      throw new Error(`unexpected command ${command}`);
    }));

    expect(target?.frameHwnd).toBe("terminal-hwnd");
  });

  it("returns Tabby when it is the explicit current foreground target", async () => {
    const target = await captureTauriDesktopDeliveryTarget(asTauriInvoke((command) => {
      if (command === "capture_desktop_delivery_target") {
        return {
          frameHwnd: "tabby-hwnd",
          windowTitle: "npm view pi-link version",
          windowClass: "Chrome_WidgetWin_1",
          processId: 200,
          processName: "Tabby.exe",
          inputLike: true,
          reason: "foreground target captured before dictation",
        };
      }
      if (command === "get_cached_desktop_delivery_target") {
        return {
          frameHwnd: "browser-hwnd",
          windowTitle: "Browser input",
          windowClass: "Chrome_WidgetWin_1",
          processId: 100,
          processName: "vivaldi.exe",
          inputLike: true,
          reason: "previous editable target",
        };
      }
      throw new Error(`unexpected command ${command}`);
    }));

    expect(target?.frameHwnd).toBe("tabby-hwnd");
  });

  it("does not invoke native paste delivery for review-only requests", async () => {
    const calls: string[] = [];
    const gateway = createTauriSavedTargetDeliveryGateway({
      invoke: asTauriInvoke((command) => {
        calls.push(command);
        throw new Error("native paste should not be called");
      }),
      getTarget: () => ({
        frameHwnd: "browser-hwnd",
        windowTitle: "Browser input",
        windowClass: "Chrome_WidgetWin_1",
        processId: 100,
        inputLike: true,
        reason: "previous editable target",
      }),
    });

    const evidence = await gateway.deliver({
      sessionId: "session-1",
      text: "transformed selection",
      strategy: "review_only",
      allowDesktopSideEffects: false,
    });

    expect(evidence.status).toBe("available");
    expect(evidence.output).toBe("transformed selection");
    expect(calls).toEqual([]);
  });

  it("falls back to cached target when the current foreground is not editable", async () => {
    const calls: string[] = [];
    const target = await captureTauriDesktopDeliveryTarget(asTauriInvoke((command) => {
      calls.push(command);
      if (command === "capture_desktop_delivery_target") {
        return {
          frameHwnd: "dock-hwnd",
          windowTitle: "Dictation Dock",
          windowClass: "WebView",
          processId: 300,
          inputLike: false,
          reason: "foreground target is a Dictation Tauri surface; preserving previous editable target",
        };
      }
      if (command === "get_cached_desktop_delivery_target") {
        return {
          frameHwnd: "cached-browser-hwnd",
          windowTitle: "Browser input",
          windowClass: "Chrome_WidgetWin_1",
          processId: 100,
          inputLike: true,
          reason: "previous editable target",
        };
      }
      throw new Error(`unexpected command ${command}`);
    }));

    expect(target?.frameHwnd).toBe("cached-browser-hwnd");
    expect(calls).toEqual(["capture_desktop_delivery_target", "get_cached_desktop_delivery_target"]);
  });

  it("prefers a fresh foreground-watcher non-terminal cache over an incidental terminal foreground for normal paste delivery", async () => {
    const deliveredTargets: string[] = [];
    const gateway = createTauriSavedTargetDeliveryGateway({
      invoke: asTauriInvoke((command, args) => {
        if (command === "capture_desktop_delivery_target") {
          return {
            frameHwnd: "terminal-hwnd",
            windowTitle: "Constelaciones",
            windowClass: "CASCADIA_HOSTING_WINDOW_CLASS",
            processId: 200,
            processName: "WindowsTerminal.exe",
            inputLike: true,
            reason: "foreground target captured before dictation",
          };
        }
        if (command === "get_cached_desktop_delivery_target") {
          return {
            frameHwnd: "notepad-hwnd",
            windowTitle: "smoke-target.txt - Notepad",
            windowClass: "Notepad",
            processId: 300,
            processName: "Notepad.exe",
            inputLike: true,
            reason: "foreground target captured before dictation",
            cacheReason: "foreground_watcher",
          };
        }
        if (command === "deliver_text_to_desktop_target") {
          const target = args?.target as { frameHwnd: string };
          deliveredTargets.push(target.frameHwnd);
          return {
            status: "paste_sent",
            reason: "native paste sent",
            target: args?.target,
          };
        }
        throw new Error(`unexpected command ${command}`);
      }),
      getTarget: () => ({
        frameHwnd: "notepad-hwnd",
        windowTitle: "smoke-target.txt - Notepad",
        windowClass: "Notepad",
        processId: 300,
        processName: "Notepad.exe",
        inputLike: true,
        reason: "foreground target captured before dictation",
      }),
    });

    const evidence = await gateway.deliver({
      sessionId: "session-terminal-race",
      text: "dictated text",
      strategy: "paste_send",
      allowDesktopSideEffects: true,
    });

    expect(evidence.status).toBe("paste_sent");
    expect(deliveredTargets).toEqual(["notepad-hwnd"]);
  });

  it("keeps explicit terminal delivery even when a non-terminal foreground-watcher cache exists", async () => {
    const deliveredTargets: string[] = [];
    const gateway = createTauriSavedTargetDeliveryGateway({
      invoke: asTauriInvoke((command, args) => {
        if (command === "capture_desktop_delivery_target") {
          return {
            frameHwnd: "terminal-hwnd",
            windowTitle: "PowerShell",
            windowClass: "CASCADIA_HOSTING_WINDOW_CLASS",
            processId: 200,
            processName: "WindowsTerminal.exe",
            inputLike: true,
            reason: "foreground target captured before dictation",
          };
        }
        if (command === "get_cached_desktop_delivery_target") {
          return {
            frameHwnd: "browser-hwnd",
            windowTitle: "Old browser input",
            windowClass: "Chrome_WidgetWin_1",
            processId: 300,
            processName: "vivaldi.exe",
            inputLike: true,
            reason: "foreground target captured before dictation",
            cacheReason: "foreground_watcher",
          };
        }
        if (command === "deliver_text_to_desktop_target") {
          const target = args?.target as { frameHwnd: string };
          deliveredTargets.push(target.frameHwnd);
          return {
            status: "paste_sent",
            reason: "native paste sent",
            target: args?.target,
          };
        }
        throw new Error(`unexpected command ${command}`);
      }),
      getTarget: () => ({
        frameHwnd: "terminal-hwnd",
        windowTitle: "PowerShell",
        windowClass: "CASCADIA_HOSTING_WINDOW_CLASS",
        processId: 200,
        processName: "WindowsTerminal.exe",
        inputLike: true,
        reason: "foreground target captured before dictation",
      }),
    });

    const evidence = await gateway.deliver({
      sessionId: "session-explicit-terminal-fg-cache",
      text: "dictated text",
      strategy: "paste_send",
      allowDesktopSideEffects: true,
    });

    expect(evidence.status).toBe("paste_sent");
    expect(deliveredTargets).toEqual(["terminal-hwnd"]);
  });

  it("keeps explicit terminal delivery when the non-terminal cache is not from the foreground watcher", async () => {
    const deliveredTargets: string[] = [];
    const gateway = createTauriSavedTargetDeliveryGateway({
      invoke: asTauriInvoke((command, args) => {
        if (command === "capture_desktop_delivery_target") {
          return {
            frameHwnd: "terminal-hwnd",
            windowTitle: "PowerShell",
            windowClass: "CASCADIA_HOSTING_WINDOW_CLASS",
            processId: 200,
            processName: "WindowsTerminal.exe",
            inputLike: true,
            reason: "foreground target captured before dictation",
          };
        }
        if (command === "get_cached_desktop_delivery_target") {
          return {
            frameHwnd: "browser-hwnd",
            windowTitle: "Old browser input",
            windowClass: "Chrome_WidgetWin_1",
            processId: 300,
            processName: "vivaldi.exe",
            inputLike: true,
            reason: "foreground target captured before dictation",
            cacheReason: "capture_desktop_delivery_target",
          };
        }
        if (command === "deliver_text_to_desktop_target") {
          const target = args?.target as { frameHwnd: string };
          deliveredTargets.push(target.frameHwnd);
          return {
            status: "paste_sent",
            reason: "native paste sent",
            target: args?.target,
          };
        }
        throw new Error(`unexpected command ${command}`);
      }),
      getTarget: () => ({
        frameHwnd: "terminal-hwnd",
        windowTitle: "PowerShell",
        windowClass: "CASCADIA_HOSTING_WINDOW_CLASS",
        processId: 200,
        processName: "WindowsTerminal.exe",
        inputLike: true,
        reason: "foreground target captured before dictation",
      }),
    });

    const evidence = await gateway.deliver({
      sessionId: "session-explicit-terminal",
      text: "dictated text",
      strategy: "paste_send",
      allowDesktopSideEffects: true,
    });

    expect(evidence.status).toBe("paste_sent");
    expect(deliveredTargets).toEqual(["terminal-hwnd"]);
  });

  it("uses the target captured when dictation stops by default", async () => {
    const deliveredTargets: string[] = [];
    const gateway = createTauriSavedTargetDeliveryGateway({
      invoke: asTauriInvoke((command, args) => {
        if (command === "deliver_text_to_desktop_target") {
          const target = args?.target as { frameHwnd: string };
          deliveredTargets.push(target.frameHwnd);
          return {
            status: "paste_sent",
            reason: "native paste sent",
            target: args?.target,
          };
        }
        throw new Error(`stop-target delivery should not recapture via ${command}`);
      }),
      getTarget: () => ({
        frameHwnd: "initial-editor-hwnd",
        windowTitle: "Initial editor",
        windowClass: "Chrome_WidgetWin_1",
        processId: 100,
        processName: "chrome.exe",
        inputLike: true,
        reason: "target saved before dictation",
      }),
      getStopTarget: () => ({
        frameHwnd: "stop-editor-hwnd",
        windowTitle: "Editor focused when dictation stopped",
        windowClass: "Chrome_WidgetWin_1",
        processId: 200,
        processName: "chrome.exe",
        inputLike: true,
        reason: "target captured when dictation stopped",
      }),
      getFollowFocusUntilDelivery: () => false,
    });

    const evidence = await gateway.deliver({
      sessionId: "session-stop-target",
      text: "dictated text",
      strategy: "paste_send",
      allowDesktopSideEffects: true,
    });

    expect(evidence.status).toBe("paste_sent");
    expect(deliveredTargets).toEqual(["stop-editor-hwnd"]);
  });

  it("re-resolves the current editable target when follow-focus is enabled", async () => {
    const deliveredTargets: string[] = [];
    const gateway = createTauriSavedTargetDeliveryGateway({
      invoke: asTauriInvoke((command, args) => {
        if (command === "capture_desktop_delivery_target") {
          return {
            frameHwnd: "final-editor-hwnd",
            windowTitle: "Focused editor",
            windowClass: "Chrome_WidgetWin_1",
            processId: 200,
            processName: "chrome.exe",
            inputLike: true,
            reason: "foreground target captured after transcription",
          };
        }
        if (command === "get_cached_desktop_delivery_target") {
          return undefined;
        }
        if (command === "deliver_text_to_desktop_target") {
          const target = args?.target as { frameHwnd: string };
          deliveredTargets.push(target.frameHwnd);
          return {
            status: "paste_sent",
            reason: "native paste sent",
            target: args?.target,
          };
        }
        throw new Error(`unexpected command ${command}`);
      }),
      getTarget: () => ({
        frameHwnd: "initial-editor-hwnd",
        windowTitle: "Initial editor",
        windowClass: "Chrome_WidgetWin_1",
        processId: 100,
        processName: "chrome.exe",
        inputLike: true,
        reason: "target saved before dictation",
      }),
      getFollowFocusUntilDelivery: () => true,
    });

    const evidence = await gateway.deliver({
      sessionId: "session-1",
      text: "dictated text",
      strategy: "paste_send",
      allowDesktopSideEffects: true,
    });

    expect(evidence.status).toBe("paste_sent");
    expect(deliveredTargets).toEqual(["final-editor-hwnd"]);
  });

  it("keeps the saved target for selection replace even if focus moves", async () => {
    const deliveredTargets: string[] = [];
    const gateway = createTauriSavedTargetDeliveryGateway({
      invoke: asTauriInvoke((command, args) => {
        if (command === "deliver_text_to_desktop_target") {
          const target = args?.target as { frameHwnd: string };
          deliveredTargets.push(target.frameHwnd);
          return {
            status: "paste_sent",
            reason: "native paste sent",
            target: args?.target,
          };
        }
        throw new Error(`saved affinity should not recapture target via ${command}`);
      }),
      getTarget: () => ({
        frameHwnd: "selection-origin-hwnd",
        windowTitle: "Selected text editor",
        windowClass: "Chrome_WidgetWin_1",
        processId: 100,
        processName: "chrome.exe",
        inputLike: true,
        reason: "target saved before selection transform",
      }),
    });

    const evidence = await gateway.deliver({
      sessionId: "session-1",
      text: "transformed selected text",
      strategy: "paste_send",
      allowDesktopSideEffects: true,
      targetAffinity: "saved",
    });

    expect(evidence.status).toBe("paste_sent");
    expect(deliveredTargets).toEqual(["selection-origin-hwnd"]);
  });
});
