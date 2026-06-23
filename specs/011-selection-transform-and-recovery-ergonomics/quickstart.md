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
# future: real selection capture smoke
# future: real paste/replace-selection smoke
```

Evidence from gated checks must be redacted and must not include secrets, real transcripts, raw selected text, or provider payloads.

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
