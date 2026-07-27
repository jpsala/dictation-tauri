// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Dock shell host visibility", () => {
  it("keeps the tray dock toggle native, diagnostic, and persistent across renderer state updates", () => {
    const dockSource = readFileSync("src-tauri/src/dock_shell.rs", "utf8");
    const traySource = readFileSync("src-tauri/src/tray.rs", "utf8");

    expect(traySource).toContain("HostMenuAction::ToggleDock");
    expect(traySource).toContain("failed to toggle dock window");
    expect(traySource).toContain("CheckMenuItemBuilder::with_id(MENU_TOGGLE_DOCK");
    expect(traySource).toContain("dock_shell::is_dock_visible()");
    expect(traySource).toContain("host_command_payload(HostMenuAction::ToggleDock), None");

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
    expect(dockSource).toContain("monitor.work_area()");
    expect(dockSource).not.toContain("DOCK_TASKBAR_CLEARANCE");
  });

  it("follows the cursor monitor while idle and preserves a position per monitor", () => {
    const dockSource = readFileSync("src-tauri/src/dock_shell.rs", "utf8");

    expect(dockSource).toContain("DOCK_MONITOR_POLL_INTERVAL");
    expect(dockSource).toContain("Duration::from_millis(180)");
    expect(dockSource).toContain("app.monitor_from_point");
    expect(dockSource).toContain("platform::cursor_position()");
    expect(dockSource).toContain("platform::primary_mouse_button_down()");
    expect(dockSource).toContain("state == DockShellState::Idle");
    expect(dockSource).toContain("dock_monitor_probe_point(position, layout)");
    expect(dockSource).toContain('DOCK_POSITION_FILE: &str = "dock-positions.v2.json"');
    expect(dockSource).toContain("BTreeMap<String, DockPosition>");
    expect(dockSource).toContain("repositioned for cursor monitor");
  });

  it("stages native movement before resizing across a monitor DPI boundary", () => {
    const dockSource = readFileSync("src-tauri/src/dock_shell.rs", "utf8");

    expect(dockSource).toContain("dock_scale_factor_changed");
    expect(dockSource).toContain("show_dock_window_after_scale_transition");
    expect(dockSource).toContain("SWP_NOACTIVATE | SWP_NOSIZE");
    expect(dockSource).toContain("SWP_NOACTIVATE | SWP_FRAMECHANGED");
    expect(dockSource).toContain("dpi_staged={}");
  });
});
