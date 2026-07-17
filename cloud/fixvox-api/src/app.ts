import type { FixvoxApiConfig } from "./config.ts";
import { createAllowlistLogger, requestId, type Logger } from "./observability.ts";
import { limitResponseBody, type ProviderProxy } from "./providers.ts";
import { handleAdminRoute, type AdminRouteDependencies } from "./routes/admin.ts";
import { buildDeviceRegisterProjection, buildExecutionPreflightProjection } from "./projections.ts";
import type { OAuthExchange } from "./oauth.ts";

export type DeviceRepository = {
  bindDevice(input: { installIdHash: string; suppliedDeviceId?: string | null; generatedDeviceId: string }): Promise<{ deviceId: string; created: boolean }>;
  resolveDevice(deviceId: string): Promise<{ deviceId: string } | null>;
  resolveEffectiveProfile(input: { deviceId: string; fallbackProfileId: string }): Promise<{ profileId: string; label: string; version: number; definition: Record<string, unknown>; source: string } | null>;
};

export type Readiness = {
  database(): Promise<boolean>;
  schema(): Promise<boolean>;
  jobs(): Promise<boolean>;
  authorityMode(): Promise<"cloudflare-authority" | "import-validation" | "canary" | "vps-authority" | "rollback">;
};

export type ApiDependencies = {
  config: FixvoxApiConfig;
  devices: DeviceRepository;
  providers: ProviderProxy;
  admin?: AdminRouteDependencies;
  preflight?: (input: { deviceId: string; usageKind?: string; estimate?: number; idempotencyKey: string }) => Promise<Record<string, unknown>>;
  feedback?: { submit(input: { classification: string; deviceId?: string | null }): Promise<string> };
  auth?: {
    createDesktopHandoff(input: { sessionHash: string; handoffHash: string; expiresAt: Date }): Promise<void>;
    readDesktopHandoff(handoffHash: string): Promise<{ sessionHash: string; expiresAt: Date } | null>;
    readDesktopStatus(sessionHash: string): Promise<{ status: string; expiresAt: Date; completedAt: Date | null } | null>;
    createOAuthState(input: { stateHash: string; provider: string; protectedMetadata: string; expiresAt: Date }): Promise<void>;
    attachDesktopOAuthState(sessionHash: string, stateHash: string): Promise<boolean>;
    readOAuthState(stateHash: string): Promise<{ provider: string; protectedMetadata: string | null } | null>;
    readOAuthResult(stateHash: string): Promise<{ status: string; subjectHash: string | null; error: string | null; googleVerifiedAt: Date | null } | null>;
    consumeOAuthState(stateHash: string): Promise<{ provider: string; protectedMetadata: string | null } | null>;
    completeOAuthState(stateHash: string, subjectHash: string, verifiedAt: Date): Promise<boolean>;
    failOAuthState(stateHash: string, error: string): Promise<boolean>;
    claimDesktopDevice(input: { sessionHash: string; deviceId: string; installIdHash: string }): Promise<{ deviceId: string; accountId: string } | null>;
  };
  oauth?: OAuthExchange;
  readiness: Readiness;
  logger?: Logger;
  now?: () => Date;
};

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(value, { status, headers });
}

function routeTemplate(pathname: string): string {
  if (pathname === "/health" || pathname === "/ready") return pathname;
  if (pathname.startsWith("/v2/device/")) return "/v2/device/:action";
  if (pathname.startsWith("/v2/execution/")) return "/v2/execution/:action";
  if (pathname.startsWith("/v1/audio/")) return "/v1/audio/:action";
  if (pathname.startsWith("/v1/chat/")) return "/v1/chat/:action";
  if (pathname.startsWith("/admin/")) return "/admin/*";
  return "/unknown";
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readJson(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, "request_too_large");
  if (!request.body) throw new HttpError(400, "invalid_json");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maxBytes) throw new HttpError(413, "request_too_large");
    chunks.push(next.value);
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(concat(chunks, total)));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not_object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function boundRequestBody(request: Request, maxBytes: number): Request {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, "request_too_large");
  if (!request.body) return request;
  let received = 0;
  const limited = request.body.pipeThrough(new TransformStream({
    transform(chunk: Uint8Array, controller) {
      received += chunk.byteLength;
      if (received > maxBytes) {
        controller.error(new HttpError(413, "request_too_large"));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
  return new Request(request, { body: limited });
}

export function createApiHandler(deps: ApiDependencies): (request: Request) => Promise<Response> {
  const logger = deps.logger ?? createAllowlistLogger();
  const now = deps.now ?? (() => new Date());

  return async (request) => {
    const started = performance.now();
    const id = requestId();
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return json({ error: "invalid_request", reason: "invalid_request" }, 400);
    }
    let response: Response;
    let code: string | undefined;
    try {
      response = await dispatch(request, url, deps, now);
    } catch (error) {
      if (error instanceof HttpError) {
        code = error.code;
        response = json({ error: error.code, reason: error.code }, error.status);
      } else if (error instanceof Error && error.message === "device_binding_conflict") {
        code = "device_binding_conflict";
        response = json({ error: "device_binding_conflict", code: "device_binding_conflict" }, 409);
      } else {
        code = "service_unavailable";
        response = json({ error: "service_unavailable", reason: "service_unavailable" }, 503);
      }
    }
    response.headers.set("X-Fixvox-Request-Id", id);
    logger.info({ requestId: id, route: routeTemplate(url.pathname), method: request.method, status: response.status, durationMs: Math.round(performance.now() - started), ...(code ? { code } : {}) });
    return response;
  };
}

async function dispatch(request: Request, url: URL, deps: ApiDependencies, now: () => Date): Promise<Response> {
  const admin = deps.admin ? await handleAdminRoute(request, url, deps.admin) : null;
  if (admin) return admin;
  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, service: "fixvox-api", date: now().toISOString() });
  }
  if (request.method === "GET" && url.pathname === "/ready") {
    const checks = await Promise.allSettled([deps.readiness.database(), deps.readiness.schema(), deps.readiness.jobs(), deps.readiness.authorityMode()]);
    const [database, schema, jobs] = checks.slice(0, 3).map((result) => result.status === "fulfilled" && result.value);
    const authorityMode = checks[3].status === "fulfilled" ? checks[3].value : null;
    const ready = database && schema && jobs && authorityMode !== null;
    return json({ ok: ready, database, schema, jobs, authorityMode }, ready ? 200 : 503);
  }
  if (request.method === "GET" && url.pathname === "/desktop/login") {
    if (!deps.auth) throw new HttpError(503, "service_unavailable");
    const state = url.searchParams.get("state")?.trim() ?? "";
    if (url.searchParams.get("flow") !== "device-code" || url.searchParams.get("client") !== "fixvox-tauri" || !state) return json({ error: { message: "Invalid desktop login request." } }, 400);
    const handoff = crypto.randomUUID();
    const expiresAt = new Date(now().getTime() + 5 * 60_000);
    await deps.auth.createDesktopHandoff({ sessionHash: await sha256(state), handoffHash: await sha256(handoff), expiresAt });
    return new Response(`<!doctype html><title>Fixvox Cloud sign-in is ready</title><a href="/desktop/google/start?handoff=${handoff}">Continue with Google</a>`, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (request.method === "GET" && url.pathname === "/desktop/google/start") {
    if (!deps.auth) throw new HttpError(503, "service_unavailable");
    const handoff = url.searchParams.get("handoff")?.trim() ?? "";
    const desktop = handoff ? await deps.auth.readDesktopHandoff(await sha256(handoff)) : null;
    if (!desktop) return new Response("<!doctype html><title>Expired desktop login</title>", { headers: { "content-type": "text/html; charset=utf-8" } });
    const state = crypto.randomUUID();
    const stateHash = await sha256(state);
    await deps.auth.createOAuthState({ stateHash, provider: "google", protectedMetadata: JSON.stringify({ desktop: true }), expiresAt: desktop.expiresAt });
    await deps.auth.attachDesktopOAuthState(desktop.sessionHash, stateHash);
    const redirectUri = new URL("/callback", deps.config.publicBaseUrl).toString();
    return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`, 302);
  }
  if (request.method === "GET" && url.pathname === "/desktop/login/status") {
    const state = url.searchParams.get("state")?.trim() ?? "";
    if (!state) return json({ error: { message: "Missing state query parameter." } }, 400);
    const status = deps.auth ? await deps.auth.readDesktopStatus(await sha256(state)) : null;
    if (!status) return json({ status: "not_found", message: "Unknown or expired desktop login state.", redacted: true }, 404);
    return json({ status: status.status === "completed" || status.status === "claimed" ? "success" : status.status, flow: "device-code", provider: status.status === "completed" || status.status === "claimed" ? "google" : null, expiresAt: status.expiresAt.toISOString(), redacted: true });
  }
  if (request.method === "POST" && url.pathname === "/desktop/login/link-device") {
    const body = await readJson(request, deps.config.maxRequestBytes);
    const state = typeof body.state === "string" ? body.state.trim() : "";
    if (!state) return json({ error: { message: "Missing desktop login state.", redacted: true } }, 400);
    const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
    const installId = typeof body.installId === "string" ? body.installId : "";
    if (!deviceId || !installId || !deps.auth) return json({ error: { message: "Unknown or expired desktop login state.", redacted: true } }, 404);
    const claimed = await deps.auth.claimDesktopDevice({ sessionHash: await sha256(state), deviceId, installIdHash: await sha256(installId) });
    if (!claimed) return json({ error: { message: "Desktop login is still pending.", redacted: true } }, 409);
    return json({ ok: true, deviceId: claimed.deviceId, accountId: null, auth: { required: false, providers: ["google"], accessMode: "signed_in", provider: "google", redacted: true } });
  }
  if (request.method === "GET" && url.pathname === "/auth/google/start") {
    if (!deps.auth) throw new HttpError(503, "service_unavailable");
    const deviceId = url.searchParams.get("device_id")?.trim() ?? "";
    const verifier = url.searchParams.get("code_verifier")?.trim() ?? "";
    if (!deviceId || verifier.length < 32) return json({ error: { message: !deviceId ? "Missing device_id query parameter." : "Missing or invalid code_verifier query parameter." } }, 400);
    const state = url.searchParams.get("state")?.trim() || crypto.randomUUID();
    await deps.auth.createOAuthState({ stateHash: await sha256(state), provider: "google", protectedMetadata: JSON.stringify({ deviceIdHash: await sha256(deviceId) }), expiresAt: new Date(now().getTime() + 5 * 60_000) });
    const redirectUri = new URL("/callback", deps.config.publicBaseUrl).toString();
    const authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    return url.searchParams.get("mode") === "json" ? json({ ok: true, state, authorizeUrl, redirectUri }) : Response.redirect(authorizeUrl, 302);
  }
  if (request.method === "GET" && url.pathname === "/auth/google/result") {
    const state = url.searchParams.get("state")?.trim() ?? "";
    const deviceId = url.searchParams.get("device_id")?.trim() ?? "";
    if (!state || !deviceId || !deps.auth) return json({ error: { message: "Missing state or device_id query parameter." } }, 400);
    const result = await deps.auth.readOAuthResult(await sha256(state));
    if (!result) return json({ status: "not_found", message: "Unknown or expired auth state." }, 404);
    return json({ status: result.status === "completed" ? "success" : result.status, state, deviceId });
  }
  if (request.method === "GET" && url.pathname === "/callback") {
    const state = url.searchParams.get("state")?.trim() ?? "";
    if (!state || !deps.auth || !deps.oauth) return new Response("<!doctype html><title>Expired login</title>", { headers: { "content-type": "text/html; charset=utf-8" } });
    const stateHash = await sha256(state);
    const claimed = await deps.auth.consumeOAuthState(stateHash);
    if (!claimed) return new Response("<!doctype html><title>Expired login</title>", { status: 400, headers: { "content-type": "text/html; charset=utf-8" } });
    if (url.searchParams.get("error")) await deps.auth.failOAuthState(stateHash, "oauth_denied");
    else {
      try { const identity = await deps.oauth.exchangeAndVerify({ code: url.searchParams.get("code")?.trim() ?? "" }); await deps.auth.completeOAuthState(stateHash, await sha256(identity.subject), identity.verifiedAt); }
      catch { await deps.auth.failOAuthState(stateHash, "token_exchange_failed"); }
    }
    return new Response("<!doctype html><title>Fixvox login result</title>", { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (request.method === "POST" && (url.pathname === "/v2/device/register" || url.pathname === "/v2/device/activate")) {
    const body = await readJson(request, deps.config.maxRequestBytes);
    const installId = typeof body.installId === "string" ? body.installId : null;
    if (!installId) throw new HttpError(400, "install_id_required");
    const suppliedDeviceId = typeof body.deviceId === "string" ? body.deviceId : null;
    const device = await deps.devices.bindDevice({ installIdHash: await sha256(installId), suppliedDeviceId, generatedDeviceId: crypto.randomUUID() });
    const profile = await deps.devices.resolveEffectiveProfile({ deviceId: device.deviceId, fallbackProfileId: "basic" });
    if (url.pathname === "/v2/device/activate") {
      return json({ ok: true, deviceId: device.deviceId, activated: true, policyId: profile?.profileId ?? "basic", policyLabel: profile?.label ?? "Basic" });
    }
    if (!profile) throw new HttpError(503, "service_unavailable");
    return json(buildDeviceRegisterProjection({ deviceId: device.deviceId, profile }));
  }
  if (request.method === "POST" && url.pathname === "/v2/execution/preflight") {
    const body = await readJson(request, deps.config.maxRequestBytes);
    const deviceId = typeof body.deviceId === "string" ? body.deviceId : null;
    if (!deviceId) throw new HttpError(400, "device_not_registered");
    if (!deps.preflight) throw new HttpError(503, "service_unavailable");
    const requestKey = request.headers.get("idempotency-key") ?? crypto.randomUUID();
    const result = await deps.preflight({
      deviceId,
      usageKind: typeof body.usageKind === "string" ? body.usageKind : undefined,
      estimate: typeof body.estimate === "number" ? body.estimate : undefined,
      idempotencyKey: requestKey,
    });
    const profile = await deps.devices.resolveEffectiveProfile({ deviceId, fallbackProfileId: "basic" });
    if (!profile) throw new HttpError(503, "service_unavailable");
    return json(buildExecutionPreflightProjection({
      allowed: result.allowed === true,
      reason: typeof result.reason === "string" ? result.reason : null,
      profile,
      usageKind: typeof body.usageKind === "string" ? body.usageKind : undefined,
    }));
  }
  if (request.method === "POST" && (url.pathname === "/v1/chat/completions" || url.pathname === "/v1/audio/transcriptions")) {
    const deviceId = request.headers.get("x-device-id");
    if (!deviceId) throw new HttpError(400, "device_id_required");
    const device = await deps.devices.resolveDevice(deviceId);
    if (!device) throw new HttpError(403, "device_not_registered");
    const profile = await deps.devices.resolveEffectiveProfile({ deviceId: device.deviceId, fallbackProfileId: "basic" });
    if (!profile) throw new HttpError(403, "profile_unavailable");
    const kind = url.pathname.includes("audio") ? "audio" : "chat";
    const engines = profile.definition.engines;
    const engine = engines && typeof engines === "object" && !Array.isArray(engines)
      ? (engines as Record<string, unknown>)[kind]
      : undefined;
    if (!engine || typeof engine !== "object" || Array.isArray(engine)) throw new HttpError(403, "engine_not_allowed");
    const timeout = AbortSignal.timeout(deps.config.requestTimeoutMs);
    const boundedRequest = boundRequestBody(request, deps.config.maxRequestBytes);
    const upstream = await deps.providers.proxy({
      kind,
      request: boundedRequest,
      signal: timeout,
      policy: { profileId: profile.profileId, engine: engine as Record<string, unknown> },
    });
    const headers = new Headers(upstream.headers);
    headers.delete("set-cookie");
    applyProviderContractHeaders(headers, kind, profile.profileId);
    return new Response(limitResponseBody(upstream.body, deps.config.maxRequestBytes), { status: upstream.status, headers });
  }
  if (request.method === "POST" && url.pathname === "/v2/telemetry/events/batch") {
    const body = await readJson(request, deps.config.maxRequestBytes);
    const events = Array.isArray(body.events) ? body.events : [];
    const acceptedIds = events.flatMap((event) => event && typeof event === "object" && typeof (event as Record<string, unknown>).id === "string" ? [(event as Record<string, string>).id] : []);
    return json({ ok: true, acceptedIds, received: acceptedIds.length });
  }
  if (request.method === "POST" && url.pathname === "/v2/feedback/submit") {
    const body = await readJson(request, deps.config.maxRequestBytes);
    const classification = typeof body.type === "string" ? body.type : "other";
    const deviceId = typeof body.deviceId === "string" ? body.deviceId : null;
    const id = deps.feedback ? await deps.feedback.submit({ classification, deviceId }) : "redacted";
    return json({ ok: true, id, ts: now().toISOString() });
  }
  return json({ error: { message: "Not found." } }, 404);
}

function applyProviderContractHeaders(headers: Headers, kind: "chat" | "audio", profileId: string): void {
  const set = (name: string, value: string) => { if (!headers.has(name)) headers.set(name, value); };
  set("server-timing", "fixvox;dur=0");
  set("x-fixvox-limit", "0");
  set("x-fixvox-remaining", "0");
  set("x-fixvox-reset-at", "redacted");
  set("x-fixvox-usage-key", "redacted");
  set("x-fixvox-pricing-source", "mock");
  set("x-fixvox-proxy-init-ms", "0");
  set("x-fixvox-proxy-parse-ms", "0");
  set("x-fixvox-proxy-upstream-ms", "0");
  set("x-fixvox-proxy-usage-ms", "0");
  set("x-fixvox-proxy-total-ms", "0");
  set("x-provider-request-id", "mock");
  if (kind === "chat") {
    set("x-fixvox-prompt-tokens", "0");
    set("x-fixvox-completion-tokens", "0");
    set("x-fixvox-total-tokens", "0");
    return;
  }
  set("x-fixvox-cost-usd", "0");
  set("x-fixvox-engine-id", "mock");
  set("x-fixvox-profile-id", profileId);
}
