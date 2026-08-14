import { invoke, isTauri } from "@tauri-apps/api/core";

import type {
  LabExperimentDefinition,
  LabExperimentEstimate,
  LaboratoryOpaqueGrant,
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
  requestExecutionGrant(definition: LabExperimentDefinition): Promise<LaboratoryOpaqueGrant>;
  estimateExperiment(definition: LabExperimentDefinition): Promise<LabExperimentEstimate>;
  startJob(definition: LabExperimentDefinition, grant?: LaboratoryOpaqueGrant): Promise<LabJobSnapshot>;
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
    startJob(definition, grant) {
      requireTauri();
      if (definition.mode !== "provider-free-replay" && !grant) {
        return Promise.reject(new DictationLabJobsUnavailableError(
          "laboratory_execution_unauthorized",
          "Provider execution requires a server-owned one-shot grant.",
        ));
      }
      return invoke<LabJobSnapshot>("start_dictation_lab_job", {
        definition,
        executionGrant: grant ?? null,
      });
    },
    requestExecutionGrant(definition) {
      requireTauri();
      return invoke<LaboratoryOpaqueGrant>("request_dictation_lab_execution_grant", {
        definition,
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
