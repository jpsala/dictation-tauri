---
status: active
started: 2026-07-18
updated: 2026-07-18
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
