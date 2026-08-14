/// <reference path="../src/bun-test.d.ts" />

import { describe, expect, test } from "bun:test";
import {
  LABORATORY_CANONICAL_RAW_REF_PATTERN,
  LABORATORY_EXECUTION_WIRE_EXAMPLES,
  type LaboratoryExecutionAbortRequest,
  type LaboratoryExecutionCompletionRequest,
} from "../../fixvox-core/src/control-plane/catalog.ts";
import { GATE_A_DEFINITION } from "../../fixvox-core/src/control-plane/evaluation-recipes.ts";

describe("laboratory execution lifecycle wire contract", () => {
  test("freezes the strict Gate A completion envelope", () => {
    const completion = LABORATORY_EXECUTION_WIRE_EXAMPLES.completeGateA satisfies LaboratoryExecutionCompletionRequest;

    expect(Object.keys(completion).sort()).toEqual([
      "completedRequestCount",
      "definitionHash",
      "estimateHash",
      "kind",
      "rawEvidence",
      "schemaVersion",
    ]);
    expect(completion.completedRequestCount).toBe(12);
    expect(completion.rawEvidence.map(({ sampleId }) => sampleId)).toEqual(GATE_A_DEFINITION.sampleIds);
    for (const evidence of completion.rawEvidence) {
      expect(Object.keys(evidence).sort()).toEqual(["byteLength", "candidateId", "sampleId", "sha256"]);
      expect(evidence.candidateId).toBe("transcription-quality-v1-short-auto");
      expect(evidence.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(evidence.byteLength > 0).toBe(true);
    }
  });

  test("freezes bounded abort reasons and canonical raw ref format", () => {
    const abort = LABORATORY_EXECUTION_WIRE_EXAMPLES.abort satisfies LaboratoryExecutionAbortRequest;

    expect(abort).toEqual({ schemaVersion: 1, reason: "runner-failed" });
    expect(LABORATORY_CANONICAL_RAW_REF_PATTERN.test(`lraw_${"d".repeat(64)}`)).toBe(true);
    expect(LABORATORY_CANONICAL_RAW_REF_PATTERN.test(`raw_${"d".repeat(64)}`)).toBe(false);
  });
});
