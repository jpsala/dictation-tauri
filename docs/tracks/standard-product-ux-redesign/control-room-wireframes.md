---
status: complete
updated: 2026-07-17
batch: standard-product-ux-redesign-2
scope: docs-only
---

# Control Room Wireframes

## Browser frame

```text
┌────────────────────┬──────────────────────────────────────────┐
│ Fixvox             │ Page title                 Status          │
│ Personas           │ Short task description                     │
│ Planes y acceso    ├──────────────────────────────────────────┤
│ Comportamiento     │ Filters / search / contextual primary      │
│ Uso                ├────────────────────┬─────────────────────┤
│ Sistema avanzado   │ List or table      │ Selected detail      │
│ Auditoría          │                    │ Contextual actions   │
│                    │                    │ and Pi assistance    │
│ Account menu       │                    │                      │
└────────────────────┴────────────────────┴─────────────────────┘
```

The browser shell has six task destinations. It is separate from Settings and
retains the authenticated browser session, RBAC, recent-auth, preview,
confirmation, audit, and server-side credentials. A status chip reports a human
service category; raw environment, provider, route, and credential data are
not global chrome.

## Destination map

| Destination | Primary task | Main layout | Primary CTA | Progressive disclosure |
| --- | --- | --- | --- | --- |
| Personas | Find a person and understand their effective access | Searchable list-detail | `Invitar persona` when authorized | Device IDs and raw account data are limited to an authorized detail panel |
| Planes y acceso | Assign capabilities, limits, groups, and plans safely | List-detail with an effective-access summary | `Asignar acceso` | Preview precedes apply; technical profile composition stays out of the normal task |
| Comportamiento | Review and change product behavior | Named behavior sections with contextual detail | `Crear cambio` when authorized | Engines/prompts remain in Sistema avanzado; Pi is contextual help only |
| Uso | Understand bounded consumption and operational failures | Table-first, filters, detail drill-in | `Ver detalle de uso` | Cost and quota detail expands from a selected person/plan or period |
| Sistema avanzado | Manage guarded technical configuration | Dense list-detail and tabs | `Crear configuración` when authorized | Engines, prompts, health, IDs, and diagnostics stay here; mutations require preview |
| Auditoría | Inspect sensitive operational history | Filtered event table with a detail drawer | `Filtrar eventos` | Full event context is authorized and redacted; no raw content in ordinary rows |

## Personas wireframe

```text
┌──────────────────────────────────────────────────────────────┐
│ Personas                                      [Invitar persona]│
│ Buscar persona o dispositivo                                 │
├──────────────────────────────┬───────────────────────────────┤
│ Nombre       Acceso  Estado  │ Nombre                         │
│ Persona A    Pro     Activo  │ Acceso efectivo                │
│ Persona B    Básico  Pausado │ Plan, límites y dispositivos   │
│                              │ [ Gestionar acceso ]           │
│                              │ Analizar con Pi                │
└──────────────────────────────┴───────────────────────────────┘
```

List rows identify a person through a display-safe name and status. The detail
is the action context. `Analizar con Pi` is a secondary action scoped to that
person and cannot mutate implicitly.

## Planes y acceso wireframe

```text
┌──────────────────────────────────────────────────────────────┐
│ Planes y acceso                                                │
│ Capacidades y límites que recibe cada persona.                │
├──────────────────────────────┬───────────────────────────────┤
│ Plan / grupo                 │ Acceso efectivo                │
│ Pro                           │ Capacidades                     │
│ Equipo editorial              │ Límites                         │
│                               │ [ Asignar acceso ]              │
│                               │ Vista previa antes de aplicar   │
└──────────────────────────────┴───────────────────────────────┘
```

Assignment exposes a preview inline before confirmation. Publish, rollback,
and role-changing paths retain recent-auth and an explicit confirmation, rather
than relying on the navigation destination.

## Comportamiento and Sistema avanzado

```text
Comportamiento                         Sistema avanzado
┌──────────────────────┐              ┌──────────────────────┐
│ Dictado               │              │ Configuraciones       │
│ Postprocesado         │              │ Engines               │
│ Selección             │              │ Prompts               │
│ Asistente             │              │ Salud y diagnósticos  │
│ Presets               │              │ [Crear configuración] │
└──────────────────────┘              └──────────────────────┘
```

Comportamiento describes outcomes such as dictation, selection, and presets.
It never makes an operator learn an engine or prompt to perform a normal task.
Sistema avanzado is denser by design and is capability-gated; its technical
operations remain previewed, confirmed, and audited.

## Uso and Auditoría

```text
┌──────────────────────────────────────────────────────────────┐
│ Uso                                                           │
│ Periodo [Esta semana]  Persona [Todas]  [Ver detalle de uso]  │
├──────────────────────────────────────────────────────────────┤
│ Persona       Dictado      Acciones      Fallos               │
│ Persona A     …             …             …                    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Auditoría                                                      │
│ Acción [Todas]  Persona [Todas]  Fecha [Rango]  [Filtrar]     │
├──────────────────────────────────────────────────────────────┤
│ Hora          Acción              Actor          Resultado     │
└──────────────────────────────────────────────────────────────┘
```

Usage and audit are table-first. Empty states explain how changing filters or
selecting a period will reveal data. No decorative KPI card grid competes with
the operational task.

## Responsive browser behavior

- At desktop width, the rail, list, and detail pane support fast operator work.
- At medium width, the rail collapses behind a labelled menu; selecting a row
  opens a full-width detail pane with a Back label.
- At narrow width, filters stay above the list, table columns prioritise the
  task, and remaining columns use explicit horizontal scroll. The primary
  contextual action remains visible in the detail header.
- Pi assistance remains contextual in every width. It never becomes a floating
  global chat rail or changes the active task without an explicit user request.

## Accessibility and mutation safeguards

- Tables use real column headers, row selection is keyboard reachable, and a
  detail pane announces its selected entity without exposing raw sensitive data.
- Filters preserve their values on detail navigation and browser Back.
- Preview/confirmation content names the affected product outcome, not a
  backend route. Recent-auth is requested only at the guarded mutation step.
- A viewer sees an explanatory unavailable state, never a disabled control that
  implies a hidden mutation succeeded.
