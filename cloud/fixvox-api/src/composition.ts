import { createApiHandler, type ApiDependencies } from "./app.ts";
import type { Logger } from "./observability.ts";
import { loadConfig, type FixvoxApiConfig } from "./config.ts";
import { evaluatePostgresPreflight } from "./execution/preflight.ts";
import { createMockProviderProxy } from "./providers.ts";
import { PostgresAdminRepository } from "./postgres/admin-repository.ts";
import { PostgresAuthSessionRepository } from "./postgres/auth-session-repository.ts";
import { createMockOAuthExchange } from "./oauth.ts";
import { PostgresControlPlaneRepository } from "./postgres/control-plane-repository.ts";
import { PostgresUsageQuotaRepository } from "./postgres/usage-quota-repository.ts";

export type ApiComposition = { config: FixvoxApiConfig; sql: Bun.SQL; handler: (request: Request) => Promise<Response>; close(): Promise<void> };

export function composeApi(env: Record<string, string | undefined> = Bun.env, options: { logger?: Logger } = {}): ApiComposition {
  const config = loadConfig(env);
  if (!config.mockProviders) throw new Error("real_provider_composition_pending");
  const sql = new Bun.SQL(config.databaseUrl);
  const control = new PostgresControlPlaneRepository(sql);
  const quota = new PostgresUsageQuotaRepository(sql);
  const admin = new PostgresAdminRepository(sql);
  const auth = new PostgresAuthSessionRepository(sql);
  const repository = { resolveDevice: control.resolveDevice.bind(control), resolveEffectiveProfile: control.resolveEffectiveProfile.bind(control), reserve: quota.reserve.bind(quota) };
  const dependencies: ApiDependencies = {
    config,
    devices: control,
    providers: createMockProviderProxy(),
    preflight: (input) => evaluatePostgresPreflight(repository, input),
    feedback: { submit: (input) => admin.appendFeedback(input) },
    auth,
    oauth: createMockOAuthExchange(),
    admin: { repository: admin, keys: config.adminKeys, sessions: auth },
    ...(options.logger ? { logger: options.logger } : {}),
    readiness: {
      async database() { await sql.unsafe("SELECT 1"); return true; },
      async schema() { const rows = await sql.unsafe<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1"); return rows[0]?.version === 4; },
      async jobs() { return true; },
      async authorityMode() { const rows = await sql.unsafe<{ mode: "cloudflare-authority" | "import-validation" | "canary" | "vps-authority" | "rollback" }>("SELECT mode FROM control_plane_authority WHERE singleton = true"); if (!rows[0]) throw new Error("authority_unavailable"); return rows[0].mode; },
    },
  };
  return { config, sql, handler: createApiHandler(dependencies), async close() { await sql.close(); } };
}
