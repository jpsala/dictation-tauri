---
status: complete
started: 2026-08-18
updated: 2026-08-18
priority: high
owner: JP
related:
  - docs/tracks/clean-install-readiness-and-account-ux.md
  - docs/topics/fixvox-cloud-runtime-port.md
  - docs/WORKING_MEMORY.md
topic: docs/topics/ui-design-and-impeccable.md
source_refs:
  - src/App.tsx
  - src/onboarding/tauri-account-gate.tsx
  - src/onboarding/tauri-setup-readiness.ts
  - src-tauri/src/fixvox_cloud.rs
  - src-tauri/src/settings_window.rs
  - src/onboarding/account-notice-surface.tsx
---

# Account Gate · Visual Feedback For Not-Logged-In

## Objetivo

Cuando el host no reporta una cuenta signed-in, el dock hoy queda bloqueado en un
shell que sólo dice "Verificando tu cuenta…" y no comunica qué pasó ni qué hacer.
Dar un feedback visual claro y accionable del estado "no estás logueado": que se
entienda de un vistazo que falta autenticar, qué fase es y cómo resolverla.

## Estado Actual

- El root de `App.tsx` envuelve el dock en `TauriAccountGate`, que bloquea
  `DockSurface` (UI de dictado + handlers de hotkeys/menú) hasta que
  `getEffectiveTauriAccountReadiness` reporta `ready`.
- Cuando no está listo, el gate renderiza sólo:
  `<main class="onboarding-shell"><p>Verificando tu cuenta…</p></main>`
  (y `openingSetup ? "Abriendo la configuración…"` mientras abre setup).
  No hay distinción visual por fase ni acción visible: se percibe como un dock
  "en blanco"/bloqueado.
- `shouldOpenTauriAccountSetup(phase)` sólo dispara la ventana de setup para
  `welcome`, `oauth_handoff`, `account_linking`, `oauth_cancelled`,
  `oauth_expired`, `account_not_authorized`, `binding_conflict`. Para
  `service_unavailable` NO abre nada: queda clavado en el shell.

## Diagnóstico de por qué quedó bloqueado (2026-08-18)

- `get_fixvox_setup_readiness` (Rust, `fixvox_cloud.rs`) decide la fase por
  archivos locales, no por sondeo de backend:
  - `has_signed_in_local_context()` exige `device_state.auth_policy.access_mode == "signed_in"`.
  - Con `accessMode: "device"` (registro por dispositivo) el predicado da false,
    y como la sesión auth dice `status: "signed_in"`, mapea a `service_unavailable`.
- Estado observado en `%APPDATA%/dictation-tauri/`:
  - `fixvox-setup-readiness.v1.json` → `{"phase":"service_unavailable"}`.
  - `fixvox-device-state.json` → `authPolicy.accessMode: "device"`,
    `lastRegisterOk: true`, `policyId: "dictation-complete-v1"`.
  - `fixvox-auth-session.v1.json` → `status: "signed_in"` pero `userId: null`,
    `userEmail: null`, `sessionSecret` placeholder (igual a `sessionId`).
- La causa fue faltar autenticar (cuenta real), no el código de hotkeys
  (el trabajo sin commitear de Win+Space es un tema separado, ver track
  `stop-submit-hotkey-reliability.md`).

## Próximo Paso

Diseñar e implementar el feedback visual del estado no-logueado:

1. Leer `PRODUCT.md` y `DESIGN.md`, usar `docs/skills/impeccable`.
2. Decidir qué comunicar por fase (al menos `service_unavailable` vs el resto)
   y qué acción ofrecer (p. ej. "Conectá tu cuenta" / "Iniciar sesión"), sin
   romper el contrato redacted (nunca exponer device id, policy, provider).
3. Implementar en `TauriAccountGate` (+ CSS), cubriendo el caso `service_unavailable`
   que hoy no abre setup ni da acción.
4. Smoke real de la superficie con screenshot (per `AGENTS.md` / Design Context).

## Resultado (2026-08-18)

- Implementado en `TauriAccountGate` + `styles.css`. El dock ahora muestra, por
  fase, una píldora compacta (acorde al form factor 132×36, transparente/oscura)
  en lugar del `<p>Verificando tu cuenta…</p>` sin estilo:
  - `service_unavailable` → píldora-acción **"Conectá tu cuenta"** que abre una
    ventana de aviso compacta `account-notice` (no el wizard de onboarding).
  - `offline` / `policy_unavailable` → píldora-acción **"Reintentar"** que
    re-sondea la readiness de inmediato.
  - fases transitorias / `openingSetup` → píldora de progreso "Verificando…" /
    "Abriendo configuración…" con pulso.
- El contrato redacted se mantiene: el copy no expone device id, policy,
  provider ni tokens (verificado por test).
- `shouldOpenTauriAccountSetup` no cambió: las fases transitorias siguen sin
  auto-abrir setup; la acción es iniciada por el usuario.
- Verificación: `tsc`/`vite build` OK; Vitest `tests/onboarding` 25/25; smoke
  visual Playwright (`tests/visual/account-gate.spec.ts`) confirma la píldora
  "Conectá tu cuenta", el transición "Abriendo configuración…" al clic y las
  invocaciones `hide_dock`/`show_account_setup_window`. Screenshot en
  `artifacts/account-gate/not-logged-in.png`.

## Refinamiento · Aviso Compacto (2026-08-18)

- El clic de "Conectá tu cuenta" (`service_unavailable`) ya no abre el wizard de
  onboarding de 720×480. Abre una ventana de aviso compacta `account-notice`
  (360×160, no redimensionable) con copy fijo y botón "Cerrar".
- Contrato de dos rutas distintas, que no se deben confundir:
  `service_unavailable` → aviso compacto; `welcome`/`oauth_*` → wizard
  `account-setup` intacto para el alta real. `openTauriAccountSetup`,
  `shouldOpenTauriAccountSetup` y `refresh()` no cambiaron.
- Superficie nueva: comando Rust `show_account_notice_window` (ventana dinámica
  en `settings_window.rs`, no está en `tauri.conf.json`), superficie
  `?surface=account-notice` y componente `AccountNoticeSurface`. La acción del
  dock pasó de `open-setup` a `open-notice`. El copy sigue redacted (sin device
  id, policy, provider ni tokens).
- Verificación: `npm run build` OK, Vitest `tests/onboarding` 27/27 (incluye
  test de `openTauriAccountNotice` que invoca sólo `show_account_notice_window`,
  sin `hide_dock`), `cargo check` OK. No se lanzó la instancia Tauri ni se capturó
  screenshot: el render real de la ventana 360×160 y el cierre por "Cerrar"
  quedan sin confirmación física.

## Enmienda · Pill abre setup directo (2026-08-19)

- Se revirtió el "aviso compacto": el pill `service_unavailable` ("Conectá tu cuenta")
  ahora abre directo la ventana de setup/login (`openTauriAccountSetup` → `hide_dock` +
  `show_account_setup_window`), sin pasar por la ventana `account-notice`.
- Se eliminó la superficie `account-notice`: comando Rust `show_account_notice_window`,
  ruta `?surface=account-notice`, componente `AccountNoticeSurface`, sus tests y la entrada
  en `default.json` (quedó `["main","dock-companion","settings","account-setup"]`).
- El pill del dock también recibió `padding: 0 11px` → `0 13px` para respiración derecha.
- Pendiente de release; la app instalada (0.1.0) aún muestra el comportamiento anterior.

## Evidencia / Source Refs

- `src/onboarding/tauri-account-gate.tsx` (gate, `getEffectiveTauriAccountReadiness`,
  `shouldOpenTauriAccountSetup`, render del shell).
- `src/onboarding/tauri-setup-readiness.ts` (normalización de la proyección).
- `src-tauri/src/fixvox_cloud.rs` (`get_fixvox_setup_readiness_with_env` ~1944,
  `has_signed_in_local_context` ~1856).
- `src/App.tsx` (~5309: `return <TauriAccountGate … renderReady={() => <DockSurface />} />`).
