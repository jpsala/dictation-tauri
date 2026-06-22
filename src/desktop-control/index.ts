export type {
  ActiveDesktopDictationState,
  DesktopControlAction,
  DesktopControlDedupeDecision,
  DesktopControlEvent,
  DesktopControlReadiness,
  DesktopControlSource,
  DesktopControlTransitionDecision,
  DesktopDictationController as DesktopDictationControllerContract,
  DesktopDictationError,
  DesktopDictationSession,
  DesktopDictationState,
  DesktopRecoveryAction,
  IdleDesktopDictationState,
  TerminalDesktopDictationState,
} from "./types";
export type {
  DesktopCaptureGateway,
  DesktopDictationControllerOptions,
  DesktopRuntimeGateway,
  DesktopRuntimeResult,
} from "./controller";

export {
  DesktopDictationController,
  copyManuallyRecovery,
  dismissRecovery,
  recordAgainRecovery,
  retryFromClipRecovery,
} from "./controller";

export {
  activeDesktopDictationStates,
  createDesktopControlEvent,
  createUnavailableDesktopControlReadiness,
  desktopControlActions,
  desktopControlSources,
  desktopDictationStates,
  isActiveDesktopDictationState,
  isTerminalDesktopDictationState,
  rememberDesktopControlEvent,
  resolveDesktopControlTransition,
  terminalDesktopDictationStates,
} from "./types";
