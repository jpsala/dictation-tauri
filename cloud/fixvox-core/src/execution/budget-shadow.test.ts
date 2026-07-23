// @ts-expect-error Bun provides this module in `bun test`; root TS config does not ship Bun ambient types.
import { describe, expect, test } from "bun:test";

import type { BudgetReserveDecision } from "../ports/budget-ledger";
import { compareBudgetLedgerShadow } from "./budget-shadow";

function ledgerDecision(allowed: boolean, reason: BudgetReserveDecision["reason"] = null): BudgetReserveDecision {
  return {
    allowed,
    reason,
    reservationId: allowed ? "redacted-in-test" : null,
    idempotent: false,
    snapshot: null,
  };
}

describe("budget ledger shadow comparison", () => {
  test("reports matching allow and block decisions without changing legacy authority", async () => {
    const allow = await compareBudgetLedgerShadow({
      legacy: { allowed: true, reason: null },
      evaluateLedger: async () => ledgerDecision(true),
    });
    expect(allow.authoritative).toEqual({ allowed: true, reason: null });
    expect(allow.evidence).toEqual({
      status: "match",
      legacyAllowed: true,
      ledgerAllowed: true,
      legacyReason: null,
      ledgerReason: null,
    });

    const block = await compareBudgetLedgerShadow({
      legacy: { allowed: false, reason: "daily_limit" },
      evaluateLedger: async () => ledgerDecision(false, "daily_limit"),
    });
    expect(block.authoritative.allowed).toBe(false);
    expect(block.evidence.status).toBe("match");
  });

  test("reports mismatches while preserving the legacy response", async () => {
    const result = await compareBudgetLedgerShadow({
      legacy: { allowed: true, reason: null },
      evaluateLedger: async () => ledgerDecision(false, "monthly_limit"),
    });
    expect(result.authoritative.allowed).toBe(true);
    expect(result.evidence).toEqual({
      status: "mismatch",
      legacyAllowed: true,
      ledgerAllowed: false,
      legacyReason: null,
      ledgerReason: "monthly_limit",
    });

    const differentBlockReason = await compareBudgetLedgerShadow({
      legacy: { allowed: false, reason: "daily_limit" },
      evaluateLedger: async () => ledgerDecision(false, "monthly_limit"),
    });
    expect(differentBlockReason.authoritative.reason).toBe("daily_limit");
    expect(differentBlockReason.evidence.status).toBe("mismatch");
  });

  test("can compare execution allow/block parity when legacy has no monetary reason", async () => {
    const result = await compareBudgetLedgerShadow({
      legacy: { allowed: false, reason: "legacy_block" },
      compareReasons: false,
      evaluateLedger: async () => ledgerDecision(false, "daily_limit"),
    });
    expect(result.authoritative).toEqual({ allowed: false, reason: "legacy_block" });
    expect(result.evidence.status).toBe("match");
    expect(result.evidence.ledgerReason).toBe("daily_limit");
  });

  test("omits ledger identifiers and amounts from the shadow receipt", async () => {
    const privateRequestId = "legacy-request-private";
    const privateAmount = 987_654;
    const result = await compareBudgetLedgerShadow({
      legacy: { allowed: true, reason: null },
      evaluateLedger: async () => ({
        ...ledgerDecision(true),
        reservationId: privateRequestId,
        snapshot: {
          daily: { periodKey: "2026-07-21", spentMicrousd: privateAmount, reservedMicrousd: 0, revision: 1 },
          monthly: { periodKey: "2026-07-01", spentMicrousd: privateAmount, reservedMicrousd: 0, revision: 1 },
        },
      }),
    });
    const receipt = JSON.stringify(result);
    expect(result.evidence.status).toBe("match");
    expect(receipt).not.toContain(privateRequestId);
    expect(receipt).not.toContain(String(privateAmount));
  });

  test("reduces thrown and fail-closed ledger errors to redacted evidence", async () => {
    const thrown = await compareBudgetLedgerShadow({
      legacy: { allowed: true, reason: null },
      evaluateLedger: async () => { throw new Error("contains-private-details"); },
    });
    expect(thrown.authoritative.allowed).toBe(true);
    expect(thrown.evidence).toEqual({
      status: "error",
      legacyAllowed: true,
      ledgerAllowed: null,
      legacyReason: null,
      ledgerReason: "ledger_unavailable",
    });
    expect(JSON.stringify(thrown)).not.toContain("private");

    const failClosed = await compareBudgetLedgerShadow({
      legacy: { allowed: true, reason: null },
      evaluateLedger: async () => ledgerDecision(false, "ledger_unavailable"),
    });
    expect(failClosed.authoritative.allowed).toBe(true);
    expect(failClosed.evidence.status).toBe("error");
  });
});
