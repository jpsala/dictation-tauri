import { invoke, isTauri } from "@tauri-apps/api/core";

import type {
  LabExperimentDefinition,
  LabExperimentEstimate,
  LabJobSnapshot,
} from "./types";

/** A server-owned grant; the laboratory UI may pass one through but never mint one. */
export type LabExecutionGrant = {
  definitionHash: string;
  estimate: LabExperimentEstimate;
  expiresAt: string;
};

export class DictationLabJobsUnavailableError extends Error {
  readonly code = "DICTATION_LAB_JOBS_UNAVAILABLE";

  constructor() {
    super("Dictation laboratory jobs require the Tauri host.");
    this.name = "DictationLabJobsUnavailableError";
  }
}

export type DictationLabJobsClient = {
  estimateExperiment(definition: LabExperimentDefinition): Promise<LabExperimentEstimate>;
  startJob(definition: LabExperimentDefinition, executionGrant?: LabExecutionGrant): Promise<LabJobSnapshot>;
  getJob(): Promise<LabJobSnapshot | null>;
  cancelJob(jobId: string): Promise<LabJobSnapshot>;
};

function requireTauri(): void {
  if (!isTauri()) throw new DictationLabJobsUnavailableError();
}

export function createDictationLabJobsClient(): DictationLabJobsClient {
  return {
    estimateExperiment(definition) {
      requireTauri();
      return invoke<LabExperimentEstimate>("estimate_dictation_lab_experiment", { definition });
    },
    startJob(definition, executionGrant) {
      requireTauri();
      return invoke<LabJobSnapshot>("start_dictation_lab_job", {
        definition,
        executionGrant: executionGrant ?? null,
      });
    },
    getJob() {
      requireTauri();
      return invoke<LabJobSnapshot | null>("get_dictation_lab_job");
    },
    cancelJob(jobId) {
      requireTauri();
      return invoke<LabJobSnapshot>("cancel_dictation_lab_job", { jobId });
    },
  };
}
