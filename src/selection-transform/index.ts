export type {
  FixtureTransformPresetId,
  LatestResult,
  LatestResultSource,
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
export {
  hasSelectedText,
  normalizeSelectedText,
  normalizeSelectionContext,
  redactTargetSnapshot,
} from "./context";
export { classifySelectionRoute } from "./routing";
export {
  isSupportedFixturePreset,
  runFixtureSelectionTransform,
} from "./fixture-transform";
export {
  latestResultFromPipelineSummary,
  latestResultFromSelectionTransform,
} from "./latest-result";
