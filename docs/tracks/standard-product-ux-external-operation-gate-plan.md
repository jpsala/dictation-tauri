---
status: active
started: 2026-07-18
updated: 2026-07-18
priority: high
owner: JP/Pi
topic: standard-product-ux-redesign
related:
  - docs/tracks/standard-product-ux-redesign-plan.md
  - docs/tracks/fixvox-tauri-cloud-release.md
  - docs/WORKING_MEMORY.md
source_refs:
  - scripts/start-tauri-dev-hidden.ps1
  - scripts/tauri-onboarding-visual-smoke.ps1
  - src-tauri/tauri.conf.json
---

# Standard Product UX — External Operation Gate Plan

## Estado

**Reset local con backup y first launch controlado completos (`DONE`).** La app quedó reinstalada desde cero, abrió correctamente, creó sólo identidad local de instalación y permanece sin device, policy, auth session ni autostart. El proceso propio fue cerrado. No hubo provider, login, clipboard ni publicación.

No hay batch activa. Cualquier login/link, uso con datos reales, provider/dictado, publicación o smoke en otra PC debe volver a **Batch 2 — Decisión Humana De Operación**; no existe continuidad automática.

## Routing Decision

- **Intent:** planificar y controlar una única operación externa posterior al cierre local del rediseño.
- **Motor principal:** manual staged, un único owner y una sola batch activa.
- **Perfil recomendado:** **Implementador**.
- **Por qué:** las operaciones comparten working tree, artefactos y límites de seguridad; la ejecución serial reduce cruces de estado y facilita abort/rollback.
- **Apoyos:** lectura focal, scripts existentes, checks específicos y evidencia redacted.
- **Orquestación:** sólo review final opcional; no Taskflow, fan-out ni writers paralelos sin opt-in explícito nuevo.
- **Gate obligatorio:** **Batch 2 — Decisión Humana De Operación**.
- **Verificación:** checks script-first específicos de la operación elegida, evidencia redacted y cierre explícito sin encadenar otro gate.

## Objetivo

Preparar, decidir, ejecutar y cerrar de forma segura **una única operación externa** posterior al rediseño local, con alcance, efectos, rollback, checks y evidencia definidos antes de producir side effects.

## No Objetivos

- Repetir OAuth o vínculo de cuenta/dispositivo ya validados.
- Ejecutar más de una operación externa en la misma corrida.
- Cambiar UI, runtime, routing, ownership, contratos, schema, providers, modelos, cuotas o RBAC.
- Promover el router account-first como routing default.
- Implementar un bridge OAuth nuevo.
- Limpiar datos, drafts o artefactos productivos.
- Instalar dependencias, CLIs o paquetes.
- Hacer commit, push, deploy o publicación fuera de la operación elegida y autorizada.
- Reabrir D-R2, Spec 019 o el rediseño visual.

## Invariantes

- Preservar routing default dock, ownership host-owned y `Salir → cerrar`.
- Preservar RBAC, recent-auth, lock, historia inmutable, audit y credenciales server-side.
- No registrar secretos, tokens, URL OAuth, email, IDs raw, audio, transcripciones, selected text ni PII.
- Mantener intactos los cambios ajenos del working tree; no usar checkout/reset para rollback.
- Cerrar sólo procesos iniciados por el batch.
- Cada operación debe tener una autorización explícita propia; una autorización no habilita la siguiente.

## Batches Verificables

### Batch 1 — Read-Only Readiness Packet

**Objetivo:** producir un paquete corto y redacted que permita tomar la decisión humana sin ejecutar operaciones externas ni modificar producto.

**Trabajo:**

1. Registrar `git status --short --branch` sin normalizar ni revertir el working tree.
2. Confirmar el estado durable en `docs/WORKING_MEMORY.md`, este track, el track de rediseño y el track de release.
3. Inventariar scripts, artefactos y checks disponibles para cada opción, sin abrir secretos ni ejecutar provider/OAuth/prod/release.
4. Confirmar que la evidencia OAuth/link existente sigue redacted y que no hace falta repetirla.
5. Crear un readiness packet bajo `artifacts/standard-product-ux-redesign/external-operation-gate/<run-id>/readiness.md` con:
   - baseline y commit/branch;
   - working tree resumido;
   - las cuatro opciones elegibles;
   - prerequisitos conocidos;
   - efectos, rollback y stop conditions por opción;
   - checks propuestos y evidencia esperada.
6. Detenerse antes de cualquier UI, login, provider, build installer, publicación o acceso a otra PC.

**Checks:**

- El packet no contiene secretos, PII, audio ni transcripciones.
- Las cuatro opciones están descritas sin favorecer continuidad automática.
- Cada opción declara efectos permitidos, efectos prohibidos, rollback y abort conditions.
- `git diff --check` sólo como check no mutante.

**Stop:** falta información que sólo puede obtenerse ejecutando una operación externa; el working tree no permite atribuir cambios; aparece una contradicción entre docs y evidencia local; o el packet requeriría exponer datos sensibles.

**Receipt 2026-07-18:** completo en modo read-only, sin UI ni efectos externos. El packet redacted quedó en `artifacts/standard-product-ux-redesign/external-operation-gate/20260717-215901/readiness.md`. Baseline: `main` en `0ae95311305a`, con 26 archivos tracked modificados y 9 untracked preservados. Se confirmó la presencia de la evidencia OAuth/link previa sin abrir su contenido. El installer NSIS local existe y su SHA256 `3a388bdc17e82ff31bb74c467a7a1383896f97b6bc733fcc09ea8605269de02c` coincide con la prerelease ya publicada `fixvox-tauri-v0.1.0-20260717122820`, construida desde source distinto (`1c8a4f9d8ced...`); por eso no representa el working tree actual. Resultado del inventario: provider/dictado requiere tres permisos de side effects; build installer requiere decidir provenance del árbol sucio; publicación no está ready porque el artefacto identificado ya fue publicado; smoke en otra PC tiene artefacto/hash verificados pero requiere equipo y alcance explícitos. No hubo login, provider, build, upload, install, acceso remoto, código, config, staging, commit ni push. Próximo paso obligatorio: Batch 2, selección humana de una sola operación y su contrato.

### Batch 2 — Decisión Humana De Operación

**Objetivo:** obtener de JP una decisión explícita y acotada sobre **exactamente una** operación.

**Opciones mutuamente excluyentes:**

1. **Provider/dictado real:** una transcripción controlada, con audio/contenido sensible fuera de reportes y stop inmediato tras verificar resultado redacted.
2. **Build installer:** generar y verificar localmente un installer unsigned; no publicar ni instalar en otra PC.
3. **Publicación prerelease:** publicar únicamente el artefacto previamente identificado, con checksum y rollback/retirada definidos; no incluye smoke en otra PC.
4. **Smoke en otra PC:** instalar/probar el artefacto acordado en un equipo autorizado; no incluye nueva publicación ni cambios de cuenta fuera de lo indispensable y aprobado.

**Contrato de decisión obligatorio:**

- opción elegida y resultado esperado;
- entorno/equipo/cuenta de prueba permitido;
- side effects permitidos;
- side effects prohibidos;
- tratamiento de audio, texto, identidad y artifacts;
- comandos o interacción previstos;
- presupuesto de intentos/tiempo;
- rollback y abort conditions;
- checks y evidencia redacted de cierre.

**Check:** la autorización debe nombrar una opción y aceptar su contrato acotado. Una frase genérica como “seguí” no habilita el Batch 3.

**Stop obligatorio:** sin decisión explícita, contrato incompleto, selección múltiple o cambio de alcance. Registrar `PLAN BLOCKED AT OPERATION GATE` en el receipt de ejecución y no continuar.

**Decision receipt 2026-07-18:** JP eligió **Build installer** y, ante el conflicto de provenance, eligió explícitamente **Árbol actual**. Contrato acotado: una sola invocación de `npm run release:windows`; source identificado por HEAD, status y fingerprints del diff/contenido untracked; preservar una copia del installer previo antes de que el script limpie el output; permitir sólo tests/builds locales y artifacts ignorados. Prohibido instalar, publicar, subir, deployar, instalar tooling/dependencias, editar producto para reparar, stagear, commitear o pushear. Stop al primer fallo, missing tool, mutación fuente inesperada o artefacto ambiguo; no retry automático. Evidencia final: checks del script, provenance, path, tamaño y SHA256 del nuevo NSIS, más `git diff --check`. Esta autorización no habilita prerelease ni smoke.

### Batch 3 — Ejecución De Una Única Operación

**Objetivo:** ejecutar sólo la opción autorizada en Batch 2 y detenerse al alcanzar su resultado o una abort condition.

**Reglas comunes:**

1. Revalidar inmediatamente antes de ejecutar que el contrato aprobado coincide con entorno, comandos y efectos reales.
2. Emitir aviso desktop/beep antes de una interacción perceptible con UI, clipboard, audio, instalador o otra PC.
3. Usar un run-id y directorio de evidencia separados.
4. No ampliar alcance para “aprovechar” una sesión, login, build o publicación.
5. Ante primer desvío de identidad, target, hash, health, permisos o datos, abortar fail-closed.

**Checks por rama:**

- **Provider/dictado real:** readiness/account/policy redacted; exactamente una corrida; provider request esperado; resultado funcional sin transcript/audio en reporte; procesos propios detenidos.
- **Build installer:** checks release definidos por el repo; artefacto y checksum; source revision; sin upload, install ni publish.
- **Publicación prerelease:** source revision y checksum coinciden; tag/canal no pisa legacy; upload único; redescarga y checksum; metadata sin secretos; rollback/retirada disponible.
- **Smoke en otra PC:** equipo y artifact autorizados; checksum previo; instalación/launch/readiness acordados; evidencia redacted; desinstalación o estado final según contrato.

**Stop:** cualquier operación distinta de la elegida; segundo intento no presupuestado; secreto/PII/audio/transcript en evidencia; target/hash inesperado; health degradado; login/cuenta no autorizados; necesidad de instalar tooling; mutación productiva adicional; o proceso ajeno que habría que cerrar.

**Execution receipt 2026-07-18:** `npm run release:windows` se ejecutó una sola vez y pasó. Checks: 45 archivos/241 tests focales; frontend build; `cargo fmt --check`; `cargo check`; `cargo test --no-run`; Tauri release y bundle NSIS. Los fingerprints pre/post del source quedaron idénticos. Nuevo installer unsigned: `src-tauri/target/release/bundle/nsis/Fixvox Tauri_0.1.0_x64-setup.exe`, 29.559.207 bytes, SHA256 `e947a810a55107482275eb102d30afc2724dde37f33de7f50c55af3c4c641b6b`. El installer anterior fue preservado en el directorio de evidencia con su hash publicado. No hubo retry, reparación, instalación, upload, publish, deploy, dependencia, UI, login, provider, clipboard, stage, commit ni push.

### Batch 4 — Verificación Y Cierre

**Objetivo:** cerrar la operación elegida con evidencia reproducible y sin abrir el siguiente gate.

**Trabajo:**

1. Ejecutar únicamente los checks de cierre declarados en Batch 2.
2. Confirmar que procesos propios terminaron y que no quedan uploads, installers o sesiones pendientes fuera del contrato.
3. Revisar artifacts por secretos/PII/contenido antes de referenciarlos en docs.
4. Registrar receipt durable en este track y actualizar `docs/WORKING_MEMORY.md`.
5. Regenerar índice/audit si se modificaron docs.
6. Declarar resultado `DONE`, `ABORTED` o `BLOCKED`, con rollback aplicado o pendiente.
7. Detenerse. Cualquier otra operación vuelve a Batch 2 con una autorización nueva.

**Checks:**

```powershell
bun scripts/context-index.ts
bun scripts/agent-context-audit.ts
git diff --check
```

Agregar sólo el check específico aprobado: health/checksum/smoke/provider report. No correr suites de producto por defecto si la operación no tocó código.

**Stop:** evidencia insuficiente o sensible; rollback no verificable; procesos propios vivos; resultado ambiguo; o presión para encadenar otra operación.

**Closure receipt 2026-07-18:** resultado `DONE`. Evidencia redacted en `artifacts/standard-product-ux-redesign/external-operation-gate/20260717-220342-build-installer/`: `provenance.txt`, manifest de hashes untracked, copia del installer previo, log de build, `result.txt`, `git-diff-check.txt` y `receipt.md`. `git diff --check` pasó con notices CRLF conocidos. El nuevo artifact representa un working tree sucio identificado por fingerprints, no una revisión committed reproducible. Esta operación queda cerrada; no autoriza publicar ni probar en otra PC.

### Segundo Gate — Smoke Aislado Local

**Decision receipt 2026-07-18:** JP eligió explícitamente **Smoke aislado** en esta PC. Contrato: una invocación de `npm run packaged-clean:smoke -- -AllowDesktopSideEffects` contra el ejecutable release recién generado, con `APPDATA`/`LOCALAPPDATA` aislados y sin provider, dictado, clipboard, login, cuenta, instalación ni publicación. Efectos permitidos: abrir la app Tauri empaquetada, crear artifacts ignorados y cerrar únicamente su proceso. Presupuesto: un intento; detener al primer fallo y no reparar/reintentar automáticamente. Checks: proceso vivo durante el mínimo, setup/app-data aislado, reporte redacted, proceso propio detenido y `git diff --check`.

**Smoke receipt 2026-07-18:** `DONE` en una única corrida `20260717-221402`. El release exe permaneció vivo durante startup, configuró el dock sin panic, persistió `installId` bajo `APPDATA` aislado, mantuvo `deviceId`/policy ausentes antes de activación, usó `Ctrl+Shift+F9` en vez de `Alt+Space` y no encontró dotenv en el working dir aislado. Reporte redacted: `artifacts/release/packaged-clean-smoke/20260717-221402/report.json`. PID propio `9296` confirmado detenido al finalizar; `git diff --check` pasó con notices CRLF conocidos. No hubo instalación, provider, dictado, clipboard, login/link, cuenta, publicación, deploy, commit ni push.

### Tercer Gate — Actualización De Instalación Local

**Decision receipt 2026-07-18:** el preflight encontró Fixvox Tauri 0.1.0 ya instalada y ninguna instancia corriendo. JP eligió explícitamente **Actualizar existente**. Contrato: respaldar binarios de instalación, ejecutar una vez el NSIS nuevo sobre la ubicación user-local existente y validar el ejecutable instalado mediante app data aislado; sin login, provider, dictado, clipboard ni datos reales. Rollback: installer publicado anterior y copia local de binarios. La primera envoltura PowerShell falló al parsear argumentos antes de invocar NSIS; no produjo side effect de instalación. La envoltura corregida invocó NSIS una sola vez.

**Upgrade receipt 2026-07-18:** `DONE`. NSIS silent exit `0`; registro conserva Fixvox Tauri `0.1.0`; el nuevo ejecutable instalado mide 29.316.093 bytes y tiene SHA256 `8694af08e92e823a460d3cd72816a6264b62581a0f3bf54ebafc9b021a5c7882`, distinto del binario previo respaldado (`88a70a...`, 29.217.981 bytes). El smoke instalado `20260717-222125-installed-upgrade` pasó startup, dock sin panic, app data aislado, install ID sin device/policy, fallback Ctrl+Shift+F9, working dir sin dotenv y cierre del PID propio. Evidencia: `artifacts/standard-product-ux-redesign/external-operation-gate/20260717-222001-local-upgrade/receipt.md` y `artifacts/release/packaged-clean-smoke/20260717-222125-installed-upgrade/report.json`. No hubo provider, dictado, clipboard, login/link, publicación, deploy, commit ni push.

### Cuarto Gate — Reset Local Con Backup

**Decision receipt 2026-07-18:** JP eligió explícitamente **Reset local con backup**. Alcance autorizado: respaldar fuera del repo la instalación, el estado host-owned actual (`%APPDATA%/dictation-tauri`), el app data Tauri actual (`%APPDATA%/dev.jpsala.fixvox-tauri`, `%LOCALAPPDATA%/dev.jpsala.fixvox-tauri`), startup Run value y shortcuts de Fixvox Tauri; desinstalar; eliminar sólo esas superficies actuales; reinstalar el NSIS nuevo; ejecutar un first-launch controlado y dejar estado local clean sin cuenta/device/policy. Preservar `dev.jpsala.dictation-tauri`, `fixvox`, `dev.jpsala.fixvox` y directorios legacy/test. No tocar cuenta/device Cloud, provider, dictado, clipboard, datos personales, publicación, deploy, commit ni push. Stop ante backup incompleto, path inesperado, proceso vivo, uninstaller/installer fallido o necesidad de ampliar superficies.

**Reset receipt 2026-07-18:** `PARTIAL/BLOCKED BEFORE FIRST LAUNCH`. El backup externo quedó verificado en `%LOCALAPPDATA%/PiBackups/dictation-tauri/20260717-223101`; uninstall e install salieron `0`; los tres directorios de estado actual siguen ausentes y los paths legacy/reference comprobados siguen presentes. El script se detuvo al intentar `Get-FileHash`, cmdlet no disponible en este Windows PowerShell, después de reinstalar y antes de abrir la app. Estabilización read-only: no hay proceso vivo; instalación `0.1.0` registrada; exe 29.316.093 bytes con SHA256 `8694af08e92e823a460d3cd72816a6264b62581a0f3bf54ebafc9b021a5c7882` calculado por `sha256sum`; autostart ausente; shortcuts recreados por NSIS; estado nuevo todavía ausente. Evidencia: `artifacts/standard-product-ux-redesign/external-operation-gate/20260717-223101-local-reset/`. No se corrigió ni reintentó el script.

**First-launch decision 2026-07-18:** JP dio un nuevo `go` para completar únicamente el first launch controlado de la instalación fresh. Alcance: abrir el exe instalado con el app data real recién limpiado, esperar setup, verificar sólo una proyección redacted (`installId` presente; `deviceId`, policy y auth session ausentes), confirmar sin autostart y cerrar únicamente el proceso propio. Sin login/link, provider, dictado, clipboard, Settings/Admin, publicación ni reparación del script de reset. Un intento y stop al primer desvío.

**First-launch receipt 2026-07-18:** `DONE` en una única corrida `20260717-225001`. El exe instalado permaneció vivo durante startup; creó estado fresh con `installId` presente y `deviceId`, policy y auth session ausentes; no recreó autostart. El WebView local creó sólo su app-data esperado. PID propio `12408` quedó detenido. Reporte redacted: `artifacts/standard-product-ux-redesign/external-operation-gate/20260717-225001-first-launch/report.json`. No hubo login/link, provider, dictado, clipboard, Settings/Admin, publicación, deploy, commit ni push. El reset local queda cerrado como `DONE`; backup externo sigue disponible para rollback.

## Riesgos Y Mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Una autorización se interpreta como permiso amplio | Batch 2 exige opción única, efectos y presupuesto explícitos. |
| Se repite OAuth/link y se crean mutaciones innecesarias | Quedan fuera de objetivo; usar evidencia redacted ya existente. |
| Provider/dictado filtra contenido | Reporte por estados/contadores; audio y transcript fuera de docs/artifacts reportados. |
| Installer o prerelease apunta al source/hash incorrecto | Registrar revision y checksum antes y después; abortar ante mismatch. |
| Smoke en otra PC deja cambios no acordados | Definir equipo, instalación, cuenta, rollback y estado final antes de empezar. |
| Publicación pisa canal legacy | Canal/tag/asset explícitos y verificación de colisión previa. |
| Working tree grande mezcla autoría | Inventario read-only y diffs focales; no reset/checkout ni formateo amplio. |
| Se encadenan gates por conveniencia | Cierre obligatorio tras Batch 4; volver a Batch 2 para cualquier operación nueva. |

## Reversibilidad

- Batch 1 sólo crea evidencia ignorada/read-only y puede descartarse sin tocar producto.
- Batch 2 sólo registra una decisión; no produce efectos externos.
- Build installer es reversible eliminando artifacts locales no versionados.
- Provider/dictado no es reversible como request, por eso se limita a una corrida y evidencia redacted.
- Publicación prerelease requiere rollback/retirada definido antes de ejecutar; nunca se asume reversible por defecto.
- Smoke en otra PC requiere estado final y rollback explícitos, incluido desinstalar sólo si fue autorizado.

## Stop Conditions Globales

Detener y reportar si:

- Batch 2 no contiene una decisión explícita sobre una única operación;
- cambia el entorno, cuenta, equipo, artifact, canal, hash, presupuesto o clase de efectos aprobada;
- hace falta una dependencia, CLI, login, permiso o secreto no contemplado;
- se requiere editar código/config para completar la operación;
- aparece una contradicción entre docs, repo, evidencia local o estado remoto;
- un check crítico falla o el resultado no converge dentro del presupuesto;
- existe riesgo de exponer secretos, PII, audio o transcripciones;
- habría que cerrar procesos ajenos, limpiar datos o hacer una mutación adicional;
- se intenta iniciar otra operación sin volver al gate humano.

## Siguiente Batch

**Batch 1 — Read-Only Readiness Packet**, con perfil **Implementador**, manual staged y un único owner. Al completarlo, detenerse en **Batch 2 — Decisión Humana De Operación**. No ejecutar ninguna operación externa durante Batch 1.
