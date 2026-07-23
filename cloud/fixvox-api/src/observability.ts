import type { BudgetShadowEvidence } from "../../fixvox-core/src/execution/budget-shadow.ts";

const SAFE_LOG_FIELDS = new Set(["requestId", "route", "method", "status", "durationMs", "code"]);

export type SafeLogEvent = {
  requestId: string;
  route: string;
  method: string;
  status: number;
  durationMs: number;
  code?: string;
};

export type Logger = { info(event: SafeLogEvent): void };

export function createAllowlistLogger(write: (line: string) => void = console.log): Logger {
  return {
    info(event) {
      const safe = Object.fromEntries(Object.entries(event).filter(([key]) => SAFE_LOG_FIELDS.has(key)));
      write(JSON.stringify(safe));
    },
  };
}

export function createBudgetShadowReceiptSink(write: (line: string) => void = console.log): (receipt: BudgetShadowEvidence) => void {
  return (receipt) => write(JSON.stringify({ event: "budget_shadow", ...receipt }));
}

export function requestId(): string {
  return crypto.randomUUID();
}
