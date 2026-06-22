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
  AppDesktopRuntimeResult,
  AppSessionControllerFacade,
  AppSessionRuntimeOptions,
} from "./app-session";
export type {
  FakeHostControlEventOptions,
  FakeHostControlEventSource,
  FakeHostControlSourceOptions,
} from "./fake-host-control";
export type {
  DesktopCaptureGateway,
  DesktopDictationControllerOptions,
  DesktopRuntimeGateway,
  DesktopRuntimeResult,
} from "./controller";

export {
  createAppControlEvent,
  createAppSessionControllerFacade,
  createCaptureGatewayControllerAdapter,
  createHostRuntimeControllerAdapter,
  getAppSessionCaptureResult,
  getAppSessionSummary,
  isAppDesktopRuntimeResult,
} from "./app-session";

export {
  DesktopDictationController,
  copyManuallyRecovery,
  dismissRecovery,
  recordAgainRecovery,
  retryFromClipRecovery,
} from "./controller";

export {
  createFakeHostControlEventSource,
  createFakeHostControlReadiness,
} from "./fake-host-control";

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
