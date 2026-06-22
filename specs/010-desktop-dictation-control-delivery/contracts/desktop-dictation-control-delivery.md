# Contract: Desktop Dictation Control And Delivery

This contract is provider-free by default. It describes the boundaries to test before adding real desktop side effects.

## TypeScript Session Controller Contract

```ts
export type DesktopControlSource =
  | "app_button"
  | "fake_host_event"
  | "global_hotkey"
  | "tray"
  | "unknown";

export type DesktopControlAction = "start" | "stop" | "toggle" | "cancel" | "retry";

export type DesktopDictationState =
  | "idle"
  | "arming"
  | "listening"
  | "stopping"
  | "transcribing"
  | "postprocessing"
  | "reviewing"
  | "delivering"
  | "done"
  | "error"
  | "cancelled";

export type DesktopControlEvent = {
  id: string;
  source: DesktopControlSource;
  action: DesktopControlAction;
  receivedAt?: string;
  targetSnapshot?: DesktopTargetSnapshot;
};

export type DesktopDictationSession = {
  sessionId: string;
  controlSource: DesktopControlSource;
  state: DesktopDictationState;
  capture?: unknown;
  runtime?: unknown;
  delivery?: DeliveryEvidence;
  recoveryAction?: unknown;
  error?: { message: string; code?: string };
};

export interface DesktopDictationController {
  getState(): DesktopDictationSession | { state: "idle" };
  handleControl(event: DesktopControlEvent): Promise<DesktopDictationSession>;
}
```

Contract rules:

- `handleControl(toggle)` starts from idle and stops from listening.
- Any control event that would create overlap returns a recoverable non-overlap error/session state.
- `cancel` reaches a terminal cancelled state and must not deliver partial output.

## Delivery Port Contract

```ts
export type DeliveryStrategy = "review_only" | "copy" | "paste_send" | "unknown";

export type DeliveryStatus =
  | "available"
  | "copied"
  | "paste_sent"
  | "failed"
  | "uncertain"
  | "paste_observed";

export type DesktopTargetSnapshot = {
  capturedAt?: string;
  appLabel?: string;
  windowLabel?: string;
  confidence: "none" | "low" | "medium" | "high";
};

export type DeliveryRequest = {
  sessionId: string;
  text: string;
  strategy: DeliveryStrategy;
  allowDesktopSideEffects: boolean;
  targetSnapshot?: DesktopTargetSnapshot;
};

export type DeliveryEvidence = {
  status: DeliveryStatus;
  output?: string;
  strategy: DeliveryStrategy;
  message: string;
  reason?: string;
  targetBefore?: DesktopTargetSnapshot;
  targetAfter?: DesktopTargetSnapshot;
};

export interface DesktopDeliveryGateway {
  deliver(request: DeliveryRequest): Promise<DeliveryEvidence>;
}
```

Contract rules:

- Default/fake adapters must never return `paste_observed`.
- `allowDesktopSideEffects: false` must never access real clipboard, focus, or key-send APIs.
- `copy` success returns `copied`, not `paste_observed`.
- `paste_send` can return at most `paste_sent` or `uncertain` until a future observer exists.

## Host Desktop Control Boundary

Initial implementation may be TS-only with fake events. If a Tauri host boundary is added later, it should be minimal:

```rust
#[tauri::command]
fn get_desktop_control_readiness() -> DesktopControlReadiness;

#[tauri::command]
fn emit_fake_desktop_control_event(action: String) -> DesktopControlEvent;
```

A real global shortcut should not be added until fake event/controller tests are green. Once added, it should emit the same normalized event shape consumed by the renderer/controller.

## Forbidden Defaults

- No provider calls in contract tests.
- No real global shortcut registration in default tests.
- No real clipboard/focus/paste APIs in default tests.
- No `paste_observed` without a future verified observer contract.
- No React ownership of provider secrets or host side-effect internals.
