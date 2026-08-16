export type SettingsSectionId =
  | "account"
  | "dictation"
  | "hotkeys"
  | "actions"
  | "vocabulary"
  | "application"
  | "privacy"
  | "help"
  | "advanced";

export type SettingsSectionGroup = "primary" | "utility";

export type SettingsTargetRelation = {
  label: string;
  sectionId: SettingsSectionId;
  targetId: string;
};

export type SettingsSearchTarget = {
  id: string;
  sectionId: SettingsSectionId;
  sectionLabel: string;
  label: string;
  summary: string;
  keywords: readonly string[];
  valueSummary?: string;
  relations?: readonly SettingsTargetRelation[];
  targetId: string;
};

export type SettingsSectionDefinition = {
  id: SettingsSectionId;
  label: string;
  summary: string;
  icon: string;
  group: SettingsSectionGroup;
  search: readonly Omit<SettingsSearchTarget, "sectionId" | "sectionLabel">[];
};

export const settingsRegistry: readonly SettingsSectionDefinition[] = [
  {
    id: "account", label: "Cuenta", summary: "Gestiona acceso, plan y perfil, pero no expone identificadores ni infraestructura.", icon: "☁", group: "primary",
    search: [
      { id: "account-access", label: "Cuenta", summary: "Inicio de sesión y estado de la cuenta", keywords: ["login", "google", "plan", "perfil"], targetId: "settings-account-access" },
    ],
  },
  {
    id: "dictation", label: "Dictado", summary: "Controla escucha, procesamiento y entrega del dictado, pero no modifica acciones ni atajos.", icon: "◌", group: "primary",
    search: [
      { id: "dictation-mode", label: "Modo de dictado", summary: "Según mi perfil, Rápido, Limpieza segura o Completo", keywords: ["modo", "perfil", "rápido", "limpieza", "completo"], targetId: "settings-dictation-mode", relations: [{ label: "Abrir Laboratory", sectionId: "advanced", targetId: "settings-advanced-diagnostics" }] },
      { id: "dictation-listening", label: "Escucha", summary: "Volumen, autocierre y silencio", keywords: ["micrófono", "volumen", "silencio", "duración"], targetId: "settings-dictation-listening" },
      { id: "dictation-delivery", label: "Entrega", summary: "Método, revisión, foco y Enter", keywords: ["pegar", "entrega", "revisar", "foco", "enter"], targetId: "settings-dictation-delivery" },
      { id: "dictation-feedback", label: "Feedback", summary: "Mute y sonidos de dictado", keywords: ["mute", "sonidos", "grabación"], targetId: "settings-dictation-feedback" },
    ],
  },
  {
    id: "hotkeys", label: "Atajos", summary: "Configura combinaciones de teclado y sus conflictos, pero no cambia el contenido del dictado.", icon: "⌘", group: "primary",
    search: [{ id: "hotkeys-edit", label: "Atajos", summary: "Cambiar y validar combinaciones", keywords: ["tecla", "shortcut", "dictado", "selector"], targetId: "settings-hotkeys-list", relations: [{ label: "Ver acciones de texto", sectionId: "actions", targetId: "settings-actions-list" }] }],
  },
  {
    id: "actions", label: "Acciones de texto", summary: "Configura acciones y borradores, pero no ejecuta proveedores ni captura selección.", icon: "▣", group: "primary",
    search: [{ id: "actions-list", label: "Acciones de texto", summary: "Activar, duplicar o editar acciones", keywords: ["preset", "acción", "acciones", "texto", "duplicar", "modelo"], targetId: "settings-actions-list", relations: [{ label: "Ver atajos", sectionId: "hotkeys", targetId: "settings-hotkeys-list" }] }],
  },
  {
    id: "vocabulary", label: "Vocabulario y correcciones", summary: "Administra palabras personales y reemplazos del dictado, pero no altera acciones de texto.", icon: "✎", group: "primary",
    search: [{ id: "vocabulary-rules", label: "Vocabulario y correcciones", summary: "Vocabulario personal", keywords: ["palabra", "reemplazo", "corrección", "vocabulario"], targetId: "settings-vocabulary-rules" }],
  },
  {
    id: "application", label: "Aplicación", summary: "Controla inicio de Windows y apariencia del dock, pero no cambia el contenido del dictado.", icon: "⚙", group: "primary",
    search: [
      { id: "application-startup", label: "Iniciar con Windows", summary: "Abrir la aplicación al iniciar Windows", keywords: ["inicio", "windows", "autostart"], targetId: "settings-application-startup" },
      { id: "application-dock", label: "Dock", summary: "Mostrar al iniciar y elegir apariencia", keywords: ["dock", "skin", "apariencia", "densidad"], targetId: "settings-application-dock", relations: [{ label: "Configurar atajos", sectionId: "hotkeys", targetId: "settings-hotkeys-list" }] },
    ],
  },
  {
    id: "privacy", label: "Privacidad y datos", summary: "Explica datos locales y controles disponibles, pero no modifica datos sin una acción explícita.", icon: "◐", group: "utility",
    search: [{ id: "privacy-history", label: "Historial local", summary: "Consultar o borrar datos locales", keywords: ["privacidad", "historial", "borrar", "datos"], targetId: "settings-privacy-history" }],
  },
  {
    id: "help", label: "Ayuda", summary: "Muestra estado seguro y rutas de soporte, pero no expone diagnósticos sensibles.", icon: "?", group: "utility",
    search: [{ id: "help-status", label: "Ayuda", summary: "Estado e información segura", keywords: ["soporte", "estado", "versión"], targetId: "settings-help-status" }],
  },
  {
    id: "advanced", label: "Avanzado", summary: "Presenta estado efectivo redactado y accesos autorizados, pero no agrega autoridad ni secretos.", icon: "◇", group: "utility",
    search: [{ id: "advanced-diagnostics", label: "Diagnóstico", summary: "Información técnica redactada", keywords: ["avanzado", "diagnóstico", "control room"], targetId: "settings-advanced-diagnostics" }],
  },
];

export const settingsSearchIndex: readonly SettingsSearchTarget[] = settingsRegistry.flatMap((section) =>
  section.search.map((target) => ({ ...target, sectionId: section.id, sectionLabel: section.label })),
);

export function getSettingsSearchTarget(
  sectionId: SettingsSectionId,
  targetId: string,
): SettingsSearchTarget | undefined {
  return settingsSearchIndex.find((target) => target.sectionId === sectionId && target.targetId === targetId);
}

export function getSettingsSection(sectionId: SettingsSectionId): SettingsSectionDefinition {
  return settingsRegistry.find((section) => section.id === sectionId) ?? settingsRegistry[1];
}

export function isSettingsSectionId(value: string): value is SettingsSectionId {
  return settingsRegistry.some((section) => section.id === value);
}

export type SettingsDeepLink = {
  sectionId?: SettingsSectionId;
  target?: SettingsSearchTarget;
};

export function parseSettingsDeepLink(hash: string): SettingsDeepLink | undefined {
  if (hash === "#settings") return {};
  if (!hash.startsWith("#settings?")) return undefined;
  const params = new URLSearchParams(hash.slice("#settings?".length));
  const keys = [...params.keys()];
  if (keys.some((key) => key !== "section" && key !== "target")) return undefined;
  if (params.getAll("section").length !== 1 || params.getAll("target").length !== 1) return undefined;
  const section = params.get("section");
  const targetId = params.get("target");
  if (!section || !targetId || !isSettingsSectionId(section)) return undefined;
  const target = getSettingsSearchTarget(section, targetId);
  return target ? { sectionId: section, target } : undefined;
}

export function serializeSettingsDeepLink(target?: SettingsSearchTarget): string {
  if (!target) return "#settings";
  const registered = getSettingsSearchTarget(target.sectionId, target.targetId);
  if (!registered) return "#settings";
  const params = new URLSearchParams({ section: registered.sectionId, target: registered.targetId });
  return `#settings?${params.toString()}`;
}

