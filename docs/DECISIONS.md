# Decisiones

Registro corto de decisiones durables.

## Aprobadas

### 2026-07-16 - Producto primero para la arquitectura self-hosted

Estado: accepted

Decision: el Worker de Fixvox y sus 73 fixtures HTTP dejan de ser el contrato objetivo del runtime self-hosted. Son inventario histórico y evidencia de migración. La arquitectura canónica se define desde los flujos actuales de Dictation Tauri y Control Room; API, Bun, Tauri y Admin pueden cambiar coordinadamente cuando reduzca deuda o mejore seguridad, claridad y operación.

Invariantes: privacidad y redacción; auth/capabilities fail-closed; secretos fuera del renderer; cuota autoritativa inmediatamente antes de una única llamada provider; cero persistencia normal de audio/transcript raw; audit inmutable; Cloudflare conserva autoridad hasta un cutover aprobado.

Política de transición: no hacer clean slate riesgoso ni retirar una ruta todavía consumida. Cada capacidad se clasifica como `canonical`, `redesign`, `temporary-compat` o `drop`; la compatibilidad legacy sólo existe como puente con consumidor y fecha/condición de retiro. Discord, Telegram, la página Admin embebida y helpers internos de Usage no entran por defecto al producto nuevo.

Consecuencia inmediata: el Batch 2 de paridad de Spec 019 queda reemplazado por una recalibración documental y un mapa de consumidores/capacidades. Checkpoint D cerrará por flujos canónicos provider-free verificados, no por igualdad de las 73 respuestas del Worker. Cambios de runtime/clientes se planifican después y producción/cutover mantienen gates separados. Plan ejecutable: `docs/tracks/fixvox-product-first-self-hosted-contract-plan.md`.

### 2026-07-14 - Profile Composer versionado como única superficie de composición

Estado: accepted

Decision: Profiles evoluciona a un Composer tipado y server-authoritative con `draft -> preview -> publish`, versiones publicadas inmutables, clone, compare y rollback. Cada profile compone Access, Runtime, Limits, User Controls y Defaults. Runtime referencia Engines y Prompts existentes; no duplica provider/model ni contenido de prompts. Cada user setting usa `hidden`, `visible-locked` o `editable`. Groups selecciona profiles; Account puede seleccionar profile o budget; Device conserva solo override operativo excepcional.

Motivo: el editor anterior mezclaba catálogos, usaba un guardado local no durable y presentaba Overrides de una plantilla cerrada que confundían audiencias con cambios de comportamiento. JP quiere una superficie potente para gobernar qué usa cada clase de usuario y qué puede modificar, con diff, impacto y rollback antes de tocar producción.

Límites: no vuelve un editor genérico de Overrides; los datos legacy quedan almacenados y read-only hasta una decisión explícita. Pi puede explicar, comparar y proponer drafts visibles, pero no publicar. Provider/model siguen en Engines y prompt content en Prompts. View, edit y publish serán capabilities separadas y Worker las hará cumplir.

Plan aprobado: implementar en una sesión nueva empezando por el contrato durable de versiones y un vertical slice que renderice un profile existente, cree/guarde un draft real y pruebe que runtime publicado no cambia antes de publish. Track canónico: `docs/tracks/fixvox-admin-profile-composer.md`.

### 2026-07-14 - Publish brokered por Admin Web con OAuth y RBAC

Estado: accepted; implementación local validada el 2026-07-14

Decision: Admin Web pasa a ser el broker server-side de publish/rollback, pero el browser sigue sin recibir credenciales Worker. Google OAuth identifica al operador mediante email verificado; una tabla durable server-side asigna roles `viewer`, `editor`, `publisher` y `owner`. El bootstrap inicial de owner será configuración server-side para `jpsala@gmail.com`. Solo `owner` administra roles y no puede eliminar/demover al último owner. Publish/rollback requieren reauth OAuth reciente, preview visible, confirmación tipada y versiones esperadas. El Worker conserva enforcement por capability key, rechaza confirmaciones stale y registra auditoría de actor/acción/versiones/resultado.

Motivo: una consola separada agrega fricción operativa sin mejorar la protección principal. Un broker server-side permite conservar una única UI, mantener secretos fuera del browser y añadir una elevación explícita, trazable y reversible para los cambios que alteran runtime publicado.

Límites: esta decisión no concede autoridad de publish a Pi ni a roles view/edit, no agrega generic Overrides y no cambia production hasta aprobar deploy. La garantía concurrente sigue siendo single-writer hasta migrar a transacción Durable Object; esa migración es la deuda de la próxima sesión. Validación local: Cloud 113, pipeline 449, build OK, server tests 7 y Admin Web smoke 8818. Plan canónico: `docs/tracks/profile-composer-phase-3-rbac-publish-plan.md`.

### 2026-07-13 - Rutas LLM exclusivas y Settings unificado con Control Room

Estado: accepted

Decision: el dictado normal ejecuta post-process solo cuando la policy lo habilita; un preset activo o una selection transform reemplazan esa etapa y hacen una sola transformación. Postprocess y selection transform usan engines managed por profile mediante `X-Fixvox-Engine-Kind`; provider/model del preset no gobiernan runtime. Settings será capability-aware y ofrecerá a JP/power-admin una entrada al Control Room autenticado existente, sin duplicar su CRUD ni llevar `ADMIN_API_KEY` al cliente.

Motivo: JP necesita control total desde la aplicación y, al mismo tiempo, decidir qué puede ver o mutar cada categoría de usuario. Las rutas exclusivas evitan costo, latencia y reescritura dobles; el Control Plane conserva autoridad sobre modelos/costos y el Admin Web conserva OAuth/secretos server-side.

Alcance inicial: runtime y routing provider-free, capabilities separadas para ver/mutar, provider/model ocultos del editor normal y límites/retención con clear visible. Overrides provider/model por preset quedan fuera hasta existir capability y enforcement Worker explícitos.

Actualización 2026-07-13: la WebView Tauri externa de Control Room quedó en blanco incluso con navegación host-level forzada. JP eligió que la entrada Admin de Settings abra la URL validada en el navegador autenticado. Se preservan las garantías: policy `admin_settings` verificada en Rust, OAuth/credenciales server-side y ningún `ADMIN_API_KEY` en renderer. Worker `3caacc64-279f-4209-b4ac-6be9df78e82d` y la asignación account-level `power-admin` fueron desplegados con aprobación explícita.

### 2026-07-13 - Restringir el renderer con CSP explícita y red host-owned

Estado: accepted

Decision: Fixvox Tauri usa una CSP de producción explícita con recursos locales, `ipc:`/`http://ipc.localhost`, estilos inline requeridos por la UI y sin endpoints cloud en `connect-src`. Las llamadas operativas a Fixvox Cloud siguen siendo host-owned en Rust. Desarrollo agrega solo `ws://127.0.0.1:1420` para HMR local; no se habilitan wildcards HTTPS.

Motivo: el renderer puede invocar capacidades Tauri sensibles; limitar scripts, conexiones, objetos, bases y frames reduce el impacto de una inyección WebView sin ampliar innecesariamente la superficie de red. Tauri 2.11.2 inyecta nonces/hashes durante build y acepta `csp`/`devCsp` separados.

Validación: config test, frontend build, Rust check y debug Tauri build pasan. El startup smoke quedó inconcluso porque tanto el debug nuevo como el release control fallaron por ausencia del marker `main WebView loaded`; esto descarta atribuir el fallo a CSP. Evidencia: `artifacts/startup-smoke/20260713-csp-runtime/` y `20260713-csp-control/`.

Proximo paso: diagnosticar el harness WebView2 por separado; relajar CSP solo ante evidencia runtime que también pase el control.

### 2026-07-11 - Distribuir FFmpeg versionado como sidecar del cliente Windows

Estado: accepted

Decision: Fixvox Tauri distribuye Gyan FFmpeg 7.1.1 Essentials GPLv3 como ejecutable separado y versionado junto a la app Windows x64. El runtime prefiere ese sidecar, lo ejecuta con `CREATE_NO_WINDOW`, conserva fallback a FFmpeg en `PATH` para desarrollo y usa WAV original si la conversión falla. La procedencia, hashes, licencia y referencia al source/build quedan fijados en `src-tauri/third-party/ffmpeg/`.

Motivo: los smokes locales mostraron que MP3 reduce aproximadamente 97% los bytes y mantiene baja latencia incluso en dictados de 2-3 segundos; depender del `PATH` no garantiza ese comportamiento en otra PC. Un sidecar mantiene la compresión reproducible sin sumar bindings/codecs nativos al proceso principal.

Proximo paso: validar físicamente el installer autosuficiente en otra PC antes de publicar; futuras actualizaciones de FFmpeg deben fijar versión/hash y revisar obligaciones de redistribución.

### 2026-07-04 - Simplificar continuidad Pi a `/aos-continuar` post-guardado

Estado: accepted

Decision: AOS deja un unico comando Pi para abrir una sesion/thread nuevo: `/aos-continuar [objetivo]`. JP se hace cargo de correr `/aos-guardar-sesion` primero cuando haya valor durable. `/aos-continuar` no guarda, no compacta, no ejecuta `gol` y no duplica docs: crea una sesion nueva con `ctx.newSession()` y le pasa un prompt de continuidad que referencia `docs/.generated/context-index.md`, `docs/WORKING_MEMORY.md`, `docs/TOPICS.md`, topic/track/spec puntual y estado git. `--preview` abre la sesion nueva con el prompt en el editor sin enviarlo automaticamente.

Motivo: los comandos previos (`/aos-nueva-sesion`, `/aos-continuar-sesion`, `/aos-nueva-sesion-con-gol`, `/aos-continuar-con-gol`, `/aos-siguiente`) mezclaban guardado, handoff y ejecucion, generando ambiguedad. JP quiere revisar/controlar el guardado por separado y tener una continuidad confiable basada en docs vivos.

Proximo paso: usar `/aos-continuar` despues de `/aos-guardar-sesion` y ejecutar `/reload` tras actualizar el adapter Pi.

### 2026-07-04 - Usar internet libremente y pedir permiso antes de instalar

Estado: accepted

Decision: los agentes deben usar web/internet libremente por defecto cuando conocimiento externo o cambiante evite adivinar, priorizando fuentes oficiales y sin enviar secretos, `.env`, codigo privado sensible, datos personales ni credenciales. Si evidencia online contradice el repo local, docs del proyecto o comportamiento observado, deben consultar a JP antes de decidir y presentar ambas evidencias con fuentes e impacto. Para instalar dependencias, CLIs, paquetes de sistema, herramientas auxiliares o binarios/scripts remotos, deben pedir autorizacion explicita con comando exacto, alcance, motivo, riesgos, alternativas, cambios esperados y rollback.

Motivo: JP quiere recuperar poder agente usando conocimiento disponible en internet en vez de inferir de memoria, pero conservar control humano sobre cambios de entorno/instalaciones y sobre conflictos entre fuentes externas y realidad local.

Proximo paso: aplicar la politica desde `AGENTS.md` y `docs/topics/pi-agentic-os.md`.

### 2026-07-03 - Assistant UI se decide solo por AssistantSurface/PipelineUiResult

Estado: accepted

Decision: Las respuestas exitosas de `Lulu ...` no pueden renderizarse desde señales legacy de transcript/review (`resultSource`, `delivery available`, `transcriptReview`, `assistantModeEnabled`). El pipeline debe mapear `AssistantIntentResult` a `AssistantSurface` y luego a `PipelineUiResult`; esa surface es la unica fuente de verdad para UI assistant. Solo `insertText` usa delivery paste Fixvox-like; `notify`, `showMarkdown`, `optionPicker` y `quickChat` se manejan fuera de transcript review/recovery.

Motivo: JP reporto fugas visuales donde assistant success terminaba como Quick Chat universal, `Lulu ready`, `Assistant reply is available`, `Transcript ready`, `RECOVERY` o preview residual en el dock. Centralizar la decision evita que capas de UI reinterpretan assistant como transcript especial.

Alcance: `src/pipeline/ui-result.ts`, `src/pipeline/types.ts`, `src/App.tsx`, `src/assistant/quick-response.ts`, `src/assistant/intent-result.ts` y tests focales. Smokes live en ingles: `artifacts/lulu-assistant-safe-architecture/english-live-20260703-1725/report.json` y `artifacts/desktop-control/dictation-e2e/lulu-arithmetic-en-20260703-1713/report.json`. Proximo paso: logging redacted de `assistant intent/surface/delivery` y Smart Agent/tool loop real.

### 2026-07-03 - Lulu es prefijo dentro de captura, no wake word always-on

Estado: accepted

Decision: Dictation Tauri soporta `Lulu ...` solo como prefijo dentro de una captura iniciada por el usuario (hotkey/dock/Quick Chat), no como escucha permanente de microfono. El prefijo routea el texto posterior a una ruta assistant/Quick Chat review-only: no pega dictado normal, no reemplaza seleccion y no ejecuta side effects externos salvo comandos locales explicitamente soportados o comandos managed/cloud gated por policy.

Motivo: JP quiere recuperar el modo asistente de Fixvox sin el costo de privacidad, energia y ruido de un wake word real always-on. Mantenerlo dentro de capturas iniciadas por usuario conserva el modelo seguro del producto y evita escuchar en background.

Alcance: implementado parser provider-free (`src/assistant/voice-prefix.ts`), Quick Chat local (`src/assistant/quick-response.ts`), tarjeta/input companion, historia local corta, comandos locales reversibles (`activar preset`, `open-settings`, `show-history`) y bridge managed gated `run_assistant_chat` contra Fixvox Cloud cuando la policy permite `assistant_action` + `managed_llm`. Falta streaming/multi-turn rico y comandos cloud/externos; esos deben seguir fail-closed y pedir confirmacion si mutan produccion o sistemas externos.

### 2026-07-02 - Action hotkeys editables son host-owned y persistidos por accion

Estado: accepted

Decision: Los shortcuts de acciones globales `preset_picker` y `paste_last_safe` son editables desde Settings por recorder host-owned, no por registro frontend. Se persisten en app data como `action-hotkey-preferences.v1.json`, se aplican al hook nativo Windows dinamico y mantienen defaults Fixvox-like `Alt+Q` y `Alt+Shift+X`.

Motivo: JP pidio que los hotkeys se editen presionando la combinacion, no eligiendo alternativas fijas. Las acciones picker/paste-last necesitan la misma ergonomia que la dictation key, pero sin colisionar con `Alt+Space`, Escape ni shortcuts reservados.

Alcance: `src-tauri/src/desktop_control.rs` posee preview/apply/readback de action hotkeys, captura nativa generalizada y runtime hook dinamico; `src/desktop-control/tauri-host-control.ts` expone solo comandos Tauri; `SettingsSurface` muestra recorders compactos para dictation key, preset picker y paste-last. Smoke versionado: `npm run action-hotkeys:physical-smoke -- -AllowDesktopSideEffects -StopExisting`; evidencia passing en `artifacts/desktop-control/action-hotkeys-physical-smoke/20260702-action-hotkeys-script-smoke/report.json`.

### 2026-07-01 - Windows Terminal/Tabby son targets explicitos validos, con paste por clipboard

Estado: accepted

Decision: Windows Terminal, Tabby, PowerShell/cmd y otros targets terminal-like no deben reemplazar el cache de una app editable cuando aparecen como foreground incidental, pero si el usuario inicia el dictado con el terminal enfocado deben ser target explicito valido. Para delivery a terminal se usa paste por clipboard restaurado, no `KEYEVENTF_UNICODE`, porque Windows Terminal no expone un textarea/UIA editable confiable y la inyeccion Unicode directa es inconsistente.

Motivo: JP reporto que Windows Terminal funcionaba hasta hace poco; el bloqueo de terminal-like targets protegia el cache pero rompio el caso legitimo de dictar al terminal. La UX esperada es que el target actual gane cuando el gesto empieza ahi, manteniendo proteccion contra focos incidentales de terminal durante tray/menu.

Alcance: `src/delivery/tauri-desktop-delivery.ts` vuelve a retornar terminal current targets; `src-tauri/src/desktop_delivery.rs` usa clipboard paste para terminal-like delivery y restaura/limpia clipboard best-effort. Validaciones unitarias pasaron en `tests/desktop-control/tauri-desktop-delivery.test.ts`, `tests/desktop-control/desktop-delivery-rust.test.ts` y `cargo check`. Falta smoke manual controlado con terminal editable antes de considerar cerrado el dogfood.

### 2026-07-01 - Presets iniciales reales para selection transform

Estado: accepted

Decision: El primer set real de presets para selection transform en Fixvox Tauri es `translate`, `rewrite`, `shorten` y `professional`. El preset activo se muestra/selecciona desde companion/tray y el runtime managed lo convierte en una instruccion concreta antes de llamar `transform_selected_text`; ya no es metadata visual-only.

Motivo: JP quiere acciones rapidas tipo Fixvox sin esperar a Assistant/Quick Chat completo. Estos cuatro presets cubren los casos de mayor frecuencia y mantienen el flujo directo: seleccionar texto -> elegir preset -> dictar/confirmar instruccion -> reemplazo directo con fail-closed.

Alcance: `Alt+Q` picker y hotkeys por preset quedan como siguiente fase; el smoke redacted en Chrome con `PresetId translate` paso en `artifacts/desktop-control/selection-browser-smoke/20260701-browser-chrome-preset-translate-r4/report.json`.

### 2026-07-01 - Admin control-plane usa Profiles, Engines, Prompts, Budgets y Groups

Estado: accepted

Decision: Fixvox Admin/Cloud organiza la configuracion managed como `Account -> Profile -> Engines -> Prompts -> Budgets -> Groups/overrides`. Los usuarios finales no eligen modelos; el admin asigna motores concretos por funcion (`transcription`, `postprocess`, `selectionTransform`), prompts versionables/editables, budgets por profile y override por account. Groups son targeting visible/asignable y tambien pueden resolver runtime profile antes de overrides account/device.

Motivo: JP necesita controlar costo/calidad/rollout por usuario o conjunto sin exponer infraestructura a end users. Separar Profile base, Engines, Prompts, Budgets y Groups permite operar precio, calidad y acceso desde Cloud/Admin con telemetry auditable por `profileId`, `engineId` y `promptId`.

Alcance:

- Admin Web/Cloud mantienen catalogos editables de motores y prompts, con pricing visible cuando hay snapshot.
- Runtime managed resuelve profile -> engine -> provider/model -> prompt para chat/postprocess/selectionTransform y audio transcription.
- Budgets se aplican primero por account override y luego por profile; `block` puede responder `402 budget_exceeded` con `budgetSource`.
- Usage debe mostrar costo/requests por engine, prompt y profile.
- Groups ya pueden crearse/asignarse a accounts y afectar runtime con `Profile base -> Group -> Account -> Device`; `profile.policySource`, `groups` y `matchedGroup` quedan expuestos para auditoria en preflight/Admin Web.

Deploy: aprobado por JP con "ok" el 2026-07-01; Worker production deployado como version `30699929-1641-4bf7-8ced-71d9a8940f20`, Admin Web VPS reiniciado y smokeado (`/healthz`, `/admin/pi` -> `/login`, `fixvox-admin accounts 5`, remote `npm run cloud:test` 77 pass).

Proximo paso: validar visualmente con login Google real si JP quiere revisar UI production; no hacer push sin aprobacion aparte.

### 2026-06-30 - Selection transform reemplaza directo como Fixvox

Estado: accepted

Decision: Cuando hay texto seleccionado y JP dicta una instruccion (ej. seleccionar `hola amigo` y dictar `en ingles`), Fixvox Tauri debe tratar la transcripcion como instruccion sobre la seleccion, transformar via Fixvox Cloud y reemplazar directamente la seleccion en el target guardado. Si el transform sale OK no debe abrir ventana de review/companion ni requerir `Paste last`; debe comportarse como Fixvox con `reviewBeforeDelivery=false`.

Motivo: JP espera el modelo operacional de Fixvox: selection source -> LLM transform -> `replaceSelection`. El modo review-only resulto friccion y confundia el flujo; los fallos tampoco deben terminar pegando la instruccion dictada ni el texto original.

Alcance:

- Capturar la seleccion real contra el target editable guardado al iniciar/usar la dictation key.
- Usar STT managed para la instruccion y Fixvox Cloud chat para el transform.
- En exito, entregar con `deliveryStrategy: paste_send` al target guardado, preservando evidencia honesta (`paste_sent` != `paste_observed`).
- En fallo, fallar cerrado: no pegar transcript, no pegar original, no inventar transform.
- El clipboard roundtrip queda como fallback tecnico vigilado y debe restaurar best-effort; cualquier ruta nueva de seleccion/replace requiere tests/smoke y cuidado de side effects.

Proximo paso: harden de captura/replace en browsers/Electron, especialmente minimizar efectos visibles de clipboard y sumar smoke real redacted del caso `hola amigo` -> instruccion `en ingles`.

### 2026-07-17 - Cuenta obligatoria y Control Room separado

Estado: accepted; supersedes la decisión de modo anónimo visible del 2026-06-29

Decision: Fixvox Tauri exige una cuenta antes del primer dictado. Google es el mecanismo inicial de alta/login; el host completa el handoff, crea o vincula la cuenta, enlaza el dispositivo y materializa policy/capabilities sin exponer tokens ni IDs al renderer. Control Room queda como producto web separado para operadores autorizados, no como parte de Settings ordinario. La UX visible es Spanish-first y mueve device/policy/runtime/preflight a diagnóstico avanzado redacted.

Motivo: la prueba en una PC nueva demostró que el modelo híbrido actual no es estándar ni autoexplicativo: el usuario puede intentar dictar y recibir `requires a registered device id`, mientras Settings mezcla login, Cloud, activation, repair y policy. Una entrada account-first permite un onboarding conocido, una única identidad portable y recovery explícito. Separar Control Room evita mezclar tareas de usuario con entidades y autoridad administrativas.

Alcance:

- Primer uso objetivo: bienvenida → Google → account/device link automático → micrófono → atajo → `Listo para dictar`.
- Settings muestra Cuenta, plan/límites comprensibles, dispositivos y logout; la infraestructura queda en Avanzado.
- Control Room conserva Google admin, RBAC, recent-auth, preview, broker server-side y audit.
- El soporte backend anónimo no se elimina en esta decisión; queda como compatibilidad/rollback hasta un retiro contractual separado.
- OAuth real, deploy, producción, release y cambios de schema siguen requiriendo gates independientes.

Plan: `docs/tracks/standard-product-ux-redesign-plan.md`.

### 2026-06-29 - Login cloud para capacidades mas alla de lo basico

Estado: superseded for visible product UX by 2026-07-17; retained as implementation history

Decision: Fixvox Tauri mantiene un modo anonimo/basic de baja friccion con `installId` local, pero cualquier capacidad mas alla de lo basico debe requerir login contra Fixvox Cloud. La autenticacion objetivo usa email magic link como base y Google/GitHub OAuth como proveedores convenientes. El device se vincula al usuario autenticado y recibe una policy snapshot con grupo/template/capabilities/limits administrables desde la nube.

Motivo: JP necesita manejar facilmente tipos/grupos de usuarios, desde `translate-only` hasta usuarios con dictado, postprocess, transforms, assistant actions, advanced settings y debug. Centralizarlo en Fixvox Cloud simplifica control, revocacion, billing futuro, soporte, limites y rollout sin hardcodear variantes en el cliente.

Alcance:

- Modelar permisos como capabilities/entitlements de producto, no como flags visuales solamente.
- El cliente Tauri puede ocultar/deshabilitar UI, pero runtime y Cloud deben validar capabilities y fallar cerrado.
- BYOK/direct provider queda como modo dev/avanzado explicito; nunca desbloquea silenciosamente una capability managed denegada.
- Invites quedan como mecanismo beta/manual, no como modelo principal de acceso de largo plazo.
- React no recibe tokens ni toma decisiones de seguridad; Rust/Tauri posee session/device persistence host-owned y expone solo estado redacted.

Proximo paso: ejecutar `specs/015-fixvox-auth-policy-groups/` empezando por contratos provider-free y Settings/Cloud signed-out/signed-in UX antes de cualquier login real. Login/OAuth/device-link real requiere aprobacion explicita por ser side effect externo/cuenta.

### 2026-06-24 - Permiso persistente para side effects locales controlados

Estado: accepted

Decision: JP autoriza a Pi/agentes en este repo y maquina dev a ejecutar autonomamente side effects locales controlados para implementar y verificar tareas: abrir/cerrar apps de prueba, usar CUA/computer-use, lanzar Vite/Tauri/Fixvox local, usar microfono o fixtures de audio, llamar provider real con `.env` local, mutar clipboard temporalmente con restauracion, enviar hotkeys/clicks a fixtures/sandboxes, crear artifacts ignorados y limpiar procesos.

Limites: no autoriza login/cuentas, compras, envios externos, publicaciones, deploy/push, instalar drivers, habilitar autostart/Scheduled Tasks/RunLevel Highest, abrir tunnels/VNC, borrar datos reales, tocar documentos personales ni operar apps reales no preparadas como target. `Alt+Space`, lectura/captura de seleccion real, replace-selection, observer de paste real o cambios productivos siguen requiriendo task/spec explicita y evidencia honesta; pedir confirmacion si el alcance sale de sandbox/local dev.

Motivo: CUA MCP persistente ya permite validar UI/desktop real; este permiso reduce interrupciones para que Pi implemente, testee y haga smokes locales con evidencia externa sin pedir aprobacion por cada mic/provider/clipboard/hotkey controlado.

Guardrails: no imprimir secretos ni raw transcripts en docs/chat; mantener artifacts bajo rutas ignoradas; restaurar clipboard cuando se mute; cerrar procesos/ventanas al finalizar; reportar solo evidencia redacted/hash/longitud/tokens; nunca reclamar `paste_observed` sin observer verificado.

### 2026-06-22 - Iniciar post-MVP con seleccion fixture-first y recuperacion efimera

Estado: accepted

Decision: La expansion post-010 empieza con `011-selection-transform-and-recovery-ergonomics`: contratos y fixtures de texto seleccionado, presets deterministas provider-free y recuperacion paste-last/copy-last solo efimera en memoria. La captura real de seleccion, replace-selection observado, paste automation e historial durable quedan gated para specs/tasks posteriores.

Motivo: texto seleccionado real y delivery observado son side effects sensibles y fragiles; primero conviene probar routing, evidencia, recovery y UI sin leer seleccion real, tocar foco/clipboard ni llamar providers. Paste-last aporta ergonomia sin prometer insercion y sin crear historial sensible.

Alcance:

- Default tests pueden simular `selectedText`, pero no leer seleccion real del sistema.
- `paste-last` seguro marca evidencia `uncertain`: no envia teclas, no toca foco, no usa clipboard y no reclama `paste_observed`.
- Transform presets iniciales corren en modo fixture; managed/direct BYOK requieren gates existentes.
- Resultado ultimo vive solo en proceso; no se persiste historial.

Proximo paso: completar si se desea el resto de 011 por Small Batches o retomar 010 Phase 7 real hotkey con `Ctrl+Shift+F9` Rust-owned si se aprueba correr el smoke local.

### 2026-06-20 - Mantener React con CSS propio y Radix selectivo para frontend

Estado: accepted

Decision: Dictation Tauri mantiene React 19 + Vite + TypeScript y el sistema visual propio definido en `PRODUCT.md`/`DESIGN.md`. No se migra a Svelte ahora, no se adopta MUI/Mantine como libreria visual base y no se adopta shadcn wholesale. Se permite sumar primitivas headless/accesibles tipo Radix de forma selectiva cuando una superficie lo justifique: dialogs, popovers, menus, tooltips, focus traps, listbox/combobox o componentes con a11y no trivial.

Motivo: la UI actual es chica y ya esta integrada/testeada; el producto exige una estetica compacta, sobria y state-first que pelea con librerias visuales opinionadas. React es suficientemente liviano para esta app Tauri y evita una migracion prematura. Radix selectivo reduce riesgo de reinventar accesibilidad sin ceder la identidad visual.

Alcance:

- CSS propio y tokens de `DESIGN.md` siguen siendo fuente visual principal.
- Componentes simples como buttons, chips, panels, status rows y grids se mantienen propios.
- Radix/headless se evalua solo para interacciones complejas y se envuelve con componentes propios.
- Si se reconsidera Svelte, debe ser mediante spike medido de Voice Dock + Readiness, comparando DX, bundle/runtime, accesibilidad y paridad visual.
- MUI queda descartado para esta direccion visual; Mantine solo podria evaluarse en un spike puntual si Settings crece y el tax visual queda demostrado como aceptable.

Proximo paso: antes de nuevas superficies durables, refactorizar `App.tsx` en componentes/estado mas chicos y aplicar `impeccable`/checks visuales para preservar `DESIGN.md`.

### 2026-06-20 - Promover Fixvox managed cloud como camino runtime post-008

Estado: accepted

Decision: Dictation Tauri debe usar la infraestructura cloud managed de Fixvox como camino principal para el siguiente runtime real, reimplementando el desktop runtime en Rust/Tauri en vez de portar legacy Fixvox desktop internals. El camino directo Groq local queda como BYOK/dev fallback explicito, no como default silencioso.

Motivo: Fixvox ya funciona bien con device registration, proxy managed, policy/preflight, claves server-side, costos/usage/timings y prompts/heuristicas maduras. Dictation Tauri puede aprovechar esa frontera cloud sin heredar deuda de legacy Fixvox desktop internals, manteniendo React sin secretos y dejando side effects desktop en Rust/Tauri.

Alcance:

- Usar contratos HTTP Fixvox: `/v2/device/register`, `/v2/device/activate`, `/v2/execution/preflight`, `/v1/audio/transcriptions` y luego `/v1/chat/completions`.
- Managed inference usa `X-Device-Id`; no bearer vendor desde el desktop/frontend.
- Managed mode debe fallar cerrado si falta backend/device/preflight/lane proxied.
- El soporte managed actual se considera Groq-only hasta que el Worker amplie providers.
- El endpoint confiable actual es `https://auth-fixvox.jpsala.dev`; `https://fixvox-api.jpsala.dev` no debe ser default hasta confirmar health.
- Antes de default de producto, UI/docs deben explicar que audio/transcript pasan por Fixvox cloud y Groq.

Proximo paso: implementar `specs/009-fixvox-cloud-runtime-port/` por Small Batches empezando con tests de contrato sin llamadas reales.

### 2026-06-20 - Separar transcripcion real de smoke seguro en UI

Estado: accepted

Decision: la UI durable mantiene dos acciones distintas: `Transcribe with provider` ejecuta la ruta real gated (`mode: real` + `allowProviderCall`) solo cuando hay artifact capturado y readiness configurada; `Check host boundary` queda como smoke provider-free/dry-run para validar la frontera sin costo ni secretos.

Motivo: evita que JP confunda un smoke seguro con una transcripcion real, preserva checks default sin provider calls y mantiene el renderer sin secretos. La verificacion manual Tauri confirmo el flujo capture -> host Rust -> Groq -> transcript review; las rutas de `.env` y artifacts deben resolverse tanto desde repo root como desde `src-tauri` porque `tauri:dev` puede variar el cwd.

Alcance:

- React no contiene API keys, headers auth ni SDK de provider.
- El host Rust lee config local permitida y artifacts ignorados, validando paths antes de leer.
- Delivery sigue siendo honesta: transcript `available`/copy fallback; no `paste_observed` hasta implementar observacion real.
- `Check host boundary` no debe activar llamadas reales.

Proximo paso: elegir el proximo Small Batch: push, hotkey/tray minimo, delivery/paste observado, o selected-text/assistant spec.

### 2026-06-19 - Implementar provider real de 007 en Rust nativo

Estado: accepted

Decision: la ruta real host-provider de `specs/007-usable-dictation-loop` se implementara nativamente en Rust dentro del host Tauri (`src-tauri/src/runtime_transcription.rs`) usando HTTP/multipart, no como script/sidecar TypeScript.

Motivo: mantiene secretos y side effects en el host, evita deuda de process management/packaging del sidecar y alinea el producto con una app desktop empaquetable. React sigue provider-free y los checks default siguen sin provider calls.

Alcance:

- Provider real solo detras de gating local explicito; no entra a CI/default checks.
- Validar artifact paths antes de leer archivos o llamar proveedores.
- Redactar credenciales, auth headers, request ids y diagnosticos secret-looking antes de devolver a React o escribir reports.
- Agregar deps Rust solo despues de tests CI-safe para setup/path/provider/error/redaction.
- `scripts/runtime-transcription.ts` queda como referencia de comportamiento, no como ruta seleccionada.

Proximo paso: implementar 007 T027-T029 con provider real Rust detras de gating explicito, usando los tests CI-safe de T025-T026 como guardrail antes de cualquier verificacion real aprobada.

### 2026-06-13 - Ordenar el trabajo post-MVP3 por evidencia antes de ergonomia

Estado: accepted

Decision: despues de cerrar captura nativa real de microfono, el siguiente trabajo debe priorizar evidencia end-to-end de dictado antes de sumar ergonomia desktop amplia. El orden recomendado es:

1. Provider real gated sobre artifact capturado (`T035-T036`) solo con aprobacion explicita de JP, manteniendo payloads/transcripts/audio ignorados y logs redactados.
2. Spec post-MVP3 para una frontera de transcripcion runtime mas clara si el provider real revela gaps entre script/local shell y app runtime.
3. Delivery real/clipboard/foco con evidencia honesta antes de hotkeys globales.
4. Hotkeys/tray despues de que captura, transcripcion y recovery esten cerrados como flujo confiable.
5. Selected text y replace-selection real despues de delivery, porque dependen de target capture y semantics de reemplazo.

Motivo: la captura real ya esta probada, pero el valor de producto depende de obtener texto util y recuperable. Hotkeys, tray y seleccion aumentan side effects y superficie de permisos; conviene no agregarlos hasta que la cadena capture -> transcribe -> recover/deliver tenga evidencia local.

Alcance:

- No se llama provider real por defecto.
- `CaptureGateway` y `ModelGateway` siguen siendo boundaries.
- UI sigue observando y disparando comandos; no se aduena de grabacion/transcripcion.
- WebView recorder queda como adapter testeado, pero Windows usa captura nativa `cpal`/`hound` hasta resolver WebView2.
- Artifacts reales siguen bajo `artifacts/` y no se versionan.

Proximo paso: si JP no aprueba provider real, crear una spec post-MVP3 de transcripcion/delivery runtime o una mini-spec de delivery evidence real; si aprueba provider real, ejecutar `T035-T036` como Small Batch aislado.

### 2026-06-10 - Guiar runtime por puertos, eventos y fronteras Tauri

Estado: accepted

Decision: la arquitectura de Dictation Tauri debe evolucionar desde el pipeline simulado hacia un runtime por puertos/adapters, eventos tipados y fronteras Tauri explicitas antes de agregar audio real, STT real, hotkeys, tray, delivery real o persistencia de producto.

Alcance:

- El core del pipeline sigue siendo TypeScript puro y testeable mientras no requiera permisos desktop.
- La UI no es dueña del flujo; solo observa estado/eventos y dispara comandos.
- El runtime debe exponer un `PipelineService` o equivalente que controle ejecucion activa, cancelacion, ids, concurrencia y emision de eventos.
- Cada corrida debe producir un ledger de eventos tipados; el summary se deriva de esos eventos.
- Transcripcion, postprocess/materializacion y delivery deben entrar por puertos/adapters mockeables antes del primer STT real.
- `ModelGateway` es la frontera para STT/postprocess; empieza con adapter mock, luego directo local y despues proxied si el contrato alcanza.
- Rust/Tauri debe poseer side effects del host: microfono, hotkeys, tray, foco, clipboard, ventanas, secretos y permisos. TypeScript puede orquestar y testear, pero no debe esconder side effects desktop.
- Tauri capabilities se agregan por feature y ventana; `core:default` sigue siendo baseline hasta que una spec justifique nuevos permisos.
- `csp: null` es aceptable solo como scaffold temprano; antes de runtime real o contenido/proveedores dinamicos debe existir CSP explicito.
- Delivery se modela por evidencia y certeza, no como booleano: `pasteSent`, `pasteObserved` cuando exista, target inicial/final, confianza y fallback disponible.
- No se crea historial, settings store ni persistencia de producto sin spec propia.

Motivo: el proyecto todavia esta temprano, por lo que conviene fijar las fronteras antes de que el codigo crezca alrededor de mocks, fixtures o side effects accidentales. Esta decision mantiene el pipeline testeable, evita acoplamiento a Fixvox/CopyQ, y prepara el camino a audio/STT/delivery reales sin reescritura grande.

Proximo paso: ajustar `002-simulated-pipeline` para cerrar cancelacion/evidencia con event ledger y service guard; luego implementar `ModelGateway` mock/directo en MVP 2.

### 2026-06-10 - Prevenir contaminacion de contexto

Estado: accepted

Decision: La ruta inicial de Dictation Tauri debe permanecer liviana. `AGENTS.md`, `WORKING_MEMORY.md`, `TOPICS.md` y tracks activas no deben convertirse en lectura obligatoria amplia, mini-historiales ni transcripts.

Motivo: el sistema agentico estaba instalado, pero `AGENTS.md` forzaba una lectura inicial amplia y `WORKING_MEMORY.md` acumulaba historia. Eso contradice el objetivo de AOS: leer poco, elegir el topic correcto y abrir referencias profundas solo bajo demanda.

Proximo paso: mantener la ruta caliente corta, mover historia a archivo o referencias profundas, y usar el audit para detectar crecimiento excesivo.

### 2026-06-10 - Adoptar Small Batches para trabajo agentico

Estado: accepted

Decision: el repo debe usar Small Batches como principio operativo agentico. Una tanda de trabajo debe ser una task SpecKit, un comportamiento observable o una sincronizacion documental acotada. Cada tanda completada debe cerrarse con checks relevantes, `tasks.md` sincronizado si aplica y un commit atomico reversible.

Motivo: SpecKit divide el trabajo en tareas ejecutables, dependencias y checkpoints. Small Batches reduce drift del agente, baja el costo de review, mantiene contexto manejable y permite volver a estados buenos sin perder avance.

Alcance:

- Usar Conventional Commits cortos.
- No mezclar plan/spec/docs e implementacion cuando puedan separarse limpiamente.
- No esconder refactors dentro de features.
- Dividir cualquier task que toque demasiadas responsabilidades.
- No commitear `.env`, secretos, artifacts locales, `node_modules/`, `dist/`, `target/`, audio/transcripciones sensibles ni reports.
- Publicar o pushear solo despues de tener `.gitignore`, checks relevantes y revision de secretos/artifacts.

Referencias:

- WHOOP GUSTO coding: small tasks, test everything y commit checkpoints.
- MinimumCD Small-Batch Agent Sessions: una conducta, una sesion, un commit.
- GitLab CI: commits frecuentes y testing en pequenos lotes para aislar bugs.

Proximo paso: aplicar Small Batches al Checkpoint B de `001-port-foundation`.

### 2026-06-05 - Instalar Agentic OS (AOS)

Estado: accepted

Decision: el repo usa `AGENTS.md`, `docs/`, `docs/topics/`, `docs/tracks/`, `docs/.generated/context-index.md`, `specs/`, `docs/skills/`, `.specify/` y scripts de contexto como sistema agentico liviano.

Motivo: permitir continuidad entre sesiones y agentes sin cargar contexto innecesario.

Proximo paso: scaffold de `001-port-foundation` con el stack real y comandos verificables.

### 2026-06-07 - Migrar continuidad a `docs/tracks/`

Estado: accepted

Decision: la continuidad viva del proyecto vive en `docs/tracks/`; `active work` queda solo como alias historico. Las tracks activas tienen `status`, `started`, `updated` y `priority`; las cerradas viven en `docs/tracks/archive/` con `status: archived`.

Motivo: alinear Dictation Tauri con la version actual de AOS y permitir validacion mas estricta con indice generado y audit.

Proximo paso: usar `docs/tracks/TEMPLATE.md` para nuevas tracks y correr `bun scripts/context-index.ts` antes del audit cuando cambie contexto.

### 2026-06-05 - Cerrar baseline documental y agentico

Estado: accepted

Decision: el baseline documental/agentico queda cerrado: docs raiz, topics, SpecKit, skills locales y auditor de contexto estan instalados, indexados y sincronizados.

Motivo: antes de avanzar con la app Tauri, el proyecto necesita una fuente de verdad confiable y ligera para continuar entre sesiones sin perder reglas ni decisiones.

Proximo paso: usar `specs/001-port-foundation/` para cerrar la fundacion tecnica con stack, manifiestos, comandos, permisos y politica de datos.

### 2026-06-05 - Tratar datos de dictado como sensibles

Estado: superseded por "Modo personal/dev permisivo para datos locales" del 2026-06-07

Decision: audio, transcripciones, logs de reconocimiento y metadata de dictado son sensibles por defecto.

Motivo: pueden contener informacion privada del usuario.

Proximo paso: definir persistencia, retencion, cifrado y uso de servicios externos antes de implementar storage o integraciones.

### 2026-06-07 - Modo personal/dev permisivo para datos locales

Estado: accepted

Decision: en esta etapa personal/dev, privacidad no bloquea el trabajo. El asistente puede leer y usar `.env`, variables locales, logs, audio, transcripciones, bases locales, prompts, metadata y artifacts de referencia de este repo, Fixvox y otros proyectos personales cuando ayuden a avanzar.

Motivo: el proyecto es personal por ahora y la prioridad es avanzar de forma straightforward, usando lo que ya funciona localmente.

Alcance:

- Permitido leer valores reales de variables de entorno y `.env` locales para diagnostico, benchmarks y providers.
- Permitido usar audio/transcripciones/logs/artifacts locales como referencia o insumo de desarrollo.
- Permitido persistir datos experimentales localmente si acelera desarrollo.
- No imprimir secretos completos en respuestas ni commitear `.env`/tokens salvo pedido explicito y acotado de JP.
- Antes de convertir persistencia en contrato de producto, documentar ruta, formato y ciclo de vida.

Proximo paso: actualizar specs y topics para que la fundacion tecnica no trate privacidad como bloqueo inicial.

### 2026-06-05 - Usar el stack base de copicu

Estado: accepted

Decision: la fundacion tecnica usara el mismo stack base probado en `C:\dev\copicu`: React, Vite, TypeScript strict, npm con `package-lock.json`, Tauri v2, Rust edition 2021 y Playwright para checks visuales.

Motivo: ese stack ya funciona bien en la maquina de JP, reduce decisiones nuevas y da una base conocida para una app desktop operativa.

Alcance: reutilizar el patron tecnico, no copiar dependencias ni permisos especificos de clipboard/storage. Para Dictation Tauri empezar con capabilities minimas (`core:default`) y sin persistencia sensible.

Proximo paso: crear manifiestos y app base verificable con scripts oficiales.

### 2026-06-05 - Usar Fixvox como referencia de voz, no como arquitectura

Estado: accepted

Decision: usar `C:\dev\fixvox` / Fixvox como fuente de referencia para recursos de voz, fixtures, benchmarks, prompts y aprendizajes de producto, manteniendo el stack propio de Dictation Tauri: React, Vite, TypeScript, npm, Tauri v2 y Rust.

Motivo: Fixvox ya contiene recursos valiosos para avanzar sin depender de pruebas manuales tempranas: scripts de TTS, matrices STT/postprocess, prompts, manifests de audio y variables `.env` locales con proveedores disponibles.

Alcance:

- Permitido usar audio sintetico o real local para pruebas automaticas.
- Permitido leer variables `.env` y usar claves locales cuando una tarea lo requiera.
- No imprimir ni commitear valores de secretos salvo pedido explicito y acotado de JP.
- Permitido leer y usar muestras humanas/artifacts de Fixvox como referencia local.
- No copiar arquitectura legacy de Fixvox ni dependencias de Fixvox.

Proximo paso: armar una capa propia de fixtures/benchmarks para Dictation Tauri, empezando por TTS sintetico y STT/postprocess controlado.

### 2026-06-05 - Filtrar capacidades Fixvox antes de implementarlas

Estado: accepted

Decision: `docs/topics/fixvox-capability-map.md` es el mapa de alcance para capacidades inspiradas en Fixvox. Ninguna capacidad de Fixvox entra automaticamente al backlog de Dictation Tauri.

Motivo: Fixvox tiene muchas capacidades utiles, pero Dictation Tauri necesita un producto propio, con arquitectura propia y alcance chico antes de implementar features durables.

Proximo paso: usar ese mapa para decidir MVP, early features, research spikes, later features y parked features antes del scaffold funcional.

### 2026-06-05 - Usar impeccable para UI React/Tauri

Estado: accepted

Decision: usar la skill local `docs/skills/impeccable` para diseño, critique, audit, polish y construccion de superficies UI React/Tauri cuando la tarea toque interfaz.

Motivo: la app necesita una UI operativa, clara y confiable para estados de dictado, delivery y recovery. `impeccable` ya dio buenos resultados en otro proyecto y aporta proceso de producto, diseño, validacion visual y anti-patrones.

Limites: no usarla para arquitectura nativa, audio, hotkeys globales, capabilities, model routing, proxy, storage ni Rust backend.

Proximo paso: antes de UI durable, crear `PRODUCT.md` y `DESIGN.md`; despues usar `impeccable shape/craft/critique/audit/polish` segun la superficie.

### 2026-06-05 - Cerrar alcance MVP 0-3

Estado: accepted

Decision: Dictation Tauri empieza como dictado rapido universal. El alcance MVP queda dividido en:

- MVP 0: app Tauri base verificable.
- MVP 1: pipeline simulado automatizable, sin microfono ni servicios externos obligatorios.
- MVP 2: audio sintetico, STT real y benchmark de STT/postprocess contra texto esperado.
- MVP 3: captura real de microfono, push-to-talk/toggle, stop-submit y delivery best-effort con copy fallback.

Motivo: el producto necesita validar flujo, calidad, costo y delivery antes de pedir pruebas manuales repetidas o sumar interacciones complejas.

Alcance: no entran en MVP 0-3 Quick Chat, Assistant Mode persistente, `Alt+Q`, wake words, control plane, historial persistente, muestras humanas copiadas al repo ni captura real de texto seleccionado.

Proximo paso: scaffold tecnico de `001-port-foundation` y luego una spec separada para pipeline/fixtures si el cambio excede la fundacion.

### 2026-06-05 - Usar ModelGateway hibrido con adapter real directo primero

Estado: accepted, refinada por "Guiar runtime por puertos, eventos y fronteras Tauri" del 2026-06-10

Decision: crear una frontera propia `ModelGateway` para STT/postprocess. El primer adapter real sera directo local, usando variables de entorno o `.env` propio ignorado. El adapter proxied queda para spike posterior si el contrato del proxy existente alcanza.

Motivo: permite medir audio sintetico y proveedores sin acoplar Dictation Tauri al control plane de Fixvox, pero deja una ruta limpia para proxy, costos y policy mas adelante.

Alcance: Dictation Tauri puede leer `.env`/variables locales cuando una tarea lo requiera. Aun asi, para producto propio conviene tener `.env` propio o variables configuradas explicitamente y no acoplarse por accidente a rutas de Fixvox.

Proximo paso: definir contrato minimo del gateway en la spec de pipeline/fixtures antes de implementar STT real.

Nota 2026-06-10: antes del primer adapter real directo, MVP 1 debe usar adapter mock/fixture-backed conectado por puerto. La secuencia vigente es mock -> directo local -> proxied.

### 2026-06-05 - Postergar seleccion real a post-MVP

Estado: accepted

Decision: el modo con texto seleccionado no entra como captura real en MVP 0-3. Se puede simular `selectedText` en tests desde MVP 1 y medir transformaciones como fixtures, pero la captura real de seleccion y replace-selection quedan para early post-MVP.

Motivo: selection transform es valioso, pero mete riesgo tecnico y UX sobre target capture, privacidad y delivery. El primer flujo real debe probar dictado universal antes de ampliar alcance.

Proximo paso: mantener los contratos preparados para contexto opcional, sin bloquear MVP 3.

### 2026-06-05 - Inicializar PRODUCT/DESIGN antes de UI durable

Estado: accepted

Decision: no se construye UI durable sin `PRODUCT.md` y `DESIGN.md`. El momento correcto es despues de cerrar este pase de alcance y antes de implementar la primera superficie React/Tauri real como app shell, voice dock, preview o recovery.

Motivo: `impeccable` requiere `PRODUCT.md` y la app necesita una direccion de producto/diseno estable antes de que los componentes visuales se vuelvan fuente de verdad accidental.

Alcance: el scaffold tecnico minimo puede avanzar antes de esos archivos si solo crea una ventana base verificable y no fija una UI durable.

Proximo paso: correr el flujo `impeccable init` o equivalente para crear `PRODUCT.md`; luego seedear `DESIGN.md` antes de la primera superficie UI.

## Pendientes

- Motor de dictado/transcripcion.
- Politica de persistencia local.
- Permisos/capabilities minimos de Tauri.
- Comandos exactos de dev/build/test una vez creados los manifiestos.
