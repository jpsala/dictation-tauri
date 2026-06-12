---
id: fixvox-capability-map
status: active
kind: decision-map
triggers:
  - Fixvox
  - Fixbox
  - electro-bun
  - capacidades Fixvox
  - alcance producto
  - mapa de producto
  - que copiamos
  - que implementamos
primary_refs:
  - docs/topics/product-direction.md
  - docs/topics/dictation-workflow.md
  - docs/topics/selection-and-assistant-actions.md
  - docs/topics/backend-and-model-routing.md
  - docs/topics/automation-and-reference-fixtures.md
  - docs/tracks/mvp-and-reference-resources.md
---

# Mapa De Capacidades Fixvox

## Objetivo

Este topic lista que hace Fixvox hoy y lo usa como filtro de producto para Dictation Tauri.

La pregunta no es "como portamos Fixvox", sino:

- que capacidades valen para este producto;
- cuales entran en MVP;
- cuales quedan para mas adelante;
- si conviene implementarlas igual, distinto o no implementarlas;
- que recursos de Fixvox podemos reutilizar sin copiar arquitectura.

## Principio De Alcance

Antes de implementar features durables, definir alcance de producto.

Dictation Tauri debe nacer con un flujo chico, verificable y automatizable. Las capacidades de Fixvox son referencia, no backlog obligatorio.

## Estados De Decision

| Estado | Significado |
| --- | --- |
| `mvp` | Entra en el primer producto funcional. |
| `early` | Importante poco despues del MVP. |
| `research` | Requiere spike o comparacion antes de decidir. |
| `later` | Valioso pero no bloquea el inicio. |
| `parked` | No implementar por ahora. |
| `reject` | No queremos esta capacidad en este producto. |

En este mapa, `mvp` cubre el tramo MVP 0-3 definido en `docs/topics/product-direction.md`, no necesariamente el primer scaffold tecnico.

## Mapa Decidido

| Capacidad Fixvox | Que hace hoy | Valor para Dictation Tauri | Opciones de implementacion | Decision inicial |
| --- | --- | --- | --- | --- |
| Dictado sin seleccion | Audio -> STT -> postprocess opcional -> insert/copy. | Es el core del producto. | Pipeline por puertos/adapters; mock primero, directo local en MVP 2. | `mvp` |
| Postprocess de dictado | Limpia puntuacion, fillers, listas, terminos tecnicos y errores ASR. | Muy alto; mejora calidad percibida. | Medido en benchmark primero; runtime despues con niveles light/medium/strong. | `mvp` |
| Dictado con texto seleccionado | Voz como instruccion sobre seleccion. | Diferencia producto de simple STT. | Simular `selectedText` en tests; captura real despues. | `early` |
| Selection transform | Aplica instruccion hablada al texto seleccionado. | Alto para workflows de edicion. | Fixture/preset simple primero; prompt general despues. | `early` |
| Assistant Mode | Mantiene modo conversacional/asistente para prompts sucesivos. | Util, pero puede ampliar mucho alcance. | Toggle hotkey, wake-word, o Quick Chat manual. | `later` |
| Quick Chat | Superficie conversacional con texto seleccionado como contexto. | Util para razonamiento, no necesario para dictado base. | Ventana propia, modal, o abrir solo desde hotkey. | `later` |
| Picker `Alt+Q` | Abre acciones/presets sobre contexto actual. | Puede ser muy util, pero no es core de voz. | Picker simple de acciones, command palette, o postergar. | `later` |
| Presets | Acciones guardadas de transformacion/estilo. | Alto despues de tener selected-text transform. | JSON local, settings UI, o hardcoded primero. | `early` |
| Hotkeys de presets | Ejecutan acciones directas sin abrir UI. | Bueno para usuarios avanzados. | Tauri global-shortcut + registry local. | `later` |
| Push-to-talk / toggle | Mantener para dictado corto o tocar para iniciar/detener. | Core UX. | Un hotkey con modo dual o dos hotkeys. | `mvp` |
| Stop and submit | Cierra grabacion y entrega resultado. | Core si hay toggle/long dictation. | Misma tecla, Enter global o UI dock. | `mvp` |
| Toggle Enter despues de dictado | Agrega Enter automatico tras pegar. | Util para chats/prompts. | Setting local y hotkey. | `later` |
| Paste last result | Reinsertar ultimo output. | Util y barato si guardamos ultimo resultado efimero. | Memoria en proceso; persistencia opcional. | `early` |
| Result history | Historial de resultados recientes. | Util, pero sensible. | Sin historial, historial efimero, o storage local con retencion. | `research` |
| Delivery insert/replace/copy | Inserta en cursor, reemplaza seleccion o copia. | Core del producto. | Copy/insert best-effort primero; replace-selection cuando exista seleccion real. | `mvp` |
| Target capture | Detecta ventana/proceso/control activo y seleccion. | Necesario para delivery confiable. | Mock en tests y target activo basico primero; seleccion real despues. | `mvp` |
| Recovery UI | Cuando paste no es confiable, muestra opciones copy/paste-again/type. | Importante para no perder texto. | Empezar con copy fallback y logs. | `early` |
| Audio capture | Graba microfono real. | Core, pero despues de fixtures. | Rust/cpal, plugin, WebView MediaRecorder, o sidecar. | `mvp` |
| Audio sintetico/TTS | Genera WAV/MP3 desde frases para pruebas. | Clave para no depender de JP. | Script propio inspirado en Fixvox. | `mvp` |
| STT benchmark matrix | Corre escenarios STT/postprocess, mide calidad/costo/latencia. | Clave para elegir modelo. | Copia minima conceptual, no port literal. | `mvp` |
| Muestras humanas | WAVs reales con expected text. | Valiosas para regresion, pero sensibles. | Referenciar localmente, no copiar al repo. | `research` |
| Model routing | Elige proveedor/modelo por policy/contexto. | Util si no sobredisena el pipeline. | Interfaz propia `ModelGateway`; mock primero, directo local en MVP 2, proxied despues. | `mvp` |
| Proxy/backend-managed | Centraliza claves, costos, quotas y policy. | Muy valioso si el producto escala. | Adapter proxied compatible con endpoint existente. | `research` |
| Control plane/policy | Administra usuarios, quotas, defaults, capabilities. | No bloquea producto local. | No implementar al inicio. | `parked` |
| Wake words | Activacion por palabra tipo Lulu. | Atractivo, pero permiso microfono y ruido. | No activar por defecto. | `parked` |
| Voice commands / Smart Dictation | Interpreta comandos hablados complejos. | Potente, pero scope grande. | Fixtures primero, runtime despues. | `later` |
| App memory / smart memory | Memoria por app/global para comandos. | Interesante, no core. | Markdown/local store posterior. | `later` |
| Onboarding guiado | Primer uso, mic check, dictado, transform. | Importante para producto final. | Despues de flujo base estable. | `later` |
| Runtime inspector/log | Debug de ruta, provider, target, output. | Muy util para desarrollo. | Logs redacted en MVP; debug panel posterior. | `mvp` |
| Telemetry/cost | Mide latencia/costo/errores. | Importante para elegir modelos. | Local artifacts primero, proxy metrics despues. | `mvp` |

## Alcance MVP Cerrado

MVP 0-3:

1. App Tauri base verificable.
2. Pipeline simulado con estados, cancelacion, no-overlap, event ledger y delivery verificable.
3. Harness propio de audio sintetico y STT/postprocess benchmark.
4. `ModelGateway` hibrido: mock primero, adapter directo local en MVP 2.
5. Delivery basico `copy` e `insert` best-effort con fallback.
6. Push-to-talk/toggle y stop-submit para microfono real en MVP 3.
7. Logs redacted con latencia/costo/calidad.

No incluir todavia en MVP 0-3:

- Captura real de texto seleccionado.
- Quick Chat.
- Assistant Mode persistente.
- `Alt+Q`.
- Wake words.
- Control plane.
- Historial persistente.
- Muestras humanas copiadas al repo.

## Alcance Temprano Post-MVP

Primeras expansiones candidatas despues de MVP 3:

1. Captura real de texto seleccionado.
2. Selection transform con preset simple.
3. Paste last result en memoria de proceso.
4. Recovery UI.
5. Presets hardcoded o JSON local, sin settings complejos.

## Preguntas Cerradas En Este Pase

- El producto empieza como dictado rapido universal; asistente contextual queda por fases.
- El primer usuario objetivo es JP/dev power user.
- La entrega inicial es directa best-effort con copy fallback; preview no bloquea MVP.
- Texto seleccionado real entra despues de MVP 3, aunque se simula desde tests antes.
- `Alt+Q` queda para despues de validar dictado y seleccion real.
- El minimo aceptable de delivery es copy/insert best-effort con evidencia automatizada.
- `ModelGateway` sera hibrido: mock primero, adapter directo local en MVP 2, proxied despues si el contrato alcanza.

## Regla De Mantenimiento

Cuando una capacidad cambie de estado, registrar:

1. motivo;
2. dependencia tecnica;
3. riesgo de privacidad;
4. evidencia o spike que lo justifica;
5. destino: spec, decision o task.
