---
status: complete
execution_route: strong
started: 2026-07-23
updated: 2026-07-23
priority: high
owner: JP
parent: docs/tracks/vps-routing-canary-brief.md
related:
  - specs/019-fixvox-self-hosted-control-plane
---

# VPS Routing Canary — Cloudflare Access Gate

## Objetivo

Desbloquear el D1 provider-free con un token Cloudflare de alcance mínimo que permita administrar Access Apps/Policies y Service Tokens.

## Comportamiento Observable

Las verificaciones de capacidad para Access Apps/Policies y Service Tokens dejan de responder por permisos insuficientes sin exponer el valor del token.

## Límites Explícitos

- Sin permisos más amplios que los necesarios ni persistencia, impresión o documentación del secreto.
- Sin crear connector, desplegar Worker, tocar Tunnels existentes ni ejecutar audio, provider o routing.
- El provisionamiento o rotación del token es un gate externo a cargo de JP.

## Criterios De Terminado

- El token queda disponible en `C:/dev/infra/.env` como `FIXVOX_D1_CLOUDFLARE_ACCESS_API_TOKEN`, sin entrar al repo ni a la evidencia.
- Las capacidades exactas de Access Apps/Policies y Service Tokens write se validan de forma redacted.
- No quedan recursos temporales y el baseline VPS/Worker permanece sin cambios.

## Checks Focales Mínimos

- Probe redacted de las tres capacidades requeridas, con fallo cerrado ante account o scope incorrectos.
- Confirmación de ausencia de recursos temporales y del baseline VPS/Worker vigente.
