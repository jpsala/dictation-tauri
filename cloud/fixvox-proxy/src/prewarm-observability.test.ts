import { describe, expect, mock, test } from "bun:test";
import type { KvNamespaceLike } from "./admin-store";

mock.module("cloudflare:workers", () => ({
  DurableObject: class DurableObject {
    protected readonly ctx: unknown;
    protected readonly env: unknown;

    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

const { default: worker, UsageCounterDurableObject } = await import("./index");

class MemoryKv implements KvNamespaceLike {
  readonly values = new Map<string, string>();
  putCount = 0;

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.putCount += 1;
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

class MemoryDurableObjectStorage {
  readonly values = new Map<string, unknown>();
  private alarm: number | null = null;

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.values.get(key)) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async deleteAll(): Promise<void> {
    this.values.clear();
    this.alarm = null;
  }

  async getAlarm(): Promise<number | null> {
    return this.alarm;
  }

  async setAlarm(value: number): Promise<void> {
    this.alarm = value;
  }
}

class MemoryDurableObjectState {
  readonly storage = new MemoryDurableObjectStorage();
  private queue = Promise.resolve();

  blockConcurrencyWhile(callback: () => Promise<void>): Promise<void> {
    const next = this.queue.then(callback);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

function createUsageNamespace(options: { failObservation?: boolean } = {}) {
  const states = new Map<string, MemoryDurableObjectState>();
  const objects = new Map<string, InstanceType<typeof UsageCounterDurableObject>>();
  let fetchCount = 0;

  return {
    states,
    get fetchCount() { return fetchCount; },
    idFromName(name: string) {
      return name;
    },
    get(id: string) {
      return {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          fetchCount += 1;
          if (options.failObservation) throw new Error("observation unavailable");
          let state = states.get(id);
          if (!state) {
            state = new MemoryDurableObjectState();
            states.set(id, state);
          }
          let object = objects.get(id);
          if (!object) {
            object = new UsageCounterDurableObject(state as never, {} as never);
            objects.set(id, object);
          }
          return object.fetch(new Request(input, init));
        },
      };
    },
  };
}

function createExecutionContext() {
  const tasks: Promise<unknown>[] = [];
  return {
    tasks,
    waitUntil(promise: Promise<unknown>) {
      tasks.push(promise);
    },
  };
}

async function observe(
  object: InstanceType<typeof UsageCounterDurableObject>,
  day: string,
  success: boolean,
): Promise<Response> {
  return object.fetch(new Request("https://usage-counter/observe-prewarm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ day, success, observedAt: `${day}T12:00:00.000Z` }),
  }));
}

describe("prewarm observability", () => {
  test("stores only bounded sanitized daily success and failure counters", async () => {
    const state = new MemoryDurableObjectState();
    const object = new UsageCounterDurableObject(state as never, {} as never);

    expect((await observe(object, "2026-07-14", true)).status).toBe(200);
    expect((await observe(object, "2026-07-14", true)).status).toBe(200);
    expect((await observe(object, "2026-07-14", false)).status).toBe(200);

    const summary = await object.fetch(new Request("https://usage-counter/prewarm-summary"));
    expect(await summary.json()).toEqual({
      days: [{
        day: "2026-07-14",
        attempts: 3,
        successes: 2,
        failures: 1,
        lastObservedAt: "2026-07-14T12:00:00.000Z",
      }],
    });
    const persisted = JSON.stringify([...state.storage.values.entries()]);
    expect(persisted).not.toContain("device-sensitive");
    expect(persisted).not.toContain("transcript");
    expect(persisted).not.toContain("provider");
  });

  test("retains at most seven daily buckets", async () => {
    const state = new MemoryDurableObjectState();
    const object = new UsageCounterDurableObject(state as never, {} as never);

    for (let day = 1; day <= 9; day += 1) {
      await observe(object, `2026-07-${String(day).padStart(2, "0")}`, true);
    }

    const summary = await object.fetch(new Request("https://usage-counter/prewarm-summary"));
    const payload = await summary.json() as { days: Array<{ day: string }> };
    expect(payload.days).toHaveLength(7);
    expect(payload.days[0]?.day).toBe("2026-07-03");
    expect(payload.days.at(-1)?.day).toBe("2026-07-09");
  });

  test("observes prewarm without KV writes or provider calls", async () => {
    const store = new MemoryKv();
    const usageNamespace = createUsageNamespace();
    const ctx = createExecutionContext();
    const deviceId = "device-sensitive-123";

    const response = await worker.fetch(
      new Request("https://example.com/v1/usage/prewarm", {
        method: "POST",
        headers: { "x-device-id": deviceId },
      }),
      {
        USAGE: store,
        USAGE_COUNTERS: usageNamespace,
        CONTROL_PLANE_PUBLISH_LOCKS: {} as never,
      } as never,
      ctx as never,
    );
    await Promise.all(ctx.tasks);

    expect(response.status).toBe(200);
    expect(store.putCount).toBe(0);
    expect(usageNamespace.fetchCount).toBe(1);
    const observationState = usageNamespace.states.get(`prewarm-observation:${deviceId}`);
    const persisted = JSON.stringify([...(observationState?.storage.values.entries() ?? [])]);
    expect(persisted).not.toContain(deviceId);
  });

  test("observation failure leaves the prewarm response unchanged", async () => {
    const store = new MemoryKv();
    const usageNamespace = createUsageNamespace({ failObservation: true });
    const ctx = createExecutionContext();

    const response = await worker.fetch(
      new Request("https://example.com/v1/usage/prewarm", {
        method: "POST",
        headers: { "x-device-id": "device-observation-failure" },
      }),
      {
        USAGE: store,
        USAGE_COUNTERS: usageNamespace,
        CONTROL_PLANE_PUBLISH_LOCKS: {} as never,
      } as never,
      ctx as never,
    );
    await Promise.all(ctx.tasks);

    const payload = await response.json() as { ok: boolean; replace: unknown; voice: unknown };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.replace).toBeTruthy();
    expect(payload.voice).toBeTruthy();
    expect(store.putCount).toBe(0);
  });
});
