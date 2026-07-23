import { describe, expect, test } from "bun:test";

type BoundaryViolation = {
  file: string;
  line: number;
  specifier: string;
};

declare const Bun: {
  Glob: new (pattern: string) => {
    scan(options: { cwd: string; absolute: boolean; onlyFiles: boolean }): AsyncIterable<string>;
  };
  file(path: string): { text(): Promise<string> };
};

async function findApiToProxyImports(): Promise<BoundaryViolation[]> {
  // @ts-expect-error import.meta.dir is provided by the Bun runtime.
  const sourceRoot = `${import.meta.dir}/../src`;
  const normalizedRoot = sourceRoot.replaceAll("\\", "/").replace(/\/$/, "");
  const glob = new Bun.Glob("**/*.ts");
  const violations: BoundaryViolation[] = [];

  for await (const absolutePath of glob.scan({ cwd: sourceRoot, absolute: true, onlyFiles: true })) {
    const source = await Bun.file(absolutePath).text();
    const normalizedPath = absolutePath.replaceAll("\\", "/");
    const relativePath = normalizedPath.startsWith(`${normalizedRoot}/`)
      ? normalizedPath.slice(normalizedRoot.length + 1)
      : normalizedPath.split("/").at(-1) ?? normalizedPath;
    const importPattern = /(?:from\s+|import\s*)["']([^"']*fixvox-proxy[^"']*)["']/g;
    for (const match of source.matchAll(importPattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      violations.push({ file: relativePath, line, specifier: match[1] });
    }
  }

  return violations.sort((left, right) =>
    left.file.localeCompare(right.file) || left.line - right.line || left.specifier.localeCompare(right.specifier),
  );
}

describe("F3R2 API product-owned dependency boundary", () => {
  test("keeps the API runtime dependency closure product-owned", async () => {
    expect(await findApiToProxyImports()).toEqual([]);
  });

  test("forbids runtime API imports from fixvox-proxy", async () => {
    expect(await findApiToProxyImports()).toEqual([]);
  });
});
