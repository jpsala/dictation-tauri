/// <reference path="../bun-runtime.d.ts" />

import { BUILTIN_ENGINES, BUILTIN_PROMPTS, BUILTIN_VARIANTS } from "../../../fixvox-core/src/control-plane/catalog.ts";
import { buildDefaultRuntimePolicy } from "../../../fixvox-core/src/control-plane/runtime-policy.ts";

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
function profileDefinition(value: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof value !== "string") return value;
  try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; }
  catch { return {}; }
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown, fallback: string): string { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function scalar(value: unknown, fallback: string | number | boolean): string | number | boolean { return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : fallback; }
function policyLabel(policyId: string): string {
  return ({ "alpha-basic": "Alpha Basic", "alpha-full": "Alpha Full", "alpha-private": "Alpha Private", "power-admin": "Power Admin", pro: "Pro" } as Record<string, string>)[policyId] ?? policyId.split(/[-_]/g).filter(Boolean).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

const POLICY_OPTIONS = [
  { policyId: "alpha-basic", policyLabel: "Alpha Basic", source: "built-in" },
  { policyId: "alpha-full", policyLabel: "Alpha Full", source: "built-in" },
  { policyId: "alpha-private", policyLabel: "Alpha Private", source: "quota-group" },
  { policyId: "power-admin", policyLabel: "Power Admin", source: "built-in" },
  { policyId: "pro", policyLabel: "Pro", source: "built-in" },
] as const;
const PROFILE_SETTING_KEYS = [
  "appearance.themeId", "appearance.dockSkin", "general.onboardingDone", "general.showDockOnStartup", "general.startWithWindows", "general.preferredSurface", "general.uiLanguage",
  "hotkeys.pasteLast", "hotkeys.quickChat", "hotkeys.resultHistory", "hotkeys.picker", "hotkeys.pushToTalk", "hotkeys.stopAndSubmit", "hotkeys.toggleAssistantMode", "hotkeys.togglePressEnterAfterPaste", "hotkeys.voiceRecord",
  "transcript.language", "voice.muteOutputDuringRecording", "voice.pressEnterAfterPaste", "voice.showQuickChatReasoning", "voice.showPresetReasoning", "voice.assistantWakeWords", "voice.assistantModeToggleWords", "voice.commandWakeWords",
] as const;
const PROFILE_DEFAULTS: Record<string, string | number | boolean> = {
  "appearance.themeId": "github-light", "appearance.dockSkin": 4,
  "general.onboardingDone": false, "general.showDockOnStartup": true, "general.startWithWindows": false, "general.preferredSurface": "alpha", "general.uiLanguage": "system",
  "hotkeys.pasteLast": "Alt+Shift+X", "hotkeys.quickChat": "Alt+Shift+C", "hotkeys.resultHistory": "Alt+Shift+Z", "hotkeys.picker": "Alt+Q", "hotkeys.pushToTalk": "Ctrl+Alt+Space", "hotkeys.stopAndSubmit": "Alt+Shift+Space", "hotkeys.toggleAssistantMode": "", "hotkeys.togglePressEnterAfterPaste": "", "hotkeys.voiceRecord": "Alt+Space",
  "transcript.language": "", "voice.muteOutputDuringRecording": true, "voice.pressEnterAfterPaste": false, "voice.showQuickChatReasoning": true, "voice.showPresetReasoning": false, "voice.assistantWakeWords": "assistant,asistente,ai,zuno,lulu", "voice.assistantModeToggleWords": "assistant,asistente,ai,zuno,lulu", "voice.commandWakeWords": "comando,command",
};
const BUILTIN_GROUPS = [
  { id: "friends", label: "Friends", description: "Usuarios cercanos y amigos con feedback manual.", policyId: "pro", policyLabel: "Pro", source: "built-in" },
  { id: "private-alpha", label: "Private alpha", description: "Usuarios en alpha privada con acceso controlado.", policyId: "alpha-full", policyLabel: "Alpha Full", source: "built-in" },
  { id: "trial", label: "Trial", description: "Usuarios de prueba con límites bajos.", policyId: "alpha-basic", policyLabel: "Alpha Basic", source: "built-in" },
  { id: "paid", label: "Paid", description: "Usuarios pagos o habilitados comercialmente.", policyId: "pro", policyLabel: "Pro", source: "built-in" },
] as const;

function profileCapabilities(profileId: string): string[] {
  if (profileId === "alpha-basic") return ["dictation", "postprocess", "managed_stt", "managed_llm"];
  if (profileId === "alpha-full") return ["translate", "dictation", "postprocess", "selection_transform", "assistant_actions", "custom_prompts", "advanced_settings", "managed_stt", "managed_llm"];
  if (profileId === "power-admin") return ["translate", "dictation", "postprocess", "selection_transform", "assistant_actions", "custom_prompts", "advanced_settings", "debug_tools", "managed_stt", "managed_llm", "admin_settings"];
  if (profileId === "pro") return ["translate", "dictation", "postprocess", "selection_transform", "assistant_actions", "custom_prompts", "advanced_settings", "managed_stt", "managed_llm"];
  return [];
}
function profileAssignments(profileId: string): Record<string, string | null> {
  if (profileId === "alpha-basic") return { uiProfile: "alpha-basic", capabilityProfile: "basic", quotaProfile: null, llmProfile: "locked-presets", settingsDefaultsProfile: "alpha-lulu" };
  if (profileId === "alpha-full") return { uiProfile: "alpha-full", capabilityProfile: "full", quotaProfile: null, llmProfile: "allow-presets", settingsDefaultsProfile: "alpha-lulu" };
  if (profileId === "power-admin" || profileId === "pro") return { uiProfile: "alpha-full", capabilityProfile: profileId === "power-admin" ? "power" : "full", quotaProfile: "pro-unlimited", llmProfile: "pro-best-voice", settingsDefaultsProfile: "alpha-lulu" };
  return { uiProfile: null, capabilityProfile: null, quotaProfile: null, llmProfile: null, settingsDefaultsProfile: null };
}
function policyBudget(profileId: string): { dailyUsd: number; monthlyUsd: number; mode: string } {
  if (profileId === "alpha-basic") return { dailyUsd: 0.25, monthlyUsd: 2, mode: "block" };
  if (profileId === "alpha-full") return { dailyUsd: 1, monthlyUsd: 10, mode: "block" };
  if (profileId === "pro") return { dailyUsd: 5, monthlyUsd: 50, mode: "warn" };
  return { dailyUsd: 0.5, monthlyUsd: 5, mode: "block" };
}
function defaultEngineId(kind: "transcription" | "postprocess" | "selectionTransform"): string {
  return kind === "transcription" ? "stt-groq-whisper-turbo" : kind === "postprocess" ? "postprocess-groq-gpt-oss-120b" : "transform-groq-llama-70b";
}
function defaultPromptId(kind: "transcription" | "postprocess" | "selectionTransform"): string {
  return kind === "transcription" ? "transcriptBase" : kind === "postprocess" ? "postProcessBase" : "selectionTransformBase";
}
function canonicalProfileDefinition(profileId: string, label: string, input: Record<string, unknown> | null, version: number, status: string): Record<string, unknown> {
  const source = input ?? {};
  const access = record(source.access);
  const legacyCapabilities = Array.isArray(source.capabilities) ? source.capabilities.filter((value): value is string => typeof value === "string") : [];
  const capabilities = Array.isArray(access.capabilities) ? access.capabilities.filter((value): value is string => typeof value === "string") : legacyCapabilities.length > 0 ? legacyCapabilities : profileCapabilities(profileId);
  const runtime = record(source.runtime);
  const engines = record(source.engines);
  const operation = (kind: "transcription" | "postprocess" | "selectionTransform"): Record<string, string> => {
    const configured = record(runtime[kind]);
    const legacy = record(engines[kind] ?? (kind === "transcription" ? engines.audio : kind === "postprocess" ? engines.chat : null));
    return {
      engineId: stringValue(configured.engineId ?? configured.engineKey ?? legacy.id, defaultEngineId(kind)),
      promptId: stringValue(configured.promptId ?? configured.promptKey ?? legacy.promptId, defaultPromptId(kind)),
    };
  };
  const rawLimits = record(source.limits);
  const rawQuota = record(source.quota);
  const budget = policyBudget(profileId);
  const limits = {
    dailyUsd: typeof rawLimits.dailyUsd === "number" ? rawLimits.dailyUsd : budget.dailyUsd,
    monthlyUsd: typeof rawLimits.monthlyUsd === "number" ? rawLimits.monthlyUsd : budget.monthlyUsd,
    mode: rawLimits.mode === "warn" ? "warn" : rawLimits.mode === "block" ? "block" : budget.mode,
    ...(typeof rawLimits.quotaProfile === "string" ? { quotaProfile: rawLimits.quotaProfile } : typeof rawQuota.profile === "string" ? { quotaProfile: rawQuota.profile } : (profileId === "pro" || profileId === "power-admin") ? { quotaProfile: "pro-unlimited" } : {}),
  };
  const rawControls = record(source.userControls);
  const rawDefaults = record(source.defaults);
  const defaults = Object.fromEntries(PROFILE_SETTING_KEYS.map((key) => [key, scalar(rawDefaults[key], PROFILE_DEFAULTS[key] as string | number | boolean)]));
  const userControls = Object.fromEntries(PROFILE_SETTING_KEYS.map((key) => [key, rawControls[key] === "hidden" || rawControls[key] === "visible-locked" ? rawControls[key] : "editable"]));
  return {
    schemaVersion: 1,
    profileId,
    label,
    version,
    status: status === "draft" ? "draft" : "published",
    access: { capabilities },
    runtime: { transcription: operation("transcription"), postprocess: operation("postprocess"), selectionTransform: operation("selectionTransform") },
    limits,
    userControls,
    defaults,
  };
}
function policyOptions(): Array<Record<string, string>> { return POLICY_OPTIONS.map((option) => ({ ...option })); }
function policyEngines(): Record<string, Record<string, string>> {
  return Object.fromEntries(POLICY_OPTIONS.map((option) => [option.policyId, { transcription: defaultEngineId("transcription"), postprocess: defaultEngineId("postprocess"), selectionTransform: defaultEngineId("selectionTransform") }]));
}
function policyBudgets(): Record<string, Record<string, string | number>> { return Object.fromEntries(POLICY_OPTIONS.map((option) => [option.policyId, policyBudget(option.policyId)])); }
function frozenLimits(policyId: string | null): Record<string, unknown> {
  const windows = { rolling5h: { used: 0, limit: 20, remaining: 20, resetsAt: new Date(0).toISOString() }, weekly: { used: 0, limit: 120, remaining: 120, resetsAt: new Date(0).toISOString() } };
  const policy = { policyId, matchedCohort: policyId, quotaMultiplier: 1, globalMultiplier: 1 };
  const entry = (unit: string, label?: string) => ({ ...(label ? { label } : {}), unit, state: "ok", blockedWindow: null, windows, policy });
  return { managedUsage: entry("managedUsageUnit"), transcription: entry("audioSecond", "Transcription"), aiActions: entry("aiAction", "AI actions") };
}

/** PostgreSQL-backed, redacted Admin read projections and allowlisted event writers. */
export class PostgresAdminRepository {
  constructor(private readonly sql: Bun.SQL) {}

  private async workerCatalog(): Promise<{ engineOptions: Record<string, unknown>[]; promptOptions: Record<string, unknown>[]; variantOptions: Record<string, unknown>[]; groupOptions: Record<string, unknown>[]; selectionPresets: Record<string, unknown> | null }> {
    const [engines, prompts, groups, accounts, defaults] = await Promise.all([
      this.sql.unsafe<{ engine_id: string; kind: string; provider: string; model: string; enabled: boolean; runtime_options: Record<string, unknown> | string }>("SELECT engine_id, kind, provider, model, enabled, runtime_options FROM engines WHERE enabled ORDER BY engine_id"),
      this.sql.unsafe<{ prompt_id: string; kind: string; version: number; enabled: boolean; body: string }>("SELECT prompt_id, kind, version, enabled, body FROM prompts WHERE enabled ORDER BY prompt_id"),
      this.sql.unsafe<{ group_id: string; label: string; description: string | null; runtime_profile_id: string | null; source: string }>("SELECT group_id, label, description, runtime_profile_id, source FROM groups ORDER BY group_id"),
      this.sql.unsafe<{ admin_metadata: Record<string, unknown> | string }>("SELECT admin_metadata FROM accounts ORDER BY handle"),
      this.sql.unsafe<{ settings: Record<string, unknown> | string }>("SELECT settings FROM settings_defaults ORDER BY profile_id"),
    ]);
    const engineOptions = new Map<string, Record<string, unknown>>(BUILTIN_ENGINES.map((engine) => [engine.id, { id: engine.id, label: engine.label, kind: engine.kind, tier: engine.tier, provider: engine.provider, model: engine.model, notes: engine.notes, promptKey: engine.promptKey, promptSummary: engine.promptSummary, source: engine.source }]));
    for (const row of engines) {
      const options = record(typeof row.runtime_options === "string" ? profileDefinition(row.runtime_options) : row.runtime_options);
      engineOptions.set(row.engine_id, {
        id: row.engine_id,
        label: stringValue(options.label, row.engine_id),
        kind: row.kind,
        tier: stringValue(options.tier, "custom"),
        provider: row.provider,
        model: row.model,
        notes: stringValue(options.notes, "motor personalizado"),
        promptKey: stringValue(options.promptKey, "custom"),
        promptSummary: stringValue(options.promptSummary, "Prompt editable/custom."),
        source: "custom",
      });
    }
    const promptOptions = new Map<string, Record<string, unknown>>(BUILTIN_PROMPTS.map((prompt) => [prompt.id, { id: prompt.id, label: prompt.label, kind: prompt.kind, version: prompt.version, summary: prompt.summary, content: prompt.body, source: prompt.source }]));
    for (const row of prompts) promptOptions.set(row.prompt_id, { id: row.prompt_id, label: row.prompt_id, kind: row.kind, version: `v${row.version}`, summary: "Prompt personalizado.", content: row.body, source: "custom" });
    let selectionPresets: Record<string, unknown> | null = null;
    for (const raw of defaults) {
      const settings = typeof raw.settings === "string" ? profileDefinition(raw.settings) : raw.settings;
      const configuredSelectionPresets = record(settings).selectionPresets;
      const presetRecord = record(configuredSelectionPresets);
      const items: unknown[] = Array.isArray(presetRecord.items) ? presetRecord.items : [];
      if (!selectionPresets && items.length > 0) {
        selectionPresets = {
          schemaVersion: 1,
          source: stringValue(presetRecord.source, "fixvox-cloud-admin"),
          items: structuredClone(items),
        };
      }
      for (const item of items) {
        const preset = record(item);
        const itemId = stringValue(preset.id, "custom");
        const promptId = `preset.${itemId}`;
        if (promptOptions.has(promptId)) continue;
        promptOptions.set(promptId, { id: promptId, label: `Preset - ${stringValue(preset.label, itemId)}`, kind: "selectionTransform", version: "v1", summary: `Selection preset default synced from ${itemId}.`, content: stringValue(preset.promptContent, ""), source: "custom" });
      }
    }
    const variantOptions = new Map<string, Record<string, unknown>>(BUILTIN_VARIANTS.map((variant) => [variant.id, { id: variant.id, label: variant.label, description: variant.description, preset: variant.preset, effects: [...variant.effects], source: variant.source }]));
    for (const raw of accounts) {
      const metadata = typeof raw.admin_metadata === "string" ? profileDefinition(raw.admin_metadata) : raw.admin_metadata;
      const metadataRecord = record(metadata);
      const rawVariants = metadataRecord.variants;
      const variants: unknown[] = Array.isArray(rawVariants) ? rawVariants : [];
      for (const value of variants) {
        const id = typeof value === "string" ? value.trim() : "";
        if (!id || variantOptions.has(id)) continue;
        variantOptions.set(id, { id, label: id, description: "Variante personalizada.", preset: "custom", effects: ["customOverride: define-before-production"], source: "custom" });
      }
    }
    const groupOptions = new Map<string, Record<string, unknown>>(BUILTIN_GROUPS.map((group) => [group.id, { ...group }]));
    for (const row of groups) {
      const policyId = row.runtime_profile_id?.trim() || null;
      groupOptions.set(row.group_id, { id: row.group_id, label: row.label, description: row.description ?? "Grupo personalizado", ...(policyId ? { policyId, policyLabel: policyLabel(policyId) } : { policyId: null, policyLabel: null }), source: row.source === "built-in" ? "built-in" : "custom" });
    }
    return { engineOptions: [...engineOptions.values()], promptOptions: [...promptOptions.values()], variantOptions: [...variantOptions.values()], groupOptions: [...groupOptions.values()], selectionPresets };
  }

  private async workerProfiles(): Promise<Array<{ profileId: string; label: string; published: Record<string, unknown>; draft: Record<string, unknown> | null; history: Record<string, unknown>[] }>> {
    const rows = await this.sql.unsafe<{ profile_id: string; label: string; active_published_version: number | null; current_draft_version: number | null; version: number | null; status: string | null; definition: Record<string, unknown> | string | null }>(`
      SELECT p.profile_id, p.label, p.active_published_version, p.current_draft_version, pv.version, pv.status, pv.definition
      FROM profiles p LEFT JOIN profile_versions pv ON pv.profile_id = p.id
      ORDER BY p.profile_id, pv.version
    `);
    const byId = new Map<string, typeof rows>();
    for (const row of rows) byId.set(row.profile_id, [...(byId.get(row.profile_id) ?? []), row]);
    const ids = [...new Set([...POLICY_OPTIONS.map((option) => option.policyId), ...rows.map((row) => row.profile_id).filter((profileId) => profileId !== "basic")])].sort((left, right) => left.localeCompare(right));
    return ids.map((profileId) => {
      const option = POLICY_OPTIONS.find((candidate) => candidate.policyId === profileId);
      const profileRows = byId.get(profileId) ?? [];
      const label = option?.policyLabel ?? profileRows[0]?.label ?? profileId;
      const activeVersion = profileRows[0]?.active_published_version ?? null;
      const publishedRow = profileRows.find((row) => row.version === activeVersion && row.status !== "draft") ?? profileRows.filter((row) => row.status !== "draft" && row.version !== null).at(-1);
      const historyRows = profileRows.filter((row) => row.status !== "draft" && row.version !== null);
      const history = historyRows.length > 0
        ? historyRows.map((row) => canonicalProfileDefinition(profileId, label, row.definition ? profileDefinition(row.definition) : null, row.version ?? 1, "published"))
        : [canonicalProfileDefinition(profileId, label, null, 1, "published")];
      const published = publishedRow?.version !== null && publishedRow?.version !== undefined
        ? canonicalProfileDefinition(profileId, label, publishedRow.definition ? profileDefinition(publishedRow.definition) : null, publishedRow.version, "published")
        : history.at(-1)!;
      const draftRow = profileRows.find((row) => row.version === row.current_draft_version && row.status === "draft");
      const draft = draftRow?.version !== null && draftRow?.version !== undefined
        ? canonicalProfileDefinition(profileId, label, draftRow.definition ? profileDefinition(draftRow.definition) : null, draftRow.version, "draft")
        : null;
      return { profileId, label, published, draft, history };
    });
  }

  async workerProfileList() {
    const profiles = await this.workerProfiles();
    return { ok: true as const, schemaVersion: 1, updatedAt: new Date().toISOString(), profiles };
  }

  async workerRuntimePolicy() {
    const policy = buildDefaultRuntimePolicy() as Record<string, unknown>;
    const [catalog, profiles] = await Promise.all([this.workerCatalog(), this.workerProfiles()]);
    if (catalog.selectionPresets) {
      policy.userSettingsDefaults = { ...record(policy.userSettingsDefaults), selectionPresets: catalog.selectionPresets };
    }
    const { groupOptions: _groupOptions, selectionPresets: _selectionPresets, ...catalogProjection } = catalog;
    const profileOptions = profiles.map((profile) => ({
      policyId: profile.profileId,
      policyLabel: profile.label,
      source: POLICY_OPTIONS.find((option) => option.policyId === profile.profileId)?.source ?? "built-in",
      capabilities: (record(profile.published.access).capabilities as unknown[] | undefined)?.filter((value): value is string => typeof value === "string") ?? [],
      profiles: profileAssignments(profile.profileId),
    }));
    return {
      ok: true as const,
      source: "default" as const,
      updatedAt: new Date().toISOString(),
      policy,
      defaultPolicy: buildDefaultRuntimePolicy(),
      ...catalogProjection,
      availableSegments: catalog.variantOptions.map((variant) => String(variant.id)),
      policyVariants: {},
      policyEngines: policyEngines(),
      policyBudgets: policyBudgets(),
      profileOptions,
      profileVersions: profiles,
    };
  }

  async workerDevices(input: { limit?: number; cursor?: string | null } = {}) {
    const limit = boundedLimit(input.limit);
    const rows = await this.sql.unsafe<{ device_id: string; install_id_hash: string | null; account_handle: string | null; status: string; policy_id: string | null; policy_label: string | null; updated_at: string }>(`SELECT d.device_id, d.install_id_hash, a.handle AS account_handle, d.status, d.policy_id, d.policy_label, d.updated_at::text FROM devices d LEFT JOIN accounts a ON a.id = d.account_id ORDER BY d.updated_at DESC, d.id DESC LIMIT $1`, [limit]);
    const devices = rows.map((row) => {
      const policyId = row.policy_id ?? "alpha-basic";
      return {
        deviceId: row.device_id,
        installId: row.install_id_hash ?? "redacted",
        accountHandle: row.account_handle,
        policyId,
        policyLabel: policyLabel(policyId),
        cohorts: policyId === "alpha-private" ? ["alpha-private", "default"] : ["alpha-private", policyId],
        status: row.status,
        lastSeenAt: row.updated_at,
        profiles: profileAssignments(policyId),
        limits: frozenLimits(policyId),
      };
    });
    return { ok: true as const, source: "default" as const, updatedAt: new Date().toISOString(), policyOptions: policyOptions(), devices, nextCursor: null };
  }

  async workerAccounts(input: { limit?: number; cursor?: string | null } = {}) {
    const limit = boundedLimit(input.limit);
    const [accounts, assignments, groups, devices] = await Promise.all([
      this.sql.unsafe<{ account_id: string; provider: string; handle: string; display_label: string | null; status: string; updated_at: string; budget_daily_microusd: string | null; budget_monthly_microusd: string | null; budget_mode: string | null; admin_metadata: Record<string, unknown> | string }>(`SELECT a.id::text AS account_id, a.provider, a.handle, a.display_label, a.status, a.updated_at::text, a.budget_daily_microusd::text, a.budget_monthly_microusd::text, a.budget_mode, a.admin_metadata FROM accounts a ORDER BY a.updated_at DESC, a.id DESC LIMIT $1`, [limit]),
      this.sql.unsafe<{ account_id: string; policy_id: string; policy_label: string | null }>(`SELECT pa.target_id::text AS account_id, p.profile_id AS policy_id, p.label AS policy_label FROM policy_assignments pa JOIN profiles p ON p.id = pa.profile_id WHERE pa.target_type = 'account' AND pa.active`),
      this.sql.unsafe<{ account_id: string; group_id: string }>(`SELECT ag.account_id::text, g.group_id FROM account_groups ag JOIN groups g ON g.id = ag.group_id ORDER BY g.group_id`),
      this.sql.unsafe<{ account_id: string; device_id: string; status: string; policy_id: string | null; policy_label: string | null; updated_at: string }>(`SELECT d.account_id::text, d.device_id, d.status, d.policy_id, d.policy_label, d.updated_at::text FROM devices d WHERE d.account_id IS NOT NULL ORDER BY d.updated_at DESC, d.id DESC`),
    ]);
    const [catalog] = await Promise.all([this.workerCatalog()]);
    const accountsProjection = accounts.map((row) => {
      const accountDevices = devices.filter((device) => device.account_id === row.account_id);
      const assignment = assignments.find((candidate) => candidate.account_id === row.account_id);
      const policyId = assignment?.policy_id ?? accountDevices[0]?.policy_id ?? "alpha-basic";
      const policy = policyLabel(policyId);
      const metadata = typeof row.admin_metadata === "string" ? profileDefinition(row.admin_metadata) : row.admin_metadata;
      const metadataRecord = record(metadata);
      const rawVariants = metadataRecord.variants;
      const variants = Array.isArray(rawVariants) ? rawVariants.filter((value: unknown): value is string => typeof value === "string") : [];
      const groupsForAccount = groups.filter((group) => group.account_id === row.account_id).map((group) => group.group_id);
      const accountBudget = row.budget_mode ? { dailyUsd: numeric(row.budget_daily_microusd) / 1_000_000, monthlyUsd: numeric(row.budget_monthly_microusd) / 1_000_000, mode: row.budget_mode } : null;
      return {
        accountHandle: row.handle,
        accountIdRedacted: "account redacted",
        userRedacted: "user redacted",
        userEmailRedacted: null,
        provider: row.provider,
        variants,
        segments: [...variants],
        groups: groupsForAccount,
        policyId,
        policyLabel: policy,
        effectivePolicyId: policyId,
        effectivePolicyLabel: policy,
        effectivePolicySource: assignment ? "account" : accountDevices[0] ? "device" : "base",
        matchedGroup: null,
        accountBudget,
        deviceCount: accountDevices.length,
        devices: accountDevices.slice(0, 20).map((device) => ({ deviceIdRedacted: redactedDevice(device.device_id), policyId: device.policy_id ?? policyId, policyLabel: policyLabel(device.policy_id ?? policyId), status: device.status, lastSeenAt: device.updated_at })),
        lastSeenAt: accountDevices[0]?.updated_at ?? row.updated_at,
      };
    });
    return {
      ok: true as const,
      source: "default" as const,
      updatedAt: new Date().toISOString(),
      policyOptions: policyOptions(),
      availableSegments: catalog.variantOptions.map((variant) => String(variant.id)),
      variantOptions: catalog.variantOptions,
      groupOptions: catalog.groupOptions,
      policyVariants: {},
      policyEngines: policyEngines(),
      accounts: accountsProjection,
      nextCursor: null,
    };
  }

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

  async pruneProductSignals(retentionDays = 30): Promise<number> {
    const days = Math.min(90, Math.max(1, Math.trunc(retentionDays)));
    const rows = await this.sql.unsafe<{ count: string }>(`WITH deleted AS (DELETE FROM feedback_events WHERE occurred_at < now() - ($1::text || ' days')::interval RETURNING 1) SELECT count(*)::text AS count FROM deleted`, [days]);
    return Number(rows[0]?.count ?? 0);
  }

  async linkedPrincipals() {
    const rows = await this.sql.unsafe<{ provider_subject_hash: string; handle: string; display_label: string | null; role: string | null }>(`
      SELECT a.provider_subject_hash, a.handle, a.display_label, rb.role
      FROM accounts a LEFT JOIN role_bindings rb ON rb.account_id = a.id
      WHERE a.provider = 'google' AND a.provider_subject_hash IS NOT NULL
        AND EXISTS (SELECT 1 FROM devices d WHERE d.account_id = a.id)
      ORDER BY a.handle, rb.role
      LIMIT 400
    `);
    const rank: Record<string, number> = { viewer: 0, editor: 1, publisher: 2, owner: 3 };
    const principals = new Map<string, { principalKey: string; accountHandle: string; emailRedacted: null; role: string | null }>();
    for (const row of rows) {
      const principalKey = `arp_${row.provider_subject_hash}`;
      const current = principals.get(principalKey);
      if (!current || (rank[row.role ?? ""] ?? -1) > (rank[current.role ?? ""] ?? -1)) principals.set(principalKey, { principalKey, accountHandle: row.handle, emailRedacted: null, role: row.role });
    }
    const values = [...principals.values()];
    return { principals: values, bindings: values.filter((value) => value.role !== null) };
  }

  async roleForPrincipal(principalKey: string): Promise<"viewer" | "editor" | "publisher" | "owner" | null> {
    if (!/^arp_[a-f0-9]{64}$/.test(principalKey)) return null;
    const rows = await this.sql.unsafe<{ role: string }>(`SELECT rb.role FROM accounts a JOIN devices d ON d.account_id = a.id JOIN role_bindings rb ON rb.account_id = a.id WHERE a.provider = 'google' AND a.provider_subject_hash = $1`, [principalKey.slice(4)]);
    const rank = ["viewer", "editor", "publisher", "owner"] as const;
    return rows.reduce<(typeof rank)[number] | null>((best, row) => rank.indexOf(row.role as (typeof rank)[number]) > rank.indexOf(best as (typeof rank)[number]) ? row.role as (typeof rank)[number] : best, null);
  }

  async setRoleBinding(input: { actorPrincipalKey: string; subjectPrincipalKey: string; role: "viewer" | "editor" | "publisher" | "owner" | null }) {
    if (!/^arp_[a-f0-9]{64}$/.test(input.actorPrincipalKey) || !/^arp_[a-f0-9]{64}$/.test(input.subjectPrincipalKey)) throw new Error("listed_linked_principal_required");
    return this.sql.begin(async (tx) => {
      const subjects = await tx.unsafe<{ id: string }>(`SELECT a.id::text FROM accounts a WHERE a.provider = 'google' AND a.provider_subject_hash = $1 AND EXISTS (SELECT 1 FROM devices d WHERE d.account_id = a.id) FOR UPDATE`, [input.subjectPrincipalKey.slice(4)]);
      if (!subjects[0]) throw new Error("listed_linked_principal_required");
      const actorRole = await tx.unsafe<{ role: string }>(`SELECT rb.role FROM accounts a JOIN role_bindings rb ON rb.account_id = a.id WHERE a.provider = 'google' AND a.provider_subject_hash = $1 AND rb.role = 'owner'`, [input.actorPrincipalKey.slice(4)]);
      if (!actorRole[0]) throw new Error("forbidden");
      const current = await tx.unsafe<{ role: string }>(`SELECT role FROM role_bindings WHERE account_id = $1::uuid FOR UPDATE`, [subjects[0].id]);
      if (current.some((row) => row.role === "owner") && input.role !== "owner") {
        const owners = await tx.unsafe<{ count: string }>(`SELECT count(DISTINCT account_id)::text AS count FROM role_bindings WHERE role = 'owner'`);
        if (Number(owners[0]?.count ?? 0) <= 1) throw new Error("forbidden");
      }
      await tx.unsafe(`DELETE FROM role_bindings WHERE account_id = $1::uuid`, [subjects[0].id]);
      if (input.role) await tx.unsafe(`INSERT INTO role_bindings (account_id, role, granted_by) VALUES ($1::uuid, $2, $3)`, [subjects[0].id, input.role, input.actorPrincipalKey]);
      await tx.unsafe(`INSERT INTO audit_records (actor_ref_hash, action, target_type, target_ref_hash, result, safe_metadata) VALUES ($1, $2, 'principal', $3, 'success', $4::jsonb)`, [input.actorPrincipalKey, input.role ? "role.set" : "role.remove", input.subjectPrincipalKey, JSON.stringify({ role: input.role })]);
      return { ok: true, principalKey: input.subjectPrincipalKey, role: input.role, audit: { action: input.role ? "role.set" : "role.remove", result: "success" } };
    });
  }

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
  async profiles() {
    const rows = await this.sql.unsafe<{ profile_id: string; label: string; active_published_version: number | null; current_draft_version: number | null; revision: string; version: number | null; status: string | null; definition: Record<string, unknown> | string | null }>(`
      SELECT p.profile_id, p.label, p.active_published_version, p.current_draft_version, p.revision::text,
             pv.version, pv.status, pv.definition
      FROM profiles p LEFT JOIN profile_versions pv ON pv.profile_id = p.id
      ORDER BY p.profile_id, pv.version
    `);
    const profiles = new Map<string, { profileId: string; label: string; revision: number; published: Record<string, unknown> | null; draft: Record<string, unknown> | null; history: Record<string, unknown>[] }>();
    for (const row of rows) {
      const profile = profiles.get(row.profile_id) ?? { profileId: row.profile_id, label: row.label, revision: Number(row.revision), published: null, draft: null, history: [] };
      if (row.version !== null && row.status && row.definition) {
        const version = { ...profileDefinition(row.definition), profileId: row.profile_id, version: row.version, status: row.status };
        if (row.version === row.active_published_version) profile.published = { ...version, status: "published" };
        if (row.version === row.current_draft_version) profile.draft = { ...version, status: "draft" };
        if (row.status !== "draft") profile.history.push(version);
      }
      profiles.set(row.profile_id, profile);
    }
    return [...profiles.values()];
  }
  async audit(limit?: number) { const rows = await this.sql.unsafe<{ action: string; target_type: string; result: string; occurred_at: string }>(`SELECT action, target_type, result, occurred_at::text FROM audit_records ORDER BY sequence_id DESC LIMIT $1`, [boundedLimit(limit)]); return rows.map((r) => ({ action: r.action, targetType: r.target_type, result: r.result, occurredAt: r.occurred_at })); }
  async devices(input: { limit?: number; cursor?: string | null } = {}) { const limit = boundedLimit(input.limit); const rows = await this.sql.unsafe<{ device_id: string; status: string; policy_id: string | null; policy_label: string | null; updated_at: string }>(`SELECT device_id, status, policy_id, policy_label, updated_at::text FROM devices ORDER BY updated_at DESC, id DESC LIMIT $1`, [limit]); return { devices: rows.map((r) => ({ deviceIdRedacted: redactedDevice(r.device_id), policyId: r.policy_id, policyLabel: r.policy_label, status: r.status, lastSeenAt: r.updated_at })), nextCursor: null }; }
  async accounts(input: { limit?: number } = {}) { const limit = boundedLimit(input.limit); const rows = await this.sql.unsafe<{ handle: string; display_label: string | null; status: string; updated_at: string; budget_daily_microusd: string | null; budget_monthly_microusd: string | null; budget_mode: string | null; admin_metadata: Record<string, unknown> | string }>(`SELECT handle, display_label, status, updated_at::text, budget_daily_microusd::text, budget_monthly_microusd::text, budget_mode, admin_metadata FROM accounts ORDER BY updated_at DESC, id DESC LIMIT $1`, [limit]); return { accounts: rows.map((r) => ({ accountHandle: r.handle, label: r.display_label, status: r.status, variants: this.metadataArray(r.admin_metadata, "variants"), segments: this.metadataArray(r.admin_metadata, "segments"), accountBudget: r.budget_mode ? { dailyUsd: numeric(r.budget_daily_microusd) / 1_000_000, monthlyUsd: numeric(r.budget_monthly_microusd) / 1_000_000, mode: r.budget_mode } : null, lastSeenAt: r.updated_at })), nextCursor: null }; }
  private metadataArray(value: Record<string, unknown> | string, key: string): string[] { try { const parsed = typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value; return Array.isArray(parsed?.[key]) ? parsed[key].filter((entry): entry is string => typeof entry === "string" && entry.length <= 64) : []; } catch { return []; } }
  async catalog() { const [engines, prompts, groups] = await Promise.all([this.sql.unsafe<{ engine_id: string; kind: string; provider: string; model: string; enabled: boolean; runtime_options: Record<string, unknown> | string }>(`SELECT engine_id, kind, provider, model, enabled, runtime_options FROM engines WHERE enabled ORDER BY engine_id`), this.sql.unsafe<{ prompt_id: string; kind: string; version: number; enabled: boolean }>(`SELECT prompt_id, kind, version, enabled FROM prompts WHERE enabled ORDER BY prompt_id`), this.sql.unsafe<{ group_id: string; label: string; description: string | null; runtime_profile_id: string | null; source: string }>(`SELECT group_id, label, description, runtime_profile_id, source FROM groups ORDER BY group_id`)]); return { engineOptions: engines.map((r) => ({ id: r.engine_id, kind: r.kind, provider: r.provider, model: r.model, source: "postgres" })), promptOptions: prompts.map((r) => ({ id: r.prompt_id, kind: r.kind, version: `v${r.version}`, source: "postgres" })), groupOptions: groups.map((r) => ({ id: r.group_id, label: r.label, description: r.description, policyId: r.runtime_profile_id, source: r.source })) }; }
  async pricing() { const rows = await this.sql.unsafe<{ provider_id: string; model_id: string; pricing: Record<string, unknown> | string; effective_at: string }>(`SELECT provider_id, model_id, pricing, effective_at::text FROM pricing_records ORDER BY effective_at DESC LIMIT 100`); return rows.map((r) => ({ provider: r.provider_id, model: r.model_id, effectiveAt: r.effective_at })); }
  private async usageRows() { const rows = await this.sql.unsafe<{ device_id: string; status: string; stt_seconds: string; llm_actions: string; failures: string; attempts: string; successes: string; prewarm_failures: string }>(`SELECT d.device_id, d.status, coalesce(sum(r.input_units) FILTER (WHERE r.usage_kind = 'transcription'), 0)::text AS stt_seconds, count(r.id) FILTER (WHERE r.usage_kind <> 'transcription')::text AS llm_actions, count(r.id) FILTER (WHERE r.outcome <> 'success')::text AS failures, coalesce(sum(p.attempts), 0)::text AS attempts, coalesce(sum(p.successes), 0)::text AS successes, coalesce(sum(p.failures), 0)::text AS prewarm_failures FROM devices d LEFT JOIN request_events r ON r.device_id = d.id LEFT JOIN prewarm_daily_counters p ON p.device_id = d.id GROUP BY d.id, d.device_id, d.status ORDER BY d.device_id LIMIT 20`); return { rows: rows.map((r) => ({ deviceHandle: redactedDevice(r.device_id), status: r.status, sttSeconds: numeric(r.stt_seconds), llmActions: numeric(r.llm_actions), failures: numeric(r.failures), prewarm: { available: true, attempts: numeric(r.attempts), successes: numeric(r.successes), failures: numeric(r.prewarm_failures) }, quota: {} })), coverage: { knownDevices: rows.length, deviceCap: 20, recentEvents: 0, recentEventCap: 100, eventsPartial: false, oldestEventAt: null, newestEventAt: null, prewarmRetentionDays: 7, prewarmUnavailableDevices: 0 } }; }
}
