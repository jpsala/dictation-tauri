import type { SyntheticAudioFixture } from "../test-fixtures/synthetic-audio-manifest";
import type { MockTranscriptionAdapter } from "../pipeline/ports";
import type { ModelGateway, TranscriptionInput } from "./types";
import { createRedactedModelGatewayError } from "./types";

export type DryRunModelGatewayOptions = {
  provider?: string;
  model?: string;
  latencyMs?: number;
  fixtures?: readonly SyntheticAudioFixture[];
};

const defaultDryRunProvider = "synthetic-dry-run";
const defaultDryRunModel = "manifest-expected-text";
const defaultDryRunLatencyMs = 0;

export function createDryRunModelGateway(
  options: DryRunModelGatewayOptions = {},
): ModelGateway {
  const fixturesById = new Map(
    (options.fixtures ?? []).map((fixture) => [fixture.id, fixture]),
  );
  const provider = options.provider ?? defaultDryRunProvider;
  const model = options.model ?? defaultDryRunModel;
  const latencyMs = options.latencyMs ?? defaultDryRunLatencyMs;

  return {
    async transcribe(input) {
      if (input.mode !== "dry-run" && input.mode !== "mock") {
        return {
          status: "setup-error",
          error: createRedactedModelGatewayError(
            "DRY_RUN_MODE_REQUIRED",
            "Dry-run model gateway only supports mock or dry-run mode.",
          ),
          provider,
          model,
          latencyMs,
        };
      }

      const fixture = fixturesById.get(input.fixtureId);
      if (!fixture) {
        return {
          status: "setup-error",
          error: createRedactedModelGatewayError(
            "FIXTURE_NOT_FOUND",
            "Synthetic audio fixture metadata is unavailable.",
          ),
          provider,
          model,
          latencyMs,
        };
      }

      return {
        status: "ok",
        text: fixture.expectedText,
        provider,
        model,
        latencyMs,
        requestId: createDryRunRequestId(input),
      };
    },
  };
}

export function createDryRunTranscriptionAdapter(options: {
  gateway?: ModelGateway;
  fixtures: readonly SyntheticAudioFixture[];
  mode?: "mock" | "dry-run";
}): MockTranscriptionAdapter {
  const gateway =
    options.gateway ??
    createDryRunModelGateway({
      fixtures: options.fixtures,
    });
  const fixturesById = new Map(options.fixtures.map((fixture) => [fixture.id, fixture]));
  const mode = options.mode ?? "dry-run";

  return {
    async transcribe(fixture, context) {
      const syntheticFixture = fixturesById.get(fixture.id);
      if (!syntheticFixture) {
        return {
          error: {
            phase: "transcribing",
            message: "Synthetic audio fixture metadata is unavailable.",
          },
          latencyMs: 0,
        };
      }

      const result = await gateway.transcribe({
        runId: context?.runId ?? "pipeline-service",
        fixtureId: syntheticFixture.id,
        audioPath: syntheticFixture.audioArtifactPath,
        language: syntheticFixture.language,
        mode,
      });

      if (result.status !== "ok") {
        return {
          error: {
            phase: "transcribing",
            message: result.error.message,
          },
          latencyMs: result.latencyMs ?? 0,
        };
      }

      return {
        text: result.text,
        latencyMs: result.latencyMs,
        stt: {
          provider: result.provider,
          model: result.model,
          mode,
          audioPath: syntheticFixture.audioArtifactPath,
          requestId: result.requestId,
        },
      };
    },
  };
}

function createDryRunRequestId(input: TranscriptionInput): string {
  return `dry-run:${input.fixtureId}:${input.runId}`;
}
