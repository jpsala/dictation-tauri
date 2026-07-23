---
status: complete
started: 2026-07-18
updated: 2026-07-20
priority: high
owner: JP/Pi
topic: admin-control-room
related:
  - docs/tracks/clean-install-readiness-and-account-ux.md
  - docs/WORKING_MEMORY.md
source_refs:
  - admin/fixvox-web/server.mjs
  - admin/fixvox-web/public/app.js
  - admin/fixvox-web/pi-remote-agent-extension.mjs
  - admin/fixvox-web/pi-remote-agent-core.mjs
  - admin/fixvox-web/pi-remote-policy.mjs
  - admin/fixvox-web/constelaciones-read-adapter.mjs
---

# Pi Chat Remote Agent Parity

## Decision

JP eligió **Agente remoto total**: Pi Chat debe poder investigar, editar, probar, commitear y operar múltiples repos/infra del VPS de forma equivalente a un coding agent completo.

“Total” describe la amplitud funcional, no acceso irrestricto al usuario `jpsal`, sus credenciales o su navegador local. Browser/desktop local requiere un relay posterior y no se simula desde VPS.

## Estado Inicial

- Admin inicia `pi --mode rpc --approve` como usuario `jpsal`, miembro de `sudo`.
- El child hereda casi todo el environment del servicio; sólo se eliminan cuatro claves Admin.
- `admin-web.env` contiene Web token y Google OAuth secret además de configuración.
- `~/.pi/agent/settings.json` carga muchas extensiones globales, incluyendo herramientas remotas/computer-use; `defaultProjectTrust=always`.
- El prompt textual de guardrails no es una barrera de seguridad.
- `/home/jpsal`, `.ssh`, credenciales, stores y repos quedan legibles por el mismo UID aunque se cambie `HOME`.
- Pi 0.80.6 ofrece `tool_call` pre-execution bloqueable y confirmaciones RPC vía `extension_ui_request`; `--approve` sólo confía archivos project-local.

## Arquitectura Aceptada

### Runtime

- Usuario dedicado `fixvox-agent`, sin sudo, SSH keys, Cloudflare/Admin/OAuth env ni acceso al home privado de `jpsal`.
- Workspaces explícitos bajo un root dedicado o permisos/ACL mínimos sobre repos aprobados.
- Sesiones y audit propios fuera del source.
- Provider credential aislada del shell; no reutilizar env productivo del Admin.

### Pi

- `--no-extensions` y una extensión explícita repo-owned de policy.
- Built-ins declarados con `--tools`; no heredar paquetes globales del usuario.
- Sin project extensions, skills o templates hasta revisión explícita.
- `tool_call` bloquea antes de ejecutar y usa confirmaciones RPC fail-closed.

### Policy

- Read multi-repo permitido sólo en roots aprobados y con deny de secrets/stores.
- `write`/`edit`, bash mutante, git, deploy, systemd/network-admin requieren confirmación explícita.
- Cancel/timeout bloquean sin ejecutar.
- Secret paths y credential discovery quedan bloqueados incluso con prompt injection.
- Audit JSONL redacted: timestamp, categoría, tool, decisión y hashes; nunca argumentos, output ni valores raw.

### Producto

- Consultas de dominio como “turnos futuros” deben usar una fuente read-only explícita de Constelaciones; no filesystem wandering.
- Browser Chrome local queda fuera de Batch 1. Un relay posterior requerirá identidad, presencia local, scope por operación y revocación.

## Batches

### Batch 1 — Foundation local/provider-free

- [x] Env allowlist fail-closed para el child Pi.
- [x] Policy classifier y extensión `tool_call` explícita.
- [x] RPC confirm/cancel/timeout contract tests.
- [x] Audit redacted tests.
- [x] Startup args sin extensiones/config globales implícitas.
- [x] Adapter read-only tipado para turnos futuros mediante broker Unix socket.
- [x] Behavioral fake-ExtensionAPI para allow/deny/approve/cancel/no-UI + Admin browser smoke y Pi RPC startup offline.

Receipt local:

- `buildRemoteAgentEnv()` elimina env credential-shaped, SSH agent y config heredada; sólo agrega roots/audit/socket no secretos.
- `remoteAgentArgs()` usa `--no-approve`, `--no-extensions`, `--no-skills`, `--no-prompt-templates`, `--no-context-files`, tools explícitas y única extension repo-owned.
- Reads se limitan a roots aprobados, protegen secrets/stores/sessions y canonicalizan `realpath` para bloquear escape por symlink.
- Write/edit/bash requieren confirmation RPC; secret discovery y tools desconocidas se bloquean siempre.
- Audit conserva sólo categoría/decisión/hashes; tests prueban ausencia de command/path/prompt/session raw.
- `constelaciones_future_appointments` tiene cliente/contrato para consumir `/v1/appointments/future` por Unix socket, limita 1–120 días/64 KiB/100 filas y proyecta horario/estado/kind/location sin nombres, teléfonos, IDs, notas ni pagos. El broker privilegiado todavía no existe: la consulta no es operacional hasta Batch 2.
- Checks: 25 tests Node PASS, incluyendo harness behavioral pre-execution y symlink nested-write; Admin profile smoke PASS; PowerShell parse PASS; RPC startup offline PASS con session `fixvox-admin-remote-agent`; cero provider/deploy/VPS/systemd/user/permission mutation.
- Feature flag `PI_CHAT_REMOTE_AGENT_ENABLED` queda apagada por default. Producción actual no cambió.

### Batch 2 — Runtime aislado VPS

Gate separado obligatorio:

- crear usuario/directorios/permisos;
- provisionar provider broker/credential;
- copiar runtime policy y configurar systemd;
- backup/rollback del service actual;
- smoke real read → write confirmado → cancel → audit.

### Batch 3 — Paridad ampliada

- herramientas web/research revisadas;
- git/commit/push y deploy con approval class + receipts;
- browser relay local opcional y separado;
- tareas largas, checkpoints y budgets.

## Tests Obligatorios

1. Child env no contiene nombres `*_TOKEN`, `*_KEY`, `*_SECRET`, `*PASSWORD`, salvo una credencial provider aislada no visible al shell.
2. Read permitido en roots aprobados y bloqueado en `.env`, `.ssh`, config credentials, stores y sessions.
3. Write/edit/git/deploy/systemd se bloquean antes de ejecutar sin confirmación.
4. Confirmación positiva autoriza sólo la operación exacta; cancel/timeout no ejecutan.
5. Bash con chaining, subshells, redirects o encoding ambiguo cae a confirmación o bloqueo.
6. Audit no contiene argumentos, outputs, prompts, paths sensibles ni secrets raw.
7. Abort y `agent_settled` cierran stream y proceso correctamente.
8. Consulta de turnos usa adapter read-only explícito y devuelve salida bounded/redacted.

## Stop Conditions

- No existe hook pre-tool fiable.
- El child sigue ejecutándose como `jpsal` en rollout real.
- Un provider secret queda disponible a `bash` o lectura de filesystem.
- Una mutación ocurre antes de approval.
- El navegador local se expone sin relay dedicado y presence gate.
- Tests necesitan datos personales/raw o producción para pasar.

## Batch 2 Gate Y Blocker

JP autorizó Batch 2 completo, incluyendo commit/push, usuarios/permisos, provider broker, Constelaciones broker, systemd y smokes. La inspección previa encontró un stop condition antes de mutar VPS:

- provider activo es `openai-codex/gpt-5.6-sol` con OAuth en `~/.pi/agent/auth.json`;
- copiar ese archivo al usuario agente lo haría legible por su propia herramienta shell;
- VPS no tiene `bwrap`/firejail/podman; user namespaces están bloqueados (`unshare ... Operation not permitted`);
- Docker existe, pero el usuario actual no pertenece al grupo y agregar el agente equivaldría a root;
- env allowlist y `tool_call` son necesarios pero no aíslan memoria/FD/auth file del mismo UID.

La arquitectura segura separa **provider process** de **workspace tool broker**: Pi posee OAuth pero no acceso directo a repos/shell; tools built-in se reemplazan por operations sobre Unix socket hacia otro usuario sin provider credentials. El broker repite roots/secret policy y ejecuta sólo requests que atravesaron el gate de la extensión.

Foundation del split implementada local/provider-free:

- Pi arranca con `--no-builtin-tools`; la única extensión registra `read`, `write`, `edit` y `bash` sobre `pi-workspace-broker-client.mjs`.
- `pi-workspace-broker.mjs` expone sólo read/access/write/mkdir/bash por Unix socket, limita body/output/timeout, usa env shell mínimo y vuelve a bloquear roots/secrets.
- El provider process no necesita permisos de workspace; el futuro broker user no recibe OAuth.
- 26 tests Node + RPC offline PASS. Test broker cubre read/write/mkdir, root escape, `.env` y secret-discovery; bash Linux se verificará en VPS antes de activar.
- Producción sigue sin cambios y el feature flag apagado.

Siguiente checkpoint autorizado: commit/push del split, test provider-free en VPS, luego crear usuarios/grupos/directorios y unidades con backup. Stop si el broker no puede operar sin que Pi vea OAuth+workspace simultáneamente.

## Batch 2 Rollout Receipt

**Estado: sandbox remoto VPS activo sólo después del cierre RBAC; no es paridad total.**

- Source commits: `bb630ba`, `12e26d9`, `8a5e0a0`, `e8438a4`, `10b0e6a`, `4bd5e8a`.
- El primer deploy multi-file agotó 600 s y dejó sólo un stage con `server.mjs` de 0 bytes; producción quedó healthy/sin reemplazo. Stage exacto eliminado y backup `20260718-015558.tar.gz` preservado.
- Deploy transport corregido a un tarball local único, SHA256 verificado remotamente, extract/check/replacement/rollback bounded. Deploys finales PASS; último backup Admin `20260718-021738.tar.gz`.
- Usuarios system sin sudo/SSH: `fixvox-agent` (provider/sessions/audit) y `fixvox-workspace` (repo mirrors/tools), unidos sólo por grupo/socket `fixvox-agent-broker`.
- Runtime Pi 0.80.6 y sólo auth `openai-codex` fueron copiados a `/opt/fixvox-agent` y `/var/lib/fixvox-agent/.pi/agent`; no se copió Minimax, packages globales ni settings heredados.
- Repo mirrors shallow, sin working-tree secrets, en `/var/lib/fixvox-workspace/repos`; agent/admin tienen traverse para cwd pero no lectura directa de archivos. Broker owner conserva read/write.
- Workspace broker systemd activo, socket `0660`; direct agent read falla, broker read funciona, `.env`/outside/auth/secret-discovery fallan.
- Constelaciones broker root sandboxed expone sólo AF_UNIX y consulta SQLite read-only con proyección horario/estado/location, máximo 100. Adapter live devolvió 2 filas y sólo fields permitidos; no se reportaron valores.
- Admin activó `PI_CHAT_REMOTE_AGENT_ENABLED=1` con runner aislado. Health Pi: 0.80.6, sin error.
- Smoke provider real read-only: broker `read` + respuesta + `agent_settled` PASS.
- Smoke dominio real: el agente eligió `constelaciones_future_appointments`, settled sin errores y respondió sin raw data en evidencia.
- Approval smoke: write confirmado creó archivo temporal y fue limpiado; write cancelado emitió request, no creó archivo; audit tiene sólo 7 fields permitidos, decisiones allow/approved/blocked y cero raw fields.
- Backup pre-runtime: `/home/jpsal/.local/state/fixvox-agent-rollouts/20260718-022000`.

Stop conditions comprobadas: workspace user no lee OAuth, provider user no lee workspace directo, broker no expone OAuth/outside roots, agent no tiene sudo/Docker/SSH, feature usa no-builtin/no-global resources. No browser relay local.

Security follow-up antes de reactivar tras el primer smoke:

- Advisor detectó que las rutas Pi sólo exigían sesión global y compartían un único proceso RPC.
- Feature se apagó inmediatamente en producción antes de corregirlo.
- `pi-chat-access.mjs` exige prompt/health/command sólo para owner Google; token legacy, viewer y editor reciben 403.
- Cada prompt queda serializado globalmente; una segunda sesión recibe 409 y no comparte stream/results.
- Cada `confirm` queda ligado a hash de sesión, operation hash y TTL 65 s; consume una sola vez. Forged, stale, reused o cross-session reciben 403. Approval además exige OAuth reciente.
- Tests cubren owner boundary, viewer/editor/token denial, concurrency, expiry, one-time y cross-session. `stop` ahora emite settled y libera lock/pending para evitar un 409 permanente tras abortar.
- Cierre desplegado con backup Admin `20260718-024234.tar.gz`; OAuth owner fue autorizado explícitamente. Owner health 200 y turno futuro usó el tool correcto, sin error, con `agent_settled`. Feature reactivado en `1`; token fallback sigue 403 para rutas Pi.
- El write approve/cancel live pre-RBAC ya había probado side effects; post-RBAC el boundary/TTL/one-time/cross-session está cubierto en harness determinista. Los prompts Browser de write no eligieron tool de forma estable, por lo que no se fuerza una mutación adicional para “hacer pasar” el smoke.

Límites de paridad vigentes: mirrors shallow/stale; no grep/find/ls autónomos, credenciales git/deploy ni browser relay. Éste es un sandbox VPS seguro, no acceso equivalente a la sesión Pi local.

## Batch 3 — Rollout Y Sync Durable

**Estado: DONE en producción.**

- `scripts/pi-remote-agent-rollout.ps1` es dry-run por default; toda mutación requiere `-ConfirmProduction` y mirror refresh además requiere `-SyncMirrors`.
- Manifest exacto, tarball único, SHA256 local/remoto, retries bounded, stage y cleanup.
- `scripts/pi-remote-agent-apply.sh` respalda runtime/wrapper/units, hace `node --check`, instala ownership/modes explícitos y preserva el feature flag Admin.
- Mirror sync falla ante tracked/staged/untracked dirty state, clona shallow `main` desde origins canónicos con identidad `jpsal`, rechaza paths sensibles tracked y registra sólo hashes de commit.
- Swap de mirrors ocurre por rename en el mismo filesystem con Admin/broker detenidos; rollback restaura mirrors, runtime, units y servicios.
- Postchecks: servicios, sockets 0660, aislamiento cruzado, broker read y health local/público.
- OAuth/auth no se copia, archiva ni imprime. El único acceso a `auth.json` es un `test -r` negativo ejecutado como workspace user.
- Validación local: PowerShell parse PASS, Bash syntax PASS, dry-run `-SyncMirrors` PASS sin side effects y tests estáticos provider-free PASS.

Rollout ejecutado con autorización exacta:

- Commit fuente: `5400a16`.
- Run: `20260718-025551`; comando `-ConfirmProduction -SyncMirrors`.
- Bundle remoto SHA256 OK; clones shallow desde origins canónicos OK; dirty/secret gates pasaron.
- Mirrors promovidos: dictation-tauri `5400a16`, Constelaciones `02a4b1e`; ambos clean.
- Receipt/backup: `/home/jpsal/.local/state/fixvox-agent-rollouts/20260718-025551/`.
- Mirrors previos preservados en `/var/lib/fixvox-workspace/rollout-backups/20260718-025551/`.
- Admin + dos brokers active; sockets 0660; feature flag preservado en `1`; health público OK.
- Direct provider→workspace y workspace→OAuth siguen bloqueados; broker read post-swap PASS.
- Stage y bundle temporales eliminados. No OAuth copy, nuevas credenciales, push ni deploy de producto.

## Batch 4 — Grep/Find/Ls Read-only

**Estado: DONE en producción.**

- `find` y `ls` usan factories Pi con operations delegadas al workspace broker; el provider user no toca filesystem directo.
- `grep` es custom tool brokered. Broker ejecuta `/usr/bin/rg` sin shell, regex Rust sin backtracking, timeout 10 s, output 1 MiB, archivos 1 MiB, máximo 200 matches y líneas truncadas a 500 chars.
- Globs absolutos, con `..` o mayores a 300 chars se rechazan. Find/glob canonicaliza cada resultado y no sigue escapes de roots.
- Grep excluye `.git`, node_modules, target, `.env*`, sessions, stores, SQLite y DB; no sigue symlinks por default. Cada match de rg se canonicaliza y vuelve a autorizar; paths absolutos/`..` se descartan y sólo se muestran relativos.
- Ls filtra entries sensibles antes de devolver nombres. Paths de resultados se muestran relativos al root consultado, no paths VPS.
- Tests cubren find, ls, grep literal/case-insensitive, nested secrets/DB no leak, symlink outside, regex inválida, match cap y glob absoluto/`..` rechazado.
- Verificación Linux provider-free en `/tmp`: 9/9 PASS con `/usr/bin/rg`; socket broker, path normalization y runtime Node Linux ejercitados sin tocar producción.
- Args activos quedan explícitos: `read,bash,edit,write,grep,find,ls,constelaciones_future_appointments`; `--no-builtin-tools` se conserva.

Rollout runtime-only ejecutado con autorización exacta:

- Source: `67b0643`; run `20260718-030745`; `sync=0`.
- Bundle SHA256, runtime backup, service restart, sockets/isolation/health: PASS.
- Mirrors no cambiaron: dictation sigue `5400a16`; OAuth, credenciales y feature flag no cambiaron (`feature=1`).
- Smoke broker como `fixvox-agent`: ls/find/grep PASS y traversal glob bloqueado.
- Smoke RPC Linux offline: args explícitos incluyen grep/find/ls, `--no-builtin-tools` presente y `get_state` PASS.
- Rollback/receipt: `/home/jpsal/.local/state/fixvox-agent-rollouts/20260718-030745/`.

## Batch 5 — Git/Deploy Específico

**Estado: foundation local/provider-free; producción deshabilitada.**

Arquitectura:

- Broker separado `pi-release-broker.mjs`; no reutiliza bash del workspace. Git commit/push/tag, systemctl, Docker, Wrangler, SSH/SCP y deploy scripts quedan bloqueados explícitamente en bash normal.
- Operaciones tipadas: status/diff read-only, commit, push y deploy por recipe ID. Caller no puede enviar paths, remotes, flags, env ni shell fragments.
- Config root-owned de repos/branch/remote/allowed paths y recipes exactas; `release-recipes.example.json` mantiene deploy deshabilitado.
- Runner usa argv sin shell, env allowlist y Git prompt off. Commit sólo allowed paths y sin hooks; push verifica branch/remote, fetch, fast-forward, source hash y remote hash final.
- Deploy ejecuta binarios/args exactos de recipe, health exacto y rollback exacto; sólo el hash ya pusheado puede desplegarse.
- Prepare genera nonce, operation hash, source hash, target, TTL y frase exacta. Commit usa owner confirm; push/deploy requieren input exacto. RPC UI request queda session-bound, recent-owner, TTL y one-time en Admin.
- Journal conserva sólo timestamp, operation/repo/target, operation+source hashes y result; nunca diff, command, prompt, identity ni credentials.
- Feature y tools se registran sólo con `PI_CHAT_RELEASE_BROKER_ENABLED=1`; default/producción permanece `0`.

Validación local:

- Fake broker: forged/stale/reused confirmation, branch/remote, sensitive untracked, non-fast-forward, source drift, exact pushed hash, serialization, failed health+rollback y redacted journal.
- Git runner real sobre repos temporales: exact remote, allowlisted commit, diff, fast-forward push y remote hash PASS; deploy/health failure ejecuta rollback exacto.
- Policy tests prueban bypass de `git -C ... push`, systemctl y deploy script; release tools sólo aparecen en args/env cuando feature enabled.

Foundation commit: `8bb6668`. JP eligió **Dictation push + Admin deploy** como primer scope.

- `pi-admin-deploy-broker.mjs` agrega el helper exacto para Admin: source hash clean/main, manifest fijo, checks, backup, copy/restart/health y rollback+health verificado bajo lock.
- Tests prueban hash/branch, manifest bounded, serialization implícita y health failure con rollback exacto.
- Helper HTTP Unix sólo acepta `sourceHash`, body 4 KiB; rechaza JSON inválido y cualquier command/path/env/manifest caller-controlled.
- Operations concretas: Git inspect exacto, node checks, tar backup, copies staged con owner/mode, restart user-service con uid/gid fijo, local+public health y restore verificado; cero shell fragments.
- Units templates separan `fixvox-release` de helper root, sockets/grupo dedicados, filesystem restrictions y services disabled por default.
- `pi-release-provision.ps1`: dry-run default, bundle SHA256, backup, manifests exactos y switches separados `-RegisterDeployKey`/`-EnableReleaseBroker`. Sólo registra key write en `jpsala/dictation-tauri`; nunca copia private key ni GH token.
- Mirror Dictation cambia a group `fixvox-workspace` 0771/0660 para release-only group access; provider conserva sólo traverse. Constelaciones no cambia.
- Linux `/tmp` provider-free: broker, Git runner/push temporal, Admin HTTP/helper y rollback 9/9 PASS. PowerShell parse + dry-run key PASS.

Provisioning foundation: `2c19794`; deploy-key receipt fix `df021fc`.

Provisioning ejecutado con autorización exacta:

- Run `20260718-034947`, key registrada write-only scope en `jpsala/dictation-tauri`, title `fixvox-release-dictation`; key ID persistido para rollback.
- Usuario `fixvox-release` sin sudo/Docker/SSH login; private key 0600 sólo release. Agent/workspace no reciben key ni GH token.
- Dictation mirror group-write sólo para `fixvox-workspace`; release puede leerlo, provider no. Constelaciones sigue inaccesible para release.
- Runtime/config/units root-owned instalados; release broker y Admin helper disabled/inactive; Admin feature release sigue `0`/unset.
- Host key público de GitHub reutilizado desde known_hosts existente; deploy-key SSH auth PASS. Git safe.directory/identity local quedaron configurados sin secretos.
- Backup/receipt: `/home/jpsal/.local/state/fixvox-release-provision/20260718-034947/`; GitHub key ID guardado.
- Mirror Dictation está clean pero stale (`5400a16` vs remote `df021fc`), por lo que fast-forward guard devuelve false y cualquier push queda bloqueado como corresponde.

Enable read-only ejecutado con autorización exacta:

- Primer sync run `20260718-102224` PASS. Primer enable run `20260718-102245` abortó fail-closed al detectar la key existente desde usuario sin traverse; services/feature quedaron disabled.
- Fix idempotente `d50d583` usa `sudo test -f`; retry enable run `20260718-102358` PASS, services/sockets 0660 activos y Admin feature release=1.
- Status remoto inicialmente reveló mirror stale tras el fix. `792c0da` hace status con fetch real y detiene/reinicia release broker durante swaps.
- Sync final `20260718-102611`: Dictation mirror `792c0da`, clean y hash idéntico a remote; Constelaciones `02a4b1e`.
- Read-only smoke como `fixvox-agent`: status main/clean/fastForward true, diff 0; RPC offline cargó release tools explícitas con no-builtins.
- No mutation: local==remote, tree clean, journal vacío, Admin helper no invocado. Health y tres services activos.

Primer commit/push smoke fue autorizado y comenzó:

- Sync pre-smoke `20260718-163509` dejó mirror/remote `34ad7bd`, clean, main y servicios activos.
- OAuth owner quedó listo. Dos prompts intentaron crear `docs/tracks/pi-release-broker-smoke.md`, pero el modelo se negó antes de llamar `write`: interpretó “pre-execution approval card” como una tarjeta que debía existir antes del tool call.
- No hubo tool call, write, commit, push ni deploy; mirror/remote siguen `34ad7bd`, tree clean y release journal 0 bytes.
- Root cause: wording ambiguo en `pi-remote-agent-core.mjs`. Fix local WIP aclara que llamar la tool dispara la intercepción/card y que no debe pedir aprobación sólo en prosa. Aún no está testeado, commiteado ni desplegado.

Regression local agregada: el before-agent prompt debe decir `call the intended tool normally`, que policy intercepta antes de ejecutar y que nunca se pida approval sólo en prosa. Suite security/Admin 38/38 PASS.

Segundo intento autorizado:

- Sync preparatorio `20260718-210101` dejó mirror/remote `34ad7bd` clean.
- Un prompt UI alcanzó read+edit; la automatización de stream duplicó una request (una siguió y la otra recibió 409), por lo que no hubo una señal única confiable para avanzar a commit.
- Se restauró el único cambio documental sin commit. Mirror clean==remote, journal release vacío; no commit, push ni deploy.
- Fail-closed: `PI_CHAT_RELEASE_BROKER_ENABLED=0` y Admin restart. Key y services quedan provisionados/activos, pero tools release no se registran en Pi.

Próximo paso exacto: commit/push del wording+regression; gate nuevo para rollout runtime+sync y re-enable read-only. Repetir smoke sólo con requests UI separadas y observables, nunca con un evaluator que pueda duplicar fetch. Deploy Admin sigue separado.

## Batch 6 — Trusted Owner Pi

**Dirección corregida por JP:** Pi Chat Admin debe ser el Pi normal del VPS, equivalente a abrir una sesión como `jpsal`, no un sandbox/catálogo de herramientas Fixvox. JP aceptó explícitamente el blast radius y eligió **Sin restricciones**.

Contrato:

- Proceso Pi corre como `jpsal`, `HOME=/home/jpsal`, cwd `/home/jpsal/dev/dictation-tauri`.
- Usa instalación/configuración/modelo/sesiones/extensions/skills/tools globales reales; built-in read/write/edit/bash y credenciales accesibles desde esa identidad.
- RPC usa `--approve`: no approvals por tool, push, deploy o comando. Brokers/release policy no se cargan.
- Perímetro solamente: Google owner con OAuth reciente para health/prompt/command, una tarea global, CSRF/origin existente, stop/kill y idle timeout 30 min.
- `PI_CHAT_UNRESTRICTED_OWNER=1` y `PI_CHAT_REMOTE_AGENT_ENABLED=0` son mutuamente excluyentes.
- No incluye Windows/Chrome local sin relay aparte.

Validación local/VPS sin rollout:

- Pi normal `/home/jpsal/.local/bin/pi` 0.80.6 arrancó RPC offline desde el repo real, cargó el catálogo global de extensions y devolvió `get_state` con modelo/session bajo `/home/jpsal/.pi/agent`.
- Tests prueban que unrestricted requiere OAuth reciente en health, command y prompt; 27/27 security/Admin PASS.
- Release tools continúan feature-off.

Activación production autorizada y completada:

- Source `91c7b3b`; Admin backup `/home/jpsal/.local/state/fixvox-admin-backups/20260718-215058.tar.gz`.
- Env receipt/rollback: `/home/jpsal/.local/state/fixvox-owner-mode/20260718-215058-owner/`.
- Active: `PI_CHAT_UNRESTRICTED_OWNER=1`, remote sandbox/release tools off, bin `/home/jpsal/.local/bin/pi`, cwd `/home/jpsal/dev/dictation-tauri`, idle 30m.
- OAuth Google owner reciente requerido y validado. `/api/admin/env` reportó `piMode=unrestricted-owner`; health Pi 0.80.6 PASS.
- Proceso dentro del cgroup Admin corre UID/GID 1000 `jpsal`, HOME `/home/jpsal`, repo real y sesión bajo `/home/jpsal/.pi/agent`; no remote extension/broker args.
- Prompt UI real `Respondé exactamente OWNER_MODE_OK. No uses herramientas.` devolvió `OWNER_MODE_OK`, settled/listo, 0 tools.
- Public health PASS. No commit/push/deploy durante el smoke.
- Nota operativa: el checkout VPS canónico ya tenía 19 paths dirty y HEAD `0ae95311` por el modelo histórico de Admin deploy; no se limpió ni revirtió nada. Trusted Owner Pi ve exactamente ese estado, como una sesión manual en el VPS.

Follow-up cerrado:

- Se detectó que la ruta prompt todavía agregaba los guardrails históricos aunque el proceso ya era unrestricted.
- Fix `d92c09b` hace pass-through exacto del mensaje en owner mode, reporta `guardrails=[]` + warning honesto, conserva wrapper sólo en modos aislados y prueba exclusión mutua/recent OAuth; tests server/access 21/21 PASS.
- Redeploy Admin autorizado, backup `/home/jpsal/.local/state/fixvox-admin-backups/20260718-220037.tar.gz`; owner env se preservó.
- OAuth reciente, env mode/warning/guardrails, health y proceso PASS. Prompt UI real `RAW_OWNER_PROMPT_OK` volvió exactamente, ready, 0 tools y sin texto histórico agregado.

Trusted Owner Pi queda operativo sin restricciones internas. Las únicas fronteras restantes son el perímetro owner/OAuth/single-task/stop/idle y la ausencia de relay hacia Windows/Chrome local.
