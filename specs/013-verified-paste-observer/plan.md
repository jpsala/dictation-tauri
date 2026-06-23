# Implementation Plan: Verified Paste Observer And Target Confidence

**Branch**: `main` (spec folder staged for next feature) | **Date**: 2026-06-23 | **Spec**: [spec.md](spec.md)

## Summary

Add the safe evidence seam that the native observer can plug into later. The first checkpoint is TypeScript-only and provider-free: model paste observations, centralize promotion/downgrade rules, and wire the existing Tauri saved-target gateway to accept an optional observer while defaulting to today's honest `paste_sent`.

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

## Future Checkpoint B - Native Windows Observer (Gated)

Design a host-owned observer that can inspect a saved target after paste without reading or storing sensitive target contents. Candidate routes:

- Windows UI Automation text pattern/range if available.
- App-specific file/content probe only for controlled fixtures like Notepad smoke.
- Timeout/mismatch reasons surfaced as recoverable `paste_sent`/`uncertain`, never false success.

Manual smoke requires explicit approval because it touches real foreground targets, clipboard/focus, and keystrokes.

## Checks

```powershell
npm run test:pipeline -- tests/desktop-control/delivery-observation.test.ts tests/desktop-control/delivery-evidence.test.ts
npm run build
```

## Privacy / Security

- Do not store observed text in evidence by default.
- Reasons must be redacted through existing host-runtime redaction before crossing from adapter errors.
- Raw transcript content remains recoverable only in existing in-memory evidence output.
