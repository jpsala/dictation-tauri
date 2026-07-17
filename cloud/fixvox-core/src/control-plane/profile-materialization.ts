import { validateBuiltinProfileDefinition, type BuiltinProfileDefinition, type ProfileCapability, type ProfileLimitMode, type ProfileRuntimeKind, type ProfileUserControl } from "./profile-schema.ts";

export type MaterializedProfileInput = Readonly<{
  profileId: string; label: string; capabilities: readonly ProfileCapability[]; version?: number; status?: "published" | "draft" | "archived";
  runtime: Readonly<Record<ProfileRuntimeKind, Readonly<{ engineId: string; promptId?: string }>>>;
  limits: Readonly<{ mode: ProfileLimitMode; dailyUsd?: number; monthlyUsd?: number; quotaProfile?: string }>;
  userControls: Readonly<Record<string, ProfileUserControl>>;
  defaults: Readonly<Record<string, string | number | boolean>>;
}>;

/** Pure profile-version materialization; adapters resolve policy/store inputs first. */
export function materializeBuiltinProfileVersions(inputs: readonly MaterializedProfileInput[]): readonly BuiltinProfileDefinition[] {
  const profiles = inputs.map((input) => ({
    schemaVersion: 1 as const, profileId: input.profileId, label: input.label, version: input.version ?? 1, status: input.status ?? "published",
    access: { capabilities: [...input.capabilities] }, runtime: structuredClone(input.runtime), limits: { ...input.limits }, userControls: { ...input.userControls }, defaults: { ...input.defaults },
  })).sort((left, right) => left.profileId.localeCompare(right.profileId));
  for (const profile of profiles) validateBuiltinProfileDefinition(profile);
  return Object.freeze(profiles.map((profile) => Object.freeze(profile)));
}
