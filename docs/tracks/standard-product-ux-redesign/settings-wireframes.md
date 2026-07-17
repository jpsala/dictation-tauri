---
status: complete
updated: 2026-07-17
batch: standard-product-ux-redesign-2
scope: docs-only
---

# Settings Wireframes

## Desktop frame

```text
┌──────────────────┬──────────────────────────────────────────┐
│ Dictation        │ Section title                              │
│                  │ Short outcome-oriented summary             │
│ General          │                                          │
│ Cuenta           │ [Selected setting group]                   │
│ Dictado          │ label + control + concise help             │
│ Atajos           │                                          │
│ Presets          │ [Save changes] when a save is needed       │
│ Privacidad       │                                          │
│ Ayuda            │                                          │
│ Avanzado         │                                          │
└──────────────────┴──────────────────────────────────────────┘
```

The rail is a single selection group, not a collection of cards. The selected
section owns the title and primary task. System-wide save appears only when
changes are staged; otherwise a control confirms its own outcome inline.

## Section map

| Section | User task and primary content | Primary CTA | Secondary actions | Progressive disclosure |
| --- | --- | --- | --- | --- |
| General | Startup, dock visibility, and ordinary app behavior | `Guardar cambios` when dirty | `Restablecer esta sección` | Rare startup detail stays under an expandable explanation |
| Cuenta | Redacted identity, plan/limits, devices, session | `Cerrar sesión` only for session task | `Administrar dispositivos`, `Abrir Control Room` if capable | Raw identifiers never appear; technical account state stays in Avanzado |
| Dictado | Microphone, audio, auto-stop, cues, delivery preferences | `Guardar cambios` when dirty | `Probar micrófono`, `Restablecer` | Advanced audio detail is collapsed; no provider configuration |
| Atajos | Dictation/action shortcuts and conflict recovery | `Guardar atajo` while editing | `Restablecer recomendado`, `Cancelar` | Recorder state is host-owned and described in human terms |
| Presets | Available product presets and capability-gated choices | `Aplicar preset` | `Quitar selección`, `Ver cómo funciona` | Provider/model routing is absent |
| Privacidad | Local history, retention explanation, clearing local data | `Borrar historial` when selected | `Cancelar`, `Ver qué se guarda` | Destructive confirmation is inline and specific |
| Ayuda | Human service status, guided recovery, documentation | `Resolver un problema` | `Copiar diagnóstico seguro`, `Ver ayuda` | Technical diagnostic category is opt-in and redacted |
| Avanzado | Redacted diagnostics and power-user tools | `Copiar diagnóstico seguro` | `Abrir Control Room` if capable, `Volver a Ayuda` | All infrastructure details remain masked; no repair path for normal setup |

## Tauri compact variant

```text
┌──────────────────────────────────────────────┐
│ ‹ Ajustes                 Cuenta              │
│                                              │
│ Tu cuenta                                         │
│ Plan y límites disponibles para esta           │
│ computadora.                                  │
│                                              │
│ [ Dispositivos ]                              │
│                                              │
│ Cerrar sesión                                 │
└──────────────────────────────────────────────┘
```

At widths below the visible-rail threshold, the header contains a labelled
section picker. It opens a native-looking menu/list with the eight full labels,
not icon-only tabs. Returning from a nested page restores the selected section
and scroll position. A section never presents a browser-only two-column layout.

## Key task wireframes

### Cuenta

```text
┌──────────────────────────────────────────────┐
│ Cuenta                                        │
│ Configurá tu sesión y esta computadora.       │
│                                              │
│ Nombre de cuenta              Plan disponible │
│ [ Dispositivos ]                              │
│                                              │
│ Cerrar sesión                                 │
│ ──────────────────────────────────────────── │
│ Control Room (solo administración)            │
│ [ Abrir Control Room ]                        │
└──────────────────────────────────────────────┘
```

A Control Room entry is absent without the administrative capability. It opens
the authenticated browser, never embeds an admin webview or transfers admin
credentials to the desktop app.

### Atajos

```text
┌──────────────────────────────────────────────┐
│ Atajos                                        │
│ Elegí cómo iniciar el dictado.                │
│                                              │
│ Dictado                 Alt+Space  [ Cambiar ]│
│ Acción rápida            Alt+Q      [ Cambiar ]│
│                                              │
│ Conflictos se muestran con una explicación.   │
│ [ Guardar atajo ]       Cancelar              │
└──────────────────────────────────────────────┘
```

Changing a shortcut enters one focused recorder state. Host registration,
conflicts, and persistence remain host-owned. The screen does not show native
registration logs.

### Privacidad

```text
┌──────────────────────────────────────────────┐
│ Privacidad                                    │
│ El historial local se puede borrar cuando     │
│ quieras.                                      │
│                                              │
│ Historial local                  18 elementos │
│ [ Borrar historial ]                          │
│                                              │
│ Ver qué se guarda                             │
└──────────────────────────────────────────────┘
```

`Borrar historial` expands an inline confirmation with `Borrar historial` and
`Cancelar`. It describes the scope without showing transcript contents.

## Focus, empty, and error behavior

- Initial focus lands on the section heading after rail navigation, then the
  first task control. Keyboard arrows move within the rail; Tab moves into the
  content without a focus trap.
- An unavailable capability leaves its row visible only when explaining why a
  related product function is unavailable. It never exposes policy internals.
- Empty devices, presets, or history use a sentence explaining the next safe
  action, not an empty decorative card grid.
- Errors stay near the relevant control with human recovery copy and one
  contextual retry. Service recovery routes to Ayuda or first-run when the
  account context is invalid.
