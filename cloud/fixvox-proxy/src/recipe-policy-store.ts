import {
  asJsonRecord,
  cloneJsonValue,
  jsonRecordsEqual,
  parseJson,
} from "../../fixvox-core/src/control-plane/policy-values";
import { buildDefaultRecipePolicy } from "../../fixvox-core/src/control-plane/recipe-policy";
import type {
  RecipePolicyEnvelope,
  RecipePolicyReadResult,
} from "../../fixvox-core/src/control-plane/recipe-policy";
import type { KvNamespaceLike } from "./admin-store";

export { buildDefaultRecipePolicy } from "../../fixvox-core/src/control-plane/recipe-policy";
export type {
  RecipePolicyEnvelope,
  RecipePolicyReadResult,
} from "../../fixvox-core/src/control-plane/recipe-policy";

const RECIPE_POLICY_KEY = "control:policy:recipes";

function nowIso(): string {
  return new Date().toISOString();
}

export async function getRecipePolicy(store: KvNamespaceLike): Promise<RecipePolicyReadResult> {
  const raw = await store.get(RECIPE_POLICY_KEY);
  const parsed = parseJson<RecipePolicyEnvelope | null>(raw, null);
  const policy = asJsonRecord(parsed?.policy);
  if (!policy) {
    return {
      policy: buildDefaultRecipePolicy(),
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

export async function putRecipePolicy(store: KvNamespaceLike, input: unknown): Promise<RecipePolicyEnvelope> {
  const inputRecord = asJsonRecord(input);
  const candidate = inputRecord ?? asJsonRecord(asJsonRecord(input)?.policy);
  if (!candidate) {
    throw new Error("recipe policy payload must be a JSON object");
  }

  const existing = await getRecipePolicy(store);
  if (existing.source === "stored" && jsonRecordsEqual(existing.policy, candidate)) {
    return {
      policy: cloneJsonValue(existing.policy),
      updatedAt: existing.updatedAt,
    };
  }

  const envelope: RecipePolicyEnvelope = {
    policy: cloneJsonValue(candidate),
    updatedAt: nowIso(),
  };
  await store.put(RECIPE_POLICY_KEY, JSON.stringify(envelope, null, 2));
  return envelope;
}

export async function resetRecipePolicy(store: KvNamespaceLike): Promise<RecipePolicyEnvelope> {
  const envelope: RecipePolicyEnvelope = {
    policy: buildDefaultRecipePolicy(),
    updatedAt: nowIso(),
  };
  await store.put(RECIPE_POLICY_KEY, JSON.stringify(envelope, null, 2));
  return envelope;
}
