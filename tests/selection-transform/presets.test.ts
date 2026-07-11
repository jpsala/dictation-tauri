import { describe, expect, it } from "vitest";
import {
  buildPresetStructuredInput,
  createSelectionTransformCustomPreset,
  deleteSelectionTransformCustomPreset,
  getSelectionTransformPreset,
  isSelectionTransformPresetId,
  listSelectionTransformPresetAdminItems,
  listSelectionTransformPresets,
  resetSelectionTransformPresetCustomization,
  saveSelectionTransformPresetCustomization,
  selectionTransformInstructionForPreset,
  selectionTransformPresetDisplayName,
  selectionTransformPresetIdFromPickerKey,
  selectionTransformPresetIds,
  selectionTransformPresetPickerKey,
} from "../../src/selection-transform";

function installLocalStorageMock() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
  } as Storage;
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
  return storage;
}

describe("selection transform presets", () => {
  it("exposes the current Fixvox starter preset set for the dock and companion", () => {
    expect(selectionTransformPresetIds).toEqual([
      "como-yo-es",
      "corregir-texto",
      "fix-writing",
      "like-me-en",
    ]);
    expect(isSelectionTransformPresetId("como-yo-es")).toBe(true);
    expect(isSelectionTransformPresetId("translate")).toBe(false);
  });

  it("models Fixvox preset definitions with body, hotkey, and picker key", () => {
    expect(listSelectionTransformPresets()).toMatchObject([
      { id: "como-yo-es", name: "Como yo (español)", hotkey: "Alt+T, Y", pickerKey: "Y" },
      { id: "corregir-texto", name: "Corregir texto", hotkey: "Alt+T, C", pickerKey: "C" },
      { id: "fix-writing", name: "Fix Writing", hotkey: "Ctrl+Alt+F", pickerKey: "F" },
      { id: "like-me-en", name: "Like me (English)", hotkey: "Alt+T, L", pickerKey: "L" },
    ]);
    expect(getSelectionTransformPreset("como-yo-es").body).toContain("developer argentino");
    expect(selectionTransformPresetPickerKey("like-me-en")).toBe("L");
    expect(selectionTransformPresetIdFromPickerKey("c")).toBe("corregir-texto");
  });

  it("maps presets to user-facing names", () => {
    expect(selectionTransformPresetDisplayName("como-yo-es")).toBe("Como yo (español)");
    expect(selectionTransformPresetDisplayName("fix-writing")).toBe("Fix Writing");
  });

  it("turns a selected preset into a managed transform instruction", () => {
    expect(
      selectionTransformInstructionForPreset({
        presetId: "corregir-texto",
        dictatedInstruction: "mantener voseo",
      }),
    ).toContain("Corregí la gramática");
    const likeMeEnglishInstruction = selectionTransformInstructionForPreset({ presetId: "like-me-en" });
    expect(likeMeEnglishInstruction).toContain("Rewrite this text as JP would write it in English");
    expect(likeMeEnglishInstruction).toContain("Always return English text");
    expect(
      selectionTransformInstructionForPreset({ presetId: "fix-writing" }),
    ).toContain("[PRESET_TEMPLATE]");
  });

  it("allows local admin customizations for starter presets", () => {
    installLocalStorageMock();

    saveSelectionTransformPresetCustomization("like-me-en", {
      name: "Like JP in English",
      pickerKey: "j",
      body: "Always return English, JP style.",
    });

    expect(getSelectionTransformPreset("like-me-en")).toMatchObject({
      name: "Like JP in English",
      pickerKey: "J",
      body: "Always return English, JP style.",
    });
    expect(selectionTransformInstructionForPreset({ presetId: "like-me-en" })).toContain(
      "Always return English, JP style.",
    );
    expect(listSelectionTransformPresetAdminItems().find((preset) => preset.id === "like-me-en")?.isCustomized).toBe(true);

    resetSelectionTransformPresetCustomization("like-me-en");
    expect(getSelectionTransformPreset("like-me-en").name).toBe("Like me (English)");
  });

  it("adds and deletes local custom presets", () => {
    installLocalStorageMock();

    const customPreset = createSelectionTransformCustomPreset({
      name: "Slack reply",
      pickerKey: "S",
      body: "Make this a short Slack reply.",
      provider: "openrouter",
      model: "test-model",
      confirm: true,
    });

    expect(customPreset.id).toMatch(/^custom-slack-reply/);
    expect(isSelectionTransformPresetId(customPreset.id)).toBe(true);
    expect(listSelectionTransformPresets().map((preset) => preset.id)).toContain(customPreset.id);
    expect(getSelectionTransformPreset(customPreset.id)).toMatchObject({
      provider: "openrouter",
      model: "test-model",
      confirm: true,
    });
    expect(selectionTransformInstructionForPreset({ presetId: customPreset.id })).toContain(
      "Make this a short Slack reply.",
    );
    expect(listSelectionTransformPresetAdminItems().find((preset) => preset.id === customPreset.id)?.canDelete).toBe(true);

    deleteSelectionTransformCustomPreset(customPreset.id);
    expect(isSelectionTransformPresetId(customPreset.id)).toBe(false);
  });

  it("builds the Fixvox-style structured input contract", () => {
    const input = buildPresetStructuredInput({
      presetId: "corregir-texto",
      sourceText: "hola amigo",
      sourceKind: "selected_text",
      context: "preset-transform",
    });

    expect(input).toContain("[CONTROL]");
    expect(input).toContain("output_mode=solo_texto");
    expect(input).toContain("preset_name=Corregir texto");
    expect(input).toContain("[SOURCE_TEXT]\nhola amigo\n[/SOURCE_TEXT]");
  });
});
