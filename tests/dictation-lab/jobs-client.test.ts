import { describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: () => true,
}));

import { createDictationLabJobsClient } from "../../src/dictation-lab/jobs-client";
import type { LabExperimentDefinition } from "../../src/dictation-lab/types";

const definition: LabExperimentDefinition = {
  schemaVersion: 1,
  mode: "provider-real",
  corpusId: "approved-corpus",
  sampleIds: ["sample-a", "sample-b", "sample-c"],
  sttRecipes: [
    "transcription-quality-v1-short-auto",
    "transcription-quality-v1-rich-auto",
    "transcription-quality-v1-short-es",
    "transcription-quality-v1-rich-es",
  ],
  materializations: ["identity"],
  postprocessRecipes: [],
  prosodyModes: ["off"],
  vocabularyModes: ["off"],
  baselineCandidateId: null,
};

describe("dictation laboratory execution grants", () => {
  it("fails before invoke when an authoritative one-shot grant is unavailable", async () => {
    const client = createDictationLabJobsClient();

    await expect(client.requestExecutionGrant(definition)).rejects.toMatchObject({
      code: "authoritative_one_shot_grant_unavailable",
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("does not treat a local estimate as authority to start provider-real work", async () => {
    const client = createDictationLabJobsClient();

    await expect(client.startJob(definition)).rejects.toMatchObject({
      code: "authoritative_one_shot_grant_unavailable",
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
