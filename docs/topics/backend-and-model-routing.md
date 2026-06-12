---
id: backend-and-model-routing
status: draft
kind: decision-map
triggers:
  - backend
  - proxy
  - model routing
  - proveedores
  - API keys
  - Groq
  - OpenAI
  - OpenRouter
  - xAI
primary_refs:
  - docs/DECISIONS.md
  - docs/topics/privacy-and-dictation-data.md
  - docs/topics/automation-and-reference-fixtures.md
  - docs/tracks/mvp-and-reference-resources.md
---

# Backend Y Model Routing

## Modelo Observado En Fixvox

Fixvox tiene dos caminos:

- Directo por API key local leida desde `.env`.
- Proxied/backend-managed para Groq cuando hay `PROXY_BASE_URL` y device/control-plane disponible.

El proxy existente expone endpoints compatibles con:

- `/v1/audio/transcriptions`
- `/v1/chat/completions`

Y reporta headers utiles como request id, costo y timings de proxy.

## Opciones Para Dictation Tauri

### Opcion A - Directo Local Primero

La app lee claves locales y llama proveedores desde Tauri/Rust o sidecar JS propio.

Pros:

- Menos acoplamiento a Fixvox.
- Mas simple para scaffold y benchmarks locales.
- No requiere control plane ni device registration.

Contras:

- Claves viven en la maquina local.
- Menos control centralizado de costos/policy.
- Hay que replicar parte de routing y telemetry.

### Opcion B - Reusar Proxy Existente

La app usa `PROXY_BASE_URL`/backend compatible para STT/LLM cuando este disponible.

Pros:

- Centraliza claves, costos, policy y metricas.
- Reusa infraestructura ya probada.
- Mejor camino si se busca producto multiusuario despues.

Contras:

- Acopla el proyecto nuevo a contrato Fixvox/proxy.
- Hoy el managed proxy observado soporta principalmente Groq para speech/LLM.
- Requiere decidir device id/control-plane o un modo local simplificado.

### Opcion C - Adaptador Hibrido

Crear una interfaz propia `ModelGateway` con implementaciones directas y proxied.

Pros:

- Permite empezar directo y migrar a proxy sin reescribir pipeline.
- Hace testeable el pipeline con fixtures.
- Mantiene frontera clara entre producto y proveedor.

Contras:

- Un poco mas de diseño inicial.
- Requiere documentar bien la prioridad de resolucion.

## Recomendacion Inicial

Usar Opcion C: una interfaz propia y un primer adapter directo para fixtures/benchmarks. Mantener adapter proxied como siguiente paso, usando el proxy existente si el contrato alcanza.

## Decision Cerrada

Dictation Tauri usara un `ModelGateway` propio e hibrido.

Orden inicial:

1. Adapter mock para MVP 1 y tests de pipeline, conectado por puerto y no por acceso directo a fixtures desde todo el runtime.
2. Adapter directo local para MVP 2, leyendo variables de entorno locales o `.env` propio ignorado desde una frontera host/script, no desde UI React. Plan vigente: `specs/003-synthetic-audio-stt/`.
3. Adapter proxied como research/early despues de validar el contrato compatible.

Contrato minimo:

```ts
type ModelGateway = {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
  postProcess(input: PostProcessInput): Promise<PostProcessResult>;
};
```

Campos minimos de resultado:

- texto o error redacted, nunca ambos como exito;
- proveedor y modelo cuando exista llamada real;
- latencia total y timings parciales cuando esten disponibles;
- costo estimado y fuente de pricing cuando aplique;
- request id/provider id/backend id cuando exista;
- metadata de audio o fixture necesaria para benchmark, sin secretos.

Reglas:

- En modo personal/dev, se pueden leer `.env`/variables locales disponibles, incluso de Fixvox, si acelera benchmarks o diagnostico.
- No imprimir secretos completos en respuestas ni commitear `.env`/tokens salvo pedido explicito y acotado de JP.
- No hardcodear un proveedor unico como fuente de verdad de producto.
- El proxy existente es referencia y candidato a adapter, no dependencia del MVP 0-3.
- El contrato del gateway debe reportar texto, proveedor/modelo, latencia, costo estimado cuando exista y errores redacted.
- El frontend no recibe API keys ni secretos; si una corrida real necesita secretos, los resuelve un script local o Tauri/Rust.
- El pipeline no debe saber si el transporte es directo, proxied o fixture-backed; eso pertenece al adapter.
- Los adapters reales deben emitir eventos/telemetry compatibles con el run ledger del pipeline.

## Pendiente

- Definir provider/model inicial para STT sintetico.
- Definir provider/model inicial para postprocess si entra en MVP 2.
- Definir si MVP 2 usa primero script Node/TS de benchmark, Tauri/Rust o ambos. Criterio actual: benchmark local puede empezar en TS/Node; runtime de producto con secretos y side effects debe cruzar por frontera Tauri/host.
