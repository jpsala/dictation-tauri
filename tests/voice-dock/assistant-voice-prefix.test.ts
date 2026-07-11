import { describe, expect, it } from "vitest";
import { parseAssistantVoicePrefix, resolveAssistantWakeWords } from "../../src/assistant/voice-prefix";

describe("assistant voice prefix", () => {
  it("routes Lulu-prefixed dictation to assistant prompt", () => {
    expect(parseAssistantVoicePrefix("Lulu, que preset esta activo?")).toEqual({
      kind: "assistant",
      wakeWord: "lulu",
      prompt: "que preset esta activo?",
    });
  });

  it("keeps normal dictation out of assistant routing", () => {
    expect(parseAssistantVoicePrefix("hola mundo esto es dictado normal")).toEqual({
      kind: "not-assistant",
    });
  });

  it("expands Lulu to Ludo for ASR confusion", () => {
    expect(resolveAssistantWakeWords("lulu")).toContain("ludo");
    expect(parseAssistantVoicePrefix("Ludo activa el preset JP", { wakeWordsConfig: "lulu" })).toMatchObject({
      kind: "assistant",
      prompt: "activa el preset JP",
    });
  });

  it("reports empty assistant prompts as invalid", () => {
    expect(parseAssistantVoicePrefix("Lulu")).toEqual({
      kind: "invalid-assistant",
      reason: "Missing assistant prompt after prefix.",
    });
  });
});
