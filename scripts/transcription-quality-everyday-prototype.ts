import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

import { evaluatePostprocessSemanticSafety } from "../cloud/fixvox-core/src/execution/postprocess-semantic-safety";
import { stableCanonicalJson } from "./transcription-quality-artifacts";

export const EVERYDAY_SCHEMA_VERSION = 1;
export const DEFAULT_EVERYDAY_LIMIT = 18;
export const MAX_ADJUDICATION_CASES = 12;

export type EverydayCategory =
  | "message"
  | "note"
  | "question"
  | "brief-explanation"
  | "list"
  | "spoken-correction"
  | "fillers-repetition"
  | "rioplatense";

export type EverydaySourceConfig = Readonly<{
  id: string;
  kind: "fixvox" | "wispr" | "microphone-artifacts";
  databasePath: string;
}>;

export type EverydayDiscoveredEntry = Readonly<{
  sourceId: string;
  sourceRecordId: string;
  provenance: Readonly<Record<string, string | number | boolean | null>>;
  rawText: string;
  finalText: string;
  audioPath: string | null;
  createdAt: string | null;
}>;

export type EverydayClassifiedEntry = EverydayDiscoveredEntry & Readonly<{
  contentHash: string;
  categories: readonly EverydayCategory[];
  everydayScore: number;
  technicalPenalty: number;
}>;

export type EverydayAdjudicationChoice = "raw" | "final" | "equivalent" | "reject";

export type EverydayAdjudicationDecision = Readonly<{
  sampleId: string;
  choice: EverydayAdjudicationChoice;
}>;

async function fileSha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

type SqliteDatabase = Readonly<{
  query(sql: string): Readonly<{ all(): unknown[] }>;
  close(): void;
}>;

type BunSqliteModule = Readonly<{
  Database: new (path: string, options: { readonly: boolean; strict: boolean }) => SqliteDatabase;
}>;

async function openReadonlyDatabase(path: string): Promise<SqliteDatabase> {
  const specifier = "bun:sqlite";
  const moduleValue: unknown = await import(/* @vite-ignore */ specifier);
  if (!moduleValue || typeof moduleValue !== "object" || !("Database" in moduleValue)) {
    throw new Error("Bun SQLite runtime is unavailable");
  }
  // Bun's virtual module has no Node-visible type declaration; validate the export above.
  const sqliteModule = moduleValue as BunSqliteModule;
  return new sqliteModule.Database(path, { readonly: true, strict: true });
}

const normalize = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const countMatches = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;
const punctuationCount = (text: string): number => countMatches(text, /[.,;:!?¿¡]/gu);
const words = (text: string): string[] => text.toLocaleLowerCase("es").match(/[\p{L}\p{N}]+/gu) ?? [];

export function classifyEverydayText(rawText: string, finalText: string): Readonly<{
  categories: readonly EverydayCategory[];
  everydayScore: number;
  technicalPenalty: number;
}> {
  const raw = normalize(rawText);
  const final = normalize(finalText);
  const combined = `${raw}\n${final}`;
  const categories = new Set<EverydayCategory>();
  const wordCount = words(raw).length;

  if (/\?\s*$|\b(qué|que|cómo|como|cuándo|cuando|dónde|donde|por qué|porque|podés|podes|puede[sn]?)\b/iu.test(combined)) categories.add("question");
  if (/^(hola|buenas|buen día|buen dia|che\b)|\b(gracias|avisame|decime|mandame|te paso|te cuento|nos vemos)\b/iu.test(combined)) categories.add("message");
  if (/\b(nota|recordar|acordarme|pendiente|idea|anotar)\b/iu.test(combined)) categories.add("note");
  if (/\b(primero|segundo|tercero|uno|dos|tres|lista|punto|guion)\b|(?:^|\n)\s*[-*•\d]+[.)]?\s/mu.test(combined)) categories.add("list");
  if (/\b(no,? (?:perdón|perdon)|mejor dicho|quise decir|corrijo|bah|digo)\b/iu.test(raw)) categories.add("spoken-correction");
  if (/\b(eh|em|este|bueno|o sea|digamos|mmm|ah)\b/iu.test(raw) || /\b([\p{L}]{2,})\s+\1\b/iu.test(raw)) categories.add("fillers-repetition");
  if (/\b(che|vos|sos|tenés|tenes|querés|queres|podés|podes|decime|avisame|mandame|acá|aca|dale|laburo)\b/iu.test(combined)) categories.add("rioplatense");
  if (wordCount >= 12 && wordCount <= 90 && !categories.has("list")) categories.add("brief-explanation");

  const technicalPenalty =
    countMatches(combined, /(?:[A-Za-z]:\\|\/[\w.-]+\/|\.\w{1,5}\b|https?:\/\/|\b(?:GPT|Claude|Whisper|Groq|OpenAI|Llama|npm|bun|cargo|model(?:o)?|prompt|API|JSON|SQL|TypeScript|Rust)\b)/giu) * 3
    + countMatches(combined, /[`{}_]|--\w+/gu);
  const everydayScore = categories.size * 4 + (wordCount >= 4 && wordCount <= 80 ? 4 : 0) + (raw !== final ? 2 : 0) - technicalPenalty;
  return { categories: [...categories].sort(), everydayScore, technicalPenalty };
}

function usableEverydayCount(entries: readonly EverydayDiscoveredEntry[]): number {
  const hashes = new Set<string>();
  for (const entry of entries) {
    const rawText = normalize(entry.rawText);
    const finalText = normalize(entry.finalText);
    if (!rawText || !finalText) continue;
    const classification = classifyEverydayText(rawText, finalText);
    if (classification.categories.length > 0 && classification.technicalPenalty <= 6) {
      hashes.add(sha256(`${rawText}\0${finalText}`));
    }
  }
  return hashes.size;
}

export function deduplicateAndSelect(
  entries: readonly EverydayDiscoveredEntry[],
  limit = DEFAULT_EVERYDAY_LIMIT,
): readonly EverydayClassifiedEntry[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 24) throw new Error("Everyday corpus limit must be between 1 and 24");
  const unique = new Map<string, EverydayClassifiedEntry>();
  for (const entry of entries) {
    const rawText = normalize(entry.rawText);
    const finalText = normalize(entry.finalText);
    if (!rawText || !finalText) continue;
    const contentHash = sha256(`${rawText}\0${finalText}`);
    const classified = { ...entry, rawText, finalText, contentHash, ...classifyEverydayText(rawText, finalText) };
    const current = unique.get(contentHash);
    if (!current || (classified.audioPath && !current.audioPath)) unique.set(contentHash, classified);
  }
  const ranked = [...unique.values()].filter((entry) => entry.categories.length > 0 && entry.technicalPenalty <= 6).sort((left, right) =>
    right.everydayScore - left.everydayScore
    || Number(Boolean(right.audioPath)) - Number(Boolean(left.audioPath))
    || left.contentHash.localeCompare(right.contentHash));
  const selected: EverydayClassifiedEntry[] = [];
  const categoryCounts = new Map<EverydayCategory, number>();
  const targetAudioCount = Math.min(Math.ceil(limit / 3), ranked.filter((entry) => entry.audioPath).length);
  while (selected.length < Math.min(limit, ranked.length)) {
    const forceAudio = selected.filter((entry) => entry.audioPath).length < targetAudioCount;
    const remaining = ranked.filter((entry) => !selected.includes(entry) && (!forceAudio || entry.audioPath));
    if (!remaining.length) break;
    remaining.sort((left, right) => {
      const leftCoverage = Math.min(...left.categories.map((category) => categoryCounts.get(category) ?? 0));
      const rightCoverage = Math.min(...right.categories.map((category) => categoryCounts.get(category) ?? 0));
      return leftCoverage - rightCoverage || right.everydayScore - left.everydayScore || left.contentHash.localeCompare(right.contentHash);
    });
    const picked = remaining[0]!;
    selected.push(picked);
    for (const category of picked.categories) categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }
  return selected;
}

async function readFixvox(databasePath: string, sourceId: string): Promise<EverydayDiscoveredEntry[]> {
  const database = await openReadonlyDatabase(databasePath);
  try {
    const rows = database.query(`SELECT id, transcript, output_text, audio_path, created_at, source, preset_id, recipe_id, recipe_source, policy_version, outcome FROM executions WHERE trim(coalesce(transcript, '')) <> '' AND trim(coalesce(output_text, '')) <> ''`).all() as Record<string, unknown>[];
    return rows.map((row) => {
      const recordedAudioPath = normalize(row.audio_path);
      return {
        sourceId, sourceRecordId: String(row.id), rawText: normalize(row.transcript), finalText: normalize(row.output_text),
        audioPath: recordedAudioPath && existsSync(recordedAudioPath) ? recordedAudioPath : null, createdAt: normalize(row.created_at) || null,
        provenance: { pipeline: "fixvox", source: normalize(row.source), presetId: normalize(row.preset_id) || null, recipeId: normalize(row.recipe_id) || null, recipeSource: normalize(row.recipe_source) || null, policyVersion: normalize(row.policy_version) || null, outcome: normalize(row.outcome) || null },
      };
    });
  } finally { database.close(); }
}

async function readWispr(databasePath: string, sourceId: string): Promise<EverydayDiscoveredEntry[]> {
  const database = await openReadonlyDatabase(databasePath);
  try {
    const rows = database.query(`SELECT transcriptEntityId, asrText, formattedText, editedText, pastedText, timestamp, audio, builtInAudio, opusChunks, appVersion, usedFallbackAsr, usedFallbackFormatting, transcriptOrigin FROM History WHERE trim(coalesce(asrText, '')) <> '' AND trim(coalesce(formattedText, '')) <> ''`).all() as Record<string, unknown>[];
    return rows.map((row) => ({
      sourceId, sourceRecordId: String(row.transcriptEntityId), rawText: normalize(row.asrText), finalText: normalize(row.editedText) || normalize(row.pastedText) || normalize(row.formattedText),
      audioPath: null, createdAt: normalize(row.timestamp) || null,
      provenance: { pipeline: "wispr-flow", appVersion: normalize(row.appVersion), usedFallbackAsr: Boolean(row.usedFallbackAsr), usedFallbackFormatting: Boolean(row.usedFallbackFormatting), transcriptOrigin: normalize(row.transcriptOrigin) || null, embeddedAudioObserved: Boolean(row.audio || row.builtInAudio || row.opusChunks) },
    }));
  } finally { database.close(); }
}

async function readMicrophoneArtifacts(root: string, sourceId: string): Promise<EverydayDiscoveredEntry[]> {
  const reportRoot = join(root, "reports");
  const transcriptRoot = join(root, "transcripts");
  const audioRoot = join(root, "audio");
  const entries: EverydayDiscoveredEntry[] = [];
  for (const reportName of (await readdir(reportRoot)).filter((name) => name.endsWith(".json")).sort()) {
    const runId = reportName.slice(0, -5);
    try {
      const reportValue: unknown = JSON.parse(await readFile(join(reportRoot, reportName), "utf8"));
      if (!reportValue || typeof reportValue !== "object" || !("status" in reportValue) || reportValue.status !== "ok") continue;
      const transcript = normalize(await readFile(join(transcriptRoot, `${runId}.txt`), "utf8"));
      if (!transcript) continue;
      const reportedAudioPath = "audioPath" in reportValue ? normalize(reportValue.audioPath) : "";
      const joinedAudioPath = join(audioRoot, `${runId}.wav`);
      const postProcess = "postProcess" in reportValue && reportValue.postProcess && typeof reportValue.postProcess === "object"
        ? reportValue.postProcess
        : null;
      const postProcessEnabled = postProcess && "enabled" in postProcess ? Boolean(postProcess.enabled) : false;
      const postProcessRan = postProcess && "ran" in postProcess ? Boolean(postProcess.ran) : false;
      entries.push({
        sourceId,
        sourceRecordId: runId,
        rawText: transcript,
        finalText: transcript,
        audioPath: reportedAudioPath && existsSync(reportedAudioPath) ? reportedAudioPath : joinedAudioPath,
        createdAt: null,
        provenance: {
          pipeline: "dictation-tauri-microphone-capture",
          status: "ok",
          postProcessEnabled,
          postProcessRan,
          rawFinalRelation: "identical-no-postprocess",
          redactedReport: "redacted" in reportValue ? Boolean(reportValue.redacted) : null,
        },
      });
    } catch {
      // Missing/corrupt report, transcript or join: excluded by the discovery contract.
    }
  }
  return entries;
}

export async function discoverEverydayEntries(sources: readonly EverydaySourceConfig[]): Promise<readonly EverydayDiscoveredEntry[]> {
  const groups = await Promise.all(sources.map((source) => {
    if (source.kind === "fixvox") return readFixvox(source.databasePath, source.id);
    if (source.kind === "wispr") return readWispr(source.databasePath, source.id);
    return readMicrophoneArtifacts(source.databasePath, source.id);
  }));
  return groups.flat();
}


async function existingAudio(path: string | null): Promise<string | null> {
  if (!path) return null;
  try { return (await stat(path)).isFile() ? path : null; } catch { return null; }
}

export async function runEverydayPrototype(options: Readonly<{
  workspaceRoot?: string;
  sources: readonly EverydaySourceConfig[];
  limit?: number;
  runId?: string;
}>): Promise<Readonly<{ runId: string; artifactRoot: string; usableCount: number; selectedCount: number; queueCount: number }>> {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const discovered = await discoverEverydayEntries(options.sources);
  const selected = deduplicateAndSelect(discovered, options.limit ?? DEFAULT_EVERYDAY_LIMIT);
  const sourceFingerprints = await Promise.all(options.sources.map(async (source) => {
    if (source.kind !== "microphone-artifacts") return { id: source.id, kind: source.kind, sha256: await fileSha256(source.databasePath), bytes: (await stat(source.databasePath)).size };
    const sourceEntries = discovered.filter((entry) => entry.sourceId === source.id);
    return { id: source.id, kind: source.kind, sha256: sha256(stableCanonicalJson(sourceEntries.map((entry) => sha256(`${entry.rawText}\0${entry.finalText}`)).sort())), bytes: null };
  }));
  const deterministicId = sha256(stableCanonicalJson({ schemaVersion: EVERYDAY_SCHEMA_VERSION, sources: sourceFingerprints, selected: selected.map((entry) => entry.contentHash) })).slice(0, 12);
  const runId = options.runId ?? `everyday-prototype-${deterministicId}`;
  const root = join(workspaceRoot, "artifacts", "transcription-quality", runId);
  const privateRoot = join(root, "private");
  await mkdir(privateRoot, { recursive: true });

  const publicResults: Record<string, unknown>[] = [];
  const privateCases: Record<string, unknown>[] = [];
  for (const [index, entry] of selected.entries()) {
    const sampleId = `everyday-${String(index + 1).padStart(2, "0")}-${entry.contentHash.slice(0, 10)}`;
    const samplePrivateRoot = join(privateRoot, sampleId);
    await mkdir(samplePrivateRoot, { recursive: true });
    const rawRef = join("artifacts", "transcription-quality", runId, "private", sampleId, "raw.txt").replaceAll("\\", "/");
    const finalRef = join("artifacts", "transcription-quality", runId, "private", sampleId, "final.txt").replaceAll("\\", "/");
    await writeFile(resolve(workspaceRoot, rawRef), `${entry.rawText}\n`, "utf8");
    await writeFile(resolve(workspaceRoot, finalRef), `${entry.finalText}\n`, "utf8");
    const audioSource = await existingAudio(entry.audioPath);
    let audioRef: string | null = null;
    let audioHash: string | null = null;
    if (audioSource) {
      audioHash = await fileSha256(audioSource);
      const filename = `audio${extname(audioSource).toLocaleLowerCase() || ".bin"}`;
      audioRef = join("artifacts", "transcription-quality", runId, "private", sampleId, filename).replaceAll("\\", "/");
      await copyFile(audioSource, resolve(workspaceRoot, audioRef));
    }
    const safety = evaluatePostprocessSemanticSafety(entry.rawText, entry.finalText);
    const signal = {
      preservation: safety.receipt,
      punctuation: { raw: punctuationCount(entry.rawText), final: punctuationCount(entry.finalText), changed: punctuationCount(entry.rawText) !== punctuationCount(entry.finalText) },
      question: { inferred: entry.categories.includes("question"), finalMarked: /\?\s*$/u.test(entry.finalText) },
      list: { inferred: entry.categories.includes("list"), finalStructured: /(?:^|\n)\s*[-*•\d]+[.)]?\s/mu.test(entry.finalText) },
      spokenCorrection: { inferred: entry.categories.includes("spoken-correction"), changed: entry.rawText !== entry.finalText },
      fillersRepetition: { inferred: entry.categories.includes("fillers-repetition"), changed: entry.rawText !== entry.finalText },
    };
    publicResults.push({ schemaVersion: EVERYDAY_SCHEMA_VERSION, sampleId, contentHash: entry.contentHash, sourceId: entry.sourceId, sourceRecordHash: sha256(entry.sourceRecordId), provenance: entry.provenance, categories: entry.categories, evidence: { audio: audioRef ? "audio-raw-final" : "raw-final", finalStatus: "historical-final-unadjudicated", rawRef, rawSha256: sha256(entry.rawText), rawLength: entry.rawText.length, finalRef, finalSha256: sha256(entry.finalText), finalLength: entry.finalText.length, audioRef, audioSha256: audioHash }, signals: signal });
    privateCases.push({ sampleId, sourceId: entry.sourceId, sourceRecordId: entry.sourceRecordId, categories: entry.categories, raw: entry.rawText, final: entry.finalText, decision: safety.receipt.decision, reasons: safety.receipt.reasons, rawRef, finalRef, audioRef });
  }

  const discriminant = [...privateCases].sort((left, right) => {
    const leftValue = (left.decision === "fallback" ? 100 : 0) + (left.categories as unknown[]).length;
    const rightValue = (right.decision === "fallback" ? 100 : 0) + (right.categories as unknown[]).length;
    return rightValue - leftValue || String(left.sampleId).localeCompare(String(right.sampleId));
  }).slice(0, MAX_ADJUDICATION_CASES);
  const categoryCounts = Object.fromEntries([...new Set(selected.flatMap((entry) => entry.categories))].sort().map((category) => [category, selected.filter((entry) => entry.categories.includes(category)).length]));
  const decisionCounts = Object.fromEntries(["accepted", "fallback"].map((decision) => [decision, publicResults.filter((result) => (result.signals as { preservation: { decision: string } }).preservation.decision === decision).length]));
  const reasonCounts: Record<string, number> = {};
  for (const result of publicResults) for (const reason of (result.signals as { preservation: { reasons: string[] } }).preservation.reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  const availabilityCounts = Object.fromEntries(["audio-raw-final", "raw-final"].map((kind) => [kind, publicResults.filter((result) => (result.evidence as { audio: string }).audio === kind).length]));
  const relativeSourceRefs = options.sources.map((source) => ({ id: source.id, kind: source.kind, snapshot: sourceFingerprints.find((item) => item.id === source.id) }));
  const manifest = { schemaVersion: EVERYDAY_SCHEMA_VERSION, runId, providerCalls: { enabled: false, count: 0 }, selection: { deterministic: true, requestedLimit: options.limit ?? DEFAULT_EVERYDAY_LIMIT, selectedCount: selected.length, excludedOnly: ["empty", "corrupt", "duplicate", "non-everyday-priority", "technical-dominated"] }, sources: relativeSourceRefs, samples: publicResults.map((result) => ({ sampleId: result.sampleId, contentHash: result.contentHash, sourceId: result.sourceId, categories: result.categories, evidence: result.evidence })) };
  const sourceCounts = Object.fromEntries(options.sources.map((source) => [source.id, discovered.filter((entry) => entry.sourceId === source.id).length]));
  const summary = { schemaVersion: EVERYDAY_SCHEMA_VERSION, runId, redacted: true, providerCalls: 0, discoveredCount: discovered.length, sourceCounts, usableCount: usableEverydayCount(discovered), selectedCount: selected.length, categoryCounts, availabilityCounts, decisionCounts, reasonCounts, adjudicationQueue: discriminant.map((item) => ({ sampleId: item.sampleId, sourceId: item.sourceId, categories: item.categories, decision: item.decision, reasons: item.reasons, privateRef: join("artifacts", "transcription-quality", runId, "private", "adjudication-queue.json").replaceAll("\\", "/") })) };
  await writeFile(join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(join(root, "results.jsonl"), publicResults.map((result) => stableCanonicalJson(result)).join("\n") + "\n", "utf8");
  await writeFile(join(root, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(join(privateRoot, "adjudication-queue.json"), `${JSON.stringify({ schemaVersion: EVERYDAY_SCHEMA_VERSION, runId, finalStatus: "historical-final-unadjudicated", cases: discriminant }, null, 2)}\n`, "utf8");
  return { runId, artifactRoot: relative(workspaceRoot, root).replaceAll("\\", "/"), usableCount: Number(summary.usableCount), selectedCount: selected.length, queueCount: discriminant.length };
}


export async function applyEverydayAdjudication(options: Readonly<{
  workspaceRoot?: string;
  runId: string;
  decisions: readonly EverydayAdjudicationDecision[];
}>): Promise<Readonly<{ runId: string; approvedCount: number; rejectedCount: number; choiceCounts: Record<EverydayAdjudicationChoice, number> }>> {
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/iu.test(options.runId)) throw new Error("Invalid everyday adjudication run ID");
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const root = join(workspaceRoot, "artifacts", "transcription-quality", options.runId);
  const privateRoot = join(root, "private");
  const queue = JSON.parse(await readFile(join(privateRoot, "adjudication-queue.json"), "utf8")) as {
    schemaVersion: number;
    runId: string;
    cases: Array<{
      sampleId: string;
      raw: string;
      final: string;
      rawRef: string;
      finalRef: string;
    }>;
  };
  if (queue.schemaVersion !== EVERYDAY_SCHEMA_VERSION || queue.runId !== options.runId || !Array.isArray(queue.cases)) {
    throw new Error("Everyday adjudication queue identity mismatch");
  }
  const casesById = new Map(queue.cases.map((item) => [item.sampleId, item]));
  if (casesById.size !== queue.cases.length) throw new Error("Everyday adjudication queue contains duplicate sample IDs");
  if (options.decisions.length !== queue.cases.length) throw new Error("Everyday adjudication must decide every queued sample exactly once");

  const seen = new Set<string>();
  const privateResults = options.decisions.map((decision) => {
    if (seen.has(decision.sampleId)) throw new Error(`Duplicate everyday adjudication decision: ${decision.sampleId}`);
    seen.add(decision.sampleId);
    const queued = casesById.get(decision.sampleId);
    if (!queued) throw new Error(`Unknown everyday adjudication sample: ${decision.sampleId}`);
    if (!["raw", "final", "equivalent", "reject"].includes(decision.choice)) {
      throw new Error(`Invalid everyday adjudication choice: ${String(decision.choice)}`);
    }
    if (decision.choice === "equivalent" && queued.raw !== queued.final) {
      throw new Error(`Equivalent choice requires byte-identical raw/final text: ${decision.sampleId}`);
    }
    const approved = decision.choice !== "reject";
    const referenceKind = decision.choice === "final" ? "final" : "raw";
    const referenceText = referenceKind === "final" ? queued.final : queued.raw;
    const referenceRef = referenceKind === "final" ? queued.finalRef : queued.rawRef;
    return {
      sampleId: decision.sampleId,
      choice: decision.choice,
      status: approved ? "approved-preference-reference" : "rejected",
      referenceKind: approved ? referenceKind : null,
      referenceRef: approved ? referenceRef : null,
      referenceSha256: approved ? sha256(referenceText) : null,
    };
  });
  if ([...casesById.keys()].some((sampleId) => !seen.has(sampleId))) {
    throw new Error("Everyday adjudication omitted a queued sample");
  }

  const choiceCounts: Record<EverydayAdjudicationChoice, number> = { raw: 0, final: 0, equivalent: 0, reject: 0 };
  for (const result of privateResults) choiceCounts[result.choice as EverydayAdjudicationChoice] += 1;
  const approvedCount = privateResults.length - choiceCounts.reject;
  const publicSummary = {
    schemaVersion: EVERYDAY_SCHEMA_VERSION,
    runId: options.runId,
    redacted: true,
    providerCalls: 0,
    finalStatus: "human-adjudicated",
    approvedCount,
    rejectedCount: choiceCounts.reject,
    choiceCounts,
    samples: privateResults.map(({ sampleId, choice, status, referenceKind, referenceSha256 }) => ({
      sampleId, choice, status, referenceKind, referenceSha256,
    })),
  };
  await writeFile(join(privateRoot, "adjudication.json"), `${JSON.stringify({
    ...publicSummary,
    redacted: false,
    samples: privateResults,
  }, null, 2)}\n`, "utf8");
  await writeFile(join(root, "adjudication-summary.json"), `${JSON.stringify(publicSummary, null, 2)}\n`, "utf8");
  return { runId: options.runId, approvedCount, rejectedCount: choiceCounts.reject, choiceCounts };
}

function defaultSources(): EverydaySourceConfig[] {
  const roaming = process.env.APPDATA;
  if (!roaming) throw new Error("APPDATA is required for default local discovery");
  return [
    { id: "dictation-tauri-microphone", kind: "microphone-artifacts", databasePath: join(roaming, "dictation-tauri", "artifacts", "microphone-capture") },
    { id: "fixvox-main", kind: "fixvox", databasePath: join(roaming, "fixvox", "main.db") },
    { id: "wispr-flow", kind: "wispr", databasePath: join(roaming, "Wispr Flow", "flow.sqlite") },
  ];
}

function readArgument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

if (import.meta.main) {
  if (process.argv.includes("--allow-provider-call")) throw new Error("Batch 3E is provider-free and rejects provider authorization flags");
  const adjudicationPath = readArgument("adjudication");
  if (adjudicationPath) {
    const input = JSON.parse(await readFile(resolve(adjudicationPath), "utf8")) as {
      schemaVersion: number;
      runId: string;
      decisions: EverydayAdjudicationDecision[];
    };
    if (input.schemaVersion !== EVERYDAY_SCHEMA_VERSION || !Array.isArray(input.decisions)) {
      throw new Error("Invalid everyday adjudication input");
    }
    console.log(JSON.stringify(await applyEverydayAdjudication({ runId: input.runId, decisions: input.decisions })));
  } else {
    const limitArgument = readArgument("limit");
    const result = await runEverydayPrototype({ sources: defaultSources(), limit: limitArgument ? Number(limitArgument) : DEFAULT_EVERYDAY_LIMIT, runId: readArgument("run-id") });
    console.log(JSON.stringify(result));
  }
}
