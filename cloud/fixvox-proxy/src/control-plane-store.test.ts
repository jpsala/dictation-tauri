import { describe, expect, test } from "bun:test";

import { activateDevice, assignControlPlaneAdminDevicePolicy, listControlPlaneAdminDevices, registerDevice } from "./control-plane-store";
import { putRuntimePolicy } from "./runtime-policy-store";

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
    read(key: string) {
      return storage.get(key) ?? null;
    },
  };
}

describe("control-plane device activation", () => {
  test("registers a fresh device with alpha-basic by default", async () => {
    const kv = createKvStore();

    const response = await registerDevice(kv.store, {
      installId: "install-1",
      version: "0.1.0",
      platform: "win32",
    });

    expect(response.ok).toBe(true);
    expect(response.deviceId).toMatch(/^dev_/);
    expect(response.activated).toBe(true);
    expect(response.policyId).toBe("alpha-basic");
    expect(response.policyLabel).toBe("Alpha Basic");
    expect(response.cohorts).toEqual(["alpha-basic"]);
    expect((response.defaults?.ui as Record<string, unknown> | undefined)?.showAdvancedSettings).toBe(false);
    expect(response.features["assistant.mode"]).toBe(false);
    expect(response.features["assistant.quickChat"]).toBe(false);
    expect(response.features["presets.edit"]).toBe(false);
    expect(response.features["presets.run"]).toBe(false);
    expect(response.features["results.history"]).toBe(false);
    expect(response.limits?.managedUsage.policy.policyId).toBe("alpha-basic");
    expect(response.limits?.managedUsage.policy.matchedCohort).toBe("alpha-basic");
  });

  test("migrates an existing null-policy device to alpha-basic", async () => {
    const kv = createKvStore();
    const legacyRecord = {
      deviceId: "dev_legacy",
      installId: "install-legacy",
      accountId: null,
      activated: false,
      policyId: null,
      policyLabel: null,
      status: "active",
      activatedAt: null,
      firstSeenAt: "2026-04-28T00:00:00.000Z",
      lastSeenAt: "2026-04-28T00:00:00.000Z",
      appVersion: "0.1.0",
      platform: "win32",
      arch: "x64",
      hostname: "legacy",
      cohorts: ["alpha-private"],
      experiments: null,
      feedback: null,
    };
    await kv.store.put("control:device:dev_legacy", JSON.stringify(legacyRecord));
    await kv.store.put("control:install:install-legacy", JSON.stringify("dev_legacy"));

    const response = await registerDevice(kv.store, {
      installId: "install-legacy",
      deviceId: "dev_legacy",
      version: "0.1.0",
      platform: "win32",
      arch: "x64",
      hostname: "legacy",
      ts: "2026-04-28T00:01:00.000Z",
    });

    expect(response.activated).toBe(true);
    expect(response.policyId).toBe("alpha-basic");
    expect(response.cohorts).toEqual(["alpha-basic"]);
    const saved = JSON.parse(kv.read("control:device:dev_legacy") ?? "{}");
    expect(saved.policyId).toBe("alpha-basic");
    expect(saved.cohorts).toEqual(["alpha-basic"]);
  });

  test("repeated register within write window does not re-put device records", async () => {
    const kv = createKvStore();

    const registered = await registerDevice(kv.store, {
      installId: "install-repeat",
      version: "0.1.0",
      platform: "win32",
      ts: "2026-04-28T00:00:00.000Z",
    });
    kv.puts.length = 0;

    await registerDevice(kv.store, {
      installId: "install-repeat",
      deviceId: registered.deviceId,
      version: "0.1.0",
      platform: "win32",
      ts: "2026-04-28T00:05:00.000Z",
    });

    expect(kv.puts.filter((key) => key.startsWith("control:device:")).length).toBe(0);
    expect(kv.puts.filter((key) => key.startsWith("control:install:")).length).toBe(0);
    expect(kv.puts).not.toContain("control:devices:recent");
  });

  test("changed register still writes device record", async () => {
    const kv = createKvStore();

    const registered = await registerDevice(kv.store, {
      installId: "install-change",
      version: "0.1.0",
      platform: "win32",
      ts: "2026-04-28T00:00:00.000Z",
    });
    kv.puts.length = 0;

    await registerDevice(kv.store, {
      installId: "install-change",
      deviceId: registered.deviceId,
      version: "0.1.1",
      platform: "win32",
      ts: "2026-04-28T00:05:00.000Z",
    });

    expect(kv.puts).toContain(`control:device:${registered.deviceId}`);
    expect(kv.puts).toContain("control:install:install-change");
    expect(kv.puts).toContain("control:devices:recent");
  });

  test("activates alpha-basic and preserves managed-basic UI defaults on next register", async () => {
    const kv = createKvStore();

    await putRuntimePolicy(kv.store as never, {
      userSettingsDefaults: {
        appearance: {
          themeId: "tokyo-night-storm",
          dockSkin: 4,
        },
      },
    } as never);

    const activated = await activateDevice(kv.store, {
      installId: "install-basic",
      inviteCode: "basic-code",
      version: "0.1.0",
      platform: "win32",
    }, {
      "BASIC-CODE": {
        policyId: "alpha-basic",
        policyLabel: "Alpha Basic",
      },
    });

    expect(activated).toEqual({
      ok: true,
      deviceId: activated.deviceId,
      activated: true,
      policyId: "alpha-basic",
      policyLabel: "Alpha Basic",
    });

    const registered = await registerDevice(kv.store, {
      installId: "install-basic",
      deviceId: activated.deviceId,
      version: "0.1.0",
      platform: "win32",
    });

    expect(registered.activated).toBe(true);
    expect(registered.policyId).toBe("alpha-basic");
    expect(registered.policyLabel).toBe("Alpha Basic");
    expect(registered.cohorts).toEqual(["alpha-basic"]);
    expect((registered.defaults?.ui as Record<string, unknown> | undefined)?.showAdvancedSettings).toBe(false);
    expect((registered.defaults?.ui as Record<string, unknown> | undefined)?.hideProviderModelSelectors).toBe(true);
    expect(registered.features["assistant.mode"]).toBe(false);
    expect(registered.features["assistant.quickChat"]).toBe(false);
    expect(registered.features["presets.edit"]).toBe(false);
    expect(registered.features["presets.run"]).toBe(false);
    expect(registered.features["results.history"]).toBe(false);
    expect((registered.defaults?.userSettingsDefaults as Record<string, unknown> | undefined)?.hotkeys).toEqual({
      pasteLast: "Alt+Shift+X",
      quickChat: "Alt+Shift+C",
      resultHistory: "Alt+Shift+Z",
      picker: "Alt+Q",
      pushToTalk: "Alt+Space",
      stopAndSubmit: "Alt+Shift+Space",
      toggleAssistantMode: "",
      togglePressEnterAfterPaste: "",
      voiceRecord: "Alt+Ctrl+Space",
    });
    expect((registered.defaults?.userSettingsDefaults as Record<string, unknown> | undefined)?.appearance).toEqual({
      themeId: "github-light",
      dockSkin: 4,
    });
    expect((registered.defaults?.userSettingsDefaults as Record<string, unknown> | undefined)?.general).toEqual({
      onboardingDone: false,
      showDockOnStartup: true,
      startWithWindows: false,
      preferredSurface: "alpha",
      uiLanguage: "system",
    });
    expect((registered.defaults?.userSettingsDefaults as Record<string, unknown> | undefined)?.transcript).toEqual({
      language: "",
    });
    expect((registered.defaults?.userSettingsDefaults as Record<string, unknown> | undefined)?.voice).toEqual({
      muteOutputDuringRecording: true,
      pressEnterAfterPaste: false,
      showQuickChatReasoning: true,
      showPresetReasoning: false,
      assistantWakeWords: "lulu",
      assistantModeToggleWords: "modo lulu,lulu",
      commandWakeWords: "comando,command",
    });
  });

  test("activates alpha-full and exposes advanced UI defaults on next register", async () => {
    const kv = createKvStore();

    await putRuntimePolicy(kv.store as never, {
      userSettingsDefaults: {
        appearance: {
          themeId: "tokyo-night-storm",
          dockSkin: 4,
        },
      },
    } as never);

    const activated = await activateDevice(kv.store, {
      installId: "install-full",
      inviteCode: "full-code",
      version: "0.1.0",
      platform: "win32",
    }, {
      "FULL-CODE": {
        policyId: "alpha-full",
        policyLabel: "Alpha Full",
      },
    });

    const registered = await registerDevice(kv.store, {
      installId: "install-full",
      deviceId: activated.deviceId,
      version: "0.1.0",
      platform: "win32",
    });

    expect(registered.activated).toBe(true);
    expect(registered.policyId).toBe("alpha-full");
    expect(registered.policyLabel).toBe("Alpha Full");
    expect(registered.cohorts).toEqual(["alpha-full"]);
    expect((registered.defaults?.ui as Record<string, unknown> | undefined)?.showAdvancedSettings).toBe(true);
    expect((registered.defaults?.ui as Record<string, unknown> | undefined)?.hideProviderModelSelectors).toBe(false);
    expect((registered.defaults?.ui as Record<string, unknown> | undefined)?.hidePresetProviderModelOverrides).toBe(false);
    expect(((registered.defaults?.llm as Record<string, unknown> | undefined)?.presetOverridePolicy)).toBe("allow");
    expect(registered.features["assistant.mode"]).toBe(true);
    expect(registered.features["assistant.quickChat"]).toBe(true);
    expect(registered.features["presets.edit"]).toBe(true);
    expect(registered.features["presets.run"]).toBe(true);
    expect(registered.features["results.history"]).toBe(true);
    expect((registered.defaults?.userSettingsDefaults as Record<string, unknown> | undefined)?.hotkeys).toEqual({
      pasteLast: "Alt+Shift+X",
      quickChat: "Alt+Shift+C",
      resultHistory: "Alt+Shift+Z",
      picker: "Alt+Q",
      pushToTalk: "Alt+Space",
      stopAndSubmit: "Alt+Shift+Space",
      toggleAssistantMode: "",
      togglePressEnterAfterPaste: "",
      voiceRecord: "Alt+Ctrl+Space",
    });
    expect((registered.defaults?.userSettingsDefaults as Record<string, unknown> | undefined)?.appearance).toEqual({
      themeId: "github-light",
      dockSkin: 4,
    });
    expect((registered.defaults?.userSettingsDefaults as Record<string, unknown> | undefined)?.general).toEqual({
      onboardingDone: false,
      showDockOnStartup: true,
      startWithWindows: false,
      preferredSurface: "alpha",
      uiLanguage: "system",
    });
    expect((registered.defaults?.userSettingsDefaults as Record<string, unknown> | undefined)?.transcript).toEqual({
      language: "",
    });
    expect((registered.defaults?.userSettingsDefaults as Record<string, unknown> | undefined)?.voice).toEqual({
      muteOutputDuringRecording: true,
      pressEnterAfterPaste: false,
      showQuickChatReasoning: true,
      showPresetReasoning: false,
      assistantWakeWords: "lulu",
      assistantModeToggleWords: "modo lulu,lulu",
      commandWakeWords: "comando,command",
    });
  });

  test("resolves policy assignments from reusable runtime profiles", async () => {
    const kv = createKvStore();

    await putRuntimePolicy(kv.store as never, {
      runtimeMode: "managed",
      transport: { mode: "proxy-only" },
      speech: {
        transcription: {
          provider: "groq",
          model: "whisper-large-v3-turbo",
          policy: "locked",
        },
      },
      policyAssignments: {
        "alpha-basic": {
          uiProfile: "simple",
          capabilityProfile: "dictation-only",
          quotaProfile: "tiny-quota",
          llmProfile: "locked",
          settingsDefaultsProfile: "custom-hotkeys",
        },
      },
      policyProfiles: {
        ui: {
          simple: {
            ui: {
              hideProviderModelSelectors: true,
              hidePresetProviderModelOverrides: true,
              showAdvancedSettings: false,
              showDebugTools: false,
            },
          },
        },
        capabilities: {
          "dictation-only": {
            features: {
              "assistant.mode": false,
              "assistant.quickChat": false,
              "presets.edit": false,
              "presets.run": false,
              "results.history": true,
            },
          },
        },
        llm: {
          locked: {
            llm: {
              presetOverridePolicy: "deny",
            },
          },
        },
        settingsDefaults: {
          "custom-hotkeys": {
            userSettingsDefaults: {
              hotkeys: {
                pushToTalk: "Alt+Space",
                voiceRecord: "Ctrl+Alt+Space",
              },
              voice: {
                assistantWakeWords: "fixvox",
              },
            },
          },
        },
        quota: {
          "tiny-quota": {
            rolling5hLimit: 3,
            weeklyLimit: 9,
            transcriptionRolling5hSeconds: 120,
            transcriptionWeeklySeconds: 600,
            aiActionsRolling5hLimit: 2,
            aiActionsWeeklyLimit: 8,
            quotaMultiplier: 1,
          },
        },
      },
    } as never);

    const registered = await registerDevice(kv.store, {
      installId: "install-profiled",
      version: "0.1.0",
      platform: "win32",
    });

    expect(registered.policyId).toBe("alpha-basic");
    expect(registered.features["assistant.mode"]).toBe(false);
    expect(registered.features["results.history"]).toBe(true);
    expect((registered.defaults?.llm as Record<string, unknown> | undefined)?.presetOverridePolicy).toBe("deny");
    expect((registered.defaults?.userSettingsDefaults as Record<string, unknown> | undefined)?.hotkeys).toMatchObject({
      pushToTalk: "Alt+Space",
      voiceRecord: "Ctrl+Alt+Space",
    });
    expect((registered.defaults?.userSettingsDefaults as Record<string, unknown> | undefined)?.voice).toMatchObject({
      assistantWakeWords: "fixvox",
    });
    expect(registered.limits?.managedUsage.policy.matchedCohort).toBe("tiny-quota");
    expect(registered.limits?.managedUsage.windows.rolling5h.limit).toBe(3);
    expect(registered.limits?.managedUsage.windows.weekly.limit).toBe(9);
    expect(registered.limits?.transcription.windows.rolling5h.limit).toBe(120);
    expect(registered.limits?.aiActions.windows.weekly.limit).toBe(8);
  });

  test("falls back to legacy managedUsage groups when quota profile is missing", async () => {
    const kv = createKvStore();

    await putRuntimePolicy(kv.store as never, {
      runtimeMode: "managed",
      transport: { mode: "proxy-only" },
      speech: {
        transcription: {
          provider: "groq",
          model: "whisper-large-v3-turbo",
          policy: "locked",
        },
      },
      policyAssignments: {
        "alpha-basic": {
          quotaProfile: "missing-profile",
        },
      },
      managedUsage: {
        estimatePerRequest: 1,
        globalMultiplier: 1,
        groups: {
          "alpha-basic": {
            rolling5hLimit: 11,
            weeklyLimit: 22,
            transcriptionRolling5hSeconds: 33,
            transcriptionWeeklySeconds: 44,
            aiActionsRolling5hLimit: 55,
            aiActionsWeeklyLimit: 66,
            quotaMultiplier: 1,
          },
        },
      },
    } as never);

    const registered = await registerDevice(kv.store, {
      installId: "install-legacy-quota",
      version: "0.1.0",
      platform: "win32",
    });

    expect(registered.limits?.managedUsage.policy.matchedCohort).toBe("alpha-basic");
    expect(registered.limits?.managedUsage.windows.rolling5h.limit).toBe(11);
    expect(registered.limits?.transcription.windows.weekly.limit).toBe(44);
    expect(registered.limits?.aiActions.windows.rolling5h.limit).toBe(55);
  });

  test("lists read-only admin device rows with profiles and limits", async () => {
    const kv = createKvStore();

    await putRuntimePolicy(kv.store as never, {
      policyAssignments: {
        "alpha-basic": {
          uiProfile: "simple",
          capabilityProfile: "dictation-only",
          quotaProfile: "tiny-quota",
          llmProfile: "locked",
          settingsDefaultsProfile: "custom-hotkeys",
        },
      },
      policyProfiles: {
        quota: {
          "tiny-quota": {
            rolling5hLimit: 3,
            weeklyLimit: 9,
            transcriptionRolling5hSeconds: 120,
            transcriptionWeeklySeconds: 600,
            aiActionsRolling5hLimit: 2,
            aiActionsWeeklyLimit: 8,
            quotaMultiplier: 1,
          },
        },
      },
    } as never);

    const registered = await registerDevice(kv.store, {
      installId: "install-admin-list",
      version: "0.1.0",
      platform: "win32",
      ts: "2026-04-28T00:00:00.000Z",
    });

    const listed = await listControlPlaneAdminDevices(kv.store);

    expect(listed.ok).toBe(true);
    expect(listed.source).toBe("stored");
    expect(listed.policyOptions.map((option) => option.policyId)).toContain("alpha-basic");
    expect(listed.devices).toHaveLength(1);
    expect(listed.devices[0]).toMatchObject({
      deviceId: registered.deviceId,
      installId: "install-admin-list",
      policyId: "alpha-basic",
      policyLabel: "Alpha Basic",
      cohorts: ["alpha-basic"],
      status: "active",
      lastSeenAt: "2026-04-28T00:00:00.000Z",
      profiles: {
        uiProfile: "simple",
        capabilityProfile: "dictation-only",
        quotaProfile: "tiny-quota",
        llmProfile: "locked",
        settingsDefaultsProfile: "custom-hotkeys",
      },
    });
    expect(listed.devices[0].limits.managedUsage.windows.rolling5h.limit).toBe(3);
    expect(listed.devices[0].limits.transcription.windows.weekly.limit).toBe(600);
    expect(listed.devices[0].limits.aiActions.windows.rolling5h.limit).toBe(2);
    expect(listed.nextCursor).toBeNull();
  });

  test("assigns a device policy through the admin store function", async () => {
    const kv = createKvStore();
    const registered = await registerDevice(kv.store, {
      installId: "install-admin-assign",
      version: "0.1.0",
      platform: "win32",
    });

    const updated = await assignControlPlaneAdminDevicePolicy(kv.store, {
      deviceId: registered.deviceId,
      policyId: "alpha-full",
    });

    expect(updated.ok).toBe(true);
    expect(updated.device.policyId).toBe("alpha-full");
    expect(updated.device.policyLabel).toBe("Alpha Full");
    expect(updated.device.cohorts).toEqual(["alpha-full"]);
    expect(updated.device.profiles).toMatchObject({
      uiProfile: "alpha-full",
      capabilityProfile: "full",
      llmProfile: "allow-presets",
    });
    expect(updated.device.limits.managedUsage.windows.rolling5h.limit).toBe(150);
  });

  test("assigns JP policy with full UI, best voice defaults, and practical no-limit quota", async () => {
    const kv = createKvStore();
    const registered = await registerDevice(kv.store, {
      installId: "install-admin-pro",
      version: "0.1.0",
      platform: "win32",
    });

    const updated = await assignControlPlaneAdminDevicePolicy(kv.store, {
      deviceId: registered.deviceId,
      policyId: "pro",
    });

    const registeredAgain = await registerDevice(kv.store, {
      installId: "install-admin-pro",
      deviceId: registered.deviceId,
      version: "0.1.0",
      platform: "win32",
    });
    const llm = updated.device.policyId ? registeredAgain.defaults?.llm as Record<string, unknown> : null;
    const targets = llm?.targets as Record<string, unknown> | undefined;
    const postProcess = targets?.postProcess as Record<string, unknown> | undefined;

    expect(updated.ok).toBe(true);
    expect(updated.device.policyId).toBe("pro");
    expect(updated.device.policyLabel).toBe("Pro");
    expect(updated.device.cohorts).toEqual(["pro"]);
    expect(updated.device.profiles).toMatchObject({
      uiProfile: "alpha-full",
      capabilityProfile: "full",
      quotaProfile: "pro-unlimited",
      llmProfile: "pro-best-voice",
    });
    expect(updated.device.limits.managedUsage.windows.rolling5h.limit).toBe(1_000_000);
    expect(updated.device.limits.aiActions.windows.rolling5h.limit).toBe(1_000_000);
    expect(updated.device.limits.transcription.windows.weekly.limit).toBe(10_000_000);
    expect(postProcess).toMatchObject({
      provider: "groq",
      model: "openai/gpt-oss-120b",
      policy: "locked",
    });
    expect((registeredAgain.defaults?.voiceRouting as Record<string, unknown> | undefined)?.runtime).toMatchObject({
      sttPromptEnabled: true,
      postProcessEnabled: true,
    });
    expect((registeredAgain.defaults?.prompts as Record<string, Record<string, unknown>> | undefined)?.postProcessBase).toMatchObject({
      policy: "default",
    });
    expect((registeredAgain.defaults?.prompts as Record<string, Record<string, unknown>> | undefined)?.postProcessBase?.text).toContain("minimal edits");
    expect((registeredAgain.defaults?.prompts as Record<string, Record<string, unknown>> | undefined)?.postProcessBase?.text).toContain("primero/segundo/tercero");
  });

  test("rejects unknown admin policy assignments", async () => {
    const kv = createKvStore();
    const registered = await registerDevice(kv.store, {
      installId: "install-admin-assign-bad",
      version: "0.1.0",
      platform: "win32",
    });

    await expect(assignControlPlaneAdminDevicePolicy(kv.store, {
      deviceId: registered.deviceId,
      policyId: "made-up-policy",
    })).rejects.toThrow("unknown policyId");
  });

  test("rejects unknown invite codes", async () => {
    const kv = createKvStore();

    await expect(activateDevice(kv.store, {
      installId: "install-bad",
      inviteCode: "bad-code",
    }, {})).rejects.toThrow("invalid_invite_code");
  });
});
