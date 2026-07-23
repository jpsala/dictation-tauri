export type FixvoxApiConfig = {
  databaseUrl: string;
  publicBaseUrl: URL;
  host: string;
  port: number;
  requestTimeoutMs: number;
  maxRequestBytes: number;
  mockProviders: boolean;
  providerKeys: Readonly<Record<"groq" | "openrouter", string | undefined>>;
  adminKeys: Readonly<Record<"view" | "edit" | "publish", string | undefined>>;
};

type Environment = Record<string, string | undefined>;

function required(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`config_missing:${name}`);
  return value;
}

function optionalSecret(env: Environment, name: string): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

function integer(env: Environment, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`config_invalid:${name}`);
  return value;
}

function boolean(env: Environment, name: string): boolean {
  const raw = env[name];
  if (raw === undefined || raw === "") return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`config_invalid:${name}`);
}

export function loadConfig(env: Environment = Bun.env): FixvoxApiConfig {
  const databaseUrl = required(env, "FIXVOX_API_DATABASE_URL");
  const mockProviders = boolean(env, "FIXVOX_API_MOCK_PROVIDERS");
  const host = env.FIXVOX_API_HOST?.trim() || "127.0.0.1";
  let publicBaseUrl: URL;
  try {
    publicBaseUrl = new URL(required(env, "FIXVOX_API_PUBLIC_BASE_URL"));
  } catch {
    throw new Error("config_invalid:FIXVOX_API_PUBLIC_BASE_URL");
  }
  const loopbackHosts = ["127.0.0.1", "localhost", "::1", "[::1]"];
  const loopbackHttp = publicBaseUrl.protocol === "http:"
    && loopbackHosts.includes(publicBaseUrl.hostname)
    && loopbackHosts.includes(host);
  if (publicBaseUrl.protocol !== "https:" && !loopbackHttp) {
    throw new Error("config_invalid:FIXVOX_API_PUBLIC_BASE_URL");
  }

  const providerKeys = {
    groq: optionalSecret(env, "GROQ_API_KEY"),
    openrouter: optionalSecret(env, "OPENROUTER_API_KEY"),
  } as const;
  if (!mockProviders && !providerKeys.groq && !providerKeys.openrouter) {
    throw new Error("config_missing:provider_api_key");
  }

  return {
    databaseUrl,
    publicBaseUrl,
    host,
    // Keep the product API distinct from the Admin BFF, which owns 8787.
    port: integer(env, "FIXVOX_API_PORT", 8790, 1, 65535),
    requestTimeoutMs: integer(env, "FIXVOX_API_REQUEST_TIMEOUT_MS", 30_000, 100, 120_000),
    maxRequestBytes: integer(env, "FIXVOX_API_MAX_REQUEST_BYTES", 25 * 1024 * 1024, 1_024, 100 * 1024 * 1024),
    mockProviders,
    providerKeys,
    adminKeys: {
      view: optionalSecret(env, "ADMIN_VIEW_API_KEY"),
      edit: optionalSecret(env, "ADMIN_EDIT_API_KEY"),
      publish: optionalSecret(env, "ADMIN_PUBLISH_API_KEY"),
    },
  };
}
