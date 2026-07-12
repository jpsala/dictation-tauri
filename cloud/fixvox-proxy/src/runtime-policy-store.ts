import type { KvNamespaceLike } from "./admin-store";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = { [key: string]: JsonValue };

export type RuntimePolicyEnvelope = {
  policy: JsonRecord;
  updatedAt: string;
};

export type RuntimePolicyReadResult = RuntimePolicyEnvelope & {
  source: "default" | "stored";
};

export type VoiceRoutingLabel = "quality" | "speed" | "cost";

export type VoiceRoutingResolved = {
  label: VoiceRoutingLabel;
  matchedCohort: string | null;
  source: "backend-cohort" | "backend-default";
  speech: {
    provider: "openai" | "groq";
    model: string;
    policy: "locked" | "default";
  };
  runtime: {
    sttPromptEnabled: boolean;
    postProcessEnabled: boolean;
  };
};

export type RegisterUserSettingsDefaults = {
  appearance: {
    themeId: string;
    dockSkin: 1 | 2 | 4;
  };
  general: {
    onboardingDone: boolean;
    showDockOnStartup: boolean;
    startWithWindows: boolean;
    preferredSurface: "internal" | "alpha";
    uiLanguage: "system" | "es" | "en";
  };
  hotkeys: {
    pasteLast: string;
    quickChat: string;
    resultHistory: string;
    picker: string;
    pushToTalk: string;
    stopAndSubmit: string;
    toggleAssistantMode: string;
    togglePressEnterAfterPaste: string;
    voiceRecord: string;
  };
  transcript: {
    language: string;
  };
  voice: {
    muteOutputDuringRecording: boolean;
    pressEnterAfterPaste: boolean;
    showQuickChatReasoning: boolean;
    showPresetReasoning: boolean;
    assistantWakeWords: string;
    assistantModeToggleWords: string;
    commandWakeWords: string;
  };
};

const RUNTIME_POLICY_KEY = "control:policy:runtime";
const DEFAULT_POST_PROCESS_TARGET = {
  provider: "groq",
  model: "openai/gpt-oss-120b",
  policy: "locked",
} as const;

const RECOMMENDED_ALPHA_RUNTIME_POLICY: JsonRecord = {
  runtimeMode: "managed",
  assistant: {
    chat: {
      promptBase: "",
    },
    quickChat: {
      promptBase: "",
    },
  },
  ui: {
    hideProviderModelSelectors: true,
    hidePresetProviderModelOverrides: true,
    showAdvancedSettings: false,
    showDebugTools: false,
  },
  llm: {
    targets: {
      default: {
        provider: "groq",
        model: "llama-3.1-8b-instant",
        policy: "locked",
      },
      assistant: {
        provider: "groq",
        model: "llama-3.1-8b-instant",
        policy: "locked",
      },
      translate: {
        provider: "groq",
        model: "llama-3.3-70b-versatile",
        policy: "locked",
      },
      postProcess: {
        provider: "groq",
        model: "openai/gpt-oss-120b",
        policy: "locked",
      },
      selectionTransform: {
        provider: "groq",
        model: "llama-3.3-70b-versatile",
        policy: "locked",
      },
      presetFallback: {
        provider: "groq",
        model: "openai/gpt-oss-120b",
        policy: "default",
      },
    },
    presetOverridePolicy: "deny",
  },
  speech: {
    transcription: {
      provider: "groq",
      model: "whisper-large-v3-turbo",
      policy: "locked",
    },
    language: {
      value: "auto",
      policy: "default",
    },
  },
  prompts: {
    transcriptBase: {
      text: "Transcribí en español rioplatense. Puede incluir términos técnicos, comandos y nombres de modelos. Conservá exactamente comandos, paquetes, modelos, archivos, URLs, emails, números, guiones, puntos y mayúsculas cuando formen parte del término. Si el hablante dice palabras de puntuación o lista como punto y aparte, coma, dos puntos, primero, segundo o tercero, transcribilas literalmente para que otro paso las formatee. Devolvé solo la transcripción final.",
      policy: "locked",
    },
    postProcessBase: {
      text: "Clean Spanish/bilingual dictation with minimal edits. Preserve wording, language mix, and verb tense. Convert spoken punctuation commands when clear; keep literal words when uncertain. Preserve or reconstruct clear technical tokens: app punto svelte -> app.svelte; voice doc output ts -> voice-dock-output.ts; banRanDev/bun randev -> bun run dev; npmRanDev/npm randev -> npm run dev; fixbox.local -> fixvox.local; fixbox.dev -> fixvox.dev; llama 3.370B versatile -> llama-3.3-70b-versatile. Prefer same-paragraph sentence breaks; do not add blank lines except around numbered lists. If a sentence is immediately followed by primero/segundo/tercero items, end that sentence with a colon, format 1/2/3 on separate lines, use comma after items 1 and 2 and period after the final item, then resume following prose after the list.",
      policy: "default",
    },
    translateBase: {
      text: "Translate faithfully and naturally. Preserve meaning, tone, and intent.",
      policy: "default",
    },
    selectionTransformBase: {
      text: "Rewrite the selected text according to the user's instruction while preserving intent and formatting when possible.",
      policy: "default",
    },
  },
  features: {
    byok: false,
    "presets.edit": true,
    "presets.run": true,
    "results.history": true,
    presetEditing: true,
    voiceRouting: true,
    historyRetry: true,
    telemetryInspector: false,
  },
  voiceRouting: {
    enabled: true,
    defaultLabel: "quality",
    cohortAssignments: {
      default: "quality",
      fast: "speed",
      cheap: "cost",
    },
    policies: {
      quality: {
        speech: {
          provider: "groq",
          model: "whisper-large-v3-turbo",
          policy: "locked",
        },
        runtime: {
          sttPromptEnabled: true,
          postProcessEnabled: false,
        },
      },
      speed: {
        speech: {
          provider: "groq",
          model: "whisper-large-v3-turbo",
          policy: "locked",
        },
        runtime: {
          sttPromptEnabled: true,
          postProcessEnabled: false,
        },
      },
      cost: {
        speech: {
          provider: "groq",
          model: "whisper-large-v3-turbo",
          policy: "locked",
        },
        runtime: {
          sttPromptEnabled: true,
          postProcessEnabled: false,
        },
      },
    },
  },
  managedUsage: {
    unit: "managedUsageUnit",
    estimatePerRequest: 1,
    globalMultiplier: 1,
    groups: {
      "alpha-private": {
        rolling5hLimit: 80,
        weeklyLimit: 700,
        transcriptionRolling5hSeconds: 7_200,
        transcriptionWeeklySeconds: 36_000,
        aiActionsRolling5hLimit: 40,
        aiActionsWeeklyLimit: 300,
        quotaMultiplier: 1,
      },
      "alpha-basic": {
        rolling5hLimit: 80,
        weeklyLimit: 700,
        transcriptionRolling5hSeconds: 3_600,
        transcriptionWeeklySeconds: 10_800,
        aiActionsRolling5hLimit: 20,
        aiActionsWeeklyLimit: 100,
        quotaMultiplier: 1,
      },
      "alpha-full": {
        rolling5hLimit: 150,
        weeklyLimit: 1500,
        transcriptionRolling5hSeconds: 10_800,
        transcriptionWeeklySeconds: 72_000,
        aiActionsRolling5hLimit: 80,
        aiActionsWeeklyLimit: 700,
        quotaMultiplier: 1,
      },
    },
  },
  transport: {
    mode: "proxy-only",
  },
  userSettingsDefaults: {
    appearance: {
      themeId: "github-light",
      dockSkin: 4,
    },
    general: {
      onboardingDone: false,
      showDockOnStartup: true,
      startWithWindows: false,
      preferredSurface: "alpha",
      uiLanguage: "system",
    },
    hotkeys: {
      pasteLast: "Alt+Shift+X",
      quickChat: "Alt+Shift+C",
      resultHistory: "Alt+Shift+Z",
      picker: "Alt+Q",
      pushToTalk: "Ctrl+Alt+Space",
      stopAndSubmit: "Alt+Shift+Space",
      toggleAssistantMode: "",
      togglePressEnterAfterPaste: "",
      voiceRecord: "Alt+Space",
    },
    transcript: {
      language: "",
    },
    voice: {
      muteOutputDuringRecording: true,
      pressEnterAfterPaste: false,
      showQuickChatReasoning: true,
      showPresetReasoning: false,
      assistantWakeWords: "assistant,asistente,ai,zuno,lulu",
      assistantModeToggleWords: "assistant,asistente,ai,zuno,lulu",
      commandWakeWords: "comando,command",
    },
  },
};

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function cloneRecord<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function policyEquals(left: JsonRecord, right: JsonRecord): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function nowIso(): string {
  return new Date().toISOString();
}

function readRuntimeMode(policy: JsonRecord): "managed" | "local" {
  const value = typeof policy.runtimeMode === "string" ? policy.runtimeMode.trim().toLowerCase() : "";
  if (value === "managed") return "managed";
  return value === "local" || value === "byok" ? "local" : "managed";
}

function readNestedRecord(source: JsonRecord, key: string): JsonRecord | null {
  return asRecord(source[key]);
}

function readString(source: JsonRecord | null, key: string): string | null {
  if (!source) return null;
  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBooleanMap(source: JsonRecord | null): Record<string, boolean> {
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
  );
}

function readUserSettingsDefaults(policy: JsonRecord): RegisterUserSettingsDefaults | null {
  const record = readNestedRecord(policy, "userSettingsDefaults");
  if (!record) {
    return null;
  }

  const appearance = readNestedRecord(record, "appearance");
  const general = readNestedRecord(record, "general");
  const hotkeys = readNestedRecord(record, "hotkeys");
  const transcript = readNestedRecord(record, "transcript");
  const voice = readNestedRecord(record, "voice");
  return {
    appearance: {
      themeId: readString(appearance, "themeId") ?? "github-light",
      dockSkin: appearance?.dockSkin === 1 || appearance?.dockSkin === 2 ? appearance.dockSkin : 4,
    },
    general: {
      onboardingDone: Boolean(general?.onboardingDone),
      showDockOnStartup: general?.showDockOnStartup === undefined ? true : Boolean(general.showDockOnStartup),
      startWithWindows: Boolean(general?.startWithWindows),
      preferredSurface: general?.preferredSurface === "internal" ? "internal" : "alpha",
      uiLanguage: general?.uiLanguage === "es" || general?.uiLanguage === "en" ? general.uiLanguage : "system",
    },
    hotkeys: {
      pasteLast: readString(hotkeys, "pasteLast") ?? "Alt+Shift+X",
      quickChat: readString(hotkeys, "quickChat") ?? "Alt+Shift+C",
      resultHistory: readString(hotkeys, "resultHistory") ?? "Alt+Shift+Z",
      picker: readString(hotkeys, "picker") ?? "Alt+Q",
      pushToTalk: readString(hotkeys, "pushToTalk") ?? "Ctrl+Alt+Space",
      stopAndSubmit: readString(hotkeys, "stopAndSubmit") ?? "Alt+Shift+Space",
      toggleAssistantMode: readString(hotkeys, "toggleAssistantMode") ?? "",
      togglePressEnterAfterPaste: readString(hotkeys, "togglePressEnterAfterPaste") ?? "",
      voiceRecord: readString(hotkeys, "voiceRecord") ?? "Alt+Space",
    },
    transcript: {
      language: readString(transcript, "language") ?? "",
    },
    voice: {
      muteOutputDuringRecording: voice?.muteOutputDuringRecording === undefined ? true : Boolean(voice.muteOutputDuringRecording),
      pressEnterAfterPaste: Boolean(voice?.pressEnterAfterPaste),
      showQuickChatReasoning: voice?.showQuickChatReasoning === undefined ? true : Boolean(voice.showQuickChatReasoning),
      showPresetReasoning: Boolean(voice?.showPresetReasoning),
      assistantWakeWords: readString(voice, "assistantWakeWords") ?? "assistant,asistente,ai,zuno,lulu",
      assistantModeToggleWords: readString(voice, "assistantModeToggleWords") ?? "assistant,asistente,ai,zuno,lulu",
      commandWakeWords: readString(voice, "commandWakeWords") ?? "comando,command",
    },
  };
}

function readVoiceRoutingLabel(value: unknown): VoiceRoutingLabel | null {
  return value === "quality" || value === "speed" || value === "cost"
    ? value
    : null;
}

function readSpeechProvider(value: unknown): "openai" | "groq" {
  return value === "openai" || value === "groq" ? value : "groq";
}

function readSpeechPolicy(value: unknown): "locked" | "default" {
  return value === "default" || value === "locked" ? value : "locked";
}

export function buildDefaultRuntimePolicy(): JsonRecord {
  return cloneRecord(RECOMMENDED_ALPHA_RUNTIME_POLICY);
}

export function buildRecommendedAlphaRuntimePolicy(): JsonRecord {
  return cloneRecord(RECOMMENDED_ALPHA_RUNTIME_POLICY);
}

export async function getRuntimePolicy(store: KvNamespaceLike): Promise<RuntimePolicyReadResult> {
  const raw = await store.get(RUNTIME_POLICY_KEY);
  const parsed = parseJson<RuntimePolicyEnvelope | null>(raw, null);
  const policy = asRecord(parsed?.policy);
  if (!policy) {
    return {
      policy: buildDefaultRuntimePolicy(),
      updatedAt: nowIso(),
      source: "default",
    };
  }

  return {
    policy: cloneRecord(policy),
    updatedAt: typeof parsed?.updatedAt === "string" && parsed.updatedAt.trim() ? parsed.updatedAt : nowIso(),
    source: "stored",
  };
}

export async function putRuntimePolicy(store: KvNamespaceLike, input: unknown): Promise<RuntimePolicyEnvelope> {
  const candidate = asRecord(input)
    ?? asRecord(asRecord(input)?.policy);
  if (!candidate) {
    throw new Error("runtime policy payload must be a JSON object");
  }

  validateRuntimePolicy(candidate);

  const existing = await getRuntimePolicy(store);
  if (existing.source === "stored" && policyEquals(existing.policy, candidate)) {
    return {
      policy: cloneRecord(existing.policy),
      updatedAt: existing.updatedAt,
    };
  }

  const envelope: RuntimePolicyEnvelope = {
    policy: cloneRecord(candidate),
    updatedAt: nowIso(),
  };
  await store.put(RUNTIME_POLICY_KEY, JSON.stringify(envelope, null, 2));
  return envelope;
}

function validateRuntimePolicy(policy: JsonRecord): void {
  const runtimeMode = readRuntimeMode(policy);
  const transportMode = readString(readNestedRecord(policy, "transport"), "mode")
    ?? (runtimeMode === "managed" ? "proxy-only" : "default");

  if (runtimeMode !== "managed" || transportMode !== "proxy-only") {
    return;
  }

  const speech = readNestedRecord(policy, "speech");
  const transcription = speech ? readNestedRecord(speech, "transcription") : null;
  const transcriptionProvider = transcription ? readSpeechProvider(transcription.provider) : "groq";
  if (transcriptionProvider !== "groq") {
    throw new Error("Managed proxy-only runtime requires Groq speech transcription.");
  }

  const resolvedVoiceRouting = resolveVoiceRoutingForCohorts(policy, ["default"]);
  if (resolvedVoiceRouting && resolvedVoiceRouting.speech.provider !== "groq") {
    throw new Error("Default speech route is incompatible with the current managed proxy runtime. Use Groq speech for the active default route.");
  }
}

export async function resetRuntimePolicy(store: KvNamespaceLike): Promise<RuntimePolicyEnvelope> {
  const envelope: RuntimePolicyEnvelope = {
    policy: buildDefaultRuntimePolicy(),
    updatedAt: nowIso(),
  };
  await store.put(RUNTIME_POLICY_KEY, JSON.stringify(envelope, null, 2));
  return envelope;
}

export function resolveVoiceRoutingForCohorts(policy: JsonRecord, cohorts: string[]): VoiceRoutingResolved | null {
  const voiceRouting = readNestedRecord(policy, "voiceRouting");
  if (!voiceRouting || voiceRouting.enabled !== true) {
    return null;
  }

  const cohortAssignments = readNestedRecord(voiceRouting, "cohortAssignments") ?? {};
  const policies = readNestedRecord(voiceRouting, "policies") ?? {};
  const defaultLabel = readVoiceRoutingLabel(voiceRouting.defaultLabel);
  if (!defaultLabel) {
    return null;
  }

  const assignedCohort = cohorts.find((cohort) => Object.hasOwn(cohortAssignments, cohort)) ?? null;
  const assignedLabel = assignedCohort ? readVoiceRoutingLabel(cohortAssignments[assignedCohort]) : null;
  const matchedCohort = assignedCohort && assignedLabel ? assignedCohort : null;
  const label = assignedLabel ?? defaultLabel;

  const selected = readNestedRecord(policies, label);
  const speech = selected ? readNestedRecord(selected, "speech") : null;
  if (!speech) {
    return null;
  }

  const runtime = selected ? readNestedRecord(selected, "runtime") : null;
  return {
    label,
    matchedCohort,
    source: matchedCohort ? "backend-cohort" : "backend-default",
    speech: {
      provider: readSpeechProvider(speech.provider),
      model: readString(speech, "model") ?? "whisper-large-v3",
      policy: readSpeechPolicy(speech.policy),
    },
    runtime: {
      sttPromptEnabled: Boolean(runtime?.sttPromptEnabled),
      postProcessEnabled: Boolean(runtime?.postProcessEnabled),
    },
  };
}

export function buildRegisterDefaultsFromRuntimePolicy(policy: JsonRecord, cohorts: string[] = []): JsonRecord {
  const runtimeMode = readRuntimeMode(policy);
  const ui = readNestedRecord(policy, "ui");
  const llm = readNestedRecord(policy, "llm");
  const llmTargets = llm ? readNestedRecord(llm, "targets") : null;
  const speech = readNestedRecord(policy, "speech");
  const transcription = speech ? readNestedRecord(speech, "transcription") : null;
  const defaultLlm = llmTargets ? readNestedRecord(llmTargets, "default") : null;
  const resolvedVoiceRouting = resolveVoiceRoutingForCohorts(policy, cohorts);
  const { voiceRouting: _ignoredVoiceRouting, ...policyWithoutVoiceRouting } = cloneRecord(policy);
  const userSettingsDefaults = readUserSettingsDefaults(policy);

  const normalizedLlmTargets = {
    ...cloneRecord(llmTargets ?? {}),
    postProcess: { ...DEFAULT_POST_PROCESS_TARGET },
  };

  return {
    ...policyWithoutVoiceRouting,
    runtimeMode,
    managed: runtimeMode === "managed",
    llm: {
      ...cloneRecord(llm ?? {}),
      targets: normalizedLlmTargets,
      provider: readString(defaultLlm, "provider") ?? "groq",
      model: readString(defaultLlm, "model") ?? "llama-3.1-8b-instant",
    },
    transcript: {
      provider: readString(transcription, "provider") ?? "groq",
      model: readString(transcription, "model") ?? "whisper-large-v3",
      policy: readString(transcription, "policy") ?? (runtimeMode === "managed" ? "locked" : "default"),
    },
    ui: {
      hideProviderModelSelectors: Boolean(ui?.hideProviderModelSelectors),
      hidePresetProviderModelOverrides: Boolean(ui?.hidePresetProviderModelOverrides),
      showAdvancedSettings: Boolean(ui?.showAdvancedSettings),
      showDebugTools: Boolean(ui?.showDebugTools),
    },
    transportMode: readString(readNestedRecord(policy, "transport"), "mode")
      ?? (runtimeMode === "managed" ? "proxy-only" : "default"),
    ...(userSettingsDefaults ? { userSettingsDefaults } : {}),
    ...(resolvedVoiceRouting ? { voiceRouting: resolvedVoiceRouting } : {}),
  };
}

export function buildFeatureFlagsFromRuntimePolicy(policy: JsonRecord): Record<string, boolean> {
  return readBooleanMap(readNestedRecord(policy, "features"));
}

export function buildTransportPolicyFromRuntimePolicy(policy: JsonRecord): JsonRecord {
  const transport = readNestedRecord(policy, "transport");
  const mode = readString(transport, "mode");
  const proxied = mode === "proxy-only";
  return {
    llm: {
      groq: proxied ? "proxied" : "direct",
    },
    speech: {
      groq: proxied ? "proxied" : "direct",
    },
  };
}
