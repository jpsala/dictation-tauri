/// <reference path="../bun-runtime.d.ts" />

const PAGE_MAX = 100;
const SAFE_METRIC_KEYS = new Set(["schemaVersion", "pricingSource", "transportMode", "costAuthority"]);

type Cursor = { occurredAt: string; id: number };
type RequestEventInput = {
  accountId?: string | null; deviceId?: string | null; route: string; status: number; latencyMs: number; outcome: string;
  providerId?: string | null; modelId?: string | null; context?: string | null; usageKind?: string | null;
  profileId?: string | null; engineId?: string | null; promptId?: string | null; promptTokens?: number | null;
  completionTokens?: number | null; totalTokens?: number | null; inputUnits?: number | null; outputUnits?: number | null;
  costMicrousd?: number | null; ttftMs?: number | null; safeMetrics?: Record<string, unknown>;
};

function boundedLimit(value: number | null | undefined): number { return Math.min(PAGE_MAX, Math.max(1, Number(value) || 50)); }
function dateKey(date: Date): string { return date.toISOString().slice(0, 10); }
function redactedDevice(value: string): string { return value.length > 10 ? `${value.slice(0, 6)}…${value.slice(-4)}` : "redacted"; }
function numeric(value: string | number | null): number { return value === null ? 0 : Number(value); }
function decodeCursor(value: string | null): Cursor | null { if (!value) return null; try { const parsed = JSON.parse(atob(value)) as Cursor; return typeof parsed.occurredAt === "string" && Number.isInteger(parsed.id) ? parsed : null; } catch { return null; } }
function encodeCursor(value: Cursor): string { return btoa(JSON.stringify(value)); }

/** PostgreSQL-backed, redacted Admin read projections and allowlisted event writers. */
export class PostgresAdminRepository {
  constructor(private readonly sql: Bun.SQL) {}

  validateSafeMetrics(value: Record<string, unknown> | undefined): Record<string, string> {
    const candidate = value ?? { schemaVersion: 1 };
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || candidate.schemaVersion !== 1) throw new Error("safe_metrics_invalid");
    const result: Record<string, string> = { schemaVersion: "1" };
    for (const [key, raw] of Object.entries(candidate)) {
      if (!SAFE_METRIC_KEYS.has(key)) throw new Error("safe_metrics_unknown");
      if (key === "schemaVersion") continue;
      if (typeof raw !== "string" || raw.length > 80) throw new Error("safe_metrics_invalid");
      result[key] = raw;
    }
    return result;
  }

  async appendRequestEvent(input: RequestEventInput): Promise<void> {
    const safeMetrics = this.validateSafeMetrics(input.safeMetrics);
    await this.sql.unsafe(`
      INSERT INTO request_events (account_id, device_id, route, status, latency_ms, provider_id, model_id, context, usage_kind, profile_id, engine_id, prompt_id, prompt_tokens, completion_tokens, total_tokens, input_units, output_units, cost_microusd, ttft_ms, outcome, safe_metrics)
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb)
    `, [input.accountId ?? null, input.deviceId ?? null, input.route, input.status, input.latencyMs, input.providerId ?? null, input.modelId ?? null, input.context ?? null, input.usageKind ?? null, input.profileId ?? null, input.engineId ?? null, input.promptId ?? null, input.promptTokens ?? null, input.completionTokens ?? null, input.totalTokens ?? null, input.inputUnits ?? null, input.outputUnits ?? null, input.costMicrousd ?? null, input.ttftMs ?? null, input.outcome, JSON.stringify(safeMetrics)]);
  }

  async appendFeedback(input: { classification: string; deviceId?: string | null }): Promise<string> { const rows = await this.sql.unsafe<{ id: string }>(`INSERT INTO feedback_events (device_id, classification, safe_metadata) VALUES ((SELECT id FROM devices WHERE device_id = $1), $2, '{"schemaVersion":1}'::jsonb) RETURNING id::text`, [input.deviceId ?? null, input.classification.slice(0, 64)]); return rows[0]?.id ?? "redacted"; }

  async observePrewarm(deviceId: string, success: boolean, observedAt = new Date()): Promise<void> {
    await this.sql.unsafe(`
      INSERT INTO prewarm_daily_counters (device_id, utc_date, attempts, successes, failures, last_observed_at)
      SELECT id, $2::date, 1, $3::integer, $4::integer, $5::timestamptz FROM devices WHERE device_id = $1
      ON CONFLICT (device_id, utc_date) DO UPDATE SET attempts = prewarm_daily_counters.attempts + 1, successes = prewarm_daily_counters.successes + EXCLUDED.successes, failures = prewarm_daily_counters.failures + EXCLUDED.failures, last_observed_at = EXCLUDED.last_observed_at
    `, [deviceId, dateKey(observedAt), success ? 1 : 0, success ? 0 : 1, observedAt.toISOString()]);
  }

  private emptyDay(day: string) { return { day, requestCount: 0, totalCostUsd: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, byModel: {}, byContext: {}, byEngine: {}, byPrompt: {}, byProfile: {} }; }
  private async usage(days: number) {
    const start = new Date(); start.setUTCDate(start.getUTCDate() - (days - 1)); start.setUTCHours(0, 0, 0, 0);
    const rows = await this.sql.unsafe<{ day: string; provider_id: string | null; model_id: string | null; context: string | null; engine_id: string | null; prompt_id: string | null; profile_id: string | null; count: string; cost: string; prompt_tokens: string; completion_tokens: string; total_tokens: string }>(`
      SELECT to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, provider_id, model_id, context, engine_id, prompt_id, profile_id,
       count(*)::text AS count, coalesce(sum(cost_microusd), 0)::text AS cost, coalesce(sum(prompt_tokens), 0)::text AS prompt_tokens, coalesce(sum(completion_tokens), 0)::text AS completion_tokens, coalesce(sum(total_tokens), 0)::text AS total_tokens
      FROM request_events WHERE occurred_at >= $1 GROUP BY 1,2,3,4,5,6,7 ORDER BY 1
    `, [start.toISOString()]);
    const map = new Map<string, ReturnType<PostgresAdminRepository["emptyDay"]>>();
    for (let index = 0; index < days; index++) { const d = new Date(start); d.setUTCDate(d.getUTCDate() + index); map.set(dateKey(d), this.emptyDay(dateKey(d))); }
    for (const row of rows) { const day = map.get(row.day); if (!day) continue; const count = numeric(row.count), cost = numeric(row.cost) / 1_000_000, tokens = numeric(row.total_tokens); day.requestCount += count; day.totalCostUsd += cost; day.promptTokens += numeric(row.prompt_tokens); day.completionTokens += numeric(row.completion_tokens); day.totalTokens += tokens;
      const add = (target: Record<string, { id?: string; provider?: string; model?: string; context?: string; requestCount: number; totalCostUsd: number; totalTokens: number }>, key: string | null, shape: Record<string, string>) => { if (!key) return; const item = target[key] ?? { ...shape, requestCount: 0, totalCostUsd: 0, totalTokens: 0 }; item.requestCount += count; item.totalCostUsd += cost; item.totalTokens += tokens; target[key] = item; };
      add(day.byModel, row.provider_id && row.model_id ? `${row.provider_id}:${row.model_id}` : null, { provider: row.provider_id ?? "unknown", model: row.model_id ?? "unknown" }); add(day.byContext, row.context, { context: row.context ?? "unknown" }); add(day.byEngine, row.engine_id, { id: row.engine_id ?? "unknown" }); add(day.byPrompt, row.prompt_id, { id: row.prompt_id ?? "unknown" }); add(day.byProfile, row.profile_id, { id: row.profile_id ?? "unknown" });
    }
    return [...map.values()];
  }

  async dashboard() { const byDay = await this.usage(7); const today = byDay.at(-1)!; const last7d = byDay.reduce((sum, day) => ({ requestCount: sum.requestCount + day.requestCount, totalCostUsd: sum.totalCostUsd + day.totalCostUsd, totalTokens: sum.totalTokens + day.totalTokens }), { requestCount: 0, totalCostUsd: 0, totalTokens: 0 }); const topModels = new Map<string, { provider?: string; model?: string; requestCount: number; totalCostUsd: number; totalTokens: number }>(); for (const day of byDay) for (const [key, value] of Object.entries(day.byModel) as Array<[string, { provider?: string; model?: string; requestCount: number; totalCostUsd: number; totalTokens: number }]>) { const current = topModels.get(key) ?? { ...value, requestCount: 0, totalCostUsd: 0, totalTokens: 0 }; current.requestCount += value.requestCount; current.totalCostUsd += value.totalCostUsd; current.totalTokens += value.totalTokens; topModels.set(key, current); } const topModels7d = [...topModels.values()].sort((a, b) => b.totalCostUsd - a.totalCostUsd).slice(0, 10); const recentErrors = (await this.requestEvents({ limit: 5, status: "error" })).items; return { today, last7d, topModels7d, recentErrors }; }
  async usageSummary() { const byDay = await this.usage(30); const today = byDay.at(-1)!; const last7 = byDay.slice(-7).reduce((sum, day) => ({ requestCount: sum.requestCount + day.requestCount, totalCostUsd: sum.totalCostUsd + day.totalCostUsd, totalTokens: sum.totalTokens + day.totalTokens }), { requestCount: 0, totalCostUsd: 0, totalTokens: 0 }); const rows = await this.usageRows(); return { today, last7d: last7, byDay, ...rows }; }

  async requestEvents(input: { limit?: number; cursor?: string | null; status?: string | null } = {}) {
    const cursor = decodeCursor(input.cursor ?? null); const limit = boundedLimit(input.limit); if (input.cursor && !cursor) throw new Error("cursor_invalid");
    const rows = await this.sql.unsafe<{ id: string; occurred_at: string; device_id: string | null; provider_id: string | null; model_id: string | null; context: string | null; status: number; outcome: string; latency_ms: number; profile_id: string | null; engine_id: string | null; prompt_id: string | null; total_tokens: number | null; cost_microusd: string | null }>(`
      SELECT r.id::text, r.occurred_at::text, d.device_id, r.provider_id, r.model_id, r.context, r.status, r.outcome, r.latency_ms, r.profile_id, r.engine_id, r.prompt_id, r.total_tokens, r.cost_microusd::text FROM request_events r LEFT JOIN devices d ON d.id = r.device_id
      WHERE ($1::text IS NULL OR r.outcome = $1) AND ($2::timestamptz IS NULL OR (r.occurred_at, r.id) < ($2::timestamptz, $3::bigint)) ORDER BY r.occurred_at DESC, r.id DESC LIMIT $4
    `, [input.status ?? null, cursor?.occurredAt ?? null, cursor?.id ?? null, limit + 1]);
    const page = rows.slice(0, limit); return { items: page.map((row) => ({ ts: row.occurred_at, deviceId: row.device_id ? redactedDevice(row.device_id) : "redacted", provider: row.provider_id ?? "unknown", model: row.model_id ?? "unknown", context: row.context ?? "unknown", status: row.outcome === "error" ? "error" : "success", durationMs: row.latency_ms, profileId: row.profile_id, engineId: row.engine_id, promptId: row.prompt_id, totalTokens: row.total_tokens ?? 0, billedCostUsd: numeric(row.cost_microusd) / 1_000_000 })), nextCursor: rows.length > limit && page.at(-1) ? encodeCursor({ occurredAt: page.at(-1)!.occurred_at, id: Number(page.at(-1)!.id) }) : null }; }
  async feedback(input: { limit?: number; cursor?: string | null } = {}) { const limit = boundedLimit(input.limit); const cursor = decodeCursor(input.cursor ?? null); if (input.cursor && !cursor) throw new Error("cursor_invalid"); const rows = await this.sql.unsafe<{ id: string; classification: string; occurred_at: string }>(`SELECT id::text, classification, occurred_at::text FROM feedback_events WHERE ($1::timestamptz IS NULL OR occurred_at < $1::timestamptz) ORDER BY occurred_at DESC, id DESC LIMIT $2`, [cursor?.occurredAt ?? null, limit + 1]); const page = rows.slice(0, limit); return { items: page.map((row) => ({ classification: row.classification, occurredAt: row.occurred_at })), nextCursor: rows.length > limit && page.at(-1) ? encodeCursor({ occurredAt: page.at(-1)!.occurred_at, id: 0 }) : null }; }
  async profiles() { const rows = await this.sql.unsafe<{ profile_id: string; label: string; active_published_version: number | null; current_draft_version: number | null; revision: string }>(`SELECT profile_id, label, active_published_version, current_draft_version, revision::text FROM profiles ORDER BY profile_id`); return rows.map((r) => ({ profileId: r.profile_id, label: r.label, published: r.active_published_version === null ? null : { version: r.active_published_version, status: "published" }, draft: r.current_draft_version === null ? null : { version: r.current_draft_version, status: "draft" }, revision: Number(r.revision) })); }
  async audit(limit?: number) { const rows = await this.sql.unsafe<{ action: string; target_type: string; result: string; occurred_at: string }>(`SELECT action, target_type, result, occurred_at::text FROM audit_records ORDER BY sequence_id DESC LIMIT $1`, [boundedLimit(limit)]); return rows.map((r) => ({ action: r.action, targetType: r.target_type, result: r.result, occurredAt: r.occurred_at })); }
  async devices(input: { limit?: number; cursor?: string | null } = {}) { const limit = boundedLimit(input.limit); const rows = await this.sql.unsafe<{ device_id: string; status: string; policy_id: string | null; policy_label: string | null; updated_at: string }>(`SELECT device_id, status, policy_id, policy_label, updated_at::text FROM devices ORDER BY updated_at DESC, id DESC LIMIT $1`, [limit]); return { devices: rows.map((r) => ({ deviceIdRedacted: redactedDevice(r.device_id), policyId: r.policy_id, policyLabel: r.policy_label, status: r.status, lastSeenAt: r.updated_at })), nextCursor: null }; }
  async accounts(input: { limit?: number } = {}) { const limit = boundedLimit(input.limit); const rows = await this.sql.unsafe<{ handle: string; display_label: string | null; status: string; updated_at: string; budget_daily_microusd: string | null; budget_monthly_microusd: string | null; budget_mode: string | null; admin_metadata: Record<string, unknown> | string }>(`SELECT handle, display_label, status, updated_at::text, budget_daily_microusd::text, budget_monthly_microusd::text, budget_mode, admin_metadata FROM accounts ORDER BY updated_at DESC, id DESC LIMIT $1`, [limit]); return { accounts: rows.map((r) => ({ accountHandle: r.handle, label: r.display_label, status: r.status, variants: this.metadataArray(r.admin_metadata, "variants"), segments: this.metadataArray(r.admin_metadata, "segments"), accountBudget: r.budget_mode ? { dailyUsd: numeric(r.budget_daily_microusd) / 1_000_000, monthlyUsd: numeric(r.budget_monthly_microusd) / 1_000_000, mode: r.budget_mode } : null, lastSeenAt: r.updated_at })), nextCursor: null }; }
  private metadataArray(value: Record<string, unknown> | string, key: string): string[] { try { const parsed = typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value; return Array.isArray(parsed?.[key]) ? parsed[key].filter((entry): entry is string => typeof entry === "string" && entry.length <= 64) : []; } catch { return []; } }
  async catalog() { const [engines, prompts, groups] = await Promise.all([this.sql.unsafe<{ engine_id: string; kind: string; provider: string; model: string; enabled: boolean; runtime_options: Record<string, unknown> | string }>(`SELECT engine_id, kind, provider, model, enabled, runtime_options FROM engines WHERE enabled ORDER BY engine_id`), this.sql.unsafe<{ prompt_id: string; kind: string; version: number; enabled: boolean }>(`SELECT prompt_id, kind, version, enabled FROM prompts WHERE enabled ORDER BY prompt_id`), this.sql.unsafe<{ group_id: string; label: string; description: string | null; runtime_profile_id: string | null; source: string }>(`SELECT group_id, label, description, runtime_profile_id, source FROM groups ORDER BY group_id`)]); return { engineOptions: engines.map((r) => ({ id: r.engine_id, kind: r.kind, provider: r.provider, model: r.model, source: "postgres" })), promptOptions: prompts.map((r) => ({ id: r.prompt_id, kind: r.kind, version: `v${r.version}`, source: "postgres" })), groupOptions: groups.map((r) => ({ id: r.group_id, label: r.label, description: r.description, policyId: r.runtime_profile_id, source: r.source })) }; }
  async pricing() { const rows = await this.sql.unsafe<{ provider_id: string; model_id: string; pricing: Record<string, unknown> | string; effective_at: string }>(`SELECT provider_id, model_id, pricing, effective_at::text FROM pricing_records ORDER BY effective_at DESC LIMIT 100`); return rows.map((r) => ({ provider: r.provider_id, model: r.model_id, effectiveAt: r.effective_at })); }
  private async usageRows() { const rows = await this.sql.unsafe<{ device_id: string; status: string; stt_seconds: string; llm_actions: string; failures: string; attempts: string; successes: string; prewarm_failures: string }>(`SELECT d.device_id, d.status, coalesce(sum(r.input_units) FILTER (WHERE r.usage_kind = 'transcription'), 0)::text AS stt_seconds, count(r.id) FILTER (WHERE r.usage_kind <> 'transcription')::text AS llm_actions, count(r.id) FILTER (WHERE r.outcome <> 'success')::text AS failures, coalesce(sum(p.attempts), 0)::text AS attempts, coalesce(sum(p.successes), 0)::text AS successes, coalesce(sum(p.failures), 0)::text AS prewarm_failures FROM devices d LEFT JOIN request_events r ON r.device_id = d.id LEFT JOIN prewarm_daily_counters p ON p.device_id = d.id GROUP BY d.id, d.device_id, d.status ORDER BY d.device_id LIMIT 20`); return { rows: rows.map((r) => ({ deviceHandle: redactedDevice(r.device_id), status: r.status, sttSeconds: numeric(r.stt_seconds), llmActions: numeric(r.llm_actions), failures: numeric(r.failures), prewarm: { available: true, attempts: numeric(r.attempts), successes: numeric(r.successes), failures: numeric(r.prewarm_failures) }, quota: {} })), coverage: { knownDevices: rows.length, deviceCap: 20, recentEvents: 0, recentEventCap: 100, eventsPartial: false, oldestEventAt: null, newestEventAt: null, prewarmRetentionDays: 7, prewarmUnavailableDevices: 0 } }; }
}
