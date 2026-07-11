import { describe, expect, it } from "vitest";
import { createAssistantQuickResponse } from "../../src/assistant/quick-response";

describe("assistant quick response", () => {
  it("answers simple spoken arithmetic as an insertable Fixvox-like result", () => {
    expect(createAssistantQuickResponse("cuanto es dos mas dos")).toMatchObject({
      handledLocally: true,
      intent: "insert-answer",
      text: "4",
    });
    expect(createAssistantQuickResponse("cuanto es 8 / 2")).toMatchObject({
      handledLocally: true,
      intent: "insert-answer",
      text: "4",
    });
  });

  it("activates the Spanish fix-writing preset from Fixvox-like fuzzy follow-up", () => {
    expect(
      createAssistantQuickResponse("Entonces activa el que arregla el texto", {
        availablePresets: [
          { id: "corregir-texto", name: "Corregir texto" },
          { id: "fix-writing", name: "Fix writing" },
        ],
      }),
    ).toMatchObject({
      handledLocally: true,
      intent: "activate-preset",
      action: { kind: "activate-preset", presetId: "corregir-texto" },
    });
  });

  it("activates the English fix-writing preset when English is explicit", () => {
    expect(
      createAssistantQuickResponse("activa el que arregla texto en ingles", {
        availablePresets: [
          { id: "corregir-texto", name: "Corregir texto" },
          { id: "fix-writing", name: "Fix writing" },
        ],
      }),
    ).toMatchObject({
      handledLocally: true,
      intent: "activate-preset",
      action: { kind: "activate-preset", presetId: "fix-writing" },
    });
  });

  it("keeps cloud login commands gated instead of starting external auth", () => {
    expect(createAssistantQuickResponse("Lulu conectame a Fixvox Cloud")).toMatchObject({
      handledLocally: true,
      intent: "gated-external",
      text: expect.stringContaining("requiere confirmacion explicita"),
    });
  });

  it("opens Settings for cloud status questions without mutating cloud state", () => {
    expect(createAssistantQuickResponse("mostrame el estado de Fixvox Cloud")).toMatchObject({
      handledLocally: true,
      intent: "cloud-status",
      action: { kind: "open-settings" },
    });
  });
});
