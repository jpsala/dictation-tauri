export type PolicyOption = {
  policyId: string;
  policyLabel?: string | null;
};

export type PolicyGroupOption = {
  id: string;
  policyId?: string | null;
  policyLabel?: string | null;
};

export type EffectiveRuntimeProfile = {
  policyId: string | null;
  policyLabel: string | null;
  policySource: "account" | "device" | "group" | "base";
  accountHandle: string | null;
  accountBudget: { dailyUsd: number | null; monthlyUsd: number | null; mode: "block" | "warn" } | null;
  groups: string[];
  matchedGroup: string | null;
};

type EffectiveProfileInput = {
  basePolicyId: string | null;
  basePolicyLabel: string | null;
  defaultPolicyId: string;
  accountHandle: string | null;
  accountBudget: EffectiveRuntimeProfile["accountBudget"];
  accountAssignment: PolicyOption | null;
  activeGroups: string[];
  groupOptions: PolicyGroupOption[];
  policyOptions: PolicyOption[];
};

function formatPolicyLabel(policyId: string): string {
  return policyId
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ") || policyId;
}

function policyLabel(options: PolicyOption[], policyId: string, fallback?: string | null): string {
  return options.find((option) => option.policyId === policyId)?.policyLabel ?? fallback ?? formatPolicyLabel(policyId);
}

export function resolveEffectiveRuntimeProfile(input: EffectiveProfileInput): EffectiveRuntimeProfile {
  const common = {
    accountHandle: input.accountHandle,
    accountBudget: input.accountBudget,
    groups: input.activeGroups,
  };
  const groupMatch = input.activeGroups
    .map((groupId) => input.groupOptions.find((option) => option.id === groupId && option.policyId))
    .find((option): option is PolicyGroupOption & { policyId: string } => Boolean(
      option?.policyId && input.policyOptions.some((policy) => policy.policyId === option.policyId),
    ));

  if (input.accountAssignment) {
    return {
      ...common,
      policyId: input.accountAssignment.policyId,
      policyLabel: policyLabel(input.policyOptions, input.accountAssignment.policyId, input.accountAssignment.policyLabel),
      policySource: "account",
      matchedGroup: null,
    };
  }

  if (
    input.basePolicyId
    && input.basePolicyId !== input.defaultPolicyId
    && input.policyOptions.some((option) => option.policyId === input.basePolicyId)
  ) {
    return {
      ...common,
      policyId: input.basePolicyId,
      policyLabel: policyLabel(input.policyOptions, input.basePolicyId, input.basePolicyLabel),
      policySource: "device",
      matchedGroup: null,
    };
  }

  if (groupMatch) {
    return {
      ...common,
      policyId: groupMatch.policyId,
      policyLabel: groupMatch.policyLabel ?? policyLabel(input.policyOptions, groupMatch.policyId),
      policySource: "group",
      matchedGroup: groupMatch.id,
    };
  }

  return {
    ...common,
    policyId: input.basePolicyId,
    policyLabel: input.basePolicyId
      ? policyLabel(input.policyOptions, input.basePolicyId, input.basePolicyLabel)
      : input.basePolicyLabel,
    policySource: "base",
    matchedGroup: null,
  };
}
