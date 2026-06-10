# Research: Synthetic Audio STT

## Decision: Version Manifests And Expected Text, Not Generated Audio

Rationale: Synthetic expected text and manifest metadata are useful across
machines and reviews. Generated audio, transcripts, provider payloads, and
reports can be large, variable, or sensitive once local runs include real or
human reference data. The repo should contain the recipe and contract, not the
entire local run history.

Alternatives considered:

- Commit generated WAV files: rejected for MVP 2 because artifacts can grow and
  may later mix with sensitive local audio.
- Keep all fixtures outside the repo: rejected because repeatability requires a
  versioned manifest and expected text.
- Use product persistence for reports: rejected because MVP 2 is evidence-only,
  not a durable history feature.

## Decision: Use Direct Local ModelGateway First

Rationale: The project already decided on a hybrid `ModelGateway`: mock first,
direct local in MVP 2, proxied later. Direct local keeps the first real STT
adapter small, avoids coupling to Fixvox control-plane details, and still
preserves the port boundary needed for later proxy routing.

Alternatives considered:

- Reuse Fixvox proxy first: deferred because it adds backend/device policy
  questions before the local STT contract is proven.
- Hardcode one provider in the pipeline: rejected because provider choice
  belongs to the adapter, not the pipeline.
- Put provider calls in React: rejected because secrets must not enter UI state
  or browser-visible code.

## Decision: Start With A Local Harness Before Runtime UI

Rationale: MVP 2 closes by evidence. A local script/harness can validate
fixtures, call an adapter, and write reports without adding microphone
permissions, Tauri capabilities, or UI workflows.

Alternatives considered:

- Add Tauri command first: deferred until a host boundary is required for side
  effects or secret handling.
- Add a UI run button first: rejected for closure because UI observation is not
  the source of truth for STT quality.
- Use Playwright for provider checks: rejected because provider calls and audio
  fixture validation do not require browser interaction.

## Decision: Preserve PipelineService Ownership

Rationale: MVP 1 already established cancellation, no-overlap, event ledger, and
summary derivation. Real STT must plug into that service rather than bypassing it
with a benchmark-only path.

Alternatives considered:

- Separate benchmark runner unrelated to pipeline: rejected because results
  would not prove the product runtime contract.
- Let the adapter emit ad hoc logs only: rejected because downstream UI and
  diagnostics depend on typed events and derived summaries.

## Decision: Keep Postprocess Optional And Separate

Rationale: STT validation should remain useful even without a postprocess model.
When postprocess is added, it should be measured as its own adapter stage with
separate provider/model/timing/cost fields.

Alternatives considered:

- Make postprocess mandatory for MVP 2: rejected because it obscures raw STT
  quality and expands provider scope.
- Exclude postprocess entirely: rejected because benchmark reports should leave a
  clean slot for optional measured postprocess.

## Decision: Use Text Normalization For Comparisons

Rationale: STT providers may differ in punctuation, casing, whitespace, and
language marks. A documented normalization policy lets MVP 2 compare expected
text and transcripts without pretending exact bytes are the only useful quality
signal.

Alternatives considered:

- Exact string match only: useful for deterministic mock tests but too brittle
  for real STT evidence.
- Manual visual inspection only: rejected because repeatable evidence is the MVP
  goal.
