/// <reference path="../../cloud/fixvox-api/src/bun-test.d.ts" />
/// <reference path="../../cloud/fixvox-api/src/bun-runtime.d.ts" />

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { composeApi } from "../../cloud/fixvox-api/src/composition.ts";
import { CONTRACT_TEST_VALUES, HTTP_CONTRACT_FIXTURES, type ContractFixture } from "./fixtures.ts";
import { assertNoSensitiveText, assertNormalizedContract, normalizeResponse, redactEvidence, summarizeRequest, type NormalizedResponse } from "./redaction.ts";

const databaseUrl = Bun.env.FIXVOX_DATABASE_URL;
if (!databaseUrl) throw new Error("missing_FIXVOX_DATABASE_URL");

const api = composeApi({
  FIXVOX_API_DATABASE_URL: databaseUrl,
  FIXVOX_API_PUBLIC_BASE_URL: "https://auth.fixture.test",
  FIXVOX_API_MOCK_PROVIDERS: "true",
  FIXVOX_API_MAX_REQUEST_BYTES: "1048576",
  ADMIN_VIEW_API_KEY: "fixture-admin-view-key",
  ADMIN_EDIT_API_KEY: "fixture-admin-edit-key",
  ADMIN_PUBLISH_API_KEY: "fixture-admin-publish-key",
}, { logger: { info() {} } });

const applicableFixtureIds = new Set([
  "health",
  "device-register",
  "device-activate",
  "execution-preflight",
  "telemetry-events-batch",
  "desktop-login-start",
  "desktop-login-invalid",
  "desktop-google-start-missing-handoff",
  "desktop-login-status-missing",
  "desktop-link-device-missing-state",
  "google-auth-start-json",
  "google-auth-result-missing",
  "google-callback-missing-state",
  "chat-completions",
  "audio-transcriptions",
  "unknown-route-error",
  "admin-options-cors",
  "admin-dashboard-summary",
  "admin-request-events",
  "admin-usage-summary",
  "admin-feedback-list",
  "admin-profile-audit",
  "admin-pricing-get",
  "admin-runtime-policy",
  "admin-profiles-list",
  "admin-devices-list",
  "admin-accounts-list",
]);

function requestForFixture(fixture: ContractFixture): Request {
  const headers = new Headers(fixture.request.headers ?? {});
  if (fixture.adminCapability) headers.set("authorization", `Bearer ${fixture.adminCapability === "publish" ? "fixture-admin-publish-key" : fixture.adminCapability === "edit" ? "fixture-admin-edit-key" : "fixture-admin-view-key"}`);
  const body = fixture.request.bodyFactory
    ? fixture.request.bodyFactory()
    : fixture.request.body === undefined
      ? undefined
      : fixture.request.bodyKind === "text"
        ? String(fixture.request.body)
        : JSON.stringify(fixture.request.body);
  if (fixture.request.contentType && !fixture.request.bodyFactory) headers.set("content-type", fixture.request.contentType);
  else if (fixture.request.bodyKind === "json" && body !== undefined) headers.set("content-type", "application/json");
  return new Request(`https://fixture.invalid${fixture.path}`, { method: fixture.method, headers, body });
}

async function resetDomainData(): Promise<void> {
  const database = await api.sql.unsafe<{ database_name: string }>("SELECT current_database() AS database_name");
  if (database[0]?.database_name !== "fixvox_test") throw new Error("unsafe_test_database");
  await api.sql.unsafe(`
    TRUNCATE TABLE audit_records, usage_events, usage_reservations, policy_assignments,
      account_groups, install_bindings, devices, accounts, settings_defaults,
      profile_engine_bindings, profile_prompt_bindings, profile_versions, profiles, groups,
      engines, prompts, quota_policies, oauth_states, desktop_login_sessions, admin_sessions,
      role_bindings, request_events, prewarm_daily_counters, feedback_events, pricing_records, pricing_watchlist, migration_runs
    RESTART IDENTITY CASCADE
  `);
  await api.sql.unsafe("DELETE FROM control_plane_authority");
  await api.sql.unsafe("INSERT INTO control_plane_authority (mode, revision, changed_by) VALUES ('cloudflare-authority', 0, 'contract-test')");
  const profiles = await api.sql.unsafe<{ id: string }>("INSERT INTO profiles (profile_id, label) VALUES ('basic', 'Basic') RETURNING id::text");
  await api.sql.unsafe(`
    INSERT INTO profile_versions (profile_id, version, status, definition, authority_revision, created_by, published_by, published_at)
    VALUES ($1::uuid, 1, 'published', $2::jsonb, 0, 'contract-test', 'contract-test', now())
  `, [profiles[0].id, JSON.stringify({ capabilities: ["dictation", "postprocess"], quota: { mode: "unlimited" }, engines: { chat: { provider: "mock", model: "fixture-chat" }, postprocess: { provider: "mock", model: "fixture-postprocess" }, audio: { provider: "mock", model: "fixture-audio" } } })]);
  await api.sql.unsafe("UPDATE profiles SET active_published_version = 1 WHERE id = $1::uuid", [profiles[0].id]);
}

async function seedPopulatedAdmin(): Promise<void> {
  const profile = await api.sql.unsafe<{ id: string }>("INSERT INTO profiles (profile_id, label) VALUES ('pro', 'Pro') RETURNING id::text");
  await api.sql.unsafe("INSERT INTO profile_versions (profile_id, version, status, definition, authority_revision, created_by, published_by, published_at) VALUES ($1::uuid, 1, 'published', $2::jsonb, 0, 'contract-test', 'contract-test', '2026-01-01T00:00:00.000Z'), ($1::uuid, 2, 'draft', $2::jsonb, 0, 'contract-test', null, null)", [profile[0].id, JSON.stringify({ capabilities: ["dictation"], quota: { mode: "unlimited" }, engines: { chat: { provider: "mock", model: "fixture-model" }, audio: { provider: "mock", model: "fixture-model" } } })]);
  await api.sql.unsafe("UPDATE profiles SET active_published_version = 1, current_draft_version = 2 WHERE id = $1::uuid", [profile[0].id]);
  const account = await api.sql.unsafe<{ id: string }>("INSERT INTO accounts (provider, provider_subject_hash, handle, display_label, budget_daily_microusd, budget_monthly_microusd, budget_mode, admin_metadata) VALUES ('fixture', 'hash-redacted', 'fixture-account', 'Fixture account', 1000000, 10000000, 'warn', '{\"schemaVersion\":1,\"variants\":[\"fixture-variant\"],\"segments\":[\"fixture-variant\"]}'::jsonb) RETURNING id::text");
  const device = await api.sql.unsafe<{ id: string }>("INSERT INTO devices (device_id, account_id, status, policy_id, policy_label, last_seen_at) VALUES ('fixture-device-admin', $1::uuid, 'active', 'pro', 'Pro', '2026-01-01T00:00:00.000Z') RETURNING id::text", [account[0].id]);
  const group = await api.sql.unsafe<{ id: string }>("INSERT INTO groups (group_id, label, description, runtime_profile_id, source) VALUES ('fixture-group', 'Fixture group', 'synthetic', 'pro', 'custom') RETURNING id::text");
  await api.sql.unsafe("INSERT INTO account_groups (account_id, group_id) VALUES ($1::uuid, $2::uuid)", [account[0].id, group[0].id]);
  await api.sql.unsafe("INSERT INTO policy_assignments (target_type, target_id, profile_id, priority, source) VALUES ('account', $1::uuid, $2::uuid, 30, 'fixture'), ('device', $3::uuid, $2::uuid, 20, 'fixture'), ('group', $4::uuid, $2::uuid, 10, 'fixture')", [account[0].id, profile[0].id, device[0].id, group[0].id]);
  await api.sql.unsafe("INSERT INTO engines (engine_id, kind, provider, model, enabled, runtime_options) VALUES ('fixture-engine', 'postprocess', 'mock', 'fixture-model', true, '{\"schemaVersion\":1}'::jsonb)");
  await api.sql.unsafe("INSERT INTO prompts (prompt_id, kind, body, enabled, version) VALUES ('fixture-prompt', 'postprocess', 'fixture prompt body must never be projected', true, 1)");
  await api.sql.unsafe("INSERT INTO settings_defaults (profile_id, schema_version, settings) VALUES ($1::uuid, 1, '{\"selectionPresets\":{\"schemaVersion\":1,\"items\":[{\"id\":\"fixture-preset\",\"label\":\"Fixture preset\",\"promptId\":\"fixture-prompt\"}]}}'::jsonb)", [profile[0].id]);
  await api.sql.unsafe("INSERT INTO audit_records (actor_ref_hash, action, target_type, target_ref_hash, result, occurred_at) VALUES ('redacted', 'fixture_seed', 'profile', 'redacted', 'success', '2026-01-01T00:00:00.000Z')");
  await api.sql.unsafe("INSERT INTO request_events (account_id, device_id, route, status, latency_ms, outcome, usage_kind, profile_id, engine_id, prompt_id, input_units, safe_metrics, occurred_at) VALUES ($1::uuid, $2::uuid, '/v1/chat/completions', 200, 12, 'success', 'aiAction', 'pro', 'fixture-engine', 'fixture-prompt', 1, '{\"schemaVersion\":1}'::jsonb, '2026-01-01T00:00:00.000Z')", [account[0].id, device[0].id]);
  await api.sql.unsafe("INSERT INTO prewarm_daily_counters (device_id, utc_date, attempts, successes, failures, last_observed_at) VALUES ($1::uuid, '2026-01-01', 1, 1, 0, '2026-01-01T00:00:00.000Z')", [device[0].id]);
}

async function registerFixtureDevice(): Promise<void> {
  const fixture = HTTP_CONTRACT_FIXTURES.find((entry) => entry.id === "device-register");
  if (!fixture) throw new Error("device_register_fixture_missing");
  const response = await api.handler(requestForFixture(fixture));
  if (!response.ok) throw new Error(`device_fixture_setup_failed:${response.status}`);
}

beforeEach(resetDomainData);
afterAll(async () => api.close());

describe("provider-free Bun contract runner with isolated PostgreSQL", () => {
  test("executes every currently applicable frozen fixture with PostgreSQL and mock providers", async () => {
    const fixtures = HTTP_CONTRACT_FIXTURES.filter((fixture) => applicableFixtureIds.has(fixture.id));
    const compare = (left: string, right: string) => left.localeCompare(right);
    expect(fixtures.map((fixture) => fixture.id).sort(compare)).toEqual([...applicableFixtureIds].sort(compare));
    const results: Array<{ fixture: string; request: Record<string, unknown>; response: NormalizedResponse }> = [];
    for (const fixture of fixtures) {
      await resetDomainData();
      if (fixture.setup === "admin-populated") await seedPopulatedAdmin();
      if (fixture.setup === "device") await registerFixtureDevice();
      const response = await api.handler(requestForFixture(fixture));
      const normalized = await normalizeResponse(response);
      assertNormalizedContract(fixture, normalized);
      results.push({ fixture: fixture.id, request: summarizeRequest(fixture), response: normalized });
    }
    const report = redactEvidence({ schemaVersion: 1, runner: "bun-handler-postgres-provider-free", fixtureCount: results.length, results });
    const serialized = JSON.stringify(report, null, 2);
    assertNoSensitiveText(serialized, "Bun contract runner report");
    await Bun.write(new URL("../../artifacts/self-hosted-control-plane/checkpoint-d/bun-contract-report.json", import.meta.url), `${serialized}\n`);
  });

  test("does not persist fixture audio, selected text, or client-selected provider routing", async () => {
    await registerFixtureDevice();
    const chat = HTTP_CONTRACT_FIXTURES.find((fixture) => fixture.id === "chat-completions");
    const audio = HTTP_CONTRACT_FIXTURES.find((fixture) => fixture.id === "audio-transcriptions");
    if (!chat || !audio) throw new Error("provider_fixture_missing");
    expect((await api.handler(requestForFixture(chat))).status).toBe(200);
    expect((await api.handler(requestForFixture(audio))).status).toBe(200);
    const persisted = JSON.stringify(await api.sql.unsafe("SELECT safe_metadata FROM feedback_events"));
    for (const value of [CONTRACT_TEST_VALUES.audio, CONTRACT_TEST_VALUES.selectedText, CONTRACT_TEST_VALUES.providerKey]) {
      expect(persisted).not.toContain(value);
    }
  });
});
