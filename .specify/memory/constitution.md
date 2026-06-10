<!--
Sync Impact Report
Version change: template -> 1.0.0
Modified principles:
- Template -> I. Human-Centered Outcomes
- Template -> II. Privacy And Data Boundaries
- Template -> III. Durable Operational State
- Template -> IV. Spec-Led Incremental Delivery
- Template -> V. Surface-Appropriate Design
Added sections:
- Project Constraints
- Development Workflow
Removed sections:
- Project-specific placeholders
Templates requiring updates:
- none
Follow-up TODOs:
- Fill project-specific stack commands after Tauri/frontend manifests exist.
-->
# Dictation Tauri Constitution

## Core Principles

### I. Human-Centered Outcomes

Features MUST be framed around real user or operator outcomes, not around internal implementation convenience. The system SHOULD absorb technical complexity where practical and expose clear workflows, commands, or interfaces appropriate to the people using them.

### II. Privacy And Data Boundaries

Project data MUST be treated conservatively until classified. The repository MUST NOT commit secrets, credentials, private exports, generated local databases, full private message dumps, or unnecessary personal data. Integrations with external systems MUST reuse approved infrastructure instead of duplicating credentials or stores unless a spec explicitly approves a new boundary.

### III. Durable Operational State

Any operational state that matters across sessions, browsers, machines, or workflows MUST live in a defined durable source. Browser storage, temp files, in-memory state, or generated caches MUST NOT become accidental sources of truth. Each project MUST document its persistence model in `docs/DEVELOPMENT.md`.

### IV. Spec-Led Incremental Delivery

Significant features MUST pass through SpecKit before implementation: `spec.md`, `plan.md`, research and data-model updates when relevant, `tasks.md`, implementation, verification, and documentation sync. If implementation changes an architectural or product decision, the relevant spec, plan, data model, or project documentation MUST be updated before closing the work.

### V. Surface-Appropriate Design

Interfaces MUST fit their surface and audience. Internal tools SHOULD be dense, scannable, and operational. Public or customer-facing surfaces SHOULD be clear, trustworthy, accessible, and responsive. UI work SHOULD follow project-specific `PRODUCT.md`, `DESIGN.md`, and local design guidance when present.

## Project Constraints

- Do not commit `.env`, tokens, credentials, local databases, private exports, generated runtime data, or sensitive logs.
- Preserve user changes in dirty worktrees. Do not revert unrelated edits.
- Keep documentation layered and lightweight: `AGENTS.md`, `docs/README.md`, `docs/WORKING_MEMORY.md`, `docs/TOPICS.md`, topics, specs, then historical sessions.
- Each target repo MUST document its stack, commands, storage rules, deployment assumptions, and verification gates in `docs/DEVELOPMENT.md`.
- Audio, transcripts, recognition logs, prompts, corrections, and dictation metadata are sensitive by default.
- External transcription, LLM, sync, or storage services MUST NOT receive dictation data unless a spec and decision explicitly approve the boundary.
- Tauri permissions/capabilities MUST stay minimal and documented in the active spec or `docs/DEVELOPMENT.md`.
- Project-specific build, test, package manager, and persistence rules MUST be added here after the Tauri/frontend stack is confirmed.

## Development Workflow

For each significant change:

1. Update or create the relevant feature spec under `specs/`.
2. Run the planning workflow and update `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, and contracts when relevant.
3. Generate or refresh `tasks.md` with independently executable tasks.
4. Implement by completing tasks in order and marking completed tasks with `[x]`.
5. Verify with the commands documented in `docs/DEVELOPMENT.md`.
6. Update stable project docs when decisions become durable.
7. Commit in coherent snapshots when requested or when the local workflow calls for it.

Small copy edits, emergency fixes, or investigative reads may skip new spec creation, but MUST still respect the constitution and update current specs/docs if they alter behavior or architecture.

## Governance

This constitution is the highest-level rule set for SpecKit work in this repository. `AGENTS.md`, `docs/DEVELOPMENT.md`, `docs/ASSISTANT_RULES.md`, `PRODUCT.md`, and `DESIGN.md` provide operational detail and must be kept consistent with it when present.

Amendments require owner approval, a short rationale, and updates to dependent specs, plans, templates, or project docs when affected. Versioning follows semantic versioning: MAJOR for incompatible governance changes, MINOR for new or materially expanded principles, and PATCH for clarifications that do not change obligations.

Every SpecKit plan and implementation review MUST check privacy, persistence, surface fit, verification, and whether docs/specs/tasks remain synchronized.

**Version**: 1.0.0 | **Ratified**: 2026-06-05 | **Last Amended**: 2026-06-05
