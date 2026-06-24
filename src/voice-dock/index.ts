export type {
  DockActivePreset,
  DockCommand,
  DockRecoveryState,
  DockVisualOptions,
  VoiceDockPhase,
  VoiceDockState,
} from "./types";

export type { VoiceDockProps } from "./VoiceDock";

export {
  createVoiceDockState,
  sanitizeVuBands,
} from "./visual-semantics";
export {
  createDockCompanionSnapshot,
  createEmptyDockCompanionSnapshot,
  dockCompanionCommandEvent,
  dockCompanionStateEvent,
} from "./companion-state";
export type {
  DockCompanionCommandPayload,
  DockCompanionHistoryEntry,
  DockCompanionHistoryItem,
  DockCompanionPresetId,
  DockCompanionSnapshot,
} from "./companion-state";
export { VoiceDock } from "./VoiceDock";
