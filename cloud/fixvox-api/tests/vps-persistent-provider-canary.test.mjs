import { describe, expect, test } from "bun:test";
import {
  CANARY_ACTION,
  CANARY_OPERATION_ID,
  CANARY_RELEASE,
  createPostgresCanaryDatabase,
  runPersistentCanary,
  wavDurationMs,
} from "./vps-persistent-provider-canary.mjs";

function wavFixture(durationMs = 1_000) {
  const sampleRate = 16_000;
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const dataSize = Math.round((durationMs / 1_000) * byteRate);
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const writeText = (offset, value) => [...value].forEach((char, index) => { bytes[offset + index] = char.charCodeAt(0); });
  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, channels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeText(36, "data");
  view.setUint32(40, dataSize, true);
  return bytes;
}

function harness(options = {}) {
  let canaryMarker = 0;
  let markerInserted = false;
  let cleanupCalls = 0;
  const requests = [];
  const database = {
    async inspectBaseline({ operationId, action }) {
      expect(operationId).toBe(CANARY_OPERATION_ID);
      expect(action).toBe(CANARY_ACTION);
      return {
        schema: 6,
        authorityMode: "cloudflare-authority",
        historicalMarker: 1,
        canaryMarker,
        reservations: 0,
        profileVersion: 2,
        profileRevision: 1,
        canonicalEngines: 3,
        pricingRecords: 1,
      };
    },
    async insertMarker({ action, providerCallsMax }) {
      expect(action).toBe(CANARY_ACTION);
      expect(providerCallsMax).toBe(1);
      expect(canaryMarker).toBe(0);
      canaryMarker = 1;
      markerInserted = true;
    },
    async inspectLedger({ operationId }) {
      expect(operationId).toBe(CANARY_OPERATION_ID);
      return { state: "settled", usedEstimate: true };
    },
    async cleanup() { cleanupCalls += 1; },
  };
  const fetchImpl = async (input) => {
    const path = new URL(input.toString()).pathname;
    requests.push({ path, markerInserted });
    if (path === "/health") return Response.json({ ok: true, service: "fixvox-api" });
    if (path === "/ready") return Response.json({ ok: true, authorityMode: "cloudflare-authority" });
    if (path === "/healthz") return Response.json({ ok: true });
    if (path === "/product/v1/desktop/bootstrap") return Response.json({ data: { binding: { deviceId: "sensitive-device-fixture" } } });
    if (path === "/product/v1/runtime/transcriptions") {
      return Response.json(
        { data: { text: "Create the project testing pipeline." } },
        { status: options.transcriptionStatus ?? 200 },
      );
    }
    return Response.json({ error: "unexpected" }, { status: 500 });
  };
  return {
    database,
    fetchImpl,
    requests,
    marker: () => canaryMarker,
    cleanupCalls: () => cleanupCalls,
  };
}

const environment = {
  hostname: "srv1761438",
  currentRelease: CANARY_RELEASE,
  providerConfigured: true,
  serviceRestarts: 0,
  loopbackOnly: true,
};

describe("persistent provider canary harness", () => {
  test("validates the bounded synthetic WAV without retaining content", () => {
    expect(wavDurationMs(wavFixture(1_000))).toBe(1_000);
    expect(() => wavDurationMs(new Uint8Array(44))).toThrow("canary_fixture_wav_invalid");
  });

  test("runs a provider-free preflight without inserting the canary marker", async () => {
    const fixture = harness();
    const receipt = await runPersistentCanary({
      mode: "preflight",
      environment,
      audioBytes: wavFixture(),
      database: fixture.database,
      fetchImpl: fixture.fetchImpl,
    });

    expect(receipt.providerCalls).toBe(0);
    expect(receipt.transcriptionRequests).toBe(0);
    expect(receipt.markerInserted).toBe(false);
    expect(fixture.requests.map((request) => request.path)).toEqual([
      "/health",
      "/ready",
      "/healthz",
      "/product/v1/desktop/bootstrap",
    ]);
    expect(fixture.marker()).toBe(0);
    expect(fixture.cleanupCalls()).toBe(1);
  });

  test("inserts the append-only marker before exactly one transcription request", async () => {
    const fixture = harness();
    const receipts = [];
    const receipt = await runPersistentCanary({
      mode: "real",
      environment,
      audioBytes: wavFixture(),
      database: fixture.database,
      fetchImpl: fixture.fetchImpl,
      writeReceipt: async (value) => { receipts.push(value); },
    });

    const transcriptionRequests = fixture.requests.filter((request) => request.path === "/product/v1/runtime/transcriptions");
    expect(transcriptionRequests).toEqual([{ path: "/product/v1/runtime/transcriptions", markerInserted: true }]);
    expect(receipt.providerCalls).toBe(1);
    expect(receipt.providerCallsMax).toBe(1);
    expect(receipt.transcriptionRequests).toBe(1);
    expect(receipt.canaryMarker).toBe(1);
    expect(receipts).toEqual([receipt]);
    expect(JSON.stringify(receipt)).not.toContain("Create the project");
    expect(JSON.stringify(receipt)).not.toContain("sensitive-device-fixture");
    expect(fixture.cleanupCalls()).toBe(1);

    await expect(runPersistentCanary({
      mode: "real",
      environment,
      audioBytes: wavFixture(),
      database: fixture.database,
      fetchImpl: fixture.fetchImpl,
    })).rejects.toThrow("canary_already_attempted");
    expect(fixture.requests.filter((request) => request.path === "/product/v1/runtime/transcriptions")).toHaveLength(1);
  });

  test("serializes and rechecks the marker before inserting an authorized attempt", async () => {
    const calls = [];
    const sql = {
      async begin(callback) {
        return callback({
          async unsafe(query) {
            calls.push(query.replace(/\s+/g, " ").trim());
            if (query.includes("count(*)")) return [{ count: 0 }];
            return [];
          },
        });
      },
    };
    await createPostgresCanaryDatabase(sql).insertMarker({ action: CANARY_ACTION, providerCallsMax: 1 });
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain("pg_advisory_xact_lock");
    expect(calls[1]).toContain("count(*)");
    expect(calls[2]).toContain("INSERT INTO audit_records");

    const blockedSql = {
      async begin(callback) {
        return callback({
          async unsafe(query) {
            if (query.includes("count(*)")) return [{ count: 1 }];
            return [];
          },
        });
      },
    };
    await expect(createPostgresCanaryDatabase(blockedSql).insertMarker({ action: CANARY_ACTION, providerCallsMax: 1 })).rejects.toThrow("canary_already_attempted");
  });

  test("never retries an ambiguous transcription failure and preserves the marker", async () => {
    const fixture = harness({ transcriptionStatus: 502 });
    await expect(runPersistentCanary({
      mode: "real",
      environment,
      audioBytes: wavFixture(),
      database: fixture.database,
      fetchImpl: fixture.fetchImpl,
    })).rejects.toThrow("canary_transcription_failed");

    expect(fixture.requests.filter((request) => request.path === "/product/v1/runtime/transcriptions")).toHaveLength(1);
    expect(fixture.marker()).toBe(1);
    expect(fixture.cleanupCalls()).toBe(1);
  });

  test("fails before requests when host, release, provider mode, or baseline drift", async () => {
    for (const drift of [
      { hostname: "wrong-host" },
      { currentRelease: "wrong-release" },
      { providerConfigured: false },
      { serviceRestarts: 1 },
      { loopbackOnly: false },
    ]) {
      const fixture = harness();
      await expect(runPersistentCanary({
        mode: "preflight",
        environment: { ...environment, ...drift },
        audioBytes: wavFixture(),
        database: fixture.database,
        fetchImpl: fixture.fetchImpl,
      })).rejects.toThrow();
      expect(fixture.requests).toHaveLength(0);
      expect(fixture.marker()).toBe(0);
    }
  });
});
