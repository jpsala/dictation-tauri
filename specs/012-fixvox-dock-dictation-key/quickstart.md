# Quickstart: Fixvox-Like Voice Dock And Dictation Key

## Safe Verification

Focused provider-free checks for the first checkpoints:

```powershell
npm run test:pipeline -- tests/voice-dock tests/desktop-control/dictation-key.test.ts tests/desktop-control/app-hotkey-toggle.test.ts tests/desktop-control/tauri-host-control.test.ts
```

Default safe suite:

```powershell
npm run test:pipeline
npm run build
cd src-tauri && cargo check
```

If dock UI/layout changes:

```powershell
npm run visual:check
```

If docs/context changed:

```powershell
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

## Live Dev Dock

Run the app as the current testable desktop surface:

```powershell
npm run tauri:dev
```

Current behavior:

- Opens a compact `Dictation Dock` Tauri window instead of the old large main window.
- Idle is a Fixvox-like transparent 7-dot dock (`164x64`) with no titlebar, panel chrome, header text, or visible developer controls.
- Uses Vite dev URL `http://127.0.0.1:1420`, so renderer/CSS changes hot-refresh while the dev app is running.
- Keeps the window visible and `alwaysOnTop` for iterative manual testing.
- The dock remains safe by default: no selected-text capture, no paste automation, no durable history, no `paste_observed` claim.
- Developer evidence and provider controls are hidden from the compact dock surface.
- Active recording reveals side controls; terminal/recovery states show a compact status chip such as `Needs attention` without paste or selection side effects.

### Dock Dev Smoke - 2026-06-23

- Command: `npm run tauri:dev` launched successfully and was repositioned to bottom-center (`164x64`, always-on-top).
- Visual: screenshot verified transparent 7-dot idle dock, no titlebar, no white WebView background, no header, no developer panel.
- Hotkey tap/hold: `Ctrl+Shift+F9` started/stopped capture through the real Tauri global-shortcut path.
- Artifact evidence: fresh native WAVs were created under ignored `artifacts/microphone-capture/audio/`, including `capture-native-1782236799897.wav` and `capture-native-1782236832977.wav`.
- Recovery: provider-free stop surfaced compact `Needs attention` chip rather than a large app panel.
- Guardrails: no selected text, no paste automation, no `paste_observed`, no durable history, no raw transcript or secret recorded.

### Dock Voice Feedback And STT Smoke - 2026-06-23

- Fix: native Rust capture now exposes live RMS/VU bands through `get_native_microphone_capture_level`; the renderer polls it while recording so dots reflect actual microphone input instead of static animation.
- Fix: VU scaling uses a short RMS window plus boosted visual mapping so the recording bars visibly grow like Fixvox even for quiet microphone input.
- Fix: the dock dictation path now submits the captured WAV through the real Tauri host transcription adapter after the explicit stop gesture; developer/browser tests remain provider-free.
- Manual smoke: side-by-side with the running Fixvox `Voice Dock`, `Dictation Dock` matched the transparent `164x64` idle seven-dot layout; recording showed side controls and visibly taller green VU bars.
- Manual smoke: `Ctrl+Shift+F9` tap started recording, second tap stopped and generated fresh ignored WAVs including `capture-native-1782239522112.wav`; hold/release also stopped and generated `capture-native-1782239542571.wav`.
- Result: compact chip reached `Transcript ready`; no raw transcript was copied into docs/chat.
- Guardrails: no selected text, no paste automation, no `paste_observed`, no durable history.

### Gated Paste-Sent Smoke - 2026-06-23

- Scope: first insert-at-cursor delivery batch, explicitly approved for controlled smoke only.
- Implementation: Tauri captures the foreground target before recording; after explicit stop and STT, `DesktopDictationController` uses a saved-target delivery gateway to focus that target, write transcript to clipboard, send `Ctrl+V`, then restore the previous clipboard.
- Evidence model: delivery is `paste_sent` only; it still never claims `paste_observed` because there is no verified observer yet.
- Controlled smoke: focused a scratch Notepad target, set a sentinel clipboard value, started/stopped via `Ctrl+Shift+F9`, and saved the target file after delivery.
- Result: target file length changed from `0` to `10` bytes and clipboard sentinel was restored; fresh WAV `capture-native-1782240989901.wav` was generated. Raw transcript content was not recorded.
- Guardrails: no selection/replace, no Alt+Space, no durable history, no paste observation claim.

## Expected Usable Flow

Target daily-use behavior after this spec lands:

1. User sees a compact Fixvox-like dock window instead of a large test panel.
2. User presses the dictation key.
3. Long hold records while held and submits on release.
4. Short tap latches recording for longer dictation; next tap stops/submits.
5. Dock shows arming/recording with VU/dots feedback.
6. Dock shows processing chip while transcribing/preparing output.
7. Transcript review/recovery remains visible if delivery is uncertain.
8. Copy fallback remains available and does not claim paste observation.

## Gated Local Smokes

These require explicit local approval because they use real desktop side effects:

```powershell
npm run tauri:dev
# Manual smoke A: current safe dictation key Ctrl+Shift+F9 hold/tap -> fresh WAV -> review/recovery -> optional copy fallback
# Manual smoke B: optional Alt+Space compatibility check
```

Evidence rules:

- Do not paste or print raw transcripts into docs/chat.
- Do not print secrets, provider payloads, or selected text.
- Record only redacted facts: shortcut used, whether fresh WAV was created, provider path used, review visible, copy fallback succeeded/failed.

### Smoke A - 2026-06-23

- Approval: JP explicitly approved T017 manual Tauri smoke.
- Command: `npm run tauri:dev` launched successfully; logs stored under ignored `artifacts/microphone-capture/reports/tauri-dev-012-smoke-*.log`.
- Shortcut: current safe dictation key `Ctrl+Shift+F9`, using Tauri `pressed`/`released` payload path.
- Result: JP reported the smoke passed.
- Artifact evidence: fresh native WAV was created at ignored path `artifacts/microphone-capture/audio/capture-native-1782234499663.wav` (481,964 bytes).
- Provider/selection/paste: no selected text, no paste automation, no `paste_observed`, no Alt+Space. No raw transcript or secret was recorded in docs/chat.

## Alt+Space Decision Gate

`Alt+Space` is the desired Fixvox-like default, but Windows reserves it.

Before making it default, prove one of these:

1. Tauri/global-shortcut can register and emit reliable press/release without opening the system menu; or
2. a Rust-owned native hook/fallback is designed, reviewed, and compile-guarded without AutoHotkey.

If neither is true, keep the same hold/tap semantics on a configurable fallback key and document Alt+Space as future work.

## Out Of Scope For First Landing

- Real selected-text capture.
- Real paste/replace-selection automation.
- Durable result history.
- Quick Chat.
- Assistant Mode.
- `Alt+Q` picker implementation.
- Full settings UI for editing hotkeys/dock position.
