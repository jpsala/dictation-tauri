import { describe, expect, it } from "vitest";
import { createAssistantIntentResult } from "../../src/assistant/quick-response";
import type { AssistantIntentResult } from "../../src/assistant/intent-result";

const presets = [
  { id: "corregir-texto", name: "Corregir texto" },
  { id: "fix-writing", name: "Fix writing" },
  { id: "jp-es", name: "JP español" },
  { id: "jp-en", name: "JP English" },
];

function expectIntent(result: AssistantIntentResult): AssistantIntentResult {
  return result;
}

describe("assistant intent routing matrix", () => {
  it("routes arithmetic to insertText so delivery can paste normally without companion", () => {
    expect(expectIntent(createAssistantIntentResult("Lulu, cuanto es 2+2"))).toEqual({
      kind: "insertText",
      text: "4",
      reason: "assistant-arithmetic",
    });
    expect(expectIntent(createAssistantIntentResult("Lulu, what is two plus two"))).toEqual({
      kind: "insertText",
      text: "4",
      reason: "assistant-arithmetic",
    });
  });

  it("routes preset status to compact notify, not recovery or Quick Chat", () => {
    expect(
      expectIntent(createAssistantIntentResult("Lulu, que preset esta activo?", {
        activePresetName: "Corregir texto",
        availablePresets: presets,
      })),
    ).toEqual({
      kind: "notify",
      level: "info",
      message: "Preset activo: Corregir texto.",
    });
  });

  it("routes fuzzy preset activation through a typed tool action", () => {
    expect(
      expectIntent(createAssistantIntentResult("Entonces activa el que arregla el texto", { availablePresets: presets })),
    ).toEqual({
      kind: "toolAction",
      tool: "preset.activate",
      args: { presetId: "corregir-texto", presetName: "Corregir texto" },
      confirmation: "none",
    });
  });

  it("uses previous preset state for the English variant follow-up", () => {
    expect(
      expectIntent(createAssistantIntentResult("No, el otro en ingles", {
        availablePresets: presets,
        lastActivatedPresetId: "corregir-texto",
      })),
    ).toEqual({
      kind: "toolAction",
      tool: "preset.activate",
      args: { presetId: "fix-writing", presetName: "Fix writing" },
      confirmation: "none",
    });
  });

  it("routes ambiguous JP preset activation to optionPicker instead of guessing", () => {
    expect(
      expectIntent(createAssistantIntentResult("Lulu, activa el preset de JP", { availablePresets: presets })),
    ).toEqual({
      kind: "optionPicker",
      title: "Elegir preset",
      prompt: "Encontré más de un preset para JP.",
      options: [
        { id: "jp-es", label: "JP español" },
        { id: "jp-en", label: "JP English" },
      ],
    });
  });

  it("opens Quick Chat only for explicit handoff language", () => {
    expect(expectIntent(createAssistantIntentResult("Lulu, segui esto en quick chat"))).toEqual({
      kind: "quickChat",
      initialUserText: "segui esto en quick chat",
    });
    expect(expectIntent(createAssistantIntentResult("Lulu, continue this in quick chat"))).toEqual({
      kind: "quickChat",
      initialUserText: "continue this in quick chat",
    });
  });

  it("routes memory or context questions to markdown/rich surface, not paste", () => {
    expect(expectIntent(createAssistantIntentResult("Lulu, qué tenés en memoria/contexto?"))).toEqual({
      kind: "showMarkdown",
      title: "Contexto de Lulu",
      markdown: expect.stringContaining("memoria/contexto"),
    });
  });

  it("does not use Quick Chat as the universal fallback", () => {
    expect(expectIntent(createAssistantIntentResult("Lulu, explicame brevemente el modo asistente"))).toEqual({
      kind: "toolAction",
      tool: "run_assistant_chat",
      args: { prompt: "explicame brevemente el modo asistente" },
      confirmation: "none",
    });
  });
});
