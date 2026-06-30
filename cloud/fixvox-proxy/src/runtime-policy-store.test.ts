import { describe, expect, test } from "bun:test";
import {
  buildDefaultRuntimePolicy,
  buildRegisterDefaultsFromRuntimePolicy,
  putRuntimePolicy,
  resolveVoiceRoutingForCohorts,
} from "./runtime-policy-store";

function createKvStore() {
  const storage = new Map<string, string>();
  const puts: string[] = [];
  return {
    store: {
      get: async (key: string) => storage.get(key) ?? null,
      put: async (key: string, value: string) => {
        puts.push(key);
        storage.set(key, value);
      },
    },
    puts,
  };
}

describe("runtime-policy voice routing", () => {
  test("includes assistant quick chat defaults in runtime policy and register defaults", () => {
    const policy = buildDefaultRuntimePolicy() as Record<string, unknown>;
    const assistant = policy.assistant as Record<string, unknown>;
    const chat = assistant.chat as Record<string, unknown>;
    const quickChat = assistant.quickChat as Record<string, unknown>;
    const llm = policy.llm as Record<string, unknown>;
    const targets = llm.targets as Record<string, unknown>;
    const assistantTarget = targets.assistant as Record<string, unknown>;

    expect(chat.promptBase).toBe("");
    expect(quickChat.promptBase).toBe("");
    expect(assistantTarget.provider).toBe("groq");

    chat.promptBase = "Siempre empezá con hola.";
    quickChat.promptBase = "Prefer concise rewrites.";

    const defaults = buildRegisterDefaultsFromRuntimePolicy(policy as never, []);
    const assistantDefaults = defaults.assistant as Record<string, unknown>;
    const chatDefaults = assistantDefaults.chat as Record<string, unknown>;
    const quickChatDefaults = assistantDefaults.quickChat as Record<string, unknown>;
    const llmDefaults = defaults.llm as Record<string, unknown>;
    const targetDefaults = (llmDefaults.targets as Record<string, unknown>).assistant as Record<string, unknown>;

    expect(chatDefaults.promptBase).toBe("Siempre empezá con hola.");
    expect(quickChatDefaults.promptBase).toBe("Prefer concise rewrites.");
    expect(targetDefaults.provider).toBe("groq");
    expect((llmDefaults.targets as Record<string, Record<string, unknown>>).postProcess).toMatchObject({
      provider: "groq",
      model: "openai/gpt-oss-120b",
      policy: "locked",
    });
    expect(defaults.features).toMatchObject({
      "presets.edit": true,
      "presets.run": true,
      "results.history": true,
      presetEditing: true,
      historyRetry: true,
    });
    expect((defaults.userSettingsDefaults as Record<string, unknown> | undefined)?.appearance).toEqual({
      themeId: "github-light",
      dockSkin: 4,
    });
    expect((defaults.userSettingsDefaults as Record<string, unknown> | undefined)?.general).toEqual({
      onboardingDone: false,
      showDockOnStartup: true,
      startWithWindows: false,
      preferredSurface: "alpha",
      uiLanguage: "system",
    });
    expect((defaults.userSettingsDefaults as Record<string, unknown> | undefined)?.hotkeys).toEqual({
      pasteLast: "Alt+Shift+X",
      quickChat: "Alt+Shift+C",
      resultHistory: "Alt+Shift+Z",
      picker: "Alt+Q",
      pushToTalk: "Ctrl+Alt+Space",
      stopAndSubmit: "Alt+Shift+Space",
      toggleAssistantMode: "",
      togglePressEnterAfterPaste: "",
      voiceRecord: "Alt+Space",
    });
    expect((defaults.userSettingsDefaults as Record<string, unknown> | undefined)?.transcript).toEqual({
      language: "",
    });
    expect((defaults.userSettingsDefaults as Record<string, unknown> | undefined)?.voice).toEqual({
      muteOutputDuringRecording: true,
      pressEnterAfterPaste: false,
      showQuickChatReasoning: true,
      showPresetReasoning: false,
      assistantWakeWords: "assistant,asistente,ai,zuno,lulu",
      assistantModeToggleWords: "assistant,asistente,ai,zuno,lulu",
      commandWakeWords: "comando,command",
    });
  });

  test("register defaults override stored post-process target", () => {
    const policy = buildDefaultRuntimePolicy() as Record<string, unknown>;
    const llm = policy.llm as Record<string, unknown>;
    const targets = llm.targets as Record<string, Record<string, unknown>>;
    targets.postProcess = {
      provider: "groq",
      model: "moonshotai/kimi-k2-instruct",
      policy: "locked",
    };

    const defaults = buildRegisterDefaultsFromRuntimePolicy(policy as never, []);
    const llmDefaults = defaults.llm as Record<string, Record<string, unknown>>;

    expect((llmDefaults.targets as Record<string, Record<string, unknown>>).postProcess).toMatchObject({
      provider: "groq",
      model: "openai/gpt-oss-120b",
      policy: "locked",
    });
  });

  test("same runtime policy does not re-put", async () => {
    const kv = createKvStore();
    const policy = buildDefaultRuntimePolicy();

    const first = await putRuntimePolicy(kv.store, policy);
    kv.puts.length = 0;
    const second = await putRuntimePolicy(kv.store, policy);

    expect(second.updatedAt).toBe(first.updatedAt);
    expect(kv.puts).toHaveLength(0);
  });

  test("resolves the first matching cohort to a routed speech target", () => {
    const defaults = buildRegisterDefaultsFromRuntimePolicy(buildDefaultRuntimePolicy(), ["fast", "cheap"]);

    expect(defaults.voiceRouting).toEqual({
      label: "speed",
      matchedCohort: "fast",
      source: "backend-cohort",
      speech: {
        provider: "groq",
        model: "whisper-large-v3-turbo",
        policy: "locked",
      },
      runtime: {
        sttPromptEnabled: true,
        postProcessEnabled: false,
      },
    });
  });

  test("falls back to the default label when no cohort matches", () => {
    const resolved = resolveVoiceRoutingForCohorts(buildDefaultRuntimePolicy(), ["alpha-private"]);

    expect(resolved?.label).toBe("quality");
    expect(resolved?.matchedCohort).toBeNull();
    expect(resolved?.source).toBe("backend-default");
    expect(resolved?.speech.provider).toBe("groq");
    expect(resolved?.speech.model).toBe("whisper-large-v3-turbo");
  });

  test("falls back to the default route when a matched cohort maps to an invalid label", () => {
    const policy = buildDefaultRuntimePolicy() as Record<string, unknown>;
    const voiceRouting = policy.voiceRouting as Record<string, unknown>;
    const cohortAssignments = voiceRouting.cohortAssignments as Record<string, unknown>;
    const policies = voiceRouting.policies as Record<string, unknown>;
    const quality = policies.quality as Record<string, unknown>;
    const qualitySpeech = quality.speech as Record<string, unknown>;

    cohortAssignments.fast = "broken";
    qualitySpeech.provider = "groq";
    qualitySpeech.policy = "default";

    const resolved = resolveVoiceRoutingForCohorts(policy as never, ["fast"]);

    expect(resolved?.label).toBe("quality");
    expect(resolved?.matchedCohort).toBeNull();
    expect(resolved?.source).toBe("backend-default");
    expect(resolved?.speech.provider).toBe("groq");
    expect(resolved?.speech.model).toBe("whisper-large-v3-turbo");
    expect(resolved?.speech.policy as string | undefined).toBe("default");
    expect(resolved?.runtime).toEqual({
      sttPromptEnabled: true,
      postProcessEnabled: false,
    });
  });

  test("does not skip a malformed first assigned cohort in favor of a later valid cohort", () => {
    const policy = buildDefaultRuntimePolicy() as Record<string, unknown>;
    const voiceRouting = policy.voiceRouting as Record<string, unknown>;
    const cohortAssignments = voiceRouting.cohortAssignments as Record<string, unknown>;

    cohortAssignments.fast = "broken";
    cohortAssignments.cheap = "cost";

    const resolved = resolveVoiceRoutingForCohorts(policy as never, ["fast", "cheap"]);

    expect(resolved?.label).toBe("quality");
    expect(resolved?.matchedCohort).toBeNull();
    expect(resolved?.source).toBe("backend-default");
    expect(resolved?.speech.provider).toBe("groq");
    expect(resolved?.speech.model).toBe("whisper-large-v3-turbo");
  });

  test("rejects managed proxy-only policies whose default voice route uses unsupported speech provider", async () => {
    const store = {
      get: async () => null,
      put: async () => undefined,
    };
    const policy = buildDefaultRuntimePolicy() as Record<string, unknown>;
    const voiceRouting = policy.voiceRouting as Record<string, unknown>;
    const policies = voiceRouting.policies as Record<string, unknown>;
    const quality = policies.quality as Record<string, unknown>;
    const qualitySpeech = quality.speech as Record<string, unknown>;

    qualitySpeech.provider = "openai";
    qualitySpeech.model = "whisper-1";

    await expect(putRuntimePolicy(store as never, policy as never)).rejects.toThrow(
      "Default speech route is incompatible with the current managed proxy runtime",
    );
  });

  test("stores managed proxy-only policies when the default voice route uses groq speech", async () => {
    const store = {
      get: async () => null,
      put: async () => undefined,
    };
    const policy = buildDefaultRuntimePolicy() as Record<string, unknown>;
    const voiceRouting = policy.voiceRouting as Record<string, unknown>;
    const policies = voiceRouting.policies as Record<string, unknown>;
    const quality = policies.quality as Record<string, unknown>;
    const qualitySpeech = quality.speech as Record<string, unknown>;

    qualitySpeech.provider = "groq";
    qualitySpeech.model = "whisper-large-v3-turbo";

    const stored = await putRuntimePolicy(store as never, policy as never);

    expect(stored.policy).toBeDefined();
  });
});
