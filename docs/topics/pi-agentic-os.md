---
id: pi-agentic-os
status: active
kind: how-to
triggers:
  - pi os
  - /aos-continuar
  - /aos-sync
  - /aos-plan-implementar
  - ask_user
  - computer use
  - cua-driver
  - browser automation
primary_refs:
  - .pi/prompts/
  - .pi/extensions/
  - docs/topics/pi-extension-stack.md
  - docs/topics/pi-planning-implementation-tooling.md
  - docs/topics/docs-knowledge-system.md
---

# Pi Agentic OS

Adapter Pi local para comandos AOS, strategy gates y verificacion de UI/desktop
cuando APIs/tests no alcanzan.

## Comandos Utiles

- `/aos-sync`: ensure skills link, regenerar indice y correr audit.
- `/aos-status`: snapshot de sesion, git, contexto y audit.
- `/aos-continuar [objetivo]`: abrir continuidad desde docs vivos.
- `/aos-plan-implementar`: planear/ejecutar por cortes eligiendo un motor.
- `/aos-guardar-sesion`: persistir valor durable sin transcript.
- `/aos-skills status|on|off|toggle`: controlar discovery de skills.
- `/aos-orquestar` / `/aos-fanout`: fan-out solo si aporta y es seguro.

## Strategy Gate

- Study/research externo: `web_search` + `fetch_content`/`web_answer`;
  `librarian` para internals open-source.
- Decision fuerte: `advisor()` antes de `DECISIONS.md`, arquitectura, storage,
  prod, provider/cloud, runtime o loops largos.
- Codigo tocado: `lens_diagnostics`/LSP como feedback; checks del repo mandan.
- Cambio chico: manual + Ponytail solo si esta activo o JP lo pidio.

## Human In The Loop

Usar `ask_user` para desktop side effects, clipboard/paste mutation, provider
cloud calls, prod/admin, installs, autostart, datos privados o scope ambiguo.

## Computer Use / Desktop

Orden: API/test directo -> Playwright/DOM/browser -> Cua/UIA background -> visual
por screenshots. Usar fixtures efimeras y evidencia externa. No operar apps,
cuentas, portapapeles o documentos reales sin confirmacion.

## Web, Internet E Instalaciones

Usar internet libremente cuando evite adivinar, sin enviar secretos ni datos
privados. Si evidencia online contradice repo/docs/runtime, pausar y pedir
decision con ambas evidencias. Antes de instalar cualquier tool/CLI/paquete,
pedir autorizacion con comando exacto, alcance, riesgos y rollback.
