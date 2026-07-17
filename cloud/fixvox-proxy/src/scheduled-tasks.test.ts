import { describe, expect, test } from "bun:test";
import type { KvNamespaceLike } from "./admin-store";
import { putPricingRecord } from "./pricing-store";
import { putManualPricingWatchlist } from "./pricing-watchlist-store";
import { runScheduledTasks, shouldRefreshPricing, type ScheduledTaskEnv } from "./scheduled-tasks";

function createEnv(overrides: Partial<ScheduledTaskEnv> = {}): ScheduledTaskEnv {
  return {
    GROQ_API_KEY: "groq-key",
    OPENROUTER_API_KEY: "openrouter-key",
    DISCORD_SUPPORT_SCAN_ENABLED: "false",
    ...overrides,
  };
}

class MemoryKv implements KvNamespaceLike {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

describe("runScheduledTasks", () => {
  test("always schedules pricing refresh", async () => {
    const calls: string[] = [];

    runScheduledTasks(createEnv(), {
      schedule(promise) {
        calls.push("schedule");
        void promise;
      },
    }, {
      refreshPricingTask: async () => {
        calls.push("pricing");
      },
      discordScanTask: async () => {
        calls.push("discord");
      },
    });

    expect(calls).toEqual(["pricing", "schedule"]);
  });

  test("schedules discord scan when enabled", async () => {
    const calls: string[] = [];

    runScheduledTasks(createEnv({ DISCORD_SUPPORT_SCAN_ENABLED: "true" }), {
      schedule(promise) {
        calls.push("schedule");
        void promise;
      },
    }, {
      refreshPricingTask: async () => {
        calls.push("pricing");
      },
      discordScanTask: async () => {
        calls.push("discord");
      },
    });

    expect(calls).toEqual(["pricing", "schedule", "discord", "schedule"]);
  });
});

describe("shouldRefreshPricing", () => {
  test("returns false when the watchlist is empty", async () => {
    const store = new MemoryKv();
    expect(await shouldRefreshPricing(store, new Date("2026-04-01T18:00:00.000Z"))).toBe(false);
  });

  test("returns true when a watchlist target has no cached pricing", async () => {
    const store = new MemoryKv();
    await putManualPricingWatchlist(store, [{ provider: "groq", model: "whisper-large-v3" }]);

    expect(await shouldRefreshPricing(store, new Date("2026-04-01T18:00:00.000Z"))).toBe(true);
  });

  test("returns false when cached pricing is still fresh for every target", async () => {
    const store = new MemoryKv();
    await putManualPricingWatchlist(store, [
      { provider: "groq", model: "whisper-large-v3" },
      { provider: "openrouter", model: "minimax/minimax-m2.7" },
    ]);
    await putPricingRecord(store, {
      provider: "groq",
      model: "whisper-large-v3",
      pricingSource: "groq-docs-override",
      checkedAt: "2026-04-01T07:30:00.000Z",
      status: "live",
      unitType: "per_hour",
      currency: "USD",
      inputPrice: null,
      outputPrice: null,
      audioInputPrice: "0.111",
      audioOutputPrice: null,
      requestPrice: null,
      rawPriceJson: null,
    });
    await putPricingRecord(store, {
      provider: "openrouter",
      model: "minimax/minimax-m2.7",
      pricingSource: "openrouter-models-api",
      checkedAt: "2026-04-01T13:00:00.000Z",
      status: "live",
      unitType: "per_1m_tokens",
      currency: "USD",
      inputPrice: "0.0000004",
      outputPrice: "0.0000016",
      audioInputPrice: null,
      audioOutputPrice: null,
      requestPrice: null,
      rawPriceJson: null,
    });

    expect(await shouldRefreshPricing(store, new Date("2026-04-01T18:00:00.000Z"))).toBe(false);
  });

  test("returns true when a cached target is stale", async () => {
    const store = new MemoryKv();
    await putManualPricingWatchlist(store, [{ provider: "openrouter", model: "minimax/minimax-m2.7" }]);
    await putPricingRecord(store, {
      provider: "openrouter",
      model: "minimax/minimax-m2.7",
      pricingSource: "openrouter-models-api",
      checkedAt: "2026-04-01T10:00:00.000Z",
      status: "live",
      unitType: "per_1m_tokens",
      currency: "USD",
      inputPrice: "0.0000004",
      outputPrice: "0.0000016",
      audioInputPrice: null,
      audioOutputPrice: null,
      requestPrice: null,
      rawPriceJson: null,
    });

    expect(await shouldRefreshPricing(store, new Date("2026-04-01T18:00:00.000Z"))).toBe(true);
  });
});
