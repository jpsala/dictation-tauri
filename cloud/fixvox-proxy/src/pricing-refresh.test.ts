import { describe, expect, test } from "bun:test";
import type { KvNamespaceLike } from "./admin-store";
import { getPricingRecord } from "./pricing-store";
import { refreshPricing } from "./pricing-refresh";
import { putManualPricingWatchlist, putRequiredPricingTargets } from "./pricing-watchlist-store";

class MemoryKv implements KvNamespaceLike {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

function okJson(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("pricing refresh", () => {
  test("refreshes OpenRouter pricing from the bulk models endpoint", async () => {
    const store = new MemoryKv();
    await putManualPricingWatchlist(store, [
      { provider: "openrouter", model: "minimax/minimax-m2.7" },
    ]);

    await refreshPricing(store, {
      openrouterApiKey: "test-key",
      fetchImpl: async () => okJson({
        data: [{
          id: "minimax/minimax-m2.7",
          pricing: { prompt: "0.0000004", completion: "0.0000016" },
        }],
      }),
      now: () => "2026-03-30T12:00:00.000Z",
    });

    const record = await getPricingRecord(store, "openrouter", "minimax/minimax-m2.7");
    expect(record?.inputPrice).toBe("0.0000004");
    expect(record?.pricingSource).toBe("openrouter-models-api");
  });

  test("refreshes Groq speech pricing for known speech models", async () => {
    const store = new MemoryKv();
    await putRequiredPricingTargets(store, [
      { provider: "groq", model: "whisper-large-v3" },
    ]);

    await refreshPricing(store, {
      groqApiKey: "test-key",
      fetchImpl: async () => okJson({ data: [{ id: "whisper-large-v3" }] }),
      now: () => "2026-03-30T12:00:00.000Z",
    });

    const record = await getPricingRecord(store, "groq", "whisper-large-v3");
    expect(record?.audioInputPrice).toBe("0.111");
    expect(record?.pricingSource).toBe("groq-docs-override");
  });

  test("marks an OpenRouter target as needs-review when the model is missing from the catalog", async () => {
    const store = new MemoryKv();
    await putManualPricingWatchlist(store, [
      { provider: "openrouter", model: "missing/model" },
    ]);

    await refreshPricing(store, {
      openrouterApiKey: "test-key",
      fetchImpl: async () => okJson({ data: [] }),
      now: () => "2026-03-30T12:00:00.000Z",
    });

    const record = await getPricingRecord(store, "openrouter", "missing/model");
    expect(record?.status).toBe("needs-review");
  });
});
