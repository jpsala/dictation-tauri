import type { KvNamespaceLike } from "./admin-store";
import {
  buildFeatureFlagsFromRuntimePolicy,
  buildRegisterDefaultsFromRuntimePolicy,
  buildTransportPolicyFromRuntimePolicy,
  getRuntimePolicy,
} from "./runtime-policy-store";
import { getRecipePolicy } from "./recipe-policy-store";

export type DeviceRegisterPayload = {
  installId?: string | null;
  deviceId?: string | null;
  version?: string | null;
  platform?: string | null;
  arch?: string | null;
  hostname?: string | null;
  ts?: string | null;
};

export type DeviceActivatePayload = {
  installId?: string | null;
  deviceId?: string | null;
  inviteCode?: string | null;
  version?: string | null;
  platform?: string | null;
  arch?: string | null;
  hostname?: string | null;
  ts?: string | null;
};

export type DeviceInviteDefinition = {
  policyId: string;
  policyLabel: string;
};

export type DeviceRecord = {
  deviceId: string;
  installId: string;
  accountId: string | null;
   activated: boolean;
   policyId: string | null;
   policyLabel: string | null;
   status: "active" | "revoked" | "disabled";
   activatedAt: string | null;
   firstSeenAt: string;
   lastSeenAt: string;
  appVersion: string | null;
  platform: string | null;
  arch: string | null;
  hostname: string | null;
  cohorts: string[];
  experiments: Record<string, unknown> | null;
  feedback: Record<string, unknown> | null;
};

export type DeviceRegisterResponse = {
  ok: true;
  deviceId: string;
  activated: boolean;
  policyId: string | null;
  policyLabel: string | null;
  accountId: string | null;
  minVersion: string | null;
  auth: {
    required: boolean;
    providers: string[];
  };
  features: Record<string, boolean>;
  defaults: Record<string, unknown> | null;
  cohorts: string[];
  experiments: Record<string, unknown> | null;
  feedback: Record<string, unknown> | null;
  limits: DeviceLimits | null;
  telemetry: {
    enabled: boolean;
    intervalMs: number;
    batchSize: number;
  };
  transportPolicy: Record<string, unknown> | null;
};

export type DeviceActivateResponse = {
  ok: true;
  deviceId: string;
  activated: true;
  policyId: string;
  policyLabel: string;
};

export type ExecutionPreflightPayload = {
  mode?: string | null;
  deviceId?: string | null;
  installId?: string | null;
  usageKind?: string | null;
  estimate?: number | null;
};

export type ExecutionMode = "managed" | "byok";

export type ExecutionPreflightResponse = {
  ok: true;
  allowed: boolean;
  reason: string | null;
  retryAfterSeconds?: number | null;
  limits?: DeviceLimits | null;
};

export type ManagedUsageWindowName = "rolling5h" | "weekly";

export type ManagedQuotaName = "managedUsage" | "transcription" | "aiActions";

export type ManagedUsageWindow = {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
};

export type ManagedUsageLimits = {
  unit: "managedUsageUnit";
  state: "ok" | "almost_used" | "blocked" | "paused";
  blockedWindow: ManagedUsageWindowName | null;
  windows: Record<ManagedUsageWindowName, ManagedUsageWindow>;
  policy: {
    policyId: string | null;
    matchedCohort: string | null;
    quotaMultiplier: number;
    globalMultiplier: number;
  };
};

export type ManagedQuotaLimits = {
  unit: "audioSecond" | "aiAction";
  label: string;
  state: "ok" | "almost_used" | "blocked" | "paused";
  blockedWindow: ManagedUsageWindowName | null;
  windows: Record<ManagedUsageWindowName, ManagedUsageWindow>;
  policy: {
    policyId: string | null;
    matchedCohort: string | null;
    quotaMultiplier: number;
    globalMultiplier: number;
  };
};

export type DeviceLimits = {
  managedUsage: ManagedUsageLimits;
  transcription: ManagedQuotaLimits;
  aiActions: ManagedQuotaLimits;
};

export type ControlPlaneAdminDeviceRow = {
  deviceId: string;
  installId: string;
  policyId: string | null;
  policyLabel: string | null;
  cohorts: string[];
  status: DeviceRecord["status"];
  lastSeenAt: string;
  profiles: {
    uiProfile: string | null;
    capabilityProfile: string | null;
    quotaProfile: string | null;
    llmProfile: string | null;
    settingsDefaultsProfile: string | null;
  };
  limits: DeviceLimits;
};

export type ControlPlaneAdminPolicyOption = {
  policyId: string;
  policyLabel: string;
  source: "built-in" | "assignment" | "quota-group";
};

export type ControlPlaneAdminDeviceList = {
  ok: true;
  source: "default" | "stored";
  updatedAt: string;
  policyOptions: ControlPlaneAdminPolicyOption[];
  devices: ControlPlaneAdminDeviceRow[];
  nextCursor: string | null;
};

export type ControlPlaneAdminDevicePolicyPayload = {
  deviceId?: string | null;
  policyId?: string | null;
  policyLabel?: string | null;
};

export type ControlPlaneAdminDevicePolicyResponse = {
  ok: true;
  source: "default" | "stored";
  updatedAt: string;
  policyOptions: ControlPlaneAdminPolicyOption[];
  device: ControlPlaneAdminDeviceRow;
};

export type FeedbackEvent = {
  id: string;
  ts: string;
  type: "bug" | "confusing" | "idea" | "love-it";
  source: string;
  message: string;
  deviceId: string | null;
  installId: string | null;
  accountId: string | null;
  appVersion: string | null;
  loggedIn: boolean;
  cohorts: string[];
  experiments: Record<string, unknown> | null;
  features: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
};

export type FeedbackListFilters = {
  type?: string | null;
  source?: string | null;
  deviceId?: string | null;
  q?: string | null;
  limit?: number | null;
  cursor?: string | null;
};

type RecentIndexEntry = {
  id: string;
  ts: string;
};

const DEVICE_TTL_SECONDS = 60 * 60 * 24 * 180;
const DEVICE_WRITE_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEVICE_RECENT_LIMIT = 500;
const DEVICE_RECENT_INDEX_KEY = "control:devices:recent";
const FEEDBACK_TTL_SECONDS = 60 * 60 * 24 * 180;
const FEEDBACK_RECENT_LIMIT = 500;
const FEEDBACK_RECENT_INDEX_KEY = "control:feedback:recent";
const USAGE_EVENT_TTL_SECONDS = 60 * 60 * 24 * 14;
const ROLLING_5H_MS = 5 * 60 * 60 * 1000;
const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_POLICY_ID = "alpha-basic";
const DEFAULT_POLICY_LABEL = "Alpha Basic";
const JP_ROLLING_5H_LIMIT = 1_000_000;
const JP_WEEKLY_LIMIT = 10_000_000;
const JP_TRANSCRIPTION_ROLLING_5H_SECONDS = 1_000_000;
const JP_TRANSCRIPTION_WEEKLY_SECONDS = 10_000_000;
const JP_AI_ACTIONS_ROLLING_5H_LIMIT = 1_000_000;
const JP_AI_ACTIONS_WEEKLY_LIMIT = 10_000_000;

type UsageEvent = {
  id: string;
  ts: string;
  units: number;
  actionUnits: number;
  kind: "managed" | "transcription" | "aiAction";
};

type ManagedUsageGroupPolicy = {
  rolling5hLimit: number;
  weeklyLimit: number;
  transcriptionRolling5hSeconds: number;
  transcriptionWeeklySeconds: number;
  aiActionsRolling5hLimit: number;
  aiActionsWeeklyLimit: number;
  quotaMultiplier: number;
};

type ManagedUsagePolicy = {
  estimatePerRequest: number;
  globalMultiplier: number;
  matchedCohort: string | null;
  quotaProfileId: string | null;
  group: ManagedUsageGroupPolicy;
};

type PolicyProfileAssignment = {
  uiProfile?: string;
  capabilityProfile?: string;
  quotaProfile?: string;
  llmProfile?: string;
  voiceRoutingProfile?: string;
  promptProfile?: string;
  settingsDefaultsProfile?: string;
};

const BUILT_IN_POLICY_ASSIGNMENTS: Record<string, PolicyProfileAssignment> = {
  "alpha-basic": {
    uiProfile: "alpha-basic",
    capabilityProfile: "basic",
    llmProfile: "locked-presets",
    settingsDefaultsProfile: "alpha-lulu",
  },
  "alpha-full": {
    uiProfile: "alpha-full",
    capabilityProfile: "full",
    llmProfile: "allow-presets",
    settingsDefaultsProfile: "alpha-lulu",
  },
  pro: {
    uiProfile: "alpha-full",
    capabilityProfile: "full",
    quotaProfile: "pro-unlimited",
    llmProfile: "pro-best-voice",
    voiceRoutingProfile: "pro-post-process",
    promptProfile: "pro-prompts",
    settingsDefaultsProfile: "alpha-lulu",
  },
};

const BUILT_IN_POLICY_PROFILES: Record<string, Record<string, Record<string, unknown>>> = {
  ui: {
    "alpha-basic": {
      ui: {
        hideProviderModelSelectors: true,
        hidePresetProviderModelOverrides: true,
        showAdvancedSettings: false,
        showDebugTools: false,
      },
    },
    "alpha-full": {
      ui: {
        hideProviderModelSelectors: false,
        hidePresetProviderModelOverrides: false,
        showAdvancedSettings: true,
        showDebugTools: false,
      },
    },
  },
  capabilities: {
    basic: {
      features: {
        "assistant.mode": false,
        "assistant.quickChat": false,
        "presets.edit": false,
        "presets.run": false,
        "results.history": false,
      },
    },
    full: {
      features: {
        "assistant.mode": true,
        "assistant.quickChat": true,
        "presets.edit": true,
        "presets.run": true,
        "results.history": true,
      },
    },
  },
  llm: {
    "locked-presets": {
      llm: {
        presetOverridePolicy: "deny",
      },
    },
    "allow-presets": {
      llm: {
        presetOverridePolicy: "allow",
      },
    },
    "pro-best-voice": {
      llm: {
        presetOverridePolicy: "allow",
        targets: {
          postProcess: {
            provider: "groq",
            model: "llama-3.3-70b-versatile",
            policy: "locked",
          },
          presetFallback: {
            provider: "groq",
            model: "llama-3.3-70b-versatile",
            policy: "default",
          },
        },
      },
    },
  },
  voiceRouting: {
    "pro-post-process": {
      voiceRouting: {
        cohortAssignments: {
          pro: "quality",
        },
        policies: {
          quality: {
            runtime: {
              sttPromptEnabled: true,
              postProcessEnabled: true,
            },
          },
        },
      },
    },
  },
  prompts: {
    "pro-prompts": {
      prompts: {
        postProcessBase: {
          text: "Clean Spanish/bilingual dictation with minimal edits. Preserve wording, language mix, and verb tense. Convert spoken punctuation commands when clear; keep literal words when uncertain. Preserve or reconstruct clear technical tokens: app punto svelte -> app.svelte; voice doc output ts -> voice-dock-output.ts; banRanDev/bun randev -> bun run dev; npmRanDev/npm randev -> npm run dev; fixbox.local -> fixvox.local; fixbox.dev -> fixvox.dev; llama 3.370B versatile -> llama-3.3-70b-versatile. Prefer same-paragraph sentence breaks; do not add blank lines except around numbered lists. If a sentence is immediately followed by primero/segundo/tercero items, end that sentence with a colon, format 1/2/3 on separate lines, use comma after items 1 and 2 and period after the final item, then resume following prose after the list.",
          policy: "default",
        },
      },
    },
  },
  settingsDefaults: {
    "alpha-lulu": {
      userSettingsDefaults: {
        appearance: {
          themeId: "github-light",
        },
        hotkeys: {
          pushToTalk: "Alt+Space",
          voiceRecord: "Alt+Ctrl+Space",
        },
        voice: {
          assistantWakeWords: "lulu",
          assistantModeToggleWords: "modo lulu,lulu",
        },
      },
    },
  },
  quota: {
    "alpha-basic": {
      rolling5hLimit: 80,
      weeklyLimit: 700,
      transcriptionRolling5hSeconds: 3_600,
      transcriptionWeeklySeconds: 10_800,
      aiActionsRolling5hLimit: 20,
      aiActionsWeeklyLimit: 100,
      quotaMultiplier: 1,
    },
    "alpha-full": {
      rolling5hLimit: 150,
      weeklyLimit: 1500,
      transcriptionRolling5hSeconds: 10_800,
      transcriptionWeeklySeconds: 72_000,
      aiActionsRolling5hLimit: 80,
      aiActionsWeeklyLimit: 700,
      quotaMultiplier: 1,
    },
    "pro-unlimited": {
      rolling5hLimit: JP_ROLLING_5H_LIMIT,
      weeklyLimit: JP_WEEKLY_LIMIT,
      transcriptionRolling5hSeconds: JP_TRANSCRIPTION_ROLLING_5H_SECONDS,
      transcriptionWeeklySeconds: JP_TRANSCRIPTION_WEEKLY_SECONDS,
      aiActionsRolling5hLimit: JP_AI_ACTIONS_ROLLING_5H_LIMIT,
      aiActionsWeeklyLimit: JP_AI_ACTIONS_WEEKLY_LIMIT,
      quotaMultiplier: 1,
    },
  },
};

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function sanitizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sanitizeInviteCode(value: unknown): string | null {
  const candidate = sanitizeString(value);
  return candidate ? candidate.toUpperCase() : null;
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => sanitizeString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function sanitizeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function nowIso(value?: string | null): string {
  const candidate = sanitizeString(value);
  if (!candidate) return new Date().toISOString();
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function shouldPersistDeviceRecord(
  previous: DeviceRecord | null,
  mappedDeviceId: string | null,
  nextRecord: DeviceRecord,
): boolean {
  if (!previous) return true;
  if (mappedDeviceId !== nextRecord.deviceId) return true;
  if (previous.installId !== nextRecord.installId) return true;
  if (previous.accountId !== nextRecord.accountId) return true;
  if (previous.activated !== nextRecord.activated) return true;
  if (previous.policyId !== nextRecord.policyId) return true;
  if (previous.policyLabel !== nextRecord.policyLabel) return true;
  if (previous.status !== nextRecord.status) return true;
  if (JSON.stringify(previous.cohorts) !== JSON.stringify(nextRecord.cohorts)) return true;
  if (previous.appVersion !== nextRecord.appVersion) return true;
  if (previous.platform !== nextRecord.platform) return true;
  if (previous.arch !== nextRecord.arch) return true;
  if (previous.hostname !== nextRecord.hostname) return true;

  const previousLastSeenMs = Date.parse(previous.lastSeenAt);
  const nextLastSeenMs = Date.parse(nextRecord.lastSeenAt);
  if (!Number.isFinite(previousLastSeenMs) || !Number.isFinite(nextLastSeenMs)) {
    return true;
  }

  return (nextLastSeenMs - previousLastSeenMs) >= DEVICE_WRITE_MIN_INTERVAL_MS;
}

function devicePolicyAssignmentChanged(previous: DeviceRecord, nextRecord: DeviceRecord): boolean {
  return previous.activated !== nextRecord.activated
    || previous.policyId !== nextRecord.policyId
    || previous.policyLabel !== nextRecord.policyLabel
    || previous.status !== nextRecord.status
    || JSON.stringify(previous.cohorts) !== JSON.stringify(nextRecord.cohorts);
}

function buildDeviceKey(deviceId: string): string {
  return `control:device:${deviceId}`;
}

function buildInstallKey(installId: string): string {
  return `control:install:${installId}`;
}

function buildFeedbackKey(id: string): string {
  return `control:feedback:${id}`;
}

function buildUsageEventsKey(deviceId: string): string {
  return `control:usage:${deviceId}:events`;
}

function cloneJsonRecord<T extends Record<string, unknown>>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeJsonRecord(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainRecord(value) && isPlainRecord(target[key])) {
      mergeJsonRecord(target[key] as Record<string, unknown>, value);
      continue;
    }
    target[key] = cloneJsonRecord({ value }).value;
  }
}

function normalizeDeviceRecord(value: DeviceRecord | null): DeviceRecord | null {
  if (!value) return null;
  const previous = value as Partial<DeviceRecord>;
  const status = previous.status === "revoked" || previous.status === "disabled"
    ? previous.status
    : "active";
  return {
    ...value,
    activated: Boolean(previous.activated) || Boolean(previous.policyId),
    policyId: sanitizeString(previous.policyId),
    policyLabel: sanitizeString(previous.policyLabel),
    status,
    activatedAt: sanitizeString(previous.activatedAt),
  };
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readPositiveNumber(value: unknown, fallback: number): number {
  return Math.max(0, readNumber(value, fallback));
}

function readNestedRecord(source: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> | null {
  const value = source?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function resolveManagedUsagePolicy(runtimePolicy: Record<string, unknown>, record: DeviceRecord): ManagedUsagePolicy {
  const managedUsage = readNestedRecord(runtimePolicy, "managedUsage") ?? {};
  const groups = readNestedRecord(managedUsage, "groups") ?? {};
  const assignment = record.policyId ? resolvePolicyProfileAssignment(runtimePolicy, record.policyId) : null;
  const quotaProfileId = assignment?.quotaProfile ?? null;
  const quotaProfileRecord = quotaProfileId ? resolvePolicyProfile(runtimePolicy, "quota", quotaProfileId) : null;
  const groupKeys = Object.keys(groups).filter((key) => readNestedRecord(groups, key));
  const matchedCohort = (record.policyId && readNestedRecord(groups, record.policyId) ? record.policyId : null)
    ?? record.cohorts.find((cohort) => readNestedRecord(groups, cohort))
    ?? (readNestedRecord(groups, "default") ? "default" : null)
    ?? (groupKeys.length === 1 ? groupKeys[0] : null);
  const groupRecord = quotaProfileRecord ?? (matchedCohort ? readNestedRecord(groups, matchedCohort) : null) ?? {};
  return {
    estimatePerRequest: Math.max(1, readNumber(managedUsage.estimatePerRequest, 1)),
    globalMultiplier: Math.max(0, readNumber(managedUsage.globalMultiplier, 1)),
    matchedCohort,
    quotaProfileId: quotaProfileRecord ? quotaProfileId : null,
    group: {
      rolling5hLimit: readPositiveNumber(groupRecord.rolling5hLimit, 20),
      weeklyLimit: readPositiveNumber(groupRecord.weeklyLimit, 120),
      transcriptionRolling5hSeconds: readPositiveNumber(groupRecord.transcriptionRolling5hSeconds, 60 * 60),
      transcriptionWeeklySeconds: readPositiveNumber(groupRecord.transcriptionWeeklySeconds, 6 * 60 * 60),
      aiActionsRolling5hLimit: readPositiveNumber(groupRecord.aiActionsRolling5hLimit, 40),
      aiActionsWeeklyLimit: readPositiveNumber(groupRecord.aiActionsWeeklyLimit, 300),
      quotaMultiplier: Math.max(0, readNumber(groupRecord.quotaMultiplier, 1)),
    },
  };
}

function effectiveLimit(baseLimit: number, policy: ManagedUsagePolicy): number {
  return Math.max(0, Math.floor(baseLimit * policy.group.quotaMultiplier * policy.globalMultiplier));
}

function normalizeUsageEvents(value: unknown): UsageEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : null;
      const ts = sanitizeString(record?.ts);
      const units = readNumber(record?.units, 0);
      const actionUnits = readNumber(record?.actionUnits, units);
      const kind = record?.kind === "transcription" || record?.kind === "aiAction" ? record.kind : "managed";
      if (!ts || units <= 0 || !Number.isFinite(Date.parse(ts))) return null;
      return {
        id: sanitizeString(record?.id) ?? crypto.randomUUID(),
        ts,
        units,
        actionUnits: Math.max(0, actionUnits),
        kind,
      };
    })
    .filter((entry): entry is UsageEvent => Boolean(entry));
}

async function readUsageEvents(store: KvNamespaceLike, deviceId: string, nowMs: number): Promise<UsageEvent[]> {
  const oldestMs = nowMs - WEEKLY_MS;
  return normalizeUsageEvents(parseJson<unknown>(await store.get(buildUsageEventsKey(deviceId)), []))
    .filter((event) => Date.parse(event.ts) >= oldestMs)
    .sort((left, right) => left.ts.localeCompare(right.ts));
}

async function writeUsageEvents(store: KvNamespaceLike, deviceId: string, events: UsageEvent[]): Promise<void> {
  await store.put(buildUsageEventsKey(deviceId), JSON.stringify(events), {
    expirationTtl: USAGE_EVENT_TTL_SECONDS,
  });
}

async function readRecentDeviceIndex(store: KvNamespaceLike): Promise<RecentIndexEntry[]> {
  return parseJson<RecentIndexEntry[]>(await store.get(DEVICE_RECENT_INDEX_KEY), []);
}

async function writeRecentDeviceIndex(store: KvNamespaceLike, items: RecentIndexEntry[]): Promise<void> {
  await store.put(DEVICE_RECENT_INDEX_KEY, JSON.stringify(items.slice(0, DEVICE_RECENT_LIMIT)), {
    expirationTtl: DEVICE_TTL_SECONDS,
  });
}

async function indexDeviceRecord(store: KvNamespaceLike, record: DeviceRecord): Promise<void> {
  const recent = await readRecentDeviceIndex(store);
  const nextRecent = [
    { id: record.deviceId, ts: record.lastSeenAt },
    ...recent.filter((entry) => entry.id !== record.deviceId),
  ];
  await writeRecentDeviceIndex(store, nextRecent);
}

function buildUsageWindow(events: UsageEvent[], nowMs: number, windowMs: number, limit: number): ManagedUsageWindow {
  const cutoffMs = nowMs - windowMs;
  const windowEvents = events.filter((event) => Date.parse(event.ts) >= cutoffMs);
  const used = windowEvents.reduce((sum, event) => sum + event.units, 0);
  const nextRecoveryMs = windowEvents.length > 0 ? Date.parse(windowEvents[0].ts) + windowMs : nowMs;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsAt: new Date(nextRecoveryMs).toISOString(),
  };
}

function buildActionUsageWindow(events: UsageEvent[], nowMs: number, windowMs: number, limit: number): ManagedUsageWindow {
  const cutoffMs = nowMs - windowMs;
  const windowEvents = events.filter((event) => Date.parse(event.ts) >= cutoffMs);
  const used = windowEvents.reduce((sum, event) => sum + event.actionUnits, 0);
  const nextRecoveryMs = windowEvents.length > 0 ? Date.parse(windowEvents[0].ts) + windowMs : nowMs;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsAt: new Date(nextRecoveryMs).toISOString(),
  };
}

function deriveQuotaState(windows: Record<ManagedUsageWindowName, ManagedUsageWindow>): Pick<ManagedQuotaLimits, "state" | "blockedWindow"> {
  const blockedWindow = windows.rolling5h.remaining <= 0 ? "rolling5h" : windows.weekly.remaining <= 0 ? "weekly" : null;
  const lowestRemainingRatio = Math.min(
    windows.rolling5h.limit > 0 ? windows.rolling5h.remaining / windows.rolling5h.limit : 0,
    windows.weekly.limit > 0 ? windows.weekly.remaining / windows.weekly.limit : 0,
  );
  return {
    blockedWindow,
    state: blockedWindow ? (windows.rolling5h.limit === 0 || windows.weekly.limit === 0 ? "paused" : "blocked") : lowestRemainingRatio <= 0.15 ? "almost_used" : "ok",
  };
}

function buildManagedUsageLimits(record: DeviceRecord, policy: ManagedUsagePolicy, events: UsageEvent[], nowMs: number): ManagedUsageLimits {
  const windows = {
    rolling5h: buildActionUsageWindow(events, nowMs, ROLLING_5H_MS, effectiveLimit(policy.group.rolling5hLimit, policy)),
    weekly: buildActionUsageWindow(events, nowMs, WEEKLY_MS, effectiveLimit(policy.group.weeklyLimit, policy)),
  };
  const { state, blockedWindow } = deriveQuotaState(windows);
  return {
    unit: "managedUsageUnit",
    state,
    blockedWindow,
    windows,
    policy: {
      policyId: record.policyId,
      matchedCohort: policy.quotaProfileId ?? policy.matchedCohort,
      quotaMultiplier: policy.group.quotaMultiplier,
      globalMultiplier: policy.globalMultiplier,
    },
  };
}

function buildManagedQuotaLimits(
  record: DeviceRecord,
  policy: ManagedUsagePolicy,
  events: UsageEvent[],
  nowMs: number,
  options: {
    kind: UsageEvent["kind"];
    unit: ManagedQuotaLimits["unit"];
    label: string;
    rolling5hLimit: number;
    weeklyLimit: number;
  },
): ManagedQuotaLimits {
  const quotaEvents = events.filter((event) => event.kind === options.kind);
  const windows = {
    rolling5h: buildUsageWindow(quotaEvents, nowMs, ROLLING_5H_MS, effectiveLimit(options.rolling5hLimit, policy)),
    weekly: buildUsageWindow(quotaEvents, nowMs, WEEKLY_MS, effectiveLimit(options.weeklyLimit, policy)),
  };
  const { state, blockedWindow } = deriveQuotaState(windows);
  return {
    unit: options.unit,
    label: options.label,
    state,
    blockedWindow,
    windows,
    policy: {
      policyId: record.policyId,
      matchedCohort: policy.quotaProfileId ?? policy.matchedCohort,
      quotaMultiplier: policy.group.quotaMultiplier,
      globalMultiplier: policy.globalMultiplier,
    },
  };
}

async function buildDeviceLimits(store: KvNamespaceLike, runtimePolicy: Record<string, unknown>, record: DeviceRecord): Promise<DeviceLimits> {
  const nowMs = Date.now();
  const policy = resolveManagedUsagePolicy(runtimePolicy, record);
  const events = await readUsageEvents(store, record.deviceId, nowMs);
  return {
    managedUsage: buildManagedUsageLimits(record, policy, events, nowMs),
    transcription: buildManagedQuotaLimits(record, policy, events, nowMs, {
      kind: "transcription",
      unit: "audioSecond",
      label: "Transcription",
      rolling5hLimit: policy.group.transcriptionRolling5hSeconds,
      weeklyLimit: policy.group.transcriptionWeeklySeconds,
    }),
    aiActions: buildManagedQuotaLimits(record, policy, events, nowMs, {
      kind: "aiAction",
      unit: "aiAction",
      label: "AI actions",
      rolling5hLimit: policy.group.aiActionsRolling5hLimit,
      weeklyLimit: policy.group.aiActionsWeeklyLimit,
    }),
  };
}

function getRetryAfterSeconds(limits: ManagedUsageLimits): number | null {
  const blockedWindow = limits.blockedWindow;
  if (!blockedWindow) return null;
  const resetMs = Date.parse(limits.windows[blockedWindow].resetsAt);
  if (!Number.isFinite(resetMs)) return null;
  return Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
}

function getQuotaRetryAfterSeconds(limits: ManagedUsageLimits | ManagedQuotaLimits): number | null {
  const blockedWindow = limits.blockedWindow;
  if (!blockedWindow) return null;
  const resetMs = Date.parse(limits.windows[blockedWindow].resetsAt);
  if (!Number.isFinite(resetMs)) return null;
  return Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
}

function parseUsageKind(value: unknown): UsageEvent["kind"] {
  return value === "transcription" || value === "aiAction" ? value : "managed";
}

function resolveUsageEstimate(payload: ExecutionPreflightPayload, kind: UsageEvent["kind"], policy: ManagedUsagePolicy): number {
  const rawEstimate = readNumber(payload.estimate, Number.NaN);
  if (Number.isFinite(rawEstimate) && rawEstimate > 0) {
    return Math.ceil(rawEstimate);
  }
  return kind === "transcription" ? 60 : policy.estimatePerRequest;
}

function quotaWouldExceed(limits: ManagedUsageLimits | ManagedQuotaLimits, estimate: number): ManagedUsageWindowName | null {
  if (limits.windows.rolling5h.used + estimate > limits.windows.rolling5h.limit) return "rolling5h";
  if (limits.windows.weekly.used + estimate > limits.windows.weekly.limit) return "weekly";
  return null;
}

function markBlocked<T extends ManagedUsageLimits | ManagedQuotaLimits>(limits: T, blockedWindow: ManagedUsageWindowName): T {
  limits.blockedWindow = blockedWindow;
  limits.state = limits.windows[blockedWindow].limit === 0 ? "paused" : "blocked";
  return limits;
}

function applyPolicyProfiles(basePolicy: Record<string, unknown>, policyId: string | null): Record<string, unknown> {
  const next = cloneJsonRecord(basePolicy);
  if (!policyId) return next;

  const assignment = resolvePolicyProfileAssignment(basePolicy, policyId);
  if (!assignment) return next;

  const profileRefs: Array<[string, string | undefined]> = [
    ["ui", assignment.uiProfile],
    ["capabilities", assignment.capabilityProfile],
    ["llm", assignment.llmProfile],
    ["voiceRouting", assignment.voiceRoutingProfile],
    ["prompts", assignment.promptProfile],
    ["settingsDefaults", assignment.settingsDefaultsProfile],
  ];
  for (const [kind, profileId] of profileRefs) {
    const profile = profileId ? resolvePolicyProfile(basePolicy, kind, profileId) : null;
    if (profile) mergeJsonRecord(next, profile);
  }
  return next;
}

function resolvePolicyProfileAssignment(basePolicy: Record<string, unknown>, policyId: string): PolicyProfileAssignment | null {
  const configuredAssignments = readNestedRecord(basePolicy, "policyAssignments");
  const configured = configuredAssignments ? readNestedRecord(configuredAssignments, policyId) : null;
  const builtIn = BUILT_IN_POLICY_ASSIGNMENTS[policyId] ?? null;
  if (configured) {
    return {
      uiProfile: sanitizeString(configured.uiProfile) ?? builtIn?.uiProfile,
      capabilityProfile: sanitizeString(configured.capabilityProfile) ?? builtIn?.capabilityProfile,
      quotaProfile: sanitizeString(configured.quotaProfile) ?? builtIn?.quotaProfile,
      llmProfile: sanitizeString(configured.llmProfile) ?? builtIn?.llmProfile,
      voiceRoutingProfile: sanitizeString(configured.voiceRoutingProfile) ?? builtIn?.voiceRoutingProfile,
      promptProfile: sanitizeString(configured.promptProfile) ?? builtIn?.promptProfile,
      settingsDefaultsProfile: sanitizeString(configured.settingsDefaultsProfile) ?? builtIn?.settingsDefaultsProfile,
    };
  }
  return builtIn;
}

function buildAdminProfileAssignment(basePolicy: Record<string, unknown>, policyId: string | null): ControlPlaneAdminDeviceRow["profiles"] {
  const assignment = policyId ? resolvePolicyProfileAssignment(basePolicy, policyId) : null;
  return {
    uiProfile: assignment?.uiProfile ?? null,
    capabilityProfile: assignment?.capabilityProfile ?? null,
    quotaProfile: assignment?.quotaProfile ?? null,
    llmProfile: assignment?.llmProfile ?? null,
    settingsDefaultsProfile: assignment?.settingsDefaultsProfile ?? null,
  };
}

function formatPolicyLabel(policyId: string): string {
  return policyId
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ") || policyId;
}

function buildAdminPolicyOptions(basePolicy: Record<string, unknown>): ControlPlaneAdminPolicyOption[] {
  const options = new Map<string, ControlPlaneAdminPolicyOption>();
  const addOption = (policyId: string | null, source: ControlPlaneAdminPolicyOption["source"]) => {
    if (!policyId || policyId === "default" || options.has(policyId)) return;
    const builtInLabel = policyId === "alpha-basic" ? "Alpha Basic" : policyId === "alpha-full" ? "Alpha Full" : policyId === "jp" ? "JP" : null;
    options.set(policyId, {
      policyId,
      policyLabel: builtInLabel ?? formatPolicyLabel(policyId),
      source,
    });
  };

  for (const policyId of Object.keys(BUILT_IN_POLICY_ASSIGNMENTS)) {
    addOption(policyId, "built-in");
  }

  const assignments = readNestedRecord(basePolicy, "policyAssignments");
  for (const policyId of Object.keys(assignments ?? {})) {
    addOption(policyId, "assignment");
  }

  const managedUsage = readNestedRecord(basePolicy, "managedUsage");
  const groups = readNestedRecord(managedUsage, "groups");
  for (const policyId of Object.keys(groups ?? {})) {
    if (readNestedRecord(groups, policyId)) {
      addOption(policyId, "quota-group");
    }
  }

  return [...options.values()].sort((left, right) => left.policyId.localeCompare(right.policyId));
}

async function buildControlPlaneAdminDeviceRow(
  store: KvNamespaceLike,
  policy: Record<string, unknown>,
  record: DeviceRecord,
): Promise<ControlPlaneAdminDeviceRow> {
  return {
    deviceId: record.deviceId,
    installId: record.installId,
    policyId: record.policyId,
    policyLabel: record.policyLabel,
    cohorts: record.cohorts,
    status: record.status,
    lastSeenAt: record.lastSeenAt,
    profiles: buildAdminProfileAssignment(policy, record.policyId),
    limits: await buildDeviceLimits(store, policy, record),
  };
}

function resolvePolicyProfile(basePolicy: Record<string, unknown>, kind: string, profileId: string): Record<string, unknown> | null {
  const configuredProfiles = readNestedRecord(basePolicy, "policyProfiles");
  const configuredKind = configuredProfiles ? readNestedRecord(configuredProfiles, kind) : null;
  const configuredProfile = configuredKind ? readNestedRecord(configuredKind, profileId) : null;
  if (configuredProfile) return configuredProfile;
  return BUILT_IN_POLICY_PROFILES[kind]?.[profileId] ?? null;
}

export function parseExecutionMode(value: unknown): ExecutionMode | null {
  const mode = sanitizeString(value)?.toLowerCase();
  return mode === "managed" || mode === "byok" ? mode : null;
}

async function readRecentFeedbackIndex(store: KvNamespaceLike): Promise<RecentIndexEntry[]> {
  return parseJson<RecentIndexEntry[]>(await store.get(FEEDBACK_RECENT_INDEX_KEY), []);
}

async function writeRecentFeedbackIndex(store: KvNamespaceLike, items: RecentIndexEntry[]): Promise<void> {
  await store.put(FEEDBACK_RECENT_INDEX_KEY, JSON.stringify(items.slice(0, FEEDBACK_RECENT_LIMIT)), {
    expirationTtl: FEEDBACK_TTL_SECONDS,
  });
}

export async function registerDevice(
  store: KvNamespaceLike,
  payload: DeviceRegisterPayload,
  options: { authProviders?: string[]; accountId?: string | null } = {},
): Promise<DeviceRegisterResponse> {
  const installId = sanitizeString(payload.installId);
  if (!installId) {
    throw new Error("installId is required");
  }

  const existingDeviceId = sanitizeString(payload.deviceId);
  const mappedDeviceId = parseJson<string | null>(await store.get(buildInstallKey(installId)), null);
  const deviceId = existingDeviceId ?? mappedDeviceId ?? `dev_${crypto.randomUUID()}`;
  const recordKey = buildDeviceKey(deviceId);
  const previous = normalizeDeviceRecord(parseJson<DeviceRecord | null>(await store.get(recordKey), null));
  const ts = nowIso(payload.ts);
  const policyId = previous?.policyId ?? DEFAULT_POLICY_ID;
  const policyLabel = previous?.policyLabel ?? DEFAULT_POLICY_LABEL;
  const status = previous?.status ?? "active";
  const nextRecord: DeviceRecord = {
    deviceId,
    installId,
    accountId: sanitizeString(options.accountId) ?? previous?.accountId ?? null,
    activated: status === "active",
    policyId,
    policyLabel,
    status,
    activatedAt: previous?.activatedAt ?? ts,
    firstSeenAt: previous?.firstSeenAt ?? ts,
    lastSeenAt: ts,
    appVersion: sanitizeString(payload.version),
    platform: sanitizeString(payload.platform),
    arch: sanitizeString(payload.arch),
    hostname: sanitizeString(payload.hostname),
    cohorts: resolveActivationCohorts(policyId, previous?.cohorts ?? []),
    experiments: previous?.experiments ?? null,
    feedback: previous?.feedback ?? {
      enabled: true,
      sampleRate: 1,
      postErrorPrompt: true,
      postExperimentPrompt: true,
    },
  };

  if (shouldPersistDeviceRecord(previous, mappedDeviceId, nextRecord)) {
    await store.put(recordKey, JSON.stringify(nextRecord), {
      expirationTtl: DEVICE_TTL_SECONDS,
    });
    await store.put(buildInstallKey(installId), JSON.stringify(deviceId), {
      expirationTtl: DEVICE_TTL_SECONDS,
    });
    await indexDeviceRecord(store, nextRecord);
  }

  const runtimePolicy = await getRuntimePolicy(store);
  const recipePolicy = await getRecipePolicy(store);
  const isActivePolicy = nextRecord.activated && nextRecord.status === "active" && Boolean(nextRecord.policyId);
  const effectivePolicy = applyPolicyProfiles(runtimePolicy.policy as Record<string, unknown>, isActivePolicy ? nextRecord.policyId : null);
  const defaults = buildRegisterDefaultsFromRuntimePolicy(effectivePolicy as never, nextRecord.cohorts);
  defaults.recipePolicy = recipePolicy.policy;
  const limits = await buildDeviceLimits(store, effectivePolicy as Record<string, unknown>, nextRecord);

  return {
    ok: true,
    deviceId,
    activated: isActivePolicy,
    policyId: isActivePolicy ? nextRecord.policyId : null,
    policyLabel: isActivePolicy ? nextRecord.policyLabel : null,
    accountId: nextRecord.accountId,
    minVersion: null,
    auth: {
      required: false,
      providers: options.authProviders ?? [],
    },
    features: buildFeatureFlagsFromRuntimePolicy(effectivePolicy as never),
    defaults,
    cohorts: nextRecord.cohorts,
    experiments: nextRecord.experiments,
    feedback: nextRecord.feedback,
    limits,
    telemetry: {
      enabled: true,
      intervalMs: 60_000,
      batchSize: 20,
    },
    transportPolicy: buildTransportPolicyFromRuntimePolicy(runtimePolicy.policy),
  };
}

export async function activateDevice(
  store: KvNamespaceLike,
  payload: DeviceActivatePayload,
  inviteCodes: Record<string, DeviceInviteDefinition>,
): Promise<DeviceActivateResponse> {
  const inviteCode = sanitizeInviteCode(payload.inviteCode);
  if (!inviteCode) {
    throw new Error("invite_code_required");
  }

  const invite = inviteCodes[inviteCode];
  if (!invite) {
    throw new Error("invalid_invite_code");
  }

  const installId = sanitizeString(payload.installId);
  if (!installId) {
    throw new Error("installId is required");
  }

  const existingDeviceId = sanitizeString(payload.deviceId);
  const mappedDeviceId = parseJson<string | null>(await store.get(buildInstallKey(installId)), null);
  const deviceId = existingDeviceId ?? mappedDeviceId ?? `dev_${crypto.randomUUID()}`;
  const recordKey = buildDeviceKey(deviceId);
  const previous = normalizeDeviceRecord(parseJson<DeviceRecord | null>(await store.get(recordKey), null));
  const ts = nowIso(payload.ts);
  const nextRecord: DeviceRecord = {
    deviceId,
    installId,
    accountId: previous?.accountId ?? null,
    activated: true,
    policyId: invite.policyId,
    policyLabel: invite.policyLabel,
    status: "active",
    activatedAt: previous?.activatedAt ?? ts,
    firstSeenAt: previous?.firstSeenAt ?? ts,
    lastSeenAt: ts,
    appVersion: sanitizeString(payload.version),
    platform: sanitizeString(payload.platform),
    arch: sanitizeString(payload.arch),
    hostname: sanitizeString(payload.hostname),
    cohorts: resolveActivationCohorts(invite.policyId, previous?.cohorts ?? ["alpha-private"]),
    experiments: previous?.experiments ?? null,
    feedback: previous?.feedback ?? {
      enabled: true,
      sampleRate: 1,
      postErrorPrompt: true,
      postExperimentPrompt: true,
    },
  };

  await store.put(recordKey, JSON.stringify(nextRecord), {
    expirationTtl: DEVICE_TTL_SECONDS,
  });
  await store.put(buildInstallKey(installId), JSON.stringify(deviceId), {
    expirationTtl: DEVICE_TTL_SECONDS,
  });
  await indexDeviceRecord(store, nextRecord);

  return {
    ok: true,
    deviceId,
    activated: true,
    policyId: invite.policyId,
    policyLabel: invite.policyLabel,
  };
}

export async function listControlPlaneAdminDevices(
  store: KvNamespaceLike,
  options: { limit?: number | null; cursor?: string | null } = {},
): Promise<ControlPlaneAdminDeviceList> {
  const runtimePolicy = await getRuntimePolicy(store);
  const recent = await readRecentDeviceIndex(store);
  const limit = Math.min(100, Math.max(1, Number(options.limit ?? 50) || 50));
  const offset = Math.max(0, Number(options.cursor ?? 0) || 0);
  const window = recent.slice(offset, offset + limit);
  const policy = runtimePolicy.policy as Record<string, unknown>;
  const devices = (await Promise.all(window.map(async (entry) => {
    const record = normalizeDeviceRecord(parseJson<DeviceRecord | null>(await store.get(buildDeviceKey(entry.id)), null));
    if (!record) return null;
    return buildControlPlaneAdminDeviceRow(store, policy, record);
  }))).filter((entry): entry is ControlPlaneAdminDeviceRow => Boolean(entry));

  return {
    ok: true,
    source: runtimePolicy.source,
    updatedAt: runtimePolicy.updatedAt,
    policyOptions: buildAdminPolicyOptions(policy),
    devices,
    nextCursor: recent.length > offset + window.length ? String(offset + window.length) : null,
  };
}

export async function assignControlPlaneAdminDevicePolicy(
  store: KvNamespaceLike,
  payload: ControlPlaneAdminDevicePolicyPayload,
): Promise<ControlPlaneAdminDevicePolicyResponse> {
  const deviceId = sanitizeString(payload.deviceId);
  const policyId = sanitizeString(payload.policyId);
  if (!deviceId) {
    throw new Error("deviceId is required");
  }
  if (!policyId) {
    throw new Error("policyId is required");
  }

  const runtimePolicy = await getRuntimePolicy(store);
  const policy = runtimePolicy.policy as Record<string, unknown>;
  const policyOptions = buildAdminPolicyOptions(policy);
  const policyOption = policyOptions.find((option) => option.policyId === policyId);
  if (!policyOption) {
    throw new Error("unknown policyId");
  }

  const record = normalizeDeviceRecord(parseJson<DeviceRecord | null>(await store.get(buildDeviceKey(deviceId)), null));
  if (!record) {
    throw new Error("device not found");
  }

  const policyLabel = sanitizeString(payload.policyLabel) ?? policyOption.policyLabel;
  const nextRecord: DeviceRecord = {
    ...record,
    activated: record.status === "active",
    policyId,
    policyLabel,
    cohorts: resolveActivationCohorts(policyId, record.cohorts),
  };
  if (devicePolicyAssignmentChanged(record, nextRecord)) {
    await store.put(buildDeviceKey(deviceId), JSON.stringify(nextRecord), {
      expirationTtl: DEVICE_TTL_SECONDS,
    });
    await indexDeviceRecord(store, nextRecord);
  }

  return {
    ok: true,
    source: runtimePolicy.source,
    updatedAt: runtimePolicy.updatedAt,
    policyOptions,
    device: await buildControlPlaneAdminDeviceRow(store, policy, nextRecord),
  };
}

function resolveActivationCohorts(policyId: string, current: string[]): string[] {
  const base = current.filter((entry) => entry !== "alpha-full" && entry !== "alpha-basic" && entry !== "alpha-private" && entry !== "jp");
  return [...base, policyId];
}

export async function evaluateExecutionPreflight(
  store: KvNamespaceLike,
  payload: ExecutionPreflightPayload,
): Promise<ExecutionPreflightResponse> {
  const mode = parseExecutionMode(payload.mode);
  if (mode === "byok") {
    return {
      ok: true,
      allowed: true,
      reason: null,
    };
  }

  const explicitDeviceId = sanitizeString(payload.deviceId);
  const installId = sanitizeString(payload.installId);
  if (!installId) {
    return {
      ok: true,
      allowed: false,
      reason: "device_not_registered",
    };
  }

  const mappedDeviceId = parseJson<string | null>(await store.get(buildInstallKey(installId)), null);
  if (!mappedDeviceId || (explicitDeviceId && explicitDeviceId !== mappedDeviceId)) {
    return {
      ok: true,
      allowed: false,
      reason: "device_not_registered",
    };
  }

  const deviceId = mappedDeviceId;

  const record = parseJson<DeviceRecord | null>(await store.get(buildDeviceKey(deviceId)), null);
  const normalizedRecord = normalizeDeviceRecord(record);
  if (!normalizedRecord || normalizedRecord.installId !== installId || normalizedRecord.status !== "active") {
    return {
      ok: true,
      allowed: false,
      reason: "device_not_registered",
    };
  }

  const runtimePolicy = await getRuntimePolicy(store);
  const limits = await buildDeviceLimits(store, runtimePolicy.policy as Record<string, unknown>, normalizedRecord);
  const policy = resolveManagedUsagePolicy(runtimePolicy.policy as Record<string, unknown>, normalizedRecord);
  const kind = parseUsageKind(payload.usageKind);
  const estimate = resolveUsageEstimate(payload, kind, policy);
  const actionEstimate = kind === "managed" ? estimate : 1;
  const quota = kind === "transcription" ? limits.transcription : kind === "aiAction" ? limits.aiActions : limits.managedUsage;
  const blockedWindow = quotaWouldExceed(quota, estimate) ?? quotaWouldExceed(limits.managedUsage, actionEstimate);
  if (blockedWindow) {
    markBlocked(quota, blockedWindow);
    markBlocked(limits.managedUsage, blockedWindow);
    return {
      ok: true,
      allowed: false,
      reason: "quota_exceeded",
      retryAfterSeconds: getQuotaRetryAfterSeconds(quota),
      limits,
    };
  }

  const now = new Date();
  const events = await readUsageEvents(store, deviceId, now.getTime());
  events.push({ id: crypto.randomUUID(), ts: now.toISOString(), units: estimate, actionUnits: actionEstimate, kind });
  await writeUsageEvents(store, deviceId, events);
  const updatedLimits = await buildDeviceLimits(store, runtimePolicy.policy as Record<string, unknown>, normalizedRecord);

  return {
    ok: true,
    allowed: true,
    reason: null,
    retryAfterSeconds: null,
    limits: updatedLimits,
  };
}

export async function persistFeedbackEvent(store: KvNamespaceLike, input: FeedbackEvent): Promise<void> {
  await store.put(buildFeedbackKey(input.id), JSON.stringify(input), {
    expirationTtl: FEEDBACK_TTL_SECONDS,
  });

  const recent = await readRecentFeedbackIndex(store);
  const nextRecent = [{ id: input.id, ts: input.ts }, ...recent.filter((entry) => entry.id !== input.id)];
  await writeRecentFeedbackIndex(store, nextRecent);
}

export async function listFeedbackEvents(
  store: KvNamespaceLike,
  filters: FeedbackListFilters = {},
): Promise<{ items: FeedbackEvent[]; nextCursor: string | null }> {
  const recent = await readRecentFeedbackIndex(store);
  const limit = Math.min(100, Math.max(1, Number(filters.limit ?? 50) || 50));
  const offset = Math.max(0, Number(filters.cursor ?? 0) || 0);
  const window = recent.slice(offset, offset + 250);
  const events = (await Promise.all(
    window.map(async (entry) => parseJson<FeedbackEvent | null>(await store.get(buildFeedbackKey(entry.id)), null)),
  )).filter((entry): entry is FeedbackEvent => Boolean(entry))
    .sort((left, right) => right.ts.localeCompare(left.ts));

  const query = sanitizeString(filters.q)?.toLowerCase() ?? "";
  const filtered = events.filter((event) => {
    if (filters.type && event.type !== filters.type) return false;
    if (filters.source && event.source !== filters.source) return false;
    if (filters.deviceId && event.deviceId !== filters.deviceId) return false;
    if (!query) return true;
    const haystack = [
      event.type,
      event.source,
      event.message,
      event.deviceId ?? "",
      event.installId ?? "",
      event.accountId ?? "",
      JSON.stringify(event.context ?? {}),
      JSON.stringify(event.experiments ?? {}),
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  const items = filtered.slice(0, limit);
  const nextCursor = filtered.length > limit
    ? String(offset + limit)
    : (recent.length > offset + window.length ? String(offset + window.length) : null);
  return { items, nextCursor };
}

export function buildFeedbackEvent(payload: unknown): FeedbackEvent {
  const record = sanitizeRecord(payload);
  if (!record) {
    throw new Error("invalid feedback payload");
  }

  const type = sanitizeString(record.type);
  const message = sanitizeString(record.message);
  const source = sanitizeString(record.source) ?? "manual";
  if (!type || !message) {
    throw new Error("feedback type and message are required");
  }
  if (!["bug", "confusing", "idea", "love-it"].includes(type)) {
    throw new Error("invalid feedback type");
  }

  return {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    type: type as FeedbackEvent["type"],
    source,
    message,
    deviceId: sanitizeString(record.deviceId),
    installId: sanitizeString(record.installId),
    accountId: sanitizeString(record.accountId),
    appVersion: sanitizeString(record.appVersion),
    loggedIn: Boolean(record.loggedIn),
    cohorts: sanitizeStringArray(record.cohorts),
    experiments: sanitizeRecord(record.experiments),
    features: sanitizeRecord(record.features),
    context: sanitizeRecord(record.context),
  };
}
