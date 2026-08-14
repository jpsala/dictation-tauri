import { describe, expect, test } from "bun:test";
import { buildProsodyHints } from "./audio-prosody";

describe("buildProsodyHints", () => {
  test("ports the canonical Fixvox pause thresholds and guidance", () => {
    const hints = buildProsodyHints([
      { word: "Bueno", start: 0, end: 0.2 },
      { word: "esto", start: 0.2, end: 1.8 },
      { word: "funciona", start: 1.8, end: 4 },
    ]);

    expect(hints).toContain('After "esto": ~1200ms pause → might indicate sentence break');
    expect(hints).toContain('After "funciona": ~1700ms pause → might indicate new paragraph/topic');
    expect(hints).toContain("(2 pause(s) detected, ~2700ms total silence)");
    expect(hints).toContain("prioritize semantic context and natural flow");
  });

  test("fails closed for absent or malformed word timestamps", () => {
    expect(buildProsodyHints(undefined)).toBeUndefined();
    expect(buildProsodyHints([{ word: "private", start: 4, end: 2 }])).toBeUndefined();
    expect(buildProsodyHints([{ word: "normal", start: 0, end: 0.2 }])).toBeUndefined();
  });
});
