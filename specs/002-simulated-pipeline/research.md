# Research: Simulated Pipeline

## Decision: Keep Pipeline Core In Pure TypeScript

Rationale: MVP 1 must run without microphone permissions, provider keys, Tauri commands, clipboard insertion, or desktop focus mechanics. A pure TypeScript pipeline can be tested deterministically and reused later from React or Tauri surfaces.

Alternatives considered:

- Rust/Tauri command first: rejected for MVP 1 because no desktop permission or native capability is required yet.
- Browser-only React state: rejected because the UI must not become the only owner of the workflow.
- External runner copied from Fixvox: rejected because Fixvox is a functional reference, not an architecture to port.

## Decision: Use Service Ownership And Event Ledger Before Real Side Effects

Rationale: Cancellation, active-run ownership, and later hotkey/tray/UI entrypoints need one shared runtime contract. A `PipelineService` or equivalent keeps the UI from owning transitions and creates a stable place for no-overlap, cancellation, run ids, events, and summary derivation.

Alternatives considered:

- Keep only a stateless helper function: acceptable for the first success/failure tests, but insufficient once cancellation and active-run rules matter.
- Put run state in React: rejected because hotkeys, tray, tests, and Tauri commands must be able to drive the same workflow.
- Let Tauri own the simulated pipeline now: rejected because no desktop side effect is needed yet.

## Decision: Keep Fixture Behavior Behind Mock Ports

Rationale: MVP 2 will replace mock transcription with real STT over synthetic audio. If MVP 1 reads fixtures directly from every phase, later adapters will force a rewrite. Mock ports keep the same high-level success/error semantics while still allowing the current implementation to stay small.

Alternatives considered:

- Add full `ModelGateway` real adapters now: rejected because MVP 1 must not require providers or secrets.
- Leave fixtures coupled to the whole runner: acceptable only for the earliest batch; should be corrected before audio/STT work.

## Decision: Add A Lightweight Pipeline Test Command

Rationale: The project currently has Playwright visual checks but no focused unit/integration runner for deterministic TypeScript pipeline behavior. MVP 1 success criteria require repeatable success, error, recovery, and cancellation checks.

Alternatives considered:

- Use Playwright for all pipeline checks: rejected because headless browser tests are heavier than necessary for pure state-machine behavior.
- Rely only on `npm run build`: rejected because type checking cannot prove state transition order or failure behavior.
- Custom ad hoc script without assertions: rejected because tasks should close on real pass/fail checks.

## Decision: Use Synthetic Source-Controlled Fixtures Only

Rationale: MVP 1 should be fully automatable and safe to run in any clean checkout. Fixtures can include expected text, simulated selected text, and failure modes as long as they are synthetic and non-sensitive.

Alternatives considered:

- Use local human audio or transcript artifacts: deferred to MVP 2+ because MVP 1 is explicitly before audio.
- Generate fixtures dynamically with provider calls: rejected because MVP 1 must not require provider credentials or external services.

## Decision: Model Delivery As A Simulated Outcome

Rationale: The product must distinguish delivered, copied fallback, uncertain, failed, and skipped outcomes before real paste/clipboard work. Simulating delivery lets tests exercise trust and recovery behavior without Win32 focus or clipboard dependencies.

Alternatives considered:

- Real clipboard copy in MVP 1: rejected because it introduces desktop side effects and permissions before needed.
- Real paste insertion in MVP 1: rejected because delivery assurance belongs in later desktop integration work.

## Decision: Minimal UI Observation Is Allowed But Not Required For Closure

Rationale: The spec allows states to be observable from UI or logs. The first closure should be a deterministic test/runner. A small React state surface may be added later in this feature if it stays compact and follows `PRODUCT.md`/`DESIGN.md`, but it should not expand into app shell, settings, voice dock, or recovery UI.

Alternatives considered:

- Build durable voice dock immediately: rejected because MVP 1 is about pipeline behavior, not final UI.
- No visual state at all: acceptable for early tasks, but less useful if JP wants to see the flow in the app window.
