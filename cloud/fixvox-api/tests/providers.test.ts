import { describe, expect, test } from "bun:test";
import { createConfiguredProviderProxy, createHttpProviderProxy } from "../src/providers.ts";

function fixtureProviderUrl(): URL {
  try {
    return new URL("https://provider.fixture.test/v1/chat/completions");
  } catch (error) {
    throw new Error("invalid_fixture_provider_url", { cause: error });
  }
}

describe("HTTP provider adapter", () => {
  test("uses exactly the policy-selected target and strips desktop identity before one upstream call", async () => {
    const calls: Request[] = [];
    const proxy = createHttpProviderProxy(
      () => ({ url: fixtureProviderUrl(), apiKey: "fixture-provider-key-001", model: "fixture-model" }),
      async (input, init) => {
        calls.push(new Request(input, init));
        return Response.json({ ok: true });
      },
    );
    const response = await proxy.proxy({
      kind: "chat",
      request: new Request("https://api.fixture.test/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", "x-device-id": "fixture-device-001" }, body: "{}" }),
      signal: AbortSignal.timeout(1_000),
      policy: { profileId: "fixture", engine: { provider: "fixture", model: "fixture-model" } },
    });
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://provider.fixture.test/v1/chat/completions");
    expect(calls[0].headers.get("x-device-id")).toBe(null);
    expect(calls[0].headers.get("authorization")).toBe("Bearer fixture-provider-key-001");
    expect(await calls[0].json()).toEqual({ model: "fixture-model" });
  });

  test("configured real lane binds server-selected Groq chat and audio targets", async () => {
    const calls: Request[] = [];
    const proxy = createConfiguredProviderProxy({ groq: "fixture-groq-key", openrouter: undefined }, async (input, init) => {
      calls.push(new Request(input, init));
      return Response.json({ choices: [{ message: { content: "fixture" } }] });
    });
    const response = await proxy.proxy({
      kind: "chat",
      request: new Request("https://api.fixture.test/product/v1/runtime/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [] }) }),
      signal: AbortSignal.timeout(1_000),
      policy: { profileId: "fixture", engine: { provider: "groq", model: "llama-3.3-70b-versatile" } },
    });
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(await calls[0].json()).toEqual({ messages: [], model: "llama-3.3-70b-versatile" });

    const source = new FormData();
    source.set("metadata", JSON.stringify({ operationId: "fixture-operation", durationMs: 1000, language: "es" }));
    source.set("audio", new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }), "synthetic.wav");
    const audioResponse = await proxy.proxy({
      kind: "audio",
      request: new Request("https://api.fixture.test/product/v1/runtime/transcriptions", { method: "POST", headers: { "x-device-id": "fixture-device-001" }, body: source }),
      signal: AbortSignal.timeout(1_000),
      policy: { profileId: "fixture", engine: { provider: "groq", model: "whisper-large-v3-turbo" } },
    });
    expect(audioResponse.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(calls[1].headers.get("x-device-id")).toBe(null);
    expect(calls[1].headers.get("authorization")).toBe("Bearer fixture-groq-key");
    const upstream = await calls[1].formData();
    expect([...upstream.keys()].sort()).toEqual(["file", "language", "model"]);
    expect(upstream.get("model")).toBe("whisper-large-v3-turbo");
    expect(upstream.get("language")).toBe("es");
    const file = upstream.get("file");
    expect(file instanceof Blob).toBe(true);
    expect(file instanceof Blob ? file.size : 0).toBe(3);
    expect(() => createConfiguredProviderProxy({ groq: undefined, openrouter: undefined })).toThrow("provider_api_key_missing");
  });
});
