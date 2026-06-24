# Quickstart: Selection Transform And Recovery Ergonomics

## Safe Verification

Run focused tests for the first implemented slice:

```powershell
npm run test:pipeline -- tests/selection-transform tests/desktop-control/app-delivery.test.ts
```

Run the default safe suite:

```powershell
npm run test:pipeline
npm run build
cd src-tauri && cargo check
```

If UI layout changes, run:

```powershell
npm run visual:check
```

If docs/context changed, run:

```powershell
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
```

## Safe Paste-Last Demo

The current safe paste-last recovery affordance is evidence/UI-only:

- it does not send paste keys;
- it does not touch focus or real desktop targets;
- it does not use the clipboard;
- it records delivery as `uncertain`;
- it keeps transcript review visible for manual copy.

Expected wording:

```text
Paste last was not sent in safe mode; transcript remains available for manual copy.
```

## Selection Transform First Slice

Until real OS selection capture is approved, use fixture contexts only:

```ts
const selection = {
  selectionId: "fixture-selection-1",
  selectedText: "Synthetic selected text.",
  textLength: 24,
  source: "fixture",
  confidence: "medium",
  redacted: true,
};
```

Default tests must not read the real selected text, mutate the clipboard, send keys, or call providers.

## Gated Future Checks

These require explicit approval before running:

```powershell
npm run tauri:dev
# future: real paste/replace-selection smoke
```

Evidence from gated checks must be redacted and must not include secrets, real transcripts, raw selected text, or provider payloads.

### T039 UIA Selected-Text Product IPC Smoke - 2026-06-24

- Approval: JP selected `T039 selected-text smoke`, explicitly opening the real selected-text smoke gate for a controlled local target.
- Harness added: `npm run selection-capture:smoke -- -AllowSelectedTextCapture ...`, backed by `scripts/selection-capture-smoke.ps1` and `scripts/cdp-evaluate.mjs`.
- Command used:

```powershell
npm run selection-capture:smoke -- -AllowSelectedTextCapture -RunId 20260624-T039-uia-selection-smoke-retry -RemoteDebugPort 9343 -InitialDelaySeconds 3
```

- Result: passed. Evidence: `artifacts/desktop-control/selection-capture-smoke/20260624-T039-uia-selection-smoke-retry/report.json`.
- Validated path: Tauri `Dictation Dock` launched, WebView2 CDP reached the product IPC page, a controlled WPF fixture held synthetic selected text in the foreground, and `window.__TAURI_INTERNALS__.invoke('capture_selection_context')` returned `status: ok`.
- Evidence details: selected-text length matched fixture length (`38`), `source: host_capture`, `confidence: medium`, `truncated: false`, target labels were `[redacted]`, and the report records only length/hash plus booleans (`selectedTextRecordedInReport: false`).
- Guardrails: no raw selected text printed in docs, no clipboard mutation, no keyboard shortcut capture fallback, no focus mutation by the capture command, no paste/replace-selection, no provider call, no `paste_observed` claim.

## Future Windows Selection Capture Route

The selected T036 design route is host-owned and non-mutating by default:

1. User action/hotkey asks the Tauri host to capture selection for the current foreground target.
2. Rust/Tauri attempts Windows UI Automation selected-text capture with a short timeout.
3. On success, host returns an in-memory `SelectionContext` with `source: "host_capture"`, redacted target evidence, and truncation metadata if needed.
4. On `unsupported_target`, `no_selection`, `timeout`, or any failure, the app falls back to direct dictation or review-only recovery.

Not included in this route without a later explicit approval:

- clipboard roundtrip capture;
- synthetic `Ctrl+C`;
- focus changes;
- paste or replace-selection automation;
- durable selected-text/result history.
