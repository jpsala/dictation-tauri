import type { AssistantIntentResult } from "./intent-result";

export type AssistantSmartAgentPreset = {
  id: string;
  name: string;
  description?: string;
};

export type AssistantSmartAgentToolName =
  | "preset.getActive"
  | "preset.activate"
  | "preset.clearActive"
  | "optionPicker";

export type AssistantSmartAgentToolCall = {
  name: AssistantSmartAgentToolName;
  args: Record<string, unknown>;
};

export type AssistantSmartAgentToolResult = {
  name: AssistantSmartAgentToolName;
  ok: boolean;
  result?: unknown;
  error?: string;
  interrupt?: Extract<AssistantIntentResult, { kind: "optionPicker" }>;
};

export type AssistantSmartAgentState = {
  activePresetId?: string;
  lastActivatedPresetId?: string;
  recentToolResults?: readonly AssistantSmartAgentToolResult[];
};

export type AssistantSmartAgentTurnResult = {
  handled: boolean;
  intent?: AssistantIntentResult;
  state: AssistantSmartAgentState;
  toolCalls: AssistantSmartAgentToolCall[];
  toolResults: AssistantSmartAgentToolResult[];
};

export type AssistantSmartAgentTurnOptions = {
  activePresetId?: string;
  activePresetName?: string;
  presets?: readonly AssistantSmartAgentPreset[];
  state?: AssistantSmartAgentState;
};

export function runAssistantSmartAgentTurn(
  normalizedPrompt: string,
  options: AssistantSmartAgentTurnOptions = {},
): AssistantSmartAgentTurnResult {
  const state: AssistantSmartAgentState = {
    activePresetId: options.state?.activePresetId ?? options.activePresetId,
    lastActivatedPresetId: options.state?.lastActivatedPresetId,
    recentToolResults: options.state?.recentToolResults ?? [],
  };
  const presets = [...(options.presets ?? [])];
  const planned = planPresetToolCall(normalizedPrompt, presets, state);
  if (!planned) {
    return { handled: false, state, toolCalls: [], toolResults: [] };
  }

  const result = executePresetToolCall(planned, {
    presets,
    activePresetId: state.activePresetId,
    activePresetName: options.activePresetName,
  });
  const nextState = updateAssistantSmartAgentState(state, result);
  const intent = toolResultToIntent(planned, result, options.activePresetName);

  return {
    handled: true,
    intent,
    state: nextState,
    toolCalls: [planned],
    toolResults: [result],
  };
}

function planPresetToolCall(
  normalized: string,
  presets: readonly AssistantSmartAgentPreset[],
  state: AssistantSmartAgentState,
): AssistantSmartAgentToolCall | undefined {
  if (isPresetStatusPrompt(normalized)) {
    return { name: "preset.getActive", args: {} };
  }

  if (isPresetClearPrompt(normalized)) {
    return { name: "preset.clearActive", args: {} };
  }

  const englishVariant = resolveEnglishVariantFollowUp(normalized, presets, state.lastActivatedPresetId ?? state.activePresetId);
  if (englishVariant) {
    return { name: "preset.activate", args: { presetId: englishVariant.id, presetName: englishVariant.name } };
  }

  if (!isPresetActivationPrompt(normalized)) {
    return undefined;
  }

  const activationTarget = resolveActivationTarget(normalized, presets);
  if (activationTarget.kind === "single") {
    return {
      name: "preset.activate",
      args: { presetId: activationTarget.preset.id, presetName: activationTarget.preset.name },
    };
  }
  if (activationTarget.kind === "ambiguous") {
    return {
      name: "optionPicker",
      args: {
        title: "Elegir preset",
        prompt: activationTarget.reason,
        options: activationTarget.presets.map((preset) => ({
          id: preset.id,
          label: preset.name,
          ...(preset.description ? { description: preset.description } : {}),
        })),
      },
    };
  }

  return { name: "preset.activate", args: { presetId: "", presetName: "" } };
}

function executePresetToolCall(
  call: AssistantSmartAgentToolCall,
  runtime: {
    presets: readonly AssistantSmartAgentPreset[];
    activePresetId?: string;
    activePresetName?: string;
  },
): AssistantSmartAgentToolResult {
  if (call.name === "preset.getActive") {
    const preset = runtime.activePresetId
      ? runtime.presets.find((item) => item.id === runtime.activePresetId)
      : undefined;
    return {
      name: call.name,
      ok: true,
      result: {
        presetId: runtime.activePresetId ?? null,
        preset: preset ?? (runtime.activePresetName ? { id: runtime.activePresetId ?? "active", name: runtime.activePresetName } : null),
      },
    };
  }

  if (call.name === "preset.activate") {
    const presetId = typeof call.args.presetId === "string" ? call.args.presetId.trim() : "";
    const preset = runtime.presets.find((item) => item.id === presetId);
    if (!preset) {
      return {
        name: call.name,
        ok: false,
        error: "No encontré ese preset para activar.",
      };
    }
    return {
      name: call.name,
      ok: true,
      result: { presetId: preset.id, preset },
    };
  }

  if (call.name === "preset.clearActive") {
    return { name: call.name, ok: true, result: { presetId: null } };
  }

  const options = normalizePickerOptions(call.args.options);
  const interrupt: Extract<AssistantIntentResult, { kind: "optionPicker" }> = {
    kind: "optionPicker",
    title: typeof call.args.title === "string" && call.args.title.trim() ? call.args.title.trim() : "Elegir preset",
    prompt: typeof call.args.prompt === "string" && call.args.prompt.trim()
      ? call.args.prompt.trim()
      : "Encontré más de un preset posible.",
    options,
  };
  return { name: call.name, ok: true, interrupt };
}

function updateAssistantSmartAgentState(
  state: AssistantSmartAgentState,
  result: AssistantSmartAgentToolResult,
): AssistantSmartAgentState {
  const nextResults = [...(state.recentToolResults ?? []), result].slice(-8);
  if (result.name === "preset.activate" && result.ok) {
    const presetId = typeof (result.result as { presetId?: unknown } | undefined)?.presetId === "string"
      ? (result.result as { presetId: string }).presetId
      : undefined;
    return {
      ...state,
      activePresetId: presetId,
      lastActivatedPresetId: presetId ?? state.lastActivatedPresetId,
      recentToolResults: nextResults,
    };
  }
  if (result.name === "preset.clearActive" && result.ok) {
    return { ...state, activePresetId: undefined, recentToolResults: nextResults };
  }
  return { ...state, recentToolResults: nextResults };
}

function toolResultToIntent(
  call: AssistantSmartAgentToolCall,
  result: AssistantSmartAgentToolResult,
  activePresetName?: string,
): AssistantIntentResult {
  if (!result.ok) {
    return { kind: "error", message: result.error ?? "La herramienta del asistente falló.", recoverable: true };
  }

  if (result.interrupt) {
    return result.interrupt;
  }

  if (call.name === "preset.getActive") {
    const payload = result.result as { preset?: { name?: string } | null } | undefined;
    const presetName = payload?.preset?.name?.trim() || activePresetName?.trim();
    return {
      kind: "notify",
      level: "info",
      message: presetName ? `Preset activo: ${presetName}.` : "No hay preset activo ahora.",
    };
  }

  if (call.name === "preset.activate") {
    const payload = result.result as { preset?: { id?: string; name?: string } | null } | undefined;
    const presetId = payload?.preset?.id ?? (typeof call.args.presetId === "string" ? call.args.presetId : "");
    const presetName = payload?.preset?.name ?? (typeof call.args.presetName === "string" ? call.args.presetName : presetId);
    return {
      kind: "toolAction",
      tool: "preset.activate",
      args: { presetId, presetName },
      confirmation: "none",
    };
  }

  return {
    kind: "toolAction",
    tool: "preset.clearActive",
    args: {},
    confirmation: "none",
  };
}

function resolveActivationTarget(
  normalized: string,
  presets: readonly AssistantSmartAgentPreset[],
):
  | { kind: "none" }
  | { kind: "single"; preset: AssistantSmartAgentPreset }
  | { kind: "ambiguous"; presets: AssistantSmartAgentPreset[]; reason: string } {
  const jpMatches = /\bjp\b/u.test(normalized)
    ? presets.filter((preset) => meaningfulTokens(presetSearchText(preset)).includes("jp"))
    : [];
  if (jpMatches.length === 1) {
    return { kind: "single", preset: jpMatches[0] };
  }
  if (jpMatches.length > 1) {
    return { kind: "ambiguous", presets: jpMatches, reason: "Encontré más de un preset para JP." };
  }

  const correctionPreset = resolveCorrectionPreset(normalized, presets);
  if (correctionPreset) {
    return { kind: "single", preset: correctionPreset };
  }

  const matches = findMentionedPresets(normalized, presets);
  if (!matches.length) {
    return { kind: "none" };
  }
  if (matches.length > 1 && matches[0]?.score === matches[1]?.score) {
    const topScore = matches[0].score;
    return {
      kind: "ambiguous",
      reason: matches.some((entry) => presetSearchText(entry.preset).includes("jp"))
        ? "Encontré más de un preset para JP."
        : "Encontré más de un preset posible.",
      presets: matches.filter((entry) => entry.score === topScore).map((entry) => entry.preset),
    };
  }

  return { kind: "single", preset: matches[0].preset };
}

function resolveCorrectionPreset(
  normalized: string,
  presets: readonly AssistantSmartAgentPreset[],
): AssistantSmartAgentPreset | undefined {
  if (!/\b(arregla|corrige|corregir|fix|writing|texto|text)\b/u.test(normalized)) {
    return undefined;
  }
  const wantsEnglish = /\b(ingles|english|en)\b/u.test(normalized);
  return presets.find((preset) => isCorrectionPreset(preset, wantsEnglish));
}

function resolveEnglishVariantFollowUp(
  normalized: string,
  presets: readonly AssistantSmartAgentPreset[],
  lastActivatedPresetId: string | undefined,
): AssistantSmartAgentPreset | undefined {
  if (!lastActivatedPresetId || !/\b(no|otro|otra|ingles|english)\b/u.test(normalized)) {
    return undefined;
  }
  const last = presets.find((preset) => preset.id === lastActivatedPresetId);
  if (!last || !isCorrectionPreset(last, false)) {
    return undefined;
  }
  if (/\b(ingles|english|otro|otra)\b/u.test(normalized)) {
    return presets.find((preset) => isCorrectionPreset(preset, true));
  }
  return undefined;
}

function findMentionedPresets(
  normalizedPrompt: string,
  presets: readonly AssistantSmartAgentPreset[],
): Array<{ preset: AssistantSmartAgentPreset; score: number }> {
  return presets
    .map((preset) => ({ preset, score: presetMentionScore(normalizedPrompt, preset) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
}

function presetMentionScore(normalizedPrompt: string, preset: AssistantSmartAgentPreset): number {
  const presetText = presetSearchText(preset);
  if (normalizedPrompt.includes(presetText)) {
    return 10;
  }
  return meaningfulTokens(presetText).reduce((score, token) => (
    normalizedPrompt.includes(token) ? score + (token.length >= 4 ? 2 : 1) : score
  ), 0);
}

function isCorrectionPreset(preset: AssistantSmartAgentPreset, wantsEnglish: boolean): boolean {
  const text = presetSearchText(preset);
  const looksEnglish = /\b(fix|writing|english|en)\b/u.test(text);
  const looksSpanish = /\b(corregir|corregir texto|espanol|es)\b/u.test(text);
  const looksCorrection = /\b(corregir|fix|writing|texto|text)\b/u.test(text);
  return looksCorrection && (wantsEnglish ? looksEnglish : looksSpanish || !looksEnglish);
}

function normalizePickerOptions(value: unknown): Array<{ id: string; label: string; description?: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((option): Array<{ id: string; label: string; description?: string }> => {
    if (typeof option !== "object" || option === null) {
      return [];
    }
    const record = option as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!id || !label) {
      return [];
    }
    return [{ id, label, ...(typeof record.description === "string" && record.description.trim() ? { description: record.description.trim() } : {}) }];
  });
}

function isPresetStatusPrompt(normalized: string): boolean {
  return /\b(que|cual|what|which)\b.*\b(preset|peset|skill)\b.*\b(activo|active|usando|current)\b/u.test(normalized)
    || /\b(preset|peset|skill)\b.*\b(activo|active|actual|current)\b/u.test(normalized);
}

function isPresetClearPrompt(normalized: string): boolean {
  return /\b(clear|limpia|borra|desactiva)\b.*\b(preset|peset|skill)\b/u.test(normalized);
}

function isPresetActivationPrompt(normalized: string): boolean {
  return /\b(activa|active|activar|usa|usar|deja|dejar|configura|configurar)\b/u.test(normalized)
    || /\b(el que|la que|preset|peset|skill)\b/u.test(normalized) && /\b(arregla|corrige|fix|writing|texto|text|jp)\b/u.test(normalized);
}

function presetSearchText(preset: AssistantSmartAgentPreset): string {
  return normalize(`${preset.id} ${preset.name} ${preset.description ?? ""}`.replace(/-/gu, " "));
}

function meaningfulTokens(value: string): string[] {
  return value.split(/\s+/u).filter((token) => token.length >= 2 && !["de", "el", "la", "the", "and", "for"].includes(token));
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}
