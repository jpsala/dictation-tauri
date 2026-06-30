---
status: active
started: 2026-06-30
updated: 2026-06-30
priority: high
owner: JP
related:
  - docs/tracks/fixvox-tauri-cloud-release.md
  - docs/tracks/fixvox-registered-users-opportunities.md
  - C:/dev/infra/docs/runbooks/automations-agents.md
  - C:/dev/infra/docs/INVENTORY.md
topic: fixvox-cloud-runtime-port
source_refs:
  - /home/jpsal/dev/dictation-tauri
  - /home/jpsal/.local/bin/dictation-tauri-pi
  - /home/jpsal/.local/bin/dictation-tauri-console
---

# Pi Prod Workspace For Dictation Tauri

## Objetivo

Poder trabajar en Fixvox Tauri/Cloud desde el VPS productivo por SSH/Pi sin depender de que la PC local de JP quede encendida.

## Estado Actual

- VPS: `srv1761438`, usuario `jpsal`, alias SSH local recomendado `vps`.
- Pi existe en VPS: `/home/jpsal/.local/bin/pi`, version `0.80.2`.
- Repo remoto preparado: `/home/jpsal/dev/dictation-tauri`.
- El repo se inicializo desde bundle local con todos los commits actuales; `origin` apunta a `https://github.com/jpsala/dictation-tauri.git`.
- Estado remoto al crear: `main...origin/main [ahead 45, behind 2]` porque no se hizo push desde local.
- Cloud Worker tests pasan en VPS: `cd ~/dev/dictation-tauri && npm run cloud:test` -> 65/65.
- Helpers creados:
  - `dictation-tauri-pi` -> `cd /home/jpsal/dev/dictation-tauri && pi "$@"`.
  - `dictation-tauri-console` -> tmux session `dictation-tauri` en ese repo.
  - `fixvox-admin` -> admin CLI redacted-safe para `health`, `devices`, `accounts`, `policies`, `assign-device-policy ... --yes` y `assign-account-policy ... --yes`.
- Auth remoto verificado:
  - Wrangler autenticado (`wrangler whoami` OK, output no registrado).
  - `wrangler deploy --dry-run` OK desde `cloud/fixvox-proxy`.
  - `ADMIN_API_KEY` provisionado fuera del repo en `~/.config/dictation-tauri/admin.env` con `chmod 600`.
  - `fixvox-admin devices 2` OK contra produccion, imprime IDs redacted por defecto.
  - Deploy aprobado 2026-06-30 desde VPS: Worker version `6c2501dd-e7af-4e8b-9697-9251aad5c8c3`; `fixvox-admin accounts 5` OK post-deploy.
  - `dictation-tauri-pi --no-tools ... -p` respondio `PI_REMOTE_OK`, confirmando modelo Pi remoto usable.

## Comandos De Entrada

SSH read-only/status:

```bash
ssh vps 'cd ~/dev/dictation-tauri && pwd && hostname && whoami && git status --short --branch'
```

Abrir shell persistente tmux:

```bash
ssh -t vps dictation-tauri-console
```

Correr Pi en el repo remoto:

```bash
ssh -t vps 'cd ~/dev/dictation-tauri && pi'
# o
ssh -t vps dictation-tauri-pi
```

Checks rapidos:

```bash
ssh vps 'dictation-tauri-pi --version'
ssh vps 'cd ~/dev/dictation-tauri && npm run cloud:test'
ssh vps 'cd ~/dev/dictation-tauri/cloud/fixvox-proxy && wrangler deploy --dry-run'
ssh vps 'fixvox-admin health'
ssh vps 'fixvox-admin devices 5'
ssh vps 'fixvox-admin policies'
```

Admin mutation existente, usar solo con aprobacion:

```bash
ssh vps 'fixvox-admin assign-device-policy <deviceId> <policyId> "<Label>" --yes'
```

## Que Se Puede Hacer Ahi

- Trabajar en docs/specs/tracks sin PC local encendida.
- Iterar `cloud/fixvox-proxy/` y tests Worker.
- Preparar cambios de admin/users/groups/usage/quota.
- Operar con Pi remoto en el repo, bajo los mismos guardrails de este proyecto.
- Preguntar a Pi remoto desde SSH (`dictation-tauri-pi`) con modelo autenticado.
- Ver devices/policies y asignar policy a device con `fixvox-admin` bajo aprobacion.
- Usar `fixvox-admin accounts` / `assign-account-policy` para operar policies por cuenta; mutations requieren aprobacion explicita.
- Hacer deploy Cloudflare Worker solo con aprobacion explicita.

## Limitaciones

- Windows/Tauri GUI, Cua local y smokes desktop reales siguen requiriendo una maquina Windows.
- El repo remoto tiene commits locales que aun no estan en GitHub; hasta que haya push aprobado, GitHub no es la fuente completa.
- No se configuro servicio/autostart/tunnel nuevo para Dictation Tauri; el acceso inicial es por SSH/tmux.
- Admin actual aun es incompleto para producto: hay listado/assignment account-level y device-level, pero faltan UI de grupos, crear grupos/templates desde admin y usage/quota dashboard.
- No copiar secretos ni `.env` al repo; el admin key remoto vive fuera del repo en `~/.config/dictation-tauri/admin.env`.

## Proximo Paso Recomendado

1. Implementar Phase A del track `docs/tracks/fixvox-registered-users-opportunities.md`: admin users/groups real, account-level assignment y tests.
2. Decidir si se aprueba `git push` para que GitHub y VPS queden alineados.
3. Si JP quiere UI web persistente, crear un ttyd/tunnel separado para Dictation Tauri con aprobacion explicita.
4. Si JP quiere agent remoto always-on para este repo, crear servicio systemd user separado y documentarlo en `C:/dev/infra`.

## Guardrails

- No push sin aprobacion explicita.
- No deploy Cloudflare Worker sin aprobacion explicita.
- No instalar autostart/systemd/tunnel nuevo sin aprobacion explicita.
- Antes de tocar prod/remoto: `pwd && hostname && whoami && git status --short --branch`.
- No imprimir secretos, tokens, emails completos, account IDs, device IDs, transcripts, selected text ni audio.
