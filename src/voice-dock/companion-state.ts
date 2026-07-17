import type { AssistantSurface } from "../pipeline/types";
import type { SelectionTransformPresetId } from "../selection-transform";
import type {
  DockActivePreset,
  DockRecoveryState,
  VoiceDockState,
} from "./types";

export const dockCompanionStateEvent = "dock-companion://state";
export const dockCompanionCommandEvent = "dock-companion://command";

export type DockCompanionPresetId = SelectionTransformPresetId;

export type DockCompanionCommandPayload =
  | {
      source: "dock_companion";
      command: "copy" | "paste_last_safe" | "retry" | "close_companion" | "clear_result_history";
    }
  | {
      source: "dock_companion";
      command: "dismiss_recovery" | "dismiss_result_history" | "dismiss_settings" | "dismiss_assistant";
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
    }
  | {
      source: "dock_companion";
      command: "send_assistant_message";
      message: string;
    };

export type DockCompanionHistoryEntry = {
  id: string;
  source: "dictation" | "selection_transform" | "assistant";
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

export type DockCompanionAssistantMessage = {
  id: string;
  textLength: number;
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
    presetPickerMode?: "selection" | "dictation";
  };
  assistant: {
    open: boolean;
    runId?: string;
    message?: string;
    surface?: AssistantSurface;
    messages: DockCompanionAssistantMessage[];
  };
};

export function createDockCompanionSnapshot(input: {
  voiceDockState: VoiceDockState;
  resultHistoryOpen: boolean;
  resultHistoryEntries: readonly DockCompanionHistoryEntry[];
  settingsPanelOpen: boolean;
  activePreset?: DockActivePreset;
  presetPickerMode?: "selection" | "dictation";
  assistant?: {
    open: boolean;
    runId?: string;
    message?: string;
    surface?: AssistantSurface;
  };
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
  const assistantMessages = createAssistantMessages(input.resultHistoryEntries, input.assistant);

  return {
    schemaVersion: 1,
    visible: Boolean(
      input.voiceDockState.recovery ||
        input.resultHistoryOpen ||
        input.settingsPanelOpen ||
        input.assistant?.open,
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
      presetPickerMode: input.presetPickerMode,
    },
    assistant: {
      open: input.assistant?.open ?? false,
      runId: input.assistant?.runId,
      message: input.assistant?.message,
      surface: input.assistant?.surface,
      messages: assistantMessages,
    },
  };
}

function createAssistantMessages(
  entries: readonly DockCompanionHistoryEntry[],
  current: { runId?: string; message?: string } | undefined,
): DockCompanionAssistantMessage[] {
  const messages = entries
    .filter((entry) => entry.source === "assistant" && entry.text)
    .slice(-10)
    .reverse()
    .map((entry) => createAssistantMessage(entry.id, entry.text ?? "", entry.textLength));

  const currentMessage = current?.message?.trim();
  if (current?.runId && currentMessage && !messages.some((message) => message.id.includes(current.runId ?? ""))) {
    messages.unshift(createAssistantMessage(`${current.runId}:assistant-current`, currentMessage, currentMessage.length));
  }

  return messages;
}

function createAssistantMessage(
  id: string,
  text: string,
  textLength: number,
): DockCompanionAssistantMessage {
  const normalizedText = normalizeHistoryPreview(text);
  return {
    id,
    textLength,
    textPreview: truncateHistoryPreview(normalizedText, 72),
    hoverPreview: truncateHistoryPreview(normalizedText, 220),
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
    assistant: {
      open: false,
      messages: [],
    },
  };
}
