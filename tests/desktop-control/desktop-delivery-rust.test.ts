import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Windows desktop delivery native paste", () => {
  it("dismisses an Alt+Space system menu before sending Ctrl+V", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");

    expect(source).toContain("VK_ESCAPE");
    expect(source).toContain("fn dismiss_transient_menu_before_paste()");
    expect(source.indexOf("dismiss_transient_menu_before_paste()?"))
      .toBeLessThan(source.indexOf("send_ctrl_v()?"));
  });

  it("keeps paste observation native, gated, and redaction-safe", () => {
    const source = readFileSync("src-tauri/src/desktop_delivery.rs", "utf8");
    const libSource = readFileSync("src-tauri/src/lib.rs", "utf8");

    expect(source).toContain("pub fn observe_desktop_paste(");
    expect(source).toContain("read_window_text_surfaces(hwnd)");
    expect(source).toContain("SendMessageTimeoutW");
    expect(source).toContain("Native Windows observer confirmed");
    expect(source).not.toContain("observedContents");
    expect(source).not.toContain("targetContents");
    expect(libSource).toContain("desktop_delivery::observe_desktop_paste");
  });
});
