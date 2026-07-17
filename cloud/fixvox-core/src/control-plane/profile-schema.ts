import { BUILTIN_ENGINES, BUILTIN_PROMPTS } from "./catalog.ts";

export type ProfileRuntimeKind = "transcription" | "postprocess" | "selectionTransform";
export type ProfileCapability = "translate" | "dictation" | "postprocess" | "selection_transform" | "assistant_actions" | "custom_prompts" | "advanced_settings" | "debug_tools" | "managed_stt" | "managed_llm" | "admin_settings";
export type ProfileUserControl = "hidden" | "visible-locked" | "editable";
export type ProfileLimitMode = "block" | "warn";

export type BuiltinProfileDefinition = Readonly<{
  schemaVersion: 1;
  profileId: string;
  label: string;
  version: number;
  status: "published" | "draft" | "archived";
  access: Readonly<{ capabilities: readonly ProfileCapability[] }>;
  runtime: Readonly<Record<ProfileRuntimeKind, Readonly<{ engineId: string; promptId?: string }>>>;
  limits: Readonly<{ mode: ProfileLimitMode; dailyUsd?: number; monthlyUsd?: number; quotaProfile?: string }>;
  userControls: Readonly<Record<string, ProfileUserControl>>;
  defaults: Readonly<Record<string, string | number | boolean>>;
}>;

export const LEGACY_PROFILE_DEFAULTS = Object.freeze({
  "appearance.themeId": "github-light", "appearance.dockSkin": 4,
  "general.onboardingDone": false, "general.showDockOnStartup": true,
  "general.startWithWindows": false, "general.preferredSurface": "alpha",
  "general.uiLanguage": "system", "transcript.language": "",
  "voice.muteOutputDuringRecording": true, "voice.pressEnterAfterPaste": false,
  "voice.showQuickChatReasoning": true, "voice.showPresetReasoning": false,
});

const CAPABILITIES = new Set<ProfileCapability>(["translate", "dictation", "postprocess", "selection_transform", "assistant_actions", "custom_prompts", "advanced_settings", "debug_tools", "managed_stt", "managed_llm", "admin_settings"]);
const engineIds = new Set(BUILTIN_ENGINES.map((item) => item.id));
const promptIds = new Set(BUILTIN_PROMPTS.map((item) => item.id));

export function materializeProfileDefaults(overrides: Readonly<Record<string, string | number | boolean>> = {}): Readonly<Record<string, string | number | boolean>> {
  return Object.freeze({ ...LEGACY_PROFILE_DEFAULTS, ...overrides });
}

export function validateBuiltinProfileDefinition(profile: BuiltinProfileDefinition): void {
  if (!profile.profileId || !profile.label) throw new Error("builtin_profile_identity_required");
  for (const capability of profile.access.capabilities) if (!CAPABILITIES.has(capability)) throw new Error(`builtin_profile_unknown_capability:${capability}`);
  for (const kind of ["transcription", "postprocess", "selectionTransform"] as const) {
    const operation = profile.runtime[kind];
    if (!operation || !engineIds.has(operation.engineId)) throw new Error(`builtin_profile_unknown_engine:${kind}`);
    if (operation.promptId !== undefined && !promptIds.has(operation.promptId)) throw new Error(`builtin_profile_unknown_prompt:${kind}`);
  }
  for (const amount of [profile.limits.dailyUsd, profile.limits.monthlyUsd]) if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) throw new Error("builtin_profile_invalid_limit");
  if (JSON.stringify(profile).match(/(?:secret|token|api[_-]?key|oauth)/i)) throw new Error("builtin_profile_sensitive_field");
}
