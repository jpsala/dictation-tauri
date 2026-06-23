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
});
