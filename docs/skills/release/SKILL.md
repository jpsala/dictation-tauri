---
name: release
description: Commit and push every safe repository change, publish a verified Fixvox Tauri Windows prerelease, install that exact published build locally, leave it running, and return the direct installer URL. Use only when JP explicitly invokes `release`, `/release`, or `$release` for this repository.
---

# Release

Cierra el estado actual del repositorio en una release Windows instalable y
verificada de punta a punta.

Fuentes canónicas:

- `scripts/release-windows.ps1` para checks y bundle NSIS;
- `docs/tracks/fixvox-tauri-cloud-release.md` para identidad, canal y assets;
- `src-tauri/tauri.conf.json` para producto y versión.

## Autorización

Invocar explícitamente `release`, `/release` o `$release` autoriza, para esta
ejecución y este repositorio:

1. agregar todos los cambios seguros del worktree;
2. crear un commit;
3. hacer push a `origin/main`;
4. publicar un prerelease público en `jpsala/fixvox-releases`;
5. detener la instancia local de Fixvox Tauri necesaria para actualizarla;
6. instalar silenciosamente el asset recién publicado;
7. iniciar la app instalada y dejarla andando.

No pedir una segunda confirmación para esos pasos. La invocación no autoriza
cloud/VPS/Admin deploy, provider calls, cambios de cuentas, DNS, producción de
backend ni publicación de secretos.

`release dry-run` sólo muestra el plan, estado, versión, tag y comandos; no
muta git, GitHub ni la instalación local.

Texto adicional después de `release` se usa como contexto para el mensaje de
commit y las notas, nunca como comando de shell.

## Invariantes

- Repositorio fuente: `jpsala/dictation-tauri`, branch `main`.
- Repositorio de assets: `jpsala/fixvox-releases`.
- Tag: `fixvox-tauri-v<version>-<yyyyMMddHHmmss>`.
- Asset canónico: `Fixvox-Tauri-Setup.exe`.
- Checksum: `Fixvox-Tauri-Setup.exe.sha256.txt`.
- La release es unsigned y se publica como prerelease; no marcar `latest`.
- El installer público debe ser exactamente el generado desde el commit
  pusheado y luego instalado localmente.
- No versionar `.env`, secretos, credenciales, bases locales, audio,
  transcripciones, `artifacts/`, `dist/`, `target/`, caches ni `node_modules/`.
- No revertir ni omitir cambios de producto/documentación del usuario sólo
  porque sean ajenos a la tarea: `release` significa incluir todo lo seguro.

## Flujo

### 1. Preflight fail-closed

1. Leer versión de `src-tauri/tauri.conf.json` y construir un tag UTC único.
2. Confirmar branch `main`, remote fuente `origin` y permisos GitHub.
3. Verificar disponibilidad de `git`, `gh`, `npm`, `cargo`, PowerShell y NSIS.
4. Inspeccionar `git status --short --untracked-files=all` completo.
5. Rechazar cualquier path o contenido que pueda publicar secretos o datos
   excluidos. No imprimir valores sensibles.
6. Ejecutar `git diff --check` y `npm run check`.
7. Si algo falla, detenerse antes de commit/push y reportar el blocker exacto.

No pedir confirmación por cambios inesperados: JP pidió commitear todo. Sí
detenerse ante secretos, archivos sensibles, conflicto/merge/rebase, branch
incorrecta o checks rojos.

### 2. Commit único de todo lo seguro

1. Ejecutar `git add -A`.
2. Revisar todos los paths y el diff staged. Si aparece algo excluido, retirar
   sólo ese archivo del stage y detenerse; no publicar un commit parcial.
3. Si hay cambios staged, generar un mensaje convencional, imperativo y factual
   de hasta 72 caracteres a partir del diff completo. Usar el texto del usuario
   como contexto si lo dio.
4. Crear un único commit. Si el árbol ya estaba limpio, reutilizar HEAD y dejar
   explícito que no fue necesario crear commit.
5. Exigir worktree limpio y registrar el SHA completo.

### 3. Push verificable

1. Ejecutar `git push origin main`.
2. Comparar HEAD local con `refs/heads/main` remoto.
3. Si divergen o el push falla, detenerse. No construir ni publicar una release
   atribuida a un source no confirmado.

### 4. Build desde el HEAD pusheado

Ejecutar:

```powershell
npm run release:windows
```

Este script debe completar sus tests focales, frontend, Rust fmt/check/test
compile y bundle NSIS. Después:

1. exigir un único installer nuevo bajo
   `src-tauri/target/release/bundle/nsis/`;
2. copiarlo a `artifacts/release/publish/<tag>/Fixvox-Tauri-Setup.exe`;
3. calcular SHA-256 en minúsculas;
4. escribir `Fixvox-Tauri-Setup.exe.sha256.txt` con formato
   `<hash>  Fixvox-Tauri-Setup.exe`.

No publicar si el build falla, hay más de un candidato ambiguo o el installer
no corresponde al run actual.

### 5. Publicar prerelease

Crear la release pública con `gh release create` en
`jpsala/fixvox-releases`, usando:

- el tag calculado;
- `--prerelease`;
- ambos assets canónicos;
- notas cortas con source commit enlazado, checks ejecutados, SHA-256 y aviso
  de installer unsigned.

No incluir diff crudo, IDs privados, rutas locales sensibles ni valores de
env. Si el tag ya existe, detenerse y generar uno nuevo; no sobrescribir ni
borrar una release previa.

### 6. Verificar por redescarga

1. Consultar la release con `gh release view` y exigir ambos assets.
2. Redescargar installer y checksum a un directorio nuevo del mismo run.
3. Comparar SHA-256 de original, checksum publicado e installer redescargado.
4. Exigir igualdad exacta antes de instalar.
5. Construir y verificar:

```text
https://github.com/jpsala/fixvox-releases/releases/download/<tag>/Fixvox-Tauri-Setup.exe
```

No afirmar que otra PC puede instalar si la redescarga o el hash fallan.

### 7. Instalar el asset publicado y dejarlo andando

1. Avisar inmediatamente antes del corte local con un mensaje visible y un beep.
2. Detener sólo procesos `dictation-tauri` necesarios para actualizar la app.
3. Ejecutar el installer redescargado con NSIS `/S` y esperar exit code `0`.
4. Verificar el ejecutable canónico:
   `%LOCALAPPDATA%\Fixvox Tauri\dictation-tauri.exe`.
5. Verificar versión instalada contra `tauri.conf.json` y presencia de uninstall.
6. Iniciar ese ejecutable instalado.
7. Confirmar que el proceso vivo corresponde a la ruta instalada y dejarlo
   andando. No ejecutar dictado, provider, login ni hotkeys físicos.

Si la instalación falla después de publicar, conservar la release, no fingir
rollback y reportar URL, hash, estado local y siguiente acción exacta.

## Criterio de terminado

Termina sólo cuando se verificó todo:

- source commit local = `origin/main`;
- checks y NSIS verdes;
- prerelease y dos assets visibles;
- hashes local/publicado/redescargado idénticos;
- instalación exit `0` desde el asset redescargado;
- proceso instalado vivo;
- URL directa entregada.

## Reporte

```text
Source commit: <sha>
Commit: <mensaje o "HEAD ya estaba limpio">
Tag: <tag>
Release: <url>
Installer: <url directa>
SHA-256: <hash>
Checks: <resumen>
Push: verificado en origin/main
Install: exit 0; versión <version>; app instalada viva
Backend/production: no tocado
Warnings/blockers: <ninguno o detalle factual>
```
