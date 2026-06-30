type Provider = "anthropic" | "openai" | "openrouter" | "groq" | "xai" | "cerebras";
type SpeechProvider = "groq" | "openai";

export type ProviderModelCatalogResponse = {
  ok: true;
  provider: Provider;
  source: "live" | "fallback";
  configured: boolean;
  llmModels: string[];
  speechModels: string[];
  error: string | null;
};

type ProviderConfig = {
  baseUrl: string;
  authHeader: "authorization" | "x-api-key";
  extraHeaders?: Record<string, string>;
};

type ProviderKeyBag = Partial<Record<Provider, string | undefined>>;

const PROVIDER_CONFIGS: Record<Provider, ProviderConfig> = {
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    authHeader: "x-api-key",
    extraHeaders: { "anthropic-version": "2023-06-01" },
  },
  openai: { baseUrl: "https://api.openai.com/v1", authHeader: "authorization" },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    authHeader: "authorization",
    extraHeaders: { "HTTP-Referer": "https://fixvox.app", "X-Title": "Fixvox Control Plane" },
  },
  groq: { baseUrl: "https://api.groq.com/openai/v1", authHeader: "authorization" },
  xai: { baseUrl: "https://api.x.ai/v1", authHeader: "authorization" },
  cerebras: { baseUrl: "https://api.cerebras.ai/v1", authHeader: "authorization" },
};

const FALLBACK_LLM_MODELS: Record<Provider, string[]> = {
  anthropic: ["claude-haiku-4-5-20251001", "claude-sonnet-4-5-20250929", "claude-opus-4-1-20250805"],
  openai: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1", "gpt-4o"],
  openrouter: ["anthropic/claude-haiku-4-5", "openai/gpt-4o-mini", "meta-llama/llama-3.3-70b-instruct"],
  groq: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "gpt-oss-20b", "gpt-oss-120b", "moonshotai/kimi-k2-instruct"],
  xai: ["grok-3-mini", "grok-3"],
  cerebras: ["llama3.1-8b", "llama-3.3-70b"],
};

const FALLBACK_SPEECH_MODELS: Record<SpeechProvider, string[]> = {
  groq: ["whisper-large-v3-turbo", "whisper-large-v3"],
  openai: ["whisper-1"],
};

export function isProvider(value: unknown): value is Provider {
  return typeof value === "string" && value in PROVIDER_CONFIGS;
}

export async function listProviderModels(
  provider: Provider,
  keys: ProviderKeyBag,
): Promise<ProviderModelCatalogResponse> {
  const apiKey = normalizeKey(keys[provider]);
  if (!apiKey) {
    return {
      ok: true,
      provider,
      source: "fallback",
      configured: false,
      llmModels: [...FALLBACK_LLM_MODELS[provider]],
      speechModels: getFallbackSpeechModels(provider),
      error: null,
    };
  }

  try {
    const llmModels = await fetchModels(provider, apiKey);
    return {
      ok: true,
      provider,
      source: "live",
      configured: true,
      llmModels: llmModels.length > 0 ? llmModels : [...FALLBACK_LLM_MODELS[provider]],
      speechModels: filterSpeechModels(provider, llmModels),
      error: null,
    };
  } catch (error) {
    return {
      ok: true,
      provider,
      source: "fallback",
      configured: true,
      llmModels: [...FALLBACK_LLM_MODELS[provider]],
      speechModels: getFallbackSpeechModels(provider),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeKey(value: string | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function fetchModels(provider: Provider, apiKey: string): Promise<string[]> {
  const config = PROVIDER_CONFIGS[provider];
  const headers: Record<string, string> = { ...(config.extraHeaders ?? {}) };
  if (config.authHeader === "x-api-key") {
    headers["x-api-key"] = apiKey;
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${config.baseUrl}/models`, { headers });
  if (!response.ok) {
    throw new Error(`${provider} models error ${response.status}`);
  }

  const payload = await response.json() as { data?: Array<{ id?: string | null }> };
  return Array.from(new Set(
    (payload.data ?? [])
      .map((entry) => entry.id?.trim() ?? "")
      .filter(Boolean),
  )).sort((left, right) => left.localeCompare(right));
}

function filterSpeechModels(provider: Provider, llmModels: string[]): string[] {
  if (provider !== "groq" && provider !== "openai") {
    return [];
  }

  const filtered = llmModels.filter((model) => {
    const normalized = model.trim().toLowerCase();
    return normalized === "whisper-1"
      || normalized.includes("whisper")
      || normalized.includes("transcribe")
      || normalized.includes("speech");
  });
  return filtered.length > 0
    ? filtered
    : getFallbackSpeechModels(provider);
}

function getFallbackSpeechModels(provider: Provider): string[] {
  if (provider === "groq" || provider === "openai") {
    return [...FALLBACK_SPEECH_MODELS[provider]];
  }
  return [];
}
