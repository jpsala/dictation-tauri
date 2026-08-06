
import {
  applyVocabularyChoices,
  compileVocabularySnapshot,
  matchVocabulary,
} from "./matcher";
import type {
  PersonalVocabularySnapshot,
  VocabularyChoice,
  VocabularyChoiceGroup,
  VocabularyChoiceMap,
  VocabularyResolutionPlan,
} from "./types";
import { KEEP_ORIGINAL_CANDIDATE_ID } from "./types";

/**
 * The resolver is deliberately a small boundary around the pure V2 matcher.
 * It owns the lifecycle of one immutable plan, but never owns delivery or a
 * provider call.  Desktop/controller code can therefore pause before delivery
 * without re-running matching against a newer cache snapshot.
 */

export const vocabularyWaitingState = "waiting_for_choice" as const;
export type VocabularyWaitingState = typeof vocabularyWaitingState;

export type VocabularyResolutionSource =
  | "dictation"
  | "persistent_preset"
  | "selection_transform"
  | "assistant";

export type VocabularyPreDeliveryTelemetry = Readonly<{
  event: "vocabulary_pre_delivery";
  sessionId: string;
  outcome:
    | "skipped"
    | "unchanged"
    | "automatic"
    | "waiting_for_choice"
    | "resolved"
    | "cancelled"
    | "fallback";
  snapshotRevision?: string;
  ruleCount: number;
  matchCount: number;
  automaticCount: number;
  askGroupCount: number;
  choiceCount: number;
  inputLength: number;
  outputLength: number;
  reason?: string;
  redacted: true;
}>;

export type VocabularyChoiceSessionView = Readonly<{
  sessionId: string;
  state: VocabularyWaitingState;
  statusText: "Esperando elección";
  snapshotRevision: string;
  groupIndex: number;
  groupCount: number;
  group: VocabularyChoiceGroup;
  pendingOccurrences: number;
  originalTextLength: number;
  redacted: true;
}>;

export type VocabularyPreDeliverySession = Readonly<{
  sessionId: string;
  originalText: string;
  snapshotRevision: string;
  snapshot: PersonalVocabularySnapshot;
  plan: VocabularyResolutionPlan;
  choices: ReadonlyMap<string, VocabularyChoice>;
  groupIndex: number;
  view: VocabularyChoiceSessionView;
}>;

export type VocabularyPreDeliveryResult = Readonly<{
  outcome: VocabularyPreDeliveryTelemetry["outcome"];
  text: string;
  originalText: string;
  plan?: VocabularyResolutionPlan;
  session?: VocabularyPreDeliverySession;
  telemetry: VocabularyPreDeliveryTelemetry;
}>;

export type VocabularyPreDeliveryBeginInput = Readonly<{
  sessionId: string;
  text: string;
  snapshot: PersonalVocabularySnapshot;
  source?: VocabularyResolutionSource;
  /** Explicitly allow a persistent preset to participate in this boundary. */
  persistentPreset?: boolean;
}>;

export type VocabularyPreDeliveryChoiceInput = Readonly<{
  groupId: string;
  choice: VocabularyChoice;
}>;

export class ActiveVocabularyResolutionError extends Error {
  constructor(readonly activeSessionId: string) {
    super(`Vocabulary resolution already active: ${activeSessionId}`);
    this.name = "ActiveVocabularyResolutionError";
  }
}

function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function freezeChoices(
  choices: ReadonlyMap<string, VocabularyChoice>,
): ReadonlyMap<string, VocabularyChoice> {
  // `Object.freeze(new Map(...))` does not prevent `.set()` from mutating the
  // map's internal slots.  A small Map subclass keeps the matcher-compatible
  // `instanceof Map` behavior while rejecting public mutators.
  return Object.freeze(new FrozenVocabularyChoiceMap(choices));
}

class FrozenVocabularyChoiceMap extends Map<string, VocabularyChoice> {
  constructor(entries: ReadonlyMap<string, VocabularyChoice>) {
    super();
    for (const [key, value] of entries) {
      Map.prototype.set.call(this, key, value);
    }
  }

  override set(): this {
    throw new TypeError("Vocabulary choice sessions are immutable.");
  }

  override delete(): boolean {
    throw new TypeError("Vocabulary choice sessions are immutable.");
  }

  override clear(): void {
    throw new TypeError("Vocabulary choice sessions are immutable.");
  }
}

function emptyPlan(text: string, revision = ""): VocabularyResolutionPlan {
  const normalizedText = {
    original: text,
    normalized: text,
    spans: Object.freeze(
      Array.from({ length: text.length }, (_, index) =>
        Object.freeze({ start: index, end: index + 1 }),
      ),
    ),
    spanMap: Object.freeze(
      Array.from({ length: text.length }, (_, index) =>
        Object.freeze({ start: index, end: index + 1 }),
      ),
    ),
  } as const;
  const groups: readonly VocabularyChoiceGroup[] = Object.freeze([]);
  return freeze({
    originalText: text,
    snapshotRevision: revision,
    normalizedText,
    candidateMatches: Object.freeze([]),
    allMatches: Object.freeze([]),
    matches: Object.freeze([]),
    automatic: Object.freeze([]),
    askGroups: groups,
    pendingGroups: groups,
    automaticText: text,
    text,
    hasPendingChoices: false,
  });
}

function shouldResolveVocabulary(input: {
  source?: VocabularyResolutionSource;
  persistentPreset?: boolean;
}): boolean {
  if (input.persistentPreset === true) {
    return true;
  }

  return input.source !== "selection_transform" && input.source !== "assistant";
}

function createTelemetry(input: {
  sessionId: string;
  outcome: VocabularyPreDeliveryTelemetry["outcome"];
  plan?: VocabularyResolutionPlan;
  snapshot?: PersonalVocabularySnapshot;
  text: string;
  output: string;
  choiceCount?: number;
  reason?: string;
}): VocabularyPreDeliveryTelemetry {
  return freeze({
    event: "vocabulary_pre_delivery",
    sessionId: input.sessionId,
    outcome: input.outcome,
    ...(input.plan ? { snapshotRevision: input.plan.snapshotRevision } : {}),
    ruleCount: input.snapshot?.rules.length ?? 0,
    matchCount: input.plan?.matches.length ?? 0,
    automaticCount: input.plan?.automatic.length ?? 0,
    askGroupCount: input.plan?.askGroups.length ?? 0,
    choiceCount: input.choiceCount ?? 0,
    inputLength: input.text.length,
    outputLength: input.output.length,
    ...(input.reason ? { reason: input.reason } : {}),
    redacted: true as const,
  });
}

function createView(
  sessionId: string,
  plan: VocabularyResolutionPlan,
  groupIndex: number,
): VocabularyChoiceSessionView {
  const group = plan.askGroups[groupIndex];
  if (!group) {
    throw new Error("Vocabulary choice group is unavailable.");
  }

  return freeze({
    sessionId,
    state: vocabularyWaitingState,
    statusText: "Esperando elección",
    snapshotRevision: plan.snapshotRevision,
    groupIndex,
    groupCount: plan.askGroups.length,
    group,
    pendingOccurrences: group.occurrences.length,
    originalTextLength: plan.originalText.length,
    redacted: true as const,
  });
}

function choicesToMap(
  choices: VocabularyChoiceMap | undefined,
): Map<string, VocabularyChoice> {
  if (!choices) {
    return new Map();
  }
  if (choices instanceof Map) {
    return new Map(choices);
  }
  if (Array.isArray(choices)) {
    return new Map(choices.map((entry) => [entry.groupId, entry.choice]));
  }
  return new Map(Object.entries(choices));
}

function isValidChoice(group: VocabularyChoiceGroup, choice: VocabularyChoice): boolean {
  return choice === KEEP_ORIGINAL_CANDIDATE_ID ||
    group.candidates.some((candidate) => candidate.id === choice);
}

function createSession(
  input: VocabularyPreDeliveryBeginInput,
  plan: VocabularyResolutionPlan,
  snapshot: PersonalVocabularySnapshot,
  initialChoices: ReadonlyMap<string, VocabularyChoice> = new Map(),
): VocabularyPreDeliverySession {
  const choices = new Map<string, VocabularyChoice>();
  for (const group of plan.askGroups) {
    const choice = initialChoices.get(group.id);
    if (choice !== undefined && isValidChoice(group, choice)) {
      choices.set(group.id, choice);
    }
  }
  const groupIndex = plan.askGroups.findIndex((group) => !choices.has(group.id));
  if (groupIndex < 0) {
    throw new Error("Cannot create a pending vocabulary session without pending groups.");
  }
  return freeze({
    sessionId: input.sessionId,
    originalText: plan.originalText,
    snapshotRevision: plan.snapshotRevision,
    snapshot,
    plan,
    choices: freezeChoices(choices),
    groupIndex,
    view: createView(input.sessionId, plan, groupIndex),
  });
}

/**
 * One-shot resolver for integrations that already own their choice map.  It
 * is useful for provider-free pipeline fixtures and for callers that want to
 * apply all choices in one operation without owning a session UI.
 */
export function resolveVocabularyPreDelivery(
  input: VocabularyPreDeliveryBeginInput & { choices?: VocabularyChoiceMap },
): VocabularyPreDeliveryResult {
  if (!shouldResolveVocabulary(input)) {
    const plan = emptyPlan(input.text);
    return freeze({
      outcome: "skipped",
      text: input.text,
      originalText: input.text,
      plan,
      telemetry: createTelemetry({
        sessionId: input.sessionId,
        outcome: "skipped",
        text: input.text,
        output: input.text,
        reason: "excluded_source",
      }),
    });
  }

  const compiled = compileVocabularySnapshot(input.snapshot);
  const plan = matchVocabulary(input.text, compiled.snapshot);
  if (input.choices !== undefined) {
    const values = choicesToMap(input.choices);
    const text = applyVocabularyChoices(plan, values);
    const unresolved = plan.askGroups.some((group) => {
      const choice = values.get(group.id);
      return choice === undefined || !isValidChoice(group, choice);
    });
    if (!unresolved) {
      return freeze({
        outcome: plan.automatic.length === 0 && plan.askGroups.length === 0
          ? "unchanged"
          : "resolved",
        text,
        originalText: input.text,
        plan,
        telemetry: createTelemetry({
          sessionId: input.sessionId,
          outcome: plan.automatic.length === 0 && plan.askGroups.length === 0
            ? "unchanged"
            : "resolved",
          plan,
          snapshot: compiled.snapshot,
          text: input.text,
          output: text,
          choiceCount: plan.askGroups.length,
        }),
      });
    }
  }

  if (plan.askGroups.length > 0) {
    const session = createSession(input, plan, compiled.snapshot, choicesToMap(input.choices));
    return freeze({
      outcome: vocabularyWaitingState,
      text: applyVocabularyChoices(plan, session.choices),
      originalText: input.text,
      plan,
      session,
      telemetry: createTelemetry({
        sessionId: input.sessionId,
        outcome: vocabularyWaitingState,
        plan,
        snapshot: compiled.snapshot,
        text: input.text,
        output: applyVocabularyChoices(plan, session.choices),
        choiceCount: session.choices.size,
      }),
    });
  }

  return freeze({
    outcome: plan.automatic.length === 0 ? "unchanged" : "automatic",
    text: plan.automaticText,
    originalText: input.text,
    plan,
    telemetry: createTelemetry({
      sessionId: input.sessionId,
      outcome: plan.automatic.length === 0 ? "unchanged" : "automatic",
      plan,
      snapshot: compiled.snapshot,
      text: input.text,
      output: plan.automaticText,
    }),
  });
}

/** Stateful sequential choice coordinator used by desktop/controller code. */
export class VocabularyPreDeliveryCoordinator {
  private active?: VocabularyPreDeliverySession;

  get session(): VocabularyPreDeliverySession | undefined {
    return this.active;
  }

  begin(input: VocabularyPreDeliveryBeginInput): VocabularyPreDeliveryResult {
    if (this.active) {
      throw new ActiveVocabularyResolutionError(this.active.sessionId);
    }

    const result = resolveVocabularyPreDelivery(input);
    if (result.outcome === vocabularyWaitingState && result.session) {
      this.active = result.session;
    }
    return result;
  }

  choose(input: VocabularyPreDeliveryChoiceInput): VocabularyPreDeliveryResult {
    const session = this.active;
    if (!session) {
      throw new Error("No vocabulary choice session is active.");
    }
    if (session.view.group.id !== input.groupId) {
      return this.waitingResult(session, "stale_group");
    }

    const choice = session.view.group.candidates.some(
      (candidate) => candidate.id === input.choice,
    ) || input.choice === KEEP_ORIGINAL_CANDIDATE_ID
      ? input.choice
      : undefined;
    if (choice === undefined) {
      return this.waitingResult(session, "invalid_choice");
    }

    const choices = new Map(session.choices);
    choices.set(input.groupId, choice);
    const nextGroupIndex = session.groupIndex + 1;
    if (nextGroupIndex < session.plan.askGroups.length) {
      this.active = freeze({
        ...session,
        choices: freezeChoices(choices),
        groupIndex: nextGroupIndex,
        view: createView(session.sessionId, session.plan, nextGroupIndex),
      });
      return this.waitingResult(this.active, "choice_recorded");
    }

    const text = applyVocabularyChoices(session.plan, choices);
    this.active = undefined;
    return freeze({
      outcome: "resolved",
      text,
      originalText: session.originalText,
      plan: session.plan,
      telemetry: createTelemetry({
        sessionId: session.sessionId,
        outcome: "resolved",
        plan: session.plan,
        snapshot: session.snapshot,
        text: session.originalText,
        output: text,
        choiceCount: choices.size,
      }),
    });
  }

  cancel(): VocabularyPreDeliveryResult {
    const session = this.active;
    if (!session) {
      throw new Error("No vocabulary choice session is active.");
    }
    const text = applyVocabularyChoices(session.plan, session.choices);
    this.active = undefined;
    return freeze({
      outcome: "cancelled",
      text,
      originalText: session.originalText,
      plan: session.plan,
      telemetry: createTelemetry({
        sessionId: session.sessionId,
        outcome: "cancelled",
        plan: session.plan,
        snapshot: session.snapshot,
        text: session.originalText,
        output: text,
        choiceCount: session.choices.size,
        reason: "original_preserved_for_pending_groups",
      }),
    });
  }

  /**
   * Release a pending plan without applying automatic replacements or any
   * choices already recorded.  This is intentionally distinct from `cancel`,
   * whose user-facing contract preserves those resolved choices in delivery.
   */
  discard(): void {
    this.active = undefined;
  }

  private waitingResult(
    session: VocabularyPreDeliverySession,
    reason: string,
  ): VocabularyPreDeliveryResult {
    return freeze({
      outcome: vocabularyWaitingState,
      text: applyVocabularyChoices(session.plan, session.choices),
      originalText: session.originalText,
      plan: session.plan,
      session,
      telemetry: createTelemetry({
        sessionId: session.sessionId,
        outcome: vocabularyWaitingState,
        plan: session.plan,
        snapshot: session.snapshot,
        text: session.originalText,
        output: applyVocabularyChoices(session.plan, session.choices),
        choiceCount: session.choices.size,
        reason,
      }),
    });
  }
}

/** Backwards-friendly name for callers that describe this as a resolver. */
export { VocabularyPreDeliveryCoordinator as VocabularyPreDeliveryResolver };

export function createVocabularyPreDeliveryResolver(): VocabularyPreDeliveryCoordinator {
  return new VocabularyPreDeliveryCoordinator();
}

export function createVocabularyTelemetryStage(
  telemetry: VocabularyPreDeliveryTelemetry,
): {
  stage: "vocabulary";
  status: "skipped" | "ok" | "started" | "fallback" | "waiting";
  durationMs?: number;
  reason?: string;
  snapshotRevision?: string;
  redacted: true;
  vocabulary: Omit<VocabularyPreDeliveryTelemetry, "event" | "redacted">;
} {
  const status = telemetry.outcome === "skipped"
    ? "skipped"
    : telemetry.outcome === "waiting_for_choice"
      ? "waiting"
      : telemetry.outcome === "fallback"
        ? "fallback"
        : "ok";
  return {
    stage: "vocabulary",
    status,
    ...(telemetry.snapshotRevision
      ? { snapshotRevision: telemetry.snapshotRevision }
      : {}),
    ...(telemetry.reason ? { reason: telemetry.reason } : {}),
    redacted: true,
    vocabulary: {
      sessionId: telemetry.sessionId,
      outcome: telemetry.outcome,
      ...(telemetry.snapshotRevision
        ? { snapshotRevision: telemetry.snapshotRevision }
        : {}),
      ruleCount: telemetry.ruleCount,
      matchCount: telemetry.matchCount,
      automaticCount: telemetry.automaticCount,
      askGroupCount: telemetry.askGroupCount,
      choiceCount: telemetry.choiceCount,
      inputLength: telemetry.inputLength,
      outputLength: telemetry.outputLength,
      ...(telemetry.reason ? { reason: telemetry.reason } : {}),
    },
  };
}
