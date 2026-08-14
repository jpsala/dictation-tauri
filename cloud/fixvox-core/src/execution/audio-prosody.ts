export type TimestampedWord = Readonly<{
  word: string;
  start: number;
  end: number;
}>;

function timestampedWords(value: unknown): TimestampedWord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const word = (candidate as Record<string, unknown>).word;
    const start = (candidate as Record<string, unknown>).start;
    const end = (candidate as Record<string, unknown>).end;
    if (
      typeof word !== "string" || !word.trim() ||
      typeof start !== "number" || !Number.isFinite(start) ||
      typeof end !== "number" || !Number.isFinite(end) || end < start
    ) return [];
    return [{ word, start, end }];
  });
}

function expectedWordDurationMs(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-záéíóúüñ]/g, "");
  const syllables = Math.max(1, cleaned.match(/[aeiouáéíóúü]+/g)?.length ?? 1);
  return Math.max(150, Math.min(500, syllables * 200));
}

/**
 * Port of Fixvox's canonical word-timestamp prosody heuristic. The result is
 * private prompt context for the same authenticated runtime client, not audit
 * metadata or telemetry.
 */
export function buildProsodyHints(value: unknown): string | undefined {
  const words = timestampedWords(value);
  if (!words.length) return undefined;

  const pauses: string[] = [];
  let estimatedSpeechSeconds = 0;
  for (const word of words) {
    const expectedMs = expectedWordDurationMs(word.word);
    estimatedSpeechSeconds += expectedMs / 1000;
    const durationMs = (word.end - word.start) * 1000;
    if (durationMs <= expectedMs * 2.5) continue;
    const pauseMs = Math.round(durationMs - expectedMs);
    const suggestion = pauseMs >= 1500
      ? "might indicate new paragraph/topic"
      : pauseMs >= 800
        ? "might indicate sentence break"
        : pauseMs >= 400
          ? "might indicate comma or brief pause"
          : null;
    if (suggestion) pauses.push(`- After "${word.word}": ~${pauseMs}ms pause → ${suggestion}`);
  }
  if (!pauses.length) return undefined;

  const rawDurationSeconds = words.at(-1)!.end - words[0].start;
  const estimatedSilenceMs = Math.round(Math.max(0, rawDurationSeconds - estimatedSpeechSeconds) * 1000);
  return [
    "\n---",
    "Prosody signals (use as guidance, not rules):",
    "The speaker paused at these points. Consider them as hints for punctuation,",
    "but prioritize semantic context and natural flow over strict duration thresholds.",
    "",
    ...pauses,
    `\n(${pauses.length} pause(s) detected, ~${estimatedSilenceMs}ms total silence)`,
    "Use these signals alongside context to place punctuation naturally.",
  ].join("\n");
}
