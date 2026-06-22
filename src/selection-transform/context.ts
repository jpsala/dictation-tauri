import { redactHostRuntimeText } from "../host-runtime/redaction";
import type { DesktopTargetSnapshot } from "../delivery/types";
import type { SelectionContext, SelectionContextInput } from "./types";

const emptySelectionId = "selection-none";
const defaultFixtureSelectionId = "selection-fixture";

export function normalizeSelectionContext(
  input: SelectionContextInput = {},
): SelectionContext {
  const selectedText = normalizeSelectedText(input.selectedText);
  const hasSelection = Boolean(selectedText);
  const source = hasSelection ? (input.source ?? "fixture") : "none";

  return {
    selectionId:
      input.selectionId ?? (hasSelection ? defaultFixtureSelectionId : emptySelectionId),
    selectedText,
    textLength: selectedText?.length ?? 0,
    source,
    capturedAt: input.capturedAt,
    targetSnapshot: input.targetSnapshot
      ? redactTargetSnapshot(input.targetSnapshot)
      : undefined,
    confidence: hasSelection ? (input.confidence ?? "medium") : "none",
    redacted: true,
  };
}

export function hasSelectedText(selection: SelectionContext): boolean {
  return Boolean(selection.selectedText?.trim());
}

export function normalizeSelectedText(text: string | undefined): string | undefined {
  const normalized = text?.trim();
  return normalized ? normalized : undefined;
}

export function redactTargetSnapshot(
  snapshot: DesktopTargetSnapshot,
): DesktopTargetSnapshot {
  return {
    ...snapshot,
    appLabel: snapshot.appLabel
      ? redactHostRuntimeText(snapshot.appLabel, { maxMessageLength: 80 })
      : undefined,
    windowLabel: snapshot.windowLabel
      ? redactHostRuntimeText(snapshot.windowLabel, { maxMessageLength: 120 })
      : undefined,
  };
}
