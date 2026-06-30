import type { KvNamespaceLike } from "./admin-store";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = { [key: string]: JsonValue };

export type RecipePolicyEnvelope = {
  policy: JsonRecord;
  updatedAt: string;
};

export type RecipePolicyReadResult = RecipePolicyEnvelope & {
  source: "default" | "stored";
};

const RECIPE_POLICY_KEY = "control:policy:recipes";

const RECOMMENDED_ALPHA_RECIPE_POLICY: JsonRecord = {
  version: "alpha-default-2026-03-27",
  defaultRecipeId: "polished-dictation",
  recipes: [
    {
      id: "polished-dictation",
      label: "Polished Dictation",
      sttPrompt: "",
      postProcessPrompt: "",
      controls: {
        usePostProcess: true,
        removeFillers: true,
        fixPunctuation: true,
        preserveExactWording: true,
        allowMeaningRecovery: true,
        keepConversationalTone: false,
        preferShortMessages: false,
        preferCompleteSentences: false,
        preferParagraphs: false,
        preserveTechnicalTerms: false,
      },
    },
    {
      id: "work-chat",
      label: "Work Chat",
      sttPrompt: "",
      postProcessPrompt: "",
      controls: {
        usePostProcess: true,
        removeFillers: true,
        fixPunctuation: true,
        preserveExactWording: true,
        allowMeaningRecovery: true,
        keepConversationalTone: true,
        preferShortMessages: true,
        preferCompleteSentences: false,
        preferParagraphs: false,
        preserveTechnicalTerms: false,
      },
    },
    {
      id: "email-compose",
      label: "Email Compose",
      sttPrompt: "",
      postProcessPrompt: "",
      controls: {
        usePostProcess: true,
        removeFillers: true,
        fixPunctuation: true,
        preserveExactWording: true,
        allowMeaningRecovery: true,
        keepConversationalTone: false,
        preferShortMessages: false,
        preferCompleteSentences: true,
        preferParagraphs: false,
        preserveTechnicalTerms: false,
      },
    },
    {
      id: "docs-writing",
      label: "Docs Writing",
      sttPrompt: "",
      postProcessPrompt: "",
      controls: {
        usePostProcess: true,
        removeFillers: true,
        fixPunctuation: true,
        preserveExactWording: true,
        allowMeaningRecovery: true,
        keepConversationalTone: false,
        preferShortMessages: false,
        preferCompleteSentences: false,
        preferParagraphs: true,
        preserveTechnicalTerms: false,
      },
    },
    {
      id: "coding-dictation",
      label: "Coding Dictation",
      sttPrompt: "",
      postProcessPrompt: "",
      controls: {
        usePostProcess: true,
        removeFillers: true,
        fixPunctuation: true,
        preserveExactWording: true,
        allowMeaningRecovery: true,
        keepConversationalTone: false,
        preferShortMessages: false,
        preferCompleteSentences: false,
        preferParagraphs: false,
        preserveTechnicalTerms: true,
      },
    },
  ],
  contextMappings: [
    {
      id: "work-chat",
      label: "Work Chat",
      enabled: true,
      priority: 60,
      recipeId: "work-chat",
      match: {
        processNames: ["slack.exe", "teams.exe", "ms-teams.exe", "discord.exe"],
        processPathIncludes: [],
        titleIncludes: ["slack", "teams", "discord", "chat"],
        classNames: [],
      },
    },
    {
      id: "email-compose",
      label: "Email Compose",
      enabled: true,
      priority: 55,
      recipeId: "email-compose",
      match: {
        processNames: ["outlook.exe", "olk.exe", "thunderbird.exe"],
        processPathIncludes: [],
        titleIncludes: ["gmail", "outlook", "inbox", "mail"],
        classNames: [],
      },
    },
    {
      id: "docs-writing",
      label: "Docs Writing",
      enabled: false,
      priority: 40,
      recipeId: "docs-writing",
      match: {
        processNames: ["notion.exe", "obsidian.exe"],
        processPathIncludes: [],
        titleIncludes: ["notion", "google docs", "confluence", "document"],
        classNames: [],
      },
    },
    {
      id: "coding-dictation",
      label: "Coding Dictation",
      enabled: true,
      priority: 45,
      recipeId: "coding-dictation",
      match: {
        processNames: [
          "code.exe",
          "cursor.exe",
          "windsurf.exe",
          "webstorm64.exe",
          "pycharm64.exe",
          "idea64.exe",
          "devenv.exe",
          "powershell.exe",
          "windowsterminal.exe",
        ],
        processPathIncludes: [],
        titleIncludes: ["visual studio code", "cursor", "terminal"],
        classNames: [],
      },
    },
  ],
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

export function buildDefaultRecipePolicy(): JsonRecord {
  return cloneRecord(RECOMMENDED_ALPHA_RECIPE_POLICY);
}

export async function getRecipePolicy(store: KvNamespaceLike): Promise<RecipePolicyReadResult> {
  const raw = await store.get(RECIPE_POLICY_KEY);
  const parsed = parseJson<RecipePolicyEnvelope | null>(raw, null);
  const policy = asRecord(parsed?.policy);
  if (!policy) {
    return {
      policy: buildDefaultRecipePolicy(),
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

export async function putRecipePolicy(store: KvNamespaceLike, input: unknown): Promise<RecipePolicyEnvelope> {
  const candidate = asRecord(input)
    ?? asRecord(asRecord(input)?.policy);
  if (!candidate) {
    throw new Error("recipe policy payload must be a JSON object");
  }

  const existing = await getRecipePolicy(store);
  if (existing.source === "stored" && policyEquals(existing.policy, candidate)) {
    return {
      policy: cloneRecord(existing.policy),
      updatedAt: existing.updatedAt,
    };
  }

  const envelope: RecipePolicyEnvelope = {
    policy: cloneRecord(candidate),
    updatedAt: nowIso(),
  };
  await store.put(RECIPE_POLICY_KEY, JSON.stringify(envelope, null, 2));
  return envelope;
}

export async function resetRecipePolicy(store: KvNamespaceLike): Promise<RecipePolicyEnvelope> {
  const envelope: RecipePolicyEnvelope = {
    policy: buildDefaultRecipePolicy(),
    updatedAt: nowIso(),
  };
  await store.put(RECIPE_POLICY_KEY, JSON.stringify(envelope, null, 2));
  return envelope;
}
