import { beforeEach, describe, expect, it, vi } from "vitest";

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
beforeEach(() => invokeMock.mockReset());

describe("dictation laboratory execution grants", () => {
  it("requests a server-owned opaque one-shot grant", async () => {
    invokeMock.mockResolvedValueOnce({ schemaVersion: 1, grantToken: "opaque-token" });
    const client = createDictationLabJobsClient();

    await expect(client.requestExecutionGrant(definition)).resolves.toEqual({
      schemaVersion: 1,
      grantToken: "opaque-token",
    });
    expect(invokeMock).toHaveBeenCalledWith("request_dictation_lab_execution_grant", { definition });
  });

  it("does not treat a local estimate as authority to start provider-real work", async () => {
    const client = createDictationLabJobsClient();

    await expect(client.startJob(definition)).rejects.toMatchObject({
      code: "laboratory_execution_unauthorized",
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
