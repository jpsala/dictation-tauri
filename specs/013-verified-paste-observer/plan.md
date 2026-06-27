# Implementation Plan: Verified Paste Observer And Target Confidence

**Branch**: `main` (spec folder staged for next feature) | **Date**: 2026-06-23 | **Spec**: [spec.md](spec.md)

## Summary

Add the safe evidence seam and gated native observer needed to promote delivery from `paste_sent` to `paste_observed` honestly. Checkpoint A is TypeScript-only and provider-free; Checkpoint B adds a Windows Rust observer behind an explicit renderer gate while defaulting to today's honest `paste_sent`.

## Technical Context

- Stack: TypeScript strict, React/Vite, Tauri v2/Rust 2021.
- Existing delivery evidence: `src/delivery/evidence.ts`, `src/delivery/types.ts`, `src/delivery/tauri-desktop-delivery.ts`.
- Existing guardrail: `paste_observed` is forbidden unless `allowVerifiedPasteObservation` is explicitly true.

## Checkpoint A - Provider-Free Observer Contract

1. Add tests in `tests/desktop-control/delivery-observation.test.ts`.
2. Add `src/delivery/observation.ts` with observer types and evidence derivation helpers.
3. Export the helper/types from `src/delivery/index.ts`.
4. Wire optional observer support into `createTauriSavedTargetDeliveryGateway` without changing default behavior.
5. Verify with focused tests and `npm run build`.

## Checkpoint B - Native Windows Observer (Gated)

Implemented host-owned observer path:

- `src-tauri/src/desktop_delivery.rs` exposes `observe_desktop_paste`.
- The command polls readable Win32 text surfaces for the saved target after paste-send and returns only observation status, confidence, reason, and target snapshot metadata.
- Raw observed target contents are not returned to the renderer or stored in evidence.
- `src/delivery/tauri-desktop-delivery.ts` exposes `createTauriNativePasteObserver` and enables it only when `VITE_ENABLE_NATIVE_PASTE_OBSERVER=1` (or `true`).
- Timeout/mismatch/unsupported reasons remain recoverable `paste_sent`/`uncertain`, never false success.

Manual smoke still requires explicit approval because it touches real foreground targets, clipboard/focus, keystrokes, and target observation.

## Checks

```powershell
npm run test:pipeline -- tests/desktop-control/delivery-observation.test.ts tests/desktop-control/native-paste-observer.test.ts tests/desktop-control/desktop-delivery-rust.test.ts
npm run build
cd src-tauri && cargo check
```

## Privacy / Security

- Do not store observed text in evidence by default.
- Reasons must be redacted through existing host-runtime redaction before crossing from adapter errors.
- Raw transcript content remains recoverable only in existing in-memory evidence output.
