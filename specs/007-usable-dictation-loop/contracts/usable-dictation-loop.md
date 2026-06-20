# Contract: Usable Dictation Loop

This contract narrows how the React app uses the 006 host-runtime transcription boundary.

## Runtime Selection

```ts
type HostClientRuntime = {
  client: HostRuntimeClient;
  label: string;
};
```

Rules:

- Tauri desktop uses `createTauriHostRuntimeClient(invoke)`.
- Browser/dev fallback uses `createUnavailableHostRuntimeClient()` unless a test injects a fake.
- The renderer never constructs provider-specific gateways.

## Readiness Flow

```ts
client.getReadiness(): Promise<HostRuntimeReadiness>
```

Renderer behavior:

- May call readiness on app load or before submit.
- Displays `configured`, provider/model labels, and redacted reason.
- Does not block capture if readiness is unavailable.
- Must not display secrets, raw env values, or raw provider diagnostics.

## Submit Flow

```ts
client.transcribeCapturedAudio({
  runId,
  audioPath,
  mode,
  allowProviderCall,
  provider,
  model,
  language,
})
```

Renderer rules:

- `audioPath` comes from captured artifact relative path/path evidence.
- Default UI path uses `mode: "dry-run"` and `allowProviderCall: false` until a later gated real-provider batch changes host behavior.
- No API key, auth header, `.env`, raw provider payload, or secret-looking field may be sent.
- Submit outcome maps to transcript review or recovery guidance.

## Host Response Mapping

`status: "ok"` maps to:

- pipeline terminal done
- transcript review visible
- delivery evidence no stronger than `available` until copy succeeds
- provider/model/latency/request evidence visible if present

Failure statuses map to:

- `setup-error` -> inspect setup
- `provider-error` -> retry transcription when clip available
- `missing-audio` -> record again or inspect artifact
- `empty` -> retry/record again with empty transcript explanation
- `cancelled` -> cancelled terminal state

## Copy Flow

Manual copy uses the transcript available in the current summary.

Rules:

- On clipboard success, mark `deliveryEvidence.status = "copied"`.
- On clipboard failure, keep transcript visible and show recovery.
- Never emit or render `paste_observed`/observed delivery without a future verified observation contract.

## Default Verification Boundary

Default checks must not call providers:

```powershell
npm run test:pipeline -- tests/host-runtime
npm run test:pipeline
npm run build
cd src-tauri && cargo check
npm run visual:check
```

Real provider verification is manual/gated and must confirm:

```powershell
git ls-files artifacts .env
```

prints nothing.
