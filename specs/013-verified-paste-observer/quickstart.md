# Quickstart: Verified Paste Observer

## Safe Checks

```powershell
npm run test:pipeline -- tests/desktop-control/delivery-observation.test.ts tests/desktop-control/native-paste-observer.test.ts tests/desktop-control/desktop-delivery-rust.test.ts
npm run build
cd src-tauri && cargo check
```

## Gated Native Observer Smoke (Pending Approval)

Purpose: prove the app may promote `paste_sent` to `paste_observed` only when the native Windows observer confirms insertion in a controlled target.

Guardrails:

- Use a scratch target only (for example, controlled Notepad file/window).
- Do not record raw transcript or observed target contents in this file.
- Keep clipboard sentinel/restoration check.
- Gate the observer explicitly with `VITE_ENABLE_NATIVE_PASTE_OBSERVER=1`.

Suggested flow:

```powershell
# from repo root; include existing local .env as needed, without printing secrets
$env:VITE_ENABLE_NATIVE_PASTE_OBSERVER = "1"
npm run dev:desktop:restart
```

Manual steps:

1. Open a controlled scratch target and place the cursor where insertion is allowed.
2. Trigger dictation with `Alt+Space` or fallback `Ctrl+Shift+F9`.
3. Speak a harmless short phrase.
4. Stop dictation and wait for delivery.
5. Confirm the dock reports verified paste only if evidence status is `paste_observed`.
6. Confirm clipboard sentinel is restored.

## Evidence Log

- 2026-06-23 controlled fallback smoke with `VITE_ENABLE_NATIVE_PASTE_OBSERVER=1`:
  - Command: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-dock.ps1 -Mode Fallback -RecordSeconds 4 -SpeakText '[REDACTED_SYNTHETIC_SPEECH]'`.
  - Report: `artifacts/microphone-capture/reports/dock-smoke-Fallback-20260623-201528.json`.
  - Result: fresh WAV created, scratch Notepad target changed to non-empty redacted content, clipboard sentinel restored.
  - Follow-up probe: Win32 child text probe against the scratch Notepad matched the saved redacted content (`readableTextSurfaces=12`, `win32ProbeMatchedSavedContent=true`).
  - Limitation: this session does not expose a computer-use/UI-inspection tool that can read the dock's React evidence state, so `paste_observed` was not independently captured from the app UI/log. Treat as observer-readiness evidence, not final verified `paste_observed` closeout.
