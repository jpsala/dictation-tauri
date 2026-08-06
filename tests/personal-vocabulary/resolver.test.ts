
import { describe, expect, it } from "vitest";
import {
  KEEP_ORIGINAL_CANDIDATE_ID,
  VocabularyPreDeliveryCoordinator,
  resolveVocabularyPreDelivery,
} from "../../src/personal-vocabulary";
import type { PersonalVocabularyRule, PersonalVocabularySnapshot } from "../../src/personal-vocabulary";

function rule(input: {
  id: string;
  spoken: string;
  mode: "automatic" | "ask";
  candidates: Array<{ id: string; written: string }>;
  defaultCandidateId?: string;
}): PersonalVocabularyRule {
  return {
    id: input.id,
    revision: "rule-1",
    spoken: input.spoken,
    mode: input.mode,
    enabled: true,
    candidates: input.candidates,
    ...(input.defaultCandidateId ? { defaultCandidateId: input.defaultCandidateId } : {}),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function snapshot(rules: PersonalVocabularyRule[]): PersonalVocabularySnapshot {
  return { revision: "snapshot-1", rules };
}

describe("vocabulary pre-delivery resolver", () => {
  it("applies automatic rules without creating a choice session", () => {
    const result = resolveVocabularyPreDelivery({
      sessionId: "session-auto",
      text: "acme",
      snapshot: snapshot([
        rule({
          id: "acme",
          spoken: "acme",
          mode: "automatic",
          candidates: [{ id: "canonical", written: "ACME" }],
          defaultCandidateId: "canonical",
        }),
      ]),
    });

    expect(result).toMatchObject({ outcome: "automatic", text: "ACME" });
    expect(result.session).toBeUndefined();
    expect(result.telemetry).toMatchObject({
      outcome: "automatic",
      snapshotRevision: "snapshot-1",
      automaticCount: 1,
      redacted: true,
    });
  });

  it("waits for ask choices and resolves repeated occurrences as one group", () => {
    const vocabulary = snapshot([
      rule({
        id: "lulu",
        spoken: "lulu",
        mode: "ask",
        candidates: [
          { id: "brand", written: "Lulu" },
          { id: "lower", written: "lulu" },
        ],
      }),
    ]);
    const resolver = new VocabularyPreDeliveryCoordinator();
    const waiting = resolver.begin({
      sessionId: "session-ask",
      text: "lulu y lulu",
      snapshot: vocabulary,
    });

    expect(waiting.outcome).toBe("waiting_for_choice");
    expect(waiting.session?.view).toMatchObject({
      statusText: "Esperando elección",
      groupCount: 1,
      pendingOccurrences: 2,
    });
    const groupId = waiting.session?.view.group.id;
    expect(groupId).toBeTruthy();

    const resolved = resolver.choose({ groupId: groupId!, choice: "brand" });
    expect(resolved).toMatchObject({ outcome: "resolved", text: "Lulu y Lulu" });
  });

  it("presents multiple ask groups sequentially and keeps originals on cancel", () => {
    const resolver = new VocabularyPreDeliveryCoordinator();
    const waiting = resolver.begin({
      sessionId: "session-sequential",
      text: "alpha beta",
      snapshot: snapshot([
        rule({
          id: "alpha",
          spoken: "alpha",
          mode: "ask",
          candidates: [{ id: "a", written: "ALPHA" }],
        }),
        rule({
          id: "beta",
          spoken: "beta",
          mode: "ask",
          candidates: [{ id: "b", written: "BETA" }],
        }),
      ]),
    });
    expect(waiting.session?.view.group.trigger).toBe("alpha");

    const next = resolver.choose({
      groupId: waiting.session!.view.group.id,
      choice: KEEP_ORIGINAL_CANDIDATE_ID,
    });
    expect(next.outcome).toBe("waiting_for_choice");
    expect(next.session?.view.group.trigger).toBe("beta");

    const cancelled = resolver.cancel();
    expect(cancelled).toMatchObject({ outcome: "cancelled", text: "alpha beta" });
    expect(resolver.session).toBeUndefined();
  });

  it("does not resolve selection transforms or assistant output", () => {
    const vocabulary = snapshot([
      rule({
        id: "term",
        spoken: "term",
        mode: "automatic",
        candidates: [{ id: "canonical", written: "CANONICAL" }],
        defaultCandidateId: "canonical",
      }),
    ]);

    for (const source of ["selection_transform", "assistant"] as const) {
      const result = resolveVocabularyPreDelivery({
        sessionId: `session-${source}`,
        text: "term",
        source,
        snapshot: vocabulary,
      });
      expect(result).toMatchObject({ outcome: "skipped", text: "term" });
      expect(result.telemetry.reason).toBe("excluded_source");
    }
  });

  it("keeps a partial choice session on the original snapshot and redacts telemetry", () => {
    const hostSnapshot = snapshot([
      rule({
        id: "term",
        spoken: "term",
        mode: "ask",
        candidates: [{ id: "canonical", written: "CANONICAL" }],
      }),
      rule({
        id: "other",
        spoken: "other",
        mode: "ask",
        candidates: [{ id: "other-canonical", written: "OTHER" }],
      }),
    ]);
    const waiting = resolveVocabularyPreDelivery({
      sessionId: "session-snapshot",
      text: "term other",
      snapshot: hostSnapshot,
      choices: { "ask:term": "canonical" },
    });

    expect(waiting.outcome).toBe("waiting_for_choice");
    expect(waiting.text).toBe("CANONICAL other");
    expect(waiting.session?.view.group.trigger).toBe("other");
    expect(waiting.session?.choices.get("ask:term")).toBe("canonical");
    expect(JSON.stringify(waiting.telemetry)).not.toContain("term");
    (hostSnapshot.rules[0]!.candidates[0] as { written: string }).written = "MUTATED";
    const termGroup = waiting.session?.plan.askGroups.find((group) => group.id === "ask:term");
    expect(termGroup?.candidates[0]?.written).toBe("CANONICAL");
  });
});
