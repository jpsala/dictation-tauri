---
id: pi-agentic-os
status: active
kind: how-to
triggers:
  - pi os
  - pi agentic os
  - /flow
  - pensar
  - planear
  - hacer
  - cerrar
  - ask_user
  - advisor
  - pi-lens
  - computer use
primary_refs:
  - aos.requirements.json
  - C:/dev/os/runtime/aos-flujo.ts
  - .pi/extensions/aos-doctor.ts
  - tests/aos-doctor.test.mjs
  - docs/topics/agent-tool-routing.md
  - docs/reference/tool-routing.yaml
  - scripts/agent-context-audit.ts
---

# Pi Agentic OS

Dictation Tauri consume el `/flow` global canónico de `C:/dev/os`; no mantiene
una copia local. La fuente de verdad del proyecto sigue en `AGENTS.md`,
`docs/WORKING_MEMORY.md`, topics, tracks y specs.

## Superficie Canónica

| Entrada | Uso |
| --- | --- |
| `/flow → Pensar` | Explorar, comparar y converger decisiones sin implementar. |
| `/flow → Planear` | Convertir lo decidido en un brief liviano y registrar un foco ejecutable. |
| `/flow → Hacer` | Resolver el foco 0/1/N; si está `ready`, abrir una sesión nueva enlazada con handoff documental revisable. |
| `/flow → Cerrar` | Compactar valor durable todavía faltante; es opcional si Hacer ya persistió el estado final. |
| `/new` | Abrir manualmente una sesión limpia fuera del handoff de Hacer. |

`/flow` sólo precarga texto revisable con `setEditorText()` y nunca autoenvía.
Pensar, Planear y Cerrar permanecen en la sesión actual; Hacer reemplaza la
sesión por una nueva enlazada mediante la API nativa de Pi y aplica antes del
handoff la `execution_route` declarada por Planear.

`economical` usa Luna High para docs o mecánica de bajo riesgo, `balanced` usa
Sol Medium por defecto y `strong` usa Sol High para trabajo sensible. Si la ruta
falta se usa `balanced`; si no existe el modelo o su autenticación, Hacer bloquea
sin fallback. No hay Terra, clasificador extra ni routing por turno.

## Runtime Global Y Adapter Local

- `aos.requirements.json` exige `aos.flow-first@1.1.0`, scope `user` y
  cardinalidad 1.
- El runtime efectivo es `C:/dev/os/runtime/aos-flujo.ts`, publicado por el
  package global Pi con provenance `user/package`.
- `.pi/extensions/aos-flujo.ts` no debe existir: produciría comandos duplicados.
- `.pi/extensions/aos-doctor.ts` sigue local porque diagnostica foco,
  referencias e índice específicos de Dictation Tauri.
- `scripts/agent-context-audit.ts` valida AOS Home, requirement 1.1, foco
  estricto, adapter local y ausencia de copias o aliases competidores.

## Contrato De Hacer

- sólo avanza con foco `ready`; 0 deriva a Planear, 1 autoselecciona y N abre
  picker; estados no ejecutables usan `Referencia` y fallan cerrado;
- abre una sesión nueva con `parentSession` y precarga el prompt mediante
  `withSession` + `setEditorText()`;
- el handoff lee índice, Working Memory y brief seleccionado; no promete mover
  conversación transitoria no documentada;
- la implementación ocurre directamente en el nuevo hilo principal, sin Agent,
  resumen LLM, runtime state ni auto-send;
- para trabajo local y reversible, el brief orienta intención y límites: se
  inspecciona sólo lo necesario, se implementa el resultado observable y se
  ejecutan checks focales no duplicados;
- si falta una decisión durable o el alcance crece materialmente, detenerse y
  volver a Planear en vez de inventar o absorber trabajo adyacente;
- actualizar track y Working Memory una sola vez y no iniciar otro batch.

## Herramientas Y Gates Locales

CodeMapper/FFF orientan; Lens/LSP diagnostican; Advisor aporta juicio; web y
librarian cubren conocimiento externo; Ask User resuelve decisiones humanas.
No son motores alternativos. Agent queda sólo para pedidos explícitos fuera del
camino normal de Hacer.

`/doctor`, SpecKit e Impeccable siguen como capacidades locales especializadas.
Browser, CUA, hotkeys, clipboard o UI visible requieren el aviso inicial de
`AGENTS.md`. Cuentas, installs, secretos, commit, push, deploy, producción,
audio, selección y delivery físico conservan sus gates.

## Flujo Recomendado

1. Índice → Working Memory → contexto puntual.
2. `/flow → Pensar` si falta una decisión.
3. `/flow → Planear` si falta un brief ejecutable.
4. `/flow → Hacer` para abrir el handoff documental en una sesión limpia.
5. Revisar el prompt, enviarlo e implementar directamente en ese hilo.
6. Persistir una vez el estado final; usar Cerrar sólo si falta valor durable.

## Portabilidad

El downstream declara requisitos y conserva sólo adapters con diferencia local
real. No copia runtime, settings globales, registry, tracks ni inventario del
manager AOS.
