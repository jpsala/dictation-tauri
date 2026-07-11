import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  dumpSelectionTransformPresetStore,
  hydrateSelectionTransformPresetStore,
  listSelectionTransformPresetAdminItems,
  saveSelectionTransformPresetCustomization,
  selectionTransformPresetIds,
  type SelectionTransformPresetEditableFields,
  type SelectionTransformPresetStore,
} from "../selection-transform";
import type { FixvoxCloudStatus } from "./fixvox-cloud-control";

export type CloudSelectionPresetDefault = {
  id: string;
  label?: string | null;
  name?: string | null;
  promptId?: string | null;
  hotkey?: string | null;
  pickerKey?: string | null;
  provider?: string | null;
  model?: string | null;
  enabled?: boolean | null;
  confirm?: boolean | null;
  body?: string | null;
  promptContent?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nestedRecord(source: unknown, path: string[]): Record<string, unknown> | undefined {
  let current: unknown = source;
  for (const segment of path) {
    current = asRecord(current)?.[segment];
  }
  return asRecord(current);
}

export function extractCloudSelectionPresetDefaults(
  status: Pick<FixvoxCloudStatus, "policySnapshot"> | undefined,
): CloudSelectionPresetDefault[] {
  const defaults = nestedRecord(status?.policySnapshot, ["runtimePolicy", "defaults", "userSettingsDefaults", "selectionPresets"])
    ?? nestedRecord(status?.policySnapshot, ["runtimePolicy", "userSettingsDefaults", "selectionPresets"])
    ?? nestedRecord(status?.policySnapshot, ["userSettingsDefaults", "selectionPresets"]);
  const items = defaults?.items;
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      id: asString(item.id) ?? "",
      label: asString(item.label) ?? null,
      name: asString(item.name) ?? null,
      promptId: asString(item.promptId) ?? asString(item.prompt_id) ?? null,
      hotkey: asString(item.hotkey) ?? null,
      pickerKey: asString(item.pickerKey) ?? asString(item.picker_key) ?? null,
      provider: asString(item.provider) ?? null,
      model: asString(item.model) ?? null,
      enabled: typeof item.enabled === "boolean" ? item.enabled : null,
      confirm: typeof item.confirm === "boolean" ? item.confirm : null,
      body: asString(item.body) ?? null,
      promptContent: asString(item.promptContent) ?? asString(item.prompt_content) ?? null,
    }))
    .filter((item) => Boolean(item.id));
}

function cloudPresetToEditableFields(defaultPreset: CloudSelectionPresetDefault): Partial<SelectionTransformPresetEditableFields> {
  const fields: Partial<SelectionTransformPresetEditableFields> = {};
  const name = defaultPreset.label?.trim() || defaultPreset.name?.trim();
  if (name) fields.name = name;
  const body = defaultPreset.promptContent?.trim() || defaultPreset.body?.trim();
  if (body) fields.body = body;
  if (typeof defaultPreset.hotkey === "string") fields.hotkey = defaultPreset.hotkey;
  if (typeof defaultPreset.pickerKey === "string" && defaultPreset.pickerKey.trim()) fields.pickerKey = defaultPreset.pickerKey;
  if (typeof defaultPreset.provider === "string") fields.provider = defaultPreset.provider;
  if (typeof defaultPreset.model === "string") fields.model = defaultPreset.model;
  if (typeof defaultPreset.enabled === "boolean") fields.enabled = defaultPreset.enabled;
  if (typeof defaultPreset.confirm === "boolean") fields.confirm = defaultPreset.confirm;
  return fields;
}

export function applyCloudSelectionPresetDefaults(defaults: CloudSelectionPresetDefault[]): number {
  const starterIds = new Set<string>(selectionTransformPresetIds);
  let applied = 0;
  for (const defaultPreset of defaults) {
    if (!starterIds.has(defaultPreset.id)) {
      continue;
    }
    const fields = cloudPresetToEditableFields(defaultPreset);
    if (!Object.keys(fields).length) {
      continue;
    }
    saveSelectionTransformPresetCustomization(defaultPreset.id, fields);
    applied += 1;
  }
  return applied;
}

export async function loadSelectionPresetStore(): Promise<SelectionTransformPresetStore | undefined> {
  if (!isTauri()) {
    return undefined;
  }

  const store = await invoke<Partial<SelectionTransformPresetStore>>("get_selection_presets_store");
  return hydrateSelectionTransformPresetStore(store);
}

export async function saveSelectionPresetStore(): Promise<SelectionTransformPresetStore | undefined> {
  if (!isTauri()) {
    return undefined;
  }

  const store = dumpSelectionTransformPresetStore();
  const saved = await invoke<Partial<SelectionTransformPresetStore>>("save_selection_presets_store", { store });
  return hydrateSelectionTransformPresetStore(saved);
}

export async function importCloudSelectionPresetDefaults(
  defaults: CloudSelectionPresetDefault[],
): Promise<{ applied: number; total: number; store?: SelectionTransformPresetStore }> {
  const applied = applyCloudSelectionPresetDefaults(defaults);
  const store = await saveSelectionPresetStore();
  return { applied, total: listSelectionTransformPresetAdminItems().length, store };
}
