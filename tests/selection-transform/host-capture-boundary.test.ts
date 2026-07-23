// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  hostSelectionCaptureCommand,
  hostSelectionCaptureForTargetCommand,
  hostSelectionCaptureForTargetWithClipboardCommand,
  hostSelectionCaptureRoute,
  routeSelectionCaptureOutcome,
  selectionCaptureStatuses,
  type SelectionCaptureOutcome,
} from "../../src/selection-transform";

const forbiddenRendererSelectionSideEffectMarkers = [
  "navigator.clipboard",
  "document.execCommand",
  "sendKeys",
  "paste_observed",
  "paste_sent",
  "tauri_plugin_clipboard_manager",
  "enigo",
  "keybd_event",
] as const;

describe("host selection capture boundary", () => {
  it("declares the selected route as host-owned, UI Automation first, with clipboard fallback", () => {
    expect(hostSelectionCaptureCommand).toBe("capture_selection_context");
    expect(hostSelectionCaptureForTargetCommand).toBe("capture_selection_context_for_target");
    expect(hostSelectionCaptureForTargetWithClipboardCommand).toBe(
      "capture_selection_context_for_target_with_clipboard",
    );
    expect(hostSelectionCaptureRoute).toEqual({
      owner: "tauri_host",
      primaryStrategy: "windows_ui_automation_then_clipboard_roundtrip",
      mutatesClipboard: true,
      sendsKeyboardShortcut: true,
      touchesFocus: false,
      persistsSelection: false,
      allowsClipboardRoundtrip: true,
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

  it("registers a host command boundary without wiring it to default renderer flow", () => {
    const hostSource = readFileSync("src-tauri/src/selection_capture.rs", "utf8");
    const libSource = readFileSync("src-tauri/src/lib.rs", "utf8");
    const appSource = readFileSync("src/App.tsx", "utf8");

    expect(hostSource).toContain("pub fn capture_selection_context()");
    expect(hostSource).toContain("pub fn capture_selection_context_for_target");
    expect(hostSource).toContain("pub fn capture_selection_context_for_target_with_clipboard");
    expect(libSource).toContain("selection_capture::capture_selection_context");
    expect(libSource).toContain("selection_capture::capture_selection_context_for_target");
    expect(libSource).toContain("selection_capture::capture_selection_context_for_target_with_clipboard");
    expect(appSource).toContain("hostSelectionCaptureForTargetWithClipboardCommand");
    expect(appSource).not.toContain("capture_selection_context");
  });

  it("keeps renderer selection boundary free of clipboard, keyboard, and paste side effects", () => {
    const sources = [
      "src/selection-transform/host-capture-boundary.ts",
      "src-tauri/Cargo.toml",
    ];

    for (const path of sources) {
      const source = readFileSync(path, "utf8");
      for (const marker of forbiddenRendererSelectionSideEffectMarkers) {
        expect(source, `${path} must not contain ${marker}`).not.toContain(marker);
      }
    }

    const hostSource = readFileSync("src-tauri/src/selection_capture.rs", "utf8");
    expect(hostSource).toContain("GetClipboardData");
    expect(hostSource).toContain("SetClipboardData");
    expect(hostSource).toContain("SendInput");
    expect(hostSource).not.toContain("paste_observed");
    expect(hostSource).not.toContain("paste_sent");
  });

  it("redacts foreground target labels before returning host selection metadata", () => {
    const source = readFileSync("src-tauri/src/selection_capture.rs", "utf8");

    expect(source).toContain("[redacted]");
    expect(source).not.toContain("window_label: non_empty");
    expect(source).not.toContain("app_label: non_empty");
  });
});
