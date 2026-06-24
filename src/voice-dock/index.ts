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
export { VoiceDock } from "./VoiceDock";
