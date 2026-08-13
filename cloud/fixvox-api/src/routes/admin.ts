import type { PostgresAdminRepository } from "../postgres/admin-repository.ts";
import type { PostgresAuthSessionRepository } from "../postgres/auth-session-repository.ts";
import type { PostgresProfileCommandRepository, ProfileCommandResult } from "../postgres/profile-command-repository.ts";
import type { PostgresEngineCatalogRepository } from "../postgres/engine-catalog-repository.ts";

export type AdminCapability = "view" | "edit" | "publish";
export type AdminRouteDependencies = { repository: PostgresAdminRepository; profileCommands: PostgresProfileCommandRepository; keys: Partial<Record<AdminCapability, string>>; sessions?: PostgresAuthSessionRepository; engineCatalog?: PostgresEngineCatalogRepository };
type AdminRole = "viewer" | "editor" | "publisher" | "owner";
type BearerPrincipal = { capability: AdminCapability; recentGoogle: boolean; staticCredential: boolean; principalKey?: string; role?: AdminRole };
type ControlRoomPrincipal = BearerPrincipal & { principalKey: string; role: AdminRole };

function json(value: unknown, status = 200, headers?: HeadersInit): Response { return Response.json(value, { status, headers }); }
function limit(url: URL): number { const raw = url.searchParams.get("limit"); if (raw !== null && (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 100)) throw new Error("cursor_or_limit_invalid"); return Math.min(100, Math.max(1, Number(raw) || 50)); }
async function hash(value: string): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function principal(request: Request, deps: AdminRouteDependencies): Promise<BearerPrincipal | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const staticCapability = (["publish", "edit", "view"] as const).find((candidate) => deps.keys[candidate] === token);
  if (staticCapability) return { capability: staticCapability, recentGoogle: false, staticCredential: true };
  const session = await deps.sessions?.authorizeBearer(await hash(token), new Date(), request.headers.get("x-device-id")?.trim() || undefined);
  return session ? { ...session, staticCredential: false } : null;
}
function permitted(actual: BearerPrincipal | null, required: AdminCapability): boolean { return actual !== null && (["view", "edit", "publish"] as const).indexOf(actual.capability) >= (["view", "edit", "publish"] as const).indexOf(required); }
async function controlRoomPrincipal(request: Request, deps: AdminRouteDependencies, actual: BearerPrincipal): Promise<ControlRoomPrincipal | null> {
  if (!actual.staticCredential) {
    return actual.principalKey && actual.role
      ? { ...actual, principalKey: actual.principalKey, role: actual.role }
      : null;
  }
  const principalKey = request.headers.get("x-fixvox-principal-key")?.trim() ?? "";
  if (!/^arp_[a-f0-9]{64}$/.test(principalKey)) return null;
  const role = await deps.repository.roleForPrincipal(principalKey);
  if (!role) return null;
  const recentAt = request.headers.get("x-fixvox-recent-google-at");
  const recentTime = recentAt ? Date.parse(recentAt) : Number.NaN;
  return { ...actual, principalKey, role, recentGoogle: Number.isFinite(recentTime) && Math.abs(Date.now() - recentTime) <= 10 * 60_000 };
}
function cors(_request: Request, response: Response): Response { const headers = new Headers(response.headers); headers.set("Access-Control-Allow-Origin", "null"); headers.set("Vary", "Origin"); headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"); headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Fixvox-Principal-Key, X-Fixvox-Recent-Google-At"); headers.set("Access-Control-Max-Age", "86400"); return new Response(response.body, { status: response.status, headers }); }
function error(code: string, status: number): Response { return json({ error: { code, message: "Control Room operation is unavailable.", redacted: true } }, status); }
async function body(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 16_384) throw new Error("invalid_body");
  try {
    const value: unknown = JSON.parse(text || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_body");
    return value as Record<string, unknown>;
  } catch { throw new Error("invalid_body"); }
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function normalizedDefinition(value: unknown): Record<string, unknown> {
  const candidate = structuredClone(record(value));
  const runtime = record(candidate.runtime);
  for (const key of ["transcription", "postprocess", "selectionTransform"]) {
    const { engineKey, promptKey, ...operation } = record(runtime[key]);
    runtime[key] = {
      ...operation,
      ...(operation.engineId === undefined && engineKey !== undefined ? { engineId: engineKey } : {}),
      ...(operation.promptId === undefined && promptKey !== undefined ? { promptId: promptKey } : {}),
    };
  }
  candidate.runtime = runtime;
  const { quotaProfileKey, ...limits } = record(candidate.limits);
  candidate.limits = { ...limits, ...(limits.quotaProfile === undefined && quotaProfileKey !== undefined ? { quotaProfile: quotaProfileKey } : {}) };
  return candidate;
}
function profileCommandResponse(result: ProfileCommandResult, action: "apply" | "rollback"): Response {
  return json({ ok: true, data: { profile: { key: result.profileId, label: result.label, publishedVersion: result.resultingVersion, revision: result.revision }, publication: { previousVersion: result.previousVersion, resultingVersion: result.resultingVersion }, audit: { id: result.auditId, action, result: "success" }, idempotentReplay: result.idempotentReplay } });
}
function profileCommandFailure(cause: unknown): Response {
  const message = cause instanceof Error ? cause.message : "";
  if (message === "stale_profile_revision") return error("stale_revision", 409);
  if (message === "profile_not_found" || message === "profile_version_not_found") return error("not_found", 404);
  if (message === "profile_definition_invalid" || message === "profile_reference_invalid") return error("invalid_definition", 422);
  if (message === "invalid_body" || message === "invalid_confirmation") return error(message, 400);
  return error("service_unavailable", 503);
}
function engineCatalogFailure(cause: unknown): Response {
  const message = cause instanceof Error ? cause.message : "";
  if (message === "engine_catalog_stale_revision") return error("stale_revision", 409);
  if (message === "engine_catalog_not_found") return error("not_found", 404);
  if (message === "engine_catalog_retired" || message === "engine_catalog_default_effort_unknown") return error("invalid_definition", 422);
  if (message === "invalid_body" || message === "invalid_confirmation") return error(message, 400);
  return error("service_unavailable", 503);
}
export async function handleAdminRoute(request: Request, url: URL, deps: AdminRouteDependencies): Promise<Response | null> {
  const canonical = url.pathname.startsWith("/product/v1/control-room/");
  if (!canonical && !url.pathname.startsWith("/admin/")) return null;
  if (request.method === "OPTIONS") return cors(request, new Response(null, { status: 204 }));
  try {
    const actual = await principal(request, deps);
    if (!actual || !permitted(actual, "view")) return cors(request, error("admin_unauthorized", 401));
    if (canonical) {
      const operator = await controlRoomPrincipal(request, deps, actual);
      if (!operator) return cors(request, error("forbidden", 403));
      const page = { limit: limit(url), cursor: url.searchParams.get("cursor") };
      const prefix = "/product/v1/control-room";
      if (request.method === "GET" && url.pathname === `${prefix}/session`) return cors(request, json({ ok: true, role: operator.role, principalKey: operator.principalKey, recentGoogle: operator.recentGoogle }));
      if (request.method === "GET" && url.pathname === `${prefix}/roles`) return cors(request, json(await deps.repository.linkedPrincipals()));
      const roleMatch = url.pathname.match(/^\/product\/v1\/control-room\/roles\/(arp_[a-f0-9]{64})$/);
      if (roleMatch && (request.method === "PUT" || request.method === "DELETE")) {
        if (!permitted(operator, "publish") || operator.role !== "owner" || !operator.recentGoogle) return cors(request, error("forbidden", 403));
        const command = request.method === "PUT" ? await body(request) : {};
        if (request.method === "PUT" && (Object.keys(command).some((key) => key !== "role") || !["viewer", "editor", "publisher", "owner"].includes(String(command.role)))) return cors(request, error("invalid_request", 400));
        const result = await deps.repository.setRoleBinding({ actorPrincipalKey: operator.principalKey, subjectPrincipalKey: roleMatch[1], role: request.method === "PUT" ? command.role as AdminRole : null });
        return cors(request, json(result));
      }
      const profileDetailMatch = url.pathname.match(/^\/product\/v1\/control-room\/profiles\/([a-z0-9][a-z0-9-]{0,63})$/);
      if (profileDetailMatch && request.method === "GET") {
        try { return cors(request, json({ ok: true, data: await deps.profileCommands.detail(profileDetailMatch[1]) })); }
        catch (cause) { return cors(request, profileCommandFailure(cause)); }
      }
      const profileVersionMatch = url.pathname.match(/^\/product\/v1\/control-room\/profiles\/([a-z0-9][a-z0-9-]{0,63})\/versions\/([1-9]\d*)$/);
      if (profileVersionMatch && request.method === "GET") {
        try {
          const detail = await deps.profileCommands.detail(profileVersionMatch[1]);
          const version = detail.versions.find((candidate) => candidate.version === Number(profileVersionMatch[2]));
          if (!version) throw new Error("profile_version_not_found");
          return cors(request, json({ ok: true, data: { profileId: detail.profileId, revision: detail.revision, version } }));
        } catch (cause) { return cors(request, profileCommandFailure(cause)); }
      }
      const profilePreviewMatch = url.pathname.match(/^\/product\/v1\/control-room\/profiles\/([a-z0-9][a-z0-9-]{0,63})\/(validate|preview)$/);
      if (profilePreviewMatch && request.method === "POST") {
        if (!permitted(operator, "edit") || !["editor", "publisher", "owner"].includes(operator.role)) return cors(request, error("forbidden", 403));
        try {
          const command = await body(request);
          const profileId = profilePreviewMatch[1];
          const action = profilePreviewMatch[2] as "validate" | "preview";
          const allowed = action === "validate" ? ["definition", "expectedRevision"] : ["definition", "expectedRevision", "baseVersion"];
          if (Object.keys(command).some((key) => !allowed.includes(key))) throw new Error("invalid_body");
          const expectedRevision = command.expectedRevision === undefined ? undefined : Number(command.expectedRevision);
          if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || expectedRevision < 0)) throw new Error("invalid_body");
          const definition = normalizedDefinition(command.definition);
          if (action === "validate") {
            const result = await deps.profileCommands.validate({ profileId, definition, ...(expectedRevision === undefined ? {} : { expectedRevision }) });
            return cors(request, json({ ok: true, data: result }));
          }
          const baseVersion = command.baseVersion === undefined ? undefined : Number(command.baseVersion);
          if (baseVersion !== undefined && (!Number.isInteger(baseVersion) || baseVersion < 1)) throw new Error("invalid_body");
          const result = await deps.profileCommands.preview({ profileId, definition, ...(expectedRevision === undefined ? {} : { expectedRevision }), ...(baseVersion === undefined ? {} : { baseVersion }) });
          return cors(request, json({ ok: true, data: result }));
        } catch (cause) { return cors(request, profileCommandFailure(cause)); }
      }
      const profileMatch = url.pathname.match(/^\/product\/v1\/control-room\/profiles\/([a-z0-9][a-z0-9-]{0,63})\/(apply|rollback)$/);
      if (profileMatch && request.method === "POST") {
        if (!permitted(operator, "publish") || !["publisher", "owner"].includes(operator.role) || !operator.recentGoogle) return cors(request, error("forbidden", 403));
        try {
          const command = await body(request);
          const profileId = profileMatch[1];
          const expectedRevision = Number(command.expectedRevision);
          const confirmation = record(command.confirmation);
          if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new Error("invalid_body");
          if (profileMatch[2] === "apply") {
            if (Object.keys(command).some((key) => !["expectedRevision", "definition", "confirmation"].includes(key)) || confirmation.action !== "apply" || confirmation.profileKey !== profileId || Number(confirmation.expectedRevision) !== expectedRevision || confirmation.phrase !== `APPLY ${profileId} REV ${expectedRevision}`) throw new Error("invalid_confirmation");
            const result = await deps.profileCommands.apply({ profileId, expectedRevision, definition: normalizedDefinition(command.definition), actorRefHash: operator.principalKey, confirmation: String(confirmation.phrase) });
            return cors(request, profileCommandResponse(result, "apply"));
          }
          const targetVersion = Number(command.targetVersion);
          if (Object.keys(command).some((key) => !["expectedRevision", "targetVersion", "confirmation"].includes(key)) || !Number.isInteger(targetVersion) || targetVersion < 1 || confirmation.action !== "rollback" || confirmation.profileKey !== profileId || Number(confirmation.expectedRevision) !== expectedRevision || Number(confirmation.targetVersion) !== targetVersion || confirmation.phrase !== `ROLLBACK ${profileId} TO ${targetVersion} REV ${expectedRevision}`) throw new Error("invalid_confirmation");
          const result = await deps.profileCommands.rollback({ profileId, targetVersion, expectedRevision, actorRefHash: operator.principalKey, confirmation: String(confirmation.phrase) });
          return cors(request, profileCommandResponse(result, "rollback"));
        } catch (cause) { return cors(request, profileCommandFailure(cause)); }
      }
      const engineLifecycleMatch = url.pathname.match(/^\/product\/v1\/control-room\/(?:engine-catalog|engines)\/([^/]+)\/(publish|retire|review)$/);
      if (engineLifecycleMatch && request.method === "POST") {
        if (!deps.engineCatalog || !permitted(operator, "publish") || !["publisher", "owner"].includes(operator.role) || !operator.recentGoogle) return cors(request, error("forbidden", 403));
        try {
          const command = await body(request);
          const engineId = decodeURIComponent(engineLifecycleMatch[1]);
          const expectedRevision = Number(command.expectedRevision);
          const confirmation = record(command.confirmation);
          const action = engineLifecycleMatch[2] as "publish" | "retire" | "review";
          if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new Error("invalid_body");
          if (Object.keys(command).some((key) => !["expectedRevision", "confirmation"].includes(key)) || confirmation.action !== action || confirmation.engineId !== engineId || Number(confirmation.expectedRevision) !== expectedRevision || confirmation.phrase !== `${action.toUpperCase()} ${engineId} REV ${expectedRevision}`) throw new Error("invalid_confirmation");
          const result = action === "publish"
            ? await deps.engineCatalog.publish({ engineId, expectedRevision, actorRef: operator.principalKey, occurredAt: new Date().toISOString() })
            : action === "retire"
              ? await deps.engineCatalog.retire({ engineId, expectedRevision, actorRef: operator.principalKey, occurredAt: new Date().toISOString() })
              : await deps.engineCatalog.review({ engineId, expectedRevision, actorRef: operator.principalKey, occurredAt: new Date().toISOString() });
          return cors(request, json({ ok: true, data: { engine: result.entry, audit: result.audit, idempotentReplay: result.idempotentReplay } }));
        } catch (cause) { return cors(request, engineCatalogFailure(cause)); }
      }
      if (request.method !== "GET") return cors(request, error("not_implemented", 501));
      if (url.pathname === `${prefix}/profiles`) return cors(request, json({ ok: true, profiles: await deps.profileCommands.list() }));
      if (url.pathname === `${prefix}/engine-catalog`) {
        if (!deps.engineCatalog) return cors(request, error("not_implemented", 501));
        return cors(request, json({ ok: true, engines: await deps.engineCatalog.list(), audits: await deps.engineCatalog.catalogAudits(page.limit) }));
      }
      if (url.pathname === `${prefix}/configuration` || url.pathname === `${prefix}/engines` || url.pathname === `${prefix}/prompts` || url.pathname === `${prefix}/groups`) return cors(request, json({ ok: true, ...await deps.repository.catalog() }));
      if (url.pathname === `${prefix}/accounts`) return cors(request, json({ ok: true, ...await deps.repository.accounts(page) }));
      if (url.pathname === `${prefix}/devices`) return cors(request, json({ ok: true, ...await deps.repository.devices(page) }));
      if (url.pathname === `${prefix}/usage`) return cors(request, json(await deps.repository.usageSummary()));
      if (url.pathname === `${prefix}/audit`) return cors(request, json({ schemaVersion: 1, records: await deps.repository.audit(page.limit) }));
      if (url.pathname === `${prefix}/signals/feedback`) return cors(request, json(await deps.repository.feedback(page)));
      if (url.pathname === `${prefix}/pricing`) return cors(request, json({ watchlist: { required: [], manual: [], merged: [] }, pricing: await deps.repository.pricing() }));
      return cors(request, error("not_found", 404));
    }

    if (request.method === "POST" && url.pathname === "/admin/control-plane/accounts/identity-link") {
      if (!permitted(actual, "publish")) return cors(request, error("forbidden", 403));
      try {
        const command = await body(request);
        if (Object.keys(command).some((key) => !["sourceAccountHandle", "targetAccountId", "actorKey", "confirmation"].includes(key))) throw new Error("invalid_identity_link");
        const sourceAccountHandle = typeof command.sourceAccountHandle === "string" ? command.sourceAccountHandle.trim() : "";
        const targetAccountId = typeof command.targetAccountId === "string" ? command.targetAccountId.trim() : "";
        const actorKey = typeof command.actorKey === "string" ? command.actorKey.trim() : "";
        const confirmation = typeof command.confirmation === "string" ? command.confirmation.trim() : "";
        if (!/^google:[^:@\s]{6,256}$/.test(targetAccountId) || !/^arp_[a-f0-9]{64}$/.test(actorKey)) throw new Error("invalid_identity_link");
        const targetSubjectHash = await hash(targetAccountId.slice("google:".length));
        if (actorKey !== `arp_${targetSubjectHash}`) throw new Error("identity_actor_mismatch");
        return cors(request, json(await deps.repository.linkAccountIdentity({ sourceAccountHandle, targetSubjectHash, actorRefHash: actorKey, confirmation })));
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "";
        if (message === "account_not_found" || message === "account_has_no_devices") return cors(request, error("not_found", 404));
        if (message === "account_ambiguous" || message === "target_account_conflict" || message === "identity_already_linked") return cors(request, error(message, 409));
        if (["invalid_identity_link", "invalid_confirmation", "identity_actor_mismatch", "invalid_body"].includes(message)) return cors(request, error("invalid_request", 400));
        return cors(request, error("service_unavailable", 503));
      }
    }
    if (request.method === "POST" && url.pathname === "/admin/control-plane/accounts/policy") {
      if (!permitted(actual, "edit")) return cors(request, error("forbidden", 403));
      try {
        const command = await body(request);
        if (Object.keys(command).some((key) => !["accountHandle", "policyId", "policyLabel"].includes(key))) throw new Error("invalid_account_policy");
        const accountHandle = typeof command.accountHandle === "string" ? command.accountHandle.trim() : "";
        const policyId = typeof command.policyId === "string" ? command.policyId.trim() : "";
        if (!accountHandle || !policyId) throw new Error("invalid_account_policy");
        const actorRefHash = await hash(`static-admin:${actual.capability}`);
        return cors(request, json(await deps.repository.assignAccountPolicy({ accountHandle, policyId, actorRefHash })));
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "";
        if (message === "account_not_found" || message === "profile_not_found") return cors(request, error("not_found", 404));
        if (message === "account_ambiguous") return cors(request, error("conflict", 409));
        if (message === "invalid_account_policy" || message === "invalid_body") return cors(request, error("invalid_request", 400));
        return cors(request, error("service_unavailable", 503));
      }
    }
    if (request.method !== "GET") return cors(request, error("not_implemented", 501));
    const page = { limit: limit(url), cursor: url.searchParams.get("cursor") };
    let response: unknown;
    if (url.pathname === "/admin/dashboard/summary") response = await deps.repository.dashboard();
    else if (url.pathname === "/admin/requests") response = await deps.repository.requestEvents({ ...page, status: url.searchParams.get("status") });
    else if (url.pathname === "/admin/usage/summary") response = await deps.repository.usageSummary();
    else if (url.pathname === "/admin/feedback") response = await deps.repository.feedback(page);
    else if (url.pathname === "/admin/control-plane/profiles") response = await deps.repository.workerProfileList();
    else if (url.pathname === "/admin/control-plane/audit") response = { schemaVersion: 1, records: await deps.repository.audit(page.limit) };
    else if (url.pathname === "/admin/control-plane/devices") response = await deps.repository.workerDevices(page);
    else if (url.pathname === "/admin/control-plane/accounts") response = await deps.repository.workerAccounts(page);
    else if (url.pathname === "/admin/control-plane/policy") response = await deps.repository.workerRuntimePolicy();
    else if (url.pathname === "/admin/pricing") response = { watchlist: { required: [], manual: [], merged: [] }, pricing: await deps.repository.pricing() };
    else return cors(request, error("not_found", 404));
    return cors(request, json(response));
  } catch (cause) {
    const invalid = cause instanceof Error && ["cursor_or_limit_invalid", "invalid_body", "listed_linked_principal_required", "invalid_role"].includes(cause.message);
    return cors(request, error(invalid ? "invalid_request" : "service_unavailable", invalid ? 400 : 503));
  }
}
