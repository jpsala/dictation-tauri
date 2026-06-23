import { hasSelectedText } from "./context";
import type {
  HostSelectionCaptureRoute,
  SelectionCaptureOutcome,
  SelectionRoute,
} from "./types";

export const hostSelectionCaptureCommand = "capture_selection_context";

export const hostSelectionCaptureRoute: HostSelectionCaptureRoute = {
  owner: "tauri_host",
  primaryStrategy: "windows_ui_automation",
  mutatesClipboard: false,
  sendsKeyboardShortcut: false,
  touchesFocus: false,
  persistsSelection: false,
  allowsClipboardRoundtrip: false,
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
