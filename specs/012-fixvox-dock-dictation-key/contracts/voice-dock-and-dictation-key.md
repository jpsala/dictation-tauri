# Contract: Voice Dock And Dictation Key

This contract describes renderer-safe types and host event payloads for the Fixvox-like dock and dictation key. It is intentionally provider-free.

## Renderer Contract

```ts
export type VoiceDockPhase =
  | "idle"
  | "arming"
  | "recording"
  | "processing"
  | "review"
  | "failed"
  | "cancelled"
  | "uncertain";

export type DockCommand =
  | "start"
  | "stop"
  | "stop_submit"
  | "cancel"
  | "retry"
  | "copy"
  | "paste_last_safe";

export type DockRecoveryState = {
  kind: "copy" | "retry" | "record_again" | "setup" | "uncertain";
  title: string;
  message: string;
  primaryAction?: DockCommand;
  secondaryAction?: DockCommand;
};

export type VoiceDockState = {
  phase: VoiceDockPhase;
  statusText: string;
  statusDetail?: string;
  ariaLabel: string;
  active: boolean;
  busy: boolean;
  canStart: boolean;
  canStop: boolean;
  canCancel: boolean;
  canStopSubmit: boolean;
  canCopy: boolean;
  canRetry: boolean;
  canPasteLastSafe: boolean;
  vuLevel: number;
  vuBands: number[];
  recovery?: DockRecoveryState;
};
```

### Dock Rules

- `VoiceDockState` is derived from existing controller/app/session state.
- The dock may show a transcript/review locally, but logs/docs must not print raw transcript content.
- `paste_last_safe` is evidence/UI-only until a later paste automation spec approves real key sending.
- The dock must never render `paste_observed` in this spec.

## Dictation Key Contract

```ts
export type DictationKeyEventKind = "pressed" | "released" | "cancel";

export type DictationKeyEvent = {
  kind: DictationKeyEventKind;
  shortcut: string;
  source: "fake_host_event" | "global_hotkey" | "dock_button";
  receivedAt: string;
  eventId?: string;
};

export type DictationKeyState = {
  status: "idle" | "pressing" | "hold_recording" | "latched_recording" | "stopping";
  pressedAt?: string;
  activeSessionId?: string;
  lastEventId?: string;
};

export type DictationKeyDecision =
  | { action: "start"; latchMode: "hold" | "toggle" }
  | { action: "stop"; reason: "hold_release" | "toggle_press" | "stop_submit" }
  | { action: "cancel"; reason: "escape" }
  | { action: "ignore"; reason: string }
  | { action: "defer_stop_until_started" };
```

### Dictation Key Rules

- Short press below the configured threshold resolves to toggle/latched behavior.
- Hold longer than the threshold resolves to stop on release.
- Press while latched recording resolves to stop.
- Release that arrives while start is in flight may resolve to `defer_stop_until_started`.
- Duplicate event ids resolve to `ignore`.
- Resolver output is translated into existing `DesktopControlEvent` actions.

## Tauri Host Payload

The current host payload is toggle-only. This spec moves it toward lifecycle events while preserving the existing shortcut as a fallback.

```rust
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopControlHotkeyPayload {
    pub source: &'static str,
    pub action: &'static str, // "pressed" | "released" | "cancel" during this spec
    pub shortcut: &'static str,
}
```

### Host Rules

- Default tests must not register real hotkeys.
- Rust compile checks must pass on non-desktop targets through existing cfg guards.
- `Alt+Space` must not become default until a gated smoke proves it does not open the Windows system menu and supports press/release semantics robustly.
