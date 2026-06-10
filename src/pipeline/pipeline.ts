import type { PipelineErrorPhase, RedactedPipelineError } from "./types";

export function createRedactedPipelineError(
  phase: PipelineErrorPhase,
  message: string,
): RedactedPipelineError {
  return {
    phase,
    message: message.trim(),
  };
}
