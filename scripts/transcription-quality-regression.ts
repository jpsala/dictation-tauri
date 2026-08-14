import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { stableCanonicalJson } from "./transcription-quality-artifacts";

export type RegressionMetric = { readonly path: string; readonly baseline: number; readonly candidate: number; readonly maxRegression: number };
export type RegressionDecision = { readonly passed: boolean; readonly reasons: readonly string[]; readonly metrics: readonly RegressionMetric[] };

function getNumber(value: unknown, path: string): number | undefined {
  let cursor: unknown = value;
  for (const part of path.split(".")) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === "number" && Number.isFinite(cursor) ? cursor : undefined;
}
function lowerIsBetter(path: string): boolean {
  return /(?:^|\.)(?:wer|cer|omissions|additions|translationDrift|intentDrift|falseReplacements)$/.test(path);
}


export function evaluateTranscriptionRegression(
  baseline: unknown,
  candidate: unknown,
  policy: Readonly<Record<string, number>> = {},
): RegressionDecision {
  const metrics: RegressionMetric[] = [];
  const reasons: string[] = [];
  for (const [path, maxRegression] of Object.entries(policy).sort(([a], [b]) => a.localeCompare(b))) {
    const before = getNumber(baseline, path); const after = getNumber(candidate, path);
    if (before === undefined || after === undefined || !Number.isFinite(maxRegression) || maxRegression < 0) {
      reasons.push(`missing_metric:${path}`); continue;
    }
    const metric = { path, baseline: before, candidate: after, maxRegression };
    metrics.push(metric);
    const regression = lowerIsBetter(path)
      ? after > before + maxRegression
      : after < before - maxRegression;
    if (regression) reasons.push(`regression:${path}`);
  }
  return { passed: reasons.length === 0, reasons, metrics };
}

const PUBLIC_KEYS = new Set(["schemaVersion", "runId", "candidateId", "baselineRunId", "sampleCount", "counts", "scores", "status", "decision", "reasons", "metrics", "dimensions", "path", "baseline", "candidate", "maxRegression"]);
const TEXT_KEYS = /text|transcript|prompt|gold|raw|final|word|segment|privateRef/i;
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (TEXT_KEYS.test(key) || !PUBLIC_KEYS.has(key)) continue;
    out[key] = redact(child);
  }
  return out;
}
export function createDeterministicDriftReport(input: { baseline: unknown; candidate: unknown; regression: RegressionDecision }): Record<string, unknown> {
  return redact({ schemaVersion: 1, decision: input.regression.passed ? "pass" : "fail", reasons: input.regression.reasons, metrics: input.regression.metrics, baseline: input.baseline, candidate: input.candidate }) as Record<string, unknown>;
}
export function renderDeterministicDriftReport(input: Parameters<typeof createDeterministicDriftReport>[0]): string {
  return `${stableCanonicalJson(createDeterministicDriftReport(input))}\n`;
}

export type ShadowOptions<T> = { readonly optIn?: boolean; readonly run: () => T | Promise<T> };
export async function runLocalShadow<T>({ optIn = false, run }: ShadowOptions<T>): Promise<{ readonly status: "off" | "completed"; readonly result?: T }> {
  if (!optIn) return { status: "off" };
  return { status: "completed", result: await run() };
}

export type RetentionOptions = { readonly workspaceRoot?: string; readonly dryRun?: boolean; readonly promotedPrivateRefs?: readonly string[]; readonly keepRunIds?: readonly string[] };
export type RetentionPlan = { readonly dryRun: boolean; readonly preserved: readonly string[]; readonly removed: readonly string[] };
const PRESERVED = new Set(["run.json", "results.jsonl", "summary.json"]);
export async function planTranscriptionQualityRetention(options: RetentionOptions = {}): Promise<RetentionPlan> {
  const root = options.workspaceRoot ?? join(process.cwd(), "artifacts", "transcription-quality");
  const dryRun = options.dryRun !== false; const preserved: string[] = []; const removed: string[] = [];
  if (!existsSync(root)) return { dryRun, preserved, removed };
  const keep = new Set((options.keepRunIds ?? []).map(String));
  const promoted = new Set((options.promotedPrivateRefs ?? []).map((x) => x.replaceAll("\\", "/")));
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || keep.has(entry.name)) { preserved.push(entry.name); continue; }
    const runRoot = join(root, entry.name);
    for (const file of await readdir(runRoot, { recursive: true })) {
      const path = String(file); const normalized = path.replaceAll("\\", "/");
      const keepFile = PRESERVED.has(normalized) || normalized.startsWith("private/") && promoted.has(`${entry.name}/${normalized}`);
      (keepFile ? preserved : removed).push(`${entry.name}/${normalized}`);
      if (!keepFile && !dryRun) await rm(join(runRoot, ...path.split(/[\\/]/)), { recursive: true, force: true });
    }
  }
  return { dryRun, preserved: preserved.sort(), removed: removed.sort() };
}
