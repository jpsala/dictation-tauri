import { readlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";

const gate = Bun.env.FIXVOX_ALLOW_VPS_REAL_STT_SMOKE;
const databaseUrl = Bun.env.FIXVOX_DATABASE_URL;
const groqKey = Bun.env.GROQ_API_KEY;
const releaseRoot = Bun.env.FIXVOX_SMOKE_RELEASE_ROOT;
const audioPath = Bun.env.FIXVOX_SMOKE_AUDIO_PATH;
const receiptPath = Bun.env.FIXVOX_SMOKE_RECEIPT_PATH;
const smokeMode = Bun.env.FIXVOX_STT_SMOKE_MODE;
const operationId = "vps-shadow-real-stt-20260722-1";
const installId = "vps-shadow-synthetic-install-20260722-1";
const engineId = "stt-groq-whisper-turbo";
const providerId = "groq";
const modelId = "whisper-large-v3-turbo";
const expectedPriceMicrousd = 40_000;
const canonicalEngines = [
  { id: engineId, kind: "transcription", provider: providerId, model: modelId },
  { id: "postprocess-groq-gpt-oss-120b", kind: "postprocess", provider: providerId, model: "openai/gpt-oss-120b" },
  { id: "transform-groq-llama-70b", kind: "selectionTransform", provider: providerId, model: "llama-3.3-70b-versatile" },
];

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function wavDurationMs(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  assert(bytes.byteLength >= 44 && text(0, 4) === "RIFF" && text(8, 4) === "WAVE", "fixture_wav_invalid");
  let byteRate = 0;
  let dataSize = 0;
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const kind = text(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    assert(body + size <= bytes.byteLength, "fixture_wav_invalid");
    if (kind === "fmt " && size >= 12) byteRate = view.getUint32(body + 8, true);
    if (kind === "data") dataSize = size;
    offset = body + size + (size % 2);
  }
  assert(byteRate > 0 && dataSize > 0, "fixture_wav_invalid");
  const duration = Math.round((dataSize * 1000) / byteRate);
  assert(duration > 250 && duration < 30_000, "fixture_duration_out_of_bounds");
  return duration;
}

function normalized(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

async function configureCanonicalShadow(sql) {
  const partialDefinition = {
    schemaVersion: 1, label: "VPS Shadow STT", access: { capabilities: ["dictation"] },
    runtime: { transcription: { engineId } },
    limits: { mode: "warn", quotaProfile: "pro-unlimited" }, userControls: {}, defaults: {},
  };
  const definition = {
    ...partialDefinition,
    runtime: {
      transcription: { engineId },
      postprocess: { engineId: "postprocess-groq-gpt-oss-120b" },
      selectionTransform: { engineId: "transform-groq-llama-70b" },
    },
  };
  await sql.begin(async (tx) => {
    await tx.unsafe("SELECT pg_advisory_xact_lock(91827402)");
    for (const engine of canonicalEngines) {
      await tx.unsafe(`
        INSERT INTO engines (engine_id, kind, provider, model, enabled, runtime_options)
        VALUES ($1, $2, $3, $4, true, $5::jsonb)
        ON CONFLICT (engine_id) DO NOTHING
      `, [engine.id, engine.kind, engine.provider, engine.model, JSON.stringify({ schemaVersion: 1, source: "built-in", catalogVersion: "1" })]);
      const rows = await tx.unsafe(`SELECT kind, provider, model, enabled FROM engines WHERE engine_id = $1`, [engine.id]);
      assert(rows.length === 1 && rows[0].kind === engine.kind && rows[0].provider === engine.provider && rows[0].model === engine.model && rows[0].enabled === true, "canonical_engine_conflict");
    }

    await tx.unsafe(`INSERT INTO profiles (profile_id, label) VALUES ('basic', 'VPS Shadow STT') ON CONFLICT (profile_id) DO NOTHING`);
    const profiles = await tx.unsafe(`SELECT id::text, label, active_published_version, revision::text FROM profiles WHERE profile_id = 'basic'`);
    assert(profiles.length === 1 && profiles[0].label === "VPS Shadow STT" && [1, 2].includes(profiles[0].active_published_version), "canonical_profile_conflict");
    const versions = await tx.unsafe(`
      SELECT
        v1.status AS v1_status,
        v1.definition = $2::jsonb AS v1_partial,
        v2.status AS v2_status,
        v2.definition = $3::jsonb AS v2_complete
      FROM profiles p
      LEFT JOIN profile_versions v1 ON v1.profile_id = p.id AND v1.version = 1
      LEFT JOIN profile_versions v2 ON v2.profile_id = p.id AND v2.version = 2
      WHERE p.id = $1::uuid
    `, [profiles[0].id, JSON.stringify(partialDefinition), JSON.stringify(definition)]);
    const state = versions[0];
    if (profiles[0].active_published_version === 1 && Number(profiles[0].revision) === 0 && state?.v1_status === "published" && state?.v1_partial === true && state?.v2_status === null) {
      await tx.unsafe(`UPDATE profile_versions SET status = 'historical' WHERE profile_id = $1::uuid AND version = 1`, [profiles[0].id]);
      await tx.unsafe(`
        INSERT INTO profile_versions (profile_id, version, status, definition, authority_revision, created_by, published_by, published_at)
        VALUES ($1::uuid, 2, 'published', $2::jsonb, 1, 'vps-shadow-stt', 'vps-shadow-stt', now())
      `, [profiles[0].id, JSON.stringify(definition)]);
      await tx.unsafe(`UPDATE profiles SET active_published_version = 2, revision = 1, updated_at = now() WHERE id = $1::uuid`, [profiles[0].id]);
      await tx.unsafe(`
        INSERT INTO audit_records (actor_ref_hash, action, target_type, target_ref_hash, source_version, target_version, resulting_version, result, safe_metadata)
        VALUES ('redacted', 'profile.shadow_configure', 'profile', 'basic', 1, 2, 2, 'success', '{"schemaVersion":1,"authorityRevision":1}'::jsonb)
      `);
    } else {
      assert(profiles[0].active_published_version === 2 && Number(profiles[0].revision) === 1 && state?.v1_status === "historical" && state?.v2_status === "published" && state?.v2_complete === true, "canonical_profile_version_conflict");
    }
    const completed = await tx.unsafe(`
      SELECT p.active_published_version, p.revision::text, v1.status AS v1_status, v2.status AS v2_status, v2.definition = $2::jsonb AS matches
      FROM profiles p JOIN profile_versions v1 ON v1.profile_id = p.id AND v1.version = 1
      JOIN profile_versions v2 ON v2.profile_id = p.id AND v2.version = 2
      WHERE p.id = $1::uuid
    `, [profiles[0].id, JSON.stringify(definition)]);
    assert(completed.length === 1 && completed[0].active_published_version === 2 && Number(completed[0].revision) === 1 && completed[0].v1_status === "historical" && completed[0].v2_status === "published" && completed[0].matches === true, "canonical_profile_version_conflict");

    await tx.unsafe(`
      INSERT INTO pricing_records (provider_id, model_id, pricing, effective_at)
      VALUES ($1, $2, jsonb_build_object('schemaVersion', 1, 'currency', 'USD', 'unit', 'per_hour', 'priceMicrousd', $3::integer), '2026-07-22T00:00:00.000Z')
      ON CONFLICT (provider_id, model_id, effective_at) DO NOTHING
    `, [providerId, modelId, expectedPriceMicrousd]);
    await tx.unsafe(`
      UPDATE pricing_records
      SET pricing = (pricing #>> '{}')::jsonb
      WHERE provider_id = $1 AND model_id = $2 AND effective_at = '2026-07-22T00:00:00.000Z'
        AND jsonb_typeof(pricing) = 'string'
        AND (pricing #>> '{}')::jsonb = jsonb_build_object('schemaVersion', 1, 'currency', 'USD', 'unit', 'per_hour', 'priceMicrousd', $3::integer)
    `, [providerId, modelId, expectedPriceMicrousd]);
    const pricing = await tx.unsafe(`
      SELECT pricing = jsonb_build_object('schemaVersion', 1, 'currency', 'USD', 'unit', 'per_hour', 'priceMicrousd', $3::integer) AS matches
      FROM pricing_records WHERE provider_id = $1 AND model_id = $2
      ORDER BY effective_at DESC, created_at DESC LIMIT 1
    `, [providerId, modelId, expectedPriceMicrousd]);
    assert(pricing.length === 1 && pricing[0].matches === true, "canonical_pricing_conflict");
  });
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function cleanupSyntheticIdentity(sql, deviceId, installIdHash) {
  await sql.begin(async (tx) => {
    const devices = await tx.unsafe(`
      SELECT DISTINCT d.device_id FROM devices d
      LEFT JOIN install_bindings b ON b.device_id = d.id
      WHERE d.device_id = $1 OR d.install_id_hash = $2 OR b.install_id_hash = $2
    `, [deviceId ?? "", installIdHash]);
    assert(devices.length <= 1, "synthetic_identity_scope_invalid");
    await tx.unsafe(`DELETE FROM budget_reservations WHERE request_id = $1`, [operationId]);
    for (const device of devices) {
      await tx.unsafe(`DELETE FROM budget_counters WHERE scope_type = 'device' AND scope_id = $1`, [device.device_id]);
    }
    await tx.unsafe(`DELETE FROM install_bindings WHERE install_id_hash = $1 OR device_id IN (SELECT id FROM devices WHERE device_id = $2)`, [installIdHash, deviceId ?? ""]);
    await tx.unsafe(`DELETE FROM devices WHERE install_id_hash = $1 OR device_id = $2`, [installIdHash, deviceId ?? ""]);
  });
}

async function main() {
  assert(gate === "1", "real_stt_smoke_requires_explicit_gate");
  assert(smokeMode === "preflight" || smokeMode === "real", "real_stt_smoke_mode_invalid");
  assert(databaseUrl && releaseRoot && audioPath, "real_stt_smoke_missing_input");
  if (smokeMode === "real") assert(groqKey && receiptPath, "real_stt_smoke_missing_input");
  const installIdHash = await sha256(installId);
  const host = Bun.spawnSync(["hostname", "-s"]).stdout.toString().trim();
  assert(host === "srv1761438", "real_stt_smoke_wrong_host");
  assert(readlinkSync("/home/jpsal/opt/fixvox-api/current") === "/home/jpsal/opt/fixvox-api/releases/90ca26a7e3bd6f50", "persistent_release_changed");
  const parsedDatabase = new URL(databaseUrl);
  assert(parsedDatabase.hostname === "127.0.0.1" && parsedDatabase.pathname === "/fixvox", "real_stt_smoke_database_invalid");
  const audioBytes = new Uint8Array(await Bun.file(audioPath).arrayBuffer());
  assert(audioBytes.byteLength > 44 && audioBytes.byteLength < 1_000_000, "fixture_size_out_of_bounds");
  const durationMs = wavDurationMs(audioBytes);

  const sql = new Bun.SQL(databaseUrl);
  let api;
  let deviceId;
  let providerCalls = 0;
  let providerLatencyMs = 0;
  try {
    const schema = await sql.unsafe(`SELECT max(version)::integer AS version FROM schema_migrations`);
    const authority = await sql.unsafe(`SELECT mode FROM control_plane_authority WHERE singleton = true`);
    const prior = await sql.unsafe(`
      SELECT
        (SELECT count(*)::integer FROM budget_reservations WHERE request_id = $1) AS reservations,
        (SELECT count(*)::integer FROM audit_records WHERE action = 'vps_shadow_real_stt_once') AS attempts
    `, [operationId]);
    assert(schema[0]?.version === 6 && authority[0]?.mode === "cloudflare-authority" && prior[0]?.reservations === 0 && prior[0]?.attempts === 0, "real_stt_smoke_precondition_failed");
    await configureCanonicalShadow(sql);

    const [{ composeApi }, { createConfiguredProviderProxy, createMockProviderProxy }] = await Promise.all([
      import(pathToFileURL(`${releaseRoot}/cloud/fixvox-api/src/composition.ts`).href),
      import(pathToFileURL(`${releaseRoot}/cloud/fixvox-api/src/providers.ts`).href),
    ]);
    const providers = smokeMode === "real"
      ? createConfiguredProviderProxy({ groq: groqKey, openrouter: undefined }, async (input, init) => {
        assert(providerCalls === 0, "real_stt_smoke_provider_call_limit");
        providerCalls += 1;
        const started = performance.now();
        try { return await fetch(input, init); }
        finally { providerLatencyMs = Math.round(performance.now() - started); }
      })
      : createMockProviderProxy();
    api = composeApi({
      FIXVOX_API_DATABASE_URL: databaseUrl,
      FIXVOX_API_PUBLIC_BASE_URL: "https://vps-shadow-smoke.invalid",
      FIXVOX_API_MOCK_PROVIDERS: smokeMode === "real" ? "false" : "true",
      FIXVOX_API_REQUEST_TIMEOUT_MS: "30000",
      ...(groqKey ? { GROQ_API_KEY: groqKey } : {}),
    }, { providers, logger: { info() {} } });

    const bootstrap = await api.handler(new Request("https://vps-shadow-smoke.invalid/product/v1/desktop/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ installId, device: { platform: "windows", appVersion: "shadow-smoke" } }),
    }));
    const bootstrapPayload = await bootstrap.json();
    deviceId = bootstrapPayload?.data?.binding?.deviceId;
    assert(bootstrap.status === 200, "real_stt_smoke_bootstrap_failed");
    assert(typeof deviceId === "string" && deviceId.length > 0, "real_stt_smoke_device_missing");
    if (smokeMode === "preflight") {
      assert(providerCalls === 0, "real_stt_smoke_provider_call_limit");
      console.log(JSON.stringify({ checkpoint: "vps-shadow-stt-preflight", status: 200, providerCalls: 0, profile: "basic", transcriptionEngine: engineId }));
      return;
    }

    await sql.unsafe(`
      INSERT INTO audit_records (actor_ref_hash, action, target_type, target_ref_hash, result, safe_metadata)
      VALUES ('redacted', 'vps_shadow_real_stt_once', 'provider_smoke', 'redacted', 'attempt_authorized', '{"schemaVersion":1,"providerCallsMax":1}'::jsonb)
    `);
    const form = new FormData();
    form.set("metadata", JSON.stringify({ operationId, durationMs, language: "en" }));
    form.set("audio", new Blob([audioBytes], { type: "audio/wav" }), "en-clean-note.wav");
    const response = await api.handler(new Request("https://vps-shadow-smoke.invalid/product/v1/runtime/transcriptions", {
      method: "POST",
      headers: { "x-device-id": deviceId },
      body: form,
    }));
    const payload = await response.json();
    const transcript = payload?.data?.text;
    const expectedTextMatch = typeof transcript === "string"
      && ["create", "project", "testing", "pipeline"].every((token) => normalized(transcript).includes(token));
    const ledger = await sql.unsafe(`SELECT state, estimated_microusd = settled_microusd AS used_estimate FROM budget_reservations WHERE request_id = $1`, [operationId]);
    assert(response.status === 200 && providerCalls === 1 && expectedTextMatch, "real_stt_smoke_transcription_failed");
    assert(ledger.length === 1 && ledger[0].state === "settled" && ledger[0].used_estimate === true, "real_stt_smoke_ledger_failed");

    const receipt = {
      schemaVersion: 1,
      checkpoint: "vps-shadow-real-stt",
      provider: providerId,
      model: modelId,
      providerCalls,
      responseStatus: response.status,
      expectedTextMatch,
      durationMs,
      providerLatencyMs,
      estimatePresent: true,
      actualCostSource: "conservative_estimate",
      ledgerOutcome: "settled",
      rawContentPersisted: false,
      persistentServiceTouched: false,
      routingTouched: false,
      authorityMode: "cloudflare-authority",
    };
    await Bun.write(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify(receipt));
  } finally {
    if (api) await api.close();
    await cleanupSyntheticIdentity(sql, deviceId, installIdHash);
    await sql.close();
  }
}

await main();
