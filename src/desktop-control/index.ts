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
export type {
  DesktopFailureKind,
  DesktopFailureRecovery,
  DesktopFailureRecoveryInput,
} from "./recovery";
export type {
  TauriGlobalHotkeyHandler,
  TauriGlobalHotkeyListenerOptions,
  TauriGlobalHotkeyPayload,
} from "./tauri-host-control";
export type {
  DictationKeyDecision,
  DictationKeyEvent,
  DictationKeyEventKind,
  DictationKeyResolverOptions,
  DictationKeyResolution,
  DictationKeyState,
} from "./dictation-key";

export {
  createAppControlEvent,
  createAppSessionControllerFacade,
  createCaptureGatewayControllerAdapter,
  createHostRuntimeControllerAdapter,
  getAppSessionCaptureResult,
  getAppSessionSummary,
  isAppDesktopRuntimeResult,
} from "./app-session";

export { DesktopDictationController } from "./controller";

export {
  copyManuallyRecovery,
  createFailedDeliveryEvidence,
  dismissRecovery,
  isManagedPreflightFailure,
  mapDesktopFailureToRecovery,
  recordAgainRecovery,
  redactDesktopFailureMessage,
  retryFromClipRecovery,
} from "./recovery";

export {
  createFakeHostControlEventSource,
  createFakeHostControlReadiness,
} from "./fake-host-control";

export {
  createDictationKeyEventFromTauriHotkey,
  listenForTauriGlobalHotkey,
  tauriGlobalHotkeyEventName,
  tauriGlobalHotkeyShortcut,
} from "./tauri-host-control";

export {
  createInitialDictationKeyState,
  dictationKeyDecisionToControlAction,
  markDictationKeyStarted,
  resetDictationKeyState,
  resolveDictationKeyEvent,
} from "./dictation-key";

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
