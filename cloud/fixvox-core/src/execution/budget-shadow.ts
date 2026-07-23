import type { BudgetDecisionReason, BudgetReserveDecision } from "../ports/budget-ledger";

export type LegacyBudgetDecision = {
  allowed: boolean;
  reason: "daily_limit" | "monthly_limit" | "legacy_block" | null;
};

export type BudgetShadowEvidence = {
  status: "match" | "mismatch" | "error";
  legacyAllowed: boolean;
  ledgerAllowed: boolean | null;
  legacyReason: LegacyBudgetDecision["reason"];
  ledgerReason: BudgetDecisionReason;
};

export async function compareBudgetLedgerShadow(input: {
  legacy: LegacyBudgetDecision;
  evaluateLedger: () => Promise<BudgetReserveDecision>;
  compareReasons?: boolean;
}): Promise<{ authoritative: LegacyBudgetDecision; evidence: BudgetShadowEvidence }> {
  try {
    const ledger = await input.evaluateLedger();
    const unavailable = ledger.reason === "ledger_unavailable";
    let status: BudgetShadowEvidence["status"] = "mismatch";
    if (unavailable) status = "error";
    else if (ledger.allowed === input.legacy.allowed && (input.compareReasons === false || ledger.reason === input.legacy.reason)) status = "match";
    return {
      authoritative: input.legacy,
      evidence: {
        status,
        legacyAllowed: input.legacy.allowed,
        ledgerAllowed: ledger.allowed,
        legacyReason: input.legacy.reason,
        ledgerReason: ledger.reason,
      },
    };
  } catch {
    return {
      authoritative: input.legacy,
      evidence: {
        status: "error",
        legacyAllowed: input.legacy.allowed,
        ledgerAllowed: null,
        legacyReason: input.legacy.reason,
        ledgerReason: "ledger_unavailable",
      },
    };
  }
}
