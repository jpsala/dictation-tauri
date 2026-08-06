import type {
  NormalizedVocabularyText,
  TextSpan,
} from "./types";

const WHITE_SPACE = /\s/u;
const MARK = /\p{M}/gu;

function span(start: number, end: number): TextSpan {
  return Object.freeze({ start, end });
}

/**
 * Normalize text for deterministic vocabulary comparison while retaining the
 * original UTF-16 span for every canonical code unit.
 *
 * NFKD handles compatibility forms, lower-casing makes matching case
 * insensitive, combining marks are removed for accent-insensitive matching,
 * and Unicode whitespace runs become one ASCII space. Punctuation remains
 * significant: it can be outside a match ("max,"), but it is not silently
 * treated as a word separator inside a phrase.
 */
export function normalizeVocabularyText(
  original: string,
): NormalizedVocabularyText {
  const units: Array<{ value: string; source: TextSpan }> = [];

  for (let offset = 0; offset < original.length; ) {
    const codePoint = original.codePointAt(offset);
    if (codePoint === undefined) {
      break;
    }
    const width = codePoint > 0xffff ? 2 : 1;
    const raw = original.slice(offset, offset + width);
    const canonical = raw
      .normalize("NFKD")
      .toLowerCase()
      .normalize("NFKD")
      .replace(MARK, "");
    const source = span(offset, offset + width);

    for (let index = 0; index < canonical.length; index += 1) {
      units.push({ value: canonical[index], source });
    }
    offset += width;
  }

  const collapsed: Array<{ value: string; source: TextSpan }> = [];
  let whitespaceStart: number | undefined;
  let whitespaceEnd: number | undefined;

  const flushWhitespace = () => {
    if (whitespaceStart !== undefined && whitespaceEnd !== undefined) {
      collapsed.push({
        value: " ",
        source: span(whitespaceStart, whitespaceEnd),
      });
    }
    whitespaceStart = undefined;
    whitespaceEnd = undefined;
  };

  for (const unit of units) {
    if (WHITE_SPACE.test(unit.value)) {
      whitespaceStart ??= unit.source.start;
      whitespaceEnd = unit.source.end;
      continue;
    }
    flushWhitespace();
    collapsed.push(unit);
  }
  flushWhitespace();

  const normalized = collapsed.map((unit) => unit.value).join("");
  const spans = Object.freeze(collapsed.map((unit) => unit.source));

  return Object.freeze({
    original,
    normalized,
    spans,
    spanMap: spans,
  });
}

/** Alias kept for generic normalization consumers. */
export const normalizeText = normalizeVocabularyText;

/** Normalize a trigger and remove only outer whitespace. */
export function normalizeVocabularyTrigger(trigger: string): string {
  return normalizeVocabularyText(trigger).normalized.trim();
}

/** Translate a canonical range back to the original UTF-16 range. */
export function originalSpanForNormalizedRange(
  normalized: NormalizedVocabularyText,
  start: number,
  end: number,
): TextSpan | undefined {
  if (
    start < 0 ||
    end <= start ||
    end > normalized.spans.length ||
    !Number.isInteger(start) ||
    !Number.isInteger(end)
  ) {
    return undefined;
  }
  const first = normalized.spans[start];
  const last = normalized.spans[end - 1];
  if (!first || !last) {
    return undefined;
  }
  return span(first.start, last.end);
}
