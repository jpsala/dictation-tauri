import { describe, expect, it } from "vitest";
import {
  hotkeyEditPlanLabels,
  nativeHotkeyEditCandidates,
  nativeHotkeyEditContract,
} from "../../src/settings/hotkey-edit-contract";

describe("native hotkey edit contract", () => {
  it("keeps shortcut editing on the host-owned capture, swap, rollback, and verify path", () => {
    expect(nativeHotkeyEditContract.status).toBe("host_owned_editing");
    expect(nativeHotkeyEditContract.statusLabel).toBe("Persistent");
    expect(hotkeyEditPlanLabels()).toEqual([
      "Capture",
      "Check conflict",
      "Swap",
      "Rollback",
      "Verify",
    ]);
    expect(nativeHotkeyEditContract.summary).toContain("Host-owned changes");
    expect(nativeHotkeyEditContract.summary).toContain("local preference storage");
    expect(nativeHotkeyEditContract.steps.map((step) => step.guardrail).join(" ")).toContain(
      "native host",
    );
    expect(nativeHotkeyEditContract.steps.map((step) => step.guardrail).join(" ")).toContain(
      "previous working binding",
    );
    expect(nativeHotkeyEditContract.steps.map((step) => step.guardrail).join(" ")).toContain(
      "before persistence",
    );
  });

  it("limits the editable UI to supported host-preview candidates", () => {
    expect(nativeHotkeyEditCandidates.map((candidate) => candidate.shortcut)).toEqual([
      "Alt+Space",
      "Alt+3",
      "Ctrl+Shift+F9",
    ]);
    expect(nativeHotkeyEditCandidates.map((candidate) => candidate.badge)).toEqual([
      "Default",
      "Alternate",
      "Fallback",
    ]);
  });

  it("allows renderer UI controls but forbids renderer keyboard capture, registration, and persistence", () => {
    expect(nativeHotkeyEditContract.rendererBoundary).toEqual({
      editableControlsAllowed: true,
      keyboardCaptureAllowed: false,
      registrationAllowed: false,
      persistenceAllowed: false,
    });
  });
});
