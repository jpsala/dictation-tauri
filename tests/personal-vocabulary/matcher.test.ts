import { describe, expect, it } from "vitest";
import {
  KEEP_ORIGINAL_CANDIDATE_ID,
  applyVocabularyChoices,
  compileVocabularySnapshot,
  matchVocabulary,
  normalizeVocabularyText,
  originalSpanForNormalizedRange,
  resolveVocabulary,
  validateVocabularyRule,
  validateVocabularySnapshot,
  type PersonalVocabularyRule,
  type PersonalVocabularySnapshot,
} from "../../src/personal-vocabulary";

const rule = (
  id: string,
  spoken: string,
  written: string,
  mode: PersonalVocabularyRule["mode"] = "automatic",
  candidates = [{ id: `${id}-candidate`, written }],
): PersonalVocabularyRule => ({
  id,
  revision: "1",
  spoken,
  candidates,
  defaultCandidateId: mode === "automatic" ? candidates[0]?.id : undefined,
  mode,
  enabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const snapshot = (...rules: PersonalVocabularyRule[]): PersonalVocabularySnapshot => ({
  revision: "snapshot-1",
  rules,
});

describe("personal vocabulary normalization", () => {
  it("folds case, accents, compatibility forms, and whitespace while mapping spans", () => {
    const normalized = normalizeVocabularyText("  LÚNA\u00a0  MAX  ");

    expect(normalized.normalized).toBe(" luna max ");
    expect(normalized.spans.length).toBe(normalized.normalized.length);
    expect(normalized.spans[1]).toEqual({ start: 2, end: 3 });
    expect(normalized.spans[4]).toEqual({ start: 5, end: 6 });
    expect(originalSpanForNormalizedRange(normalized, 1, 9)).toEqual({
      start: 2,
      end: 12,
    });
  });

  it("keeps punctuation outside a span", () => {
    const plan = matchVocabulary(
      "Usá Luna MÁS, por favor.",
      snapshot(rule("luna-max", "luna más", "Luna Max")),
    );

    expect(plan.automaticText).toBe("Usá Luna Max, por favor.");
    expect(plan.automatic[0]?.match.matchedText).toBe("Luna MÁS");
    expect(plan.automatic[0]?.match.span).toEqual({ start: 4, end: 12 });
  });
});

describe("personal vocabulary matching", () => {
  it("matches repeated occurrences in one stable single pass", () => {
    const plan = matchVocabulary(
      "luna más y luna MÁS",
      snapshot(rule("luna-max", "luna más", "Luna Max")),
    );

    expect(plan.automatic).toHaveLength(2);
    expect(plan.automaticText).toBe("Luna Max y Luna Max");
    expect(plan.automatic.map((item) => item.match.span.start)).toEqual([0, 11]);
  });

  it("uses longest match and token boundaries", () => {
    const plan = matchVocabulary(
      "max maximum max, premaximum",
      snapshot(
        rule("max", "max", "MAX"),
        rule("maximum", "maximum", "MAXIMUM"),
      ),
    );

    expect(plan.automaticText).toBe("MAX MAXIMUM MAX, premaximum");
    expect(plan.automatic.map((item) => item.match.matchedText)).toEqual([
      "max",
      "maximum",
      "max",
    ]);
  });

  it("does not cascade a replacement into another rule", () => {
    const plan = matchVocabulary(
      "luna más",
      snapshot(
        rule("spoken", "luna más", "Luna Max"),
        rule("canonical", "Luna Max", "LM"),
      ),
    );

    expect(plan.automaticText).toBe("Luna Max");
    expect(plan.automatic).toHaveLength(1);
  });

  it("selects the longer phrase before a shorter overlapping trigger", () => {
    const plan = matchVocabulary(
      "luna más",
      snapshot(
        rule("short", "luna", "LUNA"),
        rule("long", "luna más", "Luna Max"),
      ),
    );

    expect(plan.automaticText).toBe("Luna Max");
    expect(plan.matches).toHaveLength(1);
    expect(plan.matches[0]?.ruleId).toBe("long");
  });

  it("gives a longer trigger priority even when its overlap starts later", () => {
    const plan = matchVocabulary(
      "new york city",
      snapshot(
        rule("short", "new york", "SHORT"),
        rule("long", "york city", "LONGER"),
      ),
    );

    expect(plan.automaticText).toBe("new LONGER");
    expect(plan.automatic.map((item) => item.match.ruleId)).toEqual(["long"]);
    expect(plan.automatic[0]?.match.span).toEqual({ start: 4, end: 13 });
  });

  it("keeps equal-length shifted overlaps stable by source position", () => {
    const plan = matchVocabulary(
      "alpha beta gamma",
      snapshot(
        rule("first", "alpha beta", "FIRST"),
        rule("second", "beta gamma", "SECOND"),
      ),
    );

    expect(plan.automaticText).toBe("FIRST gamma");
    expect(plan.automatic[0]?.match.ruleId).toBe("first");
  });

  it("resolves multiple independent overlap components without suppressing either", () => {
    const plan = matchVocabulary(
      "new york city and red green blue",
      snapshot(
        rule("new-short", "new york", "SHORT"),
        rule("new-long", "york city", "LONGER"),
        rule("colors-short", "red green", "REDGREEN"),
        rule("colors-long", "green blue", "GREENBLUE"),
      ),
    );

    expect(plan.automaticText).toBe("new LONGER and red GREENBLUE");
    expect(plan.automatic.map((item) => item.match.ruleId)).toEqual([
      "new-long",
      "colors-long",
    ]);
  });

  it("keeps stable first-match order for equal-length conflicts", () => {
    const plan = matchVocabulary(
      "luna más",
      snapshot(
        rule("first", "luna más", "First"),
        rule("second", "luna más", "First"),
      ),
    );

    expect(plan.automaticText).toBe("First");
    expect(plan.automatic[0]?.match.ruleId).toBe("first");
  });
});

describe("ask groups", () => {
  it("groups all occurrences and always offers keeping the original", () => {
    const askRule = rule(
      "luna",
      "luna más",
      "Luna Max",
      "ask",
      [
        { id: "max", written: "Luna Max" },
        { id: "macs", written: "Luna Macs" },
      ],
    );
    const plan = matchVocabulary("luna más; luna MÁS", snapshot(askRule));

    expect(plan.automaticText).toBe("luna más; luna MÁS");
    expect(plan.askGroups).toHaveLength(1);
    expect(plan.askGroups[0]?.occurrences).toHaveLength(2);
    expect(plan.askGroups[0]?.includeOriginal).toBe(true);
    expect(
      applyVocabularyChoices(plan, {
        [plan.askGroups[0]!.id]: "max",
      }),
    ).toBe("Luna Max; Luna Max");
    expect(
      applyVocabularyChoices(plan, {
        [plan.askGroups[0]!.id]: KEEP_ORIGINAL_CANDIDATE_ID,
      }),
    ).toBe("luna más; luna MÁS");
  });

  it("groups Ask and Automatic rules at one span before overlap selection", () => {
    const plan = matchVocabulary(
      "luna más",
      snapshot(
        rule("automatic", "luna más", "Luna Max"),
        rule(
          "ask",
          "luna más",
          "Luna Macs",
          "ask",
          [{ id: "macs", written: "Luna Macs" }],
        ),
      ),
    );

    expect(plan.automaticText).toBe("luna más");
    expect(plan.automatic).toHaveLength(0);
    expect(plan.askGroups).toHaveLength(1);
    expect(plan.askGroups[0]?.candidates.map((candidate) => candidate.written)).toEqual([
      "Luna Max",
      "Luna Macs",
    ]);
    const macsId = plan.askGroups[0]!.candidates.find(
      (candidate) => candidate.written === "Luna Macs",
    )!.id;
    expect(
      applyVocabularyChoices(plan, {
        [plan.askGroups[0]!.id]: macsId,
      }),
    ).toBe("Luna Macs");
  });

  it("merges Ask and Ask candidates into one choice group", () => {
    const plan = matchVocabulary(
      "luna más; luna MÁS",
      snapshot(
        rule(
          "first-ask",
          "luna más",
          "Luna Max",
          "ask",
          [{ id: "max", written: "Luna Max" }],
        ),
        rule(
          "second-ask",
          "luna más",
          "Luna Macs",
          "ask",
          [{ id: "macs", written: "Luna Macs" }],
        ),
      ),
    );

    expect(plan.askGroups).toHaveLength(1);
    expect(plan.askGroups[0]?.occurrences).toHaveLength(2);
    expect(plan.askGroups[0]?.candidates.map((candidate) => candidate.written)).toEqual([
      "Luna Max",
      "Luna Macs",
    ]);
    expect(plan.askGroups[0]?.candidates[0]?.id).not.toBe("default");
    expect(plan.askGroups[0]?.candidates[1]?.id).not.toBe("default");
    const macsId = plan.askGroups[0]!.candidates.find(
      (candidate) => candidate.written === "Luna Macs",
    )!.id;
    expect(
      applyVocabularyChoices(plan, {
        [plan.askGroups[0]!.id]: macsId,
      }),
    ).toBe("Luna Macs; Luna Macs");
  });

  it("does not silently apply conflicting automatic rules at one span", () => {
    const plan = matchVocabulary(
      "luna más",
      snapshot(
        rule("first", "luna más", "Luna Max"),
        rule("second", "luna más", "Luna Macs"),
      ),
    );

    expect(plan.automaticText).toBe("luna más");
    expect(plan.automatic).toHaveLength(0);
    expect(plan.askGroups).toHaveLength(1);
    expect(plan.askGroups[0]?.candidates.map((candidate) => candidate.written)).toEqual([
      "Luna Max",
      "Luna Macs",
    ]);
  });

  it("keeps both Ask alternatives when rule-local ids collide", () => {
    const source = snapshot(
      rule(
        "first-ask",
        "luna más",
        "First",
        "ask",
        [{ id: "default", written: "First" }],
      ),
      rule(
        "second-ask",
        "luna más",
        "Second",
        "ask",
        [{ id: "default", written: "Second" }],
      ),
    );
    const plan = matchVocabulary("luna más", source);
    const candidates = plan.askGroups[0]!.candidates;
    const firstId = candidates.find((candidate) => candidate.written === "First")!.id;
    const secondId = candidates.find((candidate) => candidate.written === "Second")!.id;

    expect(candidates).toHaveLength(2);
    expect(firstId).not.toBe(secondId);
    expect(source.rules[0]!.candidates[0]!.id).toBe("default");
    expect(source.rules[1]!.candidates[0]!.id).toBe("default");
    expect(
      applyVocabularyChoices(plan, {
        [plan.askGroups[0]!.id]: firstId,
      }),
    ).toBe("First");
    expect(
      applyVocabularyChoices(plan, {
        [plan.askGroups[0]!.id]: secondId,
      }),
    ).toBe("Second");
  });

  it("keeps both conflicting automatic alternatives with local default ids", () => {
    const source = snapshot(
      rule(
        "first-auto",
        "luna más",
        "First",
        "automatic",
        [{ id: "default", written: "First" }],
      ),
      rule(
        "second-auto",
        "luna más",
        "Second",
        "automatic",
        [{ id: "default", written: "Second" }],
      ),
    );
    const plan = matchVocabulary("luna más", source);
    const candidates = plan.askGroups[0]!.candidates;
    const firstId = candidates.find((candidate) => candidate.written === "First")!.id;
    const secondId = candidates.find((candidate) => candidate.written === "Second")!.id;

    expect(candidates).toHaveLength(2);
    expect(firstId).not.toBe(secondId);
    expect(
      applyVocabularyChoices(plan, {
        [plan.askGroups[0]!.id]: firstId,
      }),
    ).toBe("First");
    expect(
      applyVocabularyChoices(plan, {
        [plan.askGroups[0]!.id]: secondId,
      }),
    ).toBe("Second");
    expect(source.rules[0]!.candidates[0]!.id).toBe("default");
    expect(source.rules[1]!.candidates[0]!.id).toBe("default");
  });

  it("deduplicates equivalent combined alternatives by exact written text", () => {
    const plan = matchVocabulary(
      "luna más",
      snapshot(
        rule(
          "first-ask",
          "luna más",
          "Luna Max",
          "ask",
          [{ id: "default", written: "Luna Max" }],
        ),
        rule(
          "second-ask",
          "luna más",
          "Luna Max",
          "ask",
          [{ id: "default", written: "Luna Max" }],
        ),
      ),
    );

    expect(plan.askGroups).toHaveLength(1);
    expect(plan.askGroups[0]?.candidates).toHaveLength(1);
    const choiceId = plan.askGroups[0]!.candidates[0]!.id;
    expect(
      applyVocabularyChoices(plan, {
        [plan.askGroups[0]!.id]: choiceId,
      }),
    ).toBe("Luna Max");
  });
});

describe("rule validation and immutable snapshots", () => {
  it("warns and requires explicit confirmation for short automatic triggers", () => {
    const shortRule = rule("max", "max", "MAX");
    expect(validateVocabularyRule(shortRule).ok).toBe(false);
    expect(
      validateVocabularyRule(shortRule).errors.some(
        (error) => error.code === "automatic-confirmation-required",
      ),
    ).toBe(true);
    expect(
      validateVocabularyRule(shortRule, { automaticConfirmed: true }).ok,
    ).toBe(true);
  });

  it("rejects conflicting automatic rules at the save boundary", () => {
    const result = validateVocabularySnapshot(
      snapshot(
        rule("one", "Lúna", "One"),
        rule("two", "luna", "Two"),
      ),
      { automaticConfirmed: true },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === "automatic-conflict")).toBe(
      true,
    );
  });

  it("copies and freezes the snapshot without mutating caller data", () => {
    const sourceRule = rule("luna-max", "luna más", "Luna Max");
    const source = snapshot(sourceRule);
    const compiled = compileVocabularySnapshot(source);

    expect(compiled.snapshot).not.toBe(source);
    expect(Object.isFrozen(compiled.snapshot)).toBe(true);
    expect(Object.isFrozen(compiled.snapshot.rules)).toBe(true);
    expect(Object.isFrozen(compiled.snapshot.rules[0]!.candidates)).toBe(true);
  });

  it("resolves automatic output through the public one-shot helper", () => {
    expect(
      resolveVocabulary("luna más", snapshot(rule("luna-max", "luna más", "Luna Max"))),
    ).toBe("Luna Max");
  });
});
