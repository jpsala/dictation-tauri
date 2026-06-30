import { describe, expect, test } from "bun:test";
import type { KvNamespaceLike } from "./admin-store";
import { getPricingAdminSnapshot, refreshPricingAdmin, updateManualPricingAdminWatchlist } from "./pricing-admin";
import { getPricingRecord } from "./pricing-store";
import { putRequiredPricingTargets } from "./pricing-watchlist-store";

class MemoryKv implements KvNamespaceLike {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

describe("pricing admin", () => {
  test("returns watchlist and matching pricing rows", async () => {
    const store = new MemoryKv();
    await putRequiredPricingTargets(store, [{ provider: "groq", model: "whisper-large-v3" }]);

    const snapshot = await getPricingAdminSnapshot(store);

    expect(snapshot.watchlist.merged).toEqual([
      { provider: "groq", model: "whisper-large-v3", source: "required" },
    ]);
    expect(snapshot.pricing).toEqual([]);
  });

  test("replaces manual watchlist entries through admin helper", async () => {
    const store = new MemoryKv();

    await updateManualPricingAdminWatchlist(store, [
      { provider: "openrouter", model: "morph/morph-v3-fast" },
    ]);
    const snapshot = await updateManualPricingAdminWatchlist(store, [
      { provider: "openrouter", model: "minimax/minimax-m2.7" },
    ]);

    expect(snapshot.watchlist.manual).toEqual([
      { provider: "openrouter", model: "minimax/minimax-m2.7" },
    ]);
  });

  test("refresh helper updates pricing and returns current snapshot", async () => {
    const store = new MemoryKv();
    await updateManualPricingAdminWatchlist(store, [
      { provider: "openrouter", model: "minimax/minimax-m2.7" },
    ]);

    const snapshot = await refreshPricingAdmin(store, {
      openrouterApiKey: "test-key",
      fetchImpl: async () => new Response(JSON.stringify({
        data: [{
          id: "minimax/minimax-m2.7",
          pricing: { prompt: "0.0000004", completion: "0.0000016" },
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
      now: () => "2026-03-30T12:00:00.000Z",
    });

    expect(snapshot.pricing).toHaveLength(1);
    expect(snapshot.pricing[0]?.provider).toBe("openrouter");
    expect((await getPricingRecord(store, "openrouter", "minimax/minimax-m2.7"))?.inputPrice).toBe("0.0000004");
  });
});
