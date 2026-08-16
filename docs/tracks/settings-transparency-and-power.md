---
status: complete
started: 2026-08-15
updated: 2026-08-15
priority: high
owner: JP/OMP
related:
  - docs/tracks/settings-architecture-redesign.md
  - PRODUCT.md
  - DESIGN.md
source_refs:
  - src/settings/SettingsSurface.tsx
  - src/settings/settings-registry.ts
  - src/settings/section-contracts.ts
  - src/settings/shared/
  - src/settings/controllers/
  - src/settings/sections/
  - src/settings/settings-heroui.css
  - tests/settings/
---

# Settings Transparency And Power

## Objetivo

Hacer Settings más entendible, transparente y poderoso sin otra reestructuración visual ni nuevas autoridades. Cada ajuste relevante debe explicar qué controla, cuál es su valor efectivo, de dónde proviene, dónde persiste, cuándo surte efecto y por qué puede estar bloqueado. La búsqueda debe funcionar como navegación operativa; Avanzado debe ofrecer diagnóstico seguro basado sólo en estado real disponible.

La entrega es completa: contratos compartidos, copy y relaciones entre secciones, procedencia y persistencia visibles, búsqueda accesible con deep links, dependencias/conflictos honestos, previews locales útiles, estado efectivo redactado, tests y smoke Tauri real provider-free.

## Decisiones Cerradas

- Mantener las nueve secciones, su orden y el shell modular actual. No agregar dashboard, command palette ni nueva navegación primaria.
- `Dictado` conserva su nombre. `Acciones` se muestra como **Acciones de texto** y `Correcciones` como **Vocabulario y correcciones**; los IDs estables `actions` y `vocabulary` no cambian.
- Preferencias simples continúan con guardado inmediato y rollback. Acciones/hotkeys conservan borrador o apply explícito. La UI unifica el lenguaje de estado, no el mecanismo host-owned.
- La procedencia nunca se infiere: si una autoridad no expone source/scope/effect, se muestra sólo lo comprobable o `Origen no disponible`; no se fabrica estado managed/cloud/profile.
- `SettingRow` es la primitive única para metadata, bloqueo y relación contextual. No crear una segunda familia visual.
- Deep links internos usan `#settings?section=<id>&target=<targetId>` y preservan `#settings` como entrada válida. Sólo aceptan section/target presentes en el registry.
- El diagnóstico de Avanzado se arma con datos ya disponibles y redactados. No agrega comandos Rust/Cloud salvo que un dato requerido ya tenga una API host-owned segura y focal; no expone IDs sensibles, rutas privadas, payloads ni secretos.
- Preview sólo cuando reduce riesgo y puede producirse localmente: dock, combinación de hotkey y ejemplo estático de acción. Nunca simular resultado de provider.
- Reset/import/export quedan fuera salvo que ya exista una operación host-owned segura con preview exacto. No implementar placeholders.

## Contratos A Cerrar Antes Del Fan-out

### Metadata de ajuste

```ts
export type SettingSource = "default" | "local" | "cloud" | "managed" | "unavailable";
export type SettingScope = "device" | "account" | "profile";
export type SettingEffect = "immediate" | "next-dictation" | "restart";

export type SettingProvenance = {
  source: SettingSource;
  scope?: SettingScope;
  effect?: SettingEffect;
  detail?: string;
};

export type SettingAvailability =
  | { state: "available" }
  | { state: "disabled"; reason: string }
  | { state: "managed"; reason: string };
```

`SettingRow` acepta `provenance`, `availability`, `relation` y `status`; los omite si no hay evidencia. Los labels visibles y accesibles de source/scope/effect salen de maps centrales exhaustivos.

### Persistencia

```ts
export type SettingsPersistenceState =
  | { status: "idle" }
  | { status: "loading"; target: string }
  | { status: "saving"; target: string; scope?: SettingScope }
  | { status: "saved"; target: string; scope: SettingScope }
  | { status: "dirty"; count: number }
  | { status: "error"; message: string; rolledBack: boolean };
```

Los controllers traducen su estado existente a este contrato. No duplicar máquinas de estado ni disparar timers por fila. Mensajes exactos: `Guardando…`, `Guardado en esta computadora`, `<n> cambios sin guardar`, y error con rollback explícito.

### Registry y navegación

`SettingsSearchTarget` incorpora `sectionLabel`, `keywords`, `valueSummary?` y relaciones opcionales sin duplicar IDs. El parser/serializer de deep links vive junto al registry y valida section + target como una unidad. `SettingsSurface` conserva el dirty guard antes de navegar por búsqueda o deep link.

### Estado efectivo

Definir un DTO frontend redactado, compuesto sólo desde controllers/props reales:

```ts
export type EffectiveSettingsSnapshot = {
  account: readonly EffectiveSettingItem[];
  dictation: readonly EffectiveSettingItem[];
  hotkeys: readonly EffectiveSettingItem[];
  application: readonly EffectiveSettingItem[];
};
```

Cada item lleva label, valor seguro, procedencia comprobable y estado. La serialización para clipboard queda fuera porque clipboard no está autorizado en este lote; el diagnóstico se puede seleccionar manualmente como texto.

## Implementación En Tres Pasos

### Paso 1 — Contrato secuencial único

El agente principal implementa y prueba los contratos anteriores antes de delegar:

1. Extender `section-contracts.ts`, `SettingRow`, `SettingNotice` y CSS compartido.
2. Crear maps exhaustivos de labels para procedencia/scope/effect y una presentación compacta accesible.
3. Adaptar `use-user-preferences-controller` a `SettingsPersistenceState` sin cambiar load/save/subscribe, optimismo ni rollback.
4. Extender registry con nombres finales, sinónimos, relaciones y parser/serializer de deep links.
5. Fijar helpers puros para formar el snapshot efectivo y diagnóstico redactado.
6. Agregar tests de contrato que congelen truthfulness, validación de deep links y ausencia de datos no comprobables.

Este paso es la única barrera. Una vez que compila y sus tests focales pasan, ejecutar todo el Paso 2 en un único batch paralelo.

### Paso 2 — Un fan-out de cuatro slices independientes

#### Slice A — Dictado y Aplicación

- Aplicar procedencia `local/device` sólo a preferencias realmente guardadas por `user-preferences-control`.
- Mostrar efecto `immediate`, `next-dictation` o `restart` según comportamiento real; investigar el host antes de etiquetar.
- Mostrar estados globales de guardado/rollback sin repetir notices por fila.
- Agregar relaciones Dictado → Laboratory y Aplicación → Atajos sólo donde sean pertinentes.
- Preview local de skin/densidad del dock sin montar el dock real ni cambiar preferencias.
- Copy exacto sobre qué controla y qué no controla cada grupo.

#### Slice B — Atajos y Acciones de texto

- Mantener captura/apply host-owned y dirty guard actuales.
- Hacer conflicto, candidato, disponibilidad y razón de bloqueo visibles y accesibles.
- Mostrar procedencia y alcance sólo si los controllers actuales lo prueban.
- Unificar `dirty`, `saving`, `saved` y error con el contrato compartido.
- Agregar ejemplo estático entrada → salida para acciones cuando la definición local lo permita; marcarlo como ejemplo y nunca llamar provider.
- Agregar relaciones Acción → Atajos y Atajo → Acción mediante targets del registry.

#### Slice C — Comprensión, búsqueda y navegación

- Aplicar labels finales **Acciones de texto** y **Vocabulario y correcciones** sin cambiar IDs.
- Revisar summaries de las nueve secciones para explicar fronteras en una frase.
- Mejorar búsqueda: ranking determinista, sinónimos, agrupación por sección, highlight seguro, valor actual opcional y estado activo.
- Teclado completo: ArrowUp/ArrowDown, Enter, Escape en dos etapas y retorno de foco coherente.
- Deep links validados `#settings?section=&target=`; actualizar URL al navegar sin romper `#settings`, dirty guard ni apertura Tauri.
- Enlaces contextuales reutilizan el mismo callback de navegación; no anchors paralelos.

#### Slice D — Avanzado y diagnóstico efectivo

- Renderizar `Estado efectivo del dictado` desde el DTO compartido: perfil/modo/idioma sólo cuando estén disponibles, preferencias locales, atajos registrados y estado seguro del host.
- Distinguir `No disponible` de `No configurado`.
- Presentar diagnóstico redactado como texto seleccionable, sin botón clipboard.
- Conservar las acciones explícitas existentes a Laboratory/Control Room y sus capability gates.
- Privacidad y Ayuda explican alcance local/account y dirigen al diagnóstico cuando corresponda.
- No agregar reset, export, provider, login ni comandos host nuevos falsos.

Cada slice modifica sus secciones y tests focales. Los subagentes no ejecutan formatter, lint, build, cargo ni suites; el agente integrador valida una sola vez al terminar el batch.

### Paso 3 — Integración y verificación única

1. Integrar los cuatro slices y resolver copy/estados duplicados en primitives/controllers, no con CSS especial por sección.
2. Eliminar selectors, helpers, tipos y tests obsoletos; no dejar aliases ni compatibilidad muerta.
3. Ejecutar tests focales Settings, TypeScript/Vite build y `cargo fmt --check && cargo check` sólo si cambió Rust o contratos Tauri.
4. Ejecutar smoke Tauri real provider-free desde tray a geometría `720×480`:
   - recorrer las nueve secciones;
   - comprobar procedencia, persistencia y razones disabled;
   - buscar `dock`, `silencio`, `acción`, `vocabulario` y `diagnóstico` con teclado;
   - abrir un deep link válido y rechazar uno inválido;
   - provocar sólo un rollback con adapter/test, nunca con datos reales;
   - revisar preview local, dirty guard y estado efectivo;
   - cerrar con X nativa, reabrir y comprobar restauración segura.
5. Capturar evidencia final de Dictado, Aplicación, Atajos, Acciones de texto, búsqueda y Estado efectivo en `artifacts/settings-transparency/<run-id>/`.
6. Corregir defectos materiales encontrados, rerun sólo del check afectado y dejar la app local abierta para revisión.

## Tests De Contrato Requeridos

- `SettingRow` omite metadata no comprobable y anuncia razones disabled/managed.
- Controller de preferencias conserva update optimista, concurrencia, eventos externos y rollback; el estado público dice dónde se guardó.
- Registry mantiene IDs/orden y labels nuevos; aliases/sinónimos no crean targets duplicados.
- Parser de deep links acepta sólo pares section/target registrados y conserva `#settings`.
- Búsqueda rankea coincidencia de label antes de keyword, soporta diacríticos y teclado completo.
- Navegación por resultado/deep link respeta dirty guard y enfoca el target exacto.
- Atajos muestran candidato/conflicto sin capturar teclado en React.
- Acciones distinguen ejemplo local de ejecución real y no llaman provider.
- Estado efectivo no contiene secretos, session paths, tokens, payloads Cloud ni valores inventados.
- SSR/provider-free de las nueve secciones conserva loading, empty, denied, read-only, saving y error.

## Criterios De Aceptación

Una persona puede determinar en menos de diez segundos para cada ajuste principal:

- qué controla;
- cuál es el valor efectivo;
- de dónde proviene cuando el sistema lo sabe;
- dónde se guarda;
- cuándo se aplica;
- por qué está bloqueado;
- qué sección o acción segura permite entenderlo o cambiarlo.

Además:

- búsqueda y deep links llegan al control exacto con teclado;
- todos los estados de persistencia son honestos y consistentes;
- Avanzado explica el estado efectivo sin exponer datos sensibles;
- no hay nuevas autoridades, provider calls, side effects físicos ni placeholders;
- el rail completo sigue visible a `720×480` y la densidad permanece compacta;
- el monolito no reaparece y cada sección conserva lifecycle/cleanup propios.

## Límites Y Gates

- No browser.
- Permitido: app Tauri local, tray, navegación, resize, foco, clicks y evidencia visual provider-free.
- Prohibido: micrófono, audio real, provider, login, hotkeys físicos, autostart, clipboard, selección, paste, borrar datos reales, Control Room externo, producción, deploy, release e instalación.
- No tocar runtime de transcripción, recipes, perfiles, schemas Cloud ni contratos de producción.
- El working tree es compartido y contiene cambios locales ajenos del selector de modos/dock. No revertirlos, no adjudicárselos y no hacer commit/push blanket.
- No publicar ni crear PR.

## Evidencia Y Entrega

Entregar:

- archivos exactos por contrato/slice;
- decisiones de procedencia y efecto con evidencia del host;
- tests/checks y resultados exactos;
- screenshots finales;
- defectos encontrados y correcciones;
- confirmación de que Fixvox Tauri queda abierto localmente para revisión.

## Cierre 2026-08-15

- Paso 1 cerró contratos compartidos de metadata, persistencia, deep links y
  estado efectivo; el Paso 2 se ejecutó en un único batch paralelo de cuatro
  slices; el Paso 3 integró sin crear nuevas autoridades.
- Procedencia y efecto se muestran sólo cuando los controllers o el host los
  prueban. La ausencia queda como `Origen no disponible`, `No disponible` o
  `No configurado`; el diagnóstico redacta tokens, rutas, IDs y payloads
  sensibles.
- Checks finales: `npx tsc --noEmit`; Settings `16` archivos / `72` tests;
  `npm run build`; `cargo fmt --check && cargo check`; `npm run check` con cero
  errores y cuatro warnings documentales preexistentes.
- Smoke Tauri provider-free: nueve secciones, cinco búsquedas por teclado,
  navegación contextual, preview local, estados efectivos, cierre con X nativa
  y reapertura segura. El usuario actual no expone capability para editar
  acciones, por lo que el dirty guard se verificó con SSR/contract tests y no
  se fabricó un permiso.
- Evidencia: `artifacts/settings-transparency/20260815-dev-smoke/`. La app local
  queda abierta en Avanzado para revisión.

### Pulido posterior al smoke

- El smoke visual a geometría compacta eliminó encabezados duplicados, compactó
  el contador de acciones y separó historial de resultados de diagnóstico
  seguro.
- `SettingsSurface` conserva el último `FixvoxCloudStatus` comprobado y lo
  comparte con Cuenta, Acciones, Ayuda y Avanzado. Antes, Cuenta podía mostrar
  estado actualizado mientras Ayuda seguía mostrando `No disponible`.
- Verificación: TypeScript, Settings `16` archivos / `72` tests y build Vite
  pasaron. Evidencia en
  `artifacts/settings-transparency/20260815-polish-smoke/`.

- El follow-up visual del Companion clasifica los `401/403` de transcripción
  managed como falta de acceso de cuenta, reemplaza el error HTTP por guía
  segura en español, elimina el falso `Record again` y deja la tarjeta de
  recuperación con altura de contenido. El audio no se reenvía automáticamente.

- Corrección post-autenticación: los modos globales de dictado y los
  experimentos interactivos ya no adjuntan `evaluationRecipeId`. Ese campo está
  reservado al Laboratorio con grant one-shot; enviarlo desde `Completo`
  producía un `403 laboratory_execution_unauthorized` aunque la cuenta estuviera
  conectada. El selector y su mapeo de postproceso se preservan.
