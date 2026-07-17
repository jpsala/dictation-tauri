import { createJsonAuthSessionStore } from "../../../fixvox-core/src/auth/session-store";
import type {
  AuthSessionPort,
  BackgroundJobSchedulerPort,
  ControlPlaneStoragePort,
  ProfilePublicationPort,
  ProviderPort,
  RequestEventPort,
} from "../../../fixvox-core/src/ports";
import { persistRequestEvent, type AdminRequestEvent, type KvNamespaceLike } from "../admin-store";
import {
  dispatchControlPlaneProfileMutation,
  type ControlPlaneProfileMutationAction,
} from "../control-plane-publish-lock";

export function createWorkerStoragePort(store: KvNamespaceLike): ControlPlaneStoragePort {
  return store;
}

export function createWorkerAuthSessionStore(store: KvNamespaceLike) {
  const port: AuthSessionPort = {
    get: (key) => store.get(key),
    put: (key, value, ttlSeconds) => store.put(key, value, { expirationTtl: ttlSeconds }),
    delete: store.delete ? (key) => store.delete!(key) : undefined,
  };
  return createJsonAuthSessionStore(port);
}

export function createWorkerProviderPort(fetchImplementation: typeof fetch = fetch): ProviderPort {
  return { fetch: (input, init) => fetchImplementation(input, init) };
}

export function createWorkerRequestEventPort(store: KvNamespaceLike): RequestEventPort<AdminRequestEvent> {
  return { append: (event) => persistRequestEvent(store, event) };
}

export function createWorkerJobScheduler(ctx: { waitUntil(task: Promise<unknown>): void }): BackgroundJobSchedulerPort {
  return { schedule: (task) => ctx.waitUntil(task) };
}

export function createWorkerProfilePublicationPort(
  namespace: Parameters<typeof dispatchControlPlaneProfileMutation>[0],
): ProfilePublicationPort<ControlPlaneProfileMutationAction, Response> {
  return {
    mutate: (action, payload) => dispatchControlPlaneProfileMutation(namespace, action, payload),
  };
}
