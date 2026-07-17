export const fixvoxProductCapabilities = [
  "translate",
  "dictation",
  "postprocess",
  "selection_transform",
  "assistant_actions",
  "custom_prompts",
  "advanced_settings",
  "debug_tools",
  "managed_stt",
  "managed_llm",
  "admin_settings",
] as const;

export type FixvoxProductCapability = (typeof fixvoxProductCapabilities)[number];

export type FixvoxPolicyTemplateId =
  | "basic-anonymous"
  | "translate-only"
  | "dictation-basic"
  | "pro"
  | "power-admin";

export type FixvoxUserAccessMode = "anonymous" | "signed_in";

export type FixvoxPolicyTemplate = {
  id: FixvoxPolicyTemplateId;
  label: string;
  accessMode: FixvoxUserAccessMode;
  capabilities: ReadonlySet<FixvoxProductCapability>;
  limits: {
    monthlyMinutes?: number;
    maxAudioSeconds?: number;
    dailyTranslations?: number;
  };
};

export type FixvoxRuntimeOperation =
  | "translate"
  | "dictation"
  | "postprocess"
  | "selection_transform"
  | "assistant_action";

export type FixvoxCapabilityCheck =
  | {
      allowed: true;
      required: FixvoxProductCapability[];
    }
  | {
      allowed: false;
      required: FixvoxProductCapability[];
      missing: FixvoxProductCapability[];
      error: "capability_not_allowed";
    };

export const fixvoxPolicyTemplates: Record<
  FixvoxPolicyTemplateId,
  FixvoxPolicyTemplate
> = {
  "basic-anonymous": {
    id: "basic-anonymous",
    label: "Basic anonymous",
    accessMode: "anonymous",
    capabilities: new Set<FixvoxProductCapability>(),
    limits: {
      dailyTranslations: 3,
      maxAudioSeconds: 0,
    },
  },
  "translate-only": {
    id: "translate-only",
    label: "Translate only",
    accessMode: "signed_in",
    capabilities: new Set<FixvoxProductCapability>(["translate", "managed_llm"]),
    limits: {
      dailyTranslations: 100,
    },
  },
  "dictation-basic": {
    id: "dictation-basic",
    label: "Dictation basic",
    accessMode: "signed_in",
    capabilities: new Set<FixvoxProductCapability>([
      "dictation",
      "postprocess",
      "managed_stt",
      "managed_llm",
    ]),
    limits: {
      monthlyMinutes: 300,
      maxAudioSeconds: 90,
    },
  },
  pro: {
    id: "pro",
    label: "Pro",
    accessMode: "signed_in",
    capabilities: new Set<FixvoxProductCapability>([
      "translate",
      "dictation",
      "postprocess",
      "selection_transform",
      "assistant_actions",
      "custom_prompts",
      "advanced_settings",
      "managed_stt",
      "managed_llm",
    ]),
    limits: {
      monthlyMinutes: 1_500,
      maxAudioSeconds: 180,
      dailyTranslations: 500,
    },
  },
  "power-admin": {
    id: "power-admin",
    label: "Power / Admin",
    accessMode: "signed_in",
    capabilities: new Set<FixvoxProductCapability>(fixvoxProductCapabilities),
    limits: {
      monthlyMinutes: 10_000,
      maxAudioSeconds: 600,
      dailyTranslations: 5_000,
    },
  },
};

export const requiredCapabilitiesByOperation: Record<
  FixvoxRuntimeOperation,
  FixvoxProductCapability[]
> = {
  translate: ["translate", "managed_llm"],
  dictation: ["dictation", "managed_stt"],
  postprocess: ["postprocess", "managed_llm"],
  selection_transform: ["selection_transform", "managed_llm"],
  assistant_action: ["assistant_actions", "managed_llm"],
};

export function getFixvoxPolicyTemplate(
  id: FixvoxPolicyTemplateId,
): FixvoxPolicyTemplate {
  return fixvoxPolicyTemplates[id];
}

export function checkFixvoxCapability(
  template: Pick<FixvoxPolicyTemplate, "capabilities">,
  operation: FixvoxRuntimeOperation,
): FixvoxCapabilityCheck {
  const required = requiredCapabilitiesByOperation[operation];
  const missing = required.filter((capability) => !template.capabilities.has(capability));

  if (missing.length === 0) {
    return { allowed: true, required };
  }

  return {
    allowed: false,
    required,
    missing,
    error: "capability_not_allowed",
  };
}

export function serializeFixvoxPolicyTemplate(
  template: FixvoxPolicyTemplate,
): {
  id: FixvoxPolicyTemplateId;
  label: string;
  accessMode: FixvoxUserAccessMode;
  capabilities: FixvoxProductCapability[];
  limits: FixvoxPolicyTemplate["limits"];
} {
  return {
    id: template.id,
    label: template.label,
    accessMode: template.accessMode,
    capabilities: [...template.capabilities],
    limits: template.limits,
  };
}
