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

## Actualizacion 2026-07-13

La policy efectiva local `pro` esta fresca y habilita `sttPromptEnabled` + `postProcessEnabled`; auth permite `dictation`, `managed_stt`, `postprocess`, `selection_transform` y `managed_llm`.

Semantica decidida e implementada en el slice local:

- Sin preset y sin seleccion: STT managed y luego postprocess solo si la policy lo habilita.
- Con preset persistente y sin seleccion: STT y una sola transformacion del preset; el request de STT deshabilita postprocess base.
- Con seleccion: STT produce la instruccion y una sola selection transform actua sobre la seleccion; un preset activo agrega body/constraints sin postprocess previo.
- STT queda ligado por Cloud al engine de transcripcion del profile.
- Postprocess envia `X-Fixvox-Engine-Kind: postprocess`; selection/preset envia `selectionTransform`. Cloud resuelve provider/model/prompt por profile.
- El Worker aplica un safety baseline inmutable para postprocess y luego agrega el prompt administrable; un system prompt del caller no puede reemplazar ese baseline.
- Provider/model guardados por preset no gobiernan runtime. Settings normal dejara de presentarlos como controles efectivos; un override futuro requiere capability y enforcement Worker explicitos.

Checks provider-free del slice: app delivery/routing, contrato Rust managed chat, `npm run cloud:test` (97 pass) y `cargo check` con target aislado por lock transitorio.

## Actualizacion 2026-06-20

Despues de estudiar `C:\dev\fixvox`, el norte cambia: Dictation Tauri debe poder usar la misma infraestructura cloud managed de Fixvox, pero reimplementando el runtime desktop en Rust/Tauri.

La ruta principal deseada pasa a ser:

```text
Dictation Tauri -> Rust/Tauri host -> Fixvox Worker -> Groq
```

El adapter Groq directo local que ya existe queda como BYOK/dev fallback explicito, no como default silencioso de producto. Ver `docs/topics/fixvox-cloud-runtime-port.md` y `specs/009-fixvox-cloud-runtime-port/plan.md`.

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

## Recomendacion Actual

Usar Opcion C, pero promoviendo el adapter proxied/managed de Fixvox a camino principal post-008.

Dictation Tauri mantiene un `ModelGateway`/host boundary propio, pero el runtime real recomendado debe resolver primero la ruta managed cloud cuando exista backend/device valido. El adapter directo local queda para BYOK/dev y para aislar fallas durante desarrollo.

Correccion 2026-06-29: el problema pendiente ya no es solo elegir managed vs directo. Hay que resolver el **plan efectivo** igual que Fixvox: provider/model/prompt de STT, language, request fields y postprocess enabled/provider/model/prompt deben salir de policy/cache/control-plane, no de React ni de defaults Rust. En la policy auditada ese dia JP usaba `whisper-large-v3-turbo` y postprocess off; la policy efectiva cambio y queda registrada en la actualizacion 2026-07-13.

## Decision Cerrada

Dictation Tauri usara un `ModelGateway` propio e hibrido.

Orden actualizado:

1. Adapter mock para tests de pipeline y provider-free smoke.
2. Adapter directo local Groq ya implementado como BYOK/dev fallback explicito desde Rust/Tauri, nunca desde React.
3. Adapter managed cloud Fixvox como camino principal: device registration, preflight, `X-Device-Id`, `/v1/audio/transcriptions`, headers `X-Fixvox-*` y fail-closed si no hay lane managed.
4. Postprocess managed via `/v1/chat/completions` solo cuando la policy efectiva lo habilite; no como default hardcodeado.
5. `DictationRuntimePlan` host-owned como contrato previo a llamar proveedores: mismo plan que Fixvox para STT/postprocess y evidencia redacted de diferencias.

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

- Gatear la apertura del picker antes de mostrarlo cuando falta `selection_transform`; el runtime managed ya falla cerrado.
- Hacer smoke visual/local de la sección Admin sin login y asignar power-admin a JP solo con aprobación de mutation real.
- No implementar override provider/model por preset sin capability y enforcement Worker explícitos.
- Mantener BYOK como fallback explicito, nunca automatico.
