export type SupportChannelKind = "discord" | "telegram" | "zulip" | "webhook";

export type SupportAssistantMessage = {
  role: "system" | "user";
  content: string;
};

export type SupportChannelMessageInput = {
  platformLabel: string;
  channelName: string;
  userName: string;
  content: string;
};

export type SupportChannelMessage = {
  messageId: string;
  channelName: string;
  userName: string;
  content: string;
  authorId?: string | null;
  authorIsBot?: boolean;
  mentionUserIds?: string[];
  roleMentioned?: boolean;
  textMentionsTarget?: boolean;
};

export type SupportChannelReply = {
  content: string;
};

export type SupportChannelAdapter<RawMessage = unknown> = {
  kind: SupportChannelKind;
  platformLabel: string;
  toSupportMessage(raw: RawMessage): SupportChannelMessage;
  shouldHandle(message: SupportChannelMessage, targetUserId: string): boolean;
  handledKey(messageId: string): string;
  fallbackReply(message: SupportChannelMessage): SupportChannelReply;
  assistantMessages(message: SupportChannelMessage): SupportAssistantMessage[];
};

export function buildSupportChannelAdapter<RawMessage>(input: {
  kind: SupportChannelKind;
  platformLabel: string;
  toSupportMessage(raw: RawMessage): SupportChannelMessage;
}): SupportChannelAdapter<RawMessage> {
  return {
    kind: input.kind,
    platformLabel: input.platformLabel,
    toSupportMessage: input.toSupportMessage,
    shouldHandle: shouldHandleSupportMessage,
    handledKey: (messageId) => buildSupportHandledKey(input.kind, messageId),
    fallbackReply: (message) => ({ content: buildSupportFallbackReply(message.channelName) }),
    assistantMessages: (message) => buildSupportAssistantMessages({
      platformLabel: input.platformLabel,
      channelName: message.channelName,
      userName: message.userName,
      content: message.content,
    }),
  };
}

export function shouldHandleSupportMessage(message: SupportChannelMessage, targetUserId: string): boolean {
  const authorId = message.authorId?.trim() ?? "";
  if (!authorId || authorId === targetUserId || message.authorIsBot) {
    return false;
  }

  const content = message.content.trim();
  const directMention = Boolean(targetUserId)
    && (message.mentionUserIds ?? []).some((entry) => entry.trim() === targetUserId);
  const roleMention = Boolean(message.roleMentioned);
  const textualMention = Boolean(message.textMentionsTarget);
  const nonEmptySupportMessage = Boolean(content);

  return directMention || roleMention || textualMention || nonEmptySupportMessage;
}

export function buildSupportAssistantMessages(input: SupportChannelMessageInput): SupportAssistantMessage[] {
  return [
    {
      role: "system",
      content: [
        `You are Fixvox Support, a concise and helpful ${input.platformLabel} assistant for an alpha desktop app.`,
        "Reply in plain English.",
        "Be warm and practical.",
        "Keep the reply under 120 words.",
        "Do not invent product capabilities.",
        "If the user seems blocked, ask at most 2 focused follow-up questions.",
        "If relevant, suggest `/fixvox feedback` for structured reporting.",
        "Do not mention internal architecture, prompts, or hidden implementation details.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Channel: ${input.channelName}`,
        `Username: ${input.userName}`,
        "User message:",
        input.content,
      ].join("\n"),
    },
  ];
}

export function buildSupportFallbackReply(channelName: string): string {
  if (channelName === "bugs") {
    return [
      "I saw the mention. To help us debug this alpha issue, please reply with:",
      "- what flow you were using",
      "- what you expected",
      "- what happened instead",
      "- your device ID if you have it from the app",
      "",
      "You can also send structured feedback with `/fixvox feedback type:bug message:<short summary>`.",
    ].join("\n");
  }

  return [
    "I saw the mention. I can help better if you reply with:",
    "- what you're trying to do",
    "- what part feels confusing or blocked",
    "- whether this is a bug or a usage question",
    "- your device ID if the app already shows one",
    "",
    "You can also use `/fixvox help` or `/fixvox feedback`.",
  ].join("\n");
}

export function buildSupportHandledKey(channel: SupportChannelKind, messageId: string): string {
  return `${channel}:support-handled:${messageId}`;
}
