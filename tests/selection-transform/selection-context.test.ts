import { describe, expect, it } from "vitest";
import {
  hasSelectedText,
  normalizeSelectedText,
  normalizeSelectionContext,
} from "../../src/selection-transform";

const secretLookingTarget = {
  appLabel: "Editor token sk-live-secret-value",
  windowLabel: "Draft with Authorization: Bearer abc123-secret-token",
  confidence: "high" as const,
};

describe("selection context fixtures", () => {
  it("normalizes fixture selected text without reading desktop selection", () => {
    const selection = normalizeSelectionContext({
      selectionId: "fixture-1",
      selectedText: "  Synthetic selected text.  ",
      source: "fixture",
      targetSnapshot: {
        appLabel: "Fixture editor",
        windowLabel: "Synthetic document",
        confidence: "medium",
      },
    });

    expect(selection).toMatchObject({
      selectionId: "fixture-1",
      selectedText: "Synthetic selected text.",
      textLength: "Synthetic selected text.".length,
      source: "fixture",
      confidence: "medium",
      redacted: true,
    });
    expect(hasSelectedText(selection)).toBe(true);
  });

  it("treats empty and whitespace selected text as no selection", () => {
    for (const selectedText of [undefined, "", "   ", "\n\t"]) {
      const selection = normalizeSelectionContext({ selectedText });

      expect(selection.selectedText).toBeUndefined();
      expect(selection.textLength).toBe(0);
      expect(selection.source).toBe("none");
      expect(selection.confidence).toBe("none");
      expect(hasSelectedText(selection)).toBe(false);
    }
  });

  it("redacts secret-looking target labels", () => {
    const selection = normalizeSelectionContext({
      selectedText: "fixture text",
      targetSnapshot: secretLookingTarget,
    });

    expect(selection.targetSnapshot?.appLabel).not.toContain("sk-live-secret-value");
    expect(selection.targetSnapshot?.windowLabel).not.toContain("Bearer abc123-secret-token");
    expect(selection.targetSnapshot?.confidence).toBe("high");
  });

  it("trims selected text consistently", () => {
    expect(normalizeSelectedText("  keep me  ")).toBe("keep me");
    expect(normalizeSelectedText("   ")).toBeUndefined();
  });
});
