import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Dock shell host visibility", () => {
  it("keeps tray show/hide native, diagnostic, and persistent across renderer state updates", () => {
    const dockSource = readFileSync("src-tauri/src/dock_shell.rs", "utf8");
    const traySource = readFileSync("src-tauri/src/tray.rs", "utf8");

    expect(traySource).toContain("HostMenuAction::ShowDock");
    expect(traySource).toContain("failed to show dock window");
    expect(traySource).toContain("HostMenuAction::HideDock");
    expect(traySource).toContain("failed to hide dock window");
    expect(traySource).toContain("host_command_payload(HostMenuAction::ShowDock), None");
    expect(traySource).toContain("host_command_payload(HostMenuAction::HideDock), None");

    expect(dockSource).toContain("static DOCK_VISIBLE: AtomicBool");
    expect(dockSource).toContain("DOCK_VISIBLE.store(false");
    expect(dockSource).toContain("DOCK_VISIBLE.store(true");
    expect(dockSource).toContain("if !DOCK_VISIBLE.load");
    expect(dockSource).toContain("ShowWindow(raw_hwnd, SW_HIDE)");
    expect(dockSource).toContain("last_dock_state()");
  });
});
