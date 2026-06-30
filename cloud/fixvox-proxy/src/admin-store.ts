export interface KvNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export type AdminRequestEvent = {
  id: string;
  ts: string;
  deviceId: string;
  provider: string;
  model: string;
  context: string;
  status: "success" | "error";
  transportMode: "proxied";
  costAuthority: "backend-reported";
  inputChars: number;
  outputChars: number;
  inputSeconds: number | null;
  outputSeconds: number | null;
  durationMs: number;
  ttftMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  actualCostUsd: number | null;
  billedCostUsd: number | null;
  pricingSource: string | null;
  providerRequestId: string | null;
  backendRequestId: string;
  usageKey: string | null;
  usageLimit: number | null;
  usageRemaining: number | null;
  usageResetAt: string | null;
  errorMessage: string | null;
};

type RecentIndexEntry = {
  id: string;
  ts: string;
};

type DailyModelSummary = {
  provider: string;
  model: string;
  requestCount: number;
  totalCostUsd: number;
  totalTokens: number;
};

type DailyContextSummary = {
  context: string;
  requestCount: number;
  totalCostUsd: number;
};

type DailyUsageSummary = {
  day: string;
  requestCount: number;
  totalCostUsd: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  byModel: Record<string, DailyModelSummary>;
  byContext: Record<string, DailyContextSummary>;
};

export type DashboardSummary = {
  today: DailyUsageSummary;
  last7d: {
    requestCount: number;
    totalCostUsd: number;
    totalTokens: number;
  };
  topModels7d: DailyModelSummary[];
  recentErrors: AdminRequestEvent[];
};

export type UsageSummary = {
  today: DailyUsageSummary;
  last7d: {
    requestCount: number;
    totalCostUsd: number;
    totalTokens: number;
  };
  byDay: DailyUsageSummary[];
};

export type RequestListFilters = {
  provider?: string | null;
  model?: string | null;
  context?: string | null;
  status?: string | null;
  deviceId?: string | null;
  q?: string | null;
  limit?: number | null;
  cursor?: string | null;
};

const RECENT_INDEX_KEY = "telemetry:requests:recent";
const RECENT_INDEX_LIMIT = 500;
const TELEMETRY_TTL_SECONDS = 60 * 60 * 24 * 30;

function roundUsd(value: number): number {
  return Number(value.toFixed(8));
}

function eventKey(id: string): string {
  return `telemetry:request:${id}`;
}

function usageDayKey(day: string): string {
  return `telemetry:usage:day:${day}`;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function createEmptyDailyUsageSummary(day: string): DailyUsageSummary {
  return {
    day,
    requestCount: 0,
    totalCostUsd: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    byModel: {},
    byContext: {},
  };
}

function getDay(ts: string): string {
  return ts.slice(0, 10);
}

function getDateDaysAgo(daysAgo: number): string {
  const now = new Date();
  const next = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

async function readRecentIndex(store: KvNamespaceLike): Promise<RecentIndexEntry[]> {
  return parseJson<RecentIndexEntry[]>(await store.get(RECENT_INDEX_KEY), []);
}

async function writeRecentIndex(store: KvNamespaceLike, items: RecentIndexEntry[]): Promise<void> {
  await store.put(RECENT_INDEX_KEY, JSON.stringify(items.slice(0, RECENT_INDEX_LIMIT)), {
    expirationTtl: TELEMETRY_TTL_SECONDS,
  });
}

async function readDailyUsage(store: KvNamespaceLike, day: string): Promise<DailyUsageSummary> {
  return parseJson<DailyUsageSummary>(await store.get(usageDayKey(day)), createEmptyDailyUsageSummary(day));
}

async function writeDailyUsage(store: KvNamespaceLike, summary: DailyUsageSummary): Promise<void> {
  await store.put(usageDayKey(summary.day), JSON.stringify(summary), {
    expirationTtl: TELEMETRY_TTL_SECONDS,
  });
}

function matchesQuery(event: AdminRequestEvent, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return event.provider.toLowerCase().includes(normalized)
    || event.model.toLowerCase().includes(normalized)
    || event.context.toLowerCase().includes(normalized)
    || event.status.toLowerCase().includes(normalized)
    || event.deviceId.toLowerCase().includes(normalized)
    || (event.providerRequestId ?? "").toLowerCase().includes(normalized)
    || (event.backendRequestId ?? "").toLowerCase().includes(normalized)
    || (event.errorMessage ?? "").toLowerCase().includes(normalized);
}

function sortByNewest(a: AdminRequestEvent, b: AdminRequestEvent): number {
  return b.ts.localeCompare(a.ts);
}

function materializeModelSummaries(map: Record<string, DailyModelSummary>): DailyModelSummary[] {
  return Object.values(map).sort((a, b) => {
    if (b.totalCostUsd !== a.totalCostUsd) return b.totalCostUsd - a.totalCostUsd;
    return b.requestCount - a.requestCount;
  });
}

export async function persistRequestEvent(store: KvNamespaceLike, event: AdminRequestEvent): Promise<void> {
  const day = getDay(event.ts);
  const billedCostUsd = event.billedCostUsd ?? 0;
  const promptTokens = event.promptTokens ?? 0;
  const completionTokens = event.completionTokens ?? 0;
  const totalTokens = event.totalTokens ?? 0;
  const modelKey = `${event.provider}:${event.model}`;

  await store.put(eventKey(event.id), JSON.stringify(event), {
    expirationTtl: TELEMETRY_TTL_SECONDS,
  });

  const recent = await readRecentIndex(store);
  const nextRecent = [
    { id: event.id, ts: event.ts },
    ...recent.filter((item) => item.id !== event.id),
  ];
  await writeRecentIndex(store, nextRecent);

  const daily = await readDailyUsage(store, day);
  daily.requestCount += 1;
  daily.totalCostUsd = roundUsd(daily.totalCostUsd + billedCostUsd);
  daily.promptTokens += promptTokens;
  daily.completionTokens += completionTokens;
  daily.totalTokens += totalTokens;

  const existingModel = daily.byModel[modelKey] ?? {
    provider: event.provider,
    model: event.model,
    requestCount: 0,
    totalCostUsd: 0,
    totalTokens: 0,
  };
  existingModel.requestCount += 1;
  existingModel.totalCostUsd = roundUsd(existingModel.totalCostUsd + billedCostUsd);
  existingModel.totalTokens += totalTokens;
  daily.byModel[modelKey] = existingModel;

  const existingContext = daily.byContext[event.context] ?? {
    context: event.context,
    requestCount: 0,
    totalCostUsd: 0,
  };
  existingContext.requestCount += 1;
  existingContext.totalCostUsd = roundUsd(existingContext.totalCostUsd + billedCostUsd);
  daily.byContext[event.context] = existingContext;

  await writeDailyUsage(store, daily);
}

export async function listRequestEvents(
  store: KvNamespaceLike,
  filters: RequestListFilters = {},
): Promise<{ items: AdminRequestEvent[]; nextCursor: string | null }> {
  const recent = await readRecentIndex(store);
  const limit = Math.min(100, Math.max(1, Number(filters.limit ?? 50) || 50));
  const offset = Math.max(0, Number(filters.cursor ?? 0) || 0);
  const window = recent.slice(offset, offset + 250);
  const events = (await Promise.all(
    window.map(async (item) => parseJson<AdminRequestEvent | null>(await store.get(eventKey(item.id)), null)),
  )).filter((value): value is AdminRequestEvent => Boolean(value)).sort(sortByNewest);

  const filtered = events.filter((event) => {
    if (filters.provider && event.provider !== filters.provider) return false;
    if (filters.model && event.model !== filters.model) return false;
    if (filters.context && event.context !== filters.context) return false;
    if (filters.status && event.status !== filters.status) return false;
    if (filters.deviceId && event.deviceId !== filters.deviceId) return false;
    if (filters.q && !matchesQuery(event, filters.q)) return false;
    return true;
  });

  const items = filtered.slice(0, limit);
  const nextCursor = filtered.length > limit ? String(offset + limit) : (recent.length > offset + window.length ? String(offset + window.length) : null);
  return { items, nextCursor };
}

export async function getDashboardSummary(store: KvNamespaceLike): Promise<DashboardSummary> {
  const today = await readDailyUsage(store, getDateDaysAgo(0));
  const last7dDays = await Promise.all(Array.from({ length: 7 }, (_, index) => readDailyUsage(store, getDateDaysAgo(index))));
  const recentErrors = (await listRequestEvents(store, { limit: 20 })).items.filter((event) => event.status === "error").slice(0, 5);
  const topModelsMap: Record<string, DailyModelSummary> = {};

  let requestCount = 0;
  let totalCostUsd = 0;
  let totalTokens = 0;

  for (const day of last7dDays) {
    requestCount += day.requestCount;
    totalCostUsd = roundUsd(totalCostUsd + day.totalCostUsd);
    totalTokens += day.totalTokens;
    for (const [key, value] of Object.entries(day.byModel)) {
      const current = topModelsMap[key] ?? {
        provider: value.provider,
        model: value.model,
        requestCount: 0,
        totalCostUsd: 0,
        totalTokens: 0,
      };
      current.requestCount += value.requestCount;
      current.totalCostUsd = roundUsd(current.totalCostUsd + value.totalCostUsd);
      current.totalTokens += value.totalTokens;
      topModelsMap[key] = current;
    }
  }

  return {
    today,
    last7d: {
      requestCount,
      totalCostUsd,
      totalTokens,
    },
    topModels7d: materializeModelSummaries(topModelsMap).slice(0, 10),
    recentErrors,
  };
}

export async function getUsageSummary(store: KvNamespaceLike, days = 30): Promise<UsageSummary> {
  const byDay = await Promise.all(
    Array.from({ length: days }, (_, index) => readDailyUsage(store, getDateDaysAgo(index))),
  );

  let requestCount = 0;
  let totalCostUsd = 0;
  let totalTokens = 0;

  for (const day of byDay.slice(0, 7)) {
    requestCount += day.requestCount;
    totalCostUsd = roundUsd(totalCostUsd + day.totalCostUsd);
    totalTokens += day.totalTokens;
  }

  return {
    today: byDay[0] ?? createEmptyDailyUsageSummary(getDateDaysAgo(0)),
    last7d: {
      requestCount,
      totalCostUsd,
      totalTokens,
    },
    byDay: byDay.reverse(),
  };
}
