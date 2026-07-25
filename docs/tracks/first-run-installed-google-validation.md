---
status: active
updated: 2026-07-25
priority: high
execution_route: strong
topic: docs/topics/ui-design-and-impeccable.md
related:
  - docs/tracks/first-run-welcome-and-sign-in.md
  - docs/tracks/standard-product-ux-external-operation-gate-plan.md
---

# First-Run Installed Google Validation

## Objetivo

Validar una vez, en la app Windows instalada y con estado local limpio, que el
recorrido real de Google llega al dock como fue implementado.

## Comportamiento observable

- La instalación sin sesión muestra la bienvenida, abre Google y continúa
  automáticamente sin `Ya inicié sesión`.
- Al completar OAuth y vínculo muestra `Todo listo para dictar`; `Empezar` abre
  el dock.
- Un relanzamiento posterior con la sesión válida abre directamente el dock.

## Límites

- Requiere autorización explícita para la PC, cuenta Google y reset del estado
  local; respaldar ese estado antes de tocarlo.
- Una sola validación de login/link. No dictado, provider STT, audio, clipboard,
  release, publicación, deploy, commit ni push.
- Usar un instalador unsigned generado localmente desde el árbol identificado;
  no ampliar el corte para corregir fallos ajenos al recorrido.
- Evidencia sólo redacted, sin email, tokens, URLs OAuth, identificadores raw ni
  capturas con datos de cuenta.

## Criterios de terminado

1. El recorrido instalado observado pasa por `Bienvenida`, `Google en curso`,
   `Todo listo`, `Empezar` y `dock`, sin confirmación manual intermedia.
2. El relanzamiento con sesión válida evita la bienvenida y abre el dock.
3. El estado final o su restauración coincide con lo autorizado y no quedan
   procesos propios abiertos.

## Checks focales mínimos

```powershell
npm run tauri:build
```

- Verificar hash del installer antes de instalar y ejecutar una sola observación
  manual redacted del recorrido y del relanzamiento.
- Confirmar al cierre que no hubo provider/dictado y que sólo se modificaron las
  superficies locales autorizadas.

## Handoff Para La Próxima PC

### Estado alcanzado

- La implementación local quedó completa en
  `docs/tracks/first-run-welcome-and-sign-in.md`: bienvenida única, polling
  automático de Google, readiness host-owned, sesión vencida diferenciada y
  confirmación `Todo listo para dictar` antes de abrir el dock.
- Evidencia de código: tests onboarding 15/15, test focal adicional 4/4, build
  frontend verde, `cargo test setup_readiness --quiet` 6/6 y diagnósticos sin
  errores.
- Se autorizó en esta PC una única validación instalada con la cuenta Google
  habitual, backup y reset acotado. El build NSIS unsigned completó
  correctamente.
- Installer local generado, no publicable ni transferido:
  `src-tauri/target/release/bundle/nsis/Fixvox Tauri_0.1.0_x64-setup.exe`,
  26.556.718 bytes, SHA-256
  `3a52d869e671e1402570c7036001b15ac64085008022682fd7d2e04ef4c34e5f`. Debe
  reconstruirse en la próxima PC desde el commit recibido.
- El intento operativo se detuvo antes del backup porque ese Windows PowerShell
  no dispone de `Get-FileHash`. Se eliminó el directorio de backup vacío; la app
  original siguió ejecutándose. No hubo reset, uninstall, install, OAuth, link,
  provider, clipboard ni mutación de cuenta.

### Continuación exacta

1. Hacer pull del commit y confirmar working tree atribuible; leer este track y
   `docs/WORKING_MEMORY.md`.
2. Revalidar la autorización para la nueva PC, la cuenta Google permitida y el
   reset local respaldado. La autorización anterior no se transfiere
   automáticamente de equipo.
3. Construir un installer unsigned nuevo:

   ```powershell
   npm run tauri:build -- --bundles nsis --ci --no-sign
   ```

   Calcular tamaño/hash con `sha256sum`, no con `Get-FileHash`.
4. Respaldar fuera del repo la instalación de `Fixvox Tauri` y únicamente
   `%APPDATA%/dictation-tauri`, `%APPDATA%/dev.jpsala.fixvox-tauri` y
   `%LOCALAPPDATA%/dev.jpsala.fixvox-tauri`; detenerse si falta alguna
   superficie esperada o el backup no es verificable.
5. Con un solo intento autorizado: cerrar sólo `dictation-tauri`, desinstalar
   `Fixvox Tauri`, limpiar esas tres superficies, instalar el NSIS local y
   observar manualmente `Bienvenida → Google → Todo listo → Empezar → dock`.
6. Cerrar y relanzar una vez para confirmar apertura directa del dock. Registrar
   sólo evidencia redacted y detenerse sin dictado, provider, publicación ni
   otro batch.

### Stop vigente

No ejecutar el paso 4 en adelante sin una autorización explícita emitida desde
la próxima PC. Ante el primer fallo, no reparar ni reintentar automáticamente;
dejar la app y el backup en un estado explicado y actualizar este track.
