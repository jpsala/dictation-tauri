import { describe, expect, it } from "vitest";
import {
  normalizeSelectionContext,
  runFixtureSelectionTransform,
  type SelectionTransformRequest,
} from "../../src/selection-transform";

describe("fixture selection transforms", () => {
  it("corrects Spanish selected text without provider calls", () => {
    const result = runFixtureSelectionTransform(
      createRequest({ presetId: "corregir-texto", selectedText: "hola amigo" }),
    );

    expect(result).toMatchObject({
      status: "ok",
      output: "Hola, amigo.",
      action: "replace_selection",
      presetId: "corregir-texto",
      evidence: {
        selectionAvailable: true,
        source: "fixture",
        provider: "fixture",
        model: "deterministic-selection-transform",
      },
    });
  });

  it("corrects English selected text deterministically", () => {
    const result = runFixtureSelectionTransform(
      createRequest({
        presetId: "fix-writing",
        selectedText: "helo frend",
      }),
    );

    expect(result.output).toBe("Hello friend.");
    expect(result.status).toBe("ok");
  });

  it("keeps Como yo text close to the source in fixture mode", () => {
    const result = runFixtureSelectionTransform(
      createRequest({
        presetId: "como-yo-es",
        selectedText: "che, revisá este PR",
      }),
    );

    expect(result.output).toBe("che, revisá este PR");
  });

  it("keeps Like me English text close to the source in fixture mode", () => {
    const result = runFixtureSelectionTransform(
      createRequest({
        presetId: "like-me-en",
        selectedText: "Ok, lets check this PR",
      }),
    );

    expect(result.output).toBe("Ok, lets check this PR");
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
      createRequest({ presetId: "corregir-texto", selectedText: " " }),
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
      createRequest({ presetId: "corregir-texto", allowProviderCall: true }),
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
    presetId: "corregir-texto",
    mode: "fixture",
    allowProviderCall: false,
    ...overrides,
  };
}
