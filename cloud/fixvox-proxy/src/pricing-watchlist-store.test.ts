import { describe, expect, test } from "bun:test";
import type { KvNamespaceLike } from "./admin-store";
import { getPricingWatchlist, putManualPricingWatchlist, putRequiredPricingTargets } from "./pricing-watchlist-store";

class MemoryKv implements KvNamespaceLike {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

describe("pricing watchlist store", () => {
  test("returns empty merged shortlist when nothing is stored", async () => {
    const store = new MemoryKv();

    const result = await getPricingWatchlist(store);

    expect(result.required).toEqual([]);
    expect(result.manual).toEqual([]);
    expect(result.merged).toEqual([]);
  });

  test("merges required and manual targets without duplicates", async () => {
    const store = new MemoryKv();

    await putRequiredPricingTargets(store, [
      { provider: "groq", model: "whisper-large-v3" },
      { provider: "openai", model: "whisper-1" },
    ]);
    await putManualPricingWatchlist(store, [
      { provider: "openai", model: "whisper-1" },
      { provider: "openrouter", model: "minimax/minimax-m2.7" },
    ]);

    const result = await getPricingWatchlist(store);

    expect(result.merged).toEqual([
      { provider: "groq", model: "whisper-large-v3", source: "required" },
      { provider: "openai", model: "whisper-1", source: "required" },
      { provider: "openrouter", model: "minimax/minimax-m2.7", source: "manual" },
    ]);
  });

  test("manual watchlist writes replace the previous manual set", async () => {
    const store = new MemoryKv();

    await putManualPricingWatchlist(store, [
      { provider: "openrouter", model: "morph/morph-v3-fast" },
    ]);
    await putManualPricingWatchlist(store, [
      { provider: "openrouter", model: "minimax/minimax-m2.7" },
    ]);

    const result = await getPricingWatchlist(store);

    expect(result.manual).toEqual([
      { provider: "openrouter", model: "minimax/minimax-m2.7" },
    ]);
  });
});
