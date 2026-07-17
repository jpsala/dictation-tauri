import type { BackgroundJobSchedulerPort } from "../ports";

export function scheduleBackgroundJobs(
  scheduler: BackgroundJobSchedulerPort,
  jobs: Array<() => Promise<unknown>>,
): void {
  for (const job of jobs) scheduler.schedule(job());
}
