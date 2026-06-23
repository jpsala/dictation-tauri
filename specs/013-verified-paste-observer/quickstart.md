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

- Pending: no gated native observer smoke has been run yet.
