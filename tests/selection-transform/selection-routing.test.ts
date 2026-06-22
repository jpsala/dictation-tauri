import { describe, expect, it } from "vitest";
import {
  classifySelectionRoute,
  normalizeSelectionContext,
} from "../../src/selection-transform";

describe("selection transform routing", () => {
  it("routes fixture selected text to selection transform", () => {
    const selection = normalizeSelectionContext({
      selectionId: "fixture-route",
      selectedText: "Rewrite this selected sentence.",
    });

    expect(classifySelectionRoute(selection)).toEqual({
      kind: "selection_transform",
      selection,
    });
  });

  it("routes missing selected text to direct dictation", () => {
    const selection = normalizeSelectionContext({ selectedText: " " });

    expect(classifySelectionRoute(selection)).toEqual({
      kind: "direct_dictation",
      reason: "No selected text is available; use direct dictation.",
    });
  });
});
