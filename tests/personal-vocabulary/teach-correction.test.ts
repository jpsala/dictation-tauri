
import { describe, expect, it } from "vitest";
import { validateMutationInput } from "../../cloud/fixvox-api/src/personal-vocabulary";
import {
  createTeachCorrectionDraft,
  findVocabularyRuleForSpoken,
  normalizeTeachCorrectionDraft,
  saveTeachCorrection,
  buildTeachCorrectionMutation,
  createTeachCorrectionDraftFromRule,
  summarizeTeachCorrectionConflict,
  validateTeachCorrectionDraft,
  type TeachCorrectionDraft,
  type VocabularyClient,
} from "../../src/personal-vocabulary/teach-correction";
import type {
  PersonalVocabularyRule,
  PersonalVocabularySnapshot,
} from "../../src/personal-vocabulary/types";

const snapshot: PersonalVocabularySnapshot = {
  revision: "7",
  rules: [],
};

const draft = (patch: Partial<TeachCorrectionDraft> = {}): TeachCorrectionDraft => ({
  spoken: "jota",
  written: "JP",
  alternatives: [],
  mode: "ask",
  automaticConfirmed: false,
  ...patch,
});

const rule: PersonalVocabularyRule = {
  id: "rule-jota",
  revision: "7",
  spoken: "jota",
  candidates: [{ id: "candidate-primary", written: "JP" }],
  defaultCandidateId: "candidate-primary",
  mode: "ask",
  enabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function clientWith(overrides: Partial<{
  create: VocabularyClient["createRule"];
  update: VocabularyClient["updateRule"];
  refresh: VocabularyClient["refresh"];
  replace: VocabularyClient["replaceCapturedSelection"];
}> = {}): VocabularyClient {
  return {
    readSnapshot: async () => snapshot,
    createRule: overrides.create ?? (async () => ({ rule, vocabularyRevision: "8" })),
    updateRule: overrides.update ?? (async () => ({ rule, vocabularyRevision: "8" })),
    deleteRule: async () => ({ vocabularyRevision: "8" }),
    refresh: overrides.refresh ?? (async () => ({ status: "updated" })),
    replaceCapturedSelection: overrides.replace ?? (async () => ({
      status: "replaced",
      reason: "matched",
    })),
  };
}

describe("teach correction save boundary", () => {
  it("reconciles an existing normalized trigger by exact ID/revision", async () => {
    const existing: PersonalVocabularyRule = {
      ...rule,
      id: "rule-existing",
      revision: "19",
      spoken: " Jota ",
      candidates: [{ id: "candidate-old", written: "old" }],
      defaultCandidateId: "candidate-old",
    };
    const existingSnapshot: PersonalVocabularySnapshot = {
      revision: "31",
      rules: [existing],
    };
    const calls: Array<{ ruleId: string; expectedRevision: string }> = [];
    let created = false;
    const result = await saveTeachCorrection({
      draft: draft({ spoken: "jota", written: "new" }),
      snapshot: existingSnapshot,
      action: "remember_only",
      existingRule: findVocabularyRuleForSpoken(existingSnapshot, "jota"),
      conflictChoice: "replace",
    }, clientWith({
      create: async () => {
        created = true;
        return { rule, vocabularyRevision: "32" };
      },
      update: async (input) => {
        calls.push({ ruleId: input.ruleId, expectedRevision: input.expectedRevision });
        return { rule: existing, vocabularyRevision: "32" };
      },
    }));

    expect(result.status).toBe("saved_only");
    expect(created).toBe(false);
    expect(calls).toEqual([{ ruleId: "rule-existing", expectedRevision: "19" }]);
  });

  it("adds a new candidate in Preguntar without replacing the existing default", () => {
    const existing: PersonalVocabularyRule = {
      ...rule,
      candidates: [{ id: "candidate-old", written: "old" }],
      defaultCandidateId: "candidate-old",
    };
    const mutation = buildTeachCorrectionMutation(
      draft({ spoken: "jota", written: "new", mode: "automatic" }),
      { existingRule: existing, conflictChoice: "add_alternative" },
    );

    expect(mutation.mode).toBe("ask");
    expect(mutation.defaultCandidateId).toBe("candidate-old");
    expect(mutation.candidates.map((candidate) => candidate.written)).toEqual(["old", "new"]);
    expect(summarizeTeachCorrectionConflict(existing)).toMatchObject({
      ruleId: "rule-jota",
      revision: "7",
      candidates: ["old"],
    });
  });

  it("allocates unique candidate IDs and preserves exact whitespace through the cloud validator", () => {
    const initialDraft = createTeachCorrectionDraft("  jota  ");
    const initialMutation = buildTeachCorrectionMutation({
      ...initialDraft,
      written: "  JP  ",
    });
    const initialRule: PersonalVocabularyRule = {
      ...rule,
      id: "rule-form-initial",
      revision: "8",
      spoken: initialMutation.spoken,
      candidates: initialMutation.candidates.map((candidate, index) => ({
        id: candidate.id ?? `candidate-initial-${index + 1}`,
        written: candidate.written,
      })),
      defaultCandidateId: initialMutation.defaultCandidateId ?? undefined,
    };
    const mutation = buildTeachCorrectionMutation({
      ...initialDraft,
      written: "  JP nuevo  ",
      alternatives: ["  JP alternativo  "],
    }, {
      existingRule: initialRule,
      conflictChoice: "add_alternative",
    });
    const validated = validateMutationInput(mutation);
    const candidateIds = mutation.candidates.map((candidate) => candidate.id);

    expect(candidateIds).toHaveLength(new Set(candidateIds).size);
    expect(candidateIds).toEqual([
      "candidate-primary",
      "candidate-alternative-1",
      "candidate-alternative-2",
    ]);
    expect(mutation.candidates.map((candidate) => candidate.written)).toEqual([
      "  JP  ",
      "  JP nuevo  ",
      "  JP alternativo  ",
    ]);
    expect(validated.spoken).toBe("  jota  ");
    expect(validated.candidates?.map((candidate) => candidate.written)).toEqual([
      "  JP  ",
      "  JP nuevo  ",
      "  JP alternativo  ",
    ]);
    expect(validated.candidates?.map((candidate) => candidate.id)).toEqual(candidateIds);
  });

  it("trims only empty checks while retaining draft text whitespace", () => {
    const normalized = normalizeTeachCorrectionDraft({
      spoken: "  jota  ",
      written: "  JP  ",
      alternatives: ["  alternativa  "],
      mode: "ask",
      automaticConfirmed: false,
    });

    expect(normalized.spoken).toBe("  jota  ");
    expect(normalized.written).toBe("  JP  ");
    expect(normalized.alternatives).toEqual(["  alternativa  "]);
  });

  it("preserves the draft when the exact reconciliation revision is stale", async () => {
    const existing: PersonalVocabularyRule = { ...rule, revision: "19" };
    const result = await saveTeachCorrection({
      draft: draft({ written: "new" }),
      snapshot: { revision: "31", rules: [existing] },
      action: "remember_only",
      existingRule: existing,
      conflictChoice: "replace",
    }, clientWith({
      update: async () => {
        throw new Error("stale vocabulary revision");
      },
    }));

    expect(result.status).toBe("conflict");
    expect(result.draftPreserved).toBe(true);
  });

  it("requires explicit confirmation for short automatic triggers", () => {
    const validation = validateTeachCorrectionDraft(draft({
      spoken: "a",
      mode: "automatic",
    }));

    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain("automatic-confirmation-required");
    expect(validateTeachCorrectionDraft(draft({
      spoken: "a",
      mode: "automatic",
      automaticConfirmed: true,
    })).ok).toBe(true);
  });

  it("does not carry Ask into an automatic confirmation", () => {
    const askDraft = createTeachCorrectionDraftFromRule({
      ...rule,
      spoken: "a",
      mode: "ask",
    });
    expect(askDraft.automaticConfirmed).toBe(false);
    expect(validateTeachCorrectionDraft({ ...askDraft, mode: "automatic" }).errors).toContain(
      "automatic-confirmation-required",
    );

    expect(createTeachCorrectionDraftFromRule({ ...rule, mode: "automatic" }).automaticConfirmed).toBe(true);
  });

  it("does mutation, refresh, then host replacement in save-first order", async () => {
    const calls: string[] = [];
    let replacement = "";
    const result = await saveTeachCorrection({
      draft: draft({ written: " J.P. " }),
      snapshot,
      action: "replace_and_remember",
      selection: {
        selectionId: "host-selection-uia",
        selectedText: "jota",
        truncated: false,
        target: { frameHwnd: "host", processId: 12 },
      },
    }, clientWith({
      create: async () => {
        calls.push("create");
        return { rule, vocabularyRevision: "8" };
      },
      refresh: async () => {
        calls.push("refresh");
      },
      replace: async (input) => {
        calls.push("replace");
        replacement = input.replacement;
        return { status: "replaced", reason: "matched" };
      },
    }));

    expect(calls).toEqual(["create", "refresh", "replace"]);
    expect(replacement).toBe(" J.P. ");
    expect(result.status).toBe("saved_and_replaced");
    expect(result.draftPreserved).toBe(false);
  });

  it("never replaces when the vocabulary mutation fails and preserves the draft", async () => {
    let replaced = false;
    const result = await saveTeachCorrection({
      draft: draft(),
      snapshot,
      action: "replace_and_remember",
      selection: {
        selectionId: "host-selection-uia",
        selectedText: "jota",
        truncated: false,
        target: { frameHwnd: "host", processId: 12 },
      },
    }, clientWith({
      create: async () => {
        throw new Error("network unavailable");
      },
      replace: async () => {
        replaced = true;
        return { status: "replaced", reason: "unexpected" };
      },
    }));

    expect(result.status).toBe("network_error");
    expect(result.draftPreserved).toBe(true);
    expect(replaced).toBe(false);
  });

  it("keeps the rule saved when host selection changed after the refresh", async () => {
    const result = await saveTeachCorrection({
      draft: draft(),
      snapshot,
      action: "replace_and_remember",
      selection: {
        selectionId: "host-selection-uia",
        selectedText: "jota",
        truncated: false,
        target: { frameHwnd: "host", processId: 12 },
      },
    }, clientWith({
      replace: async () => ({ status: "selection_changed", reason: "changed" }),
    }));

    expect(result.status).toBe("saved_selection_unchanged");
    expect(result.replacement?.status).toBe("selection_changed");
    expect(result.draftPreserved).toBe(false);
  });

  it("passes selection edge whitespace unchanged to the save-first host lease", async () => {
    let expectedSelection = "";
    const result = await saveTeachCorrection({
      draft: draft({ written: "J.P." }),
      snapshot,
      action: "replace_and_remember",
      selection: {
        selectionId: "host-selection-uia",
        selectedText: " jota ",
        truncated: false,
        target: { frameHwnd: "host", processId: 12 },
      },
    }, clientWith({
      replace: async (input) => {
        expectedSelection = input.expectedSelection;
        return { status: "selection_changed", reason: "edge mismatch" };
      },
    }));

    expect(result.status).toBe("saved_selection_unchanged");
    expect(expectedSelection).toBe(" jota ");
  });

  it("saves without touching the host for remember-only", async () => {
    let replaced = false;
    const result = await saveTeachCorrection({
      draft: draft(),
      snapshot,
      action: "remember_only",
      selection: {
        selectionId: "host-selection-uia",
        selectedText: "jota",
        truncated: false,
        target: { frameHwnd: "host", processId: 12 },
      },
    }, clientWith({
      replace: async () => {
        replaced = true;
        return { status: "replaced", reason: "unexpected" };
      },
    }));

    expect(result.status).toBe("saved_only");
    expect(result.replacement).toBeUndefined();
    expect(replaced).toBe(false);
  });
});
