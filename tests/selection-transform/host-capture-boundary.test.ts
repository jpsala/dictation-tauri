import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  hostSelectionCaptureCommand,
  hostSelectionCaptureRoute,
  routeSelectionCaptureOutcome,
  selectionCaptureStatuses,
  type SelectionCaptureOutcome,
} from "../../src/selection-transform";

const forbiddenHostSelectionSideEffectMarkers = [
  "navigator.clipboard",
  "document.execCommand",
  "sendKeys",
  "paste_observed",
  "paste_sent",
  "tauri_plugin_clipboard_manager",
  "enigo",
  "keybd_event",
  "SendInput",
  "GetClipboardData",
  "SetClipboardData",
  "OpenClipboard",
] as const;

describe("host selection capture boundary", () => {
  it("declares the selected route as host-owned, UI Automation first, and non-mutating", () => {
    expect(hostSelectionCaptureCommand).toBe("capture_selection_context");
    expect(hostSelectionCaptureRoute).toEqual({
      owner: "tauri_host",
      primaryStrategy: "windows_ui_automation",
      mutatesClipboard: false,
      sendsKeyboardShortcut: false,
      touchesFocus: false,
      persistsSelection: false,
      allowsClipboardRoundtrip: false,
    });
  });

  it("models every documented failure status before real capture exists", () => {
    expect(selectionCaptureStatuses).toEqual([
      "ok",
      "unsupported_platform",
      "no_foreground_target",
      "unsupported_target",
      "no_selection",
      "timeout",
      "failed",
    ]);

    const failureOutcomes: SelectionCaptureOutcome[] = selectionCaptureStatuses
      .filter((status) => status !== "ok")
      .map((status) => ({
        status,
        redacted: true,
        truncated: false,
        reason: `synthetic ${status}`,
      }));

    for (const outcome of failureOutcomes) {
      expect(routeSelectionCaptureOutcome(outcome)).toEqual({
        kind: "direct_dictation",
        reason: outcome.status,
      });
    }
  });

  it("routes only redacted successful host selections into selection transform", () => {
    const outcome: SelectionCaptureOutcome = {
      status: "ok",
      redacted: true,
      truncated: false,
      selection: {
        selectionId: "host-selection-1",
        selectedText: "synthetic selected text",
        textLength: 23,
        source: "host_capture",
        confidence: "medium",
        redacted: true,
      },
    };

    expect(routeSelectionCaptureOutcome(outcome)).toEqual({
      kind: "selection_transform",
      selection: outcome.selection,
    });
  });

  it("keeps TS and Rust boundary files free of clipboard, keyboard, and paste side effects", () => {
    const sources = [
      "src/selection-transform/host-capture-boundary.ts",
      "src-tauri/src/selection_capture.rs",
      "src-tauri/Cargo.toml",
    ];

    for (const path of sources) {
      const source = readFileSync(path, "utf8");
      for (const marker of forbiddenHostSelectionSideEffectMarkers) {
        expect(source, `${path} must not contain ${marker}`).not.toContain(marker);
      }
    }
  });
});
