---
id: fixvox-local-to-production-workflow
status: active
kind: how-to
updated: 2026-06-30
primary_refs:
  - admin/fixvox-web/server.mjs
  - admin/fixvox-web/public/app.js
  - scripts/cloud-dev-local.ps1
  - scripts/admin-web-local.ps1
  - scripts/admin-web-prod.ps1
  - cloud/fixvox-proxy/wrangler.toml
  - docs/tracks/fixvox-admin-web-pi-chat.md
triggers:
  - local first
  - modo local
  - pasar a producción
  - promote to production
  - fixvox admin env
  - cloud dev local
---

# Fixvox Local-First → Produccion

## Principio

Para Dictation/Fixvox, trabajar **local-first** y promover a produccion solo cuando el flujo local esta validado. JP puede pedir a Pi: "pasá lo local a producción"; Pi debe seguir este playbook y pedir aprobacion explicita antes de deploy/push/mutaciones reales.

## Entornos

### Local/dev

Objetivo: iterar sin tocar usuarios reales ni Cloudflare production KV/DO.

- Admin Web: `http://127.0.0.1:8790/admin/pi`
- Worker local: `http://127.0.0.1:8787`
- Token local por defecto: `local-dev-token` (solo dev, no secreto real)
- Worker vars: `cloud/fixvox-proxy/.dev.vars` (gitignored)
- Banner UI: `LOCAL`
- Para polish visual/chat sin depender de Worker/Pi/VPS, usar mock local: `npm run admin:web:local -- -Mock`. Esto setea `FIXVOX_ADMIN_MOCK=1`, auto-login mock y fixtures de health/session/tools/accounts/devices/policies/usage.

Comandos:

```bash
# UI/chat polish sin infra real
npm run admin:web:local -- -Mock

# Integracion local con Worker dev real
npm run cloud:dev:local
npm run admin:web:local

# Integracion self-hosted provider-free (Checkpoint E)
npm run selfhosted:api:local
npm run admin:web:local -- -SelfHosted
npm run selfhosted:local:smoke

# Gated: sólo tras autorización explícita; genera una llamada/costo real
npm run selfhosted:local:real-provider:smoke
```

El lane `-SelfHosted` usa API `127.0.0.1:8790`, Admin `127.0.0.1:8787`, PostgreSQL exclusivamente `fixvox_test` y providers mock. La auth fixture sólo puede activarse con entorno `local` y backend loopback; falla cerrado fuera de ese perímetro. No cambia la autoridad productiva: Cloudflare sigue hot path/rollback.

`admin:web:local` setea:

```text
FIXVOX_ADMIN_ENV=local
FIXVOX_ADMIN_PORT=8790
FIXVOX_ADMIN_HOST=127.0.0.1
FIXVOX_ADMIN_BASE_URL=http://127.0.0.1:8787
FIXVOX_ADMIN_WEB_TOKEN=local-dev-token
PI_CHAT_CWD=<repo local>
# Solo con -Mock:
FIXVOX_ADMIN_MOCK=1
```

### Produccion

Objetivo: operar usuarios reales y Worker real.

- Admin Web: `https://fixvox.jpsala.dev/admin/pi`
- Worker production: `https://auth-fixvox.jpsala.dev`
- VPS service: `fixvox-admin-web.service`
- VPS app: `/home/jpsal/dev/dictation-tauri/admin/fixvox-web/`
- Token web prod: `~/.config/dictation-tauri/admin-web.env` (no imprimir)
- Admin API key prod: `~/.config/dictation-tauri/admin.env` (no imprimir)
- Banner UI: `PRODUCTION`

Comandos de chequeo:

```bash
curl.exe -sS https://fixvox.jpsala.dev/healthz
ssh vps 'systemctl --user status fixvox-admin-web.service --no-pager'
ssh vps 'cd ~/dev/dictation-tauri && npm run cloud:test'
```

## Guardrails

Siempre requieren aprobacion explicita de JP:

- `npm run cloud:deploy` / `wrangler deploy`
- `git push`
- cambios DNS/tunnel/systemd/autostart
- mutaciones production de usuarios/policies/devices/groups/quotas
- borrar datos reales
- imprimir/rotar/copiar secrets/tokens

Nunca imprimir:

- `ADMIN_API_KEY`
- `FIXVOX_ADMIN_WEB_TOKEN`
- OAuth codes/state/tokens
- emails completos si no hace falta
- account IDs crudos (`google:<sub>`)
- device/install IDs completos
- transcripts, selected text o audio

## Flujo De Trabajo Recomendado

### 1. Desarrollo local

Elegir un solo lane: Worker legacy para compatibilidad, o self-hosted provider-free para el contrato producto. Para el lane self-hosted:

```bash
npm run selfhosted:api:local
npm run admin:web:local -- -SelfHosted
# Gate automatizado coordinado:
npm run selfhosted:local:smoke
```

Para el lane Worker legacy:

1. Arrancar Worker local:

   ```bash
   npm run cloud:dev:local
   ```

2. Arrancar Admin Web local:

   ```bash
   npm run admin:web:local
   ```

3. Abrir:

   ```text
   http://127.0.0.1:8790/admin/pi
   ```

4. Validar que la UI muestre banner `LOCAL` y base URL `http://127.0.0.1:8787`.
5. Hacer cambios de producto/admin/Worker.
6. Correr checks locales.

### 2. Checks antes de promover

Minimo:

```bash
node --check admin/fixvox-web/server.mjs
node --check admin/fixvox-web/public/app.js
npm run cloud:test
npm run build
npm run test:pipeline -- tests/settings tests/voice-dock tests/desktop-control
cd src-tauri && cargo fmt --check && CARGO_TARGET_DIR=target/pi-local-promote cargo check
```

Segun cambio:

- Worker/admin policy: agregar tests en `cloud/fixvox-proxy/src/*.test.ts`.
- Desktop/Tauri: smoke Tauri correspondiente.
- OAuth/policy real: pedir aprobacion antes de smoke production.

### 3. Promocion a produccion

Antes de ejecutar:

1. Resumir cambios y evidencia local.
2. Pedir aprobacion explicita de JP para deploy/push/mutacion production.
3. Confirmar repo clean o cambios esperados.
4. Confirmar que no hay secrets staged.

Si JP aprueba deploy Worker:

```bash
npm run cloud:deploy
```

O desde VPS:

```bash
ssh vps 'cd ~/dev/dictation-tauri && npm run cloud:deploy'
```

Si JP aprueba actualizar Admin Web VPS:

```bash
# sync por bundle o git pull si ya fue pusheado
ssh vps 'cd ~/dev/dictation-tauri && systemctl --user restart fixvox-admin-web.service && curl -sS http://127.0.0.1:8787/healthz'
```

Post-deploy:

```bash
curl.exe -sS https://fixvox.jpsala.dev/healthz
ssh vps 'cd ~/dev/dictation-tauri && node scripts/fixvox-admin.mjs accounts 5'
```

### 4. Cierre

1. Documentar version Worker/admin/service, evidencia y rutas.
2. Regenerar indice/audit:

   ```bash
   bun scripts/context-index.ts
   bun scripts/agent-context-audit.ts
   ```

3. Commit atomico.
4. No push salvo aprobacion explicita.

## UI Safety

Admin Web expone `/api/admin/env`; la UI debe mostrar siempre:

- `LOCAL` cuando `FIXVOX_ADMIN_ENV=local`.
- `PRODUCTION` cuando `FIXVOX_ADMIN_ENV=production`.
- Base URL del Worker actual.

En production, acciones de mutation desde UI deben pedir confirmacion reforzada (`PROD`).

## Estado Implementado

- `scripts/cloud-dev-local.ps1`
- `scripts/fixvox-api-local.ps1`
- `scripts/admin-web-local.ps1` (`-Mock`, Worker legacy o `-SelfHosted`)
- `scripts/admin-web-prod.ps1`
- `npm run cloud:dev:local`
- `npm run selfhosted:api:local`
- `npm run selfhosted:local:smoke`
- `npm run selfhosted:local:real-provider:smoke` (gated; exactamente una llamada chat)
- `npm run admin:web:local`
- `npm run admin:web:prod`
- `admin/fixvox-web/server.mjs` soporta `FIXVOX_ADMIN_ENV` y `/api/admin/env`.
- `admin/fixvox-web/public/app.js` muestra banner de entorno y refuerza confirmacion production.
