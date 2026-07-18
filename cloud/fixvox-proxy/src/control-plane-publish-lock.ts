import { DurableObject } from "cloudflare:workers";

import type { KvNamespaceLike } from "./admin-store";
import {
  CONTROL_PLANE_ADMIN_AUDIT_STORE_KEY,
  CONTROL_PLANE_PROFILE_PROJECTION_COMMIT_KEY,
  CONTROL_PLANE_PROFILE_VERSION_STORE_KEY,
  ControlPlaneAdminProfileStaleError,
  applyControlPlaneAdminProfile,
  createControlPlaneAdminProfileDraft,
  discardControlPlaneAdminProfileDraft,
  publishControlPlaneAdminProfile,
  rollbackControlPlaneAdminProfile,
  saveControlPlaneAdminProfileDraft,
  type ControlPlaneAdminProfileApplyPayload,
  type ControlPlaneAdminProfileDiscardPayload,
  type ControlPlaneAdminProfileDraftPayload,
  type ControlPlaneAdminProfilePublishPayload,
  type ControlPlaneAdminProfileRollbackPayload,
} from "./control-plane-store";

export const CONTROL_PLANE_PROFILE_MUTATION_OBJECT_NAME = "control-plane-profile-mutations-v1";
const AUTHORITY_KEY = "profile-authority-v1";
const PENDING_MUTATION_KEY = "pending-profile-mutation-v2";

export type ControlPlaneProfileMutationBoundary =
  | "before-projection"
  | "after-profile-projection"
  | "after-projection"
  | "after-commit";

type ProfileMutationEnv = {
  USAGE: KvNamespaceLike;
  /** Test-only crash injection; Worker bindings never provide this member. */
  PROFILE_MUTATION_TEST_HOOK?: (boundary: ControlPlaneProfileMutationBoundary) => Promise<void>;
};

export type ControlPlaneProfileMutationAction = "apply-profile" | "create-draft" | "save-draft" | "discard-draft" | "publish" | "rollback";

export type ControlPlaneProfileMutationEnvelope = {
  action: ControlPlaneProfileMutationAction;
  payload: unknown;
};

type LastCommittedOperation = {
  fingerprint: string;
  responseJson: string;
};

type AuthoritativeProfileState = {
  schemaVersion: 1;
  revision: number;
  profileSnapshot: string | null;
  auditSnapshot: string;
  lastOperation: LastCommittedOperation | null;
};

type PendingMutation = {
  schemaVersion: 1;
  baseRevision: number;
  nextRevision: number;
  fingerprint: string;
  profileSnapshot: string;
  auditSnapshot: string;
  responseJson: string;
};

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function errorStatus(error: unknown): number {
  if (error instanceof ControlPlaneAdminProfileStaleError) return 409;
  const message = error instanceof Error ? error.message : "";
  if (message.includes("not found")) return 404;
  if ([
    "required",
    "invalid ",
    "unknown ",
    "missing ",
    "requires ",
    "referenced by ",
    "already exists",
  ].some((marker) => message.includes(marker))) return 400;
  return 500;
}

function errorResponse(error: unknown, fallbackStatus?: number): Response {
  const status = fallbackStatus ?? errorStatus(error);
  const expected = error instanceof ControlPlaneAdminProfileStaleError;
  const message = status >= 500
    ? "Profile mutation failed closed."
    : error instanceof Error ? error.message : "Unable to mutate profile.";
  return json({
    error: {
      code: expected ? error.code : status >= 500 ? "profile_mutation_failed_closed" : "profile_mutation_rejected",
      message,
    },
  }, status);
}

function isMutationAction(value: unknown): value is ControlPlaneProfileMutationAction {
  return value === "apply-profile" || value === "create-draft" || value === "save-draft" || value === "discard-draft" || value === "publish" || value === "rollback";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function operationFingerprint(action: ControlPlaneProfileMutationAction, payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson({ action, payload }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalSnapshot(raw: string | null): string | null {
  if (raw === null) return null;
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid profile projection bootstrap");
  delete parsed.projection;
  return JSON.stringify(parsed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canonicalProfileSnapshot(raw: string | null): string | null {
  const canonical = canonicalSnapshot(raw);
  if (canonical === null) return null;
  const parsed = JSON.parse(canonical) as { schemaVersion?: unknown; profiles?: unknown };
  if (parsed.schemaVersion !== 1 || !isRecord(parsed.profiles)) throw new Error("invalid profile projection bootstrap");
  return canonical;
}

function canonicalAuditSnapshot(raw: string | null): string | null {
  const canonical = canonicalSnapshot(raw);
  if (canonical === null) return null;
  const parsed = JSON.parse(canonical) as { schemaVersion?: unknown; records?: unknown };
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.records)) throw new Error("invalid profile projection bootstrap");
  return canonical;
}

function projectionSnapshot(raw: string, revision: number): string {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid profile authority snapshot");
  return JSON.stringify({ ...parsed, projection: { authorityRevision: revision } });
}

function snapshotProjectionRevision(raw: string | null): number | null {
  if (raw === null) return null;
  const parsed = JSON.parse(raw) as { projection?: unknown };
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid profile projection bootstrap");
  if (!("projection" in parsed)) return null;
  const projection = parsed.projection;
  if (!projection || typeof projection !== "object" || Array.isArray(projection)) throw new Error("invalid profile projection bootstrap");
  const revision = (projection as { authorityRevision?: unknown }).authorityRevision;
  if (!Number.isSafeInteger(revision) || (revision as number) < 0) throw new Error("invalid profile projection bootstrap");
  return revision as number;
}

function projectionMarkerRevision(raw: string | null): number | null {
  if (raw === null) return null;
  const parsed = JSON.parse(raw) as { schemaVersion?: unknown; authorityRevision?: unknown };
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || parsed.schemaVersion !== 1
    || !Number.isSafeInteger(parsed.authorityRevision)
    || (parsed.authorityRevision as number) < 0) {
    throw new Error("invalid profile projection bootstrap");
  }
  return parsed.authorityRevision as number;
}

function projectionMarker(revision: number): string {
  return JSON.stringify({ schemaVersion: 1, authorityRevision: revision });
}

function isAuthority(value: unknown): value is AuthoritativeProfileState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<AuthoritativeProfileState>;
  return state.schemaVersion === 1
    && Number.isSafeInteger(state.revision)
    && (state.revision ?? -1) >= 0
    && (state.profileSnapshot === null || typeof state.profileSnapshot === "string")
    && typeof state.auditSnapshot === "string"
    && (state.lastOperation === null || Boolean(state.lastOperation && typeof state.lastOperation.fingerprint === "string" && typeof state.lastOperation.responseJson === "string"));
}

function isPending(value: unknown): value is PendingMutation {
  if (!value || typeof value !== "object") return false;
  const pending = value as Partial<PendingMutation>;
  return pending.schemaVersion === 1
    && Number.isSafeInteger(pending.baseRevision)
    && Number.isSafeInteger(pending.nextRevision)
    && typeof pending.fingerprint === "string"
    && typeof pending.profileSnapshot === "string"
    && typeof pending.auditSnapshot === "string"
    && typeof pending.responseJson === "string";
}

class AuthoritativeMutationStore implements KvNamespaceLike {
  profileSnapshot: string | null;
  auditSnapshot: string;

  constructor(
    private readonly projection: KvNamespaceLike,
    authority: AuthoritativeProfileState,
  ) {
    this.profileSnapshot = authority.profileSnapshot;
    this.auditSnapshot = authority.auditSnapshot;
  }

  async get(key: string): Promise<string | null> {
    if (key === CONTROL_PLANE_PROFILE_VERSION_STORE_KEY) return this.profileSnapshot;
    if (key === CONTROL_PLANE_ADMIN_AUDIT_STORE_KEY) return this.auditSnapshot;
    // The mutation helpers are reading the authoritative DO snapshot, not KV;
    // projection commit metadata must not make that internal read look stale.
    if (key === CONTROL_PLANE_PROFILE_PROJECTION_COMMIT_KEY) return null;
    return this.projection.get(key);
  }

  async put(key: string, value: string): Promise<void> {
    if (key === CONTROL_PLANE_PROFILE_VERSION_STORE_KEY) {
      this.profileSnapshot = canonicalProfileSnapshot(value);
      return;
    }
    if (key === CONTROL_PLANE_ADMIN_AUDIT_STORE_KEY) {
      this.auditSnapshot = canonicalAuditSnapshot(value) ?? JSON.stringify({ schemaVersion: 1, records: [] });
      return;
    }
    throw new Error("profile mutation attempted an external write");
  }

  async delete(key: string): Promise<void> {
    if (key === CONTROL_PLANE_PROFILE_VERSION_STORE_KEY) {
      this.profileSnapshot = null;
      return;
    }
    if (key === CONTROL_PLANE_ADMIN_AUDIT_STORE_KEY) {
      this.auditSnapshot = JSON.stringify({ schemaVersion: 1, records: [] });
      return;
    }
    throw new Error("profile mutation attempted an external delete");
  }
}

export class ControlPlanePublishDurableObject extends DurableObject<ProfileMutationEnv> {
  private readonly state: DurableObjectState;
  private readonly env: ProfileMutationEnv;
  private readonly initialization: Promise<void>;
  private projectionHealthy = false;

  constructor(ctx: DurableObjectState, env: ProfileMutationEnv) {
    super(ctx, env);
    this.state = ctx;
    this.env = env;
    this.initialization = this.state.blockConcurrencyWhile(async () => {
      await this.bootstrapAuthority();
      await this.recoverOrProjectAuthority();
    });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      await this.initialization;
    } catch {
      return errorResponse(new Error("Profile mutation authority recovery is unavailable."), 503);
    }

    let response: Response | null = null;
    try {
      await this.state.blockConcurrencyWhile(async () => {
        if (!this.projectionHealthy) await this.recoverOrProjectAuthority();
        response = await this.handle(request);
      });
    } catch {
      this.projectionHealthy = false;
      return errorResponse(new Error("Profile mutation authority is unavailable."), 503);
    }
    return response ?? errorResponse(new Error("Profile mutation authority returned no response."), 503);
  }

  private async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/mutate") return json({ error: { message: "Not found" } }, 404);

    let envelope: Partial<ControlPlaneProfileMutationEnvelope>;
    try {
      envelope = await request.json() as Partial<ControlPlaneProfileMutationEnvelope>;
    } catch {
      return json({ error: { code: "invalid_profile_mutation", message: "Invalid profile mutation payload." } }, 400);
    }
    if (!isMutationAction(envelope.action)) {
      return json({ error: { code: "invalid_profile_mutation", message: "Unknown profile mutation." } }, 400);
    }

    return this.runAuthoritativeMutation(envelope.action, envelope.payload);
  }

  private async readAuthority(): Promise<AuthoritativeProfileState> {
    const authority = await this.state.storage.get<unknown>(AUTHORITY_KEY);
    if (!isAuthority(authority)) throw new Error("invalid profile mutation authority");
    return authority;
  }

  private async readPendingMutation(): Promise<PendingMutation | null> {
    const pending = await this.state.storage.get<unknown>(PENDING_MUTATION_KEY);
    if (pending === undefined) return null;
    if (!isPending(pending)) throw new Error("invalid pending profile mutation");
    return pending;
  }

  private async bootstrapAuthority(): Promise<void> {
    const existing = await this.state.storage.get<unknown>(AUTHORITY_KEY);
    if (existing !== undefined) {
      if (!isAuthority(existing)) throw new Error("invalid profile mutation authority");
      return;
    }

    const [profileSnapshot, auditSnapshot, markerSnapshot] = await Promise.all([
      this.env.USAGE.get(CONTROL_PLANE_PROFILE_VERSION_STORE_KEY),
      this.env.USAGE.get(CONTROL_PLANE_ADMIN_AUDIT_STORE_KEY),
      this.env.USAGE.get(CONTROL_PLANE_PROFILE_PROJECTION_COMMIT_KEY),
    ]);
    const profileRevision = snapshotProjectionRevision(profileSnapshot);
    const auditRevision = snapshotProjectionRevision(auditSnapshot);
    const markerRevision = projectionMarkerRevision(markerSnapshot);
    const hasProjectionState = profileRevision !== null || auditRevision !== null || markerSnapshot !== null;
    if (hasProjectionState) {
      if (profileRevision === null || auditRevision === null || markerRevision === null
        || profileRevision !== auditRevision || markerRevision !== profileRevision) {
        throw new Error("unconfirmed profile projection bootstrap");
      }
      // A new/misidentified object must not reconstruct authority from a KV
      // projection. Only unrevisioned legacy KV is eligible for first bootstrap.
      throw new Error("profile authority already projected; refusing KV-only bootstrap");
    }
    const bootstrap: AuthoritativeProfileState = {
      schemaVersion: 1,
      revision: 0,
      profileSnapshot: canonicalProfileSnapshot(profileSnapshot),
      auditSnapshot: canonicalAuditSnapshot(auditSnapshot) ?? JSON.stringify({ schemaVersion: 1, records: [] }),
      lastOperation: null,
    };
    await this.state.storage.transaction(async (transaction) => {
      const current = await transaction.get<unknown>(AUTHORITY_KEY);
      if (current === undefined) await transaction.put(AUTHORITY_KEY, bootstrap);
      else if (!isAuthority(current)) throw new Error("invalid profile mutation authority");
    });
  }

  private async writeProjectionValues(
    profileSnapshot: string | null,
    auditSnapshot: string,
    revision: number,
  ): Promise<void> {
    if (profileSnapshot !== null) {
      await this.env.USAGE.put(CONTROL_PLANE_PROFILE_VERSION_STORE_KEY, projectionSnapshot(profileSnapshot, revision));
    }
    await this.env.USAGE.put(CONTROL_PLANE_ADMIN_AUDIT_STORE_KEY, projectionSnapshot(auditSnapshot, revision));
  }

  private async confirmProjection(revision: number): Promise<void> {
    await this.env.USAGE.put(CONTROL_PLANE_PROFILE_PROJECTION_COMMIT_KEY, projectionMarker(revision));
  }

  private async recoverOrProjectAuthority(): Promise<void> {
    const authority = await this.readAuthority();
    const pending = await this.readPendingMutation();

    // A pre-commit crash aborts the pending candidate. Re-projecting the last
    // committed authority hides any partially written candidate before deletion.
    // With no materialized profile snapshot, legacy KV is still unprojected; do
    // not create an audit-only marker that would look like a partial projection.
    if (authority.profileSnapshot !== null) {
      await this.writeProjectionValues(authority.profileSnapshot, authority.auditSnapshot, authority.revision);
      await this.confirmProjection(authority.revision);
    }
    if (pending) {
      await this.state.storage.transaction(async (transaction) => {
        const current = await transaction.get<unknown>(PENDING_MUTATION_KEY);
        if (isPending(current) && current.fingerprint === pending.fingerprint && current.baseRevision === pending.baseRevision) {
          await transaction.delete(PENDING_MUTATION_KEY);
        }
      });
    }
    this.projectionHealthy = true;
  }

  private async runMutation(
    store: KvNamespaceLike,
    action: ControlPlaneProfileMutationAction,
    payload: unknown,
  ): Promise<unknown> {
    switch (action) {
      case "apply-profile":
        return applyControlPlaneAdminProfile(store, payload as ControlPlaneAdminProfileApplyPayload);
      case "create-draft":
        return createControlPlaneAdminProfileDraft(store, payload as ControlPlaneAdminProfileDraftPayload);
      case "save-draft":
        return saveControlPlaneAdminProfileDraft(store, payload as ControlPlaneAdminProfileDraftPayload);
      case "discard-draft":
        return discardControlPlaneAdminProfileDraft(store, payload as ControlPlaneAdminProfileDiscardPayload);
      case "publish":
        return publishControlPlaneAdminProfile(store, payload as ControlPlaneAdminProfilePublishPayload);
      case "rollback":
        return rollbackControlPlaneAdminProfile(store, payload as ControlPlaneAdminProfileRollbackPayload);
    }
  }

  private async runAuthoritativeMutation(
    action: ControlPlaneProfileMutationAction,
    payload: unknown,
  ): Promise<Response> {
    const fingerprint = await operationFingerprint(action, payload);
    const authority = await this.readAuthority();
    if (authority.lastOperation?.fingerprint === fingerprint) {
      return new Response(authority.lastOperation.responseJson, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-fixvox-idempotent-replay": "true",
        },
      });
    }

    const mutationStore = new AuthoritativeMutationStore(this.env.USAGE, authority);
    let result: unknown;
    try {
      result = await this.runMutation(mutationStore, action, payload);
    } catch (error) {
      return errorResponse(error);
    }
    if (mutationStore.profileSnapshot === null) {
      return errorResponse(new Error("Profile mutation produced no authoritative snapshot."), 503);
    }

    const responseJson = JSON.stringify(result);
    const pending: PendingMutation = {
      schemaVersion: 1,
      baseRevision: authority.revision,
      nextRevision: authority.revision + 1,
      fingerprint,
      profileSnapshot: mutationStore.profileSnapshot,
      auditSnapshot: mutationStore.auditSnapshot,
      responseJson,
    };
    let pendingWritten = false;

    try {
      await this.state.storage.transaction(async (transaction) => {
        const currentAuthority = await transaction.get<unknown>(AUTHORITY_KEY);
        const currentPending = await transaction.get<unknown>(PENDING_MUTATION_KEY);
        if (!isAuthority(currentAuthority) || currentAuthority.revision !== pending.baseRevision || currentPending !== undefined) {
          throw new Error("profile authority revision changed");
        }
        await transaction.put(PENDING_MUTATION_KEY, pending);
      });
      pendingWritten = true;

      await this.env.PROFILE_MUTATION_TEST_HOOK?.("before-projection");
      await this.env.USAGE.put(
        CONTROL_PLANE_PROFILE_VERSION_STORE_KEY,
        projectionSnapshot(pending.profileSnapshot, pending.nextRevision),
      );
      await this.env.PROFILE_MUTATION_TEST_HOOK?.("after-profile-projection");
      await this.env.USAGE.put(
        CONTROL_PLANE_ADMIN_AUDIT_STORE_KEY,
        projectionSnapshot(pending.auditSnapshot, pending.nextRevision),
      );
      await this.env.PROFILE_MUTATION_TEST_HOOK?.("after-projection");

      await this.state.storage.transaction(async (transaction) => {
        const currentAuthority = await transaction.get<unknown>(AUTHORITY_KEY);
        const currentPending = await transaction.get<unknown>(PENDING_MUTATION_KEY);
        if (!isAuthority(currentAuthority)
          || currentAuthority.revision !== pending.baseRevision
          || !isPending(currentPending)
          || currentPending.fingerprint !== pending.fingerprint) {
          throw new Error("profile authority commit conflict");
        }
        const committed: AuthoritativeProfileState = {
          schemaVersion: 1,
          revision: pending.nextRevision,
          profileSnapshot: pending.profileSnapshot,
          auditSnapshot: pending.auditSnapshot,
          lastOperation: { fingerprint: pending.fingerprint, responseJson: pending.responseJson },
        };
        await transaction.put(AUTHORITY_KEY, committed);
        await transaction.delete(PENDING_MUTATION_KEY);
      });
      await this.confirmProjection(pending.nextRevision);
      this.projectionHealthy = true;
      await this.env.PROFILE_MUTATION_TEST_HOOK?.("after-commit");
      return new Response(responseJson, {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    } catch (error) {
      this.projectionHealthy = false;
      if (error instanceof Error && error.name === "SimulatedDurableObjectCrash") throw error;
      if (pendingWritten) {
        try {
          await this.recoverOrProjectAuthority();
        } catch {
          return errorResponse(new Error("Profile mutation recovery is unavailable."), 503);
        }
      }
      return errorResponse(new Error("Profile projection is unavailable."), 503);
    }
  }
}

export async function dispatchControlPlaneProfileMutation(
  namespace: DurableObjectNamespace<ControlPlanePublishDurableObject>,
  action: ControlPlaneProfileMutationAction,
  payload: unknown,
): Promise<Response> {
  const id = namespace.idFromName(CONTROL_PLANE_PROFILE_MUTATION_OBJECT_NAME);
  const stub = namespace.get(id);
  return stub.fetch("https://control-plane-profile-mutations/mutate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, payload } satisfies ControlPlaneProfileMutationEnvelope),
  });
}
