---
name: aos-doctor
description: Run a read-only health check of the local Agentic OS. Use when JP says `doctor AOS`, `estado del AOS`, `/doctor`, or asks whether focus, references, generated context, skills, or Pi adapters have drifted.
---

# AOS Doctor

Run the canonical doctor from the repository root:

```powershell
bun run aos:doctor
```

Treat errors as blocking AOS drift. Warnings are optimization or maintenance work and do not authorize product changes, installs, commits, deploys, or deletion.

The implementation and contracts live in `scripts/aos-doctor.ts` and `scripts/lib/`; do not duplicate them in this skill.
