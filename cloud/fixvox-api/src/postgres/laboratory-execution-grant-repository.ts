import type { LaboratoryExecutionGrantRequest } from "../../../fixvox-core/src/control-plane/catalog.ts";

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

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class PostgresLaboratoryExecutionGrantRepository {
  constructor(private readonly sql: LaboratoryGrantSql) {}

  async issue(input: GrantIssueInput): Promise<{ grantToken: string }> {
    if (
      !/^arp_[a-f0-9]{64}$/.test(input.principalKey)
      || !/^[a-zA-Z0-9._:-]{1,128}$/.test(input.deviceId)
      || !/^[a-f0-9]{64}$/.test(input.definitionHash)
      || !/^[a-f0-9]{64}$/.test(input.estimateHash)
      || input.maxRequests < 1
      || input.maxCostMicrousd < 0
      || input.expiresAt.getTime() <= Date.now()
    ) {
      throw new Error("laboratory_execution_unauthorized");
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
          JSON.stringify({
            schemaVersion: 1,
            kind: input.request.kind,
            definitionHash: input.definitionHash,
            estimateHash: input.estimateHash,
            maxRequests: input.maxRequests,
            maxCostMicrousd: input.maxCostMicrousd,
          }),
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
          JSON.stringify({
            schemaVersion: 1,
            kind: grant.kind,
            definitionHash: grant.definition_hash,
            estimateHash: grant.estimate_hash,
          }),
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
    requests: number;
    costMicrousd: number;
  }): Promise<boolean> {
    if (input.requests < 1 || input.costMicrousd < 0) return false;
    const rows = await this.sql.unsafe(
      `UPDATE laboratory_executions
       SET requests_used = requests_used + $4, cost_microusd = cost_microusd + $5
       WHERE id = $1::uuid AND device_id = $2 AND definition_hash = $3
         AND principal_key IS NOT NULL AND status = 'active' AND expires_at > now()
         AND requests_used + $4 <= max_requests
         AND cost_microusd + $5 <= max_cost_microusd
       RETURNING id`,
      [
        input.executionId,
        input.deviceId,
        input.definitionHash,
        input.requests,
        input.costMicrousd,
      ],
    );
    return rows.length === 1;
  }

  async gateBSource(runId: string): Promise<{
    definitionHash: string;
    rawRefs: GateBCanonicalRawRef[];
  } | null> {
    const rows = await this.sql.unsafe<{
      definition_hash: string;
      canonical_raw_refs: unknown;
    }>(
      `SELECT definition_hash, canonical_raw_refs
       FROM laboratory_executions
       WHERE id::text = $1 AND kind = 'gate-a' AND status = 'completed'
         AND completed_request_count = 12`,
      [runId],
    );
    const rawRefs = rows[0]?.canonical_raw_refs;
    if (!rows[0] || !Array.isArray(rawRefs)) return null;
    return {
      definitionHash: rows[0].definition_hash,
      rawRefs: rawRefs.flatMap((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const item = value as Record<string, unknown>;
        return typeof item.sampleId === "string" && typeof item.rawRef === "string"
          ? [{ sampleId: item.sampleId, rawRef: item.rawRef }]
          : [];
      }),
    };
  }
}
