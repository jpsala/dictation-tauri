export const selectionTransformPresetIds = [
  "como-yo-es",
  "corregir-texto",
  "fix-writing",
  "like-me-en",
] as const;

export type SelectionTransformPresetId = string;

export type SelectionTransformPresetDefinition = {
  id: SelectionTransformPresetId;
  name: string;
  body: string;
  hotkey: string;
  pickerKey: string;
  provider?: string | null;
  model?: string | null;
  enabled?: boolean;
  confirm?: boolean;
};

export type SelectionTransformPresetEditableFields = Pick<
  SelectionTransformPresetDefinition,
  "name" | "body" | "hotkey" | "pickerKey" | "provider" | "model" | "enabled" | "confirm"
>;

export type SelectionTransformPresetAdminItem = SelectionTransformPresetDefinition;

const initialPresetDefinitions: Record<string, SelectionTransformPresetDefinition> = {
  "como-yo-es": {
    id: "como-yo-es",
    name: "Como yo (español)",
    provider: "openrouter",
    hotkey: "Alt+T, Y",
    pickerKey: "Y",
    body: `Reescribí este texto como lo escribiría JP, un developer argentino. Hacé correcciones muy menores solamente. Preservá la estructura, las palabras y el ritmo de JP. Devolvé SOLO el texto corregido, sin explicaciones.

## Reglas de estilo

- Usá voseo argentino: vos, tenés, fijate, recordá, contame, hacé
- Mezclá español e inglés técnico de forma natural (PR, bug, deploy, back-end, booking)
- Tono conversacional, como explicando en persona. Directo pero no rudo.
- Variá la estructura: no siempre abrir/cerrar igual
- NO uses 'tú' ni 'usted' — siempre 'vos'
- NO suenes a LLM (nada de 'Además', 'Por otro lado', 'Es importante mencionar', 'Cabe destacar')
- Podés usar paréntesis para aclarar, agregar info con 'Y algo que...' u 'Otra cosa...'

## Patrones (tendencias, NO reglas fijas)

### Estructura general
- Puede usar "y" para conectar ideas, o no
- A veces usa primera persona plural ("hacemos"), a veces singular ("hago")
- Para explicaciones técnicas: tiende a ser paso a paso
- A veces agrega info extra ("Y algo que me olvidé..."), a veces no

### Saludos (VARIAR)
- A veces saluda con nombre: "Hola, JD:"
- A veces sin nombre: "Hola, Team!"
- A veces va directo sin saludar
- NO siempre saludar igual

### Cierres (VARIAR)
- A veces pide feedback: "contame", "fíjate si tiene sentido"
- A veces solo agradece: "Gracias!"
- A veces no cierra con nada especial
- NO siempre cerrar igual

### Qué EVITAR
- Empezar siempre igual
- Repetir las mismas frases literalmente
- Sonar como LLM
- Usar "tú" en lugar de "vos"
- Ser predecible

## Ejemplos de referencia

### Ejemplo 1: Explicar una Feature
> En la ruta por defecto hacemos clic en el botón que dice "Multiple Bookings". Va a aparecer en la pantalla un componente con un input y una lista de resultados. En el input ingresamos los Bookings ID que queremos validar.
>
> Una vez que ingresamos el sexto carácter, el sistema valida el Booking y lo estiliza con rojo o con azul de acuerdo al resultado de la validación. Y hacemos lo mismo con los Bookings que queramos.
>
> Y una vez que estamos listos, si todos los Bookings fueron validados correctamente (si son todos correctos), entonces el botón de submit queda habilitado y, si lo presionamos, todos estos Bookings se van a ver en la ruta de "Multiple Bookings".
>
> Y algo que me olvidé de decir es que a medida que esos Bookings son validados y se estilizan en azul, van apareciendo en la lista de resultados.

### Ejemplo 2: Feedback de PR
> Hola, JD:
>
> Estuve revisando tu PR y encontré algún potential issue. Fíjate que en donde estás validando el booking, te olvidás de validar cuando ingresas el sexto carácter. Recordá que después del sexto carácter, tenés que buscar en el back-end a ver si el booking existe.
>
> Por lo demás, está todo bien. Yo no veo ningún problema. Fíjate si tiene sentido lo que te dije y contame.

### Ejemplo 3: Expresar Desacuerdo
> Estoy revisando el user story y me parece que no es correcto. Es decir, me parece que cuando el usuario termine de completar los datos, el sistema tendrá que autoguardar los cambios. No esperar que él los guarde. Como mucho una configuración, pero esperar que los guarde es un potencial riesgo de seguridad.

### Ejemplo 4: Aviso Rápido por Slack
> Hola, Team!
>
> Para avisarles que termine de trabajar en el usuStory y dejé el PR, a ver si alguno de ustedes lo puede revisar.
>
> Gracias!`,
  },
  "corregir-texto": {
    id: "corregir-texto",
    name: "Corregir texto",
    provider: "openrouter",
    hotkey: "Alt+T, C",
    pickerKey: "C",
    body: "Corregí la gramática, ortografía y claridad. Mantené el significado y estilo.",
  },
  "fix-writing": {
    id: "fix-writing",
    name: "Fix Writing",
    hotkey: "Ctrl+Alt+F",
    pickerKey: "F",
    body: "Fix grammar, spelling, and clarity in the following text. Keep the original tone and language. Return only the corrected text, no explanations.",
  },
  "like-me-en": {
    id: "like-me-en",
    name: "Like me (English)",
    provider: "openrouter",
    hotkey: "Alt+T, L",
    pickerKey: "L",
    body: `Rewrite this text as JP would write it in English. Always return English text. If the source is Spanish or mixed Spanish/English, translate it to natural JP-style English while preserving the meaning, structure, wording choices, and rhythm as much as possible. If the source is already English, make only very minor corrections when something is clearly wrong. Do not rewrite for elegance, fluency, or corporate tone. Return ONLY the fixed text, no explanations.

## Style rules

- Always output English, even when the input is Spanish.
- Keep the text as close as possible to JP's original writing after translating it to English.
- Make only very, very minor fixes when grammar/syntax/spelling is clearly wrong.
- Do not polish for native fluency.
- JP is an Argentine developer, non-native English speaker.
- Conversational and direct tone.
- If there is any doubt about style, preserve JP's original structure and words, but keep the output in English.

## Examples

### Sample 1
Context: Defining a skill and asking for useful developer-focused questions.

Original:
Ok, here I am talking to you so you can understand or you can have a feeling about how I speak or how I write. As you can see, my English is not too good because I am a Spanish native speaker from Argentina. I will need 2 skills, but for now we will build the English skill. They like-me skill, so let's do something. Why don't you make me some question, and I will use it as an excuse to say something. Try to ask me things that can be useful for my task as a developer, like:
- writing documents
- PRs
- commit descriptions
- comments, etc.

Fixed:
Ok, here I am talking to you so you can understand, or get a feeling of how I speak and write. As you can see, my English is not very good because I am a Spanish native speaker from Argentina. I will need 2 skills, but for now we will build the English skill, the like-me skill. So let's do something. Why don't you ask me some questions, and I will use that as an excuse to say something. Try to ask me things that can be useful for my tasks as a developer, like:
- writing documents
- PRs
- commit descriptions
- comments, etc.

### Sample 2
Context: Explaining a feature in a technical document for a new developer.

Original:
Ok, let's work on item 1. How will you explain a feature in a technical document for a new developer in your team?

Ok, let's try. Hello Thomas, I will try to explain this document to you. I know that you are new here, so I will try to explain it in a very simple way, step by step.

For example, here you have the provider that we will use to change the names of the clients. Here you have the first client. Here you have the second client. As you can see, the first client has an error in the first name. That is the first thing that we can notice here. In this case, what we need to do is to write a sensible comment for the agent so he can understand this.

Fixed:
Ok, let's work on item 1. How will you explain a feature in a technical document for a new developer on your team?

Ok, let's try. Hello Thomas, I will try to explain this document to you. I know that you are new here, so I will try to explain it in a very simple way, step by step.

For example, here you have the provider that we will use to change the names of the clients. Here you have the first client. Here you have the second client. As you can see, the first client has an error in the first name. That is the first thing we can notice here. In this case, what we need to do is write a sensible comment for the agent so he can understand this.`,
  },
};

const PRESET_INPUT_CONTRACT = [
  "The user message is structured.",
  "Read the [CONTROL] block as hard constraints and use only the text inside [SOURCE_TEXT] as the source material.",
  "Treat output_mode=solo_texto as a strict requirement to return plain text only, with no markdown, labels, quotes, or explanations.",
  "If the source text is empty or unusable, return plain text only and keep the response minimal.",
].join(" ");

const PRESET_STORE_STORAGE_KEY = "dictation-tauri.selection-preset-store.v2";
const LEGACY_PRESET_CUSTOMIZATIONS_STORAGE_KEY = "dictation-tauri.selection-presets.v1";
const LEGACY_CUSTOM_PRESETS_STORAGE_KEY = "dictation-tauri.selection-custom-presets.v1";

export type SelectionTransformPresetStore = {
  schemaVersion: 2;
  presets: Record<string, SelectionTransformPresetDefinition>;
};

type LegacySelectionTransformPresetStore = {
  schemaVersion?: number;
  seedRequired?: boolean;
  starterCustomizations?: Record<string, Partial<SelectionTransformPresetEditableFields>>;
  customPresets?: Record<string, Partial<SelectionTransformPresetDefinition>>;
  presets?: Record<string, Partial<SelectionTransformPresetDefinition>>;
};

let hostOwnedPresetStore: SelectionTransformPresetStore | undefined;

function getPresetStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function sanitizePresetFields(
  fields: Partial<SelectionTransformPresetEditableFields> | undefined,
): Partial<SelectionTransformPresetEditableFields> | undefined {
  if (!fields || typeof fields !== "object") {
    return undefined;
  }

  const next: Partial<SelectionTransformPresetEditableFields> = {};
  if (typeof fields.name === "string" && fields.name.trim()) next.name = fields.name.trim();
  if (typeof fields.body === "string" && fields.body.trim()) next.body = fields.body.trim();
  if (typeof fields.hotkey === "string") next.hotkey = fields.hotkey.trim();
  if (typeof fields.pickerKey === "string" && fields.pickerKey.trim()) {
    next.pickerKey = fields.pickerKey.trim().slice(0, 1).toUpperCase();
  }
  if (typeof fields.provider === "string" || fields.provider === null) {
    next.provider = typeof fields.provider === "string" ? fields.provider.trim() || null : null;
  }
  if (typeof fields.model === "string" || fields.model === null) {
    next.model = typeof fields.model === "string" ? fields.model.trim() || null : null;
  }
  if (typeof fields.enabled === "boolean") next.enabled = fields.enabled;
  if (typeof fields.confirm === "boolean") next.confirm = fields.confirm;

  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizePresetDefinition(
  id: string,
  definition: Partial<SelectionTransformPresetDefinition> | undefined,
): SelectionTransformPresetDefinition | undefined {
  if (!id.trim() || !definition || typeof definition !== "object") {
    return undefined;
  }

  const fields = sanitizePresetFields(definition);
  if (!fields?.name || !fields.body || !fields.pickerKey) {
    return undefined;
  }

  return {
    id,
    name: fields.name,
    body: fields.body,
    hotkey: fields.hotkey ?? "",
    pickerKey: fields.pickerKey,
    provider: fields.provider,
    model: fields.model,
    enabled: fields.enabled ?? true,
    confirm: fields.confirm ?? false,
  };
}

function cloneInitialPresets(): Record<string, SelectionTransformPresetDefinition> {
  return Object.fromEntries(
    Object.entries(initialPresetDefinitions).map(([id, preset]) => [id, { ...preset }]),
  );
}

function sanitizePresetRecord(
  presets: Record<string, Partial<SelectionTransformPresetDefinition>> | undefined,
): Record<string, SelectionTransformPresetDefinition> {
  if (!presets || typeof presets !== "object") {
    return {};
  }

  const sanitized: Record<string, SelectionTransformPresetDefinition> = {};
  for (const [id, definition] of Object.entries(presets)) {
    const preset = sanitizePresetDefinition(id, definition);
    if (preset) sanitized[id] = preset;
  }
  return sanitized;
}

function migrateLegacyPresetStore(store: LegacySelectionTransformPresetStore): SelectionTransformPresetStore {
  const presets = cloneInitialPresets();
  for (const [id, fields] of Object.entries(store.starterCustomizations ?? {})) {
    if (!presets[id]) continue;
    const customization = sanitizePresetFields(fields);
    if (customization) presets[id] = { ...presets[id], ...customization, id };
  }
  Object.assign(presets, sanitizePresetRecord(store.customPresets));
  return { schemaVersion: 2, presets };
}

export function normalizeSelectionTransformPresetStore(store: unknown): SelectionTransformPresetStore {
  const input = store && typeof store === "object" ? store as LegacySelectionTransformPresetStore : undefined;
  if (input?.schemaVersion === 2 && input.seedRequired !== true && input.presets && typeof input.presets === "object") {
    return { schemaVersion: 2, presets: sanitizePresetRecord(input.presets) };
  }
  if (input?.schemaVersion === 1) {
    return migrateLegacyPresetStore(input);
  }
  return { schemaVersion: 2, presets: cloneInitialPresets() };
}

function readBrowserPresetStore(): SelectionTransformPresetStore {
  const storage = getPresetStorage();
  if (!storage) {
    return { schemaVersion: 2, presets: cloneInitialPresets() };
  }

  const currentRaw = storage.getItem(PRESET_STORE_STORAGE_KEY);
  if (currentRaw !== null) {
    try {
      return normalizeSelectionTransformPresetStore(JSON.parse(currentRaw));
    } catch {
      return { schemaVersion: 2, presets: {} };
    }
  }

  const legacyCustomizationsRaw = storage.getItem(LEGACY_PRESET_CUSTOMIZATIONS_STORAGE_KEY);
  const legacyCustomPresetsRaw = storage.getItem(LEGACY_CUSTOM_PRESETS_STORAGE_KEY);
  let legacyCustomizations: LegacySelectionTransformPresetStore["starterCustomizations"] = {};
  let legacyCustomPresets: LegacySelectionTransformPresetStore["customPresets"] = {};
  try {
    legacyCustomizations = JSON.parse(legacyCustomizationsRaw ?? "{}");
  } catch {
    legacyCustomizations = {};
  }
  try {
    legacyCustomPresets = JSON.parse(legacyCustomPresetsRaw ?? "{}");
  } catch {
    legacyCustomPresets = {};
  }

  const migrated = normalizeSelectionTransformPresetStore({
    schemaVersion: 1,
    starterCustomizations: legacyCustomizations,
    customPresets: legacyCustomPresets,
  });
  storage.setItem(PRESET_STORE_STORAGE_KEY, JSON.stringify(migrated));
  return migrated;
}

function readPresetStore(): SelectionTransformPresetStore {
  return hostOwnedPresetStore ?? readBrowserPresetStore();
}

function writePresetStore(store: SelectionTransformPresetStore): void {
  const normalized = normalizeSelectionTransformPresetStore(store);
  if (hostOwnedPresetStore) {
    hostOwnedPresetStore = normalized;
    return;
  }
  getPresetStorage()?.setItem(PRESET_STORE_STORAGE_KEY, JSON.stringify(normalized));
}

export function hydrateSelectionTransformPresetStore(store: unknown): SelectionTransformPresetStore {
  hostOwnedPresetStore = normalizeSelectionTransformPresetStore(store);
  return hostOwnedPresetStore;
}

export function dumpSelectionTransformPresetStore(): SelectionTransformPresetStore {
  return normalizeSelectionTransformPresetStore(readPresetStore());
}

function slugifyPresetName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "preset";
}

export function listSelectionTransformPresets(): SelectionTransformPresetDefinition[] {
  return Object.values(readPresetStore().presets).filter((preset) => preset.enabled !== false);
}

export function listSelectionTransformPresetAdminItems(): SelectionTransformPresetAdminItem[] {
  return Object.values(readPresetStore().presets);
}

export function createSelectionTransformPreset(
  input?: Partial<SelectionTransformPresetEditableFields>,
): SelectionTransformPresetDefinition {
  const store = readPresetStore();
  const name = input?.name?.trim() || "New preset";
  const baseId = slugifyPresetName(name);
  let id = baseId;
  let suffix = 2;
  while (store.presets[id]) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  const preset: SelectionTransformPresetDefinition = {
    id,
    name,
    body: input?.body?.trim() || "Rewrite the text according to this preset. Return only the transformed text, no explanations.",
    hotkey: input?.hotkey?.trim() || "",
    pickerKey: input?.pickerKey?.trim().slice(0, 1).toUpperCase() || "N",
    provider: input?.provider ?? "openrouter",
    model: input?.model ?? null,
    enabled: input?.enabled ?? true,
    confirm: input?.confirm ?? false,
  };
  writePresetStore({ ...store, presets: { ...store.presets, [id]: preset } });
  return preset;
}

export function deleteSelectionTransformPreset(presetId: SelectionTransformPresetId): void {
  const store = readPresetStore();
  const presets = { ...store.presets };
  delete presets[presetId];
  writePresetStore({ ...store, presets });
}

export function saveSelectionTransformPreset(
  presetId: SelectionTransformPresetId,
  fields: Partial<SelectionTransformPresetEditableFields>,
): SelectionTransformPresetDefinition {
  const store = readPresetStore();
  const current = store.presets[presetId];
  if (!current) {
    throw new Error(`Unknown selection transform preset: ${presetId}`);
  }

  const updated = { ...current, ...sanitizePresetFields(fields), id: presetId };
  writePresetStore({ ...store, presets: { ...store.presets, [presetId]: updated } });
  return updated;
}

export function getSelectionTransformPreset(
  presetId: SelectionTransformPresetId,
): SelectionTransformPresetDefinition {
  const preset = readPresetStore().presets[presetId];
  if (!preset) {
    throw new Error(`Unknown selection transform preset: ${presetId}`);
  }
  return preset;
}

export function isSelectionTransformPresetId(
  presetId: string | null | undefined,
): presetId is SelectionTransformPresetId {
  return Boolean(presetId && readPresetStore().presets[presetId]);
}

export function isSelectionTransformPresetAvailable(
  presetId: string | null | undefined,
): presetId is SelectionTransformPresetId {
  const preset = presetId ? readPresetStore().presets[presetId] : undefined;
  return Boolean(preset && preset.enabled !== false);
}

export function selectionTransformPresetIdFromPickerKey(
  key: string,
): SelectionTransformPresetId | undefined {
  const normalized = key.trim().toUpperCase();
  return listSelectionTransformPresets().find((preset) => preset.pickerKey === normalized)?.id;
}

export function buildPresetStructuredInput(input: {
  presetId: SelectionTransformPresetId;
  sourceText: string;
  sourceKind: "selected_text" | "transcript";
  context: "preset-transform" | "preset-voice-transform";
}): string {
  const preset = getSelectionTransformPreset(input.presetId);
  const controlLines = [
    "[CONTROL]",
    "output_mode=solo_texto",
    `contexto=${input.context === "preset-transform" ? "transformacion_preset" : "post_procesamiento_preset"}`,
    "modo=balanceado",
    "prolijidad=natural",
    `source_kind=${input.sourceKind}`,
    `preset_name=${preset.name}`,
    "[/CONTROL]",
  ];

  return [
    ...controlLines,
    "",
    "[SOURCE_TEXT]",
    input.sourceText,
    "[/SOURCE_TEXT]",
  ].join("\n");
}

export function selectionTransformInstructionForPreset(input: {
  presetId: SelectionTransformPresetId;
  dictatedInstruction?: string;
}): string {
  const preset = getSelectionTransformPreset(input.presetId);
  const dictatedInstruction = input.dictatedInstruction?.trim();
  const addendum = dictatedInstruction
    ? `\n\n[USER_CONSTRAINTS]\n${dictatedInstruction}\n[/USER_CONSTRAINTS]`
    : "";

  return [
    PRESET_INPUT_CONTRACT,
    "",
    "[PRESET_TEMPLATE]",
    preset.body,
    "[/PRESET_TEMPLATE]",
    addendum,
  ].join("\n").trim();
}

export function selectionTransformPresetDisplayName(
  presetId: SelectionTransformPresetId,
): string {
  return getSelectionTransformPreset(presetId).name;
}

export function selectionTransformPresetPickerKey(
  presetId: SelectionTransformPresetId,
): string {
  return getSelectionTransformPreset(presetId).pickerKey;
}
