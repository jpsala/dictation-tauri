export type {
  DockActivePreset,
  DockCommand,
  DockDragEvent,
  DockRecoveryState,
  DockVisualOptions,
  VoiceDockPhase,
  VoiceDockState,
} from "./types";

export type { VoiceDockProps } from "./VoiceDock";
export type { DockSkinDefinition, DockSkinId } from "./skins";
export {
  classicDockSkin,
  compactDockSkin,
  defaultDockSkinId,
  getDockSkin,
  normalizeDockSkinId,
  wisprFlowDockSkin,
} from "./skins";

export {
  createVoiceDockState,
  sanitizeVuBands,
} from "./visual-semantics";
export {
  createDockCompanionSnapshot,
  createDockCompanionSyncKey,
  createEmptyDockCompanionSnapshot,
  dockCompanionCommandEvent,
  dockCompanionStateEvent,
  NO_SPEECH_NOTICE_TIMEOUT_MS,
} from "./companion-state";
export type {
  DockCompanionCommandPayload,
  DockCompanionHistoryEntry,
  DockCompanionHistoryItem,
  DockCompanionPresetId,
  DockCompanionSnapshot,
} from "./companion-state";
export { VoiceDock } from "./VoiceDock";
