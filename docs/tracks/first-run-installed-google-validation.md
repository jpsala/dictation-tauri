---
status: blocked
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
- En el host `JP`, `main` quedó verificada en `6d4ad80`, sincronizada con
  `origin/main`; el untracked ajeno `.f5r2-promote.tmp.sh` no se tocó.
- Installer local reconstruido y verificado con `sha256sum`, no publicable ni
  transferido:
  `src-tauri/target/release/bundle/nsis/Fixvox Tauri_0.1.0_x64-setup.exe`,
  29.572.246 bytes, SHA-256
  `e585dc9ccfa8713140083c149e810fa50e1a2b65c763e891d4066d350fc23385`.
- El intento autorizado en `JP` se detuvo durante la verificación del backup:
  el copiador alcanzó a crear
  `C:/Users/jpsal/Fixvox-Tauri-backups/first-run-google-20260724-233219`, pero
  el verificador invocó por error `Get-FileHash`, no disponible en ese Windows.
  Ese backup parcial (8 archivos) no es utilizable ni debe asumirse verificado.
- Un segundo intento explícitamente autorizado usó `robocopy` y preparó
  verificación por manifiestos relativos con `/usr/bin/sha256sum`, sin volver a
  invocar `Get-FileHash`. Las tres primeras copias devolvieron `robocopy=1`; la
  cuarta, `%LOCALAPPDATA%/dev.jpsala.fixvox-tauri`, devolvió `9` con la app y su
  WebView aún activos. El stop ocurrió antes de calcular manifiestos.
- Quedó además el backup parcial no utilizable
  `C:/Users/jpsal/Fixvox-Tauri-backups/first-run-google-20260724-233707`
  (754 archivos). El parcial anterior tampoco se eliminó.
- En un tercer intento autorizado se cerró únicamente `dictation-tauri` y se
  creó el backup quiescente verificado
  `C:/Users/jpsal/Fixvox-Tauri-backups/first-run-google-20260724-234239`:
  instalación 8 archivos, roaming principal 195, roaming app-id 4 y local
  app-id 548; origen y copia coincidieron mediante manifiestos relativos
  `sha256sum`. Sólo entonces se eliminaron los dos parciales.
- La continuación autorizada verificó otra vez árbol `6d4ad80`, installer
  `e585dc9c…fc23385` (29.572.246 bytes), backup y superficies. Un `.ps1`
  temporal ejecutó uninstall, reset e instalación sin errores y se eliminó.
- La observación real pasó por bienvenida, Google y `Todo listo` automáticamente,
  pero `Empezar` no abrió el dock. Se detuvo en el primer fallo, sin relanzar ni
  reparar. No hubo dictado, audio, clipboard, STT/provider, release o deploy.
  La app quedó cerrada, el backup intacto y las cuatro superficies del nuevo
  estado presentes.

### Stop vigente

Track bloqueado por el fallo observable de `Empezar`. La autorización de esta
validación quedó consumida: no repetir OAuth/reset ni ampliar el corte. El
siguiente plan debe diagnosticar provider-free por qué `Empezar` no abre el dock
antes de definir cualquier nueva validación instalada.
