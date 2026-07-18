---
status: complete
started: 2026-07-18
updated: 2026-07-18
priority: high
owner: JP/Pi
topic: standard-product-ux-redesign
related:
  - docs/tracks/standard-product-ux-redesign-plan.md
  - docs/tracks/standard-product-ux-external-operation-gate-plan.md
  - docs/tracks/standard-product-ux-redesign/first-run-state-machine.md
source_refs:
  - src/App.tsx
  - src/onboarding/tauri-account-gate.tsx
  - src/settings/SettingsSurface.tsx
  - src/settings/fixvox-cloud-control.ts
---

# Clean Install Readiness And Account UX

## Estado

**Implementación y rollout completo (`DONE`).** Código/push, installer, upgrade/smoke local, Worker Cloudflare, Admin VPS y prerelease quedaron verificados. Login/link y provider/dictado no formaron parte del rollout.

El dogfood de instalación limpia mostró tres fallos del flujo normal:

1. el dock permitía grabar antes de completar cuenta/device y terminaba en un recovery técnico en inglés;
2. Cuenta mezclaba copy account-first con `invite code`, Cloud y polling manual redundante;
3. `Comprobar estado` y `Actualizar estado` no producían feedback observable.

## Routing Decision

- **Intent:** corregir el camino clean-install y su feedback, sin tocar Cloud/schema/provider.
- **Motor:** manual staged, un único owner.
- **Perfil:** **Implementador**.
- **Scope:** TypeScript/React/CSS y tests; sin Rust runtime nuevo.
- **Gate externo:** rebuild installer, actualización de la instalación y login/provider reales requieren autorización separada.

## Objetivo

Una instalación sin cuenta abre Cuenta automáticamente, no presenta un dock usable, bloquea captura antes del micrófono/provider y guía el login con copy humano y feedback observable.

## No Objetivos

- Ejecutar OAuth/login/link real.
- Cambiar Cloud, schema, policy, cuotas, provider o modelos.
- Implementar todavía micrófono/atajo como pasos host-owned nuevos.
- Publicar, desplegar, instalar, commitear o pushear.
- Eliminar compatibilidad legacy/backend.

## Implementación

### Gate de arranque y dictado

- Nuevo `src/onboarding/tauri-account-gate.tsx` combina la proyección host-owned de setup con el status efectivo redacted.
- En Tauri, un estado no listo oculta el dock y abre Settings; un usuario ya vinculado conserva el dock.
- `startCapture()` verifica readiness antes de preparar contexto o llamar `desktopSession.start()`.
- Un intento sin setup produce cero captura/provider y abre Cuenta.
- El gate no vuelve a mostrar un dock que el usuario ocultó manualmente; sólo lo muestra al transicionar desde bloqueado a listo.

### Recovery

- Errores que mencionan device registration/ID se clasifican como setup de cuenta.
- Copy fallback: `Completar configuración` / `Conectá tu cuenta antes de volver a dictar.`
- El companion ya no debe exponer `registered device id`, `managed`, provider ni `Record again` para este caso.
- Errores de provider local no relacionados conservan su recovery técnico existente.

### Cuenta

- Settings selecciona Cuenta automáticamente cuando Tauri carga un status no listo.
- Copy principal: `Conectá tu cuenta` y explicación concreta del handoff Google.
- Estado pending: `Completá el inicio de sesión` + `Esperando confirmación…`.
- Se eliminó el botón redundante `Comprobar estado`; el polling sigue automático cada 3 segundos y al recuperar foco.
- No aparecen invite code, Cloud, managed dictation, IDs ni policy en la ruta normal.

### Avanzado

- `Actualizar estado` pasó a `Volver a comprobar`.
- La acción declara que relee diagnóstico local.
- Siempre actualiza `Última comprobación: HH:MM` y muestra un resultado visible mediante `aria-live`.
- Se separó el feedback de diagnóstico del feedback de Control Room.
- Copy administrativo restante quedó en español.

## Evidencia

Smoke Tauri real, perfil aislado y sin cuenta/provider:

- `artifacts/clean-install-account-ux/20260717-232500/account.png`
- `artifacts/clean-install-account-ux/20260717-232500/advanced.png`
- `artifacts/clean-install-account-ux/20260717-232500/result.json`

El log confirma `hide_dock` y `show_settings_window`; el proceso propio quedó detenido. El smoke final verificó apertura automática de Cuenta, ausencia de copy prohibido, main gate activo y feedback observable después de pulsar `Volver a comprobar`.

## Checks

- Focused onboarding/settings/voice-dock/desktop-control: 49 archivos, 264 tests.
- Suite frontend completa: 93 archivos, 478 tests.
- `npm run build`: verde.
- `npm run visual:check`: 8/8.
- Impeccable detector: sólo warning conocido por Inter, fuente definida por `DESIGN.md`.
- Tauri visual smoke aislado: PASS.
- Sin login, provider, clipboard, deploy, install, commit ni push.

## Riesgos

- El installer es unsigned; conservar SmartScreen/otra-PC como gate separado antes de ampliar distribución.
- Setup readiness host-owned aún no modela de forma real micrófono/atajo. Este corte usa account/device/capability como gate efectivo de dictado y no simula esos pasos.
- El polling de readiness es local/redacted; no debe convertirse en un loop de network/provider.
- No reintroducir fixture controllers en el default Tauri route.

## Stop Conditions

- El renderer recibe tokens, IDs raw o policy payloads.
- El gate inicia captura/provider antes de readiness.
- Settings necesita un invite code en el flujo normal.
- Un refresh local se presenta como llamada remota.
- Hace falta cambiar Rust/Cloud/schema para completar este corte.

## Rollout Gate

**Autorizado por JP el 2026-07-18: rollout completo y serial.** Alcance:

1. auditar y stagear explícitamente los cambios acumulados de Desktop, Rust, Worker, Admin y docs;
2. ejecutar checks completos y secret scan;
3. commit y push de `main`;
4. build installer desde el HEAD commiteado, upgrade/smoke local;
5. deploy Worker Cloudflare y verificar health/version;
6. deploy Admin VPS con backup/readiness/rollback;
7. publicar una prerelease desktop con checksum y verificarla por redescarga.

Stop inmediato ante secretos, checks rojos, diff no atribuible, health fallido, rollback no verificable o hash divergente. No ejecutar login/link ni provider/dictado dentro de este rollout.

**Checkpoint de rollout 2026-07-18:** el primer build desde `450cd3d` e instalación local salieron bien, pero el smoke empaquetado cortó correctamente porque todavía exigía el dock visible, contrato anterior al account gate. La evidencia real mostró `dock hide ok`, Settings solicitado y cero provider/login/clipboard, junto con una carrera packaged: el command renderer llegaba antes de que la ventana Settings configurada estuviera disponible y el fallback inmediato quedaba bloqueado. El smoke ahora exige dock oculto + Settings abierto + cero trabajo externo. El host agrega `show_account_setup_window`, command async que espera de forma acotada hasta 2,5 s sólo por la ventana configurada y nunca crea el fallback de Settings durante startup; `show_settings_window` conserva su fallback para aperturas posteriores del usuario. Tests Rust y source-contract cubren aparición, timeout redacted y separación del fallback. El rollout permanece detenido hasta commit/push, rebuild desde el nuevo HEAD y smoke instalado verde.

## Rollout Receipt 2026-07-18

- Commits pusheados a `origin/main`: `450cd3d`, `31cf205`, `9274577`.
- HEAD/release source: `9274577a7fa2e6d0bba52ac5492a65b0dccd1a44`.
- Suite final: 95 archivos / 480 tests; build, Rust fmt/check/test compile, Worker, Admin y visual checks verdes antes del rollout.
- Installer unsigned final: SHA256 `8f6ecbb1453eda2856b5ee254a853cc9dc91ed3a270ec999cb3ed3a2937754c8`, 29.584.764 bytes.
- Upgrade local: exit `0`; exe instalado SHA256 `11e715b650932fbd42837b9ef6c21fa41ac0838c636e40e13c1a7636718df1b6`.
- Smoke instalado final: PASS en `artifacts/release/packaged-clean-smoke/20260717-234700-rollout-installed-pass/report.json`; dock oculto, Settings abierto, install ID local sin device/policy, cero provider/login/clipboard y proceso propio detenido.
- Deploy Worker: los intentos iniciales fallaron antes de mutar por un token process-scoped inválido. Siguiendo `C:/dev/infra/docs/runbooks/cloudflare-operations.md`, el deploy final usó `FIXVOX_APP_CLOUDFLARE_API_TOKEN` desde `C:/dev/infra/.env`, mapeado sólo al child Wrangler y sin imprimir/persistir el valor.
- Worker activo: `df416730-61b8-4222-ab5f-282879251db9`; health público posterior `200`, `ok: true`, servicio `fixvox-proxy`.
- Admin VPS: deploy PASS con backup `/home/jpsal/.local/state/fixvox-admin-backups/20260718-000036.tar.gz`; health local del servicio y `https://fixvox.jpsala.dev/healthz` respondieron OK. Browser normal mostró la pantalla pública de login; no se inició sesión.
- Prerelease desktop: `fixvox-tauri-v0.1.0-20260718000133`, assets finales `Fixvox-Tauri-Setup.exe` y `.sha256.txt`. La primera subida conservó por error el nombre source del archivo; se corrigió antes del cierre eliminando sólo ese asset y subiendo el nombre canónico.
- Redescarga final SHA256: `8f6ecbb1453eda2856b5ee254a853cc9dc91ed3a270ec999cb3ed3a2937754c8`, idéntico al local y al checksum publicado.
- Release: `https://github.com/jpsala/fixvox-releases/releases/tag/fixvox-tauri-v0.1.0-20260718000133`.

## Follow-up Admin 2026-07-18

El review post-rollout detectó que Pi Chat seguía implementado y accesible desde acciones contextuales, pero había quedado fuera de `CONTROL_ROOM_AREAS` durante el rediseño, por lo que el sidebar no generaba su entrada. Se restauró `Pi Chat` como área primaria en `36daed2`, se movió el branch del click antes del lookup administrativo para no llamar `loadAdmin(undefined)`, y se agregó cobertura en server test + smoke visual del editor. Tests Admin 13/13 y smoke local PASS. Deploy Admin PASS con backup `/home/jpsal/.local/state/fixvox-admin-backups/20260718-005602.tar.gz`; servicio activo, healthz OK y Browser confirmó que `/assets/app.js` productivo contiene el nav y handler correctos. La sesión Browser seguía en login y no se inició OAuth.

## Siguiente Acción

No hay batch activa. Login/link real, provider/dictado, smoke en otra PC o promoción de canal requieren gates nuevos y separados.
