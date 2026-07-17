import { describe, expect, test } from "bun:test";
import { createHttpProviderProxy } from "../src/providers.ts";

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
      () => ({ url: fixtureProviderUrl(), apiKey: "fixture-provider-key-001" }),
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
  });
});
