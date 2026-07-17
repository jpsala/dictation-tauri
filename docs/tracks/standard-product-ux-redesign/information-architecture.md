---
status: complete
updated: 2026-07-17
batch: standard-product-ux-redesign-2
scope: docs-only
---

# Information Architecture And Navigation

## Direction

These medium-fidelity wireframes use the current `DESIGN.md` system: restrained,
light product surfaces, compact density, one warm primary action, and no
marketing or dashboard ornament. The historical dark/HeroUI note is a density
reference only, not a visual override.

A person configuring Dictation and an operator administering the product have
different jobs. Settings and Control Room therefore remain separate products.
Persistent navigation is not a decision set on each screen: a screen has one
primary task action and, at most, two secondary actions.

## Product map

```text
Dictation desktop
├── First run
│   ├── Bienvenida → Cuenta → Vinculación → Micrófono → Atajo → Listo
│   └── Recovery: conexión, OAuth, acceso, vínculo, permisos, servicio
├── Dock
│   └── Compact dictation state/action only
└── Settings
    ├── General
    ├── Cuenta
    ├── Dictado
    ├── Atajos
    ├── Presets
    ├── Privacidad
    ├── Ayuda
    └── Avanzado
        └── Abrir Control Room (administrative capability only)

Control Room browser
├── Personas
├── Planes y acceso
├── Comportamiento
├── Uso
├── Sistema avanzado
└── Auditoría
```

## Navigation rules

| Surface | Persistent navigation | Primary task | Progressive disclosure |
| --- | --- | --- | --- |
| First run | Step indicator only, never a free-form wizard menu | Complete the current setup state | Recovery copy and safe exit replace technical diagnostics |
| Settings | Eight named sections in a left rail at desktop width | Change or inspect the selected user-facing setting | Advanced contains redacted diagnostics; Control Room entry is capability-gated |
| Control Room | Six task-oriented destinations in a browser rail | Inspect a list, then act in a contextual detail pane | Technical entities live only in Sistema avanzado; destructive actions require preview/confirmation |
| Dock | No persistent navigation | Start, stop, or recover a dictation | Details open Settings or a recovery companion, never onboarding |

## Labels and ownership

| Current legacy concept | Product label | Surface | Notes |
| --- | --- | --- | --- |
| `Cloud` | `Cuenta` | Settings | Identity, plan, devices, and session only; no policy or runtime internals |
| device registration | Automatic linking | First run | Progress only, no Repair or Refresh action |
| profiles / variants | Planes y acceso | Control Room | Operator task language first; technical definitions appear in Sistema avanzado |
| engines / prompts | Sistema avanzado | Control Room | Hidden from ordinary operator navigation |
| chat | Analizar con Pi / Explicar con Pi | Contextual detail action | Not a primary destination |
| policy / preflight | Estado del servicio | Settings Help or Advanced | Human status in normal path; redacted diagnostics only when expanded |

## Responsive and window rules

| Context | Navigation behavior | Content behavior |
| --- | --- | --- |
| Tauri compact, 720×480 target | Settings rail is visible when width permits; otherwise a labelled section picker replaces it | One scroll region in content; no clipped primary action; footer actions remain in flow |
| Tauri narrow, 480–719 px | Section picker in the header, no icon-only navigation | One setting group per view; preserve Back to settings context |
| Browser, ≥1024 px | Control Room rail plus list-detail or focused workbench | Tables retain key columns; filters stay adjacent to their list |
| Browser, 720–1023 px | Collapsible labelled rail | List becomes first, detail opens inline or as a full-width panel |
| Browser, <720 px | Browser responsive fallback, not a desktop replacement | Horizontal table overflow is explicit; never hide an action behind unlabeled icons |

## Settings wireframes

All desktop sections use the same compact shell: labelled navigation, one title,
one primary task action when the section needs one, and a single content scroll
region. Passive preferences save in place and confirm accessibly; they do not
turn every row into a competing CTA.

```text
┌──────────────────────────────────────────────────────────────┐
│ Dictation · Ajustes                                           │
├───────────────┬──────────────────────────────────────────────┤
│ General       │ General                                      │
│ Cuenta        │ Elegí cómo se comporta Dictation al iniciar. │
│ Dictado       │                                              │
│ Atajos        │ [✓] Iniciar con la computadora               │
│ Presets       │ [✓] Mostrar el dock                          │
│ Privacidad    │                                              │
│ Ayuda         │                         Cambios guardados    │
│ Avanzado      │                                              │
└───────────────┴──────────────────────────────────────────────┘
```

| Section | Primary content and contextual action | Disclosure boundary |
| --- | --- | --- |
| General | Startup and dock preferences; changes save in place | No account, microphone, or runtime data |
| Cuenta | Masked identity, plan summary, named devices, `Cerrar sesión` | Logout confirmation stays inline; raw IDs never render |
| Dictado | Microphone, audio feedback, auto-stop, delivery preference | OS permission/result remains host-backed and human-readable |
| Atajos | Current shortcut and `Cambiar atajo` | Recorder/conflict details remain host-owned |
| Presets | Available presets and allowed controls | Unavailable capability explains the outcome, not policy data |
| Privacidad | History summary, retention explanation, `Borrar historial` | Destructive clear gets local confirmation; no raw content preview by default |
| Ayuda | Human service status, guidance, documentation | Advanced diagnostics are linked rather than embedded |
| Avanzado | Redacted diagnostic summary, `Copiar diagnóstico seguro`, capability-gated `Abrir Control Room` | IDs are abbreviated only when diagnostically necessary; no operator configuration |

The compact `480–719 px` layout replaces the rail with a labelled section
picker. It preserves the section title and local context, so a person never
has to remember which setting they opened from another screen.

## Control Room wireframes

Control Room uses a browser workbench, not a settings clone. Every area starts
with its task and then reveals entity detail only in context.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Control Room                                                          │
├──────────────────┬───────────────────────────────────────────────────┤
│ Personas         │ Personas                              [Buscar]     │
│ Planes y acceso  │ ┌───────────────────────────────────────────────┐ │
│ Comportamiento   │ │ Nombre / acceso        Estado                  │ │
│ Uso              │ │ Persona A              Activo                  │ │
│ Sistema avanzado │ │ Persona B              Pendiente               │ │
│ Auditoría        │ └───────────────────────────────────────────────┘ │
│                  │ Seleccioná una persona para ver acceso y equipos. │
└──────────────────┴───────────────────────────────────────────────────┘
```

| Area | List/workbench focus | Contextual primary action | Progressive disclosure |
| --- | --- | --- | --- |
| Personas | Accounts, devices, effective access | `Ver acceso` for the selected person | Device identifiers and sensitive fields only in authorized detail |
| Planes y acceso | Capabilities, limits, groups, assignments | `Revisar cambios` after an explicit edit | Preview, recent-auth, confirmation, then audit before mutation |
| Comportamiento | Dictation, postprocess, selection, assistant, presets | `Revisar cambios` for a scoped behavior change | Engine/prompt implementation details remain in Sistema avanzado |
| Uso | Bounded/redacted consumption, quotas, failures | `Ver detalle` for a chosen interval/entity | Costs and operational dimensions appear only when relevant to the filter |
| Sistema avanzado | Health, engines, prompts, technical configuration | `Revisar cambios` for a guarded configuration change | Server-side credentials and secrets never appear in browser or Pi context |
| Auditoría | Mutation history and evidence | `Ver evidencia` for an authorized record | Sensitive payloads remain redacted; audit has no mutation CTA |

An `Analizar con Pi` or `Explicar con Pi` action may appear in the selected
entity detail after authorization. It explains the current context; it never
replaces the rail, creates an implicit mutation, or exposes hidden data.

At browser widths below 1024 px, the labelled rail collapses and list/detail
become sequential full-width views. Filters remain adjacent to their list;
tables keep explicit horizontal overflow rather than silently dropping data or
actions.

## Accessibility and focus

- Keyboard focus enters the page title, then the primary task action, then the
  main form/list in a predictable order.
- Navigation exposes its current item by text and `aria-current`; status uses
  text plus a semantic icon, not color alone.
- Error/recovery copy receives an announced status region without moving focus
  unless a user action opened an OS or browser handoff.
- Functional text follows the 13 px / 1.35 minimum. No normal surface depends
  on hover-only content or a tooltip for its meaning.

## Wireframe review notes

- First-run has four non-clickable progress labels and no decision set larger
  than two visible actions.
- Settings navigation has eight stable destinations; each selected section
  exposes only its local task and disclosure boundary.
- Control Room navigation has six stable task areas; administration is absent
  from Settings and ordinary desktop setup is absent from Control Room.
- The narrow Tauri and responsive-browser variants retain labels, current
  context, and the primary action without icon-only or hover-only controls.

## Batch-2 acceptance checklist

- Each normal decision presents at most five visible options, one primary CTA,
  and no more than two secondary CTAs.
- Settings contains no operator configuration; Control Room contains no normal
  end-user setup.
- The same task does not require remembering data from another screen.
- First-run and recovery are state-driven, not a generic multi-step form.
- The documents in this batch remain a design input only. They authorize no UI,
  API, OAuth, provider, or production change.
- The wireframes cover all eight Settings sections and all six Control Room
  areas without organizing normal navigation around backend entities.
