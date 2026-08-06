import { describe, expect, it, vi } from "vitest";
import { DesktopDictationController } from "../../src/desktop-control/controller";
import type { DeliveryRequest } from "../../src/delivery/types";
import {
  saveTeachCorrection,
  type TeachCorrectionDraft,
  type VocabularyClient,
} from "../../src/personal-vocabulary/teach-correction";
import type {
  PersonalVocabularyRule,
  PersonalVocabularySnapshot,
  VocabularyChoiceSessionView,
} from "../../src/personal-vocabulary";

const automaticRule: PersonalVocabularyRule = {
  id: "rule-alpha-term",
  revision: "2",
  spoken: "alpha term",
  mode: "automatic",
  enabled: true,
  candidates: [{ id: "candidate-primary", written: "ALPHA TERM" }],
  defaultCandidateId: "candidate-primary",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const automaticDraft: TeachCorrectionDraft = {
  spoken: "alpha term",
  written: "ALPHA TERM",
  alternatives: [],
  mode: "automatic",
  automaticConfirmed: true,
};

function control(id: string, action: "start" | "stop" = "start") {
  return {
    id,
    source: "app_button" as const,
    action,
    receivedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("personal vocabulary user-flow integration", () => {
  it("refreshes the host cache after a confirmed mutation before the next dictation snapshot", async () => {
    const calls: string[] = [];
    let hostSnapshot: PersonalVocabularySnapshot = { revision: "1", rules: [] };
    const refreshedSnapshot: PersonalVocabularySnapshot = {
      revision: "2",
      rules: [automaticRule],
    };
    const client: VocabularyClient = {
      readSnapshot: async () => hostSnapshot,
      createRule: async () => {
        calls.push("mutation");
        return { rule: automaticRule, vocabularyRevision: "2" };
      },
      updateRule: async () => ({ rule: automaticRule, vocabularyRevision: "2" }),
      deleteRule: async () => ({ vocabularyRevision: "2" }),
      refresh: async () => {
        calls.push("refresh");
        hostSnapshot = refreshedSnapshot;
      },
      replaceCapturedSelection: async () => ({ status: "replaced", reason: "matched" }),
    };

    const saved = await saveTeachCorrection({
      draft: automaticDraft,
      snapshot: hostSnapshot,
      action: "remember_only",
    }, client);
    expect(saved.status).toBe("saved_only");

    const delivered: string[] = [];
    const controller = new DesktopDictationController({
      capture: {
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => ({ captureId: "clip-after-refresh" })),
      },
      runtime: {
        transcribe: vi.fn(async () => ({ transcript: "alpha term", output: "alpha term" })),
      },
      delivery: {
        deliver: vi.fn(async (request) => {
          delivered.push(request.text);
          return {
            status: "available" as const,
            output: request.text,
            strategy: "review_only" as const,
            message: "Review only",
          };
        }),
      },
      vocabulary: {
        getSnapshot: async () => {
          calls.push("snapshot");
          return hostSnapshot;
        },
      },
      createSessionId: () => "session-after-refresh",
    });

    await controller.handleControl(control("start-after-refresh"));
    await controller.handleControl(control("stop-after-refresh", "stop"));

    expect(calls).toEqual(["mutation", "refresh", "snapshot"]);
    expect(delivered).toEqual(["ALPHA TERM"]);
  });

  it("keeps the ask snapshot and delivery target captured when the session was created", async () => {
    let hostSnapshot: PersonalVocabularySnapshot = {
      revision: "ask-1",
      rules: [{
        ...automaticRule,
        id: "rule-stable",
        revision: "ask-rule-1",
        spoken: "stable term",
        mode: "ask",
        candidates: [{ id: "stable", written: "STABLE TERM" }],
        defaultCandidateId: undefined,
      }],
    };
    let opened: VocabularyChoiceSessionView | undefined;
    const deliveries: DeliveryRequest[] = [];
    const controller = new DesktopDictationController({
      capture: {
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => ({ captureId: "clip-stable" })),
      },
      runtime: {
        transcribe: vi.fn(async () => ({ transcript: "stable term", output: "stable term" })),
      },
      delivery: {
        deliver: vi.fn(async (request) => {
          deliveries.push(request);
          return {
            status: "available" as const,
            output: request.text,
            strategy: "review_only" as const,
            message: "Review only",
          };
        }),
      },
      vocabulary: {
        getSnapshot: async () => hostSnapshot,
        onChoiceRequired: (view) => {
          opened = view;
          return true;
        },
      },
      createSessionId: () => "session-stable",
    });
    const target = { confidence: "high" as const, appLabel: "Editor A" };

    await controller.handleControl(control("start-stable"));
    const waiting = await controller.handleControl({
      ...control("stop-stable", "stop"),
      targetSnapshot: target,
    });
    expect(waiting.state).toBe("waiting_for_choice");

    hostSnapshot = {
      revision: "ask-2",
      rules: [{ ...automaticRule, spoken: "stable term", candidates: [{ id: "changed", written: "CHANGED" }] }],
    };
    target.appLabel = "Editor B";

    await controller.resolveVocabularyChoice!({
      sessionId: waiting.sessionId,
      groupId: opened!.group.id,
      choice: opened!.group.candidates[0]!.id,
    });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      text: "STABLE TERM",
      targetSnapshot: { confidence: "high", appLabel: "Editor A" },
    });
  });
});
