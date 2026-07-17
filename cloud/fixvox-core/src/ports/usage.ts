export type UsageQuotaReservation = {
  key: string;
  limit: number;
  amount: number;
  resetAt: string;
};

export interface UsageQuotaPort<TResult = unknown> {
  reserve(input: UsageQuotaReservation): Promise<TResult>;
  consume(input: UsageQuotaReservation): Promise<TResult>;
}
