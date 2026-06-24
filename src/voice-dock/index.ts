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
  dockCompanionStateEvent,
} from "./companion-state";
export type {
  DockCompanionHistoryEntry,
  DockCompanionHistoryItem,
  DockCompanionSnapshot,
} from "./companion-state";
export { VoiceDock } from "./VoiceDock";
