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
  hostSelectionCaptureRoute,
  routeSelectionCaptureOutcome,
} from "./host-capture-boundary";
export {
  isSupportedFixturePreset,
  runFixtureSelectionTransform,
} from "./fixture-transform";
export {
  latestResultFromPipelineSummary,
  latestResultFromSelectionTransform,
} from "./latest-result";
