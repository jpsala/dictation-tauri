import { PipelineService } from "./service";
import type {
  PipelineEventHandler,
  PipelineStateEvent,
  SimulatedRunRequest,
  SimulatedRunSummary,
} from "./types";

export type SimulatedPipelineRunnerOptions = {
  createRunId?: () => string;
  now?: () => number;
  onEvent?: PipelineEventHandler;
  onState?: (event: PipelineStateEvent) => void;
};

export const simulatedPipelineService = new PipelineService();

export async function runSimulatedPipeline(
  request: SimulatedRunRequest,
  options: SimulatedPipelineRunnerOptions = {},
): Promise<SimulatedRunSummary> {
  const service =
    Object.keys(options).length === 0
      ? simulatedPipelineService
      : new PipelineService(options);

  return service.run(request);
}
