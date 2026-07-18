---
status: active
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

**Implementación local completa y verificada; todavía no incorporada a un nuevo installer ni a la instalación local.**

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

- El installer y la instalación local actual todavía contienen el build anterior; no declarar el fix disponible allí hasta rebuild + upgrade autorizados.
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

## Siguiente Acción

Completar el rollout autorizado y registrar hashes/versiones/evidencia. Mantener login/link y provider como gates posteriores separados.
