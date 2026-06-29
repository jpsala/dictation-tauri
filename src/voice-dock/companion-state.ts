import type {
  DockActivePreset,
  DockRecoveryState,
  VoiceDockState,
} from "./types";

export const dockCompanionStateEvent = "dock-companion://state";
export const dockCompanionCommandEvent = "dock-companion://command";

export type DockCompanionPresetId = "rewrite" | "shorten" | "bulletize";

export type DockCompanionCommandPayload =
  | {
      source: "dock_companion";
      command: "copy" | "paste_last_safe" | "retry" | "close_companion";
    }
  | {
      source: "dock_companion";
      command: "dismiss_recovery" | "dismiss_result_history" | "dismiss_settings";
    }
  | {
      source: "dock_companion";
      command: "select_history_entry";
      entryId: string;
    }
  | {
      source: "dock_companion";
      command: "select_preset";
      presetId: DockCompanionPresetId;
    }
  | {
      source: "dock_companion";
      command: "clear_preset";
    };

export type DockCompanionHistoryEntry = {
  id: string;
  source: "dictation" | "selection_transform";
  text?: string;
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
  textPreview: string;
  hoverPreview: string;
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
    .slice(-20)
    .reverse()
    .map((entry) => {
      const normalizedText = entry.text ? normalizeHistoryPreview(entry.text) : "";

      return {
        id: entry.id,
        label: entry.source.replace("_", " "),
        textLength: entry.textLength,
        deliveryStatus: entry.deliveryEvidence?.status ?? "available",
        textPreview: truncateHistoryPreview(normalizedText, 54),
        hoverPreview: truncateHistoryPreview(normalizedText, 180),
      };
    });

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

function normalizeHistoryPreview(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncateHistoryPreview(text: string, maxLength: number): string {
  if (!text) {
    return "No preview available";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function createDockCompanionSyncKey(
  snapshot: DockCompanionSnapshot,
): string {
  if (!snapshot.visible) {
    return "hidden";
  }

  return JSON.stringify(snapshot);
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
