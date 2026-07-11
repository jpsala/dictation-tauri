// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
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
    expect(dockSource).toContain("read_user_preferences_for_app");
    expect(dockSource).toContain("show_dock_on_startup");
    expect(dockSource).toContain("configured hidden by user preference");
    expect(dockSource).toContain("DOCK_VISIBLE.store(false");
    expect(dockSource).toContain("DOCK_VISIBLE.store(true");
    expect(dockSource).toContain("if !DOCK_VISIBLE.load");
    expect(dockSource).toContain("ShowWindow(raw_hwnd, SW_HIDE)");
    expect(dockSource).toContain("last_dock_state()");
    expect(dockSource).toContain("DOCK_BOTTOM_MARGIN");
    expect(dockSource).toContain("monitor.size()");
    expect(dockSource).not.toContain("DOCK_TASKBAR_CLEARANCE");
  });
});
