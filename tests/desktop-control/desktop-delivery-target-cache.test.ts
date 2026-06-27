import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("desktop delivery target cache", () => {
  it("caches the foreground target before tray menu commands can steal focus", () => {
    const deliverySource = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");
    const traySource = readFileSync("src-tauri/src/tray.rs", "utf8");
    const libSource = readFileSync("src-tauri/src/lib.rs", "utf8");
    const tauriDeliverySource = readFileSync("src/delivery/tauri-desktop-delivery.ts", "utf8");

    expect(traySource).toContain("on_tray_icon_event");
    expect(traySource).toContain("cache_delivery_target_before_tray_menu");
    expect(traySource).toContain("tray_icon_click_before_menu");
    expect(deliverySource).toContain("CACHED_DESKTOP_DELIVERY_TARGET");
    expect(deliverySource).toContain("start_delivery_target_watcher");
    expect(deliverySource).toContain("foreground_watcher");
    expect(deliverySource).toContain("process_id == std::process::id()");
    expect(deliverySource).toContain("get_cached_desktop_delivery_target");
    expect(libSource).toContain("desktop_delivery::start_delivery_target_watcher");
    expect(libSource).toContain("desktop_delivery::get_cached_desktop_delivery_target");
    expect(tauriDeliverySource).toContain("get_cached_desktop_delivery_target");
    expect(tauriDeliverySource.indexOf("get_cached_desktop_delivery_target")).toBeLessThan(
      tauriDeliverySource.indexOf("capture_desktop_delivery_target"),
    );
  });
});
