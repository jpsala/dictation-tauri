---
status: complete
started: 2026-08-15
updated: 2026-08-15
priority: high
owner: JP/OMP
related:
  - docs/topics/app-design-loop.md
  - docs/tracks/settings-window-and-ui-foundation.md
  - PRODUCT.md
  - DESIGN.md
source_refs:
  - src/settings/SettingsSurface.tsx
  - src/settings/settings-heroui.css
  - src/settings/user-preferences-control.ts
  - src/settings/dictation-experiment-control.ts
  - src/settings/hotkey-edit-contract.ts
  - src/settings/preset-store-control.ts
  - src-tauri/src/settings_window.rs
  - src-tauri/tauri.conf.json
  - tests/settings/settings-surface.test.tsx
---

# Settings Architecture Redesign

## Objetivo

Convertir Settings en una superficie compacta, fácil de explorar y mantenible sin cambiar las autoridades host-owned, los contratos Cloud ni el comportamiento runtime de dictado. El corte debe reducir carga cognitiva, eliminar el monolito React y permitir evolucionar cada sección sin acoplarla a las demás.

La entrega es una migración completa, no un scaffold: shell modular, información reorganizada, secciones principales rediseñadas, comportamiento actual preservado y pruebas/smoke de la ventana Tauri real.

## Problema Comprobado

Inspección de código y ventana Tauri real del 2026-08-15:

- `src/settings/SettingsSurface.tsx`: 1780 líneas, 39 llamadas a `useState`, 11 `useEffect`, 9 invocaciones Tauri directas y 10 ramas de sección.
- El mismo componente actúa como shell, router, loader, store temporal, controlador de formularios, coordinador de errores y vista de nueve dominios.
- `src/settings/settings-heroui.css`: 444 líneas y aproximadamente 227 tokens/selectores `.settings-*`.
- La ventana configurada en `720x480` muestra scroll en el rail de nueve secciones; `Avanzado` queda debajo del pliegue.
- General usa paneles anidados para dos switches; Dictado usa tarjetas altas para cuatro modos; Atajos duplica `Actual`/`Nuevo` y exige un paso explícito de comprobación; Presets mezcla selección cotidiana y editor avanzado.
- Las cargas se disparan parcialmente por sección activa y la ventana puede recrearse o reutilizarse según lifecycle. La frescura entre cambios desde dock/tray y Settings necesita un contrato observable, no timing implícito.
- Los tests existentes protegen mucho markup/source estático. Faltan contratos de interacción para reapertura, sincronización por evento, rollback, dirty drafts y navegación/foco.

## Decisiones Cerradas

1. **Migración modular, no reescritura.** Conservar APIs y controladores host existentes; extraerlos detrás de controladores/hooks de sección.
2. **Sin segundo store durable.** Rust y los stores host-owned siguen siendo autoridad. React mantiene snapshots y drafts solamente.
3. **Sin engine genérico de formularios.** Hotkeys, login, vocabulario, preferencias y presets tienen comportamientos distintos. Reusar primitivas visuales, no convertir dominios en un schema universal.
4. **Settings cotidiano separado de administración avanzada.** No duplicar Control Room, catálogo de engines/prompts/profiles ni autoridad Cloud.
5. **Un solo panel activo.** No montar secciones ocultas ni cargar catálogos que no pertenecen a la sección visible.
6. **Guardado explícito según semántica.** Radios/switches simples guardan inmediatamente con feedback y rollback. Hotkeys y drafts complejos usan aplicar/cancelar sólo cuando hay cambios.
7. **Diseño compacto y calmo.** Reducir cajas y texto repetido; mantener superficie clara, acento cálido y controles familiares. No UI AI-SaaS ni dashboard técnico.
8. **No romper ventanas especiales.** Dock, companion, Laboratory y overlays conservan shell y comportamiento propios.
9. **Lifecycle nativo existente.** No reintroducir botón Close custom ni `prevent_close`; respetar la X nativa y el flujo de recreación de Settings.
10. **Geometría prudente.** La composición debe seguir siendo usable a `720x480`. Puede subirse el default hacia `820x600` sólo si el smoke real demuestra mejora y conserva un mínimo compacto; el antecedente durable registra que JP rechazó una ventana sobredimensionada.

## Arquitectura Objetivo

```text
src/settings/
├─ SettingsSurface.tsx              # shell fino y compatibilidad de montaje
├─ settings-registry.ts             # metadata, grupos, keywords y orden
├─ shared/
│  ├─ SettingsPage.tsx
│  ├─ SettingsGroup.tsx
│  ├─ SettingRow.tsx
│  ├─ SettingNotice.tsx
│  └─ SettingsSearch.tsx
├─ controllers/
│  ├─ use-user-preferences-controller.ts
│  ├─ use-account-controller.ts
│  ├─ use-hotkeys-controller.ts
│  ├─ use-startup-controller.ts
│  └─ use-actions-controller.ts
└─ sections/
   ├─ AccountSettings.tsx
   ├─ DictationSettings.tsx
   ├─ HotkeySettings.tsx
   ├─ ActionSettings.tsx
   ├─ VocabularySettings.tsx
   ├─ ApplicationSettings.tsx
   ├─ PrivacySettings.tsx
   ├─ HelpSettings.tsx
   └─ AdvancedSettings.tsx
```

Los nombres pueden ajustarse a convenciones existentes, pero las fronteras no:

- `SettingsSurface` sólo resuelve shell, navegación, búsqueda, sección activa y composición.
- Preferencias compartidas usan un único controller renderer que hace `get`, escucha `settings://user-preferences-changed`, aplica respuesta host y revierte cambios optimistas fallidos.
- Account, hotkeys, actions y vocabulary poseen sus cargas/drafts/errores dentro de su sección o controller.
- Cada sección recibe props tipadas de dominio; no un objeto `any` ni un bag universal.
- `busyAction` global desaparece. Cada dominio expone loading/saving/error propio.
- No mantener aliases, componentes deprecated ni el JSX monolítico después de migrar todos los callers/tests.

## Arquitectura De Información

### Navegación principal

1. Cuenta
2. Dictado
3. Atajos
4. Acciones
5. Correcciones
6. Aplicación

Grupo utilitario al pie:

- Privacidad y datos
- Ayuda
- Avanzado

Cambios de copy cerrados:

- `General` → `Aplicación`
- `Presets` → `Acciones`
- `Privacidad` → `Privacidad y datos`

La navegación debe caber sin scroll en la geometría mínima normal. Usar filas de aproximadamente 36–38 px y separar visualmente el grupo utilitario.

### Sección inicial

- Cuenta si la instalación necesita login/vinculación.
- Última sección usada si la cuenta está lista.
- Dictado como fallback inicial.

La memoria de última sección puede ser renderer-local no sensible; no crear persistencia durable nueva si el lifecycle actual permite conservarla en la ventana. Si se persiste, usar el store de preferencias existente sólo con migración host-owned explícita.

### Búsqueda

Agregar `Buscar ajustes…` con `Ctrl+F`. Índice local estático derivado del registry: label, summary, keywords, section y target. Elegir un resultado abre la sección, desplaza y enfoca el control. Sin Cloud ni provider.

## Contrato Visual Compartido

- Una página: header corto + grupos; no card exterior alrededor de toda la sección y otra card por cada fila.
- `SettingRow`: label, descripción opcional breve y control alineado. Divisores antes que cajas anidadas.
- Máximo un nivel de contenedor visual por grupo.
- Eliminar badges que sólo repiten `Aplicación`, `Audio y entrega`, `Teclado` o `Acciones`.
- Estados success/warning/danger sólo para resultados reales, no para selección ordinaria.
- Foco visible, labels accesibles, navegación completa por teclado y `prefers-reduced-motion` preservado.
- Inputs y copy deben caber en español; no truncar la decisión principal.

## Secciones Prioritarias

### Dictado

Cuatro grupos compactos:

1. **Modo**: radio list de Según mi perfil, Rápido, Limpieza segura y Completo. Una línea de explicación por opción. La selección global usa `user_preferences`; no decide recipes en renderer.
2. **Escucha**: micrófono/config disponible, mejora de volumen, autocierre y duración de silencio.
3. **Entrega**: método, revisar antes de entregar, seguimiento de foco y Enter después de pegar.
4. **Feedback**: mute durante grabación y sonidos.

Laboratory aparece como notice/acción secundaria separada. Si existe override next/session, mostrar que reemplaza temporalmente el modo global y permitir abrir/finalizar por rutas existentes. No convertir la selección cotidiana en experimento.

### Atajos

- Lista directa `Acción / combinación / Cambiar`.
- Click en Cambiar inicia la captura host-owned existente.
- Mostrar combinación candidata y validación/conflicto inline.
- Validar automáticamente; no exigir `Comprobar atajo` como paso ceremonial.
- Aplicar/cancelar sólo si cambió.
- Mantener candidatos, preview, rollback, verify y persistencia en Rust; renderer nunca registra shortcuts globales.
- No ejecutar smokes físicos de hotkeys sin autorización explícita.

### Acciones

Vista cotidiana:

- lista de acciones;
- enabled;
- picker key/hotkey;
- duplicar/eliminar;
- orden/estado si el contrato actual lo soporta.

La edición de body/provider/model/metadata debe quedar detrás de `Editar detalles avanzados` y sólo si la capability existente la autoriza. No presentar routing local como efectivo cuando es server-owned. No crear editor de recetas de dictado, engines, prompts libres ni modelos libres.

### Aplicación

Filas compactas para:

- iniciar con Windows;
- mostrar dock al iniciar;
- skin/apariencia del dock si el contrato actual ya lo expone.

No ejecutar ni cambiar autostart durante tests/smoke sin autorización.

### Cuenta, Correcciones, Privacidad, Ayuda y Avanzado

Conservar comportamiento y autoridad actuales, pero migrar a las nuevas primitivas. Cuenta no debe mostrar detalle de infraestructura. Avanzado conserva Control Room capability-aware y redacted. Privacidad usa confirmación de producto no bloqueante cuando se reemplace `window.confirm`, sin borrar datos reales durante smoke.

## Plan Mínimo De Ejecución

### Paso 1 — Contrato secuencial

El coordinador fija primero, en una sola pasada:

- registry y tipos de navegación/búsqueda;
- shell y shared primitives;
- controller compartido de user preferences;
- contratos de props por sección;
- tests base del shell, sync host y navegación.

No delegar arquitectura superior. Este paso desbloquea la paralelización real.

### Paso 2 — Un batch paralelo

Con los contratos cerrados, fan-out en un único batch:

- **Shell UX:** rail agrupado, búsqueda, sección inicial/deep links y geometría.
- **Dictado:** nueva composición y Laboratory separado.
- **Atajos:** lista/editor inline sobre APIs host existentes.
- **Acciones:** lista cotidiana + advanced disclosure.
- **Resto:** Cuenta, Correcciones, Aplicación, Privacidad, Ayuda y Avanzado sobre primitivas compartidas.
- **Contratos de prueba:** interacción y accesibilidad por slice, sin suites globales.

Los agentes deben implementar y editar en una pasada, no validar. Pueden tocar archivos compartidos; el coordinador integra. No serializar slices sólo para evitar overlap.

### Paso 3 — Integración y cierre

El coordinador:

- elimina monolito/estilos muertos;
- migra todos los tests/callers;
- revisa copy y autoridad;
- ejecuta checks focales una vez;
- lanza Tauri real provider-free;
- inspecciona cada sección, navegación, búsqueda, resize y reapertura;
- corrige defectos materiales;
- deja la app local corriendo para revisión de JP.

## Criterios De Aceptación

### Arquitectura

- `SettingsSurface.tsx` queda como shell fino; ninguna sección de dominio grande permanece inline.
- No hay estado global `busyAction` compartido entre dominios.
- No existe segundo store durable ni duplicación de autoridad Rust/Cloud.
- Cada sección carga sólo recursos necesarios y desmonta/limpia listeners propios.
- Todos los imports/callers/tests migrados; sin aliases deprecated.

### UX

- Rail completo visible sin scroll en la geometría normal aprobada.
- Cuenta, Dictado, Atajos, Acciones, Correcciones y Aplicación son encontrables sin comprender implementación.
- `Ctrl+F` encuentra un ajuste y enfoca el control exacto.
- Dictado presenta cuatro modos compactos y separa overrides Laboratory.
- Atajos se cambia desde la fila con validación inline y sin paso redundante.
- Acciones no expone edición avanzada accidentalmente.
- Cambios simples muestran saving/saved/error y revierten ante fallo.
- Drafts complejos avisan antes de perder cambios al navegar/cerrar.
- Reabrir Settings y cambiar preferencias desde tray/dock mantiene snapshots coherentes.
- Teclado y tecnología asistiva pueden recorrer nav, resultados, controles, notices y acciones.

### Visual

- Sin paneles anidados innecesarios ni badges repetitivos.
- General/Aplicación no desperdicia la mayor parte del viewport en dos switches.
- Dictado y Atajos son usables en `720x480`; cualquier aumento de default se valida comparativamente.
- Screenshot real de cada sección prioritaria y estados loading/error/dirty donde puedan simularse sin efectos externos.

## Verificación

Checks mínimos finales, una sola vez por coordinador:

```powershell
npx vitest run --config vitest.config.ts tests/settings
npm run build
cd src-tauri && cargo fmt --check && cargo check
bun scripts/context-index.ts && bun scripts/agent-context-audit.ts
```

Además:

- tests de interacción para navegación, búsqueda, sync por evento, rollback, hotkey candidate y dirty drafts;
- smoke Tauri real provider-free desde tray/dock;
- no micrófono, provider, hotkey físico, clipboard, selección, paste, autostart, login, borrado real, Control Room externo ni producción;
- Computer Use sólo para la app desktop real y con screenshots frescos;
- no browser para esta superficie nativa.

## Límites

- No tocar runtime de transcripción, recipes, perfiles, Cloud schema, Control Room, production ni release.
- No implementar recomendaciones contextuales por app, editor de modos/recipes ni sync Cloud nuevo.
- No cambiar shortcuts reales, autostart, historial real o cuenta durante smoke.
- No imprimir secretos, rutas privadas, transcripts, prompts ni payloads provider.
- No revertir cambios existentes del selector global/dock ni trabajo ajeno en el working tree.
- El working tree contiene cambios locales del lote de modos/dock; no hacer commit/push blanket. Integrar sin borrar ni adjudicarse esos cambios. No deploy, release ni instalación.

## Evidencia De Diseño Requerida

Antes de cerrar:

1. Screenshot Settings actual como baseline.
2. Screenshot final de Aplicación, Dictado, Atajos y Acciones.
3. Comparación a tamaño mínimo y default.
4. Inspección de foco/teclado y reapertura.
5. Resumen exacto de archivos, contratos host preservados, tests y smoke ejecutado.

## Cierre

Implementado el 2026-08-15. `SettingsSurface` quedó como shell fino sobre
registry, búsqueda, primitivas compartidas y secciones/controllers host-owned.
El smoke Tauri provider-free abrió Settings desde tray, recorrió las secciones
prioritarias, validó `Ctrl+F` con foco exacto, resize compacto y reapertura por
la X nativa. Evidencia: `artifacts/settings-architecture/20260815/`.