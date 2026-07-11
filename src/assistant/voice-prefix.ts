const DEFAULT_ASSISTANT_WAKE_WORDS = ["assistant", "asistente", "ai", "zuno", "lulu"];

export type AssistantVoicePrefixResult =
  | { kind: "not-assistant" }
  | { kind: "invalid-assistant"; reason: string }
  | { kind: "assistant"; prompt: string; wakeWord: string };

export function resolveAssistantWakeWords(configValue = ""): string[] {
  const parsed = configValue
    .split(/[\n,|]/u)
    .map((entry) => normalizeWakeWord(entry))
    .filter(Boolean);
  const base = parsed.length > 0 ? parsed : DEFAULT_ASSISTANT_WAKE_WORDS;
  return expandWakeWordAliases(uniqueByNormalized(base));
}

export function parseAssistantVoicePrefix(
  transcript: string,
  options: { wakeWords?: readonly string[]; wakeWordsConfig?: string } = {},
): AssistantVoicePrefixResult {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return { kind: "not-assistant" };
  }

  const wakeWords = options.wakeWords
    ? [...options.wakeWords]
    : resolveAssistantWakeWords(options.wakeWordsConfig ?? "");
  const match = extractPrefixedBody(trimmed, wakeWords);
  if (!match) {
    return { kind: "not-assistant" };
  }

  if (!match.body.trim()) {
    return {
      kind: "invalid-assistant",
      reason: "Missing assistant prompt after prefix.",
    };
  }

  return {
    kind: "assistant",
    prompt: match.body,
    wakeWord: match.wakeWord,
  };
}

function extractPrefixedBody(
  transcript: string,
  prefixes: readonly string[],
): { wakeWord: string; body: string } | null {
  const normalizedTranscript = normalizeForMatch(transcript);
  const sortedPrefixes = [...prefixes]
    .map((prefix) => prefix.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const prefix of sortedPrefixes) {
    const normalizedPrefix = normalizeForMatch(prefix);
    if (!normalizedPrefix || !normalizedTranscript.startsWith(normalizedPrefix)) {
      continue;
    }

    const head = transcript.slice(0, prefix.length);
    if (normalizeForMatch(head) !== normalizedPrefix) {
      continue;
    }

    const boundaryChar = normalizedTranscript.slice(normalizedPrefix.length, normalizedPrefix.length + 1);
    if (boundaryChar && /[a-z0-9_]/u.test(boundaryChar)) {
      continue;
    }

    return {
      wakeWord: prefix,
      body: transcript.slice(prefix.length).replace(/^[\s:,-]+/u, "").trim(),
    };
  }

  return null;
}

function expandWakeWordAliases(wakeWords: string[]): string[] {
  const expanded = [...wakeWords];
  const seen = new Set(expanded.map((entry) => normalizeForMatch(entry)));
  if (seen.has("lulu") && !seen.has("ludo")) {
    expanded.push("ludo");
  }
  return expanded;
}

function uniqueByNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const key = normalizeForMatch(value);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

function normalizeWakeWord(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

function normalizeForMatch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLowerCase();
}
