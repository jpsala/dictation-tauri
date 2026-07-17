declare const process: {
  exitCode?: number;
  once(signal: "SIGINT" | "SIGTERM", listener: () => void): void;
  removeListener(signal: "SIGINT" | "SIGTERM", listener: () => void): void;
};

declare namespace Bun {
  class CryptoHasher {
    constructor(algorithm: "sha256");
    update(input: string): this;
    digest(encoding: "hex"): string;
  }

  function file(path: string | URL): {
    text(): Promise<string>;
  };

  const stdout: unknown;
  const env: Record<string, string | undefined>;
  function write(destination: unknown, input: string): Promise<number>;
  type Server = { stop(closeActiveConnections?: boolean): void };
  function serve(options: { hostname: string; port: number; fetch(request: Request): Response | Promise<Response> }): Server;

  type SqlRow = Record<string, unknown>;
  class SQL {
    constructor(url: string);
    unsafe<T extends SqlRow = SqlRow>(query: string, parameters?: unknown[]): Promise<T[]>;
    begin<T>(operation: (transaction: SQL) => Promise<T>): Promise<T>;
    close(): Promise<void>;
  }
}
