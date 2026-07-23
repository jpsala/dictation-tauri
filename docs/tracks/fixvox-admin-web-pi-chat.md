---
status: superseded
started: 2026-06-30
updated: 2026-07-20
priority: high
owner: JP
related:
  - docs/tracks/pi-chat-conversation-first-ux.md
  - docs/tracks/pi-chat-remote-agent-parity.md
  - docs/tracks/fixvox-admin-configuration-hub.md
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
- 2026-06-30: se agrego flujo local-first: `FIXVOX_ADMIN_ENV`, `/api/admin/env`, banners `LOCAL`/`PRODUCTION`, confirmacion reforzada `PROD` para mutations production, scripts `npm run cloud:dev:local`, `npm run admin:web:local`, `npm run admin:web:prod`, y playbook `docs/topics/fixvox-local-to-production-workflow.md`. Luego se agrego `npm run admin:web:local -- -Mock` / `FIXVOX_ADMIN_MOCK=1` para pulir UI/chat en localhost sin Worker/Pi/VPS: auto-login mock, health/session/tools y data admin fixture. Desplegado en VPS; `/api/admin/env` reporta `production` + `https://auth-fixvox.jpsala.dev` y Pi prompt respondio `FIXVOX_LOCAL_PROD_WORKFLOW_OK`.
- 2026-06-30: login admin mejorado: `/login` ofrece Google OAuth (`/auth/google/start` + `/auth/google/callback`) con allowlist server-side y token fallback. Google secrets/allowlist viven fuera del repo en `~/.config/dictation-tauri/admin-web.env`; el token fallback fue rotado otra vez. Browser smoke inicial fallo con `redirect_uri_mismatch`, se agrego `https://fixvox.jpsala.dev/auth/google/callback` al OAuth client de Google Cloud y se actualizo la allowlist. Browser smoke real en Vivaldi paso end-to-end: Google account chooser -> `/admin/pi`, UI muestra usuario autorizado, `PRODUCTION`, Pi `0.80.2`, accounts cargados.
- Desplegado al VPS y validado: public `/healthz` OK, `/admin/pi` redirige a login, local login OK, `/api/pi-chat/health` OK, accounts OK, prompt Pi `FIXVOX_FULL_ADMIN_APP_OK` OK.
- 2026-07-13: Accounts asocia la sesión Google Admin con la cuenta de producto existente por `sub` estable y `accountHandle` hasheado, sin duplicar filas ni enviar `sub` al browser. La fila muestra `Tu cuenta`, nombre y email enmascarado; sin match muestra aviso explícito. Smoke local mock completo pasó (63 checks) en `artifacts/ui-spikes/admin-web-ui-smoke/20260713-230707/`. JP aprobó deploy: se sincronizaron solo `server.mjs`, `account-identity.mjs` y `public/app.js`, backup remoto en `~/.local/state/fixvox-admin-backups/admin-current-account-20260713-231143`, service reiniciado activo, health local/public OK y `/admin/pi` redirige a login. Tras nuevo login Google, verificación production read-only confirmó la fila existente `acc_9c8…` como `Juan Pablo Sala · j…@gmail.com · Tu cuenta`, con Pro por Device override, 1 device y controles de account visibles. Luego JP autorizó deploy + mutation: Worker `3caacc64-279f-4209-b4ac-6be9df78e82d` quedó activo y la cuenta pasó a `power-admin` por Account override; Chrome extension verificó `Power Admin`, 1 device y 5 profiles disponibles. No se mutaron prompts, engines, providers ni budgets.
- 2026-07-14: Configuration hub desplegado tras crítica Impeccable y aprobación de JP. Worker `89ac13c1-6f30-4478-9670-ba54abe84cf7` agregó `profileOptions`; Admin Web separa Profiles/Engines/Prompts/Presets/Overrides y Profiles es read-only con Resumen/Acceso/Runtime/Límites. Backup remoto: `/home/jpsal/.local/state/fixvox-admin-backups/configuration-hub-20260714-010506`. Health y Chrome production pasaron con cinco profiles y tabs aisladas; no hubo mutaciones. Track detallado: `docs/tracks/fixvox-admin-configuration-hub.md`.
- Feedback JP 2026-06-30: el admin actual sigue distinto al de `C:/dev/constelaciones`; faltan sidebar, comportamiento del input, chat y otros detalles de la experiencia. Se hizo una primera pasada de paridad UX: sidebar estilo AdminLayout claro, header/chat/card/input/activity panel mas cercano a Constelaciones, Enter envia y Shift+Enter baja linea, session state/rename/clone, tool cards tipo details y admin tabs en activity panel. Desplegado al VPS; browser smoke real con Google login activo respondio `FIXVOX_UX_PARITY_OK`. Todavia requiere comparacion visual fina lado-a-lado antes de declararlo completamente equivalente.
- 2026-06-30 local parity pass pendiente de deploy: `admin/fixvox-web/public/app.js` y `styles.css` acercan mas el shell a Constelaciones: titulo `Chat`, status `Listo` separado de version Pi, iconos de sidebar tipo line icons, `Dashboard`/`Mi cuenta` ya no son destinos muertos, composer con send/abort/new-session separados, tool cards colapsables con toggle de tools anteriores, final-message handling para `message_end`/`turn_end`/`agent_end` y UI requests method-specific (`select`, `input`, `editor`, `confirm`). Screenshot local mock: `artifacts/ui-spikes/admin-parity/20260630-133839/fixvox-admin-after.png`. Se agrego smoke local versionado `npm run admin:web:smoke` que levanta mock server, valida sidebar/chat/admin workbenches accounts/devices/policies/usage/account detail con usuario Google redacted y devices vinculados/device detail con policy options/entity selection hacia chat context y limpieza cross-view/composer Enter vs Shift+Enter/tool activity/UI-context visible+prompt/final-message event/UI request `select`/`input`/`editor`/`confirm`/tablet rail y guarda screenshots/report; passing run `artifacts/ui-spikes/admin-web-ui-smoke/20260630-184805/report.json`. Checks locales admin: `node --check admin/fixvox-web/server.mjs`, `node --check admin/fixvox-web/public/app.js`, `node --check scripts/admin-web-ui-smoke.mjs`, `cd cloud/fixvox-proxy && bun test src/managed-execution.test.ts`, `npm run admin:web:smoke`, `npm run cloud:test`, `npm run build`.
- Decision de tooling UX 2026-06-30: no instalar SuperDesign/Lost Pixel ahora. SuperDesign sirve para inspiracion/variantes pero el repo original no esta activo y no valida calidad; Lost Pixel sirve para visual regression despues de aprobar baseline, no para decidir si el diseño es bueno. Workflow elegido: Impeccable/product-register + Playwright screenshots/smoke local, con council/segunda opinion opcional si la pantalla sigue dudosa. Council externo sobre Accounts coincidio en: header debe seguir la vista, mostrar master list primero, quitar KPIs decorativos/rail tecnico vacio, hacer Pi secundario y mover detalle a patron master-detail. Implementado local: header Accounts, tema light explícito, rail derecho oculto en Accounts, tabla/lista de cuentas como master, detail pane a la derecha, emails completos en admin autenticado/mock, fechas humanas y policy segmented control. Evidencia localhost:3001 `artifacts/admin-web-local-test/20260630-160110/accounts-local-3001.png`; smoke versionado `artifacts/ui-spikes/admin-web-ui-smoke/20260630-190016/report.json`. JP confirmo que este resultado se ve mucho mejor y pidio no perder el metodo: de ahora en mas, para seguir mejorando admin/web usar este loop de herramientas como regla local del track: Impeccable/product-register, screenshot Playwright antes/despues, council/segunda opinion cuando haya dudas de layout, aplicar recomendaciones convergentes en small batches, rerun smoke/build/cloud:test, y dejar evidencia + decision documentada antes de deploy.
- 2026-06-30 Accounts poder de settings por usuario, batch local: se agrego preview/apply de cambio de account policy desde el control segmentado, con impacto legible, cancelacion, aplicacion mock persistente para el server local y smoke `account policy preview/apply`. Luego se agrego capa liviana de `Experimentos`/segments por account para probar variantes sin crear una policy nueva por cada ajuste: chips activos/removibles, chips disponibles para agregar, mock endpoint `/api/admin/accounts/segments`, y `Settings efectivos` que combina policy + experimentos. Evidencia preview policy localhost:3001 `artifacts/admin-web-local-test/20260630-161641/accounts-policy-preview-local-3001.png`; evidencia experiments localhost:3001 `artifacts/admin-web-local-test/20260630-164608/accounts-experiments-local-3001.png`; smoke `artifacts/ui-spikes/admin-web-ui-smoke/20260630-194517/report.json`. Luego se persistio la capa en Cloud control-plane con endpoint real `POST /admin/control-plane/accounts/segments`, `availableSegments` en account list, almacenamiento por accountHandle y sanitizacion/dedupe de segments; server web proxy `/api/admin/accounts/segments` ya usa ese endpoint fuera de mock. Smoke actualizado `artifacts/ui-spikes/admin-web-ui-smoke/20260630-195233/report.json`. JP decidio renombrar el concepto a `Variantes` y que pueda darlas de alta desde UI. Se aplico rename Experimentos -> Variantes en la pantalla, `Agregar variante`, `Crear variante`, labels/descripciones legibles, y endpoint real Cloud `POST /admin/control-plane/accounts/variants` para crear variantes custom (`variantOptions` + `availableSegments`). Smoke cubre toggle de variante y creacion `Ultra fast`; test Cloud cubre crear/asignar variantes. Luego se reordeno arquitectura: `Policies = base estable`, `Variants = overlays reutilizables`, `Groups = targeting/listas`, `Accounts = asignacion + preview`, `Devices = override puntual`. Accounts usa el endpoint publico nuevo `/api/admin/accounts/variants/assign` -> `/admin/control-plane/accounts/variants/assign`; `/segments` queda como alias legacy temporal. La creacion/catalogo se movio visualmente a `Policies y Variantes`, y Accounts queda como superficie de asignacion. Evidencia local Accounts `artifacts/admin-web-local-test/20260630-183041/accounts-variants-create-local-3001.png`; evidencia Policies catalog `artifacts/admin-web-local-test/20260630-184159/policies-variants-local-3001.png`; smoke `artifacts/ui-spikes/admin-web-ui-smoke/20260630-214118/report.json`. Luego se agregaron efectos/overrides visibles por variante: presets (`voiceQuality`, `lowCost`, `debug`, `newUi`, etc.), `effects` en built-ins/custom variants, selector de preset al crear variante, catálogo Policies mostrando efectos, y Accounts/Settings efectivos mostrando los efectos concretos (`voiceMode: best`, `uiVariant: next`, etc.). JP pidio poder editar todo y arrancar de cero: ahora todas las variantes, incluidas las seeded/built-in, se pueden editar o borrar; editar una seeded la convierte en custom override, borrar una seeded agrega tombstone para ocultarla del catálogo, y borrar una variante también la quita de assignments efectivos. `/admin/control-plane/accounts/variants/delete` agregado; `/variants/assign` sigue como endpoint publico de asignacion; `/segments` queda legacy alias temporal. Luego se conectaron Policies con variants por defecto: cada policy puede tener `Default variants` propias; al clickear una policy se edita esa lista, persistida via `/admin/control-plane/policy/variants`, y el orden conceptual queda profile base -> profile included overrides -> group overrides -> account overrides -> device overrides. Tras feedback de JP, se corrigio el salto de scroll al clickear dentro de Profiles y se reordeno la UI: `Policies` pasa visualmente a `Profiles`, primero se muestra el editor de profile granular (`Funcionalidades base` + `Overrides incluidos en este profile`) y el catálogo queda abajo como `Overrides reutilizables`. Accounts ahora habla de `Profile` y `Overrides del usuario`, no de policies/variants como concepto primario. Luego se agrego `Motores de ejecución` por profile, administrado solo por admin: transcripción, post-proceso y transformación de selección con niveles `off/cheap/balanced/premium/custom`; esto modela infraestructura/costo sin exponer modelos al usuario final. Cloud persiste `policyEngines` via `/admin/control-plane/policy/engines` y GET policy/accounts devuelve `policyEngines`. Despues se agrego catalogo editable de motores: `engineOptions` con kind, tier, provider, model, notes, promptKey, promptSummary y source; endpoints `/admin/control-plane/engines` y `/admin/control-plane/engines/delete`; Admin Web muestra `Motores editables`, permite editar/borrar seeded/custom y crear motores custom como `Sonnet JP`, y los profiles seleccionan motor concreto por funcionalidad. Los defaults seeded replican la politica historica recomendada de Fixvox: STT `groq/whisper-large-v3-turbo` con `transcriptBase`, post-proceso `groq/openai/gpt-oss-120b` con `postProcessBase`, transform/translate `groq/llama-3.3-70b-versatile` con `selectionTransformBase`/`translateBase`, assistant barato `groq/llama-3.1-8b-instant`, y opciones premium OpenRouter Sonnet como no-default para cuentas habilitadas. La infraestructura de pricing OpenRouter/Groq ya existe en cloud (`pricing-*`) y ahora el Admin Web la conecta al catalogo de motores: `/api/admin/policies` adjunta `pricing`/`pricingWatchlist`, `/api/admin/pricing/refresh` proxya `/admin/pricing/refresh` usando keys del Worker sin imprimirlas, y cada motor muestra status, checkedAt, unit type y precios input/output/audio cuando el snapshot tiene datos. En mock local se muestran precios fake seguros para validar UI; en non-mock depende de pricing snapshot real actualizado. Evidencia browser CRUD `artifacts/admin-web-local-test/browser-check-variant-crud.png`; evidencia policy default variants `artifacts/admin-web-local-test/browser-check-policy-default-variants-panel.png`; evidencia Profiles/overrides `artifacts/admin-web-local-test/browser-check-profiles-overrides.png`; evidencia motores `artifacts/admin-web-local-test/browser-check-profile-engines.png`; evidencia catalogo motores `artifacts/admin-web-local-test/browser-check-engine-catalog.png`; evidencia defaults historicos `artifacts/admin-web-local-test/browser-check-historic-engines.png`; evidencia pricing en motores `artifacts/admin-web-local-test/browser-check-engine-pricing.png`; smoke `artifacts/ui-spikes/admin-web-ui-smoke/20260701-111554/report.json`. Checks verdes admin/cloud: `npm run admin:web:smoke`, `npm run build`, `npm run cloud:test` (72 pass). Runtime/preflight: `/v2/execution/preflight` ahora resuelve el motor efectivo del profile y devuelve `profile` + `engines` (`selectedKind`, `selected`, `byKind`) con provider/model/promptKey/promptSummary; acepta `engineKind` opcional para distinguir `postprocess` vs `selectionTransform` en `aiAction`. Defaults por profile quedan cerrados: `alpha-basic` usa STT Groq Whisper Turbo y postprocess/transform off; otros profiles usan los motores historicos balanceados. Se agrego binding opt-in en `/v1/chat/completions`: si el caller manda `X-Fixvox-Engine-Kind: postprocess|selectionTransform`, el proxy resuelve el motor del profile para `X-Device-Id`, sobreescribe `model` hacia el provider/model configurado, usa Groq/OpenRouter segun el motor, y rechaza motores off/no configurados. También `/v1/audio/transcriptions` resuelve siempre el motor `transcription` del profile para `X-Device-Id`, reemplaza el `model` del multipart hacia el motor configurado y rechaza motores STT off/proveedor no soportado para audio. Tests agregados en `managed-execution.test.ts`: `returns the profile engine selected for the requested execution kind`, `chat completion proxy binds requested profile engine model` y `audio transcription proxy binds requested profile transcription engine`. Primer slice de la arquitectura final sugerida: Prompts pasan a ser catalogo first-class editable separado de Engines. Cloud devuelve `promptOptions` junto a `engineOptions`, agrega endpoints `/admin/control-plane/prompts` y `/admin/control-plane/prompts/delete`, y Admin Web muestra `Prompts editables` con version, kind, summary y contenido completo editable. Prompts built-in seeded: `transcriptBase`, `postProcessBase`, `selectionTransformBase`, `translateBase`, `assistant.quickChat`, `none`; los motores siguen referenciando `promptKey`. Segundo slice prompt-runtime: `/v1/chat/completions` con `X-Fixvox-Engine-Kind` ahora resuelve `engine.promptKey` contra `promptOptions` y aplica el contenido como system prompt controlado por Cloud, reemplazando cualquier system prompt del caller; setea `X-Fixvox-Resolved-Prompt` en el request interno y conserva el modelo resuelto por profile. Telemetry/request events y response headers ahora incluyen `engineId` y `promptId` (`X-Fixvox-Engine-Id`, `X-Fixvox-Prompt-Id`) para chat y audio transcription, permitiendo auditar costo/calidad por motor y prompt. Los tests `chat completion proxy binds requested profile engine model` y `audio transcription proxy binds requested profile transcription engine` validan modelo, prompt inyectado y headers de engine/prompt. Primer slice Budget & Limits: `policyBudgets` por profile con `dailyUsd`, `monthlyUsd`, `mode: block|warn`, endpoint `/admin/control-plane/policy/budget`, Admin Web `Budget del profile`, smoke de edicion de budget, defaults pro/alpha-full/alpha-basic, y runtime guard para chat/audio que bloquea con 402 `budget_exceeded` cuando el device ya supero el budget diario/mensual persistido en request events. Test nuevo `chat completion proxy blocks profile when budget is exceeded`. Usage/cost UI slice: telemetry diaria agrega `byEngine`, `byPrompt` y `byProfile`; request events/search incluyen `profileId`, `engineId` y `promptId`; response headers exponen `X-Fixvox-Profile-Id`; Admin Web Usage ahora muestra `Uso, costos y budgets` con tablas `Por engine`, `Por prompt` y `Por profile`. Account budget override slice: Accounts detail agrega `Budget override del usuario`, endpoint `/admin/control-plane/accounts/budget` y proxy `/api/admin/accounts/budget`, account rows devuelven `accountBudget`, runtime usa `accountBudget` como override efectivo antes que `policyBudgets`, y budget errors incluyen `budgetSource: account|profile`. Test nuevo: `chat completion proxy uses account budget override before profile budget`. Groups/targeting primer slice: Cloud/Admin agrega `groupOptions`, `account.groups`, built-ins `friends`, `private-alpha`, `trial`, `paid`, endpoints `/admin/control-plane/groups` y `/admin/control-plane/accounts/groups`, proxy `/api/admin/groups` y `/api/admin/accounts/groups`; Accounts muestra panel `Groups`, permite toggle de grupos por cuenta y crear grupos custom como `Beta testers`. Slice runtime de Groups 2026-07-01: Groups ya afectan runtime como targeting de profile. Built-ins `paid`/`friends` apuntan a `pro`, `private-alpha` a `alpha-full` y `trial` a `alpha-basic`; grupos custom pueden llevar `policyId`. La resolución efectiva queda `base -> group -> account -> device` para preflight/register/engine binding/budgets, y `profile` devuelve `policySource`, `groups` y `matchedGroup` para auditoría. Evidencia visual previa: `artifacts/admin-web-local-test/browser-check-prompt-catalog.png`, `artifacts/admin-web-local-test/browser-check-profile-budget.png`, `artifacts/admin-web-local-test/browser-check-account-budget-override.png`, `artifacts/admin-web-local-test/browser-check-groups-targeting.png`, `artifacts/ui-spikes/admin-web-ui-smoke/20260701-131156/fixvox-admin-workbench-usage.png`; smoke nuevo: `artifacts/ui-spikes/admin-web-ui-smoke/20260701-155805/report.json`; UI muestra profile efectivo y source (`Base profile`, `Group targeting`, `Account override`, `Device override`) en tabla/detalle/Settings efectivos, grupos muestran target runtime `→ Profile`, y el renderer reemplazo `innerHTML` por `setHtml` central para satisfacer pi-lens `no-inner-html`; checks actuales `npm run build`, `npm run cloud:test` (77 pass), `npm run admin:web:smoke`, `cd cloud/fixvox-proxy && bun test src/managed-execution.test.ts` (28 pass), `lens_diagnostics mode=all` sin errores. Deploy production aprobado por JP con "ok" y ejecutado 2026-07-01: `npm run cloud:deploy` publico Worker version `30699929-1641-4bf7-8ced-71d9a8940f20`; se sincronizaron `cloud/fixvox-proxy/src`, `admin/fixvox-web/*` y `scripts/admin-web-ui-smoke.mjs` al VPS, se reinicio `fixvox-admin-web.service`, `https://fixvox.jpsala.dev/healthz` OK, `/admin/pi` redirige a `/login`, `fixvox-admin accounts 5` muestra `groupOptions` con `policyId/policyLabel` y account efectivo redacted, remote `npm run cloud:test` 77 pass. Smoke production read-only 2026-07-02 via Chrome Pi: `/admin/pi` autenticado con Google carga Accounts, account Pro con Device override y 1 device; `/api/admin/policies` responde source `stored`, 10 engines, 6 prompts, pero sin `userSettingsDefaults.selectionPresets` ni prompts `preset.*`. No se ejecutaron mutaciones; evidencia `artifacts/admin-web-prod-smoke/20260702-readonly-admin-prod/report.json`. Luego JP aprobó `Deploy + mutation`: `npm run cloud:deploy` publicó Worker version `ef52d391-b052-4a16-a128-7ba231254579`, se sincronizó `admin/fixvox-web/*` al VPS y se reinició `fixvox-admin-web.service`; mutation prod `POST /admin/control-plane/policy/selection-presets` publicó los cuatro starters (`como-yo-es`, `corregir-texto`, `fix-writing`, `like-me-en`) y prompts `preset.*`. Verificación Chrome Pi: `selectionPresets.count=4`, prompts `preset.*` presentes, `promptOptions=10`, `engineOptions=10`; health 200; `npm run cloud:test` 79 pass. Evidencia `artifacts/admin-web-prod-smoke/20260702-readonly-admin-prod/post-deploy-selection-presets-report.json`.

## Plan Control Room Accounts / Devices / Policies / Usage

Objetivo inmediato: convertir el admin de Fixvox en un control room operativo donde JP pueda trabajar por pantalla o por Pi Chat sobre las entidades reales del dominio.

### Fase A - Local Mock Rapido

- Sidebar cambia el panel principal, no solo el panel derecho.
- `Accounts`: cards/listado completo, detalle seleccionable, devices vinculados, policy efectiva y accion segura de asignar policy.
- `Devices`: cards/listado completo, account/policy/status/last seen, accion segura de asignar policy.
- `Policies`: explorer visual con cards, detalle, capabilities, quotas/model routing cuando existan, editor local/mock con diff antes de guardar.
- `Usage`: metric cards + tabla por account/device, con alertas visuales.
- Pi Chat debe conocer el contexto visual: pantalla activa + entidad seleccionada, para poder responder/operar sobre ella.
- Validacion: browser localhost mock, sin Worker/Pi/VPS real.

### Fase B - API Real Readonly

- Conectar las pantallas al Worker real a traves del server admin, siempre con `ADMIN_API_KEY` server-side.
- Mantener datos redacted en browser.
- Agregar detalle real donde el Worker ya lo exponga; si falta endpoint, documentar gap y crear endpoint en batch separado.

### Fase C - Mutaciones Seguras

- Account/device policy assignment ya existe: moverlo del prompt/panel chico a acciones de pantalla.
- Policy create/edit requiere primero endpoint Worker explicito con tests: draft -> diff -> confirmacion -> persistencia.
- En production exigir confirmacion `PROD`; en local/mock permitir guardar solo en memoria.

### Fase D - Chat Como Orquestador

- Desde chat: "mostrame accounts", "abrí policy pro", "compará alpha-basic vs pro", "prepará una policy beta".
- Renderizar respuestas como componentes: cards, diffs, confirmaciones y botones.
- Nunca ejecutar push/deploy/systemd/tunnel/policy mutations sin confirmacion explicita.

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
