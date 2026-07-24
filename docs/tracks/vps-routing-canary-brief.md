---
status: blocked
execution_route: balanced
started: 2026-07-22
updated: 2026-07-23
priority: high
owner: Pi
parent: specs/019-fixvox-self-hosted-control-plane
related:
  - docs/tracks/vps-persistent-provider-canary-plan.md
  - docs/tracks/vps-gate-f-external-closure-brief.md
---

# VPS Routing Canary

## Estado

JP autorizó un canary completo y reversible para una sola identidad JP. El
primer Gate B se bloqueó y revirtió porque ningún probe alcanzó el connector.
El troubleshooting provider-free aislado reconcilió account/origin cert y
probó Tunnel API más DNS por CLI. Quedó bloqueado antes de Access/connector
porque el token scoped carece de Access write. Cloudflare conserva
authority/hot path.

## Baseline Vivo

- VPS `current -> 4075da53c365a8b1`, schema 6 y markers histórico/canary 1/1.
- Rollback probado `73c764c8c679dc40`, service active/enabled, restarts 0 y
  cinco backups cifrados.
- Provider persistente configurado; único listener `127.0.0.1:8790`.
- Health, readiness y Admin HTTP 200; `cloudflare-authority` permanece vigente.
- `auth-fixvox.jpsala.dev` responde por Cloudflare con service `fixvox-proxy`.
- El Tunnel dedicado del canary y su unit fueron eliminados; los Tunnels
  preexistentes de Infra permanecen intactos.

## Objetivo

Enrutar una única identidad JP allowlisted al VPS para un dictado sintético,
controlado y reversible, sin cambiar la autoridad productiva.

## Arquitectura Congelada

- Cloudflare sigue siendo front door, authority y rollback.
- Un Tunnel autenticado alcanza únicamente `127.0.0.1:8790`; no se abre bind,
  firewall ni endpoint VPS público directo.
- El Worker enruta sólo la identidad JP allowlisted mediante un kill switch
  server-owned. No hay routing porcentual, mirroring ni retries.
- Una identidad no-canary continúa en Worker.
- El routing se desactiva al terminar y se prueba el retorno al Worker.

## Gates De Ejecución

1. **A — Provider-free local:** harness, identidad allowlisted, kill switch y
   tests sin red, provider ni secretos.
2. **B — Origin privado:** crear/configurar Tunnel autenticado y comprobar sólo
   health/readiness por el canal privado.
3. **C — Routing apagado:** desplegar soporte de routing con el kill switch en
   `off` y verificar rollback exacto del Worker.
4. **D — Un canary:** activar sólo JP, insertar marker antes del intento y
   ejecutar un dictado sintético con máximo una llamada provider y cero retry.
5. **E — Retorno:** desactivar routing y probar JP y no-canary nuevamente por
   Worker, preservando Cloudflare authority.

## Límites Explícitos

- Sin cutover general, cambio de authority, import final, cambio de hostname o
  contrato de cliente.
- Sin endpoint VPS público, tráfico porcentual, segundo intento o fallback
  ambiguo después de iniciar el canary.
- No persistir audio, transcript, credenciales ni identificadores crudos.
- No continuar sin autenticación Cloudflare válida y rollback Worker exacto.

## Criterios De Terminado

- La identidad canary completa una única transcripción por VPS con respuesta
  correcta y exactamente una llamada al provider.
- Una identidad no-canary permanece en Worker.
- El kill switch vuelve a `off`; JP y no-canary pasan otra vez por Worker.
- Cloudflare continúa como authority y la evidencia queda redacted.

## Stop Conditions

- Baseline VPS, rollback, schema, markers, provider o authority divergentes.
- Credencial Cloudflare inválida, rate limited o imposible de usar sin exponerla.
- Tunnel no autenticado o necesidad de bind/firewall/endpoint VPS público.
- Identity mismatch, tráfico ambiguo, provider call previa o rollback incierto.
- Cualquier necesidad de cutover general o cambio de authority.

## Handoff — Batch D1 Provider-Free Isolado

**Estado:** bloqueado; no repetir sin un token con Access Apps/Policies y Service Tokens write provisionado mediante `/flow → Planear`.

**Objetivo:** demostrar `edge → Tunnel dedicado → loopback` sin Worker deploy,
KV, identidad, audio, provider ni cambio de authority.

**Secuencia exacta:**

1. Crear `.git/cloudflared-isolated.yml` con sólo `no-autoupdate: true`.
2. Usar siempre `cloudflared --config <archivo> tunnel ...`, operar por UUID y
   confirmar por API que nombre, UUID y CNAME coinciden.
3. Levantar temporalmente una respuesta fija no sensible en
   `127.0.0.1:18790`.
4. Crear Tunnel/DNS/Access temporales; proteger Access antes de arrancar el
   connector. No inspeccionar DOM/texto en la pantalla que muestra secretos;
   usar sólo botones Copy, clipboard temporal y restauración inmediata.
5. Exigir: sin token `403`; con token `200` y marcador fijo; la métrica
   `cloudflared_tunnel_total_requests` debe subir.
6. Sólo si pasa, cambiar ingress a `127.0.0.1:8790` y probar `/health` y
   `/ready` autenticados. Detenerse ahí.
7. En éxito o fallo, eliminar servidor diagnóstico, DNS, Access app/policy,
   service token, Tunnel, unit/config/credentials y temporales; verificar VPS
   `4075da53…`, restarts 0, loopback y `cloudflare-authority`.

**Baseline al cerrar esta sesión:** no existe infraestructura temporal ni
listener `18790`; VPS y Worker productivos están intactos. El patch Worker
local y su test permanecen WIP sin deploy ni commit. El fallo previo sugirió
interferencia de `C:/Users/jpsal/.cloudflared/config.yml`; no tocar ni reiniciar
los Tunnels preexistentes de PI WEB/Admin/SSH.

## Receipt De Intento Y Rollback — 2026-07-23

El working tree tracked estaba limpio antes del gate; se preservaron dos
untracked conocidos y excluidos. El preflight remoto confirmó release,
rollback, schema, markers, provider, servicio, listener, endpoints y backups.
El health público confirmó Cloudflare/Worker. El token genérico local falló,
pero `C:/dev/infra` aportó la credencial Fixvox scoped correcta y Wrangler pudo
leer la versión productiva activa sin imprimir secretos.

Gate A agregó sólo un patch local no desplegado: trigger server-owned, hash de
identidad obligatorio, kill switch KV fail-closed, origin HTTPS exacto,
Cloudflare Access, timeout acotado, cero redirect/retry/fallback y header de
receipt. El test focal pasó y no hubo provider ni tráfico productivo.

Gate B creó un Tunnel dedicado, DNS temporal y una Access app con policy de
service token. Durante una inspección diagnóstica el navegador expuso una
credencial efímera en la salida de la herramienta; se trató como comprometida,
se rotó y luego se eliminó sin usarla en Worker. El secreto nuevo se manejó por
clipboard temporal restaurado y también fue eliminado al cerrar el intento.
Nunca se guardó en repo ni docs.

El connector dedicado quedó activo con cuatro conexiones, pero los probes
Access-authenticated devolvieron `404` y su métrica conservó cero requests
proxied. Cambiar únicamente el fallback del mismo Tunnel no alteró el resultado.
Las rutas Worker/custom-domain no mostraron conflicto. Se detuvo antes de
secrets/deploy Worker, KV, identidad, audio, marker o provider.

Rollback completo: unit/config/credentials remotos del Tunnel removidos; DNS,
Access app/policy, service token y Tunnel eliminados; temporales locales y
clipboard limpiados. El VPS quedó nuevamente en `4075da53c365a8b1`, service
active, restarts 0, loopback, health/readiness 200 y `cloudflare-authority`.
No hubo dictado, provider call, routing, cutover, cambio de authority ni push.
El próximo intento requiere explicar y probar provider-free por qué el edge no
enrutó al connector dedicado; no debe ampliar ni reiniciar el Tunnel existente
de PI WEB/Admin.

## Receipt Batch D1 Bloqueado — 2026-07-23

La ruta `balanced` se aplicó por override explícito. El preflight confirmó
`4075da53…`, servicio active/enabled, restarts 0, loopback `8790`, health y
readiness 200 con `cloudflare-authority`; `18790` y las units temporales estaban
ausentes. Se usó el config aislado exacto y se preservaron todos los cambios
locales previos.

Un primer intento terminó antes de validar el Tunnel por tratamiento local de
un warning de versión; el cleanup quedó verde. Tras corregir sólo ese wrapper y
reconfirmar baseline/ausencia de recursos, el segundo Tunnel creado por el
origin cert no pudo confirmarse con la cuenta/token API scoped esperada (`401`).
Se aplicó la stop condition de identity mismatch antes de DNS, Access, servidor
diagnóstico, connector o probes.

Cleanup final verificado: Tunnel dedicado ausente en la cuenta del origin cert;
DNS, Access app/policy y service token nunca creados; sin listener `18790` ni
métrica `49312`, units/config/credentials/temporales remotos ausentes. VPS quedó
en `4075da53…`, restarts 0, único loopback `8790`, health/readiness 200 y
`cloudflare-authority`; Worker público health 200. No hubo deploy, KV, identidad,
audio, provider, routing, cambio de authority, commit ni push.

## Receipt Batch D1 Reconciliado Y Bloqueado — 2026-07-23

La comparación read-only confirmó que origin cert y account IDs coinciden. El
`401` anterior provenía de consultar Tunnels con un token sin ese scope: el
token embebido del origin cert validó por API los cuatro Tunnels legítimos. Se
descubrió además un Tunnel D1 huérfano del primer warning-path; se eliminó por
UUID y la ausencia quedó verificada antes del nuevo intento.

El intento autorizado creó y confirmó el Tunnel por API y el CNAME mediante
`cloudflared --config` más lectura DNS scoped. Access se detuvo inmediatamente
con `403` al crear la app: el token disponible tiene lectura, pero no Access
write. No se creó app, policy, service token, servidor diagnóstico ni connector;
no hubo probe, identidad, audio, provider, Worker deploy ni routing.

El delete con cascade removió Tunnel y CNAME. Verificación final: cero recursos
D1 en Tunnel/DNS/Access, service token nunca creado, sin units/roots/credenciales
o listeners `18790`/`49312`. VPS permanece en `4075da53…`, service
active/enabled, restarts 0, único loopback `8790`, health/readiness 200 y
`cloudflare-authority`; Worker público health 200. El siguiente gate requiere
un token con permisos exactos de Access Apps/Policies y Service Tokens write.
