import { putPricingRecord } from "./pricing-store";
import { getPricingWatchlist } from "./pricing-watchlist-store";
import type { KvNamespaceLike } from "./admin-store";

type RefreshPricingOptions = {
  groqApiKey?: string | null;
  openrouterApiKey?: string | null;
  fetchImpl?: typeof fetch;
  now?: () => string;
};

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";

const GROQ_AUDIO_PRICE_PER_HOUR: Record<string, string> = {
  "whisper-large-v3": "0.111",
  "whisper-large-v3-turbo": "0.04",
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

async function fetchJson(fetchImpl: typeof fetch, url: string, headers: Record<string, string>): Promise<any> {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    throw new Error(`pricing refresh failed for ${url}: ${response.status}`);
  }
  return response.json();
}

export async function refreshPricing(store: KvNamespaceLike, options: RefreshPricingOptions = {}): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now?.() ?? new Date().toISOString();
  const watchlist = await getPricingWatchlist(store);

  const openrouterTargets = watchlist.merged.filter((target) => normalizeKey(target.provider) === "openrouter");
  if (openrouterTargets.length > 0 && options.openrouterApiKey?.trim()) {
    const payload = await fetchJson(fetchImpl, OPENROUTER_MODELS_URL, {
      Authorization: `Bearer ${options.openrouterApiKey.trim()}`,
      "HTTP-Referer": "https://fixvox.app",
      "X-Title": "Fixvox Control Plane",
    });
    const rows = new Map<string, any>((payload.data ?? []).map((row: any) => [normalizeKey(String(row.id ?? "")), row]));
    for (const target of openrouterTargets) {
      const row = rows.get(normalizeKey(target.model));
      await putPricingRecord(store, {
        provider: target.provider,
        model: target.model,
        pricingSource: "openrouter-models-api",
        checkedAt: now,
        status: row ? "live" : "needs-review",
        unitType: "per_1m_tokens",
        currency: "USD",
        inputPrice: row?.pricing?.prompt ?? null,
        outputPrice: row?.pricing?.completion ?? null,
        audioInputPrice: row?.pricing?.audio ?? null,
        audioOutputPrice: row?.pricing?.audio_output ?? null,
        requestPrice: row?.pricing?.request ?? null,
        rawPriceJson: row ?? null,
      });
    }
  }

  const groqTargets = watchlist.merged.filter((target) => normalizeKey(target.provider) === "groq");
  if (groqTargets.length > 0 && options.groqApiKey?.trim()) {
    const payload = await fetchJson(fetchImpl, GROQ_MODELS_URL, {
      Authorization: `Bearer ${options.groqApiKey.trim()}`,
      "Content-Type": "application/json",
    });
    const rows = new Set<string>((payload.data ?? []).map((row: any) => normalizeKey(String(row.id ?? ""))));
    for (const target of groqTargets) {
      const normalizedModel = normalizeKey(target.model);
      const audioPrice = GROQ_AUDIO_PRICE_PER_HOUR[normalizedModel] ?? null;
      await putPricingRecord(store, {
        provider: target.provider,
        model: target.model,
        pricingSource: audioPrice ? "groq-docs-override" : "groq-models-api",
        checkedAt: now,
        status: rows.has(normalizedModel) ? (audioPrice ? "live" : "needs-review") : "needs-review",
        unitType: audioPrice ? "per_hour" : "unknown",
        currency: "USD",
        inputPrice: null,
        outputPrice: null,
        audioInputPrice: audioPrice,
        audioOutputPrice: null,
        requestPrice: null,
        rawPriceJson: rows.has(normalizedModel) ? { model: target.model } : null,
      });
    }
  }
}
