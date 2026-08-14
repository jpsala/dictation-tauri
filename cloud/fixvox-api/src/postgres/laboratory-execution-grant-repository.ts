import type {
  LaboratoryExecutionAbortReason,
  LaboratoryExecutionAbortRequest,
  LaboratoryExecutionAbortResult,
  LaboratoryExecutionCompletionRequest,
  LaboratoryExecutionCompletionResult,
  LaboratoryExecutionGrantRequest,
} from "../../../fixvox-core/src/control-plane/catalog.ts";

export interface LaboratoryGrantSql {
  unsafe<T extends Record<string, unknown> = Record<string, unknown>>(query: string, parameters?: unknown[]): Promise<T[]>;
  begin<T>(operation: (tx: LaboratoryGrantSql) => Promise<T>): Promise<T>;
}

export type GrantIssueInput = {
  principalKey: string;
  deviceId: string;
  request: LaboratoryExecutionGrantRequest;
  definitionHash: string;
  estimateHash: string;
  maxRequests: number;
  maxCostMicrousd: number;
  expiresAt: Date;
  sourceRunId?: string;
};

export type LaboratoryExecutionRecord = {
  executionId: string;
  kind: "gate-a" | "gate-b";
  definitionHash: string;
  estimateHash: string;
  maxRequests: number;
  maxCostMicrousd: number;
  expiresAt: Date;
};

export type LaboratoryGrantConsumeResult =
  | { ok: true; execution: LaboratoryExecutionRecord }
  | {
      ok: false;
      reason:
        | "laboratory_execution_unauthorized"
        | "laboratory_execution_grant_expired"
        | "laboratory_execution_grant_mismatch"
        | "laboratory_execution_grant_reused";
    };

export type GateBCanonicalRawRef = {
  sampleId: string;
  rawRef: string;
};

const PRINCIPAL_KEY = /^arp_[a-f0-9]{64}$/;
const DEVICE_ID = /^[a-zA-Z0-9._:-]{1,128}$/;
const HASH = /^[a-f0-9]{64}$/;
const EXECUTION_ID = /^[a-f0-9-]{36}$/;
const CANONICAL_RAW_REF = /^lraw_[a-f0-9]{64}$/;
const GATE_A_SAMPLES = [
  "jp-quality-bilingual-technical-20260812",
  "jp-quality-punctuation-list-20260812",
  "jp-quality-model-comparison-20260812",
] as const;
const SHORT_AUTO = "transcription-quality-v1-short-auto";

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function lifecycleError(code: string): Error {
  return new Error(code);
}

function assertIdentity(input: { executionId: string; principalKey: string; deviceId: string }): void {
  if (!EXECUTION_ID.test(input.executionId) || !PRINCIPAL_KEY.test(input.principalKey) || !DEVICE_ID.test(input.deviceId)) {
    throw lifecycleError("laboratory_execution_unauthorized");
  }
}
type GateBCompletionRequest = Readonly<{
  schemaVersion: 1;
  kind: "gate-b";
  definitionHash: string;
  estimateHash: string;
  completedRequestCount: 6;
}>;
type LaboratoryCompletionRequest = LaboratoryExecutionCompletionRequest | GateBCompletionRequest;
type GateBCompletionResult = Readonly<{
  ok: true;
  data: Readonly<{
    executionId: string;
    status: "completed";
    completedRequestCount: 6;
    completedAt: string;
    idempotentReplay: boolean;
  }>;
}>;
type LaboratoryCompletionResult = LaboratoryExecutionCompletionResult | GateBCompletionResult;

export class PostgresLaboratoryExecutionGrantRepository {
  constructor(private readonly sql: LaboratoryGrantSql) {}

  async issue(input: GrantIssueInput): Promise<{ grantToken: string }> {
    if (
      !PRINCIPAL_KEY.test(input.principalKey)
      || !DEVICE_ID.test(input.deviceId)
      || !HASH.test(input.definitionHash)
      || !HASH.test(input.estimateHash)
      || input.maxRequests < 1
      || input.maxCostMicrousd < 0
      || input.expiresAt.getTime() <= Date.now()
    ) {
      throw lifecycleError("laboratory_execution_unauthorized");
    }
    const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const tokenHash = await hashToken(token);
    await this.sql.begin(async (tx) => {
      const rows = await tx.unsafe<{ id: string }>(
        `INSERT INTO laboratory_execution_grants
          (token_hash, principal_key, device_id, kind, definition_hash, estimate_hash, source_run_id, max_requests, max_cost_microusd, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id::text`,
        [
          tokenHash,
          input.principalKey,
          input.deviceId,
          input.request.kind,
          input.definitionHash,
          input.estimateHash,
          input.sourceRunId ?? null,
          input.maxRequests,
          input.maxCostMicrousd,
          input.expiresAt,
        ],
      );
      await tx.unsafe(
        `INSERT INTO audit_records
          (actor_ref_hash, action, target_type, target_ref_hash, result, safe_metadata)
         VALUES ($1, 'laboratory.grant.issue', 'laboratory_execution_grant', $2, 'success', $3::jsonb)`,
        [
          input.principalKey,
          rows[0]?.id ?? input.definitionHash,
          {
            schemaVersion: 1,
            kind: input.request.kind,
            definitionHash: input.definitionHash,
            estimateHash: input.estimateHash,
            maxRequests: input.maxRequests,
            maxCostMicrousd: input.maxCostMicrousd,
          },
        ],
      );
    });
    return { grantToken: token };
  }

  async consume(input: {
    grantToken: string;
    principalKey: string;
    deviceId: string;
    now: Date;
  }): Promise<LaboratoryGrantConsumeResult> {
    if (!/^[a-f0-9]{64}$/.test(input.grantToken)) {
      return { ok: false, reason: "laboratory_execution_unauthorized" };
    }
    const tokenHash = await hashToken(input.grantToken);
    return this.sql.begin(async (tx) => {
      const grants = await tx.unsafe<{
        id: string;
        kind: "gate-a" | "gate-b";
        definition_hash: string;
        estimate_hash: string;
        source_run_id: string | null;
        max_requests: number;
        max_cost_microusd: number;
        expires_at: string;
      }>(
        `UPDATE laboratory_execution_grants
         SET state = 'consumed', consumed_at = $4
         WHERE token_hash = $1 AND principal_key = $2 AND device_id = $3
           AND state = 'open' AND expires_at > $4
         RETURNING id::text, kind, definition_hash, estimate_hash, source_run_id,
           max_requests, max_cost_microusd, expires_at::text`,
        [tokenHash, input.principalKey, input.deviceId, input.now],
      );
      const grant = grants[0];
      if (!grant) {
        const existing = await tx.unsafe<{
          principal_key: string;
          device_id: string;
          state: string;
          expired: boolean;
        }>(
          `SELECT principal_key, device_id, state, expires_at <= $2 AS expired
           FROM laboratory_execution_grants WHERE token_hash = $1`,
          [tokenHash, input.now],
        );
        if (!existing[0]) return { ok: false, reason: "laboratory_execution_unauthorized" };
        if (existing[0].principal_key !== input.principalKey || existing[0].device_id !== input.deviceId) {
          return { ok: false, reason: "laboratory_execution_grant_mismatch" };
        }
        if (existing[0].expired) return { ok: false, reason: "laboratory_execution_grant_expired" };
        return { ok: false, reason: "laboratory_execution_grant_reused" };
      }
      const executions = await tx.unsafe<{ id: string }>(
        `INSERT INTO laboratory_executions
          (grant_id, principal_key, device_id, kind, definition_hash, estimate_hash,
           source_run_id, max_requests, max_cost_microusd, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id::text`,
        [
          grant.id,
          input.principalKey,
          input.deviceId,
          grant.kind,
          grant.definition_hash,
          grant.estimate_hash,
          grant.source_run_id,
          grant.max_requests,
          grant.max_cost_microusd,
          grant.expires_at,
        ],
      );
      await tx.unsafe(
        `INSERT INTO audit_records
          (actor_ref_hash, action, target_type, target_ref_hash, result, safe_metadata)
         VALUES ($1, 'laboratory.grant.consume', 'laboratory_execution', $2, 'success', $3::jsonb)`,
        [
          input.principalKey,
          executions[0].id,
          {
            schemaVersion: 1,
            kind: grant.kind,
            definitionHash: grant.definition_hash,
            estimateHash: grant.estimate_hash,
          },
        ],
      );
      return {
        ok: true,
        execution: {
          executionId: executions[0].id,
          kind: grant.kind,
          definitionHash: grant.definition_hash,
          estimateHash: grant.estimate_hash,
          maxRequests: Number(grant.max_requests),
          maxCostMicrousd: Number(grant.max_cost_microusd),
          expiresAt: new Date(grant.expires_at),
        },
      };
    });
  }

  async reserve(input: {
    executionId: string;
    deviceId: string;
    definitionHash: string;
    expectedKind: "gate-a" | "gate-b";
    requests: number;
    costMicrousd: number;
  }): Promise<boolean> {
    if (
      !EXECUTION_ID.test(input.executionId)
      || !DEVICE_ID.test(input.deviceId)
      || !HASH.test(input.definitionHash)
      || !["gate-a", "gate-b"].includes(input.expectedKind)
      || input.requests < 1
      || input.costMicrousd < 0
      || !Number.isInteger(input.requests)
      || !Number.isFinite(input.costMicrousd)
    ) return false;
    const rows = await this.sql.unsafe(
      `UPDATE laboratory_executions
       SET requests_used = requests_used + $4, cost_microusd = cost_microusd + $5
       WHERE id = $1::uuid AND device_id = $2 AND definition_hash = $3
         AND kind = $6 AND status = 'active' AND expires_at > now()
         AND requests_used + $4 <= max_requests
         AND cost_microusd + $5 <= max_cost_microusd
       RETURNING id`,
      [
        input.executionId,
        input.deviceId,
        input.definitionHash,
        input.requests,
        input.costMicrousd,
        input.expectedKind,
      ],
    );
    return rows.length === 1;
  }

  async complete(input: {
    executionId: string;
    principalKey: string;
    deviceId: string;
    request: LaboratoryCompletionRequest;
    now?: Date;
  }): Promise<LaboratoryCompletionResult> {
    assertIdentity(input);
    const request = input.request;
    const now = input.now ?? new Date();
    const isGateA = request.kind === "gate-a";
    const expectedCount = isGateA ? 12 : 6;
    let canonicalRawRefs: readonly { sampleId: string; candidateId: typeof SHORT_AUTO; rawRef: string }[] = [];
    if (
      request.schemaVersion !== 1
      || !HASH.test(request.definitionHash)
      || !HASH.test(request.estimateHash)
      || request.completedRequestCount !== expectedCount
    ) throw lifecycleError("laboratory_execution_definition_mismatch");
    if (isGateA) {
      if (
        request.rawEvidence.length !== 3
        || request.rawEvidence.some((evidence, index) =>
          evidence.sampleId !== GATE_A_SAMPLES[index]
          || evidence.candidateId !== SHORT_AUTO
          || !HASH.test(evidence.sha256)
          || !Number.isInteger(evidence.byteLength)
          || evidence.byteLength < 1
          || evidence.byteLength > 16_777_216)
      ) throw lifecycleError("laboratory_execution_definition_mismatch");
      canonicalRawRefs = await Promise.all(request.rawEvidence.map(async (evidence) => ({
        sampleId: evidence.sampleId,
        candidateId: SHORT_AUTO,
        rawRef: `lraw_${await hashToken(`${input.executionId}\n${evidence.sampleId}\n${SHORT_AUTO}\n${evidence.sha256}\n${evidence.byteLength}`)}`,
      })));
    }
    const refSetHash = await hashToken(stableJson(canonicalRawRefs));
    return this.sql.begin(async (tx) => {
      const rows = await tx.unsafe<{
        principal_key: string;
        device_id: string;
        kind: "gate-a" | "gate-b";
        definition_hash: string;
        estimate_hash: string;
        max_requests: number;
        max_cost_microusd: number;
        requests_used: number;
        cost_microusd: number;
        status: "active" | "completed" | "aborted";
        completed_request_count: number | null;
        canonical_raw_refs: unknown;
        completed_at: string | Date | null;
      }>(
        `SELECT principal_key, device_id, kind, definition_hash, estimate_hash,
                max_requests, max_cost_microusd, requests_used, cost_microusd, status,
                completed_request_count, canonical_raw_refs, completed_at
         FROM laboratory_executions
         WHERE id = $1::uuid
         FOR UPDATE`,
        [input.executionId],
      );
      const execution = rows[0];
      if (!execution) throw lifecycleError("laboratory_execution_unauthorized");
      if (execution.principal_key !== input.principalKey || execution.device_id !== input.deviceId) {
        throw lifecycleError("laboratory_execution_grant_mismatch");
      }
      const matchesDefinition = execution.kind === request.kind
        && execution.definition_hash === request.definitionHash
        && execution.estimate_hash === request.estimateHash
        && Number(execution.max_requests) === expectedCount
        && Number(execution.max_cost_microusd) === 5000
        && Number(execution.requests_used) === expectedCount
        && Number(execution.cost_microusd) <= 5000;
      if (execution.status === "completed") {
        const replay = matchesDefinition
          && execution.completed_request_count === expectedCount
          && stableJson(execution.canonical_raw_refs) === stableJson(canonicalRawRefs);
        if (!replay) throw lifecycleError("laboratory_execution_conflict");
        const completedAt = execution.completed_at
          ? (execution.completed_at instanceof Date ? execution.completed_at : new Date(execution.completed_at)).toISOString()
          : now.toISOString();
        if (isGateA) {
          return {
            ok: true,
            data: {
              executionId: input.executionId,
              status: "completed",
              completedRequestCount: 12,
              canonicalRawRefs: canonicalRawRefs as LaboratoryExecutionCompletionResult["data"]["canonicalRawRefs"],
              completedAt,
              idempotentReplay: true,
            },
          };
        }
        return { ok: true, data: { executionId: input.executionId, status: "completed", completedRequestCount: 6, completedAt, idempotentReplay: true } };
      }
      if (execution.status !== "active") throw lifecycleError("laboratory_execution_conflict");
      if (!matchesDefinition) throw lifecycleError("laboratory_execution_definition_mismatch");
      const updated = await tx.unsafe<{ completed_at: string | Date }>(
        `UPDATE laboratory_executions
         SET status = 'completed', completed_request_count = $2,
             canonical_raw_refs = $3::jsonb, completed_at = $4
         WHERE id = $1::uuid AND status = 'active'
           AND principal_key = $5 AND device_id = $6 AND kind = $7
           AND definition_hash = $8 AND estimate_hash = $9
           AND max_requests = $10 AND max_cost_microusd = $11
           AND requests_used = $10 AND cost_microusd <= $11
         RETURNING completed_at`,
        [
          input.executionId,
          expectedCount,
          canonicalRawRefs,
          now,
          input.principalKey,
          input.deviceId,
          request.kind,
          request.definitionHash,
          request.estimateHash,
          expectedCount,
          5000,
        ],
      );
      if (updated.length !== 1) throw lifecycleError("laboratory_execution_conflict");
      await tx.unsafe(
        `INSERT INTO audit_records
          (actor_ref_hash, action, target_type, target_ref_hash, result, safe_metadata)
         VALUES ($1, 'laboratory.execution.complete', 'laboratory_execution', $2, 'success', $3::jsonb)`,
        [
          input.principalKey,
          input.executionId,
          {
            schemaVersion: 1,
            kind: request.kind,
            hashes: {
              definitionHash: request.definitionHash,
              estimateHash: request.estimateHash,
            },
            counts: { completedRequestCount: expectedCount, evidenceCount: isGateA ? 3 : 0 },
            reservedCost: Number(execution.cost_microusd),
            refCount: canonicalRawRefs.length,
            refSetHash,
          },
        ],
      );
      const completedAt = updated[0].completed_at instanceof Date ? updated[0].completed_at.toISOString() : new Date(updated[0].completed_at).toISOString();
      if (isGateA) {
        return {
          ok: true,
          data: {
            executionId: input.executionId,
            status: "completed",
            completedRequestCount: 12,
            canonicalRawRefs: canonicalRawRefs as LaboratoryExecutionCompletionResult["data"]["canonicalRawRefs"],
            completedAt,
            idempotentReplay: false,
          },
        };
      }
      return { ok: true, data: { executionId: input.executionId, status: "completed", completedRequestCount: 6, completedAt, idempotentReplay: false } };
    });
  }

  async abort(input: {
    executionId: string;
    principalKey: string;
    deviceId: string;
    request: LaboratoryExecutionAbortRequest;
    now?: Date;
  }): Promise<LaboratoryExecutionAbortResult> {
    assertIdentity(input);
    const request = input.request;
    const now = input.now ?? new Date();
    const reasons: readonly LaboratoryExecutionAbortReason[] = ["spawn-failed", "runner-failed", "cancelled", "source-invalid"];
    if (request.schemaVersion !== 1 || !reasons.includes(request.reason)) throw lifecycleError("laboratory_execution_definition_mismatch");
    return this.sql.begin(async (tx) => {
      const rows = await tx.unsafe<{
        principal_key: string;
        device_id: string;
        kind: "gate-a" | "gate-b";
        status: "active" | "completed" | "aborted";
        canonical_raw_refs: unknown;
        completed_at: string | Date | null;
      }>(
        `SELECT principal_key, device_id, kind, status, canonical_raw_refs, completed_at
         FROM laboratory_executions WHERE id = $1::uuid FOR UPDATE`,
        [input.executionId],
      );
      const execution = rows[0];
      if (!execution) throw lifecycleError("laboratory_execution_unauthorized");
      if (execution.principal_key !== input.principalKey || execution.device_id !== input.deviceId) {
        throw lifecycleError("laboratory_execution_grant_mismatch");
      }
      if (execution.status === "aborted") {
        const storedReason = (execution.canonical_raw_refs && typeof execution.canonical_raw_refs === "object" && !Array.isArray(execution.canonical_raw_refs))
          ? (execution.canonical_raw_refs as Record<string, unknown>).abortReason
          : undefined;
        if (storedReason !== request.reason) throw lifecycleError("laboratory_execution_conflict");
        return {
          ok: true,
          data: {
            executionId: input.executionId,
            status: "aborted",
            reason: request.reason,
            abortedAt: execution.completed_at ? new Date(execution.completed_at).toISOString() : now.toISOString(),
            idempotentReplay: true,
          },
        };
      }
      if (execution.status !== "active") throw lifecycleError("laboratory_execution_conflict");
      const updated = await tx.unsafe<{ completed_at: string | Date }>(
        `UPDATE laboratory_executions
         SET status = 'aborted', canonical_raw_refs = $2::jsonb, completed_at = $3
         WHERE id = $1::uuid AND status = 'active'
         RETURNING completed_at`,
        [input.executionId, { abortReason: request.reason }, now],
      );
      if (updated.length !== 1) throw lifecycleError("laboratory_execution_conflict");
      await tx.unsafe(
        `INSERT INTO audit_records
          (actor_ref_hash, action, target_type, target_ref_hash, result, safe_metadata)
         VALUES ($1, 'laboratory.execution.abort', 'laboratory_execution', $2, 'success', $3::jsonb)`,
        [input.principalKey, input.executionId, { schemaVersion: 1, kind: execution.kind, reason: request.reason }],
      );
      return {
        ok: true,
        data: {
          executionId: input.executionId,
          status: "aborted",
          reason: request.reason,
          abortedAt: new Date(updated[0].completed_at).toISOString(),
          idempotentReplay: false,
        },
      };
    });
  }

  async gateBSource(input: {
    runId: string;
    principalKey: string;
    deviceId: string;
  }): Promise<{
    definitionHash: string;
    rawRefs: GateBCanonicalRawRef[];
  } | null> {
    if (!EXECUTION_ID.test(input.runId) || !PRINCIPAL_KEY.test(input.principalKey) || !DEVICE_ID.test(input.deviceId)) return null;
    const rows = await this.sql.unsafe<{
      definition_hash: string;
      max_requests: number;
      max_cost_microusd: number;
      requests_used: number;
      cost_microusd: number;
      completed_request_count: number | null;
      canonical_raw_refs: unknown;
    }>(
      `SELECT definition_hash, max_requests, max_cost_microusd, requests_used,
              cost_microusd, completed_request_count, canonical_raw_refs
       FROM laboratory_executions
       WHERE id = $1::uuid AND principal_key = $2 AND device_id = $3
         AND kind = 'gate-a' AND status = 'completed'
         AND completed_request_count = 12 AND max_requests = 12
         AND max_cost_microusd = 5000 AND requests_used = 12
         AND cost_microusd <= max_cost_microusd`,
      [input.runId, input.principalKey, input.deviceId],
    );
    const row = rows[0];
    if (!row || !Array.isArray(row.canonical_raw_refs)) return null;
    const rawRefs = row.canonical_raw_refs;
    if (
      rawRefs.length !== GATE_A_SAMPLES.length
      || !GATE_A_SAMPLES.every((sampleId, index) => {
        const value = rawRefs[index];
        if (!value || typeof value !== "object" || Array.isArray(value)) return false;
        const item = value as Record<string, unknown>;
        return item.sampleId === sampleId && item.candidateId === SHORT_AUTO && typeof item.rawRef === "string" && CANONICAL_RAW_REF.test(item.rawRef);
      })
    ) return null;
    return {
      definitionHash: row.definition_hash,
      rawRefs: rawRefs.map((value) => {
        const item = value as Record<string, string>;
        return { sampleId: item.sampleId, rawRef: item.rawRef };
      }),
    };
  }
}
