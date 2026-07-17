/// <reference path="../../cloud/fixvox-api/src/bun-runtime.d.ts" />

import { HTTP_CONTRACT_FIXTURES } from "./fixtures.ts";
import { assertNoSensitiveText, redactEvidence, type NormalizedResponse } from "./redaction.ts";

type Result = { fixture: string; response: NormalizedResponse };
type Report = { results: Result[] };
type Mismatch = { fixture: string; fields: string[] };

function mediaType(value: string | null): string | null {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
}

function requiredJsonKeys(response: NormalizedResponse, requiredKeys: readonly string[]): string[] {
  return requiredKeys.filter((key) => !response.topLevelKeys.includes(key));
}

function stableHeaders(response: NormalizedResponse) {
  return response.safeHeaders.filter((header) => header.name !== "x-fixvox-request-id");
}

function compareResponse(fixtureId: string, worker: NormalizedResponse, bun: NormalizedResponse): Mismatch | null {
  const fixture = fixtureById.get(fixtureId);
  if (!fixture) throw new Error(`unknown_fixture:${fixtureId}`);
  const fields: string[] = [];
  if (worker.status !== bun.status) fields.push("status");
  if (mediaType(worker.contentType) !== mediaType(bun.contentType)) fields.push("contentType");
  if (worker.shape !== bun.shape) fields.push("shape");
  if (worker.errorCode !== bun.errorCode) fields.push("errorCode");
  if (JSON.stringify(worker.bodySchema) !== JSON.stringify(bun.bodySchema)) fields.push("bodySchema");
  if (JSON.stringify(stableHeaders(worker)) !== JSON.stringify(stableHeaders(bun))) fields.push("safeHeaders");
  if (worker.status < 400 && requiredJsonKeys(worker, fixture.response.requiredKeys ?? []).length > 0) fields.push("workerRequiredJsonKeys");
  if (bun.status < 400 && requiredJsonKeys(bun, fixture.response.requiredKeys ?? []).length > 0) fields.push("bunRequiredJsonKeys");
  const workerContentType = worker.safeHeaders.find((header) => header.name === "content-type")?.valueClass;
  const bunContentType = bun.safeHeaders.find((header) => header.name === "content-type")?.valueClass;
  if (workerContentType !== bunContentType) fields.push("contentTypeSafety");
  return fields.length > 0 ? { fixture: fixtureId, fields } : null;
}

const workerFile = Bun.file(new URL("../../artifacts/self-hosted-control-plane/checkpoint-a/worker-contract-report.json", import.meta.url));
const bunFile = Bun.file(new URL("../../artifacts/self-hosted-control-plane/checkpoint-d/bun-contract-report.json", import.meta.url));

let worker: Report;
let bun: Report;
try {
  worker = JSON.parse(await workerFile.text()) as Report;
} catch {
  throw new Error("worker_contract_report_missing:run_npm_run_cloud_test_first");
}
try {
  bun = JSON.parse(await bunFile.text()) as Report;
} catch {
  throw new Error("bun_contract_report_missing:run_bun_contract_runner_first");
}
const workerByFixture = new Map(worker.results.map((result) => [result.fixture, result.response]));
const fixtureById = new Map(HTTP_CONTRACT_FIXTURES.map((fixture) => [fixture.id, fixture]));
const mismatches: Mismatch[] = [];
const missingWorker: string[] = [];
for (const result of bun.results) {
  if (!fixtureById.has(result.fixture)) throw new Error(`unknown_bun_fixture:${result.fixture}`);
  const workerResponse = workerByFixture.get(result.fixture);
  if (!workerResponse) {
    missingWorker.push(result.fixture);
    continue;
  }
  const mismatch = compareResponse(result.fixture, workerResponse, result.response);
  if (mismatch) mismatches.push(mismatch);
}
const report = redactEvidence({
  schemaVersion: 1,
  comparedFixtures: bun.results.map((result) => result.fixture).sort((left, right) => left.localeCompare(right)),
  missingWorker,
  mismatches,
});
const serialized = JSON.stringify(report, null, 2);
assertNoSensitiveText(serialized, "adapter parity report");
await Bun.write(new URL("../../artifacts/self-hosted-control-plane/checkpoint-d/adapter-parity-report.json", import.meta.url), `${serialized}\n`);
if (missingWorker.length > 0 || mismatches.length > 0) {
  throw new Error(`adapter_contract_parity_failed:missing_worker=${missingWorker.length}:mismatches=${mismatches.length}`);
}
