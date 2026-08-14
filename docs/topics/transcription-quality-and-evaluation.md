---
id: transcription-quality-and-evaluation
status: active
kind: decision-map
triggers:
  - calidad de transcripcion
  - mejorar transcripcion
  - evaluar STT
  - modelos de voz
  - prompts STT
  - postprocess de dictado
  - benchmark de transcripcion
  - corpus de audio
  - Fixvox transcription
  - WER
  - latencia de dictado
primary_refs:
  - docs/tracks/transcription-quality-program.md
  - docs/reference/transcription-quality-fixvox-inventory.md
  - docs/topics/automation-and-reference-fixtures.md
  - docs/topics/privacy-and-dictation-data.md
  - docs/topics/backend-and-model-routing.md
  - docs/topics/dictation-workflow.md
  - docs/topics/source-project-map.md
  - docs/tracks/archive/fixvox-effective-runtime-parity.md
  - specs/018-fixvox-audio-runtime-parity/
---

# Calidad Y Evaluacion De Transcripcion

## Objetivo

Convertir la calidad de transcripcion en una disciplina medible y acumulativa.
Dictation Tauri debe poder conocer, comparar y elegir conscientemente cada etapa
del proceso de voz, incluso cuando la mejor ruta sea mas cara o mas lenta.

Este topic conserva conocimiento durable. El trabajo vivo, las prioridades y el
proximo corte estan en `docs/tracks/transcription-quality-program.md`.

## Norte

La meta no es copiar Fixvox de forma ciega ni optimizar una sola metrica. La
meta es producir el texto mas fiel, util y seguro para el dictado real de JP,
con rutas explicitas para distintos compromisos de calidad, costo y latencia.

Principios:

1. Calidad manda sobre costo y latencia durante investigacion.
2. Costo y latencia siempre se registran, aunque no bloqueen un candidato.
3. El mismo audio se reutiliza para comparar candidatos.
4. STT crudo y salida final se evaluan por separado.
5. Un cambio debe declarar que componente intenta mejorar.
6. No se promueve un cambio usando solo audio TTS.
7. No se promueve postprocess sin medir drift semantico.
8. Resultados negativos y regresiones tambien son conocimiento.
9. La ruta productiva efectiva debe probarse; un adapter paralelo no cuenta.
10. Policy, modelo, prompt y postprocess observados deben coincidir con lo que
    realmente ejecuto el provider.

## Autoridades Y Fronteras

- Este topic: metodologia, taxonomia, decisiones y aprendizajes consolidados.
- `docs/tracks/transcription-quality-program.md`: ejecucion activa y prioridades.
- `automation-and-reference-fixtures.md`: fixtures, artifacts y automatizacion
  provider-free.
- `privacy-and-dictation-data.md`: lectura, persistencia y exposicion de audio,
  transcripciones y secretos.
- `backend-and-model-routing.md`: providers, modelos y control plane.
- `dictation-workflow.md`: estados del flujo interactivo.
- `source-project-map.md`: que se adopta o adapta desde Fixvox.
- Specs: contratos cerrados de una implementacion concreta.
- Artifacts locales: evidencia por corrida; no son decision durable por si solos.

## Modelo Del Proceso

Evaluar cada etapa de forma independiente y tambien end-to-end:

1. Captura: dispositivo, sample rate, canales, bit depth, amplitud y duracion.
2. Audio prep: VAD, trim, normalizacion, denoise, conversion y compresion.
3. STT request: provider, modelo, idioma, prompt, temperature, formato y
   timestamps.
4. STT parsing: texto crudo, segments, words, probabilidades y deteccion de
   no-speech.
5. Materializacion previa: stop phrase y filtros ASR conservadores.
6. Postprocess: provider/modelo, prompt, prosodia, nivel de cleanup y timeout.
7. Sanitizer/fallback: rechazo de explicaciones, drift, salida vacia o sospechosa.
8. Vocabulario/lexicon: contexto previo al decoder y correcciones posteriores.
9. Salida final: texto paste-ready anterior a delivery.
10. Operacion: latencia por etapa, costo, errores, fallbacks y estabilidad.

Cambiar varias etapas juntas impide atribuir mejoras. Los experimentos deben
congelar las entradas entre etapas cuando sea posible.

## Baseline Fixvox Recuperado

Fuente local canonica: `C:/dev/fixvox`.

El dictado normal de Fixvox aportaba estos mecanismos relevantes:

- Captura PCM WAV mono 16 kHz/16-bit.
- Auto-stop por amplitud y VAD local con frames de 50 ms, minimo 150 ms de voz,
  RMS `0.002` y peak `0.006`.
- Compresion opcional a MP3 mono 16 kHz/48 kbps para audio grande, con fallback
  al WAV original.
- STT managed normalmente en Groq `whisper-large-v3-turbo`.
- Prompt STT rioplatense/tecnico para comandos, paquetes, modelos, archivos,
  URLs, emails, numeros, guiones, puntos, mayusculas y puntuacion hablada.
- `language=auto` como default managed; variantes con `es` fueron benchmarkeadas.
- `response_format=verbose_json`, word+segment timestamps y `temperature=0`.
- Segundo gate no-speech con `no_speech_prob` y `avg_logprob`.
- Prosodia derivada de pausas en word timestamps como hint, no regla dura.
- Filtro conservador de alucinaciones completas o trailing conocidas.
- Postprocess opcional; el target resuelto actual es Groq
  `openai/gpt-oss-120b`, pero la corrida local inventariada usó
  `pro-stt-only` y no lo ejecutó. Benchmarks históricos evaluaron éste y otros
  targets con resultados point-in-time.
- Sanitizer con fallback al transcript crudo.
- Lexicon global aplicado antes de delivery.
- Benchmarks con matrices sinteticas y corpus humano con gold text.
- Inventario verificable por símbolo/artifact:
  `docs/reference/transcription-quality-fixvox-inventory.md`.

Limitaciones conocidas de Fixvox:

- No habia denoise, AGC, trim ni retry/fallback STT general.
- MP3 era una optimizacion de transferencia, no una mejora demostrada de calidad.
- El postprocess no validaba formalmente equivalencia semantica.
- Parte de la documentacion quedo stale frente al modelo efectivo.
- Algunos prompts y diccionarios estaban adaptados a fixtures concretos.
- El lexicon usa reemplazo substring ordenado y puede encadenar reglas; no tiene
  word-boundary ni longest-match.
- `viaPostProcess` puede mezclar cambios de postprocess, lexicon o preset; la
  evidencia nueva debe atribuir cada etapa por separado.

## Diagnostico Inicial De Dictation Tauri

Hallazgos del estudio de 2026-08-12, anteriores a cualquier reparacion:

1. **Postprocess no ejecutado en el runtime local.** El estado persistido usa el
   contrato `product-v1`, perfil `pro` y capability/action postprocess habilitada,
   pero el resolver Rust busca campos legacy top-level. Reportes locales
   recientes muestran `enabled=false`, `ran=false`, `source=disabled`.
2. **Prompt STT efectivo potencialmente mas pobre.** La frontera product-v1
   envia `metadata + audio`; el servidor elige engine/prompt. El builtin
   `transcriptBase` es mas corto que el prompt tecnico de Fixvox. El fallback
   rico del provider no corre si existe un prompt no vacio.
3. **Metadata verbose descartada.** La API product-v1 reduce la respuesta a
   texto y no conserva words/segments, por lo que se pierden prosodia y los
   gates probabilisticos post-STT del cliente.
4. **Filtro de alucinaciones menos completo.** VAD local existe, pero faltan
   defensas de materializacion equivalentes cuando no llega metadata provider.
5. **Vocabulario no equivale aun al lexicon anterior.** El vocabulario personal
   actual es una base mejor, pero actua despues del STT, no ayuda al decoder y
   no habia cache local de reglas en la inspeccion inicial.

Contraevidencia y limites:

- Capability postprocess no necesariamente significa preferencia para correrlo.
  La policy debe proyectar una decision explicita; no se debe activarlo a ciegas.
- Ambos runtimes managed tienden a `whisper-large-v3-turbo`; el modelo por si
  solo no explica la regresion percibida.
- Ambos usan VAD y MP3 48 kbps; audio prep tampoco es la primera hipotesis.
- Sin un A/B sobre el mismo audio no se puede atribuir causalidad definitiva.

## Capas De Evidencia

### Estados De Identidad

Toda identidad de policy/provider/model/prompt/language/config conserva tres
capas:

- `configured`: intención declarada por manifest, policy, matrix o setting;
- `resolved`: recipe efectiva congelada antes de ejecutar;
- `observed`: receipt/provider response/host report que prueba lo ejecutado.

Ausencia de `observed` se registra como `not-observed`; no se completa con un
default, doc o test. Prompt observado requiere ID/version/hash/length cuando el
upstream permita probarlo; una longitud sola es evidencia incompleta.

### Corpus Sintetico Versionado

Sirve para regresiones deterministas y CI-safe:

- comandos, filenames, paths y URLs ficticias;
- modelos, paquetes, numeros y versiones;
- español rioplatense y mezcla español/ingles;
- puntuacion hablada, listas y autocorrecciones;
- silencios, frases cortas, repeticiones e instruction-in-transcript.

Versionar manifest y gold text no sensible. Mantener audio generado, payloads y
resultados bajo artifacts ignorados.

### Corpus Humano Estable

Es la evidencia principal de calidad real:

- conjunto pequeño de audios de JP grabados una sola vez;
- gold text revisado manualmente;
- categorias y dificultad anotadas;
- reutilizacion exacta para todos los candidatos;
- audio local si no se decide versionarlo.

Las muestras humanas usan `goldStatus`: `approved`, `provisional` o
`shadow-only`. Sólo `approved` se puntúa contra gold. Una salida histórica o un
gold aproximado no se promueve implícitamente. Las muestras de Fixvox se
inventarían y clasifican antes de importar; una muestra adaptada a un fixture
viejo no representa automáticamente el uso actual.

Contrato durable desde Batch 1B:

- sintético y humano comparten `TranscriptionQualityCorpusManifest` y
  `SyntheticAudioFixture`; no existe un manifest humano paralelo;
- `expectedText` permanece obligatorio para `generated-tts` y está prohibido
  para `local-sensitive`; el humano usa refs locales y `audioBytes`;
- el manifest humano efectivo y sus refs viven sólo en
  `artifacts/transcription-quality/corpus/`, gitignored;
- la proyección safe se deriva del manifest validado y publica ID, hash, bytes,
  formato, categorías, dificultad, idioma, `goldStatus`, sensibilidad y status
  de existencia/hash/bytes; nunca refs, audio ni texto;
- tres samples estructurados (`bilingual-technical`, `punctuation-list-spacing`
  y `punctuation-list-model`) son `hard`; `recent-01` es `baseline` y el short
  `recent-06` es `edge`;
- scoring contra gold debe atravesar un gate explícito que sólo admite
  `approved`.

Decisión durable de Batch 1C:

- un WAV humano con señal demasiado baja o gold ambiguo no se fuerza a
  `approved`; permanece como evidencia `shadow-only`;
- reemplazar una muestra significa crear otro ID y conservar el original, no
  sobrescribirlo;
- los tres reemplazos controlados de 2026-08-12 fueron reproducidos y aprobados
  explícitamente por JP: bilingüe técnico, lista/puntuación y comparación de
  modelos;
- audio, gold y output STT observado se conservan como artifacts privados
  separados; la proyección pública contiene sólo metadata segura;
- el corpus humano efectivo tiene tres `approved` y cinco `shadow-only`, sin
  estados provisionales;
- el micrófono nuevo produjo señal suficiente; los errores observados en
  nombres técnicos permanecen como evidencia del STT, no se copian al gold.

Decisión durable de Batch 3A:

- evaluación P1 usa cuatro IDs allowlisted server-owned para prompt corto/rico
  por idioma `auto`/`es`; desktop y host no envían prompt ni modelo;
- product-v1 conserva `words`/`segments` bounded en un envelope privado sólo
  cuando resolvió una recipe de evaluación allowlisted; receipts/summaries
  públicos nunca contienen texto humano, words ni segments;
- cada `privateRef` publicada por el runner resuelve al payload real persistido
  bajo el root privado del run;
- `no_speech_prob` top-level prevalece; sin él se conserva el máximo
  segmentario. `avg_logprob` top-level prevalece; sin él se conserva el mínimo
  segmentario. Ambos fallbacks son deliberadamente conservadores;
- evidencia de identidad separa `configured` (pedido del runner), `resolved`
  (recipe server-owned resuelta) y `observed` (sólo body/headers). Un prompt ID
  no es un hash de cuerpo y nunca completa `sttPromptSha256`;
- materialización registra decisión y razones cerradas; prosodia permanece
  advisory y los summaries públicos nunca contienen texto humano;
- regression/drift, shadow local opt-in y retención dry-run reutilizan
  artifacts/refs canónicos y no abren perfiles productivos;
- Wave 1 quedó cerrada provider-free con tres samples `approved` × cuatro
  recipes, gate exacto de 12 requests/`USD 0.005`, audio prep único,
  secuencialidad, stop-on-first-error y cero requests sin autorización;
- Gate A cerró 12 llamadas y mantuvo `short-auto`; Gate B quedó cerrado
  provider-free con tres raws × dos recipes GPT-OSS 120B, prosodia advisory,
  máximo 512 completion tokens, gate exacto de 6 requests/`USD 0.005`,
  artifacts privados y cero requests sin autorización;
- las recipes Gate B fueron desplegadas en `a909ece64107d62d` y la autorización
  posterior cerró exactamente seis llamadas provider-real;
- `instructionFollowing` es higher-is-better, pero su proxy actual no mide el
  caso observado de obedecer una petición dictada;
- Gate B provider-real cerró `6/6`: plain mejoró WER/CER agregados pero omitió
  contenido requerido; prosodia degradó ambos y obedeció una petición dictada.
  No se promueve postprocess. El falso positivo del scorer basado en longitud
  motivó la reparación provider-free de Batch 3C antes de cualquier repetición.

Decisión durable de Batch 3C:

- semantic safety de postprocess tiene una única autoridad pura compartida en
  `cloud/fixvox-core`; API y evaluación consumen la misma decisión;
- la aceptación compara raw/candidate con alineación token a token. Los conteos
  de omissions/additions son operaciones reales, no diferencia neta de largo;
- se toleran sólo cambios conservadores de superficie y correcciones técnicas
  mínimas. Omisión material, spans novedosos o transformación incompatible
  hacen fallback al raw; incertidumbre también favorece el raw;
- el receipt público queda cerrado y redacted, sin transcript ni fragmentos.
  Gate B conserva `instructionFollowing` como higher-is-better, pero todo
  fallback lo fija en `0`;
- el corpus histórico confirma el corte: cuatro salidas seguras aceptadas y
  ambas salidas peligrosas del sample de modelos rechazadas localmente sin red.
  Esto repara la defensa y el scorer; no promueve el postprocess evaluado.

- Batch 3D publicó esa única defensa en el release `9279c043233eada6`, con
  rollback `a909ece64107d62d`; health/readiness quedaron verdes. No hubo
  provider calls, migraciones ni cambios de prompt/modelo/policy.

Decisión durable de Batch 3E:

- la prioridad siguiente se apoya en uso cotidiano real, no sólo en fixtures
  técnicos: discovery local provider-free, dedupe por hash y selección
  determinista multi-etiqueta;
- la corrida `everyday-prototype-39a746e23c60` encontró `6.546` pares en
  Dictation Tauri, Fixvox y Wispr, `5.682` usables y seleccionó `18`: `6` con
  audio+raw+final y `12` con raw+final;
- los finales históricos permanecen `historical-final-unadjudicated`. Batch 3C
  sólo decide preservación/fallback raw: `14` accepted y `4` fallback en el
  corpus seleccionado; no mide calidad contra referencia humana;
- evidencia pública queda redacted; contenido y audio viven sólo bajo refs
  privadas ignoradas. La cola privada máxima de `12` casos ya está lista para
  adjudicación humana;
- próximo corte mínimo: adjudicar esa cola por ID antes de otra comparación de
  modelo, prompt o postprocess.

Decisión durable de Batch 2A:

- la primera baseline product-v1 usa tres samples humanos `approved`, STT raw
  con idioma `auto` y postprocess `off`;
- el resultado fue macro WER `0.2661`, macro CER `0.1781`, latencia media STT
  `2376.6 ms` y costo total estimado `USD 0.000963`;
- el raw preservó la mezcla español/inglés, pero degradó comandos, filenames,
  nombres de producto, casing y modelos; las palabras habladas de
  puntuación/lista quedaron literales;
- un baseline no es trazable si provider/modelo/prompt faltan: deben quedar
  `not-observed`, nunca completarse desde defaults o docs;
- Phase 2 sigue abierta hasta persistir identidad efectiva disponible y probar
  paridad con Tauri real. No se promueve prompt, idioma, postprocess ni runtime
  desde este corte.

Decisión durable de Batch 2B:

- el runner product-v1 conserva sólo headers allowlisted de identidad/costo/
  timings y no convierte ausencia o placeholders en evidencia;
- un smoke Tauri real aprobado sobre el sample bilingüe produjo exactamente el
  mismo texto que la baseline product-v1, con WER `0.2000` y CER `0.0702`;
- igualdad de texto no implica igualdad de candidate: el runner envió WAV sin
  cambios por product-v1, mientras Tauri comprimió a MP3 y la configuración
  preferred resolvió el endpoint legacy `/v1/audio/transcriptions`;
- postprocess estuvo `off` en ambos y el smoke no tuvo delivery, clipboard ni
  typing;
- Phase 2 permanece abierta. La ruta canónica debe ser product-v1 y el runner
  debe representar el audio prep real antes de evaluar prompts.

Decisión durable de Batch 2C:

- STT managed en Tauri usa siempre `/product/v1/runtime/transcriptions`; el
  cliente ya no selecciona provider/modelo/prompt ni envía multipart legacy;
- el contrato cliente queda en `X-Device-Id` + `metadata` + `audio`, sin bearer
  de vendor;
- el runner product-v1 replica VAD, normalización low-level, umbral de
  optimización y ffmpeg MP3 del host antes de ejecutar candidates;
- un smoke provider-free sobre el sample bilingüe reprodujo el upload observado
  por Tauri: `5,328,044` bytes WAV y `27,750 ms` → `167,228` bytes MP3;
- Phase 2 permanece abierta hasta confirmar el cutover con un request Tauri
  real nuevo y receipt allowlisted. No se abre A/B de prompts desde evidencia
  sólo local.

Decisión durable de Batch 2D:

- un smoke Tauri real nuevo sobre el sample bilingüe ejecutó exactamente un
  request managed y cerró la paridad product-v1;
- Tauri y runner comparten `/product/v1/runtime/transcriptions`,
  `metadata` + `audio`, `X-Device-Id`, idioma `auto` omitido y la misma recipe:
  WAV `5,328,044` bytes y `27,750 ms` → MP3 `167,228` bytes;
- postprocess permaneció `off`; raw y final fueron idénticos entre sí y a la
  baseline (`WER 0.2000`, `CER 0.0702`);
- el receipt expuso sólo un request ID redacted dentro de la allowlist. La
  ausencia de provider/modelo/prompt observado no se completó con defaults;
- Windows PowerShell debe decodificar stdout nativo del bridge CDP como UTF-8;
  de otro modo, longitud y SHA-256 divergen para transcripts con caracteres no
  ASCII aunque el artifact host-owned sea correcto;
- Batch 2D y Phase 2 están cerrados. Phase 3 puede abrir A/B sólo bajo una nueva
  autorización provider-real explícita.

### Shadow Evaluation Local

Un modo explicito de evaluacion puede conservar audio, STT crudo y salida final
localmente para volver a ejecutar candidatos fuera del hot path. No debe llamar
multiples modelos durante dictado normal sin decision explicita. Los errores
reales valiosos se promueven de forma deliberada al corpus estable.

### Prueba Interactiva

Despues del benchmark se valida:

- latencia percibida;
- estabilidad y fallbacks;
- si el texto final suena a JP;
- si corrige o destruye terminos;
- puntuacion por pausas;
- necesidad real de revision antes de pegar.

## Metricas

No usar una sola puntuacion agregada.

### Fidelidad Literal

- WER y CER normalizados;
- omisiones, agregados y sustituciones;
- preservacion de idioma y wording.

### Entidades Tecnicas

Exact match o score dedicado para:

- comandos, filenames y paths;
- URLs y emails ficticios;
- modelos, versiones e identificadores;
- nombres de producto, acronimos y numeros.

### Estructura

- puntuacion y signos de pregunta;
- listas y parrafos;
- puntuacion hablada;
- autocorrecciones;
- mezcla de idiomas.

### Seguridad Semantica

- no responder al transcript;
- no inventar ni resumir;
- no traducir sin pedido;
- no cambiar intencion;
- no eliminar informacion valida.

### Robustez

- silencio, voz baja, ruido y pausas;
- audio corto y largo;
- terminos fuera de vocabulario;
- alucinaciones y repeticion.

### Operacion

- latencia STT, postprocess y total;
- costo real o estimado;
- bytes y formato de upload;
- error rate, timeout y fallback;
- estabilidad entre repeticiones.

## Contrato De Una Corrida

Cada resultado comparable debe registrar como minimo:

- `schemaVersion`, `runId`, fecha y version/source del runner;
- corpus ID/version/hash, sample ID y hash del audio;
- candidate ID/version/recipe hash;
- identidad STT y postprocess separada en configured/resolved/observed;
- prompt ID/version/hash y longitud, sin secretos;
- language, temperature y response format;
- formato, bytes y duracion de audio original/upload;
- refs separadas para gold, STT raw inmutable y salida final;
- `rawSource=produced|reused` para replay sin repetir STT;
- metadata words/segments/no-speech cuando exista;
- decisiones por etapa para filtros, vocabulario, prosodia, sanitizer y fallback;
- latencias por etapa, costo, scores dimensionales y errores categorizados.

Manifest/sample/candidate/run/result tienen versión e identidad estable. El
summary humano debe reconstruirse desde JSON/JSONL estructurado; Markdown nunca
es la única autoridad.

Texto humano, audio y payloads quedan locales/gitignored por ref. La retención
inicial es `manual-delete`, sin upload automático; `Clear history` de la app no
borra artifacts de benchmark.

### Contrato Provider-Free Cerrado En Batch 1A

El contrato implementado extiende `SyntheticAudioFixture` y agrega sólo
`CorpusManifest`, `Candidate`, `Run`, `SampleResult` y `EvidenceState`. No hay
plugins, stages genéricos ni adapter provider-real. `configured`, `resolved` y
`observed` son propiedades distintas; ausencia de `observed` permanece ausencia.

La salida canónica es `run.json` + `results.jsonl` incremental +
`summary.json` derivado bajo `artifacts/transcription-quality/<runId>/`.
`summary.md` no se genera sin consumidor concreto. La serialización canónica
ordena keys, preserva arrays y omite timestamps sólo de la proyección
determinista; el runner provider-free actual no necesita timestamps y sus tres
artifacts son byte-estables entre corridas equivalentes.

El límite de redaction es estructural: receipts públicos llevan refs
workspace-relative, hashes, lengths, categorías, métricas y estados; no aceptan
texto gold/raw/final. Raw y final conservan refs separadas. Replay raw usa
`sourceRunId` + `sourceSampleId` y no modifica
`providerCalls={enabled:false,maxRequests:0}`.

## Diseño De Experimentos

Orden inicial para separar causas:

1. Groq Turbo, prompt corto vs prompt rico, con el mismo audio.
2. Para ambos prompts, `language=auto` vs `language=es`.
3. Congelar cada STT raw y comparar raw vs GPT-OSS 120B.
4. Comparar postprocess sin/con prosodia.
5. Comparar filtros y vocabulario de forma independiente.
6. Agregar `whisper-large-v3` como candidato de mayor precision.
7. Evaluar otros modelos actuales mediante el mismo contrato.
8. Evaluar WAV/FLAC/MP3 solo despues de cerrar las diferencias de texto.

Cada experimento debe declarar hipotesis, variable independiente, controles,
criterio de promocion y costo de regresion aceptable.

## Rutas De Producto A Evaluar

Son hipotesis, no defaults aprobados:

- `Fast`: Turbo + prompt tecnico + filtros/vocabulario, sin postprocess.
- `Balanced`: Turbo y postprocess condicionado por necesidad demostrable.
- `Best`: STT de mayor precision + metadata + postprocess de alta calidad.
- `Literal`: mejor ASR disponible y materializacion minima.
- `Technical`: contexto/vocabulario tecnico y postprocess conservador.

Los nombres, defaults y reglas de routing se definen despues de los benchmarks.
Costo o latencia mayores son aceptables cuando la mejora observada los justifica.

## Criterios De Promocion

Un candidato entra al runtime productivo solo si:

1. mejora la dimension objetivo sobre el baseline estable;
2. no introduce drift semantico relevante;
3. pasa corpus sintetico y humano;
4. documenta costo y latencia;
5. conserva fallback seguro;
6. expone provider/modelo/prompt efectivos en evidencia redacted;
7. se valida en la ruta Tauri real antes del cierre.

## Preguntas Vivas

- Que errores percibe JP como mas costosos: palabras tecnicas, omisiones,
  puntuacion, estructura o reescritura incorrecta.
- Que subset del corpus humano Fixvox sigue representando el uso actual.
- Cuando conviene activar postprocess: siempre, por perfil, por confianza, por
  longitud, por entidades tecnicas o por revision manual.
- Si el vocabulario debe aportar hints antes del STT ademas de correccion final.
- Que modelo ofrece hoy la mejor calidad absoluta para español tecnico mixto.
- Que retencion local de audio/resultados conviene para shadow evaluation.

## Fuentes Externas Iniciales

- Groq Speech-to-Text: `https://console.groq.com/docs/speech-to-text`.
- Groq Whisper Large v3: `https://console.groq.com/docs/model/whisper-large-v3`.
- Groq Whisper Large v3 Turbo:
  `https://console.groq.com/docs/model/whisper-large-v3-turbo`.
- OpenAI Whisper Large v3 Turbo model card:
  `https://huggingface.co/openai/whisper-large-v3-turbo`.

Web research complementa benchmarks locales; no reemplaza evidencia sobre la
voz, vocabulario y workflow de JP.
