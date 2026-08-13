import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExperimentWorkspace } from "../../src/dictation-lab/ExperimentWorkspace";
import { OverviewWorkspace } from "../../src/dictation-lab/LabWorkspaces";
import type {
  LabArtifactIndex,
  LabExperimentDefinition,
  LabMetricValue,
} from "../../src/dictation-lab/types";

const unavailableMetric = (unit: LabMetricValue["unit"]): LabMetricValue => ({
  value: null,
  unit,
  availability: { status: "unavailable", missing: [unit] },
});

const definition: LabExperimentDefinition = {
  schemaVersion: 1,
  mode: "provider-free-replay",
  corpusId: "canonical-corpus",
  sampleIds: ["sample-1"],
  sttRecipes: ["transcription-quality-v1-short-auto"],
  materializations: ["identity"],
  postprocessRecipes: ["transcription-quality-v1-postprocess-120b-plain"],
  prosodyModes: ["off"],
  vocabularyModes: ["off"],
  baselineCandidateId: null,
};

const artifacts: LabArtifactIndex = {
  schemaVersion: 1,
  rootId: "transcription-quality",
  generatedAt: "2026-08-13T00:00:00Z",
  availability: { status: "available", missing: [] },
  corpora: [{
    corpusId: "canonical-corpus",
    version: "v1",
    sampleCount: 1,
    approvedGoldCount: 1,
    audioAvailableCount: 0,
    categories: ["technical"],
    difficulties: ["baseline"],
    artifact: { id: "corpus:canonical-corpus", kind: "corpus", availability: { status: "available", missing: [] } },
  }],
  runs: [{
    runId: "run-1",
    schemaVersion: "1",
    status: "completed",
    startedAt: "2026-08-13T00:00:00Z",
    completedAt: "2026-08-13T00:01:00Z",
    corpusId: "canonical-corpus",
    sampleCount: 1,
    candidateCount: 1,
    resultCount: 1,
    providerCalls: { enabled: false, maxRequests: 0, observedRequests: 0 },
    estimatedCostUsd: 0,
    observedCostUsd: 0,
    availability: { status: "available", missing: [] },
    candidates: [{
      candidateId: "candidate-artifact-only",
      label: "Artifact candidate",
      recipe: {
        stt: { recipeId: "artifact-only-stt" },
        postprocess: { recipeId: "artifact-only-postprocess" },
        materialization: { id: "artifact-only-materialization" },
      },
      identity: { configured: null, resolved: null, observed: null },
      sampleCount: 1,
      coverage: unavailableMetric("ratio"),
      wer: unavailableMetric("ratio"),
      cer: unavailableMetric("ratio"),
      entityAccuracy: unavailableMetric("ratio"),
      structureAccuracy: unavailableMetric("ratio"),
      semanticSafety: unavailableMetric("ratio"),
      latency: unavailableMetric("milliseconds"),
      cost: unavailableMetric("usd"),
      fallbackCount: unavailableMetric("count"),
      regressionReasons: [],
      availability: { status: "available", missing: [] },
    }],
  }],
};

describe("Dictation Laboratory workspace contracts", () => {
  it("offers only catalog/configuration recipe IDs, never artifact-discovered IDs", () => {
    const html = renderToStaticMarkup(
      <ExperimentWorkspace
        artifacts={{ index: artifacts, loading: false, error: "" }}
        definition={definition}
        estimate={null}
        estimateLoading={false}
        estimateError=""
        job={null}
        orchestrationAvailable
        availableRecipeIds={{
          stt: ["transcription-quality-v1-short-auto", "transcription-quality-v1-rich-auto", "transcription-quality-v1-short-es", "transcription-quality-v1-rich-es"],
          postprocess: ["transcription-quality-v1-postprocess-120b-plain", "transcription-quality-v1-postprocess-120b-prosody"],
          materialization: ["identity"],
        }}
        onChange={() => undefined}
        onEstimate={() => undefined}
        onStart={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain("transcription-quality-v1-rich-es");
    expect(html).toContain("transcription-quality-v1-postprocess-120b-prosody");
    expect(html).not.toContain("artifact-only-stt");
    expect(html).not.toContain("artifact-only-postprocess");
    expect(html).not.toContain("artifact-only-materialization");
  });

  it("keeps orchestration unavailable and provider-real work fail-closed", () => {
    const html = renderToStaticMarkup(
      <ExperimentWorkspace
        artifacts={{ index: null, loading: false, error: "" }}
        definition={{ ...definition, mode: "provider-real" }}
        estimate={null}
        estimateLoading={false}
        estimateError="authoritative_one_shot_grant_unavailable"
        job={null}
        orchestrationAvailable={false}
        onChange={() => undefined}
        onEstimate={() => undefined}
        onStart={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain("Experiment orchestration unavailable");
    expect(html).toContain("No provider call will be attempted.");
    expect(html).toContain("Provider confirmation required");
    expect(html).not.toContain("Start experiment");
    expect(html).toContain("authoritative_one_shot_grant_unavailable");
  });

  it("renders empty canonical states without substituting example runs", () => {
    const html = renderToStaticMarkup(
      <OverviewWorkspace
        artifacts={{ index: { ...artifacts, runs: [], corpora: [] }, loading: false, error: "" }}
        profiles={[]}
        localRuns={[]}
        job={null}
      />,
    );

    expect(html).toContain("No canonical runs are indexed.");
    expect(html).not.toContain("example");
    expect(html).toContain("0");
  });
});
