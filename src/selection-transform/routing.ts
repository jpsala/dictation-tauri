import { hasSelectedText } from "./context";
import type { SelectionContext, SelectionRoute } from "./types";

export function classifySelectionRoute(
  selection: SelectionContext,
): SelectionRoute {
  if (!hasSelectedText(selection)) {
    return {
      kind: "direct_dictation",
      reason: "No selected text is available; use direct dictation.",
    };
  }

  return {
    kind: "selection_transform",
    selection,
  };
}
