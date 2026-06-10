import type {
  DeliveryResult,
  MockTranscriptionResult,
  SimulatedFixture,
} from "./types";

export type MockTranscriptionAdapter = {
  transcribe(fixture: SimulatedFixture): Promise<MockTranscriptionResult>;
};

export type MockDeliveryAdapter = {
  deliver(input: {
    fixture: SimulatedFixture;
    output: string;
  }): Promise<DeliveryResult>;
};

export const fixtureTranscriptionAdapter: MockTranscriptionAdapter = {
  async transcribe(fixture) {
    if (fixture.failureMode?.phase === "transcribing") {
      return {
        error: {
          phase: fixture.failureMode.phase,
          message: fixture.failureMode.message,
        },
        latencyMs: 0,
      };
    }

    if (!fixture.expectedTranscript) {
      return {
        error: {
          phase: "transcribing",
          message: "Fixture has no transcript.",
        },
        latencyMs: 0,
      };
    }

    return {
      text: fixture.expectedTranscript,
      latencyMs: 0,
    };
  },
};

export const fixtureDeliveryAdapter: MockDeliveryAdapter = {
  async deliver({ fixture, output }) {
    if (fixture.failureMode?.phase === "delivering") {
      return {
        status: "failed",
        reason: fixture.failureMode.message,
      };
    }

    switch (fixture.deliveryMode) {
      case "copiedFallback":
        return {
          status: "copiedFallback",
          output,
          reason:
            "Simulated paste unavailable; output is available as fallback.",
        };
      case "uncertain":
        return {
          status: "uncertain",
          output,
          reason: "Simulated delivery could not be confirmed.",
        };
      case "skipped":
        return {
          status: "skipped",
          reason: "Simulated delivery was skipped.",
        };
      case "failed":
        return {
          status: "failed",
          reason: "Simulated delivery failed.",
        };
      case "delivered":
        return {
          status: "delivered",
          output,
        };
    }
  },
};
