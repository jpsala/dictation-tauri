export type AssistantIntentResult =
  | { kind: "insertText"; text: string; reason?: string }
  | { kind: "notify"; message: string; level?: "info" | "success" | "warning" | "error" }
  | { kind: "quickChat"; initialUserText?: string; initialAssistantText?: string }
  | { kind: "showMarkdown"; title: string; markdown: string }
  | {
      kind: "optionPicker";
      title: string;
      prompt: string;
      options: Array<{ id: string; label: string; description?: string }>;
    }
  | { kind: "toolAction"; tool: string; args: Record<string, unknown>; confirmation?: "required" | "none" }
  | { kind: "error"; message: string; recoverable?: boolean };

export function isAssistantQuickChatHandoff(prompt: string): boolean {
  const normalized = normalizeAssistantIntentText(prompt);
  return /\b(quick chat|chat rapido|chat rapida|chat)\b/u.test(normalized)
    && /\b(abrir|abri|abre|open|seguir|segui|continua|continuar|continue|pasar|pasa|usar|usa|handoff)\b/u.test(normalized);
}

export function normalizeAssistantIntentText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}
