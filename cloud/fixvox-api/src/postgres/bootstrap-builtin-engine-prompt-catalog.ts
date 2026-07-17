/// <reference path="../bun-runtime.d.ts" />

import { BUILTIN_CATALOG_VERSION, BUILTIN_ENGINES, BUILTIN_PROMPTS, builtinEngineCatalog, builtinPromptCatalog, createBuiltinCatalogManifest } from "../../../fixvox-core/src/control-plane/catalog.ts";

type BootstrapManifest = Readonly<{ catalogVersion: string; counts: Readonly<{ engines: number; prompts: number }>; ids: Readonly<{ engines: readonly string[]; prompts: readonly string[] }>; hashes: Readonly<{ engines: string; prompts: string }> }>;

function engineOptions(engine: typeof BUILTIN_ENGINES[number]) {
  return { schemaVersion: 1, catalogVersion: BUILTIN_CATALOG_VERSION, label: engine.label, tier: engine.tier, notes: engine.notes, promptKey: engine.promptKey, promptSummary: engine.promptSummary, source: engine.source };
}
function promptVersion(value: string): number { const match = /^v([1-9][0-9]*)$/.exec(value); if (!match) throw new Error("builtin_catalog_invalid_prompt_version"); return Number(match[1]); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort((left, right) => left.localeCompare(right)).map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function normalizeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
function sameJson(left: unknown, right: unknown): boolean { return stableJson(normalizeJson(left)) === stableJson(normalizeJson(right)); }

type BootstrapOptions = Readonly<{
  getDatabaseName?: (sql: Bun.SQL) => Promise<string | undefined>;
}>;

async function getDatabaseName(sql: Bun.SQL): Promise<string | undefined> {
  const database = await sql.unsafe<{ database_name: string }>("SELECT current_database() AS database_name");
  return database[0]?.database_name;
}

/** Explicit local-only bootstrap; never called by API startup. */
export async function bootstrapBuiltinEnginePromptCatalog(
  sql: Bun.SQL,
  { getDatabaseName: resolveDatabaseName = getDatabaseName }: BootstrapOptions = {},
): Promise<BootstrapManifest> {
  if (await resolveDatabaseName(sql) !== "fixvox_test") throw new Error("unsafe_test_database");
  await sql.begin(async (tx) => {
    await tx.unsafe("SELECT pg_advisory_xact_lock(91827401)");
    const engineIds = new Set(BUILTIN_ENGINES.map((engine) => engine.id));
    const promptIds = new Set(BUILTIN_PROMPTS.map((prompt) => prompt.id));
    const engines = (await tx.unsafe<{ engine_id: string; kind: string; provider: string; model: string; enabled: boolean; runtime_options: Record<string, unknown> }>("SELECT engine_id, kind, provider, model, enabled, runtime_options FROM engines")).filter((row) => engineIds.has(row.engine_id));
    const prompts = (await tx.unsafe<{ prompt_id: string; kind: string; body: string; enabled: boolean; version: number }>("SELECT prompt_id, kind, body, enabled, version FROM prompts")).filter((row) => promptIds.has(row.prompt_id));
    const byEngine = new Map(engines.map((row) => [row.engine_id, row]));
    const byPrompt = new Map(prompts.map((row) => [row.prompt_id, row]));
    for (const engine of BUILTIN_ENGINES) { const row = byEngine.get(engine.id); if (row && (row.kind !== engine.kind || row.provider !== engine.provider || row.model !== engine.model || row.enabled !== engine.enabled || !sameJson(row.runtime_options, engineOptions(engine)))) throw new Error(`builtin_catalog_conflict:engine:${engine.id}`); }
    for (const prompt of BUILTIN_PROMPTS) { const row = byPrompt.get(prompt.id); if (row && (row.kind !== prompt.kind || row.body !== prompt.body || row.enabled !== prompt.enabled || row.version !== promptVersion(prompt.version))) throw new Error(`builtin_catalog_conflict:prompt:${prompt.id}`); }
    for (const engine of BUILTIN_ENGINES) if (!byEngine.has(engine.id)) await tx.unsafe("INSERT INTO engines (engine_id, kind, provider, model, enabled, runtime_options) VALUES ($1,$2,$3,$4,$5,$6::jsonb)", [engine.id, engine.kind, engine.provider, engine.model, engine.enabled, JSON.stringify(engineOptions(engine))]);
    for (const prompt of BUILTIN_PROMPTS) if (!byPrompt.has(prompt.id)) await tx.unsafe("INSERT INTO prompts (prompt_id, kind, body, enabled, version) VALUES ($1,$2,$3,$4,$5)", [prompt.id, prompt.kind, prompt.body, prompt.enabled, promptVersion(prompt.version)]);
  });
  const [engines, prompts] = await Promise.all([createBuiltinCatalogManifest(builtinEngineCatalog()), createBuiltinCatalogManifest(builtinPromptCatalog())]);
  return Object.freeze({ catalogVersion: BUILTIN_CATALOG_VERSION, counts: Object.freeze({ engines: BUILTIN_ENGINES.length, prompts: BUILTIN_PROMPTS.length }), ids: Object.freeze({ engines: engines.ids.engine, prompts: prompts.ids.prompt }), hashes: Object.freeze({ engines: engines.hashes.engine, prompts: prompts.hashes.prompt }) });
}
