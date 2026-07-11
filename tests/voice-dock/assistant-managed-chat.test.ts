import { describe, expect, it, vi } from "vitest";
import {
  runAssistantChatCommand,
  runAssistantChatWithHost,
  type TauriInvoke,
} from "../../src/assistant/managed-chat";

describe("assistant managed chat host bridge", () => {
  it("invokes the gated Tauri assistant chat command", async () => {
    const rawInvoke = vi.fn(async () => ({
      status: "ok" as const,
      text: "Managed answer",
      provider: "fixvox-cloud",
      model: "openai/gpt-oss-120b",
      latencyMs: 12,
      redacted: true as const,
    }));
    const invoke = rawInvoke as unknown as TauriInvoke;

    await expect(
      runAssistantChatWithHost(invoke, {
        runId: "assistant-run-1",
        prompt: "explicame el preset activo",
        mode: "real",
        allowProviderCall: true,
        history: [
          { role: "user", text: "hola" },
          { role: "assistant", text: "Hola, soy Lulu." },
        ],
      }),
    ).resolves.toMatchObject({ status: "ok", text: "Managed answer" });

    expect(rawInvoke).toHaveBeenCalledWith(runAssistantChatCommand, {
      request: {
        runId: "assistant-run-1",
        prompt: "explicame el preset activo",
        mode: "real",
        allowProviderCall: true,
        history: [
          { role: "user", text: "hola" },
          { role: "assistant", text: "Hola, soy Lulu." },
        ],
      },
    });
  });
});
