import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createAppSessionControllerFacade,
} from "../../src/desktop-control/app-session";

describe("App global hotkey controller seam", () => {
  it("routes global hotkey toggle through the controller instead of deriving start/stop from UI state", async () => {
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

    await facade.toggle({ source: "global_hotkey" });
    await facade.toggle({ source: "global_hotkey" });

    expect(handleControl).toHaveBeenNthCalledWith(1, {
      id: "app-toggle",
      source: "global_hotkey",
      action: "toggle",
      receivedAt: "2026-06-23T14:40:00.000Z",
    });
    expect(handleControl).toHaveBeenNthCalledWith(2, {
      id: "app-toggle",
      source: "global_hotkey",
      action: "toggle",
      receivedAt: "2026-06-23T14:40:00.000Z",
    });
  });

  it("keeps the App hotkey listener on the controller toggle path", () => {
    const source = readFileSync("src/App.tsx", "utf8");
    const listenerStart = source.indexOf("void listenForTauriGlobalHotkey");
    const listenerBlock = source.slice(listenerStart, listenerStart + 600);

    expect(listenerBlock).toContain("desktopSession.toggle");
    expect(listenerBlock).toContain('source: "global_hotkey"');
    expect(listenerBlock).not.toContain("canStart");
    expect(listenerBlock).not.toContain("canStop");
  });
});
