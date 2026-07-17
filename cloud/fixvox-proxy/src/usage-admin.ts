import { listRequestEvents, type AdminRequestEvent, type KvNamespaceLike } from "./admin-store";
import {
  listControlPlaneAdminDevices,
  redactLongIdentifier,
  type ControlPlaneAdminDeviceRow,
  type ManagedQuotaName,
} from "./control-plane-store";

const EVENT_LIMIT = 100;
const DEVICE_LIMIT = 20;
const PREWARM_CONCURRENCY = 8;

type PrewarmDay = {
  day: string;
  attempts: number;
  successes: number;
  failures: number;
  lastObservedAt: string;
};

type PrewarmSummary = {
  available: boolean;
  attempts: number;
  successes: number;
  failures: number;
};

type QuotaSummary = {
  state: "ok" | "almost_used" | "blocked" | "paused";
  rolling5hRemaining: number;
  weeklyRemaining: number;
};

export type UsageAdminRow = {
  accountHandle: string | null;
  deviceHandle: string;
  status: ControlPlaneAdminDeviceRow["status"];
  sttSeconds: number;
  llmActions: number;
  failures: number;
  prewarm: PrewarmSummary;
  quota: Record<ManagedQuotaName, QuotaSummary>;
};

export type UsageAdminProjection = {
  rows: UsageAdminRow[];
  coverage: {
    knownDevices: number;
    deviceCap: number;
    recentEvents: number;
    recentEventCap: number;
    eventsPartial: boolean;
    oldestEventAt: string | null;
    newestEventAt: string | null;
    prewarmRetentionDays: 7;
    prewarmUnavailableDevices: number;
  };
};

type UsageCounterNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
};

function emptyPrewarm(available: boolean): PrewarmSummary {
  return { available, attempts: 0, successes: 0, failures: 0 };
}

async function readPrewarmSummary(
  namespace: UsageCounterNamespace,
  deviceId: string,
): Promise<PrewarmSummary> {
  try {
    const id = namespace.idFromName(`prewarm-observation:${deviceId}`);
    const response = await namespace.get(id).fetch("https://usage-counter/prewarm-summary");
    if (!response.ok) return emptyPrewarm(false);
    const payload = await response.json() as { days?: unknown };
    if (!Array.isArray(payload.days)) return emptyPrewarm(false);
    return payload.days.reduce<PrewarmSummary>((summary, value) => {
      if (!value || typeof value !== "object") return summary;
      const day = value as Partial<PrewarmDay>;
      summary.attempts += Number.isFinite(day.attempts) ? Number(day.attempts) : 0;
      summary.successes += Number.isFinite(day.successes) ? Number(day.successes) : 0;
      summary.failures += Number.isFinite(day.failures) ? Number(day.failures) : 0;
      return summary;
    }, emptyPrewarm(true));
  } catch {
    return emptyPrewarm(false);
  }
}

async function readPrewarmByDevice(
  namespace: UsageCounterNamespace,
  devices: ControlPlaneAdminDeviceRow[],
): Promise<Map<string, PrewarmSummary>> {
  const result = new Map<string, PrewarmSummary>();
  for (let offset = 0; offset < devices.length; offset += PREWARM_CONCURRENCY) {
    const batch = devices.slice(offset, offset + PREWARM_CONCURRENCY);
    const summaries = await Promise.all(batch.map(async (device) => ({
      deviceId: device.deviceId,
      summary: await readPrewarmSummary(namespace, device.deviceId),
    })));
    for (const item of summaries) result.set(item.deviceId, item.summary);
  }
  return result;
}

function summarizeQuota(device: ControlPlaneAdminDeviceRow): Record<ManagedQuotaName, QuotaSummary> {
  return {
    managedUsage: summarizeQuotaValue(device.limits.managedUsage),
    transcription: summarizeQuotaValue(device.limits.transcription),
    aiActions: summarizeQuotaValue(device.limits.aiActions),
  };
}

function summarizeQuotaValue(value: ControlPlaneAdminDeviceRow["limits"][ManagedQuotaName]): QuotaSummary {
  return {
    state: value.state,
    rolling5hRemaining: value.windows.rolling5h.remaining,
    weeklyRemaining: value.windows.weekly.remaining,
  };
}

function summarizeEvents(events: AdminRequestEvent[]): Map<string, { sttSeconds: number; llmActions: number; failures: number }> {
  const result = new Map<string, { sttSeconds: number; llmActions: number; failures: number }>();
  for (const event of events) {
    const summary = result.get(event.deviceId) ?? { sttSeconds: 0, llmActions: 0, failures: 0 };
    if (event.context === "voice-transcription") {
      summary.sttSeconds += Math.max(0, event.inputSeconds ?? 0);
    } else {
      summary.llmActions += 1;
    }
    if (event.status === "error") summary.failures += 1;
    result.set(event.deviceId, summary);
  }
  return result;
}

export function buildUsageAdminProjection(
  devices: ControlPlaneAdminDeviceRow[],
  events: AdminRequestEvent[],
  eventsPartial: boolean,
  prewarmByDevice: ReadonlyMap<string, PrewarmSummary>,
): UsageAdminProjection {
  const eventSummaries = summarizeEvents(events);
  const rows = devices.map<UsageAdminRow>((device) => {
    const deviceEvents = eventSummaries.get(device.deviceId) ?? { sttSeconds: 0, llmActions: 0, failures: 0 };
    return {
      accountHandle: device.accountHandle,
      deviceHandle: redactLongIdentifier(device.deviceId),
      status: device.status,
      sttSeconds: Number(deviceEvents.sttSeconds.toFixed(3)),
      llmActions: deviceEvents.llmActions,
      failures: deviceEvents.failures,
      prewarm: prewarmByDevice.get(device.deviceId) ?? emptyPrewarm(false),
      quota: summarizeQuota(device),
    };
  });
  const timestamps = events.map((event) => event.ts).sort();

  return {
    rows,
    coverage: {
      knownDevices: devices.length,
      deviceCap: DEVICE_LIMIT,
      recentEvents: events.length,
      recentEventCap: EVENT_LIMIT,
      eventsPartial,
      oldestEventAt: timestamps[0] ?? null,
      newestEventAt: timestamps.at(-1) ?? null,
      prewarmRetentionDays: 7,
      prewarmUnavailableDevices: rows.filter((row) => !row.prewarm.available).length,
    },
  };
}

export async function getUsageAdminProjection(
  store: KvNamespaceLike,
  namespace: UsageCounterNamespace,
): Promise<UsageAdminProjection> {
  const [deviceList, eventList] = await Promise.all([
    listControlPlaneAdminDevices(store, { limit: DEVICE_LIMIT }),
    listRequestEvents(store, { limit: EVENT_LIMIT }),
  ]);
  const prewarmByDevice = await readPrewarmByDevice(namespace, deviceList.devices);
  return buildUsageAdminProjection(
    deviceList.devices,
    eventList.items,
    eventList.nextCursor !== null,
    prewarmByDevice,
  );
}
