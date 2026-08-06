
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeachCorrectionForm } from "../../src/personal-vocabulary/TeachCorrectionForm";

describe("TeachCorrectionForm reconciliation prompt", () => {
  it("offers replace and add-alternative choices before the mutation", () => {
    const html = renderToStaticMarkup(
      <TeachCorrectionForm
        session={{
          sessionId: "teach-correction-test",
          spoken: "jota",
          selectionLength: 4,
          selectionTruncated: false,
        }}
        conflict={{
          action: "replace_and_remember",
          conflict: {
            ruleId: "rule-jota",
            revision: "19",
            spoken: "jota",
            candidates: ["old"],
          },
        }}
        onCancel={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(html).toContain("Reemplazar salida");
    expect(html).toContain("Agregar alternativa y preguntar");
    expect(html).toContain("Revisión 19");
    expect(html).toContain("old");
  });
});
