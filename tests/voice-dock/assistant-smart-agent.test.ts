import { describe, expect, it } from "vitest";
import { runAssistantSmartAgentTurn, type AssistantSmartAgentPreset } from "../../src/assistant/smart-agent";

const presets: AssistantSmartAgentPreset[] = [
  { id: "corregir-texto", name: "Corregir texto", description: "Corrige gramática, ortografía y claridad." },
  { id: "fix-writing", name: "Fix writing", description: "Fix grammar, spelling, and clarity." },
  { id: "jp-es", name: "JP español", description: "Reescribe texto como JP en español." },
  { id: "jp-en", name: "JP English", description: "Rewrite text like JP in English." },
];

describe("assistant Smart Agent minimum preset loop", () => {
  it("ignores empty or unknown prompts without tool side effects", () => {
    for (const prompt of ["", "what is two plus two"] as const) {
      const result = runAssistantSmartAgentTurn(prompt, { presets });

      expect(result).toMatchObject({
        handled: false,
        toolCalls: [],
        toolResults: [],
      });
      expect(result.intent).toBeUndefined();
    }
  });

  it("returns a recoverable error when an activation request has no matching preset", () => {
    const result = runAssistantSmartAgentTurn("activa el preset de jp", { presets: [] });

    expect(result.handled).toBe(true);
    expect(result.toolCalls).toEqual([{ name: "preset.activate", args: { presetId: "", presetName: "" } }]);
    expect(result.toolResults).toMatchObject([{ name: "preset.activate", ok: false }]);
    expect(result.intent).toEqual({
      kind: "error",
      message: "No encontré ese preset para activar.",
      recoverable: true,
    });
  });

  it("looks up the active preset through a typed tool and compact notify intent", () => {
    const result = runAssistantSmartAgentTurn("que preset esta activo", {
      activePresetId: "corregir-texto",
      presets,
    });

    expect(result.toolCalls).toEqual([{ name: "preset.getActive", args: {} }]);
    expect(result.toolResults).toMatchObject([{ name: "preset.getActive", ok: true }]);
    expect(result.intent).toEqual({
      kind: "notify",
      level: "info",
      message: "Preset activo: Corregir texto.",
    });
  });

  it("plans fuzzy preset activation as a typed tool action and records state", () => {
    const result = runAssistantSmartAgentTurn("entonces activa el que arregla el texto", { presets });

    expect(result.toolCalls).toEqual([
      { name: "preset.activate", args: { presetId: "corregir-texto", presetName: "Corregir texto" } },
    ]);
    expect(result.intent).toEqual({
      kind: "toolAction",
      tool: "preset.activate",
      args: { presetId: "corregir-texto", presetName: "Corregir texto" },
      confirmation: "none",
    });
    expect(result.state.lastActivatedPresetId).toBe("corregir-texto");
  });

  it("uses previous state for English variant follow-up", () => {
    const first = runAssistantSmartAgentTurn("activa el que arregla el texto", { presets });
    const second = runAssistantSmartAgentTurn("no, el otro en ingles", {
      presets,
      state: first.state,
    });

    expect(second.toolCalls).toEqual([
      { name: "preset.activate", args: { presetId: "fix-writing", presetName: "Fix writing" } },
    ]);
    expect(second.state.lastActivatedPresetId).toBe("fix-writing");
  });

  it("interrupts ambiguous preset requests with optionPicker instead of guessing", () => {
    const result = runAssistantSmartAgentTurn("activa el preset de jp", { presets });

    expect(result.toolCalls[0]).toMatchObject({ name: "optionPicker" });
    expect(result.toolResults[0]?.interrupt).toEqual({
      kind: "optionPicker",
      title: "Elegir preset",
      prompt: "Encontré más de un preset para JP.",
      options: [
        { id: "jp-es", label: "JP español", description: "Reescribe texto como JP en español." },
        { id: "jp-en", label: "JP English", description: "Rewrite text like JP in English." },
      ],
    });
    expect(result.intent).toEqual(result.toolResults[0]?.interrupt);
  });
});
