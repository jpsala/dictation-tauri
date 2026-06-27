import { describe, expect, it } from "vitest";
import {
  formatHotkeyEditReason,
  hotkeyEditReasonCopy,
} from "../../src/settings/hotkey-edit-copy";

describe("hotkey edit copy", () => {
  it("keeps user-facing conflict and rollback copy explicit", () => {
    expect(formatHotkeyEditReason("unsupported_shortcut")).toBe(
      "This shortcut is not available here yet. Use Ctrl, Alt, or Shift plus a normal key.",
    );
    expect(formatHotkeyEditReason("shortcut_not_applicable")).toBe(
      "The host rejected this binding without changing the current shortcut.",
    );
    expect(formatHotkeyEditReason("shortcut_not_registered_after_swap")).toBe(
      "The host could not verify the new binding. The previous shortcut was restored.",
    );
    expect(formatHotkeyEditReason("alt_space_hook_not_enabled")).toContain(
      "previous shortcut was restored",
    );
  });

  it("does not expose implementation-only raw labels for known host outcomes", () => {
    for (const [reason, copy] of Object.entries(hotkeyEditReasonCopy)) {
      expect(copy, reason).not.toContain(reason);
      expect(copy, reason).not.toContain("raw transcript");
      expect(copy, reason).not.toContain("selected text");
    }
  });

  it("keeps unknown host errors readable without hiding the diagnostic", () => {
    expect(formatHotkeyEditReason("custom_host_error")).toBe("custom host error");
    expect(formatHotkeyEditReason(new Error("native bridge timed out"))).toBe(
      "native bridge timed out",
    );
  });
});
