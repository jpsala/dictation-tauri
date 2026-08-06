
import { describe, expect, it, vi } from "vitest";
import {
  DesktopDictationController,
  type DesktopCaptureGateway,
  type DesktopRuntimeGateway,
} from "../../src/desktop-control/controller";
import { createAppSessionControllerFacade } from "../../src/desktop-control/app-session";
import type { DesktopDictationSession } from "../../src/desktop-control/types";
import type { DesktopDeliveryGateway } from "../../src/delivery";
import type {
  PersonalVocabularySnapshot,
  VocabularyChoiceSessionView,
} from "../../src/personal-vocabulary";

const snapshot: PersonalVocabularySnapshot = {
  revision: "snapshot-1",
  rules: [
    {
      id: "ask",
      revision: "rule-1",
      spoken: "foo bar",
      mode: "ask",
      enabled: true,
      candidates: [{ id: "canonical", written: "CANONICAL" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

function event(id: string, action: "start" | "stop" | "cancel" = "start") {
  return {
    id,
    source: "app_button" as const,
    action,
    receivedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createController(input: {
  runtime?: DesktopRuntimeGateway;
  delivery?: DesktopDeliveryGateway;
  vocabulary?: ConstructorParameters<typeof DesktopDictationController>[0]["vocabulary"];
}) {
  const capture: DesktopCaptureGateway = {
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => ({ captureId: "clip-1" })),
  };
  const delivered: string[] = [];
  const controller = new DesktopDictationController({
    capture,
    runtime: input.runtime ?? {
      transcribe: vi.fn(async () => ({
        transcript: "foo bar",
        output: "foo bar",
      })),
    },
    delivery: input.delivery ?? {
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
    createSessionId: () => "desktop-vocabulary-session",
    vocabulary: input.vocabulary ?? { snapshot },
  });
  return { controller, delivered };
}

function createFacade(controller: DesktopDictationController) {
  let eventNumber = 0;
  return createAppSessionControllerFacade(controller, {
    now: () => "2026-01-01T00:00:00.000Z",
    createEventId: (action) => `bridge-${action}-${++eventNumber}`,
  });
}

describe("DesktopDictationController vocabulary pre-delivery gate", () => {
  it("waits in Esperando elección, blocks a second start, then delivers once", async () => {
    let opened: VocabularyChoiceSessionView | undefined;
    const { controller, delivered } = createController({
      vocabulary: {
        snapshot,
        onChoiceRequired: (view) => {
          opened = view;
        },
      },
    });

    await controller.handleControl(event("start"));
    const waiting = await controller.handleControl(event("stop", "stop"));
    expect(waiting).toMatchObject({
      state: "waiting_for_choice",
      vocabulary: {
        state: "waiting_for_choice",
        statusText: "Esperando elección",
        groupCount: 1,
      },
    });
    expect(delivered).toEqual([]);
    expect(opened?.group.id).toBeTruthy();

    const overlap = await controller.handleControl(event("second-start"));
    expect(overlap.state).toBe("waiting_for_choice");

    const resolved = await controller.resolveVocabularyChoice!({
      sessionId: waiting.sessionId,
      groupId: opened!.group.id,
      choice: "canonical",
    });
    expect(resolved.state).toBe("reviewing");
    expect(delivered).toEqual(["CANONICAL"]);

    await controller.resolveVocabularyChoice!({
      sessionId: waiting.sessionId,
      groupId: opened!.group.id,
      choice: "canonical",
    });
    expect(delivered).toHaveLength(1);
  });

  it("cancels safely with the original pending text and preserves redacted history output", async () => {
    const { controller, delivered } = createController({
      runtime: {
        transcribe: vi.fn(async () => ({
          transcript: "foo bar",
          output: "foo bar",
          summary: {},
        })),
      },
      vocabulary: { snapshot, onChoiceRequired: () => true },
    });
    await controller.handleControl(event("start"));
    const waiting = await controller.handleControl(event("stop", "stop"));
    const cancelled = await controller.cancelVocabularyResolution!({ sessionId: waiting.sessionId });

    expect(cancelled).toMatchObject({ state: "reviewing", runtime: { output: "foo bar" } });
    expect(delivered).toEqual(["foo bar"]);
    const runtime = cancelled.runtime as { output?: string; summary?: { runtimeTelemetryStages?: unknown[] } };
    expect(runtime.summary?.runtimeTelemetryStages?.at(-1)).toMatchObject({
      stage: "vocabulary",
      status: "ok",
      vocabulary: { outcome: "cancelled" },
      redacted: true,
    });
    expect(JSON.stringify(runtime.summary?.runtimeTelemetryStages)).not.toContain("foo bar");
    expect(JSON.stringify(runtime.summary?.runtimeTelemetryStages)).not.toContain("CANONICAL");
  });

  it("applies rules to a persistent preset route but excludes selection transforms", async () => {
    const automaticSnapshot: PersonalVocabularySnapshot = {
      revision: "snapshot-auto",
      rules: [
        {
          id: "auto",
          revision: "rule-1",
          spoken: "foo",
          mode: "automatic",
          enabled: true,
          candidates: [{ id: "canonical", written: "CANONICAL" }],
          defaultCandidateId: "canonical",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    const runtime = {
      transcribe: vi.fn(async () => ({
        transcript: "foo",
        output: "foo",
        vocabularySource: "persistent_preset" as const,
      })),
    };
    const persistent = createController({ runtime, vocabulary: { snapshot: automaticSnapshot } });
    await persistent.controller.handleControl(event("preset-start"));
    await persistent.controller.handleControl(event("preset-stop", "stop"));
    expect(persistent.delivered).toEqual(["CANONICAL"]);

    const selection = createController({
      runtime: {
        transcribe: vi.fn(async () => ({
          transcript: "foo",
          output: "foo",
          summary: { resultSource: "selection_transform" },
        })),
      },
      vocabulary: { snapshot: automaticSnapshot },
    });
    await selection.controller.handleControl(event("selection-start"));
    await selection.controller.handleControl(event("selection-stop", "stop"));
    expect(selection.delivered).toEqual(["foo"]);
  });

  it("falls back to one original delivery when the choice surface fails", async () => {
    const { controller, delivered } = createController({
      vocabulary: {
        snapshot,
        onChoiceRequired: vi.fn(() => false),
      },
    });
    await controller.handleControl(event("fallback-start"));
    const reviewed = await controller.handleControl(event("fallback-stop", "stop"));
    expect(reviewed.state).toBe("reviewing");
    expect(delivered).toEqual(["foo bar"]);
  });

  it("falls back when the choice handler is absent or throws", async () => {
    for (const onChoiceRequired of [
      undefined,
      () => {
        throw new Error("surface failed");
      },
    ]) {
      const { controller, delivered } = createController({
        vocabulary: { snapshot, onChoiceRequired },
      });
      await controller.handleControl(event("handler-start"));
      const reviewed = await controller.handleControl(event("handler-stop", "stop"));
      expect(reviewed.state).toBe("reviewing");
      expect(delivered).toEqual(["foo bar"]);
    }
  });

  it("uses a finite default timeout and clears it after defensive cancellation", async () => {
    const mixedSnapshot: PersonalVocabularySnapshot = {
      revision: "snapshot-timeout-mixed",
      rules: [
        {
          id: "automatic-foo",
          revision: "rule-auto",
          spoken: "foo",
          mode: "automatic",
          enabled: true,
          candidates: [{ id: "canonical-foo", written: "FOO" }],
          defaultCandidateId: "canonical-foo",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "ask-bar",
          revision: "rule-ask",
          spoken: "bar",
          mode: "ask",
          enabled: true,
          candidates: [{ id: "canonical-bar", written: "BAR" }],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    let timeoutMs = 0;
    let timeoutCallback: (() => void) | undefined;
    let clearCalls = 0;
    const { controller, delivered } = createController({
      runtime: {
        transcribe: vi.fn(async () => ({
          transcript: "foo bar",
          output: "foo bar",
          summary: {},
        })),
      },
      vocabulary: {
        snapshot: mixedSnapshot,
        onChoiceRequired: () => true,
        scheduler: {
          setTimeout(callback, ms) {
            timeoutCallback = callback;
            timeoutMs = ms;
            return "vocabulary-timeout";
          },
          clearTimeout() {
            clearCalls += 1;
          },
        },
      },
    });

    await controller.handleControl(event("timeout-start"));
    const waiting = await controller.handleControl(event("timeout-stop", "stop"));
    expect(waiting.state).toBe("waiting_for_choice");
    expect(timeoutMs).toBeGreaterThan(0);

    timeoutCallback?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(delivered).toEqual(["foo bar"]);
    expect(clearCalls).toBe(1);
    const runtime = (controller.getState() as { runtime?: unknown }).runtime as {
      summary?: { runtimeTelemetryStages?: unknown[] };
    };
    expect(runtime.summary?.runtimeTelemetryStages?.at(-1)).toMatchObject({
      stage: "vocabulary",
      status: "fallback",
      vocabulary: { outcome: "fallback", reason: "choice_timeout_original_preserved" },
      redacted: true,
    });
    expect(JSON.stringify(runtime.summary?.runtimeTelemetryStages)).not.toContain("foo bar");
    expect(JSON.stringify(runtime.summary?.runtimeTelemetryStages)).not.toContain("FOO");
  });

  it("notifies the real facade bridge after timeout so App can clear waiting and persist once", async () => {
    vi.useFakeTimers();
    try {
      const { controller, delivered } = createController({
        vocabulary: {
          snapshot,
          onChoiceRequired: () => true,
          choiceTimeoutMs: 25,
        },
      });
      const facade = createFacade(controller);
      const settlements: DesktopDictationSession[] = [];
      let projectedState = "idle";
      let choiceSurfaceOpen = false;
      let historyOriginalCount = 0;
      const unsubscribe = facade.subscribeVocabularySettlement((session) => {
        settlements.push(session);
        projectedState = session.state;
        choiceSurfaceOpen = session.state === "waiting_for_choice";
        const output = (session.runtime as { output?: string } | undefined)?.output;
        if (session.state !== "waiting_for_choice" && output === "foo bar") {
          historyOriginalCount += 1;
        }
      });

      await facade.start();
      const waiting = await facade.stop();
      projectedState = waiting.state;
      choiceSurfaceOpen = Boolean(waiting.vocabulary);
      expect(projectedState).toBe("waiting_for_choice");
      expect(choiceSurfaceOpen).toBe(true);

      await vi.advanceTimersByTimeAsync(25);

      expect(settlements).toHaveLength(1);
      expect(settlements[0]).toMatchObject({
        state: "reviewing",
        vocabulary: undefined,
        runtime: { output: "foo bar" },
      });
      expect(projectedState).toBe("reviewing");
      expect(choiceSurfaceOpen).toBe(false);
      expect(historyOriginalCount).toBe(1);
      expect(delivered).toEqual(["foo bar"]);
      unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["absent", undefined],
    ["false", () => false],
    ["throw", () => { throw new Error("surface failed"); }],
  ] as const)("notifies the facade once when the choice handler is %s", async (_kind, handler) => {
    const { controller, delivered } = createController({
      vocabulary: { snapshot, onChoiceRequired: handler },
    });
    const facade = createFacade(controller);
    const settlements: DesktopDictationSession[] = [];
    facade.subscribeVocabularySettlement((session) => settlements.push(session));

    await facade.start();
    const reviewed = await facade.stop();

    expect(reviewed.state).toBe("reviewing");
    expect(settlements).toHaveLength(1);
    expect(settlements[0]).toBe(reviewed);
    expect(settlements[0]?.vocabulary).toBeUndefined();
    expect(delivered).toEqual(["foo bar"]);
  });

  it("projects recovery through the facade when timeout fallback delivery fails", async () => {
    vi.useFakeTimers();
    try {
      const deliver = vi.fn(async () => {
        throw new Error("delivery unavailable");
      });
      const { controller } = createController({
        runtime: {
          transcribe: vi.fn(async () => ({
            transcript: "foo bar",
            output: "foo bar",
            summary: {
              runId: "timeout-delivery-failure",
              terminalState: "done",
            },
          })),
        },
        delivery: { deliver },
        vocabulary: {
          snapshot,
          onChoiceRequired: () => true,
          choiceTimeoutMs: 25,
        },
      });
      const facade = createFacade(controller);
      const settlements: DesktopDictationSession[] = [];
      facade.subscribeVocabularySettlement((session) => settlements.push(session));

      await facade.start();
      await facade.stop();
      await vi.advanceTimersByTimeAsync(25);

      expect(deliver).toHaveBeenCalledTimes(1);
      expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ text: "foo bar" }));
      expect(settlements).toHaveLength(1);
      expect(settlements[0]).toMatchObject({
        state: "reviewing",
        vocabulary: undefined,
        delivery: { status: "failed", output: "foo bar" },
        runtime: { output: "foo bar", summary: { output: "foo bar" } },
        recoveryAction: { kind: "copy_manually" },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("delivers the exact original after timeout following a partial choice", async () => {
    const partialSnapshot: PersonalVocabularySnapshot = {
      revision: "snapshot-timeout-partial",
      rules: [
        {
          id: "ask-bar",
          revision: "rule-bar",
          spoken: "bar",
          mode: "ask",
          enabled: true,
          candidates: [{ id: "canonical-bar", written: "BAR" }],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "ask-baz",
          revision: "rule-baz",
          spoken: "baz",
          mode: "ask",
          enabled: true,
          candidates: [{ id: "canonical-baz", written: "BAZ" }],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    let timeoutCallback: (() => void) | undefined;
    let clearCalls = 0;
    let opened: VocabularyChoiceSessionView | undefined;
    const { controller, delivered } = createController({
      runtime: {
        transcribe: vi.fn(async () => ({
          transcript: "foo bar baz",
          output: "foo bar baz",
          summary: {},
        })),
      },
      vocabulary: {
        snapshot: partialSnapshot,
        onChoiceRequired: (view) => {
          opened = view;
        },
        scheduler: {
          setTimeout(callback) {
            timeoutCallback = callback;
            return "partial-vocabulary-timeout";
          },
          clearTimeout() {
            clearCalls += 1;
          },
        },
      },
    });

    await controller.handleControl(event("partial-timeout-start"));
    const waiting = await controller.handleControl(event("partial-timeout-stop", "stop"));
    expect(waiting.state).toBe("waiting_for_choice");
    expect(opened?.group.id).toBeTruthy();

    const nextWaiting = await controller.resolveVocabularyChoice!({
      sessionId: waiting.sessionId,
      groupId: opened!.group.id,
      choice: opened!.group.candidates[0]!.id,
    });
    expect(nextWaiting.state).toBe("waiting_for_choice");
    expect(nextWaiting.vocabulary?.group.id).not.toBe(opened!.group.id);

    timeoutCallback?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(delivered).toEqual(["foo bar baz"]);
    expect(clearCalls).toBe(1);
    expect(controller.getState().state).toBe("reviewing");
  });

  it("keeps the resolved text in recovery when delivery fails", async () => {
    const automaticSnapshot: PersonalVocabularySnapshot = {
      revision: "snapshot-recovery",
      rules: [
        {
          id: "auto",
          revision: "rule-1",
          spoken: "foo",
          mode: "automatic",
          enabled: true,
          candidates: [{ id: "canonical", written: "CANONICAL" }],
          defaultCandidateId: "canonical",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    const controller = new DesktopDictationController({
      capture: {
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => ({ captureId: "clip-recovery" })),
      },
      runtime: {
        transcribe: vi.fn(async () => ({
          transcript: "foo",
          output: "foo",
          summary: {},
        })),
      },
      delivery: {
        deliver: vi.fn(async () => {
          throw new Error("delivery unavailable");
        }),
      },
      createSessionId: () => "desktop-recovery-session",
      vocabulary: { snapshot: automaticSnapshot },
    });

    await controller.handleControl(event("recovery-start"));
    const reviewed = await controller.handleControl(event("recovery-stop", "stop"));
    expect(reviewed).toMatchObject({
      state: "reviewing",
      delivery: { status: "failed", output: "CANONICAL" },
      runtime: { output: "CANONICAL", summary: { output: "CANONICAL" } },
    });
  });
});
