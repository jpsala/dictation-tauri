---
id: agentic-os-operations
status: active
kind: how-to
triggers:
  - crear sistema agentico
  - migrar sistema agentico
  - actualizar norte
  - aos
  - init os
  - adopt os
  - update os
  - adaptar proyecto
  - repo nuevo
  - realinear os
  - auditar sistema agentico
  - reparar sistema agentico
  - drift de contexto
primary_refs:
  - AGENTS.md
  - docs/WORKING_MEMORY.md
  - docs/TOPICS.md
  - docs/.generated/context-index.md
  - docs/skills/
  - docs/tracks/
  - docs/topics/os-quality.md
  - docs/topics/local-codex-skills.md
  - scripts/agent-context-audit.ts
  - scripts/context-index.ts
  - scripts/context-refresh.ts
---

# Operaciones Del Sistema Agentico

## Cuando Usarlo

Usar este topic cuando JP quiera crear, migrar, actualizar o auditar un sistema agentico en este repo o reparar drift de contexto.

Alcance por defecto: solo capa agentica/docs/scripts/skills/adapters. No tocar codigo producto, arquitectura runtime, datos, audio, proveedores, deploy ni secretos salvo pedido explicito.

## Intenciones

| Pedido | Accion |
| --- | --- |
| `aos-realinear-os`, "realinear os", "auditar sistema agentico" | Reparar drift de la capa agentica contra la realidad local. |
| `aos-perfect-os`, "dejar en condiciones" | Ejecutar el checklist de `docs/topics/os-quality.md`. |
| `init/adopt/update os` en este repo | Fusionar o actualizar piezas AOS aplicables sin pisar reglas locales. |
| "Se contamino / crecio demasiado" | Compactar ruta caliente y mover historia a referencias profundas o archivo. |
| "Skills locales / slash commands" | Abrir `docs/topics/local-codex-skills.md`. |

## Principio Upstream / Downstream

Este repo es un downstream de AOS: contiene una instalacion local, minima y especifica para Dictation Tauri.

No copiar metasistema ni gobierno del upstream AOS dentro de este repo. Viajan patrones, estructura, scripts, skills y adapters utiles; no viajan registry global, decisiones internas de AOS, inventarios de otros proyectos ni docs que hagan parecer que Dictation Tauri es el kit canonico.

Regla corta: adaptar AOS al repo; no clonar la oficina de gestion de AOS.

## Comando `realinear os`

### Lectura Minima

1. `AGENTS.md`.
2. `docs/.generated/context-index.md` si existe.
3. `docs/WORKING_MEMORY.md`.
4. `docs/TOPICS.md`.
5. Tracks activas en `docs/tracks/` si el problema toca continuidad.
6. `docs/topics/local-codex-skills.md` si el drift involucra skills o `.agents`.
7. `scripts/agent-context-audit.ts` y `scripts/context-index.ts` si hay que corregir validacion o generacion.

No abrir docs largos, specs completas, archivos archivados ni referencias profundas salvo que una inconsistencia concreta lo requiera.

### Revisar

- Capas locales: core docs, scripts, skills, adapter Codex (`.agents`), SpecKit si aplica, indice y audit.
- Ruta caliente: `AGENTS.md`, indice generado, `WORKING_MEMORY.md`, `TOPICS.md` y tracks activas siguen chicos y no son transcript.
- Routing: topics relevantes existen, tienen triggers utiles y estan linkeados desde `docs/TOPICS.md`.
- Continuidad: tracks activas tienen estado, prioridad, fecha, next step y refs que existen; tracks archivadas viven en `docs/tracks/archive/`.
- Skills: `docs/skills/` es fuente canonica; `.agents/skills` debe quedar como junction/symlink estable hacia ese canon. `off`/`toggle` son aliases legacy no destructivos, no borran el path.
- Decisiones: lo durable esta en `docs/DECISIONS.md` o topic estable, no enterrado en una track.
- Specs: specs activas estan indexadas, no tienen prefijos duplicados y tienen `spec.md`.
- Drift: docs raiz no contradicen la ruta inicial ni el estado real del repo.
- Archivos sueltos: notas, drafts, handoffs o contexto viejo tienen destino claro.
- Audit/sync: `scripts/context-index.ts`, `scripts/context-refresh.ts` y `scripts/agent-context-audit.ts` cubren problemas recurrentes baratos de validar.

### Corregir Sin Preguntar

- Compactar texto repetido en ruta caliente.
- Actualizar links, triggers, frontmatter y referencias rotas obvias.
- Mover informacion durable desde track a topic, decision o doc estable cuando el destino sea claro.
- Marcar o archivar tareas cerradas cuando el estado sea claro.
- Regenerar `docs/.generated/context-index.md`.
- Ajustar el audit para cubrir drift recurrente y barato.

### Preguntar Antes

- Borrar memoria que podria ser util.
- Mover archivos historicos grandes cuando no este claro su destino.
- Cambiar convenciones principales del sistema.
- Tocar codigo producto, specs de feature, runtime, datos, audio, proveedores o deploy.
- Reemplazar reglas locales preexistentes en vez de fusionarlas.

### Cierre

1. Actualizar `docs/WORKING_MEMORY.md` solo si cambio el estado vivo.
2. Registrar decision durable en `docs/DECISIONS.md` si cambio una regla.
3. Actualizar la track activa o archivarla si corresponde.
4. Ejecutar:

```powershell
bun run context:index
bun run context:audit
```

5. Reportar correcciones, omitidos, pendientes y resultado del audit.

### Criterio De Exito

Una sesion nueva puede leer poco, entender que esta activo, abrir el topic correcto, continuar una track/spec y confiar en que el audit detecta el drift que acaba de corregirse.

## Adaptacion A Otro Proyecto

Si alguna vez se usa este repo para preparar otro destino, aplicar solo como patron local y no como manager upstream:

1. Leer el destino antes de crear archivos.
2. Detectar stack, comandos, docs, tests, deploy, datos sensibles y reglas existentes.
3. Detectar archivos preexistentes de contexto, notas, recomendaciones, drafts o discusiones. No dejarlos sueltos: integrarlos, moverlos a una ubicacion documentada, archivarlos con estado claro o preguntar antes de borrar.
4. Si ya hay `AGENTS.md`, `docs/`, `.agents/`, `.pi/`, `.specify/` o `specs/`, tratarlo como migracion.
5. Proponer estructura minima necesaria y adaptada: core docs, topics, tracks, skills, context scripts y adapters que se usen realmente.
6. Crear backups antes de reemplazar archivos existentes.
7. Fusionar reglas locales, decisiones y memoria viva en vez de pisarlas.
8. Reemplazar placeholders por contexto real del proyecto.
9. Omitir cualquier pieza manager-only del upstream AOS.
10. Correr checks de contexto del destino si existen.

## Regla

No copiar contexto de otro proyecto, no borrar memoria local util sin integrarla y no dejar archivos preexistentes desindexados. El objetivo es mejorar acceso al conocimiento, no resetearlo.

Si el sistema crece demasiado, la prioridad no es agregar mas estructura: primero compactar la ruta caliente, archivar historia y dejar referencias profundas bajo demanda.
