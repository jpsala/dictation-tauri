export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export const runAssistantChatCommand = "run_assistant_chat";

export type HostAssistantChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export type HostAssistantChatRequest = {
  runId: string;
  prompt: string;
  mode: "dry-run" | "real";
  allowProviderCall: boolean;
  history?: HostAssistantChatMessage[];
};

export type HostAssistantChatResponse =
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

export async function runAssistantChatWithHost(
  invoke: TauriInvoke,
  request: HostAssistantChatRequest,
): Promise<HostAssistantChatResponse> {
  return invoke<HostAssistantChatResponse>(runAssistantChatCommand, { request });
}
