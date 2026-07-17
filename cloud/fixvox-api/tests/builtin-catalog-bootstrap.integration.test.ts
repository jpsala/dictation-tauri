/// <reference path="../src/bun-test.d.ts" />
/// <reference path="../src/bun-runtime.d.ts" />

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { BUILTIN_ENGINES, BUILTIN_PROMPTS } from "../../fixvox-core/src/control-plane/catalog.ts";
import { bootstrapBuiltinEnginePromptCatalog } from "../src/postgres/bootstrap-builtin-engine-prompt-catalog.ts";

const databaseUrl = Bun.env.FIXVOX_DATABASE_URL;
if (!databaseUrl) throw new Error("missing_FIXVOX_DATABASE_URL");
const sql = new Bun.SQL(databaseUrl);

async function reset(): Promise<void> {
  const database = await sql.unsafe<{ database_name: string }>("SELECT current_database() AS database_name");
  if (database[0]?.database_name !== "fixvox_test") throw new Error("unsafe_test_database");
  await sql.unsafe("TRUNCATE TABLE profile_engine_bindings, profile_prompt_bindings, engines, prompts RESTART IDENTITY CASCADE");
  await sql.unsafe("DELETE FROM control_plane_authority");
  await sql.unsafe("INSERT INTO control_plane_authority (mode, revision, changed_by) VALUES ('cloudflare-authority', 0, 'bootstrap-test')");
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("bootstrap_timeout")), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function expectRejection(operation: Promise<unknown>, expectedMessage: string): Promise<void> {
  let rejection: unknown;
  try {
    await operation;
  } catch (error) {
    rejection = error;
  }
  if (!(rejection instanceof Error)) throw new Error("expected_bootstrap_rejection");
  expect(rejection.message).toContain(expectedMessage);
}

beforeEach(reset);
afterAll(async () => {
  try {
    await reset();
  } finally {
    await sql.close();
  }
});

describe("built-in engine/prompt PostgreSQL bootstrap", () => {
  test("materializes canonical rows without changing v4 authority", async () => {
    const before = await sql.unsafe("SELECT mode, revision FROM control_plane_authority");
    const manifest = await bootstrapBuiltinEnginePromptCatalog(sql);
    const [engines, prompts] = await Promise.all([sql.unsafe<{ count: string }>("SELECT count(*)::text AS count FROM engines"), sql.unsafe<{ count: string }>("SELECT count(*)::text AS count FROM prompts")]);
    expect(engines[0]?.count).toBe(String(BUILTIN_ENGINES.length));
    expect(prompts[0]?.count).toBe(String(BUILTIN_PROMPTS.length));
    expect(manifest.counts).toEqual({ engines: BUILTIN_ENGINES.length, prompts: BUILTIN_PROMPTS.length });
    expect(await sql.unsafe("SELECT mode, revision FROM control_plane_authority")).toEqual(before);
  });

  test("is idempotent and preserves custom records", async () => {
    const first = await bootstrapBuiltinEnginePromptCatalog(sql);
    await sql.unsafe("INSERT INTO engines (engine_id, kind, provider, model, enabled, runtime_options) VALUES ('custom-engine', 'postprocess', 'custom', 'custom', true, '{}'::jsonb)");
    await sql.unsafe("INSERT INTO prompts (prompt_id, kind, body, enabled, version) VALUES ('custom-prompt', 'assistant', 'custom', true, 1)");
    const second = await bootstrapBuiltinEnginePromptCatalog(sql);
    expect(second).toEqual(first);
    expect((await sql.unsafe<{ count: string }>("SELECT count(*)::text AS count FROM engines WHERE engine_id = 'custom-engine'"))[0]?.count).toBe("1");
    expect((await sql.unsafe<{ count: string }>("SELECT count(*)::text AS count FROM prompts WHERE prompt_id = 'custom-prompt'"))[0]?.count).toBe("1");
  });

  test("fails closed and rolls back a conflicting engine", async () => {
    await sql.unsafe("INSERT INTO engines (engine_id, kind, provider, model, enabled, runtime_options) VALUES ('stt-off', 'transcription', 'wrong', 'off', false, '{}'::jsonb)");
    await expectRejection(bootstrapBuiltinEnginePromptCatalog(sql), "builtin_catalog_conflict:engine:stt-off");
    expect((await sql.unsafe<{ count: string }>("SELECT count(*)::text AS count FROM prompts"))[0]?.count).toBe("0");
  });

  test("fails closed and rolls back a conflicting prompt", async () => {
    await sql.unsafe("INSERT INTO prompts (prompt_id, kind, body, enabled, version) VALUES ('none', 'assistant', 'wrong', true, 1)");
    await expectRejection(bootstrapBuiltinEnginePromptCatalog(sql), "builtin_catalog_conflict:prompt:none");
    expect((await sql.unsafe<{ count: string }>("SELECT count(*)::text AS count FROM engines"))[0]?.count).toBe("0");
  });

  test("rejects a non-test database through the injected database-name seam", async () => {
    await expect(bootstrapBuiltinEnginePromptCatalog(sql, {
      getDatabaseName: async () => "not_fixvox_test",
    })).rejects.toThrow("unsafe_test_database");
  });

  test("serializes concurrent bootstraps across independent connections and returns a body-free manifest", async () => {
    const leftSql = new Bun.SQL(databaseUrl);
    const rightSql = new Bun.SQL(databaseUrl);
    try {
      const [left, right] = await withTimeout(
        Promise.all([
          bootstrapBuiltinEnginePromptCatalog(leftSql),
          bootstrapBuiltinEnginePromptCatalog(rightSql),
        ]),
        3_000,
      );
      expect(left).toEqual(right);
      const engineIds = BUILTIN_ENGINES.map((engine) => engine.id);
      const promptIds = BUILTIN_PROMPTS.map((prompt) => prompt.id);
      const engineParameters = engineIds.map((_, index) => `$${index + 1}`).join(", ");
      const promptParameters = promptIds.map((_, index) => `$${index + 1}`).join(", ");
      expect((await sql.unsafe<{ count: string }>(`SELECT count(*)::text AS count FROM engines WHERE engine_id IN (${engineParameters})`, engineIds))[0]?.count).toBe(String(BUILTIN_ENGINES.length));
      expect((await sql.unsafe<{ count: string }>(`SELECT count(*)::text AS count FROM prompts WHERE prompt_id IN (${promptParameters})`, promptIds))[0]?.count).toBe(String(BUILTIN_PROMPTS.length));
      expect((await sql.unsafe<{ acquired: boolean }>("SELECT pg_try_advisory_lock(91827401) AS acquired"))[0]?.acquired).toBe(true);
      await sql.unsafe("SELECT pg_advisory_unlock(91827401)");
      const serialized = JSON.stringify(left);
      expect(serialized).not.toContain(BUILTIN_PROMPTS[1]?.body ?? "");
      expect(serialized).not.toMatch(/secret|token|api[_-]?key|oauth|runtime_options/i);
    } finally {
      await Promise.all([leftSql.close(), rightSql.close()]);
    }
  });
});
