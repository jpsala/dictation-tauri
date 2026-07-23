import type { BudgetLedgerPort, BudgetReserveDecision } from "../../fixvox-core/src/ports/budget-ledger.ts";
import type { BudgetShadowEvidence, LegacyBudgetDecision } from "../../fixvox-core/src/execution/budget-shadow.ts";
import { compareBudgetLedgerShadow } from "../../fixvox-core/src/execution/budget-shadow.ts";
import type { FixvoxApiConfig } from "./config.ts";
import type { BudgetPricingPort } from "./postgres/budget-pricing-repository.ts";
import { createAllowlistLogger, requestId, type Logger } from "./observability.ts";
import { limitResponseBody, type ProviderProxy } from "./providers.ts";
import { handleAdminRoute, type AdminRouteDependencies } from "./routes/admin.ts";
import { buildDeviceRegisterProjection, buildExecutionPreflightProjection } from "./projections.ts";
import type { OAuthExchange } from "./oauth.ts";

export type DeviceRepository = {
  bindDevice(input: { installIdHash: string; suppliedDeviceId?: string | null; generatedDeviceId: string }): Promise<{ deviceId: string; created: boolean }>;
  resolveDevice(deviceId: string): Promise<{
    deviceId: string;
    accountBudget?: { dailyMicrousd: number | null; monthlyMicrousd: number | null; mode: "block" | "warn" | null } | null;
  } | null>;
  resolveEffectiveProfile(input: { deviceId: string; fallbackProfileId: string }): Promise<{ profileId: string; label: string; version: number; definition: Record<string, unknown>; source: string } | null>;
};

export type Readiness = {
  database(): Promise<boolean>;
  schema(): Promise<boolean>;
  jobs(): Promise<boolean>;
  authorityMode(): Promise<"cloudflare-authority" | "import-validation" | "canary" | "vps-authority" | "rollback">;
};

export type RuntimeQuota = {
  reserve(input: {
    idempotencyKey: string; accountId?: string | null; deviceId: string; usageKind: string;
    amount: number; limit: number | null; windowStart: Date; expiresAt: Date; unlimited?: boolean;
  }): Promise<{ allowed: boolean; reservationId: string | null; idempotent: boolean }>;
  consume(input: { reservationId: string; safeUnits: number; providerId?: string | null; modelId?: string | null; outcome: string }): Promise<void>;
  release(reservationId: string): Promise<boolean>;
};

export type ApiDependencies = {
  config: FixvoxApiConfig;
  devices: DeviceRepository;
  providers: ProviderProxy;
  budgetLedger?: BudgetLedgerPort;
  budgetPricing?: BudgetPricingPort;
  budgetShadowReceipt?: (receipt: BudgetShadowEvidence) => void;
  quota?: RuntimeQuota;
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
class ProductHttpError extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) { super("product_error"); }
}
function productError(status: number, code: string, category: string, retryable: boolean): ProductHttpError {
  const messages: Record<string, string> = {
    invalid_request: "The request is invalid.", unauthenticated: "Authentication is required.",
    forbidden: "This operation is not allowed.", capability_disabled: "This capability is disabled.",
    quota_exhausted: "Usage limit reached.", conflict: "The operation was already handled.",
    payload_too_large: "The payload is too large.", upstream_rejected: "The upstream request was rejected.",
    upstream_outcome_unknown: "The upstream outcome is unknown.", service_unavailable: "The service is temporarily unavailable.",
  };
  return new ProductHttpError(status, { ok: false, error: { code, category, message: messages[code] ?? "The operation failed.", retryable } });
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
  // Unlimited profiles deliberately have no quota ledger writes. This bounded process-local
  // guard still prevents an accidental duplicate dispatch during a running API instance.
  const terminalOperations = new Set<string>();
  const activeOperations = new Set<string>();

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
      response = await dispatch(request, url, deps, now, activeOperations, terminalOperations);
    } catch (error) {
      if (error instanceof ProductHttpError) {
        code = String(record(error.body.error).code ?? "invalid_request");
        response = json(error.body, error.status);
      } else if (error instanceof HttpError) {
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

async function dispatch(
  request: Request,
  url: URL,
  deps: ApiDependencies,
  now: () => Date,
  activeOperations: Set<string>,
  terminalOperations: Set<string>,
): Promise<Response> {
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
  if (request.method === "POST" && url.pathname === "/product/v1/desktop/auth/sessions") {
    if (!deps.auth) throw productError(503, "service_unavailable", "dependency", true);
    const body = await readJson(request, deps.config.maxRequestBytes);
    rejectUnknown(body, ["deviceId", "returnTo"]);
    const deviceId = text(body.deviceId);
    if (!deviceId || body.returnTo !== "fixvox-tauri" || !await deps.devices.resolveDevice(deviceId)) {
      throw productError(400, "invalid_request", "request", false);
    }
    const handoffId = crypto.randomUUID();
    const handoffHash = await sha256(handoffId);
    const expiresAt = new Date(now().getTime() + 5 * 60_000);
    await deps.auth.createDesktopHandoff({ sessionHash: handoffHash, handoffHash, expiresAt });
    const verificationUri = new URL(`/product/v1/desktop/auth/browser/${encodeURIComponent(handoffId)}`, deps.config.publicBaseUrl).toString();
    return productJson({ handoffId, verificationUri, expiresAt: expiresAt.toISOString(), pollAfterSeconds: 3 });
  }
  const desktopBrowserPathPrefix = "/product/v1/desktop/auth/browser/";
  if (request.method === "GET" && url.pathname.startsWith(desktopBrowserPathPrefix)) {
    if (!deps.auth) throw productError(503, "service_unavailable", "dependency", true);
    const handoffId = decodeURIComponent(url.pathname.slice(desktopBrowserPathPrefix.length));
    const desktop = handoffId ? await deps.auth.readDesktopHandoff(await sha256(handoffId)) : null;
    if (!desktop) return new Response("<!doctype html><title>Expired desktop login</title>", { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
    const state = crypto.randomUUID();
    const stateHash = await sha256(state);
    await deps.auth.createOAuthState({ stateHash, provider: "google", protectedMetadata: JSON.stringify({ desktop: true }), expiresAt: desktop.expiresAt });
    if (!await deps.auth.attachDesktopOAuthState(desktop.sessionHash, stateHash)) throw productError(409, "conflict", "auth", false);
    const redirectUri = new URL("/product/v1/auth/oauth/callback", deps.config.publicBaseUrl).toString();
    return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`, 302);
  }
  const desktopSessionPathPrefix = "/product/v1/desktop/auth/sessions/";
  if (url.pathname.startsWith(desktopSessionPathPrefix)) {
    if (!deps.auth) throw productError(503, "service_unavailable", "dependency", true);
    const suffix = url.pathname.slice(desktopSessionPathPrefix.length);
    const claim = suffix.endsWith("/claim");
    const handoffId = decodeURIComponent(claim ? suffix.slice(0, -"/claim".length) : suffix);
    if (!handoffId || handoffId.includes("/")) throw productError(404, "not_found", "request", false);
    if (request.method === "GET" && !claim) {
      const status = await deps.auth.readDesktopStatus(await sha256(handoffId));
      if (!status) throw productError(404, "not_found", "auth", false);
      const mapped = status.status === "completed" ? "approved" : status.status === "failed" ? "denied" : status.status === "claimed" ? "approved" : status.status;
      return productJson({ status: mapped, ...(mapped === "approved" ? { claimProof: handoffId } : {}), expiresAt: status.expiresAt.toISOString() });
    }
    if (request.method === "POST" && claim) {
      const body = await readJson(request, deps.config.maxRequestBytes);
      rejectUnknown(body, ["deviceId", "claimProof"]);
      const deviceId = text(body.deviceId);
      const claimProof = text(body.claimProof);
      const installId = request.headers.get("x-fixvox-install-id")?.trim() ?? "";
      if (!deviceId || claimProof !== handoffId || !installId) throw productError(400, "invalid_request", "request", false);
      const claimed = await deps.auth.claimDesktopDevice({ sessionHash: await sha256(claimProof), deviceId, installIdHash: await sha256(installId) });
      if (!claimed) throw productError(409, "conflict", "auth", false);
      const profile = await deps.devices.resolveEffectiveProfile({ deviceId, fallbackProfileId: "basic" });
      if (!profile) throw productError(503, "service_unavailable", "dependency", true);
      return productJson({ session: { token: claimProof, expiresAt: new Date(now().getTime() + 5 * 60_000).toISOString() }, context: effectiveContext(profile) });
    }
  }
  if (request.method === "GET" && url.pathname === "/product/v1/auth/oauth/callback") {
    const state = url.searchParams.get("state")?.trim() ?? "";
    if (!state || !deps.auth || !deps.oauth) return new Response("<!doctype html><title>Expired login</title>", { status: 400, headers: { "content-type": "text/html; charset=utf-8" } });
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
  if (request.method === "POST" && url.pathname === "/product/v1/desktop/bootstrap") {
    const body = await readJson(request, deps.config.maxRequestBytes);
    rejectUnknown(body, ["installId", "device", "inviteCode"]);
    const installId = text(body.installId);
    const deviceInput = record(body.device);
    if (!installId || deviceInput.platform !== "windows" || !text(deviceInput.appVersion)) throw productError(400, "invalid_request", "request", false);
    const device = await deps.devices.bindDevice({ installIdHash: await sha256(installId), generatedDeviceId: crypto.randomUUID() });
    const profile = await deps.devices.resolveEffectiveProfile({ deviceId: device.deviceId, fallbackProfileId: "basic" });
    if (!profile) throw productError(503, "service_unavailable", "dependency", true);
    return productJson({ binding: { deviceId: device.deviceId, status: "active" }, context: effectiveContext(profile) });
  }
  if (request.method === "GET" && url.pathname === "/product/v1/desktop/context") {
    const { profile } = await requireRuntimeIdentity(request, deps);
    return productJson(effectiveContext(profile));
  }
  if (request.method === "POST" && url.pathname === "/product/v1/runtime/transcriptions") {
    const identity = await requireRuntimeIdentity(request, deps);
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > deps.config.maxRequestBytes) throw productError(413, "payload_too_large", "request", false);
    let form: FormData;
    try { form = await request.formData(); } catch { throw productError(400, "invalid_request", "request", false); }
    const fieldNames = [...form.keys()];
    if (fieldNames.length !== 2 || new Set(fieldNames).size !== 2 || !fieldNames.includes("metadata") || !fieldNames.includes("audio")) {
      throw productError(400, "invalid_request", "request", false);
    }
    const metadataPart = form.get("metadata");
    const audio = form.get("audio");
    if (typeof metadataPart !== "string" || !(audio instanceof Blob) || audio.size > deps.config.maxRequestBytes || !audio.type.toLowerCase().startsWith("audio/")) throw productError(400, "invalid_request", "request", false);
    let metadata: Record<string, unknown>;
    try { metadata = JSON.parse(metadataPart) as Record<string, unknown>; } catch { throw productError(400, "invalid_request", "request", false); }
    rejectUnknown(metadata, ["operationId", "durationMs", "language", "hints"]);
    const operationId = operation(metadata.operationId);
    if (!operationId || typeof metadata.durationMs !== "number" || metadata.durationMs < 0) throw productError(400, "invalid_request", "request", false);
    const providerRequest = new Request(request.url, { method: "POST", body: form });
    const result = await executeRuntime({ deps, identity, operationId, usageKind: "stt", engineKind: "audio", capability: "transcription", providerRequest, durationMs: metadata.durationMs, activeOperations, terminalOperations, now });
    const payload = await safeProviderJson(result.response);
    const output = text(payload.text);
    if (!output) throw productError(502, "upstream_rejected", "upstream", false);
    return productJson({ operationId, text: output, ...(text(metadata.language) ? { language: text(metadata.language) } : {}), usage: { kind: "stt", charged: result.charged }, policy: { profileVersion: identity.profile.version, postprocessEligible: capabilityEnabled(identity.profile, "postprocess") } });
  }
  if (request.method === "POST" && url.pathname === "/product/v1/runtime/actions") {
    const identity = await requireRuntimeIdentity(request, deps);
    const body = await readJson(request, deps.config.maxRequestBytes);
    rejectUnknown(body, ["operationId", "kind", "input"]);
    const operationId = operation(body.operationId);
    const kind = body.kind;
    const input = record(body.input);
    if (!operationId || !["postprocess", "selection_transform", "assistant"].includes(String(kind))) throw productError(400, "invalid_request", "request", false);
    const allowedInput = kind === "postprocess" ? ["transcript"] : kind === "selection_transform" ? ["selectedText", "presetKey", "instruction"] : ["utterance", "conversationSummary"];
    rejectUnknown(input, allowedInput);
    const content = kind === "postprocess" ? text(input.transcript) : kind === "selection_transform" ? text(input.selectedText) : text(input.utterance);
    const instruction = kind === "selection_transform" ? text(input.instruction) : null;
    if (!content || (kind === "selection_transform" && !instruction)) throw productError(400, "invalid_request", "request", false);
    const typedProviderInput = kind === "postprocess"
      ? { transcript: content }
      : kind === "selection_transform"
        ? { selectedText: content, instruction, ...(text(input.presetKey) ? { presetKey: text(input.presetKey) } : {}) }
        : { utterance: content, ...(text(input.conversationSummary) ? { conversationSummary: text(input.conversationSummary) } : {}) };
    const providerBody = { messages: [{ role: "system", content: `fixvox:${kind}` }, { role: "user", content: JSON.stringify(typedProviderInput) }] };
    const result = await executeRuntime({ deps, identity, operationId, usageKind: "llm", engineKind: "chat", capability: String(kind), providerRequest: new Request(request.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(providerBody) }), activeOperations, terminalOperations, now });
    const payload = await safeProviderJson(result.response);
    const transformed = text(record((Array.isArray(payload.choices) ? record(payload.choices[0]) : {}).message).content);
    if (!transformed) throw productError(502, "upstream_rejected", "upstream", false);
    const output = kind === "assistant" ? { reply: transformed, surface: "quick_chat" } : { text: transformed };
    return productJson({ operationId, kind, output, usage: { kind: "llm", charged: result.charged } });
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
    const identity = await requireRuntimeIdentity(request, deps, true);
    const kind = url.pathname.includes("audio") ? "audio" : "chat";
    const operationId = request.headers.get("idempotency-key")?.trim() || crypto.randomUUID();
    const capability = kind === "audio" ? "transcription" : legacyActionCapability(request);
    const result = await executeRuntime({ deps, identity, operationId, usageKind: kind === "audio" ? "stt" : "llm", engineKind: kind, capability, providerRequest: boundRequestBody(request, deps.config.maxRequestBytes), activeOperations, terminalOperations, now, legacy: true });
    const headers = new Headers(result.response.headers);
    headers.delete("set-cookie");
    applyProviderContractHeaders(headers, kind, identity.profile.profileId);
    return new Response(limitResponseBody(result.response.body, deps.config.maxRequestBytes), { status: result.response.status, headers });
  }
  if (request.method === "POST" && (url.pathname === "/product/v1/signals/events" || url.pathname === "/v2/telemetry/events/batch")) {
    if (url.pathname.startsWith("/product/")) await requireRuntimeIdentity(request, deps);
    const body = await readJson(request, deps.config.maxRequestBytes);
    if (url.pathname.startsWith("/product/")) rejectSignalEnvelope(body);
    else if (!Array.isArray(body.events) || body.events.length > 50) throw productError(400, "invalid_request", "request", false);
    const events = body.events as Array<Record<string, unknown>>;
    const acceptedIds = events.map((event) => String(event.id));
    return url.pathname.startsWith("/product/") ? productJson({ accepted: acceptedIds.length, acceptedIds }) : json({ ok: true, acceptedIds, received: acceptedIds.length });
  }
  if (request.method === "POST" && (url.pathname === "/product/v1/signals/feedback" || url.pathname === "/v2/feedback/submit")) {
    const canonical = url.pathname.startsWith("/product/");
    const identity = canonical ? await requireRuntimeIdentity(request, deps) : null;
    const body = await readJson(request, deps.config.maxRequestBytes);
    rejectUnknown(body, canonical ? ["category", "rating", "note"] : ["type", "deviceId"]);
    const classification = text(canonical ? body.category : body.type) || "other";
    const allowed = new Set(["positive", "negative", "issue", "suggestion", "other"]);
    if (!allowed.has(classification) || (canonical && (typeof body.rating !== "number" || body.rating < 1 || body.rating > 5)) || (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 280))) throw productError(400, "invalid_request", "request", false);
    const deviceId = canonical ? identity!.deviceId : text(body.deviceId) || null;
    const feedbackId = deps.feedback ? await deps.feedback.submit({ classification, deviceId }) : "redacted";
    return canonical ? productJson({ feedbackId, acceptedAt: now().toISOString() }, 202) : json({ ok: true, id: feedbackId, ts: now().toISOString() });
  }
  return json({ error: { message: "Not found." } }, 404);
}

type RuntimeIdentity = {
  deviceId: string;
  accountBudget: { dailyMicrousd: number | null; monthlyMicrousd: number | null; mode: "block" | "warn" | null } | null;
  profile: Awaited<ReturnType<DeviceRepository["resolveEffectiveProfile"]>> & {};
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function operation(value: unknown): string { const result = text(value); return result.length >= 1 && result.length <= 128 ? result : ""; }
function rejectUnknown(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw productError(400, "invalid_request", "request", false);
}
function rejectSignalEnvelope(value: Record<string, unknown>): void {
  rejectUnknown(value, ["events"]);
  if (!Array.isArray(value.events) || value.events.length < 1 || value.events.length > 50) throw productError(400, "invalid_request", "request", false);
  const kinds = new Set(["runtime_succeeded", "runtime_failed", "capability_used", "ui_surface_opened"]);
  for (const raw of value.events) {
    const event = record(raw);
    rejectUnknown(event, ["id", "kind", "dimensions"]);
    const id = operation(event.id);
    if (!id || !kinds.has(text(event.kind))) throw productError(400, "invalid_request", "request", false);
    const dimensions = record(event.dimensions);
    if (Object.keys(dimensions).length > 12 || Object.entries(dimensions).some(([key, item]) => !/^[a-z][a-z0-9_]{0,31}$/.test(key) || (typeof item !== "number" && typeof item !== "boolean") || (typeof item === "number" && !Number.isFinite(item)))) throw productError(400, "invalid_request", "request", false);
  }
}
function productJson(data: unknown, status = 200): Response { return json({ ok: true, data }, status); }
function capabilityEnabled(profile: RuntimeIdentity["profile"], capability: string): boolean {
  const configured = profile.definition.capabilities;
  const aliases: Record<string, string[]> = {
    transcription: ["transcription", "dictation"], postprocess: ["postprocess"],
    selection_transform: ["selection_transform", "selectionTransform", "selection"], assistant: ["assistant", "assistant_action", "assistant_actions"],
  };
  if (Array.isArray(configured)) return (aliases[capability] ?? [capability]).some((name) => configured.includes(name));
  const values = record(configured);
  return (aliases[capability] ?? [capability]).some((name) => values[name] === true);
}
function effectiveContext(profile: RuntimeIdentity["profile"]): Record<string, unknown> {
  const unlimited = quotaPolicy(profile).unlimited;
  return {
    profile: { key: profile.profileId, version: profile.version, revision: profile.version },
    capabilities: {
      transcription: capabilityEnabled(profile, "transcription"), postprocess: capabilityEnabled(profile, "postprocess"),
      selectionTransform: capabilityEnabled(profile, "selection_transform"), assistant: capabilityEnabled(profile, "assistant"),
      feedback: capabilityEnabled(profile, "feedback"), adminSettings: capabilityEnabled(profile, "admin_settings"),
    },
    limits: { quotaClass: unlimited ? "pro-unlimited" : "metered" },
    actions: ["postprocess", "selection_transform", "assistant"].map((kind) => ({ kind, enabled: capabilityEnabled(profile, kind) })),
    authority: { mode: "cloudflare-authority", revision: profile.version },
  };
}
async function requireRuntimeIdentity(request: Request, deps: ApiDependencies, legacy = false): Promise<RuntimeIdentity> {
  const deviceId = request.headers.get("x-device-id")?.trim();
  if (!deviceId) throw legacy ? new HttpError(400, "device_id_required") : productError(401, "unauthenticated", "auth", false);
  const device = await deps.devices.resolveDevice(deviceId);
  if (!device) throw legacy ? new HttpError(403, "device_not_registered") : productError(403, "forbidden", "auth", false);
  const profile = await deps.devices.resolveEffectiveProfile({ deviceId: device.deviceId, fallbackProfileId: "basic" });
  if (!profile) throw legacy ? new HttpError(403, "profile_unavailable") : productError(403, "forbidden", "policy", false);
  return { deviceId: device.deviceId, accountBudget: device.accountBudget ?? null, profile };
}
function quotaPolicy(profile: RuntimeIdentity["profile"]): { unlimited: boolean; limit: number | null } {
  const quota = record(profile.definition.quota);
  const unlimited = quota.mode === "unlimited" || quota.profile === "pro-unlimited";
  return { unlimited, limit: typeof quota.limit === "number" && quota.limit >= 0 ? quota.limit : null };
}
function resolveEngine(profile: RuntimeIdentity["profile"], engineKind: "audio" | "chat", capability: string): Record<string, unknown> | null {
  const engines = record(profile.definition.engines);
  const keys = engineKind === "audio" ? ["transcription", "audio"] : [capability, capability === "selection_transform" ? "selectionTransform" : "", "chat"];
  for (const key of keys) { const value = record(engines[key]); if (Object.keys(value).length) return value; }
  return null;
}
function legacyActionCapability(request: Request): string {
  const kind = request.headers.get("x-fixvox-engine-kind")?.toLowerCase();
  return kind === "selectiontransform" ? "selection_transform" : kind === "assistant" ? "assistant" : "postprocess";
}
function usdToMicrousd(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const microusd = Math.round(value * 1_000_000);
  return Number.isSafeInteger(microusd) ? microusd : null;
}
function usdTextToMicrousd(value: string): number | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;
  const fraction = match[2] ?? "";
  const base = BigInt(match[1]) * 1_000_000n + BigInt((fraction.slice(0, 6) + "000000").slice(0, 6));
  const rounded = fraction.slice(6).match(/[1-9]/) ? base + 1n : base;
  return rounded <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rounded) : null;
}
function effectiveBudget(identity: RuntimeIdentity): { mode: "block" | "warn"; dailyMicrousd: number | null; monthlyMicrousd: number | null } {
  const profile = record(identity.profile.definition.limits);
  const account = identity.accountBudget;
  return {
    mode: account?.mode ?? (profile.mode === "warn" ? "warn" : "block"),
    dailyMicrousd: account?.dailyMicrousd ?? usdToMicrousd(profile.dailyUsd),
    monthlyMicrousd: account?.monthlyMicrousd ?? usdToMicrousd(profile.monthlyUsd),
  };
}
function sttEstimateMicrousd(durationMs: number, priceMicrousd: number): number | null {
  if (!Number.isFinite(durationMs) || durationMs < 0 || !Number.isSafeInteger(priceMicrousd) || priceMicrousd < 0) return null;
  const estimate = Math.ceil((durationMs * priceMicrousd) / 3_600_000);
  return Number.isSafeInteger(estimate) ? estimate : null;
}
function providerCostMicrousd(response: Response): number | null {
  const raw = response.headers.get("x-fixvox-cost-usd")?.trim();
  if (!raw) return null;
  return usdTextToMicrousd(raw);
}
async function safeProviderJson(response: Response): Promise<Record<string, unknown>> {
  try { return record(await response.json()); } catch { throw productError(502, "upstream_rejected", "upstream", false); }
}
async function executeRuntime(input: {
  deps: ApiDependencies; identity: RuntimeIdentity; operationId: string; usageKind: "stt" | "llm";
  engineKind: "audio" | "chat"; capability: string; providerRequest: Request; durationMs?: number; activeOperations: Set<string>;
  terminalOperations: Set<string>; now: () => Date; legacy?: boolean;
}): Promise<{ response: Response; charged: boolean }> {
  const { deps, identity } = input;
  if (!capabilityEnabled(identity.profile, input.capability)) {
    if (input.legacy) throw new HttpError(403, "engine_not_allowed");
    throw productError(403, "capability_disabled", "policy", false);
  }
  const engine = resolveEngine(identity.profile, input.engineKind, input.capability);
  if (!engine) throw input.legacy ? new HttpError(403, "engine_not_allowed") : productError(403, "capability_disabled", "policy", false);
  if (!deps.quota) throw input.legacy ? new HttpError(503, "service_unavailable") : productError(503, "service_unavailable", "dependency", true);
  if (input.activeOperations.has(input.operationId) || input.terminalOperations.has(input.operationId)) throw input.legacy ? new HttpError(409, "operation_conflict") : productError(409, "conflict", "request", false);
  input.activeOperations.add(input.operationId);
  const policy = quotaPolicy(identity.profile);
  let reservationId: string | null = null;
  let dispatched = false;
  const shadow = { decision: null as BudgetReserveDecision | null };
  let shadowEvidence: BudgetShadowEvidence | null = null;
  let estimatedMicrousd: number | null = null;
  const emitShadow = () => {
    if (!shadowEvidence) return;
    try { deps.budgetShadowReceipt?.(shadowEvidence); } catch { /* Shadow observability never owns the response. */ }
  };
  const shadowError = () => {
    if (shadowEvidence) shadowEvidence = { ...shadowEvidence, status: "error", ledgerAllowed: null, ledgerReason: "ledger_unavailable" };
  };
  const releaseShadow = async () => {
    if (!shadow.decision?.reservationId || !deps.budgetLedger) return;
    try { await deps.budgetLedger.release({ requestId: input.operationId, reason: "released" }); }
    catch { shadowError(); }
  };
  try {
    const at = input.now();
    const decision = await deps.quota.reserve({ idempotencyKey: input.operationId, deviceId: identity.deviceId, usageKind: input.usageKind, amount: 1, limit: policy.limit, unlimited: policy.unlimited, windowStart: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())), expiresAt: new Date(at.getTime() + 60_000) });
    if (decision.idempotent) throw input.legacy ? new HttpError(409, "operation_conflict") : productError(409, "conflict", "request", false);

    const shadowEnabled = !input.legacy && input.usageKind === "stt" && input.durationMs !== undefined && deps.budgetLedger && deps.budgetPricing;
    if (shadowEnabled) {
      const legacy: LegacyBudgetDecision = { allowed: decision.allowed, reason: decision.allowed ? null : "legacy_block" };
      const comparison = await compareBudgetLedgerShadow({
        legacy,
        compareReasons: false,
        evaluateLedger: async () => {
          const providerId = text(engine.provider);
          const modelId = text(engine.model);
          const price = providerId && modelId ? await deps.budgetPricing!.sttPriceMicrousd({ providerId, modelId }) : null;
          estimatedMicrousd = price === null ? null : sttEstimateMicrousd(input.durationMs!, price);
          if (estimatedMicrousd === null) return { allowed: false, reason: "ledger_unavailable", reservationId: null, idempotent: false, snapshot: null };
          const budget = effectiveBudget(identity);
          shadow.decision = await deps.budgetLedger!.reserve({
            requestId: input.operationId,
            scope: { type: "device", id: identity.deviceId },
            mode: budget.mode,
            limits: { dailyMicrousd: budget.dailyMicrousd, monthlyMicrousd: budget.monthlyMicrousd },
            estimatedMicrousd,
            occurredAt: at.toISOString(),
            expiresAt: new Date(at.getTime() + 60_000).toISOString(),
          });
          return shadow.decision;
        },
      });
      shadowEvidence = comparison.evidence;
    }

    if (!decision.allowed) {
      await releaseShadow();
      emitShadow();
      throw input.legacy ? new HttpError(429, "quota_exceeded") : productError(429, "quota_exhausted", "quota", true);
    }
    reservationId = decision.reservationId;
    dispatched = true;
    let response: Response;
    try {
      response = await deps.providers.proxy({ kind: input.engineKind, request: input.providerRequest, signal: AbortSignal.timeout(deps.config.requestTimeoutMs), policy: { profileId: identity.profile.profileId, engine } });
    } catch {
      await releaseShadow();
      emitShadow();
      if (reservationId) await deps.quota.consume({ reservationId, safeUnits: 1, providerId: text(engine.provider) || null, modelId: text(engine.model) || null, outcome: "ambiguous" });
      input.terminalOperations.add(input.operationId);
      throw input.legacy ? new HttpError(502, "upstream_outcome_unknown") : productError(502, "upstream_outcome_unknown", "upstream", false);
    }
    if (shadow.decision?.reservationId && deps.budgetLedger) {
      if (response.ok) {
        try { await deps.budgetLedger.settle({ requestId: input.operationId, actualMicrousd: providerCostMicrousd(response) ?? estimatedMicrousd! }); }
        catch { shadowError(); }
      } else await releaseShadow();
    }
    emitShadow();
    if (reservationId) await deps.quota.consume({ reservationId, safeUnits: 1, providerId: text(engine.provider) || null, modelId: text(engine.model) || null, outcome: response.ok ? "success" : "rejected" });
    input.terminalOperations.add(input.operationId);
    if (!response.ok && !input.legacy) throw productError(502, "upstream_rejected", "upstream", false);
    return { response, charged: reservationId !== null };
  } catch (error) {
    if (!dispatched && reservationId) await deps.quota.release(reservationId);
    throw error;
  } finally { input.activeOperations.delete(input.operationId); }
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
