import type {
  DockActivePreset,
  DockRecoveryState,
  VoiceDockState,
} from "./types";

export const dockCompanionStateEvent = "dock-companion://state";

export type DockCompanionHistoryEntry = {
  id: string;
  source: "dictation" | "selection_transform";
  textLength: number;
  deliveryEvidence?: {
    status: string;
    reason?: string;
  };
};

export type DockCompanionHistoryItem = {
  id: string;
  label: string;
  textLength: number;
  deliveryStatus: string;
};

export type DockCompanionSnapshot = {
  schemaVersion: 1;
  visible: boolean;
  status: {
    phase: VoiceDockState["phase"];
    statusText: string;
    statusDetail?: string;
  };
  recovery?: DockRecoveryState;
  history: {
    open: boolean;
    totalCount: number;
    items: DockCompanionHistoryItem[];
  };
  settings: {
    open: boolean;
    activePreset?: DockActivePreset;
  };
};

export function createDockCompanionSnapshot(input: {
  voiceDockState: VoiceDockState;
  resultHistoryOpen: boolean;
  resultHistoryEntries: readonly DockCompanionHistoryEntry[];
  settingsPanelOpen: boolean;
  activePreset?: DockActivePreset;
}): DockCompanionSnapshot {
  const historyItems = input.resultHistoryEntries
    .slice(-5)
    .reverse()
    .map((entry) => ({
      id: entry.id,
      label: entry.source.replace("_", " "),
      textLength: entry.textLength,
      deliveryStatus: entry.deliveryEvidence?.status ?? "available",
    }));

  return {
    schemaVersion: 1,
    visible: Boolean(
      input.voiceDockState.recovery ||
        input.resultHistoryOpen ||
        input.settingsPanelOpen,
    ),
    status: {
      phase: input.voiceDockState.phase,
      statusText: input.voiceDockState.statusText,
      statusDetail: input.voiceDockState.statusDetail,
    },
    recovery: input.voiceDockState.recovery,
    history: {
      open: input.resultHistoryOpen,
      totalCount: input.resultHistoryEntries.length,
      items: historyItems,
    },
    settings: {
      open: input.settingsPanelOpen,
      activePreset: input.activePreset,
    },
  };
}

export function createEmptyDockCompanionSnapshot(): DockCompanionSnapshot {
  return {
    schemaVersion: 1,
    visible: false,
    status: {
      phase: "idle",
      statusText: "Ready",
      statusDetail: "Waiting for dock state.",
    },
    history: {
      open: false,
      totalCount: 0,
      items: [],
    },
    settings: {
      open: false,
    },
  };
}
