# Feature Specification: Verified Paste Observer And Target Confidence

**Feature Branch**: `013-verified-paste-observer`  
**Created**: 2026-06-23  
**Status**: Complete for gated Windows observer smoke  
**Input**: Continuation after `012-fixvox-dock-dictation-key` safe dock + saved-target `paste_sent` landed.

## User Story

As JP, when dictation inserts text into another desktop app, I need the app to distinguish honestly between "paste was sent" and "the target really changed" so recovery decisions are safe and the dock never overclaims success.

## Scope

### In

- Provider-free TypeScript contracts for a desktop paste observer.
- Evidence promotion rules that allow `paste_observed` only from a verified, high-confidence observer.
- Tauri delivery gateway seam that can consume an observer while preserving current `paste_sent` behavior when no observer is configured.
- Gated native Windows observer command that checks saved-target readable text surfaces without returning raw target contents.

### Out For Default Checks

- No observer enabled unless `VITE_ENABLE_NATIVE_PASTE_OBSERVER=1` (or `true`).
- No new clipboard/focus/paste side effects beyond the existing gated paste-send path.
- No selection replacement.
- No claim of `paste_observed` in manual evidence until the gated native observer proves it in a controlled smoke.

## Acceptance Criteria

1. Default tests prove unverified delivery remains `paste_sent` or `uncertain`, never `paste_observed`.
2. A fake high-confidence observer can promote a paste-send result to `paste_observed` only through the explicit verified-observer pathway.
3. Fake low-confidence, timeout, mismatch, unsupported, or throwing observers do not promote evidence and preserve transcript recovery.
4. The existing Tauri saved-target gateway keeps current behavior when no observer is configured.
5. Safe checks remain provider-free and do not require desktop side effects.
6. With the native observer gate disabled, Tauri desktop delivery behavior is unchanged.
7. With the native observer gate enabled, only high-confidence native confirmation can promote evidence to `paste_observed`; unsupported/mismatch/timeout remain recoverable `paste_sent`.
8. The compact dock exposes machine-readable and accessible delivery status so computer-use can verify `paste_observed` directly.
