import type { PostgresAdminRepository } from "../postgres/admin-repository.ts";
import type { PostgresAuthSessionRepository } from "../postgres/auth-session-repository.ts";

export type AdminCapability = "view" | "edit" | "publish";
export type AdminRouteDependencies = { repository: PostgresAdminRepository; keys: Partial<Record<AdminCapability, string>>; sessions?: PostgresAuthSessionRepository };
type BearerPrincipal = { capability: AdminCapability; recentGoogle: boolean };

function json(value: unknown, status = 200, headers?: HeadersInit): Response { return Response.json(value, { status, headers }); }
function limit(url: URL): number { const raw = url.searchParams.get("limit"); if (raw !== null && (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 100)) throw new Error("cursor_or_limit_invalid"); return Math.min(100, Math.max(1, Number(raw) || 50)); }
async function hash(value: string): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function principal(request: Request, deps: AdminRouteDependencies): Promise<BearerPrincipal | null> { const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""); if (!token) return null; const staticCapability = (["publish", "edit", "view"] as const).find((candidate) => deps.keys[candidate] === token); return staticCapability ? { capability: staticCapability, recentGoogle: false } : deps.sessions?.authorizeBearer(await hash(token)) ?? null; }
function permitted(actual: BearerPrincipal | null, required: AdminCapability): boolean { return actual !== null && (["view", "edit", "publish"] as const).indexOf(actual.capability) >= (["view", "edit", "publish"] as const).indexOf(required); }
function cors(request: Request, response: Response): Response { const headers = new Headers(response.headers); headers.set("Access-Control-Allow-Origin", request.headers.get("origin")?.trim() || "null"); headers.set("Vary", "Origin"); headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type"); headers.set("Access-Control-Max-Age", "86400"); return new Response(response.body, { status: response.status, headers }); }
function error(code: string, status: number): Response { return json({ error: { code, message: "Admin read projection is unavailable.", redacted: true } }, status); }

/** Only GET/OPTIONS Admin projection routes are implemented here; mutations remain deliberately unimplemented. */
export async function handleAdminRoute(request: Request, url: URL, deps: AdminRouteDependencies): Promise<Response | null> {
  if (!url.pathname.startsWith("/admin/")) return null;
  if (request.method === "OPTIONS") return cors(request, new Response(null, { status: 204 }));
  try {
    const actual = await principal(request, deps);
    if (!permitted(actual, "view")) return cors(request, error("admin_unauthorized", 401));
    if (request.method !== "GET") return cors(request, error("not_implemented", 501));
    const page = { limit: limit(url), cursor: url.searchParams.get("cursor") };
    let response: unknown;
    if (url.pathname === "/admin/dashboard/summary") response = await deps.repository.dashboard();
    else if (url.pathname === "/admin/requests") response = await deps.repository.requestEvents({ ...page, status: url.searchParams.get("status") });
    else if (url.pathname === "/admin/usage/summary") response = await deps.repository.usageSummary();
    else if (url.pathname === "/admin/feedback") response = await deps.repository.feedback(page);
    else if (url.pathname === "/admin/control-plane/profiles") response = { ok: true, schemaVersion: 1, updatedAt: new Date().toISOString(), profiles: await deps.repository.profiles() };
    else if (url.pathname === "/admin/control-plane/audit") response = { schemaVersion: 1, records: await deps.repository.audit(page.limit) };
    else if (url.pathname === "/admin/control-plane/devices") { const values = await deps.repository.devices(page); response = { ok: true, source: "postgres", updatedAt: new Date().toISOString(), policyOptions: [], ...values }; }
    else if (url.pathname === "/admin/control-plane/accounts") { const values = await deps.repository.accounts(page); const catalog = await deps.repository.catalog(); response = { ok: true, source: "postgres", updatedAt: new Date().toISOString(), policyOptions: [], availableSegments: [], variantOptions: [], policyVariants: {}, policyEngines: {}, groupOptions: catalog.groupOptions, ...values }; }
    else if (url.pathname === "/admin/control-plane/policy") { const catalog = await deps.repository.catalog(); response = { ok: true, source: "postgres", updatedAt: new Date().toISOString(), policy: {}, defaultPolicy: {}, profileOptions: await deps.repository.profiles(), profileVersions: [], availableSegments: [], variantOptions: [], policyVariants: {}, policyEngines: {}, policyBudgets: {}, ...catalog }; }
    else if (url.pathname === "/admin/pricing") response = { watchlist: { required: [], manual: [], merged: [] }, pricing: await deps.repository.pricing() };
    else return cors(request, error("not_found", 404));
    return cors(request, json(response));
  } catch (cause) {
    const code = cause instanceof Error && cause.message === "cursor_or_limit_invalid" ? "invalid_cursor_or_limit" : "service_unavailable";
    return cors(request, error(code, code === "invalid_cursor_or_limit" ? 400 : 503));
  }
}
