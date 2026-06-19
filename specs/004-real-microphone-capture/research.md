# Research: Real Microphone Capture

## Decision: Start With WebView `getUserMedia` + `MediaRecorder`

**Rationale**: MVP 3 needs explicit manual capture from the app. The browser
media APIs map naturally to the React command surface: `getUserMedia` requests
an audio stream with user permission, and `MediaRecorder` records that stream
into one or more blobs. MDN documents `getUserMedia` as permission-driven and
rejected with clear setup errors such as permission denied or no matching
device. MDN also documents `MediaRecorder` as a MediaStream recorder with
start/stop/data events and MIME support checks.

This keeps the first implementation small: no Rust audio dependency, no sidecar,
and no global desktop controls. It also preserves a clear fallback path if
Windows WebView behavior is insufficient.

**Alternatives considered**:

- Rust audio capture with `cpal` immediately: more control over format and
device behavior, but expands Rust surface, binary/audio complexity, and manual
testing before proving the app-level flow.
- Native/plugin microphone permission wrapper first: useful later if WebView
permission behavior blocks capture, but premature for the first MVP3 plan.
- Reuse synthetic fixtures only: safe, but already achieved by MVP 2 and does
not prove real spoken dictation.

## Decision: Add A Capture Adapter Boundary

**Rationale**: Capture is a desktop/input side effect and should not be owned by
React component state or the transcription provider. A `CaptureGateway` style
contract lets tests use fake capture artifacts, lets WebView capture and future
Rust capture share one shape, and gives the pipeline event ledger capture
metadata without coupling to browser APIs.

**Alternatives considered**:

- Put `MediaRecorder` directly in `PipelineService`: rejected because the core
pipeline should stay browser/desktop agnostic.
- Put all lifecycle in React: rejected because hotkeys/tray/future triggers
would need another implementation path.

## Decision: Persist Captured Audio Only As Local Gitignored Artifacts

**Rationale**: Real microphone audio and transcripts are sensitive local data.
For MVP3 they are development artifacts, not product history. The development
path is `artifacts/microphone-capture/`, which is already covered by the broad
ignored `artifacts/` path from MVP2. If a later implementation moves artifacts
to app-data, that storage policy must be documented before closing that batch.

**Alternatives considered**:

- Store recordings in product history: rejected as out of scope and a privacy
boundary change.
- Keep recordings only in memory: useful for a very small spike, but MVP3
success criteria require a local artifact and reproducible evidence.

## Decision: Use Minimal Tauri Capabilities Only When A Host Command Exists

**Rationale**: Tauri capabilities define which permissions apply to which
windows/webviews, and permissions grant command access. The repo currently has
only `core:default` for the main window. If implementation adds a Rust command
to write capture artifacts or query host state, the command and any permission
surface must be explicit and documented. If WebView capture can run without a
Tauri command, do not expand capabilities.

**Alternatives considered**:

- Broad filesystem plugin permission from the frontend: rejected because it
unnecessarily exposes local filesystem authority to React.
- Inline broad capabilities in `tauri.conf.json`: rejected because the current
repo uses capability files and the Tauri docs recommend keeping capability
configuration well-defined.

## Decision: Delivery Starts As Text Availability / Copy Fallback Evidence

**Rationale**: MVP3 must avoid silent loss, but paste observation is a separate
desktop automation problem. The delivery result can prove text availability or
copy fallback without claiming that a target app received text. This continues
the evidence model established in MVP1/MVP2.

**Alternatives considered**:

- Implement paste observation now: rejected because it adds focus/clipboard/
target-window complexity before microphone capture is proven.
- Make preview mandatory: rejected as a product workflow decision that should
not block first capture.

## Open Risks To Verify During Implementation

- Windows WebView2 may handle microphone permission differently from normal
  browser contexts. First implementation should include a small manual/spike
  check and keep the Rust capture fallback in reserve.
- `MediaRecorder` MIME output can vary by user agent. Implementation should use
  `MediaRecorder.isTypeSupported()` and record actual MIME/extension metadata.
- `getUserMedia()` can remain pending if the user ignores the prompt. UI needs a
  setup/waiting state and cancel path.

## Manual Check: Windows WebView2 Permission Pending

Date: 2026-06-12.

JP explicitly approved the local microphone check for T022-T024. The Tauri dev
app was run with the real `WebViewRecorderGateway` selected only in Tauri, while
browser/CI smoke checks kept the fake gateway. Starting capture called
`navigator.mediaDevices.getUserMedia({ audio: true })` from the Tauri WebView2
runtime.

Observed result:

- The UI entered the `requesting_permission` state.
- No operable WebView2 or Windows microphone permission prompt appeared.
- The request remained pending for more than one inspection interval.
- The in-app cancel control recovered the UI to a cancelled terminal state.
- No captured audio file, transcript, or provider payload was produced.

Conclusion: the WebView2 route is not ready to close the real microphone
start/stop check on this machine as-is. Keep the WebView adapter test-covered,
but plan a follow-up Rust/Tauri capture fallback or an explicit WebView2 media
permission investigation before marking T022 complete.

## Manual Check: Native Rust/Tauri Fallback Works

Date: 2026-06-12.

After the WebView2 permission spike stayed pending, a minimal native fallback was
added behind the existing capture gateway boundary:

- `src-tauri` uses `cpal` for default input capture and `hound` to write WAV.
- Tauri commands are registered for start, stop, and cancel.
- The React app selects the native gateway only when `isTauri()` is true.
- Browser smoke tests and CI-safe flows continue to use the fake gateway.

Observed result:

- The Tauri app entered `Listening` through the native microphone recorder.
- Stopping capture wrote a WAV artifact under
  `artifacts/microphone-capture/audio/`.
- The UI reported `Captured` and displayed the generated `.wav` artifact
  metadata.
- `git status --short --ignored` showed the artifact only through the ignored
  `artifacts/` path; no audio, transcript, or provider payload was tracked.
- No provider was called and no transcript was generated.

Conclusion: MVP3 real microphone start/stop can close through the native
Rust/Tauri fallback. WebView capture remains useful as a tested adapter boundary,
but should not be treated as the active Windows capture route until its
permission behavior is resolved.

## Optional Check: Captured Audio Through Real Provider

Date: 2026-06-19.

With explicit JP approval, the captured WAV artifact was submitted once to a
configured local Groq transcription provider. The check used local credentials
from ignored environment configuration and did not add provider calls to the
default app or npm scripts.

Observed result:

- The provider returned HTTP 200 for the captured WAV artifact.
- A real transcript was written only under
  `artifacts/microphone-capture/transcripts/`.
- A local evidence report was written under
  `artifacts/microphone-capture/reports/` with transcript preview and provider
  request id redacted.
- No raw provider payload was stored.
- `git status --short --ignored artifacts .env` showed `.env` and `artifacts/`
  as ignored only, and `git ls-files artifacts .env` returned no tracked files.

Conclusion: the captured microphone artifact can be transcribed by a real
provider in local/dev mode, but runtime product support still needs a dedicated
post-MVP3 spec so the app owns provider configuration, redaction, retry, and
honest delivery evidence instead of relying on a one-off local check.
