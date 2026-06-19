# Research: Runtime Transcription And Delivery

## Decision: Keep Runtime Behind The Existing ModelGateway Boundary

Decision: Implement runtime transcription through the project-owned `ModelGateway`
interface or a thin wrapper around it rather than binding React or pipeline code
directly to one provider SDK.

Rationale: MVP2/MVP3 already introduced `ModelGateway`, `TranscriptionInput`,
`TranscriptionResult`, and the captured-audio adapter. Keeping that boundary lets
provider setup errors, provider failures, request evidence, latency, and model
identity remain typed and redacted before reaching UI or reports.

Alternatives considered:

- Provider SDK directly in React: rejected because it risks exposing secrets and
  couples UI to provider semantics.
- Provider SDK directly in `PipelineService`: rejected because the service should
  own lifecycle/events, not credentials or network details.
- One-off scripts only: rejected because the approved provider smoke proved the
  capability but not product runtime recovery.

## Decision: Use Local Gitignored Artifacts For Evidence, Not Product History

Decision: Keep audio, transcripts, provider payloads, and evidence reports under
`artifacts/microphone-capture/` during development. Runtime summaries may expose
text in memory for review/manual copy, but durable product history remains out of
scope.

Rationale: The constitution and privacy topics require conservative handling of
dictation data. MVP3 already established ignored artifact roots, and the real
provider smoke validated that transcripts/reports can remain local and untracked.

Alternatives considered:

- Store runtime history in app data now: rejected because retention, deletion,
  and UI expectations need a separate product decision.
- Store only event summaries and discard transcript text: rejected for this
  feature because manual review/copy is the core recovery path.

## Decision: Treat Empty Or Unusable Transcript As A Distinct Terminal Outcome

Decision: Add/maintain explicit outcome classification for empty/unusable text
instead of mapping it to success or generic provider failure.

Rationale: A provider can return HTTP success with no useful speech. The user
needs to know whether to retry provider, record again, or copy text. This also
prevents delivery from pretending useful text exists.

Alternatives considered:

- Empty string as successful transcript: rejected because it breaks recovery and
  delivery evidence.
- Provider error only: rejected because an empty transcript can be a valid
  provider response but unusable for the user.

## Decision: Preserve No-Overlap Ownership In PipelineService

Decision: Continue enforcing one active run through `PipelineService` and keep
retry as a new run from the same captured clip after terminal states.

Rationale: Existing tests already protect active run state and event ledgers.
This avoids duplicate provider calls and corrupted evidence.

Alternatives considered:

- Parallel provider calls for the same clip: rejected for first runtime slice
  because retry semantics and cost controls are not yet defined.
- UI-only no-overlap guard: rejected because correctness must hold outside UI.

## Decision: Start Delivery With Review/Manual Copy And Honest Evidence

Decision: A successful transcript first becomes `available`; copy fallback can be
recorded as `copied`; uncertain/failed delivery remains distinct; `paste_observed`
remains forbidden until a verified observation path exists.

Rationale: MVP3 already added delivery-evidence honesty. 005 extends it to real
runtime transcription without overclaiming desktop automation.

Alternatives considered:

- Claim `delivered` on clipboard write: rejected because clipboard/copy is not
  the same as observed paste into a target app.
- Implement global hotkey/focus/paste now: rejected as broader desktop ergonomics
  that should wait until transcription/recovery is reliable.

## Decision: Real Provider Verification Remains Gated And Local

Decision: CI-safe tests use fake gateways and dry-run shells. Real-provider runs
require explicit approval, local credentials, an existing captured clip, redacted
reports, and git checks proving artifacts/secrets are untracked.

Rationale: The project is in personal/dev permissive mode, but dictation data and
credentials are sensitive. Runtime behavior should be testable without external
availability or cost.

Alternatives considered:

- Provider call in default npm scripts: rejected because it would make CI/local
  checks depend on credentials and could leak private dictation data.
- No real-provider path: rejected because SC-001 requires configured local run
  evidence eventually.
