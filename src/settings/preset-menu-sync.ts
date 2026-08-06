import {
  listSelectionTransformPresets,
  type SelectionTransformPresetDefinition,
} from "../selection-transform";

export const hostPresetMenuSnapshotSchemaVersion = 1 as const;
export const hostPresetMenuMaxItems = 64 as const;
export const hostPresetMenuMaxIdChars = 128 as const;
export const hostPresetMenuMaxNameChars = 128 as const;
export const hostPresetMenuSyncCommand = "sync_host_preset_menu_snapshot";
export const hostPresetMenuSyncEventName = "desktop-control://preset-menu-sync";

export type HostPresetMenuItem = {
  id: string;
  name: string;
};

export type HostPresetMenuSnapshot = {
  schemaVersion: typeof hostPresetMenuSnapshotSchemaVersion;
  presets: HostPresetMenuItem[];
  activePresetId?: string | null;
};

export type HostPresetMenuSyncResult = {
  snapshot: HostPresetMenuSnapshot;
  activePresetCleared: boolean;
  feedbackMessage?: string;
};

export type PresetMenuCollectionItem = Pick<SelectionTransformPresetDefinition, "id" | "name"> & {
  enabled?: boolean;
};

export type HostPresetMenuCollectionAdapter = {
  listEnabledPresets(): readonly PresetMenuCollectionItem[];
};

export function createPresetMenuCollectionAdapter(
  listPresets: () => readonly PresetMenuCollectionItem[],
): HostPresetMenuCollectionAdapter {
  return {
    listEnabledPresets: listPresets,
  };
}

export function createLocalPresetMenuCollectionAdapter(): HostPresetMenuCollectionAdapter {
  return createPresetMenuCollectionAdapter(() => listSelectionTransformPresets());
}

// Alias kept intentionally small so the cloud collection adapter can replace the local one
// without changing tray/dock menu construction.
export const createLocalPresetMenuAdapter = createLocalPresetMenuCollectionAdapter;

function normalizePresetMenuItems(
  items: readonly PresetMenuCollectionItem[],
): HostPresetMenuItem[] {
  const codePointLength = (value: string) => Array.from(value).length;
  const seenIds = new Set<string>();
  const normalized: HostPresetMenuItem[] = [];
  for (const item of items) {
    const id = item.id.trim();
    if (
      !id ||
      item.enabled === false ||
      codePointLength(id) > hostPresetMenuMaxIdChars ||
      seenIds.has(id)
    ) {
      continue;
    }

    const name = item.name.trim();
    if (codePointLength(name) > hostPresetMenuMaxNameChars) {
      continue;
    }

    seenIds.add(id);
    normalized.push({
      id,
      name: name || id,
    });
    if (normalized.length >= hostPresetMenuMaxItems) {
      break;
    }
  }
  return normalized;
}

export function createHostPresetMenuSnapshot(
  adapter: HostPresetMenuCollectionAdapter = createLocalPresetMenuCollectionAdapter(),
  activePresetId?: string | null,
): HostPresetMenuSnapshot {
  const normalizedActivePresetId = typeof activePresetId === "string"
    ? activePresetId.trim() || null
    : null;

  return {
    schemaVersion: hostPresetMenuSnapshotSchemaVersion,
    presets: normalizePresetMenuItems(adapter.listEnabledPresets()),
    // Keep a stale ID in the contract so the host can clear it atomically and report feedback.
    activePresetId: normalizedActivePresetId,
  };
}

export const createHostOwnedPresetMenuSnapshot = createHostPresetMenuSnapshot;

export function normalizeHostPresetMenuSnapshot(
  snapshot: HostPresetMenuSnapshot,
): HostPresetMenuSnapshot {
  const presets = normalizePresetMenuItems(snapshot.presets);
  const activePresetId = typeof snapshot.activePresetId === "string"
    ? snapshot.activePresetId.trim() || null
    : null;

  return {
    schemaVersion: hostPresetMenuSnapshotSchemaVersion,
    presets,
    activePresetId,
  };
}

type HostPresetMenuInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

export type SyncHostPresetMenuOptions = {
  activePresetId?: string | null;
  adapter?: HostPresetMenuCollectionAdapter;
  invokeImpl?: HostPresetMenuInvoke;
};

export async function syncHostPresetMenuSnapshot(
  options: SyncHostPresetMenuOptions = {},
): Promise<HostPresetMenuSyncResult | undefined> {
  const snapshot = createHostPresetMenuSnapshot(
    options.adapter ?? createLocalPresetMenuCollectionAdapter(),
    options.activePresetId,
  );
  if (options.invokeImpl) {
    return await options.invokeImpl(hostPresetMenuSyncCommand, { snapshot }) as HostPresetMenuSyncResult;
  }

  const tauriApi = await import("@tauri-apps/api/core");
  if (!tauriApi.isTauri()) {
    return undefined;
  }
  return await tauriApi.invoke(hostPresetMenuSyncCommand, { snapshot }) as HostPresetMenuSyncResult;
}

export const syncNativePresetMenu = syncHostPresetMenuSnapshot;
