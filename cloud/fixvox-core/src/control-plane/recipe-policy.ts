import { cloneJsonValue, type JsonRecord } from "./policy-values.ts";

export type RecipePolicyEnvelope = {
  policy: JsonRecord;
  updatedAt: string;
};

export type RecipePolicyReadResult = RecipePolicyEnvelope & {
  source: "default" | "stored";
};

const RECOMMENDED_ALPHA_RECIPE_POLICY: JsonRecord = {
  version: "alpha-default-2026-03-27",
  defaultRecipeId: "polished-dictation",
  recipes: [
    {
      id: "polished-dictation",
      label: "Polished Dictation",
      sttPrompt: "",
      postProcessPrompt: "",
      controls: {
        usePostProcess: true,
        removeFillers: true,
        fixPunctuation: true,
        preserveExactWording: true,
        allowMeaningRecovery: true,
        keepConversationalTone: false,
        preferShortMessages: false,
        preferCompleteSentences: false,
        preferParagraphs: false,
        preserveTechnicalTerms: false,
      },
    },
    {
      id: "work-chat",
      label: "Work Chat",
      sttPrompt: "",
      postProcessPrompt: "",
      controls: {
        usePostProcess: true,
        removeFillers: true,
        fixPunctuation: true,
        preserveExactWording: true,
        allowMeaningRecovery: true,
        keepConversationalTone: true,
        preferShortMessages: true,
        preferCompleteSentences: false,
        preferParagraphs: false,
        preserveTechnicalTerms: false,
      },
    },
    {
      id: "email-compose",
      label: "Email Compose",
      sttPrompt: "",
      postProcessPrompt: "",
      controls: {
        usePostProcess: true,
        removeFillers: true,
        fixPunctuation: true,
        preserveExactWording: true,
        allowMeaningRecovery: true,
        keepConversationalTone: false,
        preferShortMessages: false,
        preferCompleteSentences: true,
        preferParagraphs: false,
        preserveTechnicalTerms: false,
      },
    },
    {
      id: "docs-writing",
      label: "Docs Writing",
      sttPrompt: "",
      postProcessPrompt: "",
      controls: {
        usePostProcess: true,
        removeFillers: true,
        fixPunctuation: true,
        preserveExactWording: true,
        allowMeaningRecovery: true,
        keepConversationalTone: false,
        preferShortMessages: false,
        preferCompleteSentences: false,
        preferParagraphs: true,
        preserveTechnicalTerms: false,
      },
    },
    {
      id: "coding-dictation",
      label: "Coding Dictation",
      sttPrompt: "",
      postProcessPrompt: "",
      controls: {
        usePostProcess: true,
        removeFillers: true,
        fixPunctuation: true,
        preserveExactWording: true,
        allowMeaningRecovery: true,
        keepConversationalTone: false,
        preferShortMessages: false,
        preferCompleteSentences: false,
        preferParagraphs: false,
        preserveTechnicalTerms: true,
      },
    },
  ],
  contextMappings: [
    {
      id: "work-chat",
      label: "Work Chat",
      enabled: true,
      priority: 60,
      recipeId: "work-chat",
      match: {
        processNames: ["slack.exe", "teams.exe", "ms-teams.exe", "discord.exe"],
        processPathIncludes: [],
        titleIncludes: ["slack", "teams", "discord", "chat"],
        classNames: [],
      },
    },
    {
      id: "email-compose",
      label: "Email Compose",
      enabled: true,
      priority: 55,
      recipeId: "email-compose",
      match: {
        processNames: ["outlook.exe", "olk.exe", "thunderbird.exe"],
        processPathIncludes: [],
        titleIncludes: ["gmail", "outlook", "inbox", "mail"],
        classNames: [],
      },
    },
    {
      id: "docs-writing",
      label: "Docs Writing",
      enabled: false,
      priority: 40,
      recipeId: "docs-writing",
      match: {
        processNames: ["notion.exe", "obsidian.exe"],
        processPathIncludes: [],
        titleIncludes: ["notion", "google docs", "confluence", "document"],
        classNames: [],
      },
    },
    {
      id: "coding-dictation",
      label: "Coding Dictation",
      enabled: true,
      priority: 45,
      recipeId: "coding-dictation",
      match: {
        processNames: [
          "code.exe",
          "cursor.exe",
          "windsurf.exe",
          "webstorm64.exe",
          "pycharm64.exe",
          "idea64.exe",
          "devenv.exe",
          "powershell.exe",
          "windowsterminal.exe",
        ],
        processPathIncludes: [],
        titleIncludes: ["visual studio code", "cursor", "terminal"],
        classNames: [],
      },
    },
  ],
};

export function buildDefaultRecipePolicy(): JsonRecord {
  return cloneJsonValue(RECOMMENDED_ALPHA_RECIPE_POLICY);
}
