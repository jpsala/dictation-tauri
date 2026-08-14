import { describe, expect, test } from "bun:test";

import { evaluatePostprocessSemanticSafety } from "./postprocess-semantic-safety";

describe("postprocess semantic safety", () => {
  test("falls back when a material tail is omitted", () => {
    const raw = "Comparable con diferencias sutiles. Fin de muestra.";
    const candidate = "Comparable con diferencias sutiles.";

    const result = evaluatePostprocessSemanticSafety(raw, candidate);

    expect(result.text).toBe(raw);
    expect(result.receipt).toMatchObject({
      decision: "fallback",
      reasons: ["material_omission"],
      alignment: { omissions: 3, additions: 0, trailingOmissions: 3 },
    });
  });

  test("falls back when dictation is replaced by a novel answer", () => {
    const raw = "Después de la lista, explica cuál modelo conserva mejor los nombres técnicos. Fin de la muestra.";
    const candidate = "El modelo nuevo conserva mejor los nombres técnicos porque responde correctamente.";

    const result = evaluatePostprocessSemanticSafety(raw, candidate);

    expect(result.text).toBe(raw);
    expect(result.receipt.decision).toBe("fallback");
    expect(result.receipt.reasons).toEqual([
      "material_omission",
      "unsupported_addition",
      "semantic_transformation",
    ]);
    expect(result.receipt.alignment.omissions).toBeGreaterThan(0);
    expect(result.receipt.alignment.additions).toBeGreaterThan(0);
  });

  test("accepts conservative punctuation, list formatting, fillers, casing, and technical corrections", () => {
    const raw = "Eh lista. Uno, Fixbox. Dos, app svelte. Fin de la lista.";
    const candidate = "Lista:\n1. Fixvox.\n2. app.svelte.\nFin de la lista.";

    const result = evaluatePostprocessSemanticSafety(raw, candidate);

    expect(result.text).toBe(candidate);
    expect(result.receipt).toMatchObject({
      decision: "accepted",
      reasons: [],
      alignment: { omissions: 0, additions: 0 },
      redacted: true,
    });
    expect(JSON.stringify(result.receipt)).not.toContain("Fixbox");
    expect(JSON.stringify(result.receipt)).not.toContain("Fixvox");
  });

  test("falls back on an empty candidate", () => {
    const result = evaluatePostprocessSemanticSafety("Texto material.", "  ");
    expect(result.receipt.decision).toBe("fallback");
    expect(result.receipt.reasons).toContain("empty_candidate");
    expect(result.text).toBe("Texto material.");
  });
  test("falls back before quadratic alignment on oversized inputs", () => {
    const raw = Array.from({ length: 513 }, (_, index) => `token${index}`).join(" ");
    const result = evaluatePostprocessSemanticSafety(raw, raw);
    expect(result.receipt).toMatchObject({
      decision: "fallback",
      reasons: ["comparison_limit_exceeded"],
      alignment: { rawTokenCount: 513, candidateTokenCount: 513 },
      redacted: true,
    });
    expect(result.text).toBe(raw);
  });

});
