# Feature Specification: Verified Paste Observer And Target Confidence

**Feature Branch**: `013-verified-paste-observer`  
**Created**: 2026-06-23  
**Status**: Draft  
**Input**: Continuation after `012-fixvox-dock-dictation-key` safe dock + saved-target `paste_sent` landed.

## User Story

As JP, when dictation inserts text into another desktop app, I need the app to distinguish honestly between "paste was sent" and "the target really changed" so recovery decisions are safe and the dock never overclaims success.

## Scope

### In

- Provider-free TypeScript contracts for a desktop paste observer.
- Evidence promotion rules that allow `paste_observed` only from a verified, high-confidence observer.
- Tauri delivery gateway seam that can consume an observer later while preserving current `paste_sent` behavior when no observer exists.
- Documentation of the next native observer/heuristics path before any real smoke.

### Out For First Batch

- No real Windows UI Automation observer yet.
- No new clipboard/focus/paste side effects in default checks.
- No selection replacement.
- No claim of `paste_observed` in manual evidence until a native observer proves it.

## Acceptance Criteria

1. Default tests prove unverified delivery remains `paste_sent` or `uncertain`, never `paste_observed`.
2. A fake high-confidence observer can promote a paste-send result to `paste_observed` only through the explicit verified-observer pathway.
3. Fake low-confidence, timeout, mismatch, unsupported, or throwing observers do not promote evidence and preserve transcript recovery.
4. The existing Tauri saved-target gateway keeps current behavior when no observer is configured.
5. Safe checks remain provider-free and do not require desktop side effects.
