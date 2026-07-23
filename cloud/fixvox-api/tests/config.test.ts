import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config.ts";

const base = {
  FIXVOX_API_DATABASE_URL: "postgres://fixvox_test@localhost/fixvox_test",
  FIXVOX_API_PUBLIC_BASE_URL: "https://auth.fixture.test",
  FIXVOX_API_MOCK_PROVIDERS: "true",
};

describe("loadConfig", () => {
  test("accepts provider-free test configuration without secrets", () => {
    const config = loadConfig(base);
    expect(config.mockProviders).toBe(true);
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8790);
  });

  test("accepts HTTP only when the public URL and bind are both loopback", () => {
    expect(loadConfig({ ...base, FIXVOX_API_PUBLIC_BASE_URL: "http://127.0.0.1:8790" }).publicBaseUrl.toString()).toBe("http://127.0.0.1:8790/");
    expect(loadConfig({ ...base, FIXVOX_API_PUBLIC_BASE_URL: "http://localhost:8790" }).publicBaseUrl.hostname).toBe("localhost");
    expect(loadConfig({
      ...base,
      FIXVOX_API_PUBLIC_BASE_URL: "http://127.0.0.1:8790",
      FIXVOX_API_MOCK_PROVIDERS: "false",
      GROQ_API_KEY: "fixture-only",
    }).mockProviders).toBe(false);
    expect(() => loadConfig({
      ...base,
      FIXVOX_API_PUBLIC_BASE_URL: "http://127.0.0.1:8790",
      FIXVOX_API_HOST: "0.0.0.0",
    })).toThrow("config_invalid:FIXVOX_API_PUBLIC_BASE_URL");
  });

  test("fails closed for missing required configuration and invalid limits", () => {
    expect(() => loadConfig({ ...base, FIXVOX_API_DATABASE_URL: "" })).toThrow("config_missing:FIXVOX_API_DATABASE_URL");
    expect(() => loadConfig({ ...base, FIXVOX_API_PUBLIC_BASE_URL: "http://example.test" })).toThrow("config_invalid:FIXVOX_API_PUBLIC_BASE_URL");
    expect(() => loadConfig({ ...base, FIXVOX_API_PORT: "0" })).toThrow("config_invalid:FIXVOX_API_PORT");
  });

  test("requires HTTPS outside loopback and a provider secret outside mock mode", () => {
    expect(() => loadConfig({ ...base, FIXVOX_API_MOCK_PROVIDERS: "false" })).toThrow("config_missing:provider_api_key");
    expect(() => loadConfig({
      ...base,
      FIXVOX_API_PUBLIC_BASE_URL: "http://example.test",
      FIXVOX_API_MOCK_PROVIDERS: "false",
      GROQ_API_KEY: "fixture-only",
    })).toThrow("config_invalid:FIXVOX_API_PUBLIC_BASE_URL");
    expect(loadConfig({ ...base, FIXVOX_API_MOCK_PROVIDERS: "false", GROQ_API_KEY: "fixture-only" }).providerKeys.groq).toBe("fixture-only");
  });
});
