import { describe, expect, test } from "bun:test";
import type { KvNamespaceLike } from "./admin-store";
import type { PricingRecord } from "./pricing-store";
import { getPricingRecord, getPricingSnapshot, putPricingRecord } from "./pricing-store";

class MemoryKv implements KvNamespaceLike {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

function makeRecord(
  provider: string,
  model: string,
  pricingSource: string,
  status: PricingRecord["status"],
): PricingRecord {
  return {
    provider,
    model,
    pricingSource,
    checkedAt: "2026-03-30T12:00:00.000Z",
    status,
    unitType: "per_hour",
    currency: "USD",
    inputPrice: null,
    outputPrice: null,
    audioInputPrice: "0.111",
    audioOutputPrice: null,
    requestPrice: null,
    rawPriceJson: { price: "0.111", unit: "hour" },
  };
}

describe("pricing store", () => {
  test("stores and reads back a normalized pricing record", async () => {
    const store = new MemoryKv();

    await putPricingRecord(store, makeRecord("groq", "whisper-large-v3", "groq-docs", "live"));

    const result = await getPricingRecord(store, "groq", "whisper-large-v3");

    expect(result?.audioInputPrice).toBe("0.111");
    expect(result?.status).toBe("live");
  });

  test("returns pricing snapshot rows for requested targets in provider-model order", async () => {
    const store = new MemoryKv();

    await putPricingRecord(store, makeRecord("openai", "whisper-1", "manual", "needs-review"));
    await putPricingRecord(store, makeRecord("groq", "whisper-large-v3", "groq-docs", "live"));

    const rows = await getPricingSnapshot(store, [
      { provider: "openai", model: "whisper-1" },
      { provider: "groq", model: "whisper-large-v3" },
    ]);

    expect(rows.map((row) => `${row.provider}:${row.model}`)).toEqual([
      "groq:whisper-large-v3",
      "openai:whisper-1",
    ]);
  });

  test("putPricingRecord replaces the previous record for the same provider and model", async () => {
    const store = new MemoryKv();

    await putPricingRecord(store, makeRecord("groq", "whisper-large-v3", "old-source", "manual"));
    await putPricingRecord(store, makeRecord("groq", "whisper-large-v3", "groq-docs", "live"));

    const result = await getPricingRecord(store, "groq", "whisper-large-v3");

    expect(result?.pricingSource).toBe("groq-docs");
    expect(result?.status).toBe("live");
  });
});
