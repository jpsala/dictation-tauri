import { readFileSync, readlinkSync } from "node:fs";

export const CANARY_RELEASE = "4075da53c365a8b1";
export const CANARY_ACTION = "vps_persistent_provider_canary_once";
export const CANARY_OPERATION_ID = "vps-persistent-provider-canary-20260722-1";
const CANARY_INSTALL_ID = "vps-persistent-canary-install-20260722-1";
const SERVICE_BASE_URL = "http://127.0.0.1:8790";
const ADMIN_HEALTH_URL = "http://127.0.0.1:8787/healthz";
const EXPECTED_TOKENS = ["create", "project", "testing", "pipeline"];

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

export function wavDurationMs(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  assert(bytes.byteLength >= 44 && bytes.byteLength < 1_000_000, "canary_fixture_size_invalid");
  assert(text(0, 4) === "RIFF" && text(8, 4) === "WAVE", "canary_fixture_wav_invalid");
  let byteRate = 0;
  let dataSize = 0;
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const kind = text(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    assert(body + size <= bytes.byteLength, "canary_fixture_wav_invalid");
    if (kind === "fmt " && size >= 12) byteRate = view.getUint32(body + 8, true);
    if (kind === "data") dataSize = size;
    offset = body + size + (size % 2);
  }
  assert(byteRate > 0 && dataSize > 0, "canary_fixture_wav_invalid");
  const durationMs = Math.round((dataSize * 1000) / byteRate);
  assert(durationMs > 250 && durationMs < 30_000, "canary_fixture_duration_invalid");
  return durationMs;
}

function normalized(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assertBaseline(environment, baseline) {
  assert(environment.hostname === "srv1761438", "canary_wrong_host");
  assert(environment.currentRelease === CANARY_RELEASE, "canary_release_changed");
  assert(environment.providerConfigured === true, "canary_provider_not_configured");
  assert(environment.serviceRestarts === 0, "canary_service_restarts_changed");
  assert(environment.loopbackOnly === true, "canary_listener_changed");
  assert(baseline.schema === 6, "canary_schema_changed");
  assert(baseline.authorityMode === "cloudflare-authority", "canary_authority_changed");
  assert(baseline.historicalMarker === 1, "canary_historical_marker_changed");
  assert(baseline.canaryMarker === 0, "canary_already_attempted");
  assert(baseline.reservations === 0, "canary_reservation_exists");
  assert(baseline.profileVersion === 2 && baseline.profileRevision === 1, "canary_profile_changed");
  assert(baseline.canonicalEngines === 3, "canary_engines_changed");
  assert(baseline.pricingRecords === 1, "canary_pricing_changed");
}

export async function runPersistentCanary({ mode, environment, audioBytes, database, fetchImpl, writeReceipt = async () => {} }) {
  assert(mode === "preflight" || mode === "real", "canary_mode_invalid");
  const durationMs = wavDurationMs(audioBytes);
  const installIdHash = await sha256(CANARY_INSTALL_ID);
  const baseline = await database.inspectBaseline({ operationId: CANARY_OPERATION_ID, action: CANARY_ACTION });
  assertBaseline(environment, baseline);

  let deviceId;
  let transcriptionRequests = 0;
  try {
    const health = await fetchImpl(`${SERVICE_BASE_URL}/health`);
    assert(health.status === 200, "canary_health_failed");
    const readiness = await fetchImpl(`${SERVICE_BASE_URL}/ready`);
    const readinessPayload = await readiness.json();
    assert(readiness.status === 200 && readinessPayload?.ok === true && readinessPayload?.authorityMode === "cloudflare-authority", "canary_readiness_failed");
    const admin = await fetchImpl(ADMIN_HEALTH_URL);
    assert(admin.status === 200, "canary_admin_failed");

    const bootstrap = await fetchImpl(`${SERVICE_BASE_URL}/product/v1/desktop/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ installId: CANARY_INSTALL_ID, device: { platform: "windows", appVersion: "persistent-canary" } }),
    });
    const bootstrapPayload = await bootstrap.json();
    deviceId = bootstrapPayload?.data?.binding?.deviceId;
    assert(bootstrap.status === 200 && typeof deviceId === "string" && deviceId.length > 0, "canary_bootstrap_failed");

    if (mode === "preflight") {
      return {
        schemaVersion: 1,
        checkpoint: "vps-persistent-provider-canary-preflight",
        status: 200,
        adminStatus: 200,
        providerCalls: 0,
        transcriptionRequests: 0,
        markerInserted: false,
        authorityMode: "cloudflare-authority",
        rawContentPersisted: false,
      };
    }

    await database.insertMarker({ action: CANARY_ACTION, providerCallsMax: 1 });
    const form = new FormData();
    form.set("metadata", JSON.stringify({ operationId: CANARY_OPERATION_ID, durationMs, language: "en" }));
    form.set("audio", new Blob([audioBytes], { type: "audio/wav" }), "en-clean-note.wav");
    assert(transcriptionRequests === 0, "canary_request_limit");
    transcriptionRequests += 1;
    const response = await fetchImpl(`${SERVICE_BASE_URL}/product/v1/runtime/transcriptions`, {
      method: "POST",
      headers: { "x-device-id": deviceId },
      body: form,
    });
    const payload = await response.json();
    const transcript = payload?.data?.text;
    const expectedTextMatch = typeof transcript === "string"
      && EXPECTED_TOKENS.every((token) => normalized(transcript).includes(token));
    const ledger = await database.inspectLedger({ operationId: CANARY_OPERATION_ID });
    assert(response.status === 200 && expectedTextMatch, "canary_transcription_failed");
    assert(ledger?.state === "settled" && ledger?.usedEstimate === true, "canary_ledger_failed");
    assert(transcriptionRequests === 1, "canary_request_limit");

    const receipt = {
      schemaVersion: 1,
      checkpoint: "vps-persistent-provider-canary",
      provider: "groq",
      model: "whisper-large-v3-turbo",
      providerCalls: 1,
      providerCallsBasis: "single_executeRuntime_dispatch_contract",
      providerCallsMax: 1,
      transcriptionRequests,
      responseStatus: response.status,
      expectedTextMatch,
      durationMs,
      estimatePresent: true,
      actualCostSource: "conservative_estimate",
      ledgerOutcome: "settled",
      historicalMarker: 1,
      canaryMarker: 1,
      rawContentPersisted: false,
      persistentServiceTouched: true,
      routingTouched: false,
      authorityMode: "cloudflare-authority",
    };
    await writeReceipt(receipt);
    return receipt;
  } finally {
    await database.cleanup({ operationId: CANARY_OPERATION_ID, deviceId, installIdHash });
  }
}

function serviceProviderConfigured(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const mockLines = lines.filter((line) => /^\s*FIXVOX_API_MOCK_PROVIDERS\s*=/.test(line));
  const keyLines = lines.filter((line) => /^\s*GROQ_API_KEY\s*=\s*[^\s#].*$/.test(line));
  return mockLines.length === 1 && /^\s*FIXVOX_API_MOCK_PROVIDERS\s*=\s*false\s*$/.test(mockLines[0]) && keyLines.length === 1;
}

export function createPostgresCanaryDatabase(sql) {
  return {
    async inspectBaseline({ operationId, action }) {
      const rows = await sql.unsafe(`
        SELECT
          (SELECT max(version)::integer FROM schema_migrations) AS schema,
          (SELECT mode FROM control_plane_authority WHERE singleton = true) AS authority_mode,
          (SELECT count(*)::integer FROM audit_records WHERE action = 'vps_shadow_real_stt_once') AS historical_marker,
          (SELECT count(*)::integer FROM audit_records WHERE action = $2) AS canary_marker,
          (SELECT count(*)::integer FROM budget_reservations WHERE request_id = $1) AS reservations,
          (SELECT active_published_version FROM profiles WHERE profile_id = 'basic') AS profile_version,
          (SELECT revision::integer FROM profiles WHERE profile_id = 'basic') AS profile_revision,
          (SELECT count(*)::integer FROM engines WHERE enabled = true AND engine_id IN ('stt-groq-whisper-turbo', 'postprocess-groq-gpt-oss-120b', 'transform-groq-llama-70b')) AS canonical_engines,
          (SELECT count(*)::integer FROM pricing_records WHERE provider_id = 'groq' AND model_id = 'whisper-large-v3-turbo' AND jsonb_typeof(pricing) = 'object' AND pricing->>'unit' = 'per_hour' AND (pricing->>'priceMicrousd')::integer = 40000) AS pricing_records
      `, [operationId, action]);
      const row = rows[0] ?? {};
      return {
        schema: row.schema,
        authorityMode: row.authority_mode,
        historicalMarker: row.historical_marker,
        canaryMarker: row.canary_marker,
        reservations: row.reservations,
        profileVersion: row.profile_version,
        profileRevision: row.profile_revision,
        canonicalEngines: row.canonical_engines,
        pricingRecords: row.pricing_records,
      };
    },
    async insertMarker({ action, providerCallsMax }) {
      await sql.begin(async (tx) => {
        await tx.unsafe("SELECT pg_advisory_xact_lock(91827403)");
        const attempts = await tx.unsafe("SELECT count(*)::integer AS count FROM audit_records WHERE action = $1", [action]);
        assert(attempts[0]?.count === 0, "canary_already_attempted");
        await tx.unsafe(`
          INSERT INTO audit_records (actor_ref_hash, action, target_type, target_ref_hash, result, safe_metadata)
          VALUES ('redacted', $1, 'provider_canary', 'redacted', 'attempt_authorized', jsonb_build_object('schemaVersion', 1, 'providerCallsMax', $2::integer))
        `, [action, providerCallsMax]);
      });
    },
    async inspectLedger({ operationId }) {
      const rows = await sql.unsafe(`SELECT state, estimated_microusd = settled_microusd AS used_estimate FROM budget_reservations WHERE request_id = $1`, [operationId]);
      return rows[0] ? { state: rows[0].state, usedEstimate: rows[0].used_estimate } : null;
    },
    async cleanup({ operationId, deviceId, installIdHash }) {
      await sql.begin(async (tx) => {
        const devices = await tx.unsafe(`
          SELECT DISTINCT d.device_id FROM devices d
          LEFT JOIN install_bindings b ON b.device_id = d.id
          WHERE d.device_id = $1 OR d.install_id_hash = $2 OR b.install_id_hash = $2
        `, [deviceId ?? "", installIdHash]);
        assert(devices.length <= 1, "canary_cleanup_scope_invalid");
        await tx.unsafe(`DELETE FROM budget_reservations WHERE request_id = $1`, [operationId]);
        for (const device of devices) await tx.unsafe(`DELETE FROM budget_counters WHERE scope_type = 'device' AND scope_id = $1`, [device.device_id]);
        await tx.unsafe(`DELETE FROM install_bindings WHERE install_id_hash = $1 OR device_id IN (SELECT id FROM devices WHERE device_id = $2)`, [installIdHash, deviceId ?? ""]);
        await tx.unsafe(`DELETE FROM devices WHERE install_id_hash = $1 OR device_id = $2`, [installIdHash, deviceId ?? ""]);
      });
    },
  };
}

async function main() {
  assert(Bun.env.FIXVOX_ALLOW_VPS_PERSISTENT_CANARY === "1", "canary_requires_explicit_gate");
  const mode = Bun.env.FIXVOX_PERSISTENT_CANARY_MODE;
  const databaseUrl = Bun.env.FIXVOX_DATABASE_URL;
  const audioPath = Bun.env.FIXVOX_CANARY_AUDIO_PATH;
  const receiptPath = Bun.env.FIXVOX_CANARY_RECEIPT_PATH;
  assert((mode === "preflight" || mode === "real") && databaseUrl && audioPath, "canary_input_missing");
  if (mode === "real") assert(receiptPath, "canary_receipt_missing");
  const hostname = Bun.spawnSync(["hostname", "-s"]).stdout.toString().trim();
  const currentRelease = readlinkSync("/home/jpsal/opt/fixvox-api/current").split("/").at(-1);
  const providerConfigured = serviceProviderConfigured("/home/jpsal/.config/dictation-tauri/fixvox-api.env");
  const serviceState = Bun.spawnSync(["systemctl", "--user", "show", "fixvox-api.service", "--property=NRestarts,ActiveState,SubState"]).stdout.toString();
  const serviceRestarts = Number(serviceState.match(/^NRestarts=(\d+)$/m)?.[1] ?? -1);
  const listeners = Bun.spawnSync(["ss", "-ltnH", "sport = :8790"]).stdout.toString().split(/\r?\n/).filter(Boolean);
  const loopbackOnly = listeners.length === 1 && listeners[0].includes("127.0.0.1:8790") && !listeners[0].includes("0.0.0.0:8790") && !listeners[0].includes("[::]:8790");
  assert(serviceState.includes("ActiveState=active") && serviceState.includes("SubState=running"), "canary_service_inactive");
  const parsedDatabase = new URL(databaseUrl);
  assert(parsedDatabase.hostname === "127.0.0.1" && parsedDatabase.pathname === "/fixvox", "canary_database_invalid");
  const audioBytes = new Uint8Array(await Bun.file(audioPath).arrayBuffer());
  const sql = new Bun.SQL(databaseUrl);
  try {
    const receipt = await runPersistentCanary({
      mode,
      environment: { hostname, currentRelease, providerConfigured, serviceRestarts, loopbackOnly },
      audioBytes,
      database: createPostgresCanaryDatabase(sql),
      fetchImpl: fetch,
      writeReceipt: async (value) => Bun.write(receiptPath, `${JSON.stringify(value, null, 2)}\n`),
    });
    console.log(JSON.stringify(receipt));
  } finally {
    await sql.close();
  }
}

if (import.meta.main) await main();
