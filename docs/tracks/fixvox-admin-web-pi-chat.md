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

Crear para Fixvox/Dictation Tauri un admin web remoto equivalente en espiritu a `https://turnos.jpsala.dev/admin/pi` de Constelaciones, para que JP pueda operar Fixvox Cloud, usuarios, policies, usage y Pi remoto sin depender de dejar la PC local encendida.

URL objetivo preferida:

```text
https://fixvox.jpsala.dev/admin/pi
```

## Decision

Vale la pena para este repo **si se mantiene chico y operativo**: un control room de Fixvox, no una segunda app gigante.

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
- Idealmente componentes/acciones como Constelaciones: confirmations, pickers, status cards, tool logs.

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
2. Portar lo minimo de Constelaciones:
   - `apps/web/src/server/pi-rpc.ts` pattern.
   - `apps/web/src/routes/admin.pi.tsx` concept, no toda la app.
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
- 2026-06-30: token web rotado porque el anterior fue pegado en el chat; service `fixvox-admin-web.service` reiniciado y login + Pi health validados.
- Checks: `node --check admin/fixvox-web/server.mjs`, `npm run cloud:test` (67/67), `npm run build` OK; VPS health local OK, login OK, `/api/pi-chat/health` OK, `/api/admin/accounts` OK, prompt Pi respondio `FIXVOX_ADMIN_PI_OK`.
- Falta polish UX y acciones admin rich; el MVP web ya existe.

## Proximo Paso Para Nueva Sesion

Arrancar con objetivo:

> Convertir el MVP `https://fixvox.jpsala.dev/admin/pi` en un control room poderoso: mejor chat Pi, tool logs, confirmaciones para mutations, y tabs accounts/devices/policies/usage.

Primer small batch recomendado:

1. Mejorar UI `/admin/pi` con historial legible, tool logs y status cards estilo Constelaciones.
2. Agregar acciones con confirmacion: assign-account-policy, assign-device-policy, refresh accounts/devices.
3. Agregar `/admin/accounts` y `/admin/devices` como tabs/paneles reales dentro del admin web.
4. Mantener `ADMIN_API_KEY` y token web server-side; nunca exponerlos al browser.
5. Checks: `node --check admin/fixvox-web/server.mjs`, `npm run cloud:test`, smoke remoto login + Pi prompt.

## Guardrails

- No push sin aprobacion explicita.
- No deploy/tunnel/systemd nuevo sin aprobacion explicita.
- No copiar Constelaciones entero ni acoplarlo al producto de turnos.
- No exponer `ADMIN_API_KEY` ni tokens al browser.
- No mutar policies/users sin confirmacion humana.
