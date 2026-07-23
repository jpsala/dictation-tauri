export type BudgetScope = {
  type: "device";
  id: string;
};

export type BudgetLimits = {
  dailyMicrousd: number | null;
  monthlyMicrousd: number | null;
};

export type BudgetPeriodSnapshot = {
  periodKey: string;
  spentMicrousd: number;
  reservedMicrousd: number;
  revision: number;
};

export type BudgetSnapshot = {
  daily: BudgetPeriodSnapshot;
  monthly: BudgetPeriodSnapshot;
};

export type BudgetDecisionReason =
  | "daily_limit"
  | "monthly_limit"
  | "ledger_unavailable"
  | "reservation_inactive"
  | null;

export type BudgetReserveDecision = {
  allowed: boolean;
  reason: BudgetDecisionReason;
  reservationId: string | null;
  idempotent: boolean;
  snapshot: BudgetSnapshot | null;
};

export type BudgetReservationInput = {
  requestId: string;
  scope: BudgetScope;
  mode: "block" | "warn";
  limits: BudgetLimits;
  estimatedMicrousd: number;
  occurredAt: string;
  expiresAt: string;
};

export type BudgetSettlementResult = {
  state: "settled";
  idempotent: boolean;
  snapshot: BudgetSnapshot;
};

export type BudgetReleaseResult = {
  state: "released" | "expired";
  idempotent: boolean;
  snapshot: BudgetSnapshot;
};

export interface BudgetLedgerPort {
  reserve(input: BudgetReservationInput): Promise<BudgetReserveDecision>;
  settle(input: { requestId: string; actualMicrousd: number }): Promise<BudgetSettlementResult>;
  release(input: { requestId: string; reason: "released" | "expired" }): Promise<BudgetReleaseResult>;
  snapshot(input: { scope: BudgetScope; occurredAt: string }): Promise<BudgetSnapshot>;
}
