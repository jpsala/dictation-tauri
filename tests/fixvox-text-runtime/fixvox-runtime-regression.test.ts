import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_V2_VOICE_POST_PROCESS_PROMPT,
  buildFixvoxManagedSpeechRequestPreview,
  buildRawVoicePostProcessSystemPrompt,
  materializeFixvoxNormalDictationOutput,
  resolveDictationRuntimePlanFromPolicyCache,
  resolveEffectiveFixvoxVoiceRuntime,
  resolveFixvoxTextRuntimeRoute,
  sanitizeRawVoicePostProcessOutput,
} from "../../src/fixvox-text-runtime";

describe("Fixvox text runtime regressions", () => {
  it("resolves JP's redacted Fixvox Pro policy into the effective dictation runtime plan", () => {
    const policy = JSON.parse(
      readFileSync(
        "specs/013-fixvox-text-runtime-parity/fixtures/fixvox-pro-effective-policy.redacted.json",
        "utf8",
      ),
    );
    const plan = resolveDictationRuntimePlanFromPolicyCache(policy);
    const promptHash = createHash("sha256").update(plan.stt.prompt ?? "").digest("hex");

    expect(plan).toMatchObject({
      policyId: "pro",
      voiceRoutingProfileId: "pro-stt-only",
      routeLabel: "pro-stt-only",
      language: null,
      stt: {
        provider: "groq",
        model: "whisper-large-v3-turbo",
        promptEnabled: true,
      },
      postProcess: {
        enabled: false,
        provider: null,
        model: null,
        prompt: null,
        source: "disabled",
      },
    });
    expect(plan.stt.prompt).toContain("Conservá comandos");
    expect({ promptLength: plan.stt.prompt?.length ?? 0, promptHash: promptHash.slice(0, 12) }).toEqual({
      promptLength: 134,
      promptHash: "bdb324541940",
    });
  });

  it("does not duplicate safety rules and supports explicit cleanup levels", () => {
    const once = buildRawVoicePostProcessSystemPrompt(DEFAULT_V2_VOICE_POST_PROCESS_PROMPT);
    const twice = buildRawVoicePostProcessSystemPrompt(once);
    const light = buildRawVoicePostProcessSystemPrompt(DEFAULT_V2_VOICE_POST_PROCESS_PROMPT, { level: "light" });
    const strong = buildRawVoicePostProcessSystemPrompt(DEFAULT_V2_VOICE_POST_PROCESS_PROMPT, { level: "strong" });

    expect(twice).toBe(once);
    expect(light).toContain("Cleanup level: light.");
    expect(light).toContain("Use the smallest safe edit");
    expect(strong).toContain("Cleanup level: strong.");
    expect(strong).toContain("You may lightly normalize email, Slack, notes, and task-list formatting");
  });

  it("pins prompt clauses for Spanish punctuation, corrections, fillers, and technical identifiers", () => {
    expect(DEFAULT_V2_VOICE_POST_PROCESS_PROMPT).toContain("For Spanish questions, always use opening and closing question marks");
    expect(DEFAULT_V2_VOICE_POST_PROCESS_PROMPT).toContain("que paso con baseline que fue lo que cambio");
    expect(DEFAULT_V2_VOICE_POST_PROCESS_PROMPT).toContain("For spoken corrections such as 'no perdon'");
    expect(DEFAULT_V2_VOICE_POST_PROCESS_PROMPT).toContain("Remove common filler phrases when clearly filler");
    expect(DEFAULT_V2_VOICE_POST_PROCESS_PROMPT).toContain("gpt cinco punto cinco -> gpt-5.5");
    expect(DEFAULT_V2_VOICE_POST_PROCESS_PROMPT).toContain("process punto env punto openai api key -> process.env.OPENAI_API_KEY");
    expect(DEFAULT_V2_VOICE_POST_PROCESS_PROMPT).toContain("Fixbox, fix box, or FixVox -> Fixvox");
  });

  it("gives Final marker precedence over explanation markers", () => {
    expect(
      sanitizeRawVoicePostProcessOutput({
        rawOutput: "bad! -> fixed?\n\nFinal\n¿Esto queda bien?",
        transcript: "¿Esto queda bien!",
      }),
    ).toEqual({
      text: "¿Esto queda bien?",
      changed: true,
      reason: "final_marker",
    });
  });

  it("materializes sanitized postprocess output and falls back to raw transcript on empty/explanation/too-long output", () => {
    expect(
      materializeFixvoxNormalDictationOutput({
        transcript: "hola jp",
        rawPostProcessOutput: "Hola, JP.",
        postProcessAttempted: true,
      }),
    ).toMatchObject({
      outputText: "Hola, JP.",
      shouldInsertText: true,
      viaPostProcess: true,
      postProcessRan: true,
    });

    expect(
      materializeFixvoxNormalDictationOutput({
        transcript: "hola jp",
        rawPostProcessOutput: "",
        postProcessAttempted: true,
      }),
    ).toMatchObject({ outputText: "hola jp", viaPostProcess: false, postProcessRan: true });

    expect(
      materializeFixvoxNormalDictationOutput({
        transcript: "hola jp",
        rawPostProcessOutput: "Before: hola\nAfter: Hola.",
        postProcessAttempted: true,
      }),
    ).toMatchObject({ outputText: "hola jp", viaPostProcess: false, postProcessRan: true });

    expect(
      materializeFixvoxNormalDictationOutput({
        transcript: "hola jp",
        rawPostProcessOutput: "x".repeat(700),
        postProcessAttempted: true,
      }),
    ).toMatchObject({ outputText: "hola jp", viaPostProcess: false, postProcessRan: true });
  });

  it("matches Fixvox effective policy for pro STT-only, post-process, stale local, and kill-switch routes", () => {
    expect(
      resolveEffectiveFixvoxVoiceRuntime({
        policyId: "pro",
        stt: { provider: "openai", model: "gpt-4o-mini-transcribe", prompt: "Use dictation rules" },
      }),
    ).toMatchObject({
      policyId: "pro",
      voiceRoutingProfileId: "pro-stt-only",
      routeLabel: "pro-stt-only",
      postProcess: { enabled: false, provider: null, model: null, prompt: null, source: "disabled" },
    });

    expect(
      resolveEffectiveFixvoxVoiceRuntime({
        policyId: "pro",
        voiceRoutingProfileId: "pro-post-process",
        stt: { provider: "openai", model: "gpt-4o-mini-transcribe" },
        postProcess: { prompt: "Clean up dictated text" },
      }).postProcess,
    ).toEqual({
      enabled: true,
      provider: "groq",
      model: "openai/gpt-oss-120b",
      prompt: "Clean up dictated text",
      source: "policy",
    });

    expect(
      resolveEffectiveFixvoxVoiceRuntime({
        policyId: "stale-local-dev",
        voiceRoutingProfileId: null,
        stt: { provider: "openai", model: "gpt-4o-mini-transcribe" },
        postProcess: null,
      }).postProcess,
    ).toEqual({ enabled: false, provider: null, model: null, prompt: null, source: "disabled" });

    expect(
      resolveEffectiveFixvoxVoiceRuntime({
        policyId: "pro",
        voiceRoutingProfileId: "pro-post-process",
        stt: { provider: "openai", model: "gpt-4o-mini-transcribe" },
        postProcess: { prompt: "Clean up dictated text" },
        disablePostProcess: true,
      }).postProcess,
    ).toEqual({ enabled: false, provider: null, model: null, prompt: null, source: "kill-switch" });
  });

  it("routes disabled postprocess with available prompt as raw dictation metadata", () => {
    const runtime = resolveEffectiveFixvoxVoiceRuntime({
      policyId: "pro",
      stt: { provider: "openai", model: "gpt-4o-mini-transcribe" },
      postProcess: { prompt: DEFAULT_V2_VOICE_POST_PROCESS_PROMPT },
    });

    expect(
      resolveFixvoxTextRuntimeRoute({
        transcript: "hola jp",
        postProcessEnabled: runtime.postProcess.enabled,
        postProcessPrompt: DEFAULT_V2_VOICE_POST_PROCESS_PROMPT,
        postProcessProvider: "groq",
        postProcessModel: "openai/gpt-oss-120b",
        postProcessSource: runtime.postProcess.source,
        policyId: runtime.policyId,
        voiceRoutingProfileId: runtime.voiceRoutingProfileId,
      }),
    ).toMatchObject({
      route: "dictation",
      postProcessEnabled: false,
      postProcessAvailable: true,
      postProcessEnablementSource: "disabled",
    });
  });

  it("omits managed STT language=auto and empty prompt, but includes non-empty language and prompt before verbose fields", () => {
    expect(
      buildFixvoxManagedSpeechRequestPreview({
        backendBaseUrl: "https://fixvox.local/",
        deviceId: "device_123",
        model: "whisper-large-v3",
        language: "auto",
        prompt: "",
        uploadMimeType: "audio/wav",
        uploadFileName: "recording.wav",
      }).multipartFields.map((field) => field.key),
    ).toEqual(["file", "model", "response_format", "timestamp_granularities[]", "timestamp_granularities[]", "temperature"]);

    expect(
      buildFixvoxManagedSpeechRequestPreview({
        backendBaseUrl: "https://fixvox.local/",
        deviceId: "device_123",
        model: "whisper-large-v3",
        language: "es",
        prompt: "nombres propios",
        uploadMimeType: "audio/mpeg",
        uploadFileName: "recording.mp3",
      }).multipartFields,
    ).toEqual([
      { key: "file", fileName: "recording.mp3", mimeType: "audio/mpeg" },
      { key: "model", value: "whisper-large-v3" },
      { key: "language", value: "es" },
      { key: "prompt", value: "nombres propios" },
      { key: "response_format", value: "verbose_json" },
      { key: "timestamp_granularities[]", value: "word" },
      { key: "timestamp_granularities[]", value: "segment" },
      { key: "temperature", value: "0" },
    ]);
  });
});
