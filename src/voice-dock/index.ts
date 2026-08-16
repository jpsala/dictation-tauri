export type {
  DockActivePreset,
  DockCommand,
  DockDragEvent,
  DockRecoveryState,
  DockVisualOptions,
  VoiceDockPhase,
  VoiceDockState,
} from "./types";

export {
  createVoiceDockModeMetadata,
  VoiceDock,
} from "./VoiceDock";
export type {
  VoiceDockMode,
  VoiceDockModeMetadata,
  VoiceDockProps,
} from "./VoiceDock";
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
  dockCompanionCommandAckEvent,
  dockCompanionCommandEvent,
  dockCompanionStateEvent,
  dockTeachCorrectionEvent,
  NO_SPEECH_NOTICE_TIMEOUT_MS,
} from "./companion-state";
export type {
  DockCompanionCommandPayload,
  DockCompanionCommandEnvelope,
  DockCompanionCommandAck,
  DockCompanionHistoryEntry,
  DockCompanionHistoryItem,
  DockCompanionPresetId,
  DockCompanionSnapshot,
} from "./companion-state";
export type { TeachCorrectionCommandPayload } from "./companion-state";
export { VocabularyChoiceSurface } from "./VocabularyChoiceSurface";
export type { VocabularyChoiceSurfaceProps } from "./VocabularyChoiceSurface";
