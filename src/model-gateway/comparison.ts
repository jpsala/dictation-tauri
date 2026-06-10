export const transcriptComparisonPolicy =
  "unicode-nfkc-lowercase-strip-punctuation-collapse-whitespace" as const;

export type TranscriptComparisonPolicy = typeof transcriptComparisonPolicy;

export type TranscriptComparisonResult = {
  policy: TranscriptComparisonPolicy;
  expected: {
    raw: string;
    normalized: string;
  };
  transcript: {
    raw: string;
    normalized: string;
  };
  exactMatch: boolean;
  normalizedMatch: boolean;
};

export function normalizeTranscriptForComparison(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compareTranscripts(
  expected: string,
  transcript: string,
): TranscriptComparisonResult {
  const normalizedExpected = normalizeTranscriptForComparison(expected);
  const normalizedTranscript = normalizeTranscriptForComparison(transcript);

  return {
    policy: transcriptComparisonPolicy,
    expected: {
      raw: expected,
      normalized: normalizedExpected,
    },
    transcript: {
      raw: transcript,
      normalized: normalizedTranscript,
    },
    exactMatch: expected === transcript,
    normalizedMatch: normalizedExpected === normalizedTranscript,
  };
}
