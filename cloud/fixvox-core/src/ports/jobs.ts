export interface BackgroundJobSchedulerPort {
  schedule(task: Promise<unknown>): void;
}
