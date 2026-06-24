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

### Checkpoint E Parity Target - 2026-06-24

JP clarified the next dock goal: make Dictation Tauri's dock as equal to Fixvox's dock as possible, and prefer Rust/Windows API ownership where native behavior gives better fidelity than renderer-only work.

Primary reference files:

- `C:/dev/fixvox/src/app/views/voice-dock/DockSkin4.svelte`
- `C:/dev/fixvox/src/app/backend/voice-dock-window.ts`
- `C:/dev/fixvox/src/app/views/voice-dock/dock-visual-semantics.ts`

Parity checklist:

- Idle window: transparent `164x64`, always-on-top, no titlebar/chrome, no visible WebView background, seven-dot central pill, dot gap close to `3.5px`, dot width `5px`, idle dot height `6px`, subtle white/gray gradient and shadow.
- Recording: side controls reveal around the central dots, green finish/check affordance, optional blue enter-submit affordance, red cancel affordance, central seven dots become live VU bars with boosted RMS/bands.
- Processing: compact status chip above/near dock with pulse, no large app panel, seven dots use processing animation/heights.
- Error/recovery: compact chip or companion-style affordance; copy/retry/recover actions remain honest and do not claim `paste_observed`.
- Native shell: no focus stealing while idle/recording, target app remains the interaction target until explicit delivery, monitor/DPI-safe positioning, rounded/hit-test behavior close to Fixvox where feasible.
- Guardrails: no raw transcripts/secrets/selected text in evidence, no durable history, no selection/replace until separately gated, no `paste_observed` without observer.

Computer-use/manual smoke loop:

1. Launch Fixvox dock and Dictation Dock side-by-side.
2. Capture/observe idle geometry and dot rendering.
3. Start recording in both and compare controls, VU movement, colors, and focus behavior.
4. Stop recording and compare processing/recovery chips.
5. Iterate code until visual/behavioral parity is close enough for JP review.
6. Record only redacted observations or ignored screenshots/artifacts.

### T030 Provider-Free Parity Test And CUA MCP Smoke - 2026-06-24

- Added provider-free parity contract coverage in `tests/voice-dock/voice-dock-parity.test.tsx` before touching visual/native shell code.
- Covered idle seven-dot `164x64` contract, dot sizes/gaps, recording side controls, processing companion chip, reduced-motion CSS, no `paste_observed` wording, and no developer/provider panel leakage.
- Checks passed: `npm run test:pipeline -- tests/voice-dock`, `npm run test:pipeline -- tests/voice-dock tests/desktop-control`, and `npm run visual:check`.
- Persistent CUA MCP smoke passed against `npm run dev` at `http://127.0.0.1:1420`: health OK, idle text visible, Start invoked through UIA, recording showed `Stop & review`/`Cancel` and live voice-activity label, Stop returned to provider-free recovery (`Needs attention`/`Retry`).
- Evidence: ignored artifact report at `artifacts/desktop-control/cua-visual-smoke/20260624-110253/report.json`.
- Guardrails: no provider call, no microphone permission, no selection/clipboard/paste side effects, no raw transcript.

### T031 Renderer Skin4 Refinement - 2026-06-24

- Scope: renderer-only parity pass before Tauri/Rust shell changes.
- Changes: `VoiceDock.tsx` now names the Skin4 dot constants, exposes `data-skin="fixvox-skin4"`, keeps primary action routing explicit, and renders compact two-line companion chips for processing/review/recovery states.
- CSS moved closer to `DockSkin4.svelte`: central `66x28` seven-dot core, `31px` side controls with `70px` center gap around the core, `3.5px` dot gap, Skin4-like hover/drop-shadow behavior, pulsing compact status chip, and reduced-motion disabling of dot/chip animations.
- Checks passed: `npm run test:pipeline -- tests/voice-dock`, `npm run test:pipeline -- tests/voice-dock tests/desktop-control`, `npm run build`, and `npm run visual:check`.
- Guardrails: provider-free only; no native shell changes, no real hotkeys beyond existing tests, no clipboard/focus/paste/selection side effects, no `paste_observed` wording.

### T032/T033 Rust-Owned Dock Shell - 2026-06-24

- Scope: native shell fidelity pass after renderer Skin4 refinement.
- Changes: new `src-tauri/src/dock_shell.rs` owns setup for the `main`/`Dictation Dock` window; `tauri.conf.json` now starts the window hidden, `focus: false`, `skipTaskbar: true`, no chrome, transparent, always-on-top.
- Runtime behavior: setup sizes the dock to `164x64`, calculates monitor work-area bottom-center position with margin, sets skip-taskbar/always-on-top, and shows the window without activation on Windows.
- Windows path: compile-guarded `SetWindowLongPtrW`/`SetWindowPos` adds `WS_EX_NOACTIVATE` and `WS_EX_TOOLWINDOW`, removes `WS_EX_APPWINDOW`, and uses `SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED`.
- Coverage: pure Rust tests cover bottom-center geometry, offset monitor clamp, tiny work-area clamp, and Windows extended-style bit math. In this environment `cd src-tauri && cargo test dock_shell` is still blocked by known `STATUS_ENTRYPOINT_NOT_FOUND`; `cd src-tauri && cargo check` passed.
- CUA/Win32 smoke: launched `npm run tauri:dev`, observed `Dictation Dock` on-screen, collected HWND style/bounds, and closed the app. Evidence: `artifacts/desktop-control/dock-shell-smoke/20260624-114946/report.json` with rect `164x64`, foreground still terminal, `noActivate=true`, `toolWindow=true`, `appWindow=false`.
- Checks passed: `npm run test:pipeline -- tests/voice-dock tests/desktop-control`, `npm run build`, retry of `npm run visual:check` (first visual run had two webServer navigation timeouts then retry passed all 8).
- Guardrails: no provider call, no microphone, no clipboard/focus delivery, no selected text, no paste automation, no `paste_observed` claim.

### T034 Side-By-Side Fixvox Parity Smoke - 2026-06-24

- Scope: computer-use/manual side-by-side smoke against the already-running Fixvox `Voice Dock` and a fresh Dictation Tauri `Dictation Dock`.
- Evidence: ignored artifact directory `artifacts/desktop-control/dock-parity-smoke/20260624-124835/` with `summary.json`, per-stage JSON reports, and cropped screenshots for idle, recording, cancel/recovery, Dictation fixture stop, and Fixvox fixture stop.
- Idle result: both windows were transparent `164x64`, seven-dot central pills, no titlebar/chrome, foreground stayed in terminal, and Win32 styles matched the target class: `noActivate=true`, `toolWindow=true`, `appWindow=false`.
- Recording result: both docks preserved foreground and kept `164x64`; both showed side controls and live VU bars. Dictation showed green finish + red cancel; Fixvox additionally showed the blue enter-submit affordance.
- Recovery/stop result: Dictation cancel showed a compact `Cancelled` chip; Dictation stop against an ephemeral `Dock Parity Scratch Target` reached compact `Transcript ready` while preserving fixture foreground. The fixture recorded only output length/hash (`target-result.json`), not raw text. Fixvox stop returned to idle too quickly to capture a visible processing chip in this run.
- Deviations for JP review: no separate blue enter-submit button yet, no native idle hit-region narrowing/rounded hit-test yet, no state-aware native resize to larger processing/error companion sizes, no context menu/preset/assistant indicators yet.
- Guardrails: no selected text, no personal app target, no raw transcript in docs/chat, no `paste_observed` claim. Dictation/Fixvox were closed/left as appropriate; Dictation dev process and fixture were cleaned up.

### Computer-Use Real Dictation E2E - 2026-06-24

- Scope: reusable end-to-end harness for the real desktop dictation path with controlled local side effects.
- Harness: `scripts/desktop-dictation-e2e.ps1`; package alias: `npm run desktop-control:e2e -- <flags>`.
- Command used:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/desktop-dictation-e2e.ps1 -AllowDesktopSideEffects -AllowProviderCall -AllowClipboardMutation -RecordingSeconds 2 -InitialDelaySeconds 12 -DeliveryTimeoutSeconds 180
```

- Result: passed. Report: `artifacts/desktop-control/dictation-e2e/20260624-104246/report.json`.
- Validated path: Cua health/autostart -> Tauri `Dictation Dock` -> editable target fixture foreground -> `Ctrl+Shift+F9` start -> Windows speech synthesis fixture phrase -> `Ctrl+Shift+F9` stop -> fresh WAV -> configured real provider -> `paste_sent` to target -> clipboard sentinel restored -> cleanup.
- Evidence: target received 29 chars; token check matched `dictation`, `fixture`, `green`, `apple`; fresh WAV `artifacts/microphone-capture/audio/capture-native-1782308585886.wav`; normalized target hash recorded in report. Raw target text stays only in ignored artifact output, not docs/chat.
- Gotchas captured in the harness: launch target after dock so saved target is correct; keep live target output under `%TEMP%` because Vite can crash with `EBUSY` if it watches frequently-written artifact files.

### T035 Post-Parity Real Dictation Smoke - 2026-06-24

- Scope: gated real dictation smoke after Checkpoint E parity changes, using controlled local desktop side effects and provider call.
- Command used:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/desktop-dictation-e2e.ps1 -AllowDesktopSideEffects -AllowProviderCall -AllowClipboardMutation -RecordingSeconds 2 -InitialDelaySeconds 12 -DeliveryTimeoutSeconds 180 -RunId 20260624-T035-post-parity
```

- Result: passed. Report: `artifacts/desktop-control/dictation-e2e/20260624-T035-post-parity/report.json`.
- Validated path: Cua health -> Tauri `Dictation Dock` -> editable target fixture foreground -> `Ctrl+Shift+F9` start -> Windows speech synthesis fixture -> `Ctrl+Shift+F9` stop -> live VU/fresh WAV -> configured managed STT -> target `paste_sent` -> clipboard sentinel restored -> cleanup.
- Evidence: fresh WAV `artifacts/microphone-capture/audio/capture-native-1782317452217.wav`; target length `29`; token check matched `dictation`, `fixture`, `green`, `apple`; normalized target hash recorded in report.
- Guardrails: no selected text, no personal app target, no raw transcript in docs/chat, no `paste_observed` claim; raw target text remains only in ignored artifacts.

### Checkpoint E Final Status - 2026-06-24

- Status: done. T030-T036 closed the Rust-native Fixvox dock parity checkpoint.
- Verification: provider-free parity tests/build/visual/cargo checks from T030-T033 remained the safe gate; side-by-side Fixvox smoke T034 passed for close idle/recording/recovery parity; T035 real dictation E2E passed post-parity.
- Native shell documented: `Dictation Dock` is transparent `164x64`, no chrome, always-on-top, skip-taskbar, `WS_EX_NOACTIVATE`, `WS_EX_TOOLWINDOW`, no `WS_EX_APPWINDOW`, and foreground-preserving in smoke evidence.
- Accepted follow-ups: JP chose to accept remaining deviations as follow-ups rather than continue this batch: blue enter-submit affordance, native idle hit-region/rounded hit-test, state-aware processing/error resize, context menu, preset badge, and assistant indicators.
- Still gated: Alt+Space, tray/background lifecycle, selected-text capture, replace-selection, observer-backed `paste_observed`, real app targets beyond controlled fixtures.

### Lote 3 Five-Front Fixvox Parity Follow-Up - 2026-06-24

- Scope: continued the five remaining Fixvox-parity fronts: robust Alt+Space, selection/replace foundation, enriched tray/context menu, companion/recovery, and durable history.
- Alt+Space: Windows now has a gated native `WH_KEYBOARD_LL` backend. It is selected only when `DICTATION_TAURI_DICTATION_KEY=Alt+Space` and `DICTATION_TAURI_ALLOW_ALT_SPACE=true/1`; otherwise the default remains `Ctrl+Shift+F9`. Smoke confirmed the dock label changed to `Alt+Space` and synthetic Alt+Space started listening without system-menu interruption, then Cancel returned to recovery.
- Tray/context menu: menu ids/events now include preset rewrite/shorten/bulletize, clear preset, result history, and settings. Renderer applies preset badge state, shows result-history/settings companion cards, and keeps Rust side effects limited to show/hide/quit.
- Companion/recovery: first slice adds a compact renderer companion panel above the dock for recovery/history/settings. A separate Tauri companion window remains the stronger Fixvox-parity follow-up.
- Durable history: Tauri host owns `result-history.v1.jsonl` under app data, with last-50 bounded storage, clear/list/append commands, and no `paste_observed` entries without a verified observer.
- Selection: `capture_selection_context` redacts target labels before returning host metadata. Real UI Automation selected-text read and replace-selection remain gated follow-ups.
- Evidence: `artifacts/desktop-control/combined-lote-smoke/20260624-five-fronts-altspace-companion/report.json` plus real dictation E2E retry `artifacts/desktop-control/dictation-e2e/20260624-five-fronts-e2e-retry/report.json`.
- Checks passed: `npm run test:pipeline` (50 files / 242 tests), `npm run build`, `npm run visual:check` (8 tests), and `cd src-tauri && cargo check`.
- Guardrails: no raw transcript in docs, no `paste_observed`, no real selected-text read, no replace-selection, no autostart install. One earlier E2E attempt failed because Windows foreground lock denied CUA focus; retry passed after cleanup.

### Lote 2 Tray/Hotkey/Selection Boundary Follow-Up - 2026-06-24

- Scope: combined follow-up requested as items 1/2/3 after Lote 1: context menu/tray/background lifecycle, gated Alt+Space path, and 011 selection boundary.
- Tray/background: Tauri now enables the `tray-icon` feature and registers a native tray menu with show dock, hide dock, start, stop/review, cancel, paste-last-safe, and quit. Close requests hide the dock instead of quitting. Dock right-click requests a native context menu through `show_dock_context_menu`.
- Hotkey config: Rust owns an effective dictation key resolver. Default remains `Ctrl+Shift+F9`; `Alt+Space` is available only when explicitly requested via `DICTATION_TAURI_DICTATION_KEY=Alt+Space` and enabled via `DICTATION_TAURI_ALLOW_ALT_SPACE=true/1`. Without the gate it falls back to `Ctrl+Shift+F9` with reason `alt_space_requires_explicit_gate`. This does not implement Fixvox's native WH_KEYBOARD_LL suppression yet.
- Selection boundary: `capture_selection_context` is registered as an explicit host command for spec 011. It returns typed, redacted outcomes and target metadata; the renderer does not invoke it by default. The Windows path remains non-mutating and returns `no_selection` until a separate approved real UI Automation selected-text smoke is done.
- Computer-use feedback: `npm run tauri:dev` launched the real `Dictation Dock`, default label stayed `Ctrl+Shift+F9`, and CUA right-click exercised the native/context menu path. Evidence: `artifacts/desktop-control/combined-lote-smoke/20260624-tray-altspace-selection/report.json`.
- Checks passed: `npm run test:pipeline` (50 files / 240 tests), `npm run build`, `npm run visual:check` (8 tests), and `cd src-tauri && cargo check`.
- Guardrails: no raw transcript, no `paste_observed`, no Alt+Space enabled by default, no real selected text read by default, no replace-selection, no autostart install.

### Lote 1 Follow-Up Dock Parity - 2026-06-24

- Scope: first large post-Checkpoint-E batch to close the accepted dock follow-ups without opening Alt+Space, selection, replace-selection, or paste observer gates.
- Renderer changes: recording now exposes separate Fixvox-style controls: green `Stop & review`, blue `Stop & submit`, and red `Cancel`. `Stop & submit` requests paste-then-Enter semantics while still reporting only `paste_sent` evidence.
- Visual metadata: `VoiceDockState` supports visual-only `activePreset` and `assistantModeEnabled`; the dock renders a compact green preset badge and assistant indicator when provided. No preset engine, assistant mode, selected text, or replace-selection is activated by this batch.
- Native shell changes: `update_dock_shell_state` lets the renderer report phase changes to Rust. Windows uses `SetWindowPos(... SWP_NOACTIVATE ...)` for state-aware sizing and `CreateRoundRectRgn`/`SetWindowRgn` for the idle rounded hit-region. Idle remains `164x64`; recording uses full hit region for side controls; review/uncertain/failed/cancelled expand to `260x90`.
- Computer-use feedback: smoke used `npm run tauri:dev` against the real `Dictation Dock` with a controlled Notepad-style desktop context, not a browser. Evidence: `artifacts/desktop-control/dock-lote1-smoke/20260624-renderer-native/report.json` shows recording controls, cancelled/recovery resize `260x90`, and `exStyle=0x8000198` (`NOACTIVATE`/`TOOLWINDOW`, no app-window bit).
- Checks passed: `npm run test:pipeline` (50 files / 239 tests), `npm run build`, `cd src-tauri && cargo check`, and `npm run visual:check` (8 tests).
- Guardrails: no raw transcript, no `paste_observed`, no Alt+Space, no selected text, no replace-selection.

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
