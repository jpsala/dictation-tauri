# Data Model: Fixvox-Like Voice Dock And Dictation Key

## VoiceDockPhase

Represents the compact dock's visible phase.

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
```

Rules:

- `idle`: launcher/mic only, no stop/cancel controls.
- `arming`: capture is starting; stop/cancel may be visible if cancellable.
- `recording`: live VU/dots visible; stop/cancel controls visible.
- `processing`: compact status chip visible; controls hidden unless cancel is supported by current controller state.
- `review`: transcript/output exists; copy/recovery actions visible.
- `failed`: error copy plus retry/copy/record-again when available.
- `cancelled`: honest cancellation state and record-again path.
- `uncertain`: output exists but delivery was not proven; copy/manual recovery visible.

## VoiceDockState

Derived renderer state. It should be computed from existing capture/session/pipeline summaries, not persisted.

```ts
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

Rules:

- `vuLevel` and `vuBands` are `0` when idle unless a resize/preview/test fixture intentionally sets them.
- `statusText` must be short enough for a chip.
- `ariaLabel` must not be empty.
- `canStop` and `canCancel` are true only for active recording/arming states.
- `canCopy` requires a latest successful output.

## DockCommand

User action from the dock.

```ts
export type DockCommand =
  | "start"
  | "stop"
  | "stop_submit"
  | "cancel"
  | "retry"
  | "copy"
  | "paste_last_safe";
```

Rules:

- Commands route through the existing app-session/controller facade.
- `paste_last_safe` does not send keys in this spec; it records honest uncertain evidence.

## DictationKeyEvent

Host/test key lifecycle event.

```ts
export type DictationKeyEvent = {
  kind: "pressed" | "released" | "cancel";
  shortcut: string;
  source: "fake_host_event" | "global_hotkey" | "dock_button";
  receivedAt: string;
  eventId?: string;
};
```

Rules:

- The current safe shortcut may use `Ctrl+Shift+F9` while Alt+Space remains gated.
- Events must be deduped by `eventId` or timestamp/source/action signature.

## DictationKeyState

In-memory state for resolving hold/tap behavior.

```ts
export type DictationKeyState = {
  status: "idle" | "pressing" | "hold_recording" | "latched_recording" | "stopping";
  pressedAt?: string;
  activeSessionId?: string;
  lastEventId?: string;
};
```

Rules:

- Short press below threshold latches recording.
- Hold longer than threshold stops on release.
- If start is in flight and release arrives, resolver may defer stop until start completes.
- Duplicate events return `ignore`.

## DictationKeyDecision

Result emitted by the resolver.

```ts
export type DictationKeyDecision =
  | { action: "start"; latchMode: "hold" | "toggle" }
  | { action: "stop"; reason: "hold_release" | "toggle_press" | "stop_submit" }
  | { action: "cancel"; reason: "escape" }
  | { action: "ignore"; reason: string }
  | { action: "defer_stop_until_started" };
```

Rules:

- Decisions are translated to `DesktopControlEvent` actions before reaching `DesktopDictationController`.
- The resolver owns hotkey semantics only; capture/transcription remains in the controller.

## DockRecoveryState

User-facing recovery state.

```ts
export type DockRecoveryState = {
  kind: "copy" | "retry" | "record_again" | "setup" | "uncertain";
  title: string;
  message: string;
  primaryAction?: DockCommand;
  secondaryAction?: DockCommand;
};
```

Rules:

- Never use `paste_observed` wording.
- Do not include raw transcript text in logs/docs; UI may show transcript review because that is the user's active local surface.

## DockWindowConfig

Minimal runtime geometry/configuration for later floating window work.

```ts
export type DockWindowConfig = {
  mode: "main_window_compact" | "floating_dock";
  width: number;
  height: number;
  alwaysOnTop: boolean;
  transparent: boolean;
  noActivatePreferred: boolean;
};
```

Rules:

- First implementation may use `main_window_compact` if that gets a usable dock faster.
- `floating_dock` requires Tauri window/capability documentation and manual visual smoke.
