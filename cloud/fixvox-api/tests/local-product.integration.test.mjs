import { afterAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { createHash } from "node:crypto";

import { composeApi } from "../src/composition.ts";
import { bootstrapBuiltinEnginePromptCatalog } from "../src/postgres/bootstrap-builtin-engine-prompt-catalog.ts";
import { createMockProviderProxy } from "../src/providers.ts";

const databaseUrl = Bun.env.FIXVOX_DATABASE_URL;
if (!databaseUrl) throw new Error("missing_FIXVOX_DATABASE_URL");
const sql = new Bun.SQL(databaseUrl);

afterAll(async () => {
  await resetDomainData();
  await sql.close();
});

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
  await sql.unsafe("INSERT INTO control_plane_authority (mode, revision, changed_by) VALUES ('cloudflare-authority', 0, 'local-product-smoke')");
}

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  server.close();
  await once(server, "close");
  if (!port) throw new Error("local_port_unavailable");
  return port;
}

async function waitFor(url, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child && child.exitCode !== null) throw new Error("local_admin_exited");
    try { if ((await fetch(url)).ok) return; } catch {}
    await Bun.sleep(25);
  }
  throw new Error("local_service_timeout");
}

function safeChildEnvironment(overrides) {
  const safe = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(?:KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|COOKIE|CREDENTIAL)/i.test(key)));
  return { ...safe, ...overrides };
}

async function jsonFetch(url, init) {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(`local_http_${response.status}:${String(payload?.error?.code ?? payload?.error ?? "unknown")}`);
  return payload;
}

describe("Checkpoint E local product integration", () => {
  test("runs Admin BFF and canonical Tauri flows against one provider-free PostgreSQL service", async () => {
    await resetDomainData();
    await bootstrapBuiltinEnginePromptCatalog(sql);
    await sql.unsafe(`INSERT INTO engines (engine_id, kind, provider, model) VALUES ('e-local-stt', 'transcription', 'mock', 'stt-local'), ('e-local-chat', 'postprocess', 'mock', 'chat-local'), ('e-local-selection', 'selectionTransform', 'mock', 'selection-local')`);
    await sql.unsafe(`INSERT INTO prompts (prompt_id, kind, body) VALUES ('p-local-stt', 'transcription', 'synthetic prompt'), ('p-local-chat', 'postprocess', 'synthetic prompt'), ('p-local-selection', 'selectionTransform', 'synthetic prompt')`);
    const definition = {
      schemaVersion: 1, label: "Local Basic",
      access: { capabilities: ["dictation", "postprocess", "selection_transform", "assistant_actions", "custom_prompts", "admin_settings"] },
      runtime: { transcription: { engineId: "e-local-stt", promptId: "p-local-stt" }, postprocess: { engineId: "e-local-chat", promptId: "p-local-chat" }, selectionTransform: { engineId: "e-local-selection", promptId: "p-local-selection" } },
      limits: { mode: "block", quotaProfile: "pro-unlimited" }, userControls: {}, defaults: { "voice.pressEnterAfterPaste": false },
    };
    const profiles = await sql.unsafe(`INSERT INTO profiles (profile_id, label) VALUES ('basic', 'Local Basic') RETURNING id::text`);
    await sql.unsafe(`INSERT INTO profile_versions (profile_id, version, status, definition, authority_revision, created_by, published_by, published_at) VALUES ($1::uuid, 1, 'published', $2::jsonb, 0, 'local-smoke', 'local-smoke', now())`, [profiles[0].id, JSON.stringify(definition)]);
    await sql.unsafe(`UPDATE profiles SET active_published_version = 1 WHERE id = $1::uuid`, [profiles[0].id]);

    const googleSubject = "mock-jpsala-google-sub";
    const subjectHash = createHash("sha256").update(googleSubject).digest("hex");
    const accounts = await sql.unsafe(`INSERT INTO accounts (provider, provider_subject_hash, handle, display_label) VALUES ('google', $1, 'local-owner', 'Local Owner') RETURNING id::text`, [subjectHash]);
    const ownerDevices = await sql.unsafe(`INSERT INTO devices (device_id, account_id, policy_id, policy_label) VALUES ('local-owner-device', $1::uuid, 'basic', 'Local Basic') RETURNING id::text`, [accounts[0].id]);
    await sql.unsafe(`INSERT INTO install_bindings (install_id_hash, device_id) VALUES ('local-owner-install-hash', $1::uuid)`, [ownerDevices[0].id]);
    await sql.unsafe(`INSERT INTO role_bindings (account_id, role, granted_by) VALUES ($1::uuid, 'owner', 'local-bootstrap')`, [accounts[0].id]);

    const apiPort = await freePort();
    const adminPort = await freePort();
    const viewKey = "checkpoint-e-local-view";
    const editKey = "checkpoint-e-local-edit";
    const publishKey = "checkpoint-e-local-publish";
    const providerCalls = [];
    const mockProvider = createMockProviderProxy();
    const api = composeApi({ FIXVOX_API_DATABASE_URL: databaseUrl, FIXVOX_API_PUBLIC_BASE_URL: `http://127.0.0.1:${apiPort}`, FIXVOX_API_MOCK_PROVIDERS: "true", FIXVOX_API_HOST: "127.0.0.1", FIXVOX_API_PORT: String(apiPort), ADMIN_VIEW_API_KEY: viewKey, ADMIN_EDIT_API_KEY: editKey, ADMIN_PUBLISH_API_KEY: publishKey }, { logger: { info() {} }, providers: { async proxy(input) { providerCalls.push({ kind: input.kind, engine: input.policy.engine }); return mockProvider.proxy(input); } } });
    const apiServer = Bun.serve({ hostname: "127.0.0.1", port: apiPort, fetch: api.handler });
    const repoRoot = new URL("../../../", import.meta.url);
    const admin = spawn(process.execPath, ["admin/fixvox-web/server.mjs"], {
      cwd: repoRoot,
      env: safeChildEnvironment({
        FIXVOX_ADMIN_SKIP_ENV_FILES: "1", FIXVOX_ADMIN_MOCK: "0", FIXVOX_ADMIN_ENV: "local", FIXVOX_ADMIN_LOCAL_AUTH_FIXTURE: "1",
        FIXVOX_ADMIN_HOST: "127.0.0.1", FIXVOX_ADMIN_PORT: String(adminPort), FIXVOX_ADMIN_BASE_URL: `http://127.0.0.1:${apiPort}`,
        FIXVOX_ADMIN_MOCK_SUB: googleSubject, FIXVOX_ADMIN_MOCK_EMAIL: "jpsala@gmail.com",
        ADMIN_VIEW_API_KEY: viewKey, ADMIN_EDIT_API_KEY: editKey, ADMIN_PUBLISH_API_KEY: publishKey,
        FIXVOX_ADMIN_WEB_TOKEN: "checkpoint-e-local-web", PI_CHAT_REMOTE_AGENT_ENABLED: "0", PI_CHAT_UNRESTRICTED_OWNER: "0",
      }),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let adminOutput = "";
    admin.stdout?.on("data", (chunk) => { adminOutput += chunk.toString(); });
    admin.stderr?.on("data", (chunk) => { adminOutput += chunk.toString(); });
    const apiBase = `http://127.0.0.1:${apiPort}`;
    const adminBase = `http://127.0.0.1:${adminPort}`;
    const responses = [];
    try {
      await waitFor(`${apiBase}/ready`);
      await waitFor(`${adminBase}/healthz`, admin);
      expect((await jsonFetch(`${adminBase}/api/admin/rbac`)).role).toBe("owner");
      const policies = await jsonFetch(`${adminBase}/api/admin/policies`);
      responses.push(policies);
      expect(policies.profileVersions.some((profile) => profile.profileId === "basic" && profile.published?.runtime?.transcription?.engineId === "e-local-stt")).toBe(true);
      expect(policies.engineOptions.some((engine) => engine.id === "e-local-stt")).toBe(true);
      expect(policies.promptOptions.some((prompt) => String(prompt.id).startsWith("preset."))).toBe(true);
      const accountsPayload = await jsonFetch(`${adminBase}/api/admin/accounts`);
      const devicesPayload = await jsonFetch(`${adminBase}/api/admin/devices`);
      responses.push(accountsPayload, devicesPayload);
      expect(accountsPayload.accounts).toHaveLength(1);
      expect(devicesPayload.devices).toHaveLength(1);

      const candidate = { ...definition, label: "Local Basic v2", defaults: { "voice.pressEnterAfterPaste": true } };
      const applied = await jsonFetch(`${adminBase}/api/admin/profiles/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId: "basic", expectedActiveVersion: 1, definition: candidate, confirmation: "APPLY basic v1" }) });
      responses.push(applied);
      expect(applied.published.version).toBe(2);
      expect(applied.revision).toBe(1);
      const rolledBack = await jsonFetch(`${adminBase}/api/admin/profiles/rollback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId: "basic", version: 1, expectedActiveVersion: 2, confirmation: "ROLLBACK basic to v1" }) });
      responses.push(rolledBack);
      expect(rolledBack.published.version).toBe(3);
      expect(rolledBack.published.basedOnVersion).toBe(1);
      const audit = await jsonFetch(`${adminBase}/api/admin/audit`);
      responses.push(audit);
      expect(audit.records.map((record) => record.action)).toEqual(["profile.rollback", "profile.apply"]);

      const bootstrap = await jsonFetch(`${apiBase}/product/v1/desktop/bootstrap`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ installId: "checkpoint-e-runtime-install", device: { platform: "windows", appVersion: "0.1.0" } }) });
      responses.push(bootstrap);
      const deviceId = bootstrap.data.binding.deviceId;
      expect(bootstrap.data.context.profile).toEqual({ key: "basic", version: 3, revision: 3 });
      expect(bootstrap.data.context.capabilities).toEqual({ transcription: true, postprocess: true, selectionTransform: true, assistant: true, feedback: false, adminSettings: true });
      const context = await jsonFetch(`${apiBase}/product/v1/desktop/context`, { headers: { "x-device-id": deviceId } });
      responses.push(context);
      expect(context.data.profile.version).toBe(3);

      const form = new FormData();
      form.set("metadata", JSON.stringify({ operationId: "checkpoint-e-stt", durationMs: 250, language: "es" }));
      form.set("audio", new Blob([new Uint8Array([17, 29, 43])], { type: "audio/wav" }), "synthetic.wav");
      const transcription = await jsonFetch(`${apiBase}/product/v1/runtime/transcriptions`, { method: "POST", headers: { "x-device-id": deviceId }, body: form });
      responses.push(transcription);
      expect(transcription.data.text).toBe("fixture provider transcription");
      for (const fixture of [
        { kind: "postprocess", input: { transcript: "checkpoint-e-private-transcript" } },
        { kind: "selection_transform", input: { selectedText: "checkpoint-e-private-selection", instruction: "shorten", presetKey: "corregir-texto" } },
        { kind: "assistant", input: { utterance: "checkpoint-e-private-assistant" } },
      ]) {
        const action = await jsonFetch(`${apiBase}/product/v1/runtime/actions`, { method: "POST", headers: { "content-type": "application/json", "x-device-id": deviceId }, body: JSON.stringify({ operationId: `checkpoint-e-${fixture.kind}`, ...fixture }) });
        responses.push(action);
        expect(action.data.kind).toBe(fixture.kind);
      }
      expect(providerCalls).toEqual([
        { kind: "audio", engine: { id: "e-local-stt", provider: "mock", model: "stt-local", promptId: "p-local-stt" } },
        { kind: "chat", engine: { id: "e-local-chat", provider: "mock", model: "chat-local", promptId: "p-local-chat" } },
        { kind: "chat", engine: { id: "e-local-selection", provider: "mock", model: "selection-local", promptId: "p-local-selection" } },
        { kind: "chat", engine: { id: "e-local-selection", provider: "mock", model: "selection-local", promptId: "p-local-selection" } },
      ]);

      const evidence = JSON.stringify(responses);
      expect(evidence).not.toMatch(/checkpoint-e-private-(?:transcript|selection|assistant)/);
      expect(evidence).not.toContain(publishKey);
      const auditStorage = await sql.unsafe(`SELECT coalesce(string_agg(action || ':' || safe_metadata::text, '|'), '') AS value FROM audit_records`);
      expect(auditStorage[0].value).not.toMatch(/checkpoint-e-private|Local Basic v2|APPLY basic|ROLLBACK basic/);
      expect(adminOutput).not.toMatch(/checkpoint-e-private|checkpoint-e-local-(?:view|edit|publish)/);
    } finally {
      admin.kill("SIGTERM");
      if (admin.exitCode === null) await once(admin, "exit");
      apiServer.stop(true);
      await api.close();
      await resetDomainData();
    }
  }, 30_000);
});
