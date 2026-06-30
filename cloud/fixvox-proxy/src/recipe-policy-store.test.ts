import { describe, expect, test } from "bun:test";

import { buildDefaultRecipePolicy, putRecipePolicy } from "./recipe-policy-store";

function createKvStore() {
  const storage = new Map<string, string>();
  const puts: string[] = [];
  return {
    store: {
      get: async (key: string) => storage.get(key) ?? null,
      put: async (key: string, value: string) => {
        puts.push(key);
        storage.set(key, value);
      },
    },
    puts,
  };
}

describe("recipe policy writes", () => {
  test("same recipe policy does not re-put", async () => {
    const kv = createKvStore();
    const policy = buildDefaultRecipePolicy();

    const first = await putRecipePolicy(kv.store, policy);
    kv.puts.length = 0;
    const second = await putRecipePolicy(kv.store, policy);

    expect(second.updatedAt).toBe(first.updatedAt);
    expect(kv.puts).toHaveLength(0);
  });
});
