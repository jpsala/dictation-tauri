import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsSurface } from "../../src/settings/SettingsSurface";

describe("SettingsSurface", () => {
  it("renders a compact section scaffold with a host-owned hotkey editor", () => {
    const html = renderToStaticMarkup(<SettingsSurface />);

    expect(html).toContain("Keyboard shortcuts");
    expect(html).toContain("General");
    expect(html).toContain("Cloud");
    expect(html).toContain("Dock");
    expect(html).toContain("Delivery");
    expect(html).toContain("Presets");
    expect(html).toContain("Dictation key");
    expect(html).toContain("Paste last");
    expect(html).toContain("Cancel recording");
    expect(html).toContain("Active");
    expect(html).toContain("Dictation key editor");
    expect(html).toContain("Alt+Space");
    expect(html).toContain("Check current shortcut");
    expect(html).toContain("Click the field, then press the shortcut.");
    expect(html).toContain("Click to edit");
    expect(html).not.toContain("Use Alt+Space");
    expect(html).not.toContain("Use Alt+3");
    expect(html).not.toContain("Use Ctrl+Shift+F9");
    expect(html).not.toContain("Save Alt+Space");
    expect(html).not.toContain("Preview before saving");
    expect(html).toContain("Capture");
    expect(html).toContain("Check conflict");
    expect(html).toContain("Swap");
    expect(html).toContain("Rollback");
    expect(html).toContain("Verify");
    expect(html).toContain("save to local preference storage");
    expect(html).not.toContain("Device activation");
    expect(html).not.toContain("Enter invite code");
    expect(html).not.toContain("Activate device");
    expect(html).not.toContain("Refresh local status");
    expect(html).not.toContain("Refresh policy");
    expect(html).not.toContain("IDs redacted");

    expect(html).not.toContain("Show dock on startup");
    expect(html).not.toContain("Preset routing");
    expect(html).not.toContain("Save changes");
    expect(html).not.toContain("Record shortcut");
    expect(html).not.toContain("Capture shortcut");
    expect(html).not.toContain("navigator.clipboard");
    expect(html).not.toContain("registerAll");
    expect(html.toLowerCase()).not.toContain("dummy");
    expect(html.toLowerCase()).not.toContain("spike-only");
    expect(html.toLowerCase()).not.toContain("raw transcript");
    expect(html.toLowerCase()).not.toContain("selected text");
  });

  it("wires the single shortcut field to record key presses and save through the host", () => {
    const source = readFileSync("src/settings/SettingsSurface.tsx", "utf8");

    expect(source).toContain("desktop-control://hotkey-capture");
    expect(source).toContain("set_desktop_control_hotkey_capture_enabled");
    expect(source).toContain("startShortcutCapture");
    expect(source).toContain("onClick={() => void startShortcutCapture()}");
    expect(source).toContain("captureState === \"recording\" || captureArmedRef.current");
    expect(source).not.toContain("onMouseDown={() => void startShortcutCapture()}");
    expect(source).not.toContain("onFocus={() => void startShortcutCapture()}");
    expect(source).toContain("handleShortcutCaptureKeyDown");
    expect(source).toContain("shortcutFromKeyboardEvent");
    expect(source).toContain("await applyCandidate(shortcut)");
    expect(source).toContain("Press new shortcut…");
    expect(source).toContain("onClick={() => setSelectedSection(section.id)}");
    expect(source).not.toContain("disabled={!isActive}");
    expect(source).toContain("selectedSection === \"hotkeys\"");
    expect(source).toContain("selectedSection === \"cloud\"");
    expect(source).toContain("getFixvoxCloudStatus");
    expect(source).toContain("activateFixvoxDevice");
    expect(source).toContain("window.confirm");
    expect(source).not.toContain("void applyCandidate(candidate.shortcut)");
    expect(source).not.toContain("Save ${editingShortcut}");
  });
});
