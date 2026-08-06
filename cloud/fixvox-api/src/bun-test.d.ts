declare module "bun:test" {
  type TestBody = () => unknown | Promise<unknown>;
  type Suite = (name: string, body: TestBody) => void;

  type Matchers = {
    toBe(expected: unknown): void;
    toContain(expected: unknown): void;
    toEqual(expected: unknown): void;
    toHaveLength(expected: number): void;
    toMatch(expected: RegExp): void;
    toMatchObject(expected: Record<string, unknown>): void;
    toThrow(expected?: unknown): void;
    not: Matchers;
    rejects: Matchers;
    resolves: Matchers;
  };

  export const describe: Suite;
  export const test: Suite;
  export const afterAll: (body: TestBody) => void;
  export const beforeEach: (body: TestBody) => void;
  export function expect(actual: unknown): Matchers;
}
