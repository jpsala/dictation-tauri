---
id: product-direction
status: active
kind: decision-map
triggers:
  - producto
  - MVP
  - alcance
  - direccion
  - no human interaction
  - automatizacion
primary_refs:
  - docs/PROJECT.md
  - docs/DECISIONS.md
  - specs/001-port-foundation/spec.md
  - docs/tracks/mvp-and-reference-resources.md
---

# Direccion De Producto

## Norte

Dictation Tauri debe ser una app desktop de dictado rapida, confiable y operativa.

La direccion inicial es reducir interaccion humana en etapas tempranas: antes de pedirle a JP pruebas manuales repetidas, el proyecto debe poder validar flujos con fixtures, audio sintetico, motores STT/postprocess y checks automatizados.

El producto principal empieza como dictado rapido universal. La escritura contextual sobre texto seleccionado y las superficies asistidas son rutas de expansion, no requisitos del primer flujo real.

Usuario objetivo inicial: JP/dev power user. Usuario objetivo posterior: usuarios finales que necesitan dictar e insertar texto desde el escritorio con minima friccion.

## MVP Por Fases

### MVP 0 - App Base Verificable

- React/Vite/Tauri funcionando.
- Scripts oficiales de dev/build/check.
- Ventana base y estado operacional.
- Capabilities minimas.
- Sin audio real.

Cierre:

- `npm run build` o el check equivalente de la app base pasa.
- La app Tauri abre una ventana verificable.
- `docs/DEVELOPMENT.md` documenta comandos reales.
- `bun scripts/agent-context-audit.ts` pasa.
- No se fija persistencia de producto todavia; en modo personal/dev se permite persistencia experimental local.

### MVP 1 - Pipeline Simulado Automatizable

- Estados `idle`, `listening`, `transcribing`, `delivering`, `done`, `error`.
- Entrada simulada o fixture de audio.
- Puertos mockeables para transcripcion, materializacion/postprocess y delivery, aunque sean fixture-backed.
- `PipelineService` o equivalente como dueño de ejecucion activa, cancelacion y no-overlap.
- Ledger de eventos tipados; el run summary se deriva de esos eventos.
- Entrega de texto sintetico por copy/insert simulado o controlado.
- Tests sin requerir que JP hable.
- Texto seleccionado solo como fixture simulado, no captura real.

Cierre:

- El pipeline completo corre desde un test o runner sin microfono.
- Los estados quedan observables desde UI o logs de desarrollo.
- Hay prueba automatizada de al menos un caso exitoso y un caso de error/recovery.
- Hay prueba automatizada de cancelacion terminal y prevencion de corridas superpuestas.
- Los eventos de run permiten reconstruir state order, output, delivery, error redacted y duracion.
- Delivery queda cubierto con copy fallback o mock verificable.

### MVP 2 - Audio Sintetico + STT Real

- Generar o consumir fixtures TTS y tambien usar audio local real si acelera el desarrollo.
- Correr STT con proveedores disponibles por `.env` propio ignorado o variables de entorno locales.
- Medir postprocess opcional como parte del benchmark, sin forzarlo en runtime.
- Medir latencia, costo y calidad contra texto esperado.
- Usar artifacts locales libremente en desarrollo; decidir despues que se versiona, ignora o limpia.
- `ModelGateway` hibrido definido, con adapter directo local como primer adapter real.
- Proxy existente solo como referencia o spike posterior, no dependencia de cierre.
- Mantener secretos y llamadas reales fuera del frontend; usar script/harness local o frontera Tauri segun la fase.

Cierre:

- Existe manifest propio de fixtures controlados.
- Una corrida STT real reporta proveedor/modelo, latencia, costo estimado y comparacion expected/transcript/output.
- Los artifacts generados tienen destino claro: versionado, gitignored, app data o temporal.
- El adapter directo real cumple el mismo contrato que el adapter mock de MVP 1.
- Se pueden leer `.env`/variables locales cuando una tarea lo requiera; no imprimir secretos completos en respuestas.

### MVP 3 - Captura De Microfono

- Captura local real queda como verificacion manual/opcional aprobada por JP.
- Permisos de microfono quedan modelados por adapter WebView y estados de setup; no se pidio permiso real en cierre CI-safe.
- Start/stop robusto cubierto por fake gateway y tests de adapter.
- Persistencia de producto aun no definida; persistencia experimental local permitida en dev.
- Stop-submit funciona sobre captured-audio fake/testable y pipeline real de la app.
- Delivery directo best-effort se modela como evidencia honesta con transcript available/copy fallback; preview no bloquea el MVP.
- Side effects desktop viven en Rust/Tauri o frontera host explicita: permisos, microfono, hotkeys, tray, foco y clipboard.
- Capabilities de Tauri se agregan solo por necesidad de feature y ventana.
- Captura real de texto seleccionado queda fuera de este MVP.

Cierre:

- Cierre CI-safe: US1-US3 de `specs/004-real-microphone-capture/tasks.md` pasan sin audio real ni provider real.
- Cierre manual opcional: JP puede dictar una frase real y obtener texto insertado o copiado sin perdida silenciosa, solo si aprueba grabar audio local.
- La app muestra estado claro para listening/transcribing/processing/delivering/completed/failed/cancelled.
- La app no expone secretos al frontend ni reclama paste observado sin evidencia.
- Audio real, transcript real y logs pueden existir localmente en dev; antes de producto estable, documentar ruta/formato/ciclo de vida.

## No-Goals Iniciales

- No portar Fixvox literalmente.
- No copiar arquitectura Electrobun/Bun.
- No requerir pruebas manuales de voz antes de tener fixtures automaticos.
- No convertir audio/transcripciones reales en contrato de producto sin decision documentada.
- No crear historial de dictados en el primer corte tecnico.
- No incluir Quick Chat, Assistant Mode persistente, `Alt+Q` ni captura real de seleccion en MVP 0-3.

## Referencia Principal

Fixvox (`C:\dev\electro-bun-1`) se usa como referencia de recursos y aprendizajes:

- TTS sintetico.
- Matrices STT/postprocess.
- Prompts de dictado tecnico bilingue.
- Manifests de audio.
- Modelos de fases de ejecucion.

El stack de implementacion sigue siendo propio de Dictation Tauri.

## Decisiones De Alcance Cerradas

- `ModelGateway`: interfaz propia hibrida; mock primero, adapter directo local en MVP 2, adapter proxied despues si el contrato existente alcanza.
- Seleccion real: no entra en MVP 0-3; si entra temprano, primero como fixtures y luego como feature post-MVP.
- Delivery inicial: copy/insert best-effort con fallback; preview/recovery UI son mejoras tempranas, no bloqueo de MVP.
- Runtime: pipeline por puertos/adapters, event ledger y `PipelineService` antes de side effects reales.
- UI durable: crear `PRODUCT.md` y seedear `DESIGN.md` despues de cerrar este alcance y antes de construir la primera superficie React/Tauri durable.
