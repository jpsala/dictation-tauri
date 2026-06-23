# Quickstart: Desktop Dictation Control And Delivery

## Safe Default Verification

These commands must not call Fixvox/Groq, register global hotkeys, access real clipboard/focus APIs, or require microphone hardware:

```powershell
npm run test:pipeline -- tests/desktop-control
npm run test:pipeline
npm run build
cd src-tauri && cargo check
```

If UI copy/layout changes:

```powershell
npm run visual:check
```

If docs/spec index changes:

```powershell
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

## Expected Safe Demo Shape

Using fakes/tests only:

1. Start a desktop dictation session through the app button or fake host control event.
2. Stop the session and finalize a fake captured artifact.
3. Submit through the existing host runtime adapter/fake host response.
4. Show transcript review.
5. Run delivery as review-only or fake copy.
6. Verify delivery evidence is `available`, `copied`, `failed`, `uncertain`, or `paste_sent`, never `paste_observed`.

## Gated Manual Checks

Only after explicit approval and after provider-free tests pass:

```powershell
npm run tauri:dev
# Phase 7 implemented route: Rust-owned Tauri v2 global shortcut,
# fixed as Ctrl+Shift+F9, emits desktop-control://global-hotkey
# with source=global_hotkey/action=toggle.
# The renderer only listens to this host event and maps it to the existing safe toggle flow.
# No JS hotkey registration, no frontend global-shortcut permissions, no paste automation.
# No extra capability permission is required because the renderer does not call plugin commands.
```

Expected manual smoke shape:

1. Launch `npm run tauri:dev` locally.
2. Press `Ctrl+Shift+F9` once and verify capture starts/listens.
3. Press `Ctrl+Shift+F9` again and verify capture stops into review or safe setup-needed state.
4. Record only redacted evidence; do not include raw transcript/window titles/secrets.

Manual evidence rules:

- Redact secrets, full device ids, request ids if secret-like, transcript content, and private window titles.
- Keep audio/transcripts/reports under ignored artifact roots.
- Do not claim paste observation unless a verified observer exists.
- Run artifact hygiene checks before closing:

```powershell
git status --short --ignored artifacts .env
git ls-files artifacts .env
```

## Manual Evidence

### 2026-06-23: `Ctrl+Shift+F9` smoke passed

User approval: JP approved the gated hotkey smoke for `010 T046`.

Command shape:

```powershell
npm run test:pipeline -- tests/desktop-control
cd src-tauri && cargo check
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/desktop-hotkey-smoke.ps1 -AllowDesktopSideEffects
```

Redacted result:

- Shortcut: `Ctrl+Shift+F9`.
- Tauri window readiness: confirmed before sending keys.
- First hotkey started native capture; second hotkey stopped it.
- New ignored audio artifact: `artifacts/microphone-capture/audio/capture-native-1782219726497.wav` (`961964` bytes).
- Redacted smoke result: `artifacts/desktop-control/hotkey-smoke-20260623-100146.json`.
- Redacted logs: `artifacts/desktop-control/tauri-hotkey-smoke-20260623-100146.out.log` and `.err.log`.
- No provider call, no selection capture, no paste automation, no transcript content, and no paste observation claim.

Gotcha: `WScript.Shell.SendKeys('^+{F9}')` was inconclusive in the scripted smoke; low-level Windows key events after confirming the Tauri window produced the passing artifact.

### 2026-06-23: subsequent hotkey smoke reattempt was inconclusive

After JP approved a real E2E/provider smoke, `scripts/desktop-hotkey-smoke.ps1 -AllowDesktopSideEffects` was run twice. Both runs launched Tauri and confirmed window readiness but produced no new WAV artifact. A temporary diagnostic run showed Rust received two `Ctrl+Shift+F9` events, so the gap is after host event emission or within the renderer/session/capture handoff. Do not record this as an E2E pass; keep the earlier `capture-native-1782219726497.wav` pass as the last known-good hotkey artifact until the handoff is debugged.

## Non-Goals During Quickstart

- No selected-text capture or replace-selection.
- No full tray/settings/remapping UI.
- No durable dictation history.
- No default provider calls.
- No paste observation claims.
