import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExperimentWorkspace } from "../../src/dictation-lab/ExperimentWorkspace";
import { EvidenceOverviewWorkspace, EvidenceResultsWorkspace } from "../../src/dictation-lab/EvidenceWorkspaces";
import { OverviewWorkspace } from "../../src/dictation-lab/LabWorkspaces";
import type {
  LabArtifactIndex,
  LabExperimentDefinition,
  LabMetricValue,
  LabCandidateSummary,
} from "../../src/dictation-lab/types";

const unavailableMetric = (unit: LabMetricValue["unit"]): LabMetricValue => ({
  value: null,
  unit,
  availability: { status: "unavailable", missing: [unit] },
});

const availableMetric = (
  value: number,
  unit: LabMetricValue["unit"],
): LabMetricValue => ({
  value,
  unit,
  availability: { status: "available", missing: [] },
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
  sourceGateARunId: null,
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
  it("explains the laboratory workflow before exposing evidence details", () => {
    const html = renderToStaticMarkup(
      <EvidenceOverviewWorkspace
        artifacts={{ index: artifacts, loading: false, error: "" }}
        localRunCount={0}
      />,
    );

    expect(html).toContain("Cómo leer el laboratorio");
    expect(html).toContain("Corpus");
    expect(html).toContain("Experimentos");
    expect(html).toContain("Resultados");
    expect(html).toContain("Recetas");
    expect(html).toContain("no cambia la configuración activa");
    expect(html).toContain("falta evidencia, no que el valor sea cero");
  });

  it("keeps recipe axes locked and excludes artifact-discovered IDs", () => {
    const html = renderToStaticMarkup(
      <ExperimentWorkspace
        artifacts={{ index: artifacts, loading: false, error: "" }}
        definition={definition}
        localReplayDefinition={definition}
        metadataExperiment={{
          schemaVersion: 1,
          status: "provider-free-analysis-complete",
          sourceExecutionId: "12345678-1234-1234-1234-123456789abc",
          sourceCandidateId: "transcription-quality-v1-short-auto",
          sampleCount: 3,
          providerCalls: 0,
          plannedPostprocessCalls: 6,
          model: "openai/gpt-oss-120b",
          baselinePromptId: "managed-postprocess-v1-plain",
          candidatePromptId: "managed-postprocess-v2-conservative-timing",
          maxSignalsPerSample: 4,
          legacySignalCount: 18,
          conservativeSignalCount: 8,
          samples: [],
        }}
        metadataCandidateAvailable
        catalogState={{ status: "available", code: null }}
        estimate={null}
        estimateLoading={false}
        estimateError=""
        job={null}
        orchestrationAvailable
        availableRecipeIds={{
          stt: ["transcription-quality-v1-short-auto", "transcription-quality-v1-rich-auto", "transcription-quality-v1-short-es", "transcription-quality-v1-rich-es"],
          postprocess: [
            "transcription-quality-v1-postprocess-120b-plain",
            "transcription-quality-v1-postprocess-120b-prosody",
            "transcription-quality-v2-postprocess-120b-conservative-timing",
          ],
          materialization: ["identity"],
        }}
        onChange={() => undefined}
        onEstimate={() => undefined}
        onStart={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain("Configured plan");
    expect(html).toContain("Dimensions are locked");
    expect(html).not.toContain("artifact-only-stt");
    expect(html).not.toContain("artifact-only-postprocess");
    expect(html).not.toContain("artifact-only-materialization");
    expect(html).toContain("Candidato: timing conservador");
    expect(html).toContain("Cero llamadas al proveedor");
    expect(html).toContain("Señales anteriores");
    expect(html).toContain("Señales conservadoras");
    expect(html).toContain("Raw, Final");
    expect(html).toContain("Gate B v2 · fixed 3×2");
    expect(html).toContain("conservative verbose timing");
  });

  it("keeps orchestration unavailable and provider-real work fail-closed", () => {
    const html = renderToStaticMarkup(
      <ExperimentWorkspace
        artifacts={{ index: null, loading: false, error: "" }}
        definition={{ ...definition, mode: "provider-real" }}
        localReplayDefinition={definition}
        catalogState={{ status: "unavailable", code: "authoritative_one_shot_grant_unavailable" }}
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
    expect(html).toContain("Cloud recipe catalog unavailable");
    expect(html).not.toContain("Start experiment");
    expect(html).toContain("authoritative_one_shot_grant_unavailable");
    expect(html).toContain("no cloud recipe is inferred");
  });

  it("ranks the higher semantic-safety candidate first", () => {
    const base = artifacts.runs[0].candidates[0] as LabCandidateSummary;
    const candidate = (candidateId: string, semanticSafety: number) => ({
      ...base,
      candidateId,
      label: candidateId,
      coverage: availableMetric(1, "ratio"),
      wer: availableMetric(0.2, "ratio"),
      cer: availableMetric(0.1, "ratio"),
      entityAccuracy: availableMetric(1, "ratio"),
      structureAccuracy: availableMetric(1, "ratio"),
      semanticSafety: availableMetric(semanticSafety, "ratio"),
      latency: availableMetric(1000, "milliseconds"),
      fallbackCount: availableMetric(0, "count"),
    });
    const run = {
      ...artifacts.runs[0],
      candidateCount: 2,
      candidates: [
        candidate("unsafe-candidate", 0.66),
        candidate("safe-baseline", 1),
      ],
    };
    const html = renderToStaticMarkup(
      <EvidenceResultsWorkspace
        artifacts={{
          index: { ...artifacts, runs: [run] },
          loading: false,
          error: "",
        }}
        client={{} as never}
        selectedRun={run}
      />,
    );
    const table = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));

    expect(table.indexOf("safe-baseline")).toBeLessThan(
      table.indexOf("unsafe-candidate"),
    );
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
