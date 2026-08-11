import { describe, expect, it } from "vitest";
import {
  formatHotkeyEditReason,
  hotkeyEditReasonCopy,
} from "../../src/settings/hotkey-edit-copy";

describe("hotkey edit copy", () => {
  it("keeps user-facing conflict and rollback copy explicit", () => {
    expect(formatHotkeyEditReason("unsupported_shortcut")).toBe(
      "Este atajo todavía no está disponible.",
    );
    expect(formatHotkeyEditReason("shortcut_not_applicable")).toBe(
      "El atajo no se pudo aplicar; el actual no cambió.",
    );
    expect(formatHotkeyEditReason("shortcut_not_registered_after_swap")).toBe(
      "No se pudo verificar el nuevo atajo. Se restauró el anterior.",
    );
    expect(formatHotkeyEditReason("alt_space_hook_not_enabled")).toContain(
      "Se restauró el anterior",
    );
  });

  it("does not expose implementation-only raw labels for known host outcomes", () => {
    for (const [reason, copy] of Object.entries(hotkeyEditReasonCopy)) {
      expect(copy, reason).not.toContain(reason);
      expect(copy, reason).not.toContain("raw transcript");
      expect(copy, reason).not.toContain("selected text");
    }
  });

  it("uses a stable Spanish fallback for unknown host errors", () => {
    expect(formatHotkeyEditReason("custom_host_error")).toBe(
      "No se pudo completar la operación.",
    );
    expect(formatHotkeyEditReason(new Error("native bridge timed out"))).toBe(
      "No se pudo completar la operación.",
    );
    expect(formatHotkeyEditReason("custom_host_error")).not.toContain("custom_host_error");
    expect(formatHotkeyEditReason(new Error("native bridge timed out"))).not.toContain("native bridge");
  });

});
