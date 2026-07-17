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
    expect(config.port).toBe(8787);
  });

  test("fails closed for missing required configuration and invalid limits", () => {
    expect(() => loadConfig({ ...base, FIXVOX_API_DATABASE_URL: "" })).toThrow("config_missing:FIXVOX_API_DATABASE_URL");
    expect(() => loadConfig({ ...base, FIXVOX_API_PUBLIC_BASE_URL: "http://localhost" })).toThrow("config_invalid:FIXVOX_API_PUBLIC_BASE_URL");
    expect(() => loadConfig({ ...base, FIXVOX_API_PORT: "0" })).toThrow("config_invalid:FIXVOX_API_PORT");
  });

  test("requires a provider secret outside explicit mock mode", () => {
    expect(() => loadConfig({ ...base, FIXVOX_API_MOCK_PROVIDERS: "false" })).toThrow("config_missing:provider_api_key");
    expect(loadConfig({ ...base, FIXVOX_API_MOCK_PROVIDERS: "false", GROQ_API_KEY: "fixture-only" }).providerKeys.groq).toBe("fixture-only");
  });
});
