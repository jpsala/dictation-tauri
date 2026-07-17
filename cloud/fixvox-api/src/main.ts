import { composeApi } from "./composition.ts";
import { startServer } from "./server.ts";

const api = composeApi();
const server = startServer(api.config, api.handler);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { void api.close(); });
}

void server;
