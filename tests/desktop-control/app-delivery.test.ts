import { describe, expect, it, vi } from "vitest";
import {
  applyAssistantVoicePrefixToRuntimeResult,
  applyDeliveryEvidenceFallback,
  applySafePasteLastRecovery,
  applySelectionTransformFailureToRuntimeResult,
  applySelectionTransformOutputToRuntimeResult,
  applySelectionTransformToRuntimeResult,
  describeDeveloperDeliveryStatus,
  formatDesktopRecoveryAction,
  getReviewCopyLabel,
  getTranscriptReview,
  mapPipelineEvidenceToDesktopEvidence,
} from "../../src/App";
import type { DesktopRuntimeResult } from "../../src/desktop-control/controller";
import type { SimulatedRunSummary } from "../../src/pipeline/types";
import {
  createPipelineUiResult,
  getCompanionSurfaceForPipelineUiResult,
  isAssistantHandledBySurface,
} from "../../src/pipeline/ui-result";
import type { SelectionContext } from "../../src/selection-transform";

describe("App delivery fallback", () => {
  it("formats controller recovery actions for the shared recovery line", () => {
    expect(
      formatDesktopRecoveryAction({
        kind: "record_again",
        label: "Check microphone setup",
        reason: "Check microphone permission or device setup, then record again.",
        clipAvailable: false,
      }),
    ).toBe(
      "Check microphone setup: Check microphone permission or device setup, then record again.",
    );

    expect(
      formatDesktopRecoveryAction({
        kind: "dismiss",
        label: "Dismiss",
        reason: "No further automatic action is required for this control event.",
        clipAvailable: false,
      }),
    ).toBeUndefined();
  });

  it("keeps transcript review visible after delivery failure", () => {
    const summary = createReviewSummary();
    const afterFailure = applyDeliveryEvidenceFallback(summary, {
      status: "failed",
      output: "transcript remains visible",
      strategy: "copy",
      message: "Delivery failed; transcript remains available for review.",
      reason: "Fake copy failed.",
    });

    expect(afterFailure.deliveryEvidence).toEqual({
      status: "failed",
      output: "transcript remains visible",
      reason: "Fake copy failed.",
    });
    expect(getTranscriptReview(afterFailure)).toMatchObject({
      text: "transcript remains visible",
      source: "dictation",
      provider: "host-runtime-fake",
      model: "fake-model",
    });
  });

  it("marks paste-last recovery as uncertain without sending or observing paste", () => {
    const summary = createReviewSummary();
    const afterPasteLast = applySafePasteLastRecovery(summary);

    expect(afterPasteLast.deliveryEvidence).toEqual({
      status: "uncertain",
      output: "transcript remains visible",
      reason:
        "Paste last was not sent in safe mode; transcript remains available for manual copy.",
    });
    expect(getTranscriptReview(afterPasteLast)).toMatchObject({
      text: "transcript remains visible",
      source: "dictation",
    });
    expect(getReviewCopyLabel(afterPasteLast)).toBe("Copy transcript");
    expect(JSON.stringify(afterPasteLast)).not.toContain("paste_observed");
    expect(afterPasteLast.deliveryEvidence?.status).not.toBe("paste_sent");
  });

  it("leaves summaries without latest output unchanged", () => {
    const summary: SimulatedRunSummary = {
      ...createReviewSummary(),
      transcript: undefined,
      output: undefined,
      deliveryEvidence: undefined,
    };

    expect(applySafePasteLastRecovery(summary)).toBe(summary);
    expect(getTranscriptReview(summary)).toBeUndefined();
  });

  it("maps delivery evidence to developer and dock wording without overclaiming", () => {
    expect(describeDeveloperDeliveryStatus({ status: "paste_sent" })).toBe(
      "paste_sent (sent, not observer-verified)",
    );
    expect(describeDeveloperDeliveryStatus({ status: "paste_observed" })).toBe(
      "paste_observed (verified by observer)",
    );
    expect(describeDeveloperDeliveryStatus({ status: "available" })).toBe(
      "review_only / available (not inserted)",
    );

    expect(mapPipelineEvidenceToDesktopEvidence({
      status: "uncertain",
      output: "transcript remains visible",
      reason: "Target app could not be verified.",
    }, "transcript remains visible")).toMatchObject({
      status: "uncertain",
      strategy: "review_only",
      message: "Delivery is uncertain. Verify the target; if text is missing, copy or use safe paste-last.",
      reason: "Target app could not be verified.",
    });

    expect(mapPipelineEvidenceToDesktopEvidence({
      status: "failed",
      output: "transcript remains visible",
      reason: "No assured editable target is available for paste delivery.",
    }, "transcript remains visible")).toMatchObject({
      status: "failed",
      message: "Delivery failed before a confirmed handoff. Check the editable target, then copy or retry.",
      reason: "No assured editable target is available for paste delivery.",
    });
  });

  it("uses PipelineUiResult as the central assistant UI boundary", () => {
    const routed = applyAssistantVoicePrefixToRuntimeResult({
      runtime: { transcript: "Lulu, que preset esta activo?", summary: createReviewSummary() },
      sessionId: "session-ui-result",
      activePreset: { presetId: "corregir-texto", presetName: "Corregir texto", appKey: "global" },
    });

    const uiResult = createPipelineUiResult(routed.summary as SimulatedRunSummary);

    expect(uiResult).toMatchObject({
      kind: "assistant",
      surface: {
        kind: "notify",
        message: "Preset activo: Corregir texto.",
      },
    });
    expect(isAssistantHandledBySurface(uiResult)).toBe(true);
    expect(getCompanionSurfaceForPipelineUiResult(uiResult)).toBeUndefined();
    expect(getTranscriptReview(routed.summary as SimulatedRunSummary)).toBeUndefined();
  });

  it("logs redacted assistant routing telemetry for dogfood diagnosis", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      applyAssistantVoicePrefixToRuntimeResult({
        runtime: { transcript: "Lulu, what is two plus two", summary: createReviewSummary() },
        sessionId: "session-telemetry",
      });

      const call = info.mock.calls.find(([message]) => message === "[dictation-tauri][assistant] routed");
      expect(call).toBeDefined();
      const payload = JSON.parse(String(call?.[1]));
      expect(payload).toMatchObject({
        event: "assistant_routed",
        sessionId: "session-telemetry",
        parsedKind: "assistant",
        intentKind: "insertText",
        quickResponseIntent: "insert-answer",
        surfaceKind: "insertText",
        deliveryStrategy: "paste_send",
        redacted: true,
      });
      expect(String(call?.[1])).not.toContain("what is two plus two");
      expect(String(call?.[1])).not.toContain("Lulu");
    } finally {
      info.mockRestore();
    }
  });

  it("routes Lulu notify to assistant surface instead of transcript review", () => {
    const runtime: DesktopRuntimeResult = {
      transcript: "Lulu, que preset esta activo?",
      summary: createReviewSummary(),
    };

    const routed = applyAssistantVoicePrefixToRuntimeResult({
      runtime,
      sessionId: "session-1",
    });

    expect(routed.transcript).toBe("que preset esta activo?");
    expect(routed.output).toBe("No hay preset activo ahora.");
    expect(routed.assistantSurface).toEqual({
      kind: "notify",
      level: "info",
      message: "No hay preset activo ahora.",
    });
    expect(routed.deliveryStrategy).toBe("review_only");
    expect((routed.summary as SimulatedRunSummary).resultSource).toBe("assistant");
    expect(getTranscriptReview(routed.summary as SimulatedRunSummary)).toBeUndefined();
  });

  it("routes Lulu arithmetic answers to paste-send like Fixvox", () => {
    const routed = applyAssistantVoicePrefixToRuntimeResult({
      runtime: { transcript: "Lulu, cuanto es dos mas dos?", summary: createReviewSummary() },
      sessionId: "session-math",
    });

    expect(routed.transcript).toBe("cuanto es dos mas dos?");
    expect(routed.output).toBe("4");
    expect(routed.deliveryStrategy).toBe("paste_send");
    expect(routed.deliveryReason).toBe("Assistant prefix detected; local answer will be pasted like Fixvox.");
    expect((routed.summary as SimulatedRunSummary).resultSource).toBe("assistant");
  });

  it("uses managed assistant text for Lulu questions that local commands do not handle", () => {
    const routed = applyAssistantVoicePrefixToRuntimeResult({
      runtime: { transcript: "Lulu, cuanto tienes en memoria y contexto?", summary: createReviewSummary() },
      sessionId: "session-managed-question",
      managedAssistantText: "Puedo usar el contexto local disponible y la memoria viva del proyecto.",
    });

    expect(routed.output).toBe("Puedo usar el contexto local disponible y la memoria viva del proyecto.");
    expect(routed.output).not.toContain("Lulu puede revisar");
    expect(routed.assistantSurface).toEqual({
      kind: "showMarkdown",
      title: "Contexto de Lulu",
      markdown: "Puedo usar el contexto local disponible y la memoria viva del proyecto.",
    });
    expect((routed.summary as SimulatedRunSummary).assistantSurface).toEqual({
      kind: "showMarkdown",
      title: "Contexto de Lulu",
      markdown: "Puedo usar el contexto local disponible y la memoria viva del proyecto.",
    });
    expect(routed.deliveryStrategy).toBe("review_only");
    expect((routed.summary as SimulatedRunSummary).resultSource).toBe("assistant");
    expect(getTranscriptReview(routed.summary as SimulatedRunSummary)).toBeUndefined();
  });

  it("routes Lulu settings and history commands to local assistant actions", () => {
    const settings = applyAssistantVoicePrefixToRuntimeResult({
      runtime: { transcript: "Lulu, abrí settings", summary: createReviewSummary() },
      sessionId: "session-1",
    });
    const history = applyAssistantVoicePrefixToRuntimeResult({
      runtime: { transcript: "Lulu, mostrar historial", summary: createReviewSummary() },
      sessionId: "session-2",
    });

    expect(settings.output).toBe("Abriendo Settings.");
    expect(settings.assistantAction).toEqual({ kind: "open-settings" });
    expect(history.output).toBe("Abriendo historial de resultados.");
    expect(history.assistantAction).toEqual({ kind: "show-history" });
  });

  it("routes ambiguous Lulu preset activation to option picker surface", () => {
    const routed = applyAssistantVoicePrefixToRuntimeResult({
      runtime: { transcript: "Lulu, activa el preset de JP", summary: createReviewSummary() },
      sessionId: "session-jp",
      availablePresets: [
        { id: "jp-es", name: "JP español" },
        { id: "jp-en", name: "JP English" },
      ],
    });

    expect(routed.output).toBe("Encontré más de un preset para JP.");
    expect(routed.assistantSurface).toEqual({
      kind: "optionPicker",
      title: "Elegir preset",
      prompt: "Encontré más de un preset para JP.",
      options: [
        { id: "jp-es", label: "JP español" },
        { id: "jp-en", label: "JP English" },
      ],
    });
    expect(routed.deliveryStrategy).toBe("review_only");
  });

  it("routes Lulu preset activation to an assistant action", () => {
    const runtime: DesktopRuntimeResult = {
      transcript: "Lulu, activá el preset corregir texto",
      summary: createReviewSummary(),
    };

    const routed = applyAssistantVoicePrefixToRuntimeResult({
      runtime,
      sessionId: "session-1",
      availablePresets: [
        { id: "como-yo-es", name: "Como yo (español)" },
        { id: "corregir-texto", name: "Corregir texto" },
      ],
    });

    expect(routed.output).toBe("Preset activo: Corregir texto.");
    expect(routed.assistantAction).toEqual({
      kind: "activate-preset",
      presetId: "corregir-texto",
      presetName: "Corregir texto",
    });
    expect(routed.deliveryStrategy).toBe("review_only");
    expect((routed.summary as SimulatedRunSummary).resultSource).toBe("assistant");
  });

  it("answers Lulu preset status with the current active preset", () => {
    const runtime: DesktopRuntimeResult = {
      transcript: "Lulu, cual es el preset activo?",
      summary: createReviewSummary(),
    };

    const routed = applyAssistantVoicePrefixToRuntimeResult({
      runtime,
      sessionId: "session-1",
      activePreset: {
        presetId: "corregir-texto",
        presetName: "Corregir texto",
        appKey: "global",
      },
    });

    expect(routed.output).toBe("Preset activo: Corregir texto.");
    expect(routed.deliveryStrategy).toBe("review_only");
    expect((routed.summary as SimulatedRunSummary).resultSource).toBe("assistant");
  });

  it("passes active preset state into Lulu follow-up routing", () => {
    const routed = applyAssistantVoicePrefixToRuntimeResult({
      runtime: { transcript: "Lulu, no, el otro en ingles", summary: createReviewSummary() },
      sessionId: "session-follow-up",
      activePreset: {
        presetId: "corregir-texto",
        presetName: "Corregir texto",
        appKey: "global",
      },
      availablePresets: [
        { id: "corregir-texto", name: "Corregir texto" },
        { id: "fix-writing", name: "Fix writing" },
      ],
    });

    expect(routed.output).toBe("Preset activo: Fix writing.");
    expect(routed.assistantAction).toEqual({
      kind: "activate-preset",
      presetId: "fix-writing",
      presetName: "Fix writing",
    });
    expect(routed.deliveryStrategy).toBe("review_only");
  });

  it("turns managed natural selection output into paste-send transformed output", () => {
    const runtime: DesktopRuntimeResult = {
      transcript: "en inglés",
      summary: createReviewSummary(),
    };

    const transformed = applySelectionTransformOutputToRuntimeResult({
      runtime,
      output: "hello",
      deliveryStrategy: "paste_send",
      reason: "Managed selection transform replaced the captured selection like Fixvox.",
    });

    expect(transformed.output).toBe("hello");
    expect(transformed.deliveryStrategy).toBe("paste_send");
    expect(getTranscriptReview(transformed.summary as SimulatedRunSummary)).toMatchObject({
      text: "hello",
      source: "selection_transform",
    });
    expect((transformed.summary as SimulatedRunSummary).deliveryEvidence).toMatchObject({
      status: "paste_sent",
      output: "hello",
      reason: "Managed selection transform replaced the captured selection like Fixvox.",
    });
  });

  it("classifies transform failure after STT as selection-transform recovery", () => {
    const recovered = applySelectionTransformFailureToRuntimeResult({
      runtime: {
        transcript: "transcript remains visible",
        summary: createReviewSummary(),
      },
      code: "TRANSFORM_UNAVAILABLE",
    });
    const summary = recovered.summary as SimulatedRunSummary;

    expect(recovered.deliveryStrategy).toBe("review_only");
    expect(recovered.deliveryReason).toContain("Selection transform failed");
    expect(summary.terminalState).toBe("done");
    expect(summary.error).toMatchObject({
      phase: "selection_transform",
      message: expect.stringContaining("Selection transform failed"),
    });
    expect(summary.error?.phase).not.toBe("transcribing");
    expect(summary.deliveryEvidence).toMatchObject({
      status: "available",
      output: "transcript remains visible",
      reason: expect.stringContaining("transcript is available"),
    });
    expect(summary.runtimeTelemetryStages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "selection_transform",
          status: "failed",
          reason: "TRANSFORM_UNAVAILABLE",
          redacted: true,
        }),
      ]),
    );
    expect(getTranscriptReview(summary)).toMatchObject({
      text: "transcript remains visible",
      source: "dictation",
    });
    expect(getReviewCopyLabel(summary)).toBe("Copy transcript");
  });

  it("turns an active selection preset into review-only transformed output", () => {
    const runtime: DesktopRuntimeResult = {
      transcript: "make this clearer",
      summary: createReviewSummary(),
    };
    const selection: SelectionContext = {
      selectionId: "selection-1",
      selectedText: "hola amigo",
      textLength: "hola amigo".length,
      source: "host_capture",
      confidence: "medium",
      redacted: true,
    };

    const transformed = applySelectionTransformToRuntimeResult({
      runtime,
      sessionId: "session-1",
      selection,
      presetId: "corregir-texto",
    });

    expect(transformed.output).toBe("Hola, amigo.");
    expect(transformed.deliveryStrategy).toBe("review_only");
    expect(transformed.deliveryReason).toBe("Selection transform used the active preset without automatic replace-selection.");
    expect((transformed.summary as SimulatedRunSummary).resultSource).toBe("selection_transform");
    expect(getTranscriptReview(transformed.summary as SimulatedRunSummary)).toMatchObject({
      text: "Hola, amigo.",
      source: "selection_transform",
    });
    expect(getReviewCopyLabel(transformed.summary as SimulatedRunSummary)).toBe("Copy transform");
    expect((transformed.summary as SimulatedRunSummary).deliveryEvidence).toEqual({
      status: "available",
      output: "Hola, amigo.",
      reason: "Selection transform used the active preset without automatic replace-selection.",
    });
  });
});

function createReviewSummary(): SimulatedRunSummary {
  return {
    runId: "app-delivery-run",
    fixtureId: "microphone",
    inputKind: "microphone",
    events: [
      {
        type: "transcription_completed",
        runId: "app-delivery-run",
        fixtureId: "microphone",
        at: 1,
        data: {
          transcript: "transcript remains visible",
          latencyMs: 7,
          stt: {
            provider: "host-runtime-fake",
            model: "fake-model",
            mode: "dry-run",
            requestId: "redacted-request",
          },
        },
      },
    ],
    states: ["idle", "listening", "transcribing", "delivering", "done"],
    terminalState: "done",
    transcript: "transcript remains visible",
    output: "transcript remains visible",
    delivery: {
      status: "skipped",
      output: "transcript remains visible",
      reason: "Transcript is available for manual copy.",
    },
    deliveryEvidence: {
      status: "available",
      output: "transcript remains visible",
      reason: "Transcript is available locally. Delivery has not been observed.",
    },
    durationMs: 7,
  };
}
