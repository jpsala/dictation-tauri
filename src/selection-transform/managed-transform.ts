export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export const transformSelectedTextCommand = "transform_selected_text";

export type HostSelectionTransformRequest = {
  runId: string;
  selectedText: string;
  instruction: string;
  presetId?: string;
  mode: "dry-run" | "real";
  allowProviderCall: boolean;
};

export type HostSelectionTransformResponse =
  | {
      status: "ok";
      text: string;
      provider: string;
      model: string;
      latencyMs: number;
      requestId?: string;
      redacted: true;
    }
  | {
      status: "setup-error" | "provider-error";
      error: {
        code: string;
        message: string;
        redacted: true;
      };
      retryable: boolean;
      redacted: true;
    };

export async function transformSelectedTextWithHost(
  invoke: TauriInvoke,
  request: HostSelectionTransformRequest,
): Promise<HostSelectionTransformResponse> {
  return invoke<HostSelectionTransformResponse>(transformSelectedTextCommand, {
    request,
  });
}
