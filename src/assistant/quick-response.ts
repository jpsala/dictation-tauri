import {
  isAssistantQuickChatHandoff,
  normalizeAssistantIntentText,
  type AssistantIntentResult,
} from "./intent-result";
import { runAssistantSmartAgentTurn, type AssistantSmartAgentState } from "./smart-agent";

export type AssistantQuickResponsePreset = {
  id: string;
  name: string;
  description?: string;
};

export type AssistantQuickResponseContext = {
  activePresetId?: string;
  activePresetName?: string;
  availablePresetNames?: readonly string[];
  availablePresets?: readonly AssistantQuickResponsePreset[];
  lastActivatedPresetId?: string;
  smartAgentState?: AssistantSmartAgentState;
};

export type AssistantQuickResponseAction =
  | { kind: "activate-preset"; presetId: string; presetName: string }
  | { kind: "open-settings" }
  | { kind: "show-history" };

export type AssistantQuickResponse = {
  text: string;
  handledLocally: boolean;
  intent:
    | "preset-status"
    | "help"
    | "activate-preset"
    | "cloud-status"
    | "gated-external"
    | "insert-answer"
    | "quick-chat"
    | "assistant-chat"
    | "show-markdown"
    | "option-picker"
    | "error";
  action?: AssistantQuickResponseAction;
  result: AssistantIntentResult;
};

export function createAssistantQuickResponse(
  prompt: string,
  context: AssistantQuickResponseContext = {},
): AssistantQuickResponse {
  return toQuickResponse(createAssistantIntentResult(prompt, context), prompt);
}

export function createAssistantIntentResult(
  prompt: string,
  context: AssistantQuickResponseContext = {},
): AssistantIntentResult {
  const assistantPrompt = stripAssistantPrefix(prompt);
  const normalized = normalizePrompt(assistantPrompt);

  const localCommand = resolveLocalCommand(normalized);
  if (localCommand) {
    return localCommand;
  }

  const cloudCommand = resolveCloudCommand(normalized);
  if (cloudCommand) {
    return cloudCommand;
  }

  const arithmeticAnswer = resolveArithmeticAnswer(normalized);
  if (arithmeticAnswer) {
    return arithmeticAnswer;
  }

  const smartAgent = runAssistantSmartAgentTurn(normalized, {
    activePresetId: context.activePresetId,
    activePresetName: context.activePresetName,
    presets: context.availablePresets,
    state: context.smartAgentState ?? {
      activePresetId: context.activePresetId,
      lastActivatedPresetId: context.lastActivatedPresetId,
    },
  });
  if (smartAgent.intent) {
    return smartAgent.intent;
  }

  if (isMemoryOrContextPrompt(normalized)) {
    return {
      kind: "showMarkdown",
      title: "Contexto de Lulu",
      markdown: "Necesito el asistente managed configurado para responder memoria/contexto real; no lo voy a pegar como dictado ni abrir Recovery.",
    };
  }

  if (isAssistantQuickChatHandoff(normalized)) {
    return {
      kind: "quickChat",
      initialUserText: assistantPrompt,
    };
  }

  if (isHelpPrompt(normalized)) {
    const presets = (context.availablePresetNames ?? []).filter(Boolean).join(", ");
    return {
      kind: "notify",
      level: "info",
      message: presets
        ? `Puedo ayudar con presets (${presets}), calculos cortos y preguntas via asistente managed.`
        : "Puedo ayudar con presets, calculos cortos y preguntas via asistente managed.",
    };
  }

  return {
    kind: "toolAction",
    tool: "run_assistant_chat",
    args: { prompt: assistantPrompt },
    confirmation: "none",
  };
}

function toQuickResponse(result: AssistantIntentResult, originalPrompt: string): AssistantQuickResponse {
  switch (result.kind) {
    case "insertText":
      return {
        text: result.text,
        handledLocally: true,
        intent: "insert-answer",
        result,
      };
    case "notify":
      return {
        text: result.message,
        handledLocally: true,
        intent: result.message.toLowerCase().includes("preset activo") || result.message.toLowerCase().includes("no hay preset")
          ? "preset-status"
          : "help",
        result,
      };
    case "quickChat":
      return {
        text: result.initialAssistantText ?? "Abriendo Quick Chat.",
        handledLocally: true,
        intent: "quick-chat",
        result,
      };
    case "showMarkdown":
      return {
        text: result.markdown,
        handledLocally: true,
        intent: "show-markdown",
        result,
      };
    case "optionPicker":
      return {
        text: result.prompt,
        handledLocally: true,
        intent: "option-picker",
        result,
      };
    case "toolAction":
      return toToolActionQuickResponse(result, originalPrompt);
    case "error":
      return {
        text: result.message,
        handledLocally: true,
        intent: result.message.includes("Fixvox Cloud requiere confirmacion") ? "gated-external" : "error",
        result,
      };
  }
}

function toToolActionQuickResponse(result: Extract<AssistantIntentResult, { kind: "toolAction" }>, originalPrompt: string): AssistantQuickResponse {
  if (result.tool === "preset.activate") {
    const presetId = typeof result.args.presetId === "string" ? result.args.presetId : "";
    const presetName = typeof result.args.presetName === "string" ? result.args.presetName : presetId;
    return {
      text: `Preset activo: ${presetName}.`,
      handledLocally: true,
      intent: "activate-preset",
      action: { kind: "activate-preset", presetId, presetName },
      result,
    };
  }

  if (result.tool === "settings.open") {
    return {
      text: "Abriendo Settings.",
      handledLocally: true,
      intent: result.args.panel === "fixvox-cloud" ? "cloud-status" : "quick-chat",
      action: { kind: "open-settings" },
      result,
    };
  }

  if (result.tool === "history.show") {
    return {
      text: "Abriendo historial de resultados.",
      handledLocally: true,
      intent: "quick-chat",
      action: { kind: "show-history" },
      result,
    };
  }

  if (result.tool === "run_assistant_chat") {
    return {
      text: "Assistant managed chat pending.",
      handledLocally: false,
      intent: "assistant-chat",
      result,
    };
  }

  return {
    text: `Assistant tool ${result.tool} is pending for ${originalPrompt.trim()}.`,
    handledLocally: true,
    intent: "help",
    result,
  };
}

function resolveLocalCommand(normalized: string): AssistantIntentResult | undefined {
  if (/(abrir|abri|abre|open|mostrar|mostra|show|ir a|go to)\b/u.test(normalized) && /\b(settings|configuracion|preferencias|ajustes)\b/u.test(normalized)) {
    return {
      kind: "toolAction",
      tool: "settings.open",
      args: {},
      confirmation: "none",
    };
  }

  if (/(abrir|abre|open|mostrar|mostra|show|ver)\b/u.test(normalized) && /\b(historial|history|resultados|results)\b/u.test(normalized)) {
    return {
      kind: "toolAction",
      tool: "history.show",
      args: {},
      confirmation: "none",
    };
  }

  return undefined;
}

function resolveArithmeticAnswer(normalized: string): AssistantIntentResult | undefined {
  const expression = extractArithmeticExpression(normalized);
  if (!expression) {
    return undefined;
  }

  const result = evaluateSimpleArithmetic(expression.left, expression.operator, expression.right);
  if (result === undefined) {
    return undefined;
  }

  return {
    kind: "insertText",
    text: Number.isInteger(result) ? String(result) : String(Number(result.toFixed(6))),
    reason: "assistant-arithmetic",
  };
}

function extractArithmeticExpression(normalized: string): { left: number; operator: "+" | "-" | "*" | "/"; right: number } | undefined {
  const compact = normalized
    .replace(/\b(cuanto|cuanta|cuantos|cuantas|es|son|calcula|calculate|what|is|equals?)\b/gu, " ")
    .replace(/\b(mas|plus)\b/gu, " + ")
    .replace(/\b(menos|minus)\b/gu, " - ")
    .replace(/\b(por|times)\b/gu, " * ")
    .replace(/\b(x|multiplicado|multiplied)\b/gu, " * ")
    .replace(/\b(dividido|entre|sobre|divided by|over)\b/gu, " / ")
    .replace(/[?¿]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const match = /^(.+?)\s*([+\-*/])\s*(.+?)$/u.exec(compact);
  if (!match) {
    return undefined;
  }

  const left = parseSmallNumber(match[1] ?? "");
  const right = parseSmallNumber(match[3] ?? "");
  const operator = match[2] as "+" | "-" | "*" | "/";
  return left === undefined || right === undefined ? undefined : { left, operator, right };
}

function parseSmallNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (/^-?\d+(?:[.,]\d+)?$/u.test(trimmed)) {
    return Number(trimmed.replace(",", "."));
  }
  const numberWords: Record<string, number> = {
    cero: 0,
    zero: 0,
    uno: 1,
    un: 1,
    una: 1,
    one: 1,
    dos: 2,
    two: 2,
    tres: 3,
    three: 3,
    cuatro: 4,
    four: 4,
    cinco: 5,
    five: 5,
    seis: 6,
    six: 6,
    siete: 7,
    seven: 7,
    ocho: 8,
    eight: 8,
    nueve: 9,
    nine: 9,
    diez: 10,
    ten: 10,
  };
  return numberWords[trimmed];
}

function evaluateSimpleArithmetic(left: number, operator: "+" | "-" | "*" | "/", right: number): number | undefined {
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? undefined : left / right;
  }
}

function resolveCloudCommand(normalized: string): AssistantIntentResult | undefined {
  if (!/\b(fixvox cloud|cloud|nube|cuenta|login|signin|sign in)\b/u.test(normalized)) {
    return undefined;
  }

  if (/\b(conectar|conectame|login|signin|sign in|iniciar sesion|registrar|register|activar|activate|importar|import|sync|sincronizar|refresh|refrescar)\b/u.test(normalized)) {
    return {
      kind: "error",
      message: "Esa accion de Fixvox Cloud requiere confirmacion explicita desde Settings; no inicio login, sync, import ni cambios externos desde Lulu.",
      recoverable: false,
    };
  }

  if (/\b(estado|status|policy|politica|capabilities|capacidades|ver|mostrar|mostra|show)\b/u.test(normalized)) {
    return {
      kind: "toolAction",
      tool: "settings.open",
      args: { panel: "fixvox-cloud" },
      confirmation: "none",
    };
  }

  return undefined;
}

function resolvePresetActivation(
  normalized: string,
  presets: readonly AssistantQuickResponsePreset[],
): AssistantIntentResult | undefined {
  if (!isPresetActivationPrompt(normalized)) {
    return undefined;
  }

  const jpMatches = /\bjp\b/u.test(normalized)
    ? presets.filter((preset) => meaningfulTokens(normalizePrompt(`${preset.id} ${preset.name}`).replace(/-/gu, " ")).includes("jp"))
    : [];
  if (jpMatches.length > 1) {
    return {
      kind: "optionPicker",
      title: "Elegir preset",
      prompt: "Encontré más de un preset para JP.",
      options: jpMatches.map((preset) => ({ id: preset.id, label: preset.name })),
    };
  }

  const matches = findMentionedPresets(normalized, presets);
  if (matches.length > 1 && matches[0]?.score === matches[1]?.score) {
    const topScore = matches[0].score;
    const options = matches
      .filter((entry) => entry.score === topScore)
      .map(({ preset }) => ({ id: preset.id, label: preset.name }));
    return {
      kind: "optionPicker",
      title: "Elegir preset",
      prompt: options.some((option) => normalizePrompt(option.label).includes("jp"))
        ? "Encontré más de un preset para JP."
        : "Encontré más de un preset posible.",
      options,
    };
  }

  const preset = matches[0]?.preset;
  if (!preset) {
    return {
      kind: "error",
      message: "No encontré ese preset para activar.",
      recoverable: true,
    };
  }

  return presetActivationToolAction(preset);
}

function resolveCorrectionPresetActivation(
  normalized: string,
  presets: readonly AssistantQuickResponsePreset[],
): AssistantIntentResult | undefined {
  if (!/\b(activar|activa|activate|set|usar|usa|cambiar|cambia)\b/u.test(normalized)) {
    return undefined;
  }
  if (!/\b(arregla|arreglar|corrige|corregir|fix|writing|texto|text)\b/u.test(normalized)) {
    return undefined;
  }

  const wantsEnglish = /\b(ingles|english|en)\b/u.test(normalized);
  const target = findCorrectionPreset(presets, wantsEnglish);
  return target ? presetActivationToolAction(target) : undefined;
}

function resolveEnglishVariantFollowUp(
  normalized: string,
  presets: readonly AssistantQuickResponsePreset[],
  lastActivatedPresetId: string | undefined,
): AssistantIntentResult | undefined {
  if (!lastActivatedPresetId || !/\b(otro|otra|other|ingles|english)\b/u.test(normalized)) {
    return undefined;
  }

  const last = presets.find((preset) => preset.id === lastActivatedPresetId);
  if (!last || !isCorrectionPreset(last, false)) {
    return undefined;
  }

  const english = findCorrectionPreset(presets, true);
  return english ? presetActivationToolAction(english) : undefined;
}

function presetActivationToolAction(preset: AssistantQuickResponsePreset): AssistantIntentResult {
  return {
    kind: "toolAction",
    tool: "preset.activate",
    args: { presetId: preset.id, presetName: preset.name },
    confirmation: "none",
  };
}

function isPresetActivationPrompt(normalized: string): boolean {
  return normalized.includes("preset") && /\b(activar|activa|activate|set|usar|usa|cambiar|cambia)\b/u.test(normalized);
}

function findMentionedPresets(
  normalizedPrompt: string,
  presets: readonly AssistantQuickResponsePreset[],
): Array<{ preset: AssistantQuickResponsePreset; score: number }> {
  return presets
    .map((preset) => ({ preset, score: presetMentionScore(normalizedPrompt, preset) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
}

function presetMentionScore(normalizedPrompt: string, preset: AssistantQuickResponsePreset): number {
  const normalizedName = normalizePrompt(preset.name);
  const normalizedId = normalizePrompt(preset.id).replace(/-/gu, " ");
  if (normalizedName && normalizedPrompt.includes(normalizedName)) {
    return normalizedName.length + 20;
  }
  if (normalizedId && normalizedPrompt.includes(normalizedId)) {
    return normalizedId.length + 10;
  }
  const nameTokens = meaningfulTokens(normalizedName);
  const idTokens = meaningfulTokens(normalizedId);
  const matchedTokens = [...new Set([...nameTokens, ...idTokens])].filter((token) => normalizedPrompt.includes(token));
  return matchedTokens.length >= Math.min(1, nameTokens.length || idTokens.length) ? matchedTokens.join(" ").length : 0;
}

function findCorrectionPreset(
  presets: readonly AssistantQuickResponsePreset[],
  wantsEnglish: boolean,
): AssistantQuickResponsePreset | undefined {
  return presets.find((preset) => isCorrectionPreset(preset, wantsEnglish));
}

function isCorrectionPreset(preset: AssistantQuickResponsePreset, wantsEnglish: boolean): boolean {
  const id = normalizePrompt(preset.id).replace(/-/gu, " ");
  const name = normalizePrompt(preset.name);
  return wantsEnglish
    ? id.includes("fix writing") || name.includes("fix writing") || name.includes("english")
    : id.includes("corregir texto") || name.includes("corregir texto");
}

function meaningfulTokens(value: string): string[] {
  return value.split(/\s+/u).filter((token) => token.length >= 2 && !["preset", "texto", "text"].includes(token));
}

function isPresetStatusPrompt(normalized: string): boolean {
  return normalized.includes("preset") && (
    normalized.includes("activo") ||
    normalized.includes("active") ||
    normalized.includes("actual") ||
    normalized.includes("current")
  );
}

function isMemoryOrContextPrompt(normalized: string): boolean {
  return /\b(memoria|memory|contexto|context)\b/u.test(normalized) && /\b(que|ver|mostrar|mostra|tenes|tienes|hay|show|what)\b/u.test(normalized);
}

function isHelpPrompt(normalized: string): boolean {
  return /\b(help|ayuda|que puedes|que podes|que haces|opciones)\b/u.test(normalized);
}

function stripAssistantPrefix(value: string): string {
  const normalized = normalizeAssistantIntentText(value);
  const prefixMatch = /^(lulu|ludo|assistant|asistente|ai|zuno)\b[\s:,-]*(.*)$/u.exec(normalized);
  if (!prefixMatch) {
    return value.trim();
  }

  const originalBody = value.trim().replace(/^(lulu|ludo|assistant|asistente|ai|zuno)\b[\s:,-]*/iu, "").trim();
  return originalBody || prefixMatch[2]?.trim() || value.trim();
}

function normalizePrompt(value: string): string {
  return normalizeAssistantIntentText(value);
}
