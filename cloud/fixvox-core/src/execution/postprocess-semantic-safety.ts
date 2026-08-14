export const POSTPROCESS_SEMANTIC_SAFETY_REASONS = [
  "empty_candidate",
  "material_omission",
  "unsupported_addition",
  "semantic_transformation",
  "comparison_limit_exceeded",
] as const;

export type PostprocessSemanticSafetyReason = typeof POSTPROCESS_SEMANTIC_SAFETY_REASONS[number];

export type PostprocessSemanticSafetyReceipt = Readonly<{
  decision: "accepted" | "fallback";
  reasons: readonly PostprocessSemanticSafetyReason[];
  alignment: Readonly<{
    rawTokenCount: number;
    candidateTokenCount: number;
    matched: number;
    omissions: number;
    additions: number;
    trailingOmissions: number;
  }>;
  redacted: true;
}>;

export type PostprocessSemanticSafetyResult = Readonly<{
  text: string;
  receipt: PostprocessSemanticSafetyReceipt;
}>;
const CLEAR_FILLERS: Readonly<Record<string, true>> = { ah: true, eh: true, em: true, erm: true, hmm: true, mhm: true, uh: true, um: true };
const MAX_ALIGNED_TOKENS = 512;
const SPOKEN_NUMBERS: Readonly<Record<string, string>> = {
  cero: "0", zero: "0",
  uno: "1", una: "1", one: "1", primero: "1", primera: "1", first: "1",
  dos: "2", two: "2", segundo: "2", segunda: "2", second: "2",
  tres: "3", three: "3", tercero: "3", tercera: "3", third: "3",
  cuatro: "4", four: "4", cuarto: "4", cuarta: "4", fourth: "4",
  cinco: "5", five: "5", quinto: "5", quinta: "5", fifth: "5",
  seis: "6", six: "6", sexto: "6", sexta: "6", sixth: "6",
  siete: "7", seven: "7", septimo: "7", septima: "7", seventh: "7",
  ocho: "8", eight: "8", octavo: "8", octava: "8", eighth: "8",
  nueve: "9", nine: "9", noveno: "9", novena: "9", ninth: "9",
  diez: "10", ten: "10", decimo: "10", decima: "10", tenth: "10",
};

type AlignmentOperation = "match" | "omit" | "add";
type AlignmentCell = Readonly<{ cost: number; operation: AlignmentOperation }>;

function normalizeToken(token: string): string {
  const normalized = token.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
  return SPOKEN_NUMBERS[normalized] ?? normalized;
}

function semanticTokens(text: string): string[] {
  return (text.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [])
    .map(normalizeToken)
    .filter((token) => CLEAR_FILLERS[token] !== true);
}
function tokenEditDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function tokensMatch(left: string, right: string): boolean {
  if (left === right) return true;
  return Math.min(left.length, right.length) >= 5 && tokenEditDistance(left, right) <= 1;
}

function alignTokens(raw: readonly string[], candidate: readonly string[]): PostprocessSemanticSafetyReceipt["alignment"] {
  const matrix: AlignmentCell[][] = Array.from({ length: raw.length + 1 }, () => []);
  matrix[0][0] = { cost: 0, operation: "match" };
  for (let row = 1; row <= raw.length; row += 1) matrix[row][0] = { cost: row, operation: "omit" };
  for (let column = 1; column <= candidate.length; column += 1) matrix[0][column] = { cost: column, operation: "add" };

  for (let row = 1; row <= raw.length; row += 1) {
    for (let column = 1; column <= candidate.length; column += 1) {
      if (tokensMatch(raw[row - 1], candidate[column - 1])) {
        matrix[row][column] = { cost: matrix[row - 1][column - 1].cost, operation: "match" };
        continue;
      }
      const omission = matrix[row - 1][column].cost + 1;
      const addition = matrix[row][column - 1].cost + 1;
      matrix[row][column] = omission <= addition
        ? { cost: omission, operation: "omit" }
        : { cost: addition, operation: "add" };
    }
  }

  let row = raw.length;
  let column = candidate.length;
  let matched = 0;
  let omissions = 0;
  let additions = 0;
  let trailingOmissions = 0;
  let candidateTailReached = true;
  while (row > 0 || column > 0) {
    const operation = matrix[row][column].operation;
    if (operation === "match") {
      matched += 1;
      row -= 1;
      column -= 1;
      candidateTailReached = false;
    } else if (operation === "omit") {
      omissions += 1;
      if (candidateTailReached) trailingOmissions += 1;
      row -= 1;
    } else {
      additions += 1;
      column -= 1;
    }
  }

  return {
    rawTokenCount: raw.length,
    candidateTokenCount: candidate.length,
    matched,
    omissions,
    additions,
    trailingOmissions,
  };
}

export function evaluatePostprocessSemanticSafety(rawTranscript: string, candidatePostprocess: string): PostprocessSemanticSafetyResult {
  const rawTokens = semanticTokens(rawTranscript);
  const candidateTokens = semanticTokens(candidatePostprocess);
  if (rawTokens.length > MAX_ALIGNED_TOKENS || candidateTokens.length > MAX_ALIGNED_TOKENS) {
    return {
      text: rawTranscript,
      receipt: {
        decision: "fallback",
        reasons: ["comparison_limit_exceeded"],
        alignment: {
          rawTokenCount: rawTokens.length,
          candidateTokenCount: candidateTokens.length,
          matched: 0,
          omissions: rawTokens.length,
          additions: candidateTokens.length,
          trailingOmissions: rawTokens.length,
        },
        redacted: true,
      },
    };
  }
  const alignment = alignTokens(rawTokens, candidateTokens);
  const reasons: PostprocessSemanticSafetyReason[] = [];
  if (candidateTokens.length === 0) reasons.push("empty_candidate");
  if (alignment.omissions > 0) reasons.push("material_omission");
  if (alignment.additions > 0) reasons.push("unsupported_addition");
  const coverage = alignment.matched / Math.max(1, rawTokens.length);
  if ((alignment.omissions > 0 && alignment.additions > 0) || coverage < 0.5) {
    reasons.push("semantic_transformation");
  }
  const decision = reasons.length === 0 ? "accepted" : "fallback";
  return {
    text: decision === "accepted" ? candidatePostprocess : rawTranscript,
    receipt: { decision, reasons, alignment, redacted: true },
  };
}
