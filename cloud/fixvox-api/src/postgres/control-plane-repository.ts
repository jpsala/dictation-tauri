/// <reference path="../bun-runtime.d.ts" />

export class DeviceBindingConflictError extends Error {
  constructor() {
    super("device_binding_conflict");
  }
}

export type BoundDevice = {
  id: string;
  deviceId: string;
  created: boolean;
};

export type RegisteredDevice = {
  id: string;
  deviceId: string;
  accountId: string | null;
  accountBudget?: { dailyMicrousd: number | null; monthlyMicrousd: number | null; mode: "block" | "warn" | null } | null;
};

export type EffectiveProfile = {
  profileId: string;
  label: string;
  version: number;
  definition: Record<string, unknown>;
  source: "account" | "device" | "group" | "fallback";
};

type DeviceRow = { id: string; device_id: string };
type ProfileRow = {
  profile_id: string;
  label: string;
  version: number;
  definition: Record<string, unknown> | string;
  source: EffectiveProfile["source"];
};

function parseProfileDefinition(value: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof value !== "string") return value;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("profile_definition_invalid");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message === "profile_definition_invalid") throw error;
    throw new Error("profile_definition_invalid", { cause: error });
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nullableMicrousd(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("account_budget_out_of_range");
  return parsed;
}

async function materializeProductRuntime(sql: Bun.SQL, definition: Record<string, unknown>): Promise<Record<string, unknown>> {
  const runtime = record(definition.runtime);
  if (Object.keys(runtime).length === 0) return definition;
  const operations = Object.fromEntries(["transcription", "postprocess", "selectionTransform"].map((kind) => [kind, record(runtime[kind])]));
  const engineIds = [...new Set(Object.values(operations).map((operation) => String(operation.engineId ?? operation.engineKey ?? "").trim()).filter(Boolean))];
  if (engineIds.length === 0) throw new Error("profile_definition_invalid");
  const placeholders = engineIds.map((_, index) => `$${index + 1}`).join(", ");
  const rows = await sql.unsafe<{ engine_id: string; provider: string; model: string }>(`SELECT engine_id, provider, model FROM engines WHERE enabled AND engine_id IN (${placeholders})`, engineIds);
  const byId = new Map(rows.map((row) => [row.engine_id, row]));
  const engine = (kind: keyof typeof operations): Record<string, unknown> => {
    const operation = operations[kind];
    const id = String(operation.engineId ?? operation.engineKey ?? "").trim();
    const selected = byId.get(id);
    if (!selected) throw new Error("profile_engine_unavailable");
    const promptId = String(operation.promptId ?? operation.promptKey ?? "").trim();
    return { id, provider: selected.provider, model: selected.model, ...(promptId ? { promptId } : {}) };
  };
  const access = record(definition.access);
  const limits = record(definition.limits);
  const selection = engine("selectionTransform");
  return {
    ...definition,
    capabilities: Array.isArray(access.capabilities) ? access.capabilities : definition.capabilities,
    quota: { profile: limits.quotaProfile ?? limits.quotaProfileKey },
    engines: {
      transcription: engine("transcription"),
      postprocess: engine("postprocess"),
      selectionTransform: selection,
      assistant: selection,
    },
  };
}

export class PostgresControlPlaneRepository {
  constructor(private readonly sql: Bun.SQL) {}

  async bindDevice(input: {
    installIdHash: string;
    suppliedDeviceId?: string | null;
    generatedDeviceId: string;
  }): Promise<BoundDevice> {
    return await this.sql.begin(async (transaction) => {
      const existing = await transaction.unsafe<DeviceRow>(`
        SELECT d.id::text, d.device_id
        FROM install_bindings b
        JOIN devices d ON d.id = b.device_id
        WHERE b.install_id_hash = $1
        FOR UPDATE OF b
      `, [input.installIdHash]);
      if (existing[0]) {
        if (input.suppliedDeviceId && input.suppliedDeviceId !== existing[0].device_id) {
          throw new DeviceBindingConflictError();
        }
        return { id: existing[0].id, deviceId: existing[0].device_id, created: false };
      }

      const deviceId = input.suppliedDeviceId || input.generatedDeviceId;
      const conflictingBinding = await transaction.unsafe<{ install_id_hash: string }>(`
        SELECT b.install_id_hash
        FROM install_bindings b
        JOIN devices d ON d.id = b.device_id
        WHERE d.device_id = $1
        FOR UPDATE OF b
      `, [deviceId]);
      if (conflictingBinding[0]?.install_id_hash !== undefined) {
        throw new DeviceBindingConflictError();
      }

      const devices = await transaction.unsafe<DeviceRow>(`
        INSERT INTO devices (device_id, install_id_hash)
        VALUES ($1, $2)
        ON CONFLICT (device_id) DO UPDATE
          SET install_id_hash = COALESCE(devices.install_id_hash, EXCLUDED.install_id_hash),
              updated_at = now()
        RETURNING id::text, device_id
      `, [deviceId, input.installIdHash]);
      await transaction.unsafe(`
        INSERT INTO install_bindings (install_id_hash, device_id)
        VALUES ($1, $2::uuid)
      `, [input.installIdHash, devices[0].id]);
      return { id: devices[0].id, deviceId: devices[0].device_id, created: true };
    });
  }

  async resolveDevice(deviceId: string): Promise<RegisteredDevice | null> {
    const rows = await this.sql.unsafe<{
      id: string; device_id: string; account_id: string | null;
      budget_daily_microusd: string | null; budget_monthly_microusd: string | null; budget_mode: "block" | "warn" | null;
    }>(`
      SELECT d.id::text, d.device_id, d.account_id::text,
        a.budget_daily_microusd::text, a.budget_monthly_microusd::text, a.budget_mode
      FROM devices d
      LEFT JOIN accounts a ON a.id = d.account_id
      WHERE d.device_id = $1 AND d.status = 'active'
    `, [deviceId]);
    const row = rows[0];
    if (!row) return null;
    const accountBudget = row.account_id === null ? null : {
      dailyMicrousd: nullableMicrousd(row.budget_daily_microusd),
      monthlyMicrousd: nullableMicrousd(row.budget_monthly_microusd),
      mode: row.budget_mode,
    };
    return { id: row.id, deviceId: row.device_id, accountId: row.account_id, accountBudget };
  }

  async resolveEffectiveProfile(input: {
    deviceId: string;
    fallbackProfileId: string;
  }): Promise<EffectiveProfile | null> {
    const rows = await this.sql.unsafe<ProfileRow>(`
      WITH selected_device AS (
        SELECT id, account_id FROM devices WHERE device_id = $1
      ), candidates AS (
        SELECT pa.profile_id, 1 AS source_rank, pa.priority, 'account'::text AS source
        FROM policy_assignments pa, selected_device d
        WHERE pa.active AND pa.target_type = 'account' AND pa.target_id = d.account_id
        UNION ALL
        SELECT pa.profile_id, 2, pa.priority, 'device'
        FROM policy_assignments pa, selected_device d
        WHERE pa.active AND pa.target_type = 'device' AND pa.target_id = d.id
        UNION ALL
        SELECT pa.profile_id, 3, pa.priority, 'group'
        FROM policy_assignments pa
        JOIN account_groups ag ON ag.group_id = pa.target_id
        JOIN selected_device d ON d.account_id = ag.account_id
        WHERE pa.active AND pa.target_type = 'group'
        UNION ALL
        SELECT p.id, 4, 0, 'fallback'
        FROM profiles p WHERE p.profile_id = $2
      )
      SELECT p.profile_id, p.label, pv.version, pv.definition, c.source
      FROM candidates c
      JOIN profiles p ON p.id = c.profile_id
      JOIN profile_versions pv
        ON pv.profile_id = p.id AND pv.version = p.active_published_version
      WHERE pv.status = 'published'
      ORDER BY c.source_rank, c.priority DESC, p.profile_id
      LIMIT 1
    `, [input.deviceId, input.fallbackProfileId]);
    const row = rows[0];
    if (!row) return null;
    const definition = await materializeProductRuntime(this.sql, parseProfileDefinition(row.definition));
    return {
      profileId: row.profile_id,
      label: row.label,
      version: row.version,
      definition,
      source: row.source,
    };
  }
}
