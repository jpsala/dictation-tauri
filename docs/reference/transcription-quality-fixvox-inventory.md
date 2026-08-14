# Inventario Fixvox Para Calidad De Transcripción

Estado del corte: inventario local verificado el 2026-08-12. Fuente canónica
inspeccionada: `C:/dev/fixvox`; código y tests actuales prevalecen sobre docs,
matrices y reportes históricos. Este documento no contiene audio, gold ni texto
transcripto privado.

## Cómo Leer La Evidencia

- `configured`: un manifest, matrix, policy o setting declara una intención.
- `resolved`: el resolver vigente produjo una identidad efectiva antes de llamar
  una etapa.
- `observed`: un receipt o artifact persistido demuestra lo ejecutado. Código,
  tests y config por sí solos no cuentan como observación.
- Todo `Candidate` futuro debe conservar las tres capas. No se infiere
  `observed` desde `configured` ni desde un default.

Fuentes de esta regla: el runner Fixvox persiste config y resultados pero pierde
IDs estables y hashes (`C:/dev/fixvox/scripts/run-voice-benchmark-matrix.ts`,
`BenchmarkScenario`, `ScenarioResult`, `loadBenchmarkSamples`, `main`), mientras
el runtime expone el plan resuelto y telemetry por separado
(`src/app/backend/voice-execution-plan.ts`, `ResolvedVoiceExecutionPlan`,
`buildVoiceExecutionPlanTelemetryMetadata`).

## Pipeline Efectivo Fixvox

| Etapa | Mecanismo actual y límites | Fuente primaria | Clase | Destino propuesto |
| --- | --- | --- | --- | --- |
| Captura | WinMM; PCM WAV mono, 16 kHz, 16-bit; buffers de 50 ms. No hay denoise ni AGC. | `src/app/backend/audio-capture.ts`: `SAMPLE_RATE`, `CHANNELS`, `BITS`, `BUFFER_MS`, `startRecording`, `stopRecording` | `adopt-process` | Recipe de captura medible; shell Tauri/Rust propio. |
| Audio prep | VAD local sobre PCM: frames 50 ms, voz mínima 150 ms, RMS `0.002` o peak `0.006`. WAV menor a 160000 bytes o 4 s se conserva; el resto intenta MP3 mono 16 kHz/48 kbps y vuelve a WAV si ffmpeg falla, queda vacío o no reduce bytes. No trim/normalización/denoise. | `src/app/backend/speech-to-text.ts`: `analyzeWavVoiceActivity`, `prepareSpeechUploadPayload`, `transcribeWavFile` | `adopt-process` para decisiones y receipts; `adapt` implementación | `Candidate.audioPrep` y métricas original/upload; no copiar Bun/ffmpeg al runner sin necesidad. |
| STT request | Provider/model/endpoint vienen del resolver; prompt usa override no vacío y si no el prompt base efectivo; `auto` se materializa como language omitido. Solicita `verbose_json`, words, segments y `temperature=0`; timeout 45 s. Sin retry STT general. | `speech-to-text.ts`: `resolveSpeechProviderConfig`, `resolveSpeechPrompt`, `resolveSpeechLanguage`, `transcribeWavFile` | `adopt-process` | Recipe STT versionada y receipt observed por request. |
| Parsing y no-speech | Texto vacío falla. Promedia `no_speech_prob` y `avg_logprob` por segments; descarta texto corto con probabilidad `>=0.85`, o `>=0.7` más logprob `<=-1`. VAD local corre antes del upload. | `speech-to-text.ts`: `SpeechApiResponse`, `shouldDiscardNoSpeechResponse`, `transcribeWavFile`; tests `speech-to-text.test.ts` | `adopt-process` | `SampleResult.stages.stt` y `materialization.decisions[]`; metadata bounded, no payload crudo obligatorio. |
| Prosodia | Deriva pausas desde word timestamps y las presenta como hints advisory; no impone puntuación. | `src/app/backend/audio-prosody.ts`: `detectPauses`, `formatProsodyHints`; `docs/navigation/topics/voice-postprocess-models/decisions.md`, “Prosody Hints Are Advisory” | `adopt-process` | Factor independiente de Candidate; registrar versión/config y si hubo hints. |
| Materialización/filtros | Antes de commands/postprocess filtra solo transcript completo o sufijo exacto de alucinaciones conocidas; nunca debe bloquear palabras reales de forma amplia. Transcript vacío no se entrega. La ruta completa además deriva command/assistant/preset, fuera del corpus de dictado normal. | `src/app/backend/voice-dock-output.ts`: `removeLikelyAsrSilenceHallucination`, `materializeVoiceOutput`; tests `voice-dock-output.test.ts` | `adapt` | Extraer únicamente materialización de dictado normal; command/assistant/presets son `reject` para este programa. |
| Postprocess | Sólo corre si la policy resuelta lo habilita y existe prompt resuelto. Usa provider/model del target `postProcess`, contrato anti-assistant y transcript delimitado; prosodia va fuera del bloque de datos. Missing key, error o salida vacía dejan el raw como fallback. | `src/app/backend/voice-runtime-policy.ts`: `resolveEffectiveVoiceRuntime`; `voice-dock-processing.ts`: `buildRawVoicePostProcessSystemPrompt`, `buildRawVoicePostProcessUserMessage`, `resolveRawVoicePostProcessConfig`; `voice-dock-output.ts`: `materializeVoiceOutput` | `adopt-process` | Recipe postprocess replayable sobre raw congelado; sin dependencia del desktop legacy. |
| Sanitizer/fallback | Acepta marcador `Final`; si detecta explicación o salida > `max(3x raw, raw+600)`, vuelve al transcript crudo. No verifica equivalencia semántica formal. | `voice-dock-processing.ts`: `sanitizeRawVoicePostProcessOutput`; `voice-dock-output.ts:1470-1522` | `adapt` | Mantener fallback observable y agregar scores de drift; no prometer equivalencia. |
| Lexicon | Reemplazos globales `spoken => written` se aplican después de raw/postprocess y antes de preset/delivery; memoria markdown global. `viaPostProcess` puede quedar true sólo porque cambió lexicon/preset, por lo que ese boolean no atribuye etapa correctamente. | `src/app/backend/smart-dictation.ts`: `normalizeLexiconEntries`, `parseSmartLexiconMarkdown`, `applyGlobalLexicon`; `voice-dock-output.ts:1562-1618` | `adapt` | Única autoridad de vocabulario de Dictation Tauri; receipt separado `vocabulary`, nunca inferido desde `viaPostProcess`. |

Evidencia local ya existente, no generada por este batch:
`C:/dev/fixvox/.tmp-dev-runtime/dev-start-stdout.log:1216-1269` observa una
captura guardada y una ruta managed/proxied `pro-stt-only`: WAV de 300844 bytes
y 9.4 s, upload MP3 de 57284 bytes, VAD positivo, Groq
`whisper-large-v3-turbo`, prompt presente de 382 caracteres, language omitido y
postprocess resuelto pero deshabilitado. Prueba esa corrida puntual; filtros,
sanitizer y lexicon siguen sólo code/test-proven.

## Policy, Routing E Identidad Efectiva

| Dimensión | Configured | Resolved | Observed disponible | Estado |
| --- | --- | --- | --- | --- |
| Perfil principal | Docs activas llaman `pro` a la policy principal; voice routing puede declarar `pro-stt-only` o `pro-post-process`. | Para policy `pro`, ausencia de perfil resuelve `pro-stt-only` salvo enablement explícito; `pro-stt-only` fuerza off y `pro-post-process` fuerza on. Kill switch `FIXVOX_DISABLE_VOICE_POST_PROCESS=1` gana. | Log local observa policy `pro`, route `pro-stt-only` y postprocess disabled. | `src/app/backend/voice-runtime-policy.ts`: `resolveVoiceRoutingProfileId`, `resolvePolicyPostProcessEnabled`; `voice-execution-plan.ts`: `resolveVoiceExecutionPlan`, `buildVoiceExecutionPlanTelemetryMetadata`; `.tmp-dev-runtime/dev-start-stdout.log:1221-1232`. |
| STT | Matrices activas configuran Groq/OpenAI/xAI/OpenRouter; prompt vacío, técnico o rioplatense; `auto`, `es` y ramas puntuales `en`. | Desktop vigente soporta speech provider efectivo y normalmente resuelve Groq `whisper-large-v3-turbo`; recipe/policy decide prompt y language. | Log local observa request managed/proxied Groq `whisper-large-v3-turbo`, prompt presente de 382 caracteres y language omitido; no prueba otras matrices. | `managed-runtime.ts`: `resolveEffectiveSpeechRuntime`; `voice-execution-plan.ts:74-134`; `speech-to-text.ts:516-840`; `.tmp-dev-runtime/dev-start-stdout.log:1242-1269`. |
| Prompt STT | `00-empty.txt`, `10-spanish-technical-conservative.txt` y `15-spanish-rioplatense-technical.txt` son brazos configurados. | `resolveSpeechPrompt` prioriza override y luego prompt base efectivo; `resolveVoiceExecutionPlan` puede resolver prompt de recipe. | La corrida local observa longitud 382, no identidad/hash; queda evidencia incompleta. Matrix reports prueban sólo su scenario. | `adapt`; conservar ID/version/hash/length, no copiar correcciones fixture-specific. |
| Language | Matrices usan string vacío como auto y `es`; settings usan `auto`. | `auto` se convierte en campo omitido; override gana al setting. | La corrida local observa campo omitido/null. | `speech-to-text.ts`: `resolveSpeechLanguage`, `transcribeWavFile`; `.tmp-dev-runtime/dev-start-stdout.log:1262-1265`. |
| Postprocess | Matrices incluyen Groq/OpenRouter con GPT-OSS 20B/120B y prompts technical/ultra-conservative. Config legacy todavía puede contener Llama. | Código actual remapea target Llama stale y usa Groq `openai/gpt-oss-120b` como quality default; aun así sólo corre con enablement y prompt resueltos. | Log local observa target GPT-OSS 120B resuelto pero **no ejecutado** por `pro-stt-only`. Artifact 2026-05-20 observa Gemini 3.5 Flash 14/17, 82.35%, ~10.5 s promedio y ~$0.123 total estimado; no demuestra default actual. | `remote-runtime-policy.ts`; `remote-runtime-policy.test.ts`; `.tmp-dev-runtime/dev-start-stdout.log:1223-1232`; `voice-postprocess-model-competition.latest.json`. |
| Prompts postprocess | Technical bilingual y ultra-conservative existen como matrix prompts; runtime agrega contrato anti-assistant y cleanup level. | Runtime wrapper es la autoridad; prompt de matrix aislado no equivale al efectivo si omite wrapper. | No hay postprocess observado en la corrida local; reports históricos son point-in-time. | `adopt-process` wrapper; `adapt` prompt arms. `voice-dock-processing.ts:29-137`. |

Regla de cierre posterior: una fila sin `observed` queda explícitamente
`not-observed`; nunca se completa con docs o tests.

## Activos De Benchmark Y Clasificación

| Activo o grupo Fixvox | Clase | Causa | Destino Dictation Tauri |
| --- | --- | --- | --- |
| `scripts/run-voice-benchmark-matrix.ts` + test | `adopt-process` / `adapt` | Selección manifest-driven, lanes/stages, scenarios, costos y artifacts son útiles; pierde sample ID en results, no hashea inputs, usa exact match y vuelca texto privado a JSON/Markdown. | Runner propio en Phase 1; extender fixtures existentes y escribir artifacts gitignored/redacted. |
| `docs/reference/ops/voice-reference-manifest.yaml` + `audio/human/` | `adapt` | 15 IDs y WAVs estables; gold inline privado, 12 “expected” son output previo no gold adjudicado. | Manifest humano local con metadata/hashes; gold por referencia privada. |
| `text/human/jp-punctuation-list-gold-20260515.md` | `adapt` | Único gold separado; contiene incertidumbre que requiere adjudicación. | `goldRef` local; no copiar contenido a docs. |
| `voice-benchmark-matrix.human-decision.json` y `human-stt-postprocess.json` | `adapt` | Buen diseño de controles raw/postprocess y filtros de stage; demasiado amplio antes de adjudicar gold. | Matriz P0/P1 de esta referencia. |
| `human-all-postprocess-models`, `human-ultra-conservative`, `human-openrouter-ultra` | `reference` | Brazos útiles, provider/model/latencia point-in-time. | Reintroducir sólo tras baseline y con raw congelado. |
| `stt-only.json` | `adapt` | Ablación prompt vacío/técnico/rioplatense. | Primer sweep STT luego del contrato provider-free. |
| `bilingual-stt`, `xai-stt`, `xai-stt-tuning`, `openrouter-asr-smoke` | `reference` | Comparaciones provider-specific, parte sintéticas y con resultados negativos fechados. | Catálogo P1, no baseline inicial. |
| `grok-tts-smoke`, `grok-tts-full-pipeline`, frases TTS y `generate-tts-benchmark.ts` | `reference` / `adapt` proceso | Útiles para regresión determinista, no evidencia humana de promoción. | Lane sintético separada; no mezclar scores humanos. |
| Prompt STT vacío | `adopt-process` | Control obligatorio para atribuir mejora. | Candidate baseline. |
| Prompts STT técnico/rioplatense | `adapt` | Hipótesis válida; comportamiento depende del provider. | Versionados por ID/hash, sin acoplarlos al runtime productivo. |
| Prompts postprocess technical/ultra-conservative | `adapt` | Contraste útil; el technical contiene correcciones sobreajustadas. | Conservar reglas generales; `reject` mappings con respuesta predeterminada. |
| `run-voice-postprocess-cleanup-matrix.ts` y `voice-postprocess-cleanup-matrix.json` | `adopt-process` | Reusa wrapper/sanitizer real y 17 casos; reporte imprime texto. | Replay provider-free/real gated con refs privadas y métricas por dimensión. |
| `run-voice-postprocess-model-competition.ts` y summary | `reference` | Buen patrón calidad/latencia/costo; precios/modelos envejecen. | Evidencia histórica, no defaults. |
| `voice-postprocess-model-competition.latest.json` | `stale` | Sólo contiene Gemini 3.5 Flash; el summary hermano afirma ocho candidatos. | No migrar como raw del summary; registrar mismatch. |
| Abril archivado: protocolos, comparación, matrices | `stale` operativo / `reference` histórico | Rutas `C:/dev/electro-bun-1`, comandos y candidatos superseded. | Sólo apéndice de resultados negativos. |
| Scripts manuales con gold inline o output privado (`benchmark-punctuation-list-prompts.ts`, `benchmark-llama-postprocess.ts`) | `reject` | No manifest-driven; filtran inputs/outputs a consola. | Migrar factores seguros a matrices, no código ni reporting. |
| `benchmark-postprocess-from-tts.ts`, `compare-stt-benchmark.ts` | `stale` / `reject` | Duplican el runner general. | Ninguno. |
| Settings mutators (`configure-stt-prompt-experiment.ts`, `configure-voice-benchmark.ts`) | `reject` | Mutan runtime y rompen reproducibilidad del batch. | Candidate explícito, sin mutar settings. |
| Smart-agent/wake-word matrices y proxy latency scripts | `reject` | Otra superficie o transporte, no calidad de transcripción. | Ninguno en este programa. |

## Docs Y Config Stale Confirmados

1. `voice-postprocess-model-competition-summary.md` apunta a
   `voice-postprocess-model-competition.latest.json` como raw de ocho candidatos;
   el JSON actual sólo contiene uno.
2. `docs/archive/2026-04-07-docs-cleanup/reference/ops/voice-benchmark-comparison.md`
   se llama canónico pero está archivado y apunta a `C:/dev/electro-bun-1`.
3. `C:/dev/fixvox/package.json` conserva comandos para matrices activas que ya
   sólo existen en archive; no son entrypoints vigentes reproducibles.
4. Docs/sesiones antiguas y `proxy/src/control-plane-store.ts` todavía pueden
   nombrar Llama 3.3 70B. El resolver y sus tests actuales remapean ese target a
   Groq GPT-OSS 120B (`remote-runtime-policy.ts`,
   `remote-runtime-policy.test.ts`). Configured stale no equivale a resolved.
5. Los reports históricos que dicen “postprocess” no distinguen siempre cambios
   de lexicon/preset; el runtime `voice-dock-output.ts:1613-1618` puede marcar
   `viaPostProcess` por cualquier cambio final. El schema nuevo separa etapas.

## Experimentos Negativos Que Se Conservan

- Un head-to-head humano histórico de seis WAVs obtuvo 0/6 mejoras exactas con
  ambos postprocessors evaluados: postprocess necesita control `off` y scoring
  semántico, no activación por capability. Fuente:
  `docs/archive/2026-04-07-docs-cleanup/reference/ops/voice-benchmark-comparison.md`.
- OpenAI Whisper-1 y Groq full Whisper no superaron Turbo en el corpus histórico
  de cuatro WAVs; es evidencia fechada, no rechazo permanente del modelo.
- Prompt de puntuación literal no resolvió solo puntuación/literalidad; glossary
  recuperó términos pero introdujo drift. Vocabulario se evalúa como ablación.
- OpenRouter Voxtral Mini/Qwen3 ASR fueron más lentos/peores en el corpus técnico
  observado de mayo. Fuente:
  `docs/ops/sessions/2026-05-20-voice-agent-postprocess-model-benchmarks/SUMMARY.md`.
- Algunos modelos de postprocess fallaron umbrales o latencia; un caso 120B llegó
  a 49 s. Se guardan tail latency y error count, no sólo promedio. Fuente:
  `voice-postprocess-model-competition-summary.md`.
- Pausas no son puntuación dura; word duration puede incorporar silencio.
- Bloquear frases amplias o “arreglar” silencio con LLM es incorrecto: VAD local,
  metadata no-speech y filtro final conservador son capas distintas.
- TTS técnico literal distorsionó tokens; spoken forms ayudaron. Sirve para una
  ablación sintética, no para promoción humana.

## Única Convención De Corpus Y Artifacts

No se crea una familia paralela. Phase 1 debe **extender**
`src/test-fixtures/synthetic-audio-manifest.ts` y sus valores existentes
`sourceType`, `format`, `sensitivity`, `versionPolicy`, `audioArtifactPath`.
`src/test-fixtures/synthetic-audio-artifacts.ts` ya exige rutas workspace-relative,
allowlist bajo artifacts y policy gitignored/temporary. El runner placeholder
`scripts/synthetic-audio-stt.ts` ya separa fixture, STT, comparison, postprocess y
pipeline. La búsqueda de `CorpusManifest`, `SampleResult`, `candidateId` y
`corpusId` en `src/`, `scripts/` y `tests/` no encontró otro contrato productivo;
`SyntheticAudioFixture` es la convención a evolucionar.

`artifacts/transcription-quality/<runId>/` será un nuevo namespace de evidencia,
no una segunda convención de fixture. Mantiene los mismos invariantes de path y
retención; no reutiliza `artifacts/microphone-capture/` como corpus.

## Schema Mínimo Propuesto (Phase 1)

Propuesta concreta, todavía no implementada:

```ts
type EvidenceState<T> = {
  configured: T;
  resolved?: T;
  observed?: T;
};

type CorpusManifest = {
  schemaVersion: 1;
  corpusId: string;
  corpusVersion: string;
  samples: readonly Sample[];
};

type Sample = {
  sampleId: string;                 // conserva SyntheticAudioFixture.id
  sourceType: "generated-tts" | "local-human-reference" | "external-reference";
  audioArtifactPath: string;        // workspace-relative; no blob embebido
  audioSha256: string;
  format: "wav" | "mp3" | "m4a" | "webm";
  durationMs?: number;
  language: string;
  categories: readonly string[];
  difficulty: "baseline" | "hard" | "edge";
  goldRef: string;                  // ref, no texto humano inline
  goldStatus: "approved" | "provisional" | "shadow-only";
  sensitivity: "synthetic" | "local-sensitive" | "unknown";
  versionPolicy: "versioned-metadata" | "gitignored-artifact" | "temporary";
};

type Candidate = {
  candidateId: string;
  candidateVersion: string;
  audioPrep: { mode: string; configHash: string };
  stt: {
    provider: string;
    model: string;
    prompt: { id: string; version: string; sha256: string; chars: number };
    language: string;
    temperature: number;
    responseFormat: string;
  };
  materialization: { mode: string; configHash: string };
  postprocess: null | {
    provider: string;
    model: string;
    prompt: { id: string; version: string; sha256: string; chars: number };
    cleanupLevel: "light" | "medium" | "strong";
    prosody: "off" | "advisory";
    sanitizerVersion: string;
  };
  vocabulary: { mode: "off" | "rules"; rulesHash?: string };
};

type Run = {
  schemaVersion: 1;
  runId: string;
  runnerVersion: string;
  corpus: { corpusId: string; corpusVersion: string };
  candidate: EvidenceState<{ candidateId: string; candidateVersion: string; recipeHash: string }>;
  sampleIds: readonly string[];
  startedAt: string;
  finishedAt?: string;
  providerCalls: { enabled: boolean; maxRequests: number };
  resultPath: string;
};

type SampleResult = {
  schemaVersion: 1;
  runId: string;
  sampleId: string;
  audio: {
    sha256: string;
    original: { format: string; bytes: number; durationMs: number };
    upload: { format: string; bytes: number; source: string };
  };
  identity: EvidenceState<{
    sttProvider: string;
    sttModel: string;
    sttPromptSha256: string;
    language: string;
    responseFormat: string;
    postprocessProvider?: string;
    postprocessModel?: string;
    postprocessPromptSha256?: string;
  }>;
  rawSource:
    | { kind: "produced" }
    | { kind: "reused"; sourceRunId: string; sourceSampleId: string };
  text: {
    goldRef: string;
    rawTranscriptRef: string;
    finalTextRef: string;
  };
  stages: {
    stt: { status: "ok" | "no-speech" | "error"; metadataRef?: string };
    materialization: { status: "kept" | "changed" | "discarded"; reasons: readonly string[] };
    postprocess: { status: "off" | "ok" | "fallback" | "error"; sanitizerReason?: string };
    vocabulary: { status: "off" | "unchanged" | "changed" };
  };
  timingsMs: { audioPrep: number; stt: number; postprocess: number; total: number };
  costUsd: { stt?: number; postprocess?: number; total?: number; source: string };
  scores: {
    wer?: number;
    cer?: number;
    entities?: number;
    structure?: number;
    semanticSafety?: number;
    robustness?: number;
  };
  errors: readonly { stage: string; code: string }[];
};
```

Decisiones de minimalidad:

- No existe una jerarquía genérica de stages ni plugins. Las cinco etapas que el
  primer runner compara están nombradas.
- `EvidenceState` es la única pequeña estructura compartida porque evita la
  confusión configured/resolved/observed en Candidate/Run/Result.
- Texto se guarda por ref: permite versionar gold sintético y mantener gold/raw/
  final humano local sin dos schemas.
- `SampleResult` conserva `sampleId`; no repite el error Fixvox de resultados por
  índice.
- Scores permanecen dimensionales. No hay `overallScore`.
- Summary JSON/Markdown se deriva de `run.json` + results; Markdown nunca es la
  autoridad.
- Hashes usan SHA-256 completo sobre JSON UTF-8 canónico: object keys ordenadas,
  array order preservado y exclusión de self-hash, timestamps y paths locales.
  IDs legibles pueden usar prefijo del hash, pero el artifact retiene el hash
  completo.
- Los nombres JSON son los cinco del contrato. Si Phase 1 exporta tipos
  TypeScript, usa prefijo `TranscriptionQuality*` para no colisionar con
  `PipelineRun` ni con `Candidate` del vocabulario personal.

## Política De Datos Y Layout

```text
src/test-fixtures/synthetic-audio-manifest.ts  # manifest/gold sintético versionado
artifacts/transcription-quality/corpus/...     # audio/gold humano local
artifacts/transcription-quality/<runId>/run.json
artifacts/transcription-quality/<runId>/results.jsonl
artifacts/transcription-quality/<runId>/private/...  # raw/final/payload refs
artifacts/transcription-quality/<runId>/summary.json
artifacts/transcription-quality/<runId>/summary.md   # derivado y redacted
```

- Metadata no sensible y gold sintético pueden versionarse.
- Audio humano, gold humano, raw/final humano y provider payloads quedan
  `local-sensitive` + `gitignored-artifact` salvo decisión explícita posterior.
- Docs y summaries públicos usan ID, categoría, hash, lengths, métricas y status;
  nunca contenido humano.
- Provider payload completo es opcional. Metadata bounded necesaria para
  no-speech/prosodia puede persistirse por ref privada.
- Retención inicial: `manual-delete`. No upload automático y `Clear history` de
  la app no implica borrar artifacts de benchmark. Phase 1 debe probar
  path/redaction antes de provider-real.

## Primer Corpus Humano Candidato

Los cinco WAV existen localmente. Hash y bytes se obtuvieron con `sha256sum` y
`stat`; no se reprodujo audio.

| Rol | ID / ruta Fixvox | Categoría | Gold status | SHA-256 / bytes |
| --- | --- | --- | --- | --- |
| Core | `jp-fixvox-bilingual-technical-001` — `docs/reference/ops/audio/human/jp-fixvox-bilingual-technical-001.wav` | bilingual technical; `es-en` | `provisional`; expected existe, requiere aprobación privada | `28a84aa5fe65a76c4b47e02d5a9a25b457a6d07374894530b07ee5038dbc5b12` / 1075244 |
| Core | `jp-punctuation-list-20260515-094801` — `docs/reference/ops/audio/human/jp-punctuation-list-20260515-094801.wav` | punctuation/list/spacing; `es` | `provisional`; gold separado con token incierto | `702778a78832aa5325e51110de98f3b9384ad3da14398d4335a180a681205995` / 1726444 |
| Adjudication | `jp-pro-dictation-punctuation-20260515-015712` — `docs/reference/ops/audio/human/jp-pro-dictation-punctuation-20260515-015712.wav` | punctuation/list/model; `es-en` | `provisional`; manifest lo marca aproximado | `615fe609b8f457522e0baf4d6afaea910e8e1d1d40125e8a0a5d237f07b1934f` / 2001644 |
| Shadow | `jp-recent-01` — `docs/reference/ops/audio/human/jp-recent-01.wav` | recent dictation; `es-en` | `shadow-only`; output previo, no gold | `7771cd13a947606554c7c44c49108b4d36ca5bf8edf4dbc0af71cb6dba0ae52f` / 366444 |
| Shadow/short | `jp-recent-06` — `docs/reference/ops/audio/human/jp-recent-06.wav` | recent/short; `es-en` | `shadow-only`; output previo, no gold | `ffc2796dc6ad1e06fa579c87c58c0ff9a9558027d9b4eab3f6383fe38cd5b41c` / 64044 |

Fuente de categorías/gold readiness:
`C:/dev/fixvox/docs/reference/ops/voice-reference-manifest.yaml`. Los otros diez
WAV quedan inventariados como reserva; `jp-recent-02..12` no se tratan como gold
hasta adjudicación.

## Matriz Accionable P0/P1

| Orden | Prioridad | Variable | Control | Corpus | Evidencia/criterio |
| --- | --- | --- | --- | --- | --- |
| 0 | P0 | Validación de manifest/schema/redaction | provider-free | 2 core + 3 shadow/adjudication | IDs/hashes estables; dos runs deterministas; ningún texto humano en summary. |
| 1 | P0 | Gold approved/provisional/shadow | doble adjudicación privada | cinco candidatos | Sólo `approved` recibe scores contra gold. |
| 2 | P0 | Baseline productiva actual | candidate identity configured/resolved/observed | dos core aprobados | Raw y final separados; receipt real se difiere al batch autorizado. |
| 3 | P1 | Prompt empty vs corto productivo vs rico Fixvox | Turbo, mismo audio, `auto`, postprocess off | core aprobado + sintético | Entidades/fidelidad; hash del prompt observado. |
| 4 | P1 | `auto` vs `es` | prompt/model fijos | core aprobado | Español técnico vs mezcla de idiomas. |
| 5 | P1 | no-speech + filtros | misma respuesta/metadata | silencio, quiet, short aprobados | Descartes correctos y falsos positivos; no phrase ban amplio. |
| 6 | P1 | raw vs postprocess medium vs ultra-conservative | mismo raw congelado | core aprobado + casos no sensibles | Estructura vs drift; fallback/sanitizer explícitos. |
| 7 | P1 | prosodia off/advisory | mismo raw/model/prompt PP | punctuation core | Estructura sin puntuación impuesta. |
| 8 | P1 | vocabulario off/rules | mismo raw/final previo | technical + synthetic spoken/literal | Exact match de entidades y falsos reemplazos. |
| 9 | P1 | GPT-OSS 120B control vs alternativas | mismo raw, repeticiones | corpus ampliado aprobado | Calidad, errores, costo, promedio y p95/tail latency. |

No se combinan scores sintéticos y humanos. Ninguna fila P1 autoriza provider
calls; cada ejecución real necesita subset, candidates, request cap y costo.

## Próximo Batch Exacto

**Batch 1A — Contrato Provider-Free De Corpus Y Artifacts**

Inputs:

1. `src/test-fixtures/synthetic-audio-manifest.ts` y
   `synthetic-audio-artifacts.ts`;
2. schema mínimo de este documento;
3. dos fixtures sintéticos actuales;
4. metadata privada de los cinco IDs candidatos, sin copiar WAV/gold al repo;
5. `scripts/synthetic-audio-stt.ts` como runner provider-free existente.

Criterios de cierre:

- extender, no reemplazar, `SyntheticAudioFixture` hacia manifest versionado;
- validar IDs, SHA-256, `goldStatus`, refs y rutas workspace-relative;
- emitir `run.json`, `results.jsonl` y `summary.json` deterministas bajo
  `artifacts/transcription-quality/<runId>/`;
- demostrar dos runs provider-free byte-equivalent salvo timestamps explícitos;
- preservar raw/final y configured/resolved/observed como campos distintos;
- probar que summary/redaction no contiene gold/raw/final `local-sensitive`;
- no implementar scoring completo ni adapter provider-real todavía;
- actualizar track/topic/memory e índice/audit al cierre.
