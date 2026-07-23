import { composeApi } from "../src/composition.ts";
import { createConfiguredProviderProxy } from "../src/providers.ts";

if (Bun.env.FIXVOX_ALLOW_REAL_PROVIDER_SMOKE !== "1") {
  throw new Error("real_provider_smoke_requires_explicit_gate");
}
const databaseUrl = Bun.env.FIXVOX_DATABASE_URL;
const groqKey = Bun.env.GROQ_API_KEY || Bun.env["GROQ-API-KEY"];
if (!databaseUrl) throw new Error("missing_FIXVOX_DATABASE_URL");
if (!groqKey) throw new Error("missing_GROQ_API_KEY");
const sql = new Bun.SQL(databaseUrl);

async function resetDomainData() {
  const databases = await sql.unsafe("SELECT current_database() AS database_name");
  if (databases[0]?.database_name !== "fixvox_test") throw new Error("unsafe_test_database");
  await sql.unsafe(`
    TRUNCATE TABLE
      audit_records, usage_events, usage_reservations, policy_assignments,
      account_groups, install_bindings, devices, accounts, settings_defaults,
      profile_engine_bindings, profile_prompt_bindings, profile_versions,
      profiles, groups, engines, prompts, quota_policies, oauth_states,
      desktop_login_sessions, admin_sessions, role_bindings, request_events,
      prewarm_daily_counters, feedback_events, pricing_records, pricing_watchlist, migration_runs
    RESTART IDENTITY CASCADE
  `);
  await sql.unsafe("DELETE FROM control_plane_authority");
  await sql.unsafe("INSERT INTO control_plane_authority (mode, revision, changed_by) VALUES ('cloudflare-authority', 0, 't035-real-provider-smoke')");
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

async function run() {
  await resetDomainData();
  const definition = {
    schemaVersion: 1, label: "T035 Local",
    access: { capabilities: ["dictation", "postprocess", "selection_transform", "assistant_actions"] },
    runtime: {
      transcription: { engineId: "t035-stt" },
      postprocess: { engineId: "t035-chat" },
      selectionTransform: { engineId: "t035-chat" },
    },
    limits: { mode: "block", quotaProfile: "pro-unlimited" }, userControls: {}, defaults: {},
  };
  await sql.unsafe(`INSERT INTO engines (engine_id, kind, provider, model) VALUES ('t035-stt', 'transcription', 'groq', 'whisper-large-v3-turbo'), ('t035-chat', 'selectionTransform', 'groq', 'llama-3.3-70b-versatile')`);
  const profiles = await sql.unsafe(`INSERT INTO profiles (profile_id, label) VALUES ('basic', 'T035 Local') RETURNING id::text`);
  await sql.unsafe(`INSERT INTO profile_versions (profile_id, version, status, definition, authority_revision, created_by, published_by, published_at) VALUES ($1::uuid, 1, 'published', $2::jsonb, 0, 't035', 't035', now())`, [profiles[0].id, JSON.stringify(definition)]);
  await sql.unsafe(`UPDATE profiles SET active_published_version = 1 WHERE id = $1::uuid`, [profiles[0].id]);

  let providerCalls = 0;
  const providers = createConfiguredProviderProxy({ groq: groqKey, openrouter: undefined }, async (input, init) => {
    providerCalls += 1;
    return fetch(input, init);
  });
  const api = composeApi({
    FIXVOX_API_DATABASE_URL: databaseUrl,
    FIXVOX_API_PUBLIC_BASE_URL: "https://local.fixture.invalid",
    FIXVOX_API_MOCK_PROVIDERS: "false",
    GROQ_API_KEY: groqKey,
  }, { providers, logger: { info() {} } });
  const startedAt = new Date();
  try {
    const bootstrapResponse = await api.handler(new Request("https://local.fixture.invalid/product/v1/desktop/bootstrap", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ installId: "t035-synthetic-install", device: { platform: "windows", appVersion: "0.1.0" } }),
    }));
    if (bootstrapResponse.status !== 200) throw new Error(`t035_bootstrap_status_${bootstrapResponse.status}`);
    const bootstrap = await bootstrapResponse.json();
    const deviceId = bootstrap?.data?.binding?.deviceId;
    if (typeof deviceId !== "string" || !deviceId) throw new Error("t035_device_missing");
    const response = await api.handler(new Request("https://local.fixture.invalid/product/v1/runtime/actions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-id": deviceId },
      body: JSON.stringify({ operationId: "t035-single-provider-request", kind: "assistant", input: { utterance: "Synthetic T035 fixture. Reply with a short acknowledgement." } }),
    }));
    if (response.status !== 200) throw new Error(`t035_provider_status_${response.status}`);
    const payload = await response.json();
    const reply = payload?.data?.output?.reply;
    assert(typeof reply === "string" && reply.length > 0, "t035_output_missing");
    assert(providerCalls === 1, "t035_provider_call_count_invalid");
    const writes = await sql.unsafe(`SELECT (SELECT count(*)::integer FROM usage_reservations) AS reservations, (SELECT count(*)::integer FROM usage_events) AS events`);
    assert(writes[0]?.reservations === 0 && writes[0]?.events === 0, "t035_unlimited_usage_write");
    const report = {
      schemaVersion: 1,
      checkpoint: "E-T035",
      provider: "groq",
      kind: "chat",
      providerCalls,
      responseStatus: response.status,
      outputPresent: true,
      rawContentPersisted: false,
      productionTouched: false,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
    };
    await Bun.write(new URL("../../../artifacts/self-hosted-control-plane/checkpoint-e/t035-real-provider-smoke.json", import.meta.url), JSON.stringify(report, null, 2));
  } finally {
    await api.close();
  }
}

try {
  await run();
  console.log("T035 real-provider smoke passed: provider_calls=1 status=200 raw_persisted=false");
} finally {
  await resetDomainData();
  await sql.close();
}
