import {
  buildDefaultRuntimePolicy,
  buildFeatureFlagsFromRuntimePolicy,
  buildRegisterDefaultsFromRuntimePolicy,
  buildTransportPolicyFromRuntimePolicy,
} from "../../fixvox-proxy/src/runtime-policy-store.ts";
import { buildDefaultRecipePolicy } from "../../fixvox-proxy/src/recipe-policy-store.ts";

type RecordValue = Record<string, unknown>;
export type EffectiveProfileProjectionInput = { profileId: string; label: string; version: number; source: string; definition: RecordValue };

function record(value: unknown): RecordValue { return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {}; }
function isRecord(value: unknown): value is RecordValue { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function merge(base: RecordValue, override: RecordValue): RecordValue {
  const result: RecordValue = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    result[key] = isRecord(value) && isRecord(result[key]) ? merge(result[key] as RecordValue, value) : structuredClone(value);
  }
  return result;
}
function policy(profile: EffectiveProfileProjectionInput): RecordValue {
  return merge(buildDefaultRuntimePolicy() as RecordValue, merge({ features: {
    "assistant.mode": false, "assistant.quickChat": false, byok: false, historyRetry: false,
    presetEditing: false, "presets.edit": false, "presets.run": false, "results.history": false,
    telemetryInspector: false, voiceRouting: false,
  } }, record(profile.definition.runtimePolicy)));
}
function windows() { return { rolling5h: { used: 0, limit: 20, remaining: 20, resetsAt: new Date(0).toISOString() }, weekly: { used: 0, limit: 120, remaining: 120, resetsAt: new Date(0).toISOString() } }; }
function limits(profile: EffectiveProfileProjectionInput) {
  const quota = record(profile.definition.quota);
  const unlimited = quota.mode === "unlimited" || quota.profile === "pro-unlimited";
  const state = unlimited ? "unlimited" : "ok";
  const quotaPolicy = { policyId: profile.profileId, matchedCohort: profile.profileId, quotaMultiplier: 1, globalMultiplier: 1 };
  const entry = (unit: string, label?: string) => ({ ...(label ? { label } : {}), unit, state, blockedWindow: null, windows: windows(), policy: quotaPolicy });
  return { managedUsage: entry("managedUsageUnit"), transcription: entry("audioSecond", "Transcription"), aiActions: entry("aiAction", "AI actions") };
}
function engine(profile: EffectiveProfileProjectionInput, kind: string) {
  const configured = record(record(profile.definition.engines)[kind]);
  return { id: String(configured.id ?? `${profile.profileId}-${kind}`), kind, label: String(configured.label ?? kind), provider: String(configured.provider ?? "groq"), model: String(configured.model ?? "whisper-large-v3-turbo"), tier: String(configured.tier ?? "default"), promptKey: String(configured.promptKey ?? "none"), promptSummary: String(configured.promptSummary ?? ""), notes: String(configured.notes ?? ""), source: "profile" };
}

export function buildDeviceRegisterProjection(input: { deviceId: string; profile: EffectiveProfileProjectionInput; accountId?: string | null }) {
  const runtimePolicy = policy(input.profile);
  const defaults = buildRegisterDefaultsFromRuntimePolicy(runtimePolicy as never, [input.profile.profileId]) as RecordValue;
  defaults.recipePolicy = buildDefaultRecipePolicy() as RecordValue;
  defaults.profileUserControls = { "appearance.dockSkin": "default", "appearance.themeId": "default", "general.onboardingDone": "default", "general.preferredSurface": "default", "general.showDockOnStartup": "default", "general.startWithWindows": "default", "general.uiLanguage": "default", "hotkeys.pasteLast": "default", "hotkeys.picker": "default", "hotkeys.pushToTalk": "default", "hotkeys.quickChat": "default", "hotkeys.resultHistory": "default", "hotkeys.stopAndSubmit": "default", "hotkeys.toggleAssistantMode": "default", "hotkeys.togglePressEnterAfterPaste": "default", "hotkeys.voiceRecord": "default", "transcript.language": "default", "voice.assistantModeToggleWords": "default", "voice.assistantWakeWords": "default", "voice.commandWakeWords": "default", "voice.muteOutputDuringRecording": "default", "voice.pressEnterAfterPaste": "default", "voice.showPresetReasoning": "default", "voice.showQuickChatReasoning": "default", ...record(input.profile.definition.userControls) };
  return {
    ok: true, deviceId: input.deviceId, activated: true, policyId: input.profile.profileId, policyLabel: input.profile.label,
    accountId: null, minVersion: null,
    auth: input.accountId ? { required: false, providers: ["google"], accessMode: "signed_in", provider: "google", userId: "user redacted", userRedacted: "user redacted", groupLabel: input.profile.label, policyTemplateId: input.profile.profileId, policyTemplateLabel: input.profile.label, capabilities: input.profile.definition.capabilities ?? [], redacted: true } : { required: false, providers: ["google"], accessMode: "anonymous", redacted: true },
    features: buildFeatureFlagsFromRuntimePolicy(runtimePolicy as never), defaults, cohorts: [input.profile.profileId], experiments: null,
    feedback: { enabled: true, sampleRate: 1, postErrorPrompt: true, postExperimentPrompt: true }, limits: limits(input.profile),
    telemetry: { enabled: true, intervalMs: 60_000, batchSize: 20 }, transportPolicy: buildTransportPolicyFromRuntimePolicy(runtimePolicy as never),
  };
}

export function buildExecutionPreflightProjection(input: { allowed: boolean; reason: string | null; profile: EffectiveProfileProjectionInput; usageKind?: string }) {
  const selectedKind = input.usageKind === "transcription" ? "transcription" : input.usageKind === "aiAction" ? "selectionTransform" : "postprocess";
  const byKind = { transcription: engine(input.profile, "transcription"), postprocess: engine(input.profile, "postprocess"), selectionTransform: engine(input.profile, "selectionTransform") };
  return { ok: true, allowed: input.allowed, reason: input.reason, retryAfterSeconds: input.allowed ? null : 1,
    limits: limits(input.profile), profile: { policyId: input.profile.profileId, policyLabel: input.profile.label, policySource: input.profile.source, accountHandle: null, accountBudget: null, groups: [], matchedGroup: null },
    engines: { byKind, selectedKind, selected: byKind[selectedKind] },
  };
}
