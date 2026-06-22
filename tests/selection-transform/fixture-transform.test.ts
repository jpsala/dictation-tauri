import { describe, expect, it } from "vitest";
import {
  normalizeSelectionContext,
  runFixtureSelectionTransform,
  type SelectionTransformRequest,
} from "../../src/selection-transform";

describe("fixture selection transforms", () => {
  it("rewrites selected text without provider calls", () => {
    const result = runFixtureSelectionTransform(createRequest({ presetId: "rewrite" }));

    expect(result).toMatchObject({
      status: "ok",
      output: "Rewritten: Please make this sentence clearer.",
      action: "replace_selection",
      presetId: "rewrite",
      evidence: {
        selectionAvailable: true,
        source: "fixture",
        provider: "fixture",
        model: "deterministic-selection-transform",
      },
    });
  });

  it("shortens selected text deterministically", () => {
    const result = runFixtureSelectionTransform(
      createRequest({
        presetId: "shorten",
        selectedText:
          "This selected text has far too many words for a compact desktop recovery note.",
      }),
    );

    expect(result.output).toBe("This selected text has far too many words…");
    expect(result.status).toBe("ok");
  });

  it("bulletizes selected text deterministically", () => {
    const result = runFixtureSelectionTransform(
      createRequest({
        presetId: "bulletize",
        selectedText: "First point. Second point; still second. Third point.",
      }),
    );

    expect(result.output).toBe("- First point\n- Second point; still second\n- Third point");
  });

  it("returns actionable recovery for unsupported presets", () => {
    const result = runFixtureSelectionTransform(createRequest({ presetId: "formalize" }));

    expect(result).toMatchObject({
      status: "failed",
      action: "review_only",
      evidence: {
        selectionAvailable: true,
        presetId: "formalize",
        reason: "Unsupported selection transform preset: formalize.",
      },
      recoveryAction: {
        kind: "copy_manually",
        label: "Review selected text",
      },
    });
  });

  it("skips transform when no selected text is available", () => {
    const result = runFixtureSelectionTransform(
      createRequest({ presetId: "rewrite", selectedText: " " }),
    );

    expect(result).toMatchObject({
      status: "skipped",
      action: "review_only",
      evidence: {
        selectionAvailable: false,
        reason: "No selected text is available; direct dictation should be used.",
      },
    });
  });

  it("rejects provider-enabled fixture requests", () => {
    const result = runFixtureSelectionTransform(
      createRequest({ presetId: "rewrite", allowProviderCall: true }),
    );

    expect(result.status).toBe("failed");
    expect(result.evidence.reason).toBe(
      "Fixture selection transforms must run with allowProviderCall=false.",
    );
  });
});

function createRequest(
  overrides: Partial<SelectionTransformRequest> & { selectedText?: string } = {},
): SelectionTransformRequest {
  const selectedText = overrides.selectedText ?? "Please make this sentence clearer.";

  return {
    requestId: "fixture-request",
    sessionId: "fixture-session",
    selection: normalizeSelectionContext({
      selectionId: "fixture-selection",
      selectedText,
      source: "fixture",
    }),
    instructionTranscript: "Rewrite this so it is clearer.",
    presetId: "rewrite",
    mode: "fixture",
    allowProviderCall: false,
    ...overrides,
  };
}
