import { invoke, isTauri } from "@tauri-apps/api/core";

import type {
  LabExperimentDefinition,
  LabExperimentEstimate,
  LabJobSnapshot,
} from "./types";

export class DictationLabJobsUnavailableError extends Error {
  readonly code: string;

  constructor(
    code = "DICTATION_LAB_JOBS_UNAVAILABLE",
    message = "Dictation laboratory jobs require the Tauri host.",
  ) {
    super(message);
    this.code = code;
    this.name = "DictationLabJobsUnavailableError";
  }
}
export type DictationLabJobsClient = {
  requestExecutionGrant(definition: LabExperimentDefinition): Promise<never>;
  estimateExperiment(definition: LabExperimentDefinition): Promise<LabExperimentEstimate>;
  startJob(definition: LabExperimentDefinition): Promise<LabJobSnapshot>;
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
    startJob(definition) {
      requireTauri();
      if (definition.mode === "provider-real") {
        return Promise.reject(new DictationLabJobsUnavailableError(
          "authoritative_one_shot_grant_unavailable",
          "Provider execution is unavailable until the server can issue and consume an authoritative one-shot grant.",
        ));
      }
      return invoke<LabJobSnapshot>("start_dictation_lab_job", {
        definition,
        executionGrant: null,
      });
    },
    requestExecutionGrant() {
      requireTauri();
      return Promise.reject(new DictationLabJobsUnavailableError(
        "authoritative_one_shot_grant_unavailable",
        "Provider execution is unavailable until the server can issue and consume an authoritative one-shot grant.",
      ));
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
