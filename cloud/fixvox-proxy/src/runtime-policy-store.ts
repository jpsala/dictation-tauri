import {
  asJsonRecord,
  cloneJsonValue,
  jsonRecordsEqual,
  parseJson,
} from "../../fixvox-core/src/control-plane/policy-values";
import {
  buildDefaultRuntimePolicy,
  validateRuntimePolicy,
} from "../../fixvox-core/src/control-plane/runtime-policy";
import type {
  RuntimePolicyEnvelope,
  RuntimePolicyReadResult,
} from "../../fixvox-core/src/control-plane/runtime-policy";
import type { KvNamespaceLike } from "./admin-store";

export {
  buildDefaultRuntimePolicy,
  buildFeatureFlagsFromRuntimePolicy,
  buildRecommendedAlphaRuntimePolicy,
  buildRegisterDefaultsFromRuntimePolicy,
  buildTransportPolicyFromRuntimePolicy,
  resolveVoiceRoutingForCohorts,
} from "../../fixvox-core/src/control-plane/runtime-policy";
export type {
  RegisterSelectionPresetDefault,
  RegisterUserSettingsDefaults,
  RuntimePolicyEnvelope,
  RuntimePolicyReadResult,
  VoiceRoutingLabel,
  VoiceRoutingResolved,
} from "../../fixvox-core/src/control-plane/runtime-policy";

const RUNTIME_POLICY_KEY = "control:policy:runtime";

function nowIso(): string {
  return new Date().toISOString();
}

export async function getRuntimePolicy(store: KvNamespaceLike): Promise<RuntimePolicyReadResult> {
  const raw = await store.get(RUNTIME_POLICY_KEY);
  const parsed = parseJson<RuntimePolicyEnvelope | null>(raw, null);
  const policy = asJsonRecord(parsed?.policy);
  if (!policy) {
    return {
      policy: buildDefaultRuntimePolicy(),
      updatedAt: nowIso(),
      source: "default",
    };
  }

  return {
    policy: cloneJsonValue(policy),
    updatedAt: typeof parsed?.updatedAt === "string" && parsed.updatedAt.trim() ? parsed.updatedAt : nowIso(),
    source: "stored",
  };
}

export async function putRuntimePolicy(store: KvNamespaceLike, input: unknown): Promise<RuntimePolicyEnvelope> {
  const inputRecord = asJsonRecord(input);
  const candidate = inputRecord ?? asJsonRecord(asJsonRecord(input)?.policy);
  if (!candidate) {
    throw new Error("runtime policy payload must be a JSON object");
  }

  validateRuntimePolicy(candidate);

  const existing = await getRuntimePolicy(store);
  if (existing.source === "stored" && jsonRecordsEqual(existing.policy, candidate)) {
    return {
      policy: cloneJsonValue(existing.policy),
      updatedAt: existing.updatedAt,
    };
  }

  const envelope: RuntimePolicyEnvelope = {
    policy: cloneJsonValue(candidate),
    updatedAt: nowIso(),
  };
  await store.put(RUNTIME_POLICY_KEY, JSON.stringify(envelope, null, 2));
  return envelope;
}

export async function resetRuntimePolicy(store: KvNamespaceLike): Promise<RuntimePolicyEnvelope> {
  const envelope: RuntimePolicyEnvelope = {
    policy: buildDefaultRuntimePolicy(),
    updatedAt: nowIso(),
  };
  await store.put(RUNTIME_POLICY_KEY, JSON.stringify(envelope, null, 2));
  return envelope;
}
