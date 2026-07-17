import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import {
  HTTP_CONTRACT_FIXTURES,
  NON_HTTP_CONTRACT_FIXTURES,
  fixturePathWithoutQuery,
  type ContractFixture,
} from "./fixtures";
import { assertFixtureRedactionGuard, summarizeRequest } from "./redaction";

function fixtureRoute(fixture: ContractFixture): string {
  return `${fixture.method} ${fixturePathWithoutQuery(fixture.path)}`;
}

describe("Fixvox Cloud Checkpoint A contract inventory", () => {
  test("has one explicit fixture for every exact Worker route", () => {
    const source = readFileSync(resolve(process.cwd(), "cloud/fixvox-proxy/src/index.ts"), "utf8");
    const sourcePaths = new Set(
      [...source.matchAll(/url\.pathname === ["'](\/[^"']+)["']/g)].map((match) => match[1]),
    );
    const fixturePaths = new Set(HTTP_CONTRACT_FIXTURES.map((fixture) => fixturePathWithoutQuery(fixture.path)));
    const missing = [...sourcePaths].filter((path) => !fixturePaths.has(path));

    expect(missing).toEqual([]);
    expect(HTTP_CONTRACT_FIXTURES.length).toBeGreaterThanOrEqual(60);
  });

  test("keeps fixture IDs unique while allowing explicit route scenarios and classifies every boundary", () => {
    const fixtureIds = HTTP_CONTRACT_FIXTURES.map((fixture) => fixture.id);
    const routes = HTTP_CONTRACT_FIXTURES.map(fixtureRoute);
    expect(new Set(fixtureIds).size).toBe(fixtureIds.length);
    expect(routes.filter((route) => route === "GET /desktop/login")).toHaveLength(2);
    expect(HTTP_CONTRACT_FIXTURES.every((fixture) => fixture.source === "worker.fetch" || fixture.source === "usage-counter.fetch")).toBe(true);
    expect(NON_HTTP_CONTRACT_FIXTURES).toEqual([
      expect.objectContaining({ id: "scheduled-maintenance", source: "worker.scheduled" }),
    ]);
  });

  test("records normalized request metadata without serializing request values", () => {
    for (const fixture of HTTP_CONTRACT_FIXTURES) {
      const summary = summarizeRequest(fixture);
      expect(summary.method).toBe(fixture.method);
      expect(summary.path).toBe(fixturePathWithoutQuery(fixture.path));
      expect(summary).not.toHaveProperty("body");
      expect(summary).not.toHaveProperty("authorization");
    }
  });

  test("rejects raw IDs, OAuth material, provider keys, text, and audio in evidence", () => {
    expect(() => assertFixtureRedactionGuard()).not.toThrow();
  });
});
