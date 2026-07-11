export type {
  FixtureTransformPresetId,
  HostSelectionCaptureRoute,
  LatestResult,
  LatestResultSource,
  SelectionCaptureOutcome,
  SelectionCaptureStatus,
  SelectionContext,
  SelectionContextInput,
  SelectionContextSource,
  SelectionRoute,
  SelectionTransformAction,
  SelectionTransformEvidence,
  SelectionTransformMode,
  SelectionTransformRequest,
  SelectionTransformResult,
} from "./types";
export { selectionCaptureStatuses } from "./types";
export {
  hasSelectedText,
  normalizeSelectedText,
  normalizeSelectionContext,
  redactTargetSnapshot,
} from "./context";
export { classifySelectionRoute } from "./routing";
export {
  hostSelectionCaptureCommand,
  hostSelectionCaptureForTargetCommand,
  hostSelectionCaptureRoute,
  routeSelectionCaptureOutcome,
} from "./host-capture-boundary";
export {
  isSupportedFixturePreset,
  runFixtureSelectionTransform,
} from "./fixture-transform";
export {
  transformSelectedTextCommand,
  transformSelectedTextWithHost,
  type HostSelectionTransformRequest,
  type HostSelectionTransformResponse,
} from "./managed-transform";
export {
  latestResultFromPipelineSummary,
  latestResultFromSelectionTransform,
} from "./latest-result";
export {
  buildPresetStructuredInput,
  createSelectionTransformCustomPreset,
  deleteSelectionTransformCustomPreset,
  dumpSelectionTransformPresetStore,
  getSelectionTransformPreset,
  hydrateSelectionTransformPresetStore,
  isSelectionTransformPresetId,
  listSelectionTransformPresetAdminItems,
  listSelectionTransformPresets,
  resetSelectionTransformPresetCustomization,
  saveSelectionTransformPresetCustomization,
  selectionTransformInstructionForPreset,
  selectionTransformPresetDisplayName,
  selectionTransformPresetIdFromPickerKey,
  selectionTransformPresetIds,
  selectionTransformPresetPickerKey,
  type StarterSelectionTransformPresetId,
  type SelectionTransformPresetAdminItem,
  type SelectionTransformPresetDefinition,
  type SelectionTransformPresetEditableFields,
  type SelectionTransformPresetId,
  type SelectionTransformPresetStore,
} from "./presets";
