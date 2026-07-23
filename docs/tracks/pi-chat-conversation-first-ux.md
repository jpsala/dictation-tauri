---
status: active
started: 2026-07-19
updated: 2026-07-20
priority: high
owner: JP
related:
  - docs/tracks/fixvox-admin-web-pi-chat.md
  - docs/tracks/pi-chat-remote-agent-parity.md
  - docs/topics/ui-design-and-impeccable.md
topic: app-design-loop
---

# Pi Chat — Conversation-First UX

**Estado:** Batch 1 completo; Batch 2 plan-ready, sin implementación autorizada
**Decisión de producto:** layout **ChatGPT + drawer**
**Superficie:** `admin/fixvox-web/public/app.js`, `admin/fixvox-web/public/styles.css`, tests/smokes Admin y, sólo si la hidratación lo exige, el bridge RPC de `admin/fixvox-web/server.mjs`.

## Routing Decision

- **Intent:** plan.
- **Primary engine:** manual staged.
- **Why:** es un rediseño concentrado en una UI vanilla JS/CSS con estados acoplados; conviene avanzar por cortes visuales pequeños y reversibles, no sumar orquestación.
- **Support tools:** screenshots Chrome reales, skill Impeccable/product context, tests Node enfocados, smokes UI existentes, comparación visual y `lens_diagnostics`.
- **Forbidden nesting:** no Taskflow, planner, until-done, council ni subagentes; no implementar durante este plan.
- **Required gates:** cualquier deploy/restart de Admin o smoke productivo necesita autorización separada.
- **Verification:** screenshots multi-viewport + contratos de sesión/stream + tests Admin + diagnostics + `git diff --check`.

## Objetivo y alcance

**Objetivo único:** convertir Pi Chat Admin en una experiencia de conversación de altura completa, similar a ChatGPT y centrada en maximizar el espacio visible para las respuestas, sin perder sesiones, tools, approvals ni capacidades de Trusted Owner Pi.

La evidencia actual explica el problema: en un viewport real de `1128×622`, header, metadata, composer y panel técnico dejan aproximadamente 130 px para la conversación; el breakpoint `max-width:1180px` apila Activity debajo del chat y devuelve el scroll al documento; el panel de sesión domina espacio aunque sea secundario; el composer no funciona como una barra sticky de aplicación; y después de recargar puede verse un `messageCount` existente sin restaurar el transcript. La referencia ChatGPT usa un shell de viewport, transcript central scrollable, composer persistente y navegación/detalles plegables.

No son objetivos de este plan cambiar el runtime/modelo/auth/tools de Trusted Owner Pi, agregar restricciones al agente, rediseñar Personas/Planes/Uso u otras vistas Admin, implementar relay Windows/Chrome, cambiar datos o APIs de negocio, ni desplegar a producción durante la planificación.

## Contrato UX resultante

Pi Chat ocupará el viewport disponible con una topbar de 48–52 px, transcript como único scroll principal y composer siempre visible abajo. El contenido conversacional tendrá un ancho legible de 800–900 px centrado dentro del canvas; las respuestas de Pi serán visualmente silenciosas y sin tarjetas pesadas; los mensajes del usuario usarán una superficie suave; Markdown, código, tablas, listas y links deberán soportar respuestas largas sin recortar ancho ni introducir scroll horizontal global.

La rail de navegación Admin se conserva. Sesiones, cwd, modelo, actividad exhaustiva, nombre/clone y controles técnicos salen del flujo permanente y viven en un drawer overlay cerrado por defecto. Los tool calls aparecen junto al turno como resúmenes colapsables y el detalle completo queda en el drawer. Las UI requests de Pi —confirm, input, select, editor— permanecen visibles y accionables dentro del contexto del turno. El composer crece automáticamente hasta un límite, usa Enter/Shift+Enter, unifica send/stop y mantiene nueva sesión/adjuntos en acciones secundarias claras.

La conversación debe persistir de verdad: al recargar se restaura la sesión activa y el mismo transcript; cambiar, clonar, renombrar o crear sesión no mezcla mensajes, tools ni streams. Antes de implementar hidratación se debe confirmar la fuente canónica soportada por Pi RPC; no se improvisará leyendo archivos arbitrarios desde el browser.

## Batches verificables

| Batch | Entrega acotada | Evidencia de cierre |
| --- | --- | --- |
| **1. Viewport shell** | Reorganizar sólo el layout de chat: `100dvh`, overflow del documento bloqueado en Pi Chat, topbar compacta, transcript flex con scroll propio, composer sticky y Activity oculto por defecto. Mantener comportamiento actual y otras vistas Admin intactas. | Screenshots `1128×622`, `871×625` y `390×844`; composer visible sin scroll documental; transcript dispone de al menos 340 px o 55% del alto a `1128×622`; cero overflow horizontal. |
| **2. Transcript y composer** | Aplicar estilo ChatGPT-like a mensajes, Markdown/code/table, estados empty/streaming/error; composer autosize, send/stop claro, autoscroll que sigue generación salvo que el usuario suba y control para volver al final. | Fixtures de respuesta larga, código y tabla; copy de código; streaming estable; prompt no se pierde; screenshot desktop/mobile; `agent_settled` sigue cerrando el turno. |
| **3. Hidratación y sesiones** | Investigar y fijar primero el contrato canónico RPC/session; restaurar transcript al reload; soportar sesión activa, nueva, rename, clone y switch sin fuga cruzada. Si hace falta backend, exponer sólo una proyección de conversación del owner actual. | Test que reload conserva orden/roles/contenido; `messageCount` coincide con transcript; switch durante idle funciona; switch durante run queda bloqueado o cancelado explícitamente; user/context nunca renderiza como assistant. |
| **4. Drawer y actividad** | Drawer overlay para sesiones/detalles; tool events inline colapsables; detalle técnico completo en drawer; approvals/input/select/editor accesibles dentro del turno; sin columna derecha permanente. | Smoke de drawer abierto/cerrado, 0/1/muchos tools, tool error, approval y cancel; foco vuelve al trigger; Escape cierra; chat conserva ancho y scroll. |
| **5. Responsive, accesibilidad y rollout readiness** | Consolidar breakpoints y eliminar overrides contradictorios; keyboard/focus/ARIA; stress de outputs largos; comparación visual final; preparar receipt y rollback para un deploy posterior, sin ejecutarlo. | Sin overflow en `1440×900`, `1128×622`, `871×625`, `390×844`; navegación completa por teclado; contraste/foco visibles; suite Admin y smokes verdes; screenshots finales y diff revisado. |

Cada batch empieza con un test o fixture reproducible, cambia el mínimo código posible y cierra antes de avanzar. No se mezclará la hidratación de sesiones con el primer corte visual: Batch 1 debe ser CSS/estructura local y reversible.

## Avance

### Batch 1 — Viewport shell (completo, 2026-07-20)

- Pi Chat marca su vista en `body[data-admin-view="chat"]`; el shell `100dvh`, bloqueo de scroll documental, topbar de 48 px, transcript con scroll propio, composer persistente y Activity oculto quedan scoped al chat.
- En móvil, la navegación Admin se conserva como rail horizontal compacta. Las demás vistas mantienen su layout anterior.
- Smoke nuevo: `npm run admin:web:chat-shell:smoke`; valida `1128×622`, `871×625` y `390×844`, sin overflow horizontal, composer visible y transcript por encima del umbral.
- Regresión: `node scripts/admin-web-ui-smoke.mjs`, `node scripts/admin-web-profile-editor-smoke.mjs` y `node --test admin/fixvox-web/server.test.mjs` pasan local/mock.
- Evidencia visual local: `artifacts/admin-web-pi-chat-shell/2026-07-20T12-12-05-164Z/`.

## Riesgos, checks y stop conditions

Los riesgos principales son que el CSS acumulado y sus breakpoints vuelvan a habilitar scroll documental; que una hidratación incorrecta mezcle roles o sesiones; que el autoscroll haga imposible leer respuestas anteriores; que outputs/tool payloads extensos degraden el DOM; que el drawer o composer tapen approvals; y que el rediseño afecte las demás vistas que comparten el shell Admin. Se controlan con fixtures largos, estado de streaming determinista, IDs de sesión explícitos, render de texto seguro existente, drawer overlay y screenshots en cada corte.

Escalera mínima por batch: test enfocado → `node --test admin/fixvox-web/server.test.mjs` y tests UI relacionados → smoke local/mocked de Pi Chat → screenshots de viewports definidos → `lsp_diagnostics`/`lens_diagnostics` → `git diff --check`. Al final también correr `node scripts/admin-web-ui-smoke.mjs` o su reemplazo enfocado y verificar que Personas/Planes/Uso siguen navegables.

Se detiene el batch si aparece cualquiera de estas condiciones: un evento user/context se muestra como respuesta assistant; la hidratación requiere exponer filesystem arbitrario o datos de otra sesión; se mezclan streams/tools/mensajes al cambiar sesión; composer o UI request queda inaccesible; vuelve el scroll del documento en la vista chat; hay overflow horizontal; se pierde stop o `agent_settled`; el área visible de resultado queda debajo del umbral; otra vista Admin regresa; o cualquier paso intenta deploy/restart/producción sin gate separado.

## Criterio de done y siguiente corte

El plan queda completo cuando Pi Chat abre con la conversación como superficie dominante, conserva/restaura sesiones, soporta respuestas extensas y actividad plegable, funciona por teclado y en viewports bajos/móviles, y mantiene sin regresiones el Trusted Owner Pi actual. El rollout productivo será un trabajo posterior con screenshot pre/post, backup Admin, health, OAuth owner, prompt no mutante y rollback verificable.

**Próximo batch:** Batch 2 — Transcript y composer, local/provider-free solamente.
**Perfil recomendado:** **Implementador**.
