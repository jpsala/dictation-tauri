import type { FixvoxApiConfig } from "./config.ts";

export function startServer(config: FixvoxApiConfig, handler: (request: Request) => Promise<Response>): { stop(): void } {
  const server = Bun.serve({ hostname: config.host, port: config.port, fetch: handler });
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    server.stop(true);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return { stop };
}
