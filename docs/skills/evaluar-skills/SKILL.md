---
name: evaluar-skills
description: Audit an AOS repo's agentic system and propose which commands, topics, tracks, rules, or workflows should become local hybrid skills. Use when JP asks to revisar/evaluar qué se puede pasar a skills, promover algo a skill, crear slash commands desde el sistema agéntico, or inspect whether the repo has skill candidates.
---

# Evaluar Skills

## Workflow

1. Read the repo hot path first: `docs/.generated/context-index.md` if present, `docs/WORKING_MEMORY.md`, then `docs/TOPICS.md`.
2. Open `docs/topics/local-codex-skills.md`; treat it as the canonical rubric.
3. Inspect candidates without loading everything: search `AGENTS.md`, `docs/TOPICS.md`, `docs/topics/`, `docs/tracks/`, and `docs/skills/README.md` for commands, repeated workflows, and named user intents.
4. Classify each candidate as `skill`, `hybrid skill`, `topic`, `active rule`, `track`, or `do not promote`.
5. Produce a shortlist with reason, trigger phrase, canonical source, and risk/cost.
6. If JP asks to implement, create or update only `docs/skills/<name>/`; keep durable logic in topics/scripts/docs and avoid duplicating long procedures.
7. Run `scripts/ensure-skills-link.ps1`, validate changed skills, regenerate the context index, and run the audit.

## Default Recommendation

Prefer hybrid skills for command-like operations. Do not promote global safety rules, broad project knowledge, or one-off work state just to make them discoverable.

Use this compact output shape:

| Candidate | Recommendation | Trigger | Canonical source | Why |
| --- | --- | --- | --- | --- |
| `name` | `hybrid skill` | user phrase | topic/script/doc | short reason |
