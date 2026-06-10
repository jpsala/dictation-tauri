export const modelGatewayModes = ["mock", "dry-run", "real"] as const;

export type ModelGatewayMode = (typeof modelGatewayModes)[number];

export type TranscriptionInput = {
  runId: string;
  fixtureId: string;
  audioPath: string;
  language?: string;
  provider?: string;
  model?: string;
  mode: ModelGatewayMode;
};

export type CostEstimate = {
  amount: number;
  currency: string;
  source: string;
};

export type RedactedModelGatewayError = {
  code: string;
  message: string;
  redacted: true;
};

export type TranscriptionResult =
  | {
      status: "ok";
      text: string;
      provider: string;
      model: string;
      latencyMs: number;
      requestId?: string;
      costEstimate?: CostEstimate;
    }
  | {
      status: "setup-error" | "provider-error" | "cancelled";
      error: RedactedModelGatewayError;
      provider?: string;
      model?: string;
      latencyMs?: number;
      requestId?: string;
    };

export type PostProcessInput = {
  runId: string;
  fixtureId: string;
  transcript: string;
  provider?: string;
  model?: string;
  mode: ModelGatewayMode;
};

export type PostProcessResult =
  | {
      status: "ok";
      output: string;
      provider: string;
      model: string;
      latencyMs: number;
      requestId?: string;
      costEstimate?: CostEstimate;
    }
  | {
      status: "setup-error" | "provider-error" | "cancelled";
      error: RedactedModelGatewayError;
      provider?: string;
      model?: string;
      latencyMs?: number;
      requestId?: string;
    };

export type ModelGateway = {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
  postProcess?(input: PostProcessInput): Promise<PostProcessResult>;
};

export function createRedactedModelGatewayError(
  code: string,
  message: string,
): RedactedModelGatewayError {
  return {
    code,
    message,
    redacted: true,
  };
}
