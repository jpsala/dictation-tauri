import { beforeEach, describe, expect, it } from "vitest";
import {
  buildPresetStructuredInput,
  createSelectionTransformPreset,
  deleteSelectionTransformPreset,
  dumpSelectionTransformPresetStore,
  getSelectionTransformPreset,
  hydrateSelectionTransformPresetStore,
  isSelectionTransformPresetAvailable,
  isSelectionTransformPresetId,
  listSelectionTransformPresetAdminItems,
  listSelectionTransformPresets,
  saveSelectionTransformPreset,
  selectionTransformInstructionForPreset,
  selectionTransformPresetDisplayName,
  selectionTransformPresetIdFromPickerKey,
  selectionTransformPresetIds,
  selectionTransformPresetPickerKey,
} from "../../src/selection-transform";

describe("selection transform presets", () => {
  beforeEach(() => {
    hydrateSelectionTransformPresetStore({ schemaVersion: 2, seedRequired: true, presets: {} });
  });

  it("seeds examples for a first installation", () => {
    expect(selectionTransformPresetIds).toEqual([
      "como-yo-es",
      "corregir-texto",
      "fix-writing",
      "like-me-en",
    ]);
    expect(isSelectionTransformPresetId("como-yo-es")).toBe(true);
    expect(isSelectionTransformPresetId("translate")).toBe(false);
  });

  it("models preset definitions with body, hotkey, and picker key", () => {
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
    expect(selectionTransformInstructionForPreset({ presetId: "fix-writing" })).toContain("[PRESET_TEMPLATE]");
  });

  it("edits seeded examples through the same API as every other preset", () => {
    saveSelectionTransformPreset("like-me-en", {
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
  });

  it("creates and deletes presets without a separate custom category", () => {
    const preset = createSelectionTransformPreset({
      name: "Slack reply",
      pickerKey: "S",
      body: "Make this a short Slack reply.",
      provider: "openrouter",
      model: "test-model",
      confirm: true,
    });

    expect(preset.id).toBe("slack-reply");
    expect(getSelectionTransformPreset(preset.id)).toMatchObject({
      provider: "openrouter",
      model: "test-model",
      confirm: true,
    });
    expect(selectionTransformInstructionForPreset({ presetId: preset.id })).toContain(
      "Make this a short Slack reply.",
    );

    deleteSelectionTransformPreset(preset.id);
    expect(isSelectionTransformPresetId(preset.id)).toBe(false);
    expect(isSelectionTransformPresetAvailable(preset.id)).toBe(false);
  });

  it("deletes an initially seeded example permanently from an initialized store", () => {
    deleteSelectionTransformPreset("corregir-texto");
    const persisted = dumpSelectionTransformPresetStore();

    hydrateSelectionTransformPresetStore(persisted);

    expect(isSelectionTransformPresetId("corregir-texto")).toBe(false);
    expect(isSelectionTransformPresetAvailable("corregir-texto")).toBe(false);
    expect(listSelectionTransformPresetAdminItems().map((preset) => preset.id)).not.toContain("corregir-texto");
  });

  it("keeps disabled presets in administration but removes them from runtime lists", () => {
    saveSelectionTransformPreset("corregir-texto", { enabled: false });

    expect(listSelectionTransformPresetAdminItems().find((preset) => preset.id === "corregir-texto")?.enabled).toBe(false);
    expect(listSelectionTransformPresets().map((preset) => preset.id)).not.toContain("corregir-texto");
    expect(isSelectionTransformPresetId("corregir-texto")).toBe(true);
    expect(isSelectionTransformPresetAvailable("corregir-texto")).toBe(false);
  });

  it("migrates the v1 starter and custom split into one v2 preset map", () => {
    const migrated = hydrateSelectionTransformPresetStore({
      schemaVersion: 1,
      starterCustomizations: {
        "corregir-texto": { name: "Corrección migrada", enabled: false },
      },
      customPresets: {
        "custom-summary": {
          id: "custom-summary",
          name: "Resumen",
          body: "Resumí el texto.",
          hotkey: "",
          pickerKey: "R",
          enabled: true,
          confirm: false,
        },
      },
    });

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.presets["corregir-texto"]).toMatchObject({ name: "Corrección migrada", enabled: false });
    expect(migrated.presets["custom-summary"]).toMatchObject({ name: "Resumen", pickerKey: "R" });
  });

  it("preserves a valid empty v2 store without reseeding examples", () => {
    hydrateSelectionTransformPresetStore({ schemaVersion: 2, presets: {} });

    expect(listSelectionTransformPresetAdminItems()).toEqual([]);
    expect(dumpSelectionTransformPresetStore()).toEqual({ schemaVersion: 2, presets: {} });
  });

  it("builds the structured input contract", () => {
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
