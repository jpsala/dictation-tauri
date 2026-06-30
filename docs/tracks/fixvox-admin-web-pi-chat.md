---
status: active
started: 2026-06-30
updated: 2026-06-30
priority: high
owner: JP
related:
  - docs/tracks/pi-prod-workspace.md
  - docs/tracks/fixvox-registered-users-opportunities.md
  - docs/tracks/fixvox-tauri-cloud-release.md
  - C:/dev/constelaciones/apps/web/src/routes/admin.pi.tsx
  - C:/dev/constelaciones/apps/web/src/server/pi-rpc.ts
  - C:/dev/infra/docs/runbooks/automations-agents.md
topic: fixvox-cloud-runtime-port
source_refs:
  - /home/jpsal/dev/dictation-tauri
  - /home/jpsal/.local/bin/dictation-tauri-pi
  - /home/jpsal/.local/bin/dictation-tauri-console
---

# Fixvox Admin Web + Pi Chat

## Objetivo

Crear para Fixvox/Dictation Tauri un admin web remoto equivalente en UX/interaction model a `https://turnos.jpsala.dev/admin/pi` de Constelaciones, para que JP pueda operar Fixvox Cloud, usuarios, policies, usage y Pi remoto sin depender de dejar la PC local encendida. JP explicito que el MVP actual todavia **no alcanza**: debe parecerse mucho mas a Constelaciones en sidebar, comportamiento del input, experiencia del chat, streaming, tool logs, session state y componentes interactivos. Copiar el shell/UX/comportamiento genericamente; no copiar funcionalidad propia de turnos/Constelaciones.

URL objetivo preferida:

```text
https://fixvox.jpsala.dev/admin/pi
```

## Decision

Vale la pena para este repo como control room de Fixvox, pero el criterio de aceptacion visual/interactiva es alto: debe sentirse como el `/admin/pi` de Constelaciones. No basta con una mini app funcional si el sidebar, input, chat y activity panel se comportan distinto.

El admin web debe correr en VPS porque necesita poder spawnear Pi/RPC y guardar secretos server-side. El Worker de Cloudflare (`auth-fixvox.jpsala.dev`) sigue siendo runtime/auth/API, pero no puede spawnear procesos ni ejecutar Pi.

## Diferencia Con La Consola Temporal

Se intento crear una consola baja-nivel tipo ttyd/tmux (`fixvox-pi-console.jpsala.dev`) pero no es el destino correcto para producto:

- Eso es una terminal web, parecida a `ssh -t vps dictation-tauri-console`.
- JP quiere algo como Constelaciones: una app admin con `/admin/pi` y acciones de producto.
- El hostname `fixvox-pi-console.jpsala.dev` puede existir como CNAME/tunnel route, pero no debe considerarse producto final; en la ultima verificacion devolvia 404 porque se retiro el ingress de la config del tunnel.
- Existe service local-only `dictation-tauri-pi-console.service` en VPS escuchando `127.0.0.1:7682`; puede quedar como fallback tecnico o retirarse en el cleanup del admin web.

## Capacidades Que Debe Tener

### Pi Chat poderoso

- `/admin/pi` con Pi RPC remoto en `/home/jpsal/dev/dictation-tauri`.
- Capaz de leer/editar repo, correr tests y preparar cambios.
- Acciones peligrosas con confirmacion: push, deploy, policy mutations, secrets, tunnels, systemd.
- Componentes/acciones como Constelaciones: confirmations, pickers, status cards, tool logs, session state, pending UI requests, input behavior, streaming y layout. Esto ya no es "idealmente"; es requisito de producto para que JP lo use como consola principal.

### Operacion Fixvox Cloud

- `/admin/accounts`: listar cuentas registradas por `accountHandle`, policy actual, devices vinculados.
- `/admin/devices`: devices, policies, health, last seen, limits.
- `/admin/policies`: asignar Pro/basic/power, crear/editar templates y groups.
- `/admin/usage`: usage/quota/costo por account/device.
- Mutaciones seguras con confirmacion: assign-account-policy, assign-device-policy, revoke/restore device, policy reset.

### Seguridad

- Admin web llama al Worker con `ADMIN_API_KEY` server-side; nunca exponerlo al browser.
- No imprimir account IDs crudos, emails completos, device IDs completos, tokens, transcripts, selected text ni audio.
- Usar Cloudflare Access o auth admin equivalente antes de exponer el admin.
- React/UI nunca decide seguridad; Worker/host valida capabilities.

## Arquitectura Recomendada

```text
fixvox.jpsala.dev                 -> VPS admin web liviana
fixvox.jpsala.dev/admin/pi        -> Pi Chat RPC remoto
fixvox.jpsala.dev/admin/accounts  -> Accounts/users
fixvox.jpsala.dev/admin/devices   -> Devices/policies
fixvox.jpsala.dev/admin/policies  -> Groups/templates
fixvox.jpsala.dev/admin/usage     -> Usage/quota/cost

auth-fixvox.jpsala.dev            -> Cloudflare Worker runtime/auth/API
```

Implementacion sugerida:

1. Crear app web admin minima en este repo o subdir `admin/fixvox-web/`.
2. Portar/adaptar de Constelaciones todo lo genericamente reutilizable del admin Pi Chat:
   - `apps/web/src/server/pi-rpc.ts` pattern.
   - `apps/web/src/routes/admin.pi.tsx` interaction model.
   - `MessageBubble`, `ToolCard`, `ActivityPanel`, pending UI request cards, input key behavior, session controls y event rendering.
   - Excluir solo funcionalidad de negocio de turnos/Constelaciones.
3. Correr en VPS con systemd user.
4. Publicar con Cloudflare Tunnel/DNS bajo `fixvox.jpsala.dev`.
5. Agregar pantallas accounts/devices/policies/usage usando `scripts/fixvox-admin.mjs`/Worker endpoints como backend inicial.

## Estado Actual

- VPS listo: `/home/jpsal/dev/dictation-tauri`.
- Pi remoto listo: `dictation-tauri-pi`, Pi `0.80.2`.
- Worker deploy desde VPS funciona.
- Admin CLI listo: `scripts/fixvox-admin.mjs` / `npm run cloud:admin`.
- Account-level policy admin deployado en Worker version `6c2501dd-e7af-4e8b-9697-9251aad5c8c3`.
- Primer admin web minimo implementado en `admin/fixvox-web/server.mjs`, con `npm run admin:web`, login por token server-side, `/admin/pi`, Pi RPC, health, accounts/devices proxy y guardrails en prompts.
- Desplegado en VPS como `fixvox-admin-web.service` en `127.0.0.1:8787`, publicado por tunnel en `https://fixvox.jpsala.dev/admin/pi`.
- Login token vive fuera del repo en `~/.config/dictation-tauri/admin-web.env`; no imprimirlo ni commitearlo. Cloudflare Access queda como mejora posterior.
- 2026-06-30: token web rotado porque el anterior fue pegado en el chat; service `fixvox-admin-web.service` reiniciado y login + Pi health validados. Se roto nuevamente despues de una segunda exposicion accidental en chat.
- Checks: `node --check admin/fixvox-web/server.mjs`, `npm run cloud:test` (67/67), `npm run build` OK; VPS health local OK, login OK, `/api/pi-chat/health` OK, `/api/admin/accounts` OK, prompt Pi respondio `FIXVOX_ADMIN_PI_OK`.
- 2026-06-30: Pi Chat mejorado copiando patrones de Constelaciones: layout chat + side panel, tool logs, pending UI requests, abort/new session/get_state controls, admin data buttons y soporte `extension_ui_response` sin esperar respuesta RPC. Desplegado al VPS y validado con prompt `FIXVOX_ADMIN_CHAT_V2_OK`.
- 2026-06-30: Admin web dejo de ser HTML inline y paso a mini app completa con assets versionados en `admin/fixvox-web/public/`: `index.html`, `styles.css`, `app.js`. Incluye sidebar, topbar, chat estilo control room, activity/tool panel, tabs accounts/devices/policies/usage, tablas admin y acciones con confirmacion para assign account/device policy. Server `server.mjs` quedo como API/static host.
- 2026-06-30: se agrego flujo local-first: `FIXVOX_ADMIN_ENV`, `/api/admin/env`, banners `LOCAL`/`PRODUCTION`, confirmacion reforzada `PROD` para mutations production, scripts `npm run cloud:dev:local`, `npm run admin:web:local`, `npm run admin:web:prod`, y playbook `docs/topics/fixvox-local-to-production-workflow.md`. Desplegado en VPS; `/api/admin/env` reporta `production` + `https://auth-fixvox.jpsala.dev` y Pi prompt respondio `FIXVOX_LOCAL_PROD_WORKFLOW_OK`.
- 2026-06-30: login admin mejorado: `/login` ofrece Google OAuth (`/auth/google/start` + `/auth/google/callback`) con allowlist server-side y token fallback. Google secrets/allowlist viven fuera del repo en `~/.config/dictation-tauri/admin-web.env`; el token fallback fue rotado otra vez. Browser smoke inicial fallo con `redirect_uri_mismatch`, se agrego `https://fixvox.jpsala.dev/auth/google/callback` al OAuth client de Google Cloud y se actualizo la allowlist. Browser smoke real en Vivaldi paso end-to-end: Google account chooser -> `/admin/pi`, UI muestra usuario autorizado, `PRODUCTION`, Pi `0.80.2`, accounts cargados.
- Desplegado al VPS y validado: public `/healthz` OK, `/admin/pi` redirige a login, local login OK, `/api/pi-chat/health` OK, accounts OK, prompt Pi `FIXVOX_FULL_ADMIN_APP_OK` OK.
- Feedback JP 2026-06-30: el admin actual sigue distinto al de `C:/dev/constelaciones`; faltan sidebar, comportamiento del input, chat y otros detalles de la experiencia. Se hizo una primera pasada de paridad UX: sidebar estilo AdminLayout claro, header/chat/card/input/activity panel mas cercano a Constelaciones, Enter envia y Shift+Enter baja linea, session state/rename/clone, tool cards tipo details y admin tabs en activity panel. Desplegado al VPS; browser smoke real con Google login activo respondio `FIXVOX_UX_PARITY_OK`. Todavia requiere comparacion visual fina lado-a-lado antes de declararlo completamente equivalente.

## Proximo Paso Para Nueva Sesion

Arrancar con objetivo:

> Llevar `https://fixvox.jpsala.dev/admin/pi` a paridad UX/interaction con `C:/dev/constelaciones/apps/web/src/routes/admin.pi.tsx`, sin copiar negocio de turnos.

Primer small batch recomendado:

1. Estudiar nuevamente `C:/dev/constelaciones/apps/web/src/routes/admin.pi.tsx` y `apps/web/src/server/pi-rpc.ts`.
2. Rehacer sidebar/topbar/chat/input/activity panel para que se comporten como Constelaciones: Enter/Shift+Enter, submit/abort/new session, session state, health chips, scroll behavior, streaming assistant, tool cards plegables, pending UI cards y message bubbles.
3. Mantener tabs/accounts/devices como paneles Fixvox, pero subordinados al layout estilo Constelaciones.
4. Mantener auth Google/server-side, `ADMIN_API_KEY` server-side y confirmaciones production.
5. Validar con browser real/screenshot comparando contra Constelaciones; no declarar completo si visual/comportamiento sigue claramente distinto.
6. Checks: `node --check admin/fixvox-web/server.mjs`, `node --check admin/fixvox-web/public/app.js`, `npm run cloud:test`, smoke remoto Google login + Pi prompt.

## Contrato Agentico Para El Chat

Para que el Fixvox Admin Pi Chat se parezca a Constelaciones no alcanza con CSS: el agente debe trabajar con un contrato de dominio visible para la UI.

- Las respuestas deben preferir componentes accionables cuando haya decision o side effect: confirmacion, selector, status card, tool card, request pendiente.
- El chat debe mantener separacion clara entre conversacion, actividad tecnica y datos admin; no volcar logs/tool output como texto principal salvo que sea resumen util.
- El agente debe usar nombres/entidades de dominio Fixvox: accounts, devices, policies, usage/quota, Worker, Tauri host, VPS admin web.
- Acciones de riesgo siempre como pedido/confirmacion UI antes de ejecutar: production policy/user mutations, deploy, push, tunnel, systemd, secretos.
- No imprimir tokens, raw account IDs/emails completos, device IDs completos, transcripts/audio/selected text.
- El input/chat debe respetar el modelo Constelaciones: Enter envia, Shift+Enter baja linea, streaming incremental, abort visible, new session visible, pending UI requests renderizadas como cards.
- La UI debe mostrar tool activity en panel lateral compacto; si hay muchas tools, resumir/ocultar antiguas para no degradar la lectura.
- Cada tanda de mejora visual debe validarse con screenshot real contra Constelaciones antes de declararse equivalente.

## Guardrails

- No push sin aprobacion explicita.
- No deploy/tunnel/systemd nuevo sin aprobacion explicita.
- Si copiar/adaptar todo lo genericamente reutilizable del UX de `C:/dev/constelaciones` para Pi Chat; no copiar negocio de turnos ni acoplar datos/funcionalidad de Constelaciones.
- No exponer `ADMIN_API_KEY` ni tokens al browser.
- No mutar policies/users sin confirmacion humana.
