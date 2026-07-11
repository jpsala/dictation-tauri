import { hasSelectedText } from "./context";
import type {
  HostSelectionCaptureRoute,
  SelectionCaptureOutcome,
  SelectionRoute,
} from "./types";

export const hostSelectionCaptureCommand = "capture_selection_context";
export const hostSelectionCaptureForTargetCommand = "capture_selection_context_for_target";

export const hostSelectionCaptureRoute: HostSelectionCaptureRoute = {
  owner: "tauri_host",
  primaryStrategy: "windows_ui_automation_then_clipboard_roundtrip",
  mutatesClipboard: true,
  sendsKeyboardShortcut: true,
  touchesFocus: false,
  persistsSelection: false,
  allowsClipboardRoundtrip: true,
};

export function routeSelectionCaptureOutcome(
  outcome: SelectionCaptureOutcome,
): SelectionRoute {
  if (
    outcome.status === "ok" &&
    outcome.redacted &&
    outcome.selection?.source === "host_capture" &&
    hasSelectedText(outcome.selection)
  ) {
    return {
      kind: "selection_transform",
      selection: outcome.selection,
    };
  }

  return {
    kind: "direct_dictation",
    reason: outcome.status,
  };
}
