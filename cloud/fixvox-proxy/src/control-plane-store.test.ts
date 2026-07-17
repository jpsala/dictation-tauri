// @ts-expect-error Bun provides this module in `bun test`; root TS config does not ship Bun ambient types.
import { describe, expect, test } from "bun:test";

import {
  activateDevice,
  assignControlPlaneAdminAccountPolicy,
  assignControlPlaneAdminDevicePolicy,
  DeviceBindingConflictError,
  assignControlPlaneAdminSelectionPresetDefaults,
  createControlPlaneAdminProfileDraft,
  discardControlPlaneAdminProfileDraft,
  deleteControlPlaneAdminEngine,
  deleteControlPlaneAdminPrompt,
  evaluateExecutionPreflight,
  getControlPlaneAdminVariantConfig,
  listControlPlaneAdminAccounts,
  listControlPlaneAdminDevices,
  listControlPlaneAdminProfiles,
  publishControlPlaneAdminProfile,
  previewControlPlaneAdminProfile,
  registerDevice,
  resolveExecutionEngineForDevice,
  rollbackControlPlaneAdminProfile,
  saveControlPlaneAdminProfileDraft,
  listControlPlaneAdminRoleBindings,
  setControlPlaneAdminRoleBinding,
  removeControlPlaneAdminRoleBinding,
  ControlPlaneAdminRoleBindingError,
  ControlPlaneAdminProfileStaleError,
  listControlPlaneAdminAudit,
} from "./control-plane-store";
import { putRuntimePolicy } from "./runtime-policy-store";
import { putPricingRecord } from "./pricing-store";

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

  test("reuses the matching install alias when deviceId is omitted", async () => {
    const kv = createKvStore();
    const first = await registerDevice(kv.store, {
      installId: "install-alias-refresh",
      deviceId: "device-alias-refresh",
    });

    const refreshed = await registerDevice(kv.store, {
      installId: "install-alias-refresh",
      version: "0.1.1",
    });

    expect(refreshed.deviceId).toBe(first.deviceId);
  });

  test("rejects rebinding an existing device to a different install without mutating KV", async () => {
    const kv = createKvStore();
    const first = await registerDevice(kv.store, {
      installId: "install-owner",
      deviceId: "device-owner",
    });
    const originalRecord = kv.read(`control:device:${first.deviceId}`);
    kv.puts.length = 0;

    await expect(registerDevice(kv.store, {
      installId: "install-attacker",
      deviceId: first.deviceId,
    })).rejects.toBeInstanceOf(DeviceBindingConflictError);

    expect(kv.puts).toEqual([]);
    expect(kv.read(`control:device:${first.deviceId}`)).toBe(originalRecord);
    expect(kv.read("control:install:install-attacker")).toBeNull();
  });

  test("rejects a supplied device that conflicts with the install alias without mutating KV", async () => {
    const kv = createKvStore();
    await registerDevice(kv.store, {
      installId: "install-bound",
      deviceId: "device-bound",
    });
    kv.puts.length = 0;

    await expect(registerDevice(kv.store, {
      installId: "install-bound",
      deviceId: "device-other",
    })).rejects.toBeInstanceOf(DeviceBindingConflictError);

    expect(kv.puts).toEqual([]);
    expect(kv.read("control:install:install-bound")).toBe(JSON.stringify("device-bound"));
    expect(kv.read("control:device:device-other")).toBeNull();
  });

  test("same-binding refresh preserves account, policy, and status", async () => {
    const kv = createKvStore();
    const first = await registerDevice(kv.store, {
      installId: "install-stable",
      deviceId: "device-stable",
    }, { accountId: "google:stable-account" });
    await assignControlPlaneAdminDevicePolicy(kv.store, {
      deviceId: first.deviceId,
      policyId: "pro",
    });
    const before = JSON.parse(kv.read(`control:device:${first.deviceId}`) ?? "{}");

    await registerDevice(kv.store, {
      installId: "install-stable",
      deviceId: first.deviceId,
      version: "0.1.1",
    });
    const after = JSON.parse(kv.read(`control:device:${first.deviceId}`) ?? "{}");

    expect(after).toMatchObject({
      accountId: before.accountId,
      policyId: before.policyId,
      policyLabel: before.policyLabel,
      status: before.status,
    });
  });

  test("exposes Fixvox preset prompt defaults for Settings sync", async () => {
    const kv = createKvStore();

    const response = await registerDevice(kv.store, {
      installId: "install-presets",
      version: "0.1.0",
      platform: "win32",
    });
    const userSettingsDefaults = response.defaults?.userSettingsDefaults as Record<string, unknown> | undefined;
    const selectionPresets = userSettingsDefaults?.selectionPresets as Record<string, unknown> | undefined;
    const items = selectionPresets?.items as Array<Record<string, unknown>> | undefined;
    const promptConfig = await getControlPlaneAdminVariantConfig(kv.store);

    expect(selectionPresets).toMatchObject({ source: "fixvox-cloud-admin", schemaVersion: 1 });
    expect(items?.map((item) => item.id)).toEqual(["como-yo-es", "corregir-texto", "fix-writing", "like-me-en"]);
    expect(items?.map((item) => item.promptId)).toEqual([
      "preset.como-yo-es",
      "preset.corregir-texto",
      "preset.fix-writing",
      "preset.like-me-en",
    ]);
    expect(items?.find((item) => item.id === "como-yo-es")).toMatchObject({
      label: "Como yo (español)",
      pickerKey: "Y",
      hotkey: "Alt+T, Y",
      provider: "openrouter",
      enabled: true,
      confirm: false,
      promptContent: expect.stringContaining("voseo argentino"),
    });
    expect(promptConfig.promptOptions.map((prompt) => prompt.id)).toEqual(expect.arrayContaining([
      "preset.como-yo-es",
      "preset.corregir-texto",
      "preset.fix-writing",
      "preset.like-me-en",
    ]));
    expect(promptConfig.promptOptions.find((prompt) => prompt.id === "preset.fix-writing")).toMatchObject({
      kind: "selectionTransform",
      source: "built-in",
      content: expect.stringContaining("Return only the corrected text"),
    });
});

test("updates Cloud selection preset defaults and syncs preset prompts", async () => {
    const kv = createKvStore();

    const result = await assignControlPlaneAdminSelectionPresetDefaults(kv.store, {
      source: "fixvox-cloud-admin",
      items: [
            {
                id: "corregir-texto",
                label: "Corregir texto",
                promptId: "preset.corregir-texto",
                hotkey: "Alt+T, C",
                pickerKey: "C",
                provider: "openrouter",
                model: null,
                enabled: true,
                confirm: false,
                promptContent: "Corregí y devolvé solo el texto final actualizado.",
            },
      ],
    });
    const registered = await registerDevice(kv.store, {
      installId: "install-presets-updated",
      version: "0.1.0",
      platform: "win32",
    });
    const userSettingsDefaults = registered.defaults?.userSettingsDefaults as Record<string, unknown> | undefined;
    const selectionPresets = userSettingsDefaults?.selectionPresets as Record<string, unknown> | undefined;
    const items = selectionPresets?.items as Array<Record<string, unknown>> | undefined;
    const promptConfig = await getControlPlaneAdminVariantConfig(kv.store);

    expect(result.ok).toBe(true);
    expect(items).toHaveLength(1);
    expect(items?.[0]).toMatchObject({
      id: "corregir-texto",
      promptId: "preset.corregir-texto",
      pickerKey: "C",
      promptContent: "Corregí y devolvé solo el texto final actualizado.",
    });
    expect(promptConfig.promptOptions.find((prompt) => prompt.id === "preset.corregir-texto")).toMatchObject({
      source: "custom",
      kind: "selectionTransform",
      content: "Corregí y devolvé solo el texto final actualizado.",
    });
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

  test("rejects activating an existing device from a different install without mutating KV", async () => {
    const kv = createKvStore();
    const registered = await registerDevice(kv.store, {
      installId: "install-activation-owner",
      deviceId: "device-activation-owner",
    });
    const originalRecord = kv.read(`control:device:${registered.deviceId}`);
    kv.puts.length = 0;

    await expect(activateDevice(kv.store, {
      installId: "install-activation-attacker",
      deviceId: registered.deviceId,
      inviteCode: "basic-code",
    }, {
      "BASIC-CODE": { policyId: "alpha-basic", policyLabel: "Alpha Basic" },
    })).rejects.toBeInstanceOf(DeviceBindingConflictError);

    expect(kv.puts).toEqual([]);
    expect(kv.read(`control:device:${registered.deviceId}`)).toBe(originalRecord);
    expect(kv.read("control:install:install-activation-attacker")).toBeNull();
  });

  test("rejects activation when the supplied device conflicts with the install alias", async () => {
    const kv = createKvStore();
    await registerDevice(kv.store, {
      installId: "install-activation-bound",
      deviceId: "device-activation-bound",
    });
    kv.puts.length = 0;

    await expect(activateDevice(kv.store, {
      installId: "install-activation-bound",
      deviceId: "device-activation-other",
      inviteCode: "basic-code",
    }, {
      "BASIC-CODE": { policyId: "alpha-basic", policyLabel: "Alpha Basic" },
    })).rejects.toBeInstanceOf(DeviceBindingConflictError);

    expect(kv.puts).toEqual([]);
    expect(kv.read("control:install:install-activation-bound")).toBe(JSON.stringify("device-activation-bound"));
    expect(kv.read("control:device:device-activation-other")).toBeNull();
  });

  test("allows activation when install and device keep the same binding", async () => {
    const kv = createKvStore();
    const registered = await registerDevice(kv.store, {
      installId: "install-activation-stable",
      deviceId: "device-activation-stable",
    });

    const activated = await activateDevice(kv.store, {
      installId: "install-activation-stable",
      deviceId: registered.deviceId,
      inviteCode: "full-code",
    }, {
      "FULL-CODE": { policyId: "alpha-full", policyLabel: "Alpha Full" },
    });

    expect(activated).toMatchObject({
      ok: true,
      deviceId: registered.deviceId,
      policyId: "alpha-full",
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

  test("assigns the capability-bearing power-admin profile", async () => {
    const kv = createKvStore();
    const registered = await registerDevice(kv.store, {
      installId: "install-power-admin",
      version: "0.1.0",
      platform: "win32",
    });

    const updated = await assignControlPlaneAdminDevicePolicy(kv.store, {
      deviceId: registered.deviceId,
      policyId: "power-admin",
    });

    expect(updated.device.policyId).toBe("power-admin");
    expect(updated.device.profiles).toMatchObject({
      uiProfile: "alpha-full",
      capabilityProfile: "power",
      quotaProfile: "pro-unlimited",
      llmProfile: "pro-best-voice",
    });
  });

  test("lists safe profile summaries for the Configuration hub", async () => {
    const kv = createKvStore();
    const config = await getControlPlaneAdminVariantConfig(kv.store);
    const byId = Object.fromEntries(config.profileOptions.map((profile) => [profile.policyId, profile]));

    expect(Object.keys(byId)).toEqual(expect.arrayContaining(["alpha-basic", "alpha-full", "power-admin", "pro"]));
    expect(byId["alpha-basic"].capabilities).toContain("dictation");
    expect(byId["alpha-basic"].capabilities).not.toContain("selection_transform");
    expect(byId["power-admin"].capabilities).toContain("admin_settings");
    expect(byId["power-admin"].profiles).toMatchObject({
      uiProfile: "alpha-full",
      capabilityProfile: "power",
      quotaProfile: "pro-unlimited",
      llmProfile: "pro-best-voice",
    });
    expect(JSON.stringify(config.profileOptions)).not.toContain("promptContent");
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

describe("durable control-plane RBAC", () => {
  const bootstrapOwnerEmail = "jpsala@gmail.com";

  test("bootstraps the configured normalized owner once and exposes only redacted bindings", async () => {
    const kv = createKvStore();

    const first = await listControlPlaneAdminRoleBindings(kv.store, { bootstrapOwnerEmail: "  JPSALA@GMAIL.COM " });
    const persisted = kv.read("control:admin-roles:v1");
    const second = await listControlPlaneAdminRoleBindings(kv.store, { bootstrapOwnerEmail });

    expect(kv.puts).toEqual(["control:admin-roles:v1"]);
    expect(first.bindings).toEqual([{ emailRedacted: "j…@gmail.com", role: "owner" }]);
    expect(second.bindings).toEqual(first.bindings);
    expect(JSON.stringify(first)).not.toContain(bootstrapOwnerEmail);
    expect(persisted).not.toContain(bootstrapOwnerEmail);
  });

  test("fails closed when a non-owner attempts to manage durable role bindings", async () => {
    const kv = createKvStore();
    await listControlPlaneAdminRoleBindings(kv.store, { bootstrapOwnerEmail });
    const before = kv.read("control:admin-roles:v1");
    kv.puts.length = 0;

    await expect(setControlPlaneAdminRoleBinding(kv.store, {
      bootstrapOwnerEmail,
      actorEmail: "editor@example.com",
      subjectEmail: "publisher@example.com",
      role: "publisher",
    })).rejects.toBeInstanceOf(ControlPlaneAdminRoleBindingError);

    expect(kv.puts).toEqual([]);
    expect(kv.read("control:admin-roles:v1")).toBe(before);
  });

  test("allows an owner to grant a role but never demote or remove the final owner", async () => {
    const kv = createKvStore();
    await listControlPlaneAdminRoleBindings(kv.store, { bootstrapOwnerEmail });
    await setControlPlaneAdminRoleBinding(kv.store, {
      bootstrapOwnerEmail,
      actorEmail: bootstrapOwnerEmail,
      subjectEmail: "publisher@example.com",
      role: "publisher",
    });
    expect((await listControlPlaneAdminRoleBindings(kv.store, { bootstrapOwnerEmail })).bindings).toEqual(expect.arrayContaining([
      { emailRedacted: "j…@gmail.com", role: "owner" },
      { emailRedacted: "p…@example.com", role: "publisher" },
    ]));

    const before = kv.read("control:admin-roles:v1");
    kv.puts.length = 0;
    await expect(setControlPlaneAdminRoleBinding(kv.store, {
      bootstrapOwnerEmail,
      actorEmail: bootstrapOwnerEmail,
      subjectEmail: bootstrapOwnerEmail,
      role: "publisher",
    })).rejects.toBeInstanceOf(ControlPlaneAdminRoleBindingError);
    await expect(removeControlPlaneAdminRoleBinding(kv.store, {
      bootstrapOwnerEmail,
      actorEmail: bootstrapOwnerEmail,
      subjectEmail: bootstrapOwnerEmail,
    })).rejects.toBeInstanceOf(ControlPlaneAdminRoleBindingError);

    expect(kv.puts).toEqual([]);
    expect(kv.read("control:admin-roles:v1")).toBe(before);
  });
});

describe("profile composer preview", () => {
  test("refreshes account effective profile labels after publish and rollback", async () => {
    const kv = createKvStore();
    const accountId = "google:profile-refresh-account";
    const registered = await registerDevice(kv.store, {
      installId: "install-profile-refresh",
    }, { accountId, authProviders: ["google"] });
    await assignControlPlaneAdminDevicePolicy(kv.store, { deviceId: registered.deviceId, policyId: "pro" });
    await assignControlPlaneAdminAccountPolicy(kv.store, {
      accountId,
      policyId: "pro",
    });

    const before = await listControlPlaneAdminAccounts(kv.store);
    expect(before.accounts[0]?.effectivePolicyLabel).toBe("Pro");

    const created = await createControlPlaneAdminProfileDraft(kv.store, { profileId: "pro" });
    if (!created.draft) throw new Error("expected pro draft");
    await saveControlPlaneAdminProfileDraft(kv.store, {
      profileId: "pro",
      definition: { ...created.draft, label: "Pro refreshed" },
    });
    await publishControlPlaneAdminProfile(kv.store, {
      profileId: "pro",
      expectedActiveVersion: 1,
      expectedDraftVersion: created.draft.version,
      confirmation: `PUBLISH pro v${created.draft.version}`,
    });

    const afterPublish = await listControlPlaneAdminAccounts(kv.store);
    expect(afterPublish.accounts[0]).toMatchObject({
      policyLabel: "Pro refreshed",
      effectivePolicyLabel: "Pro refreshed",
    });
    expect((await listControlPlaneAdminDevices(kv.store)).devices.find((device) => device.deviceId === registered.deviceId)?.policyLabel).toBe("Pro refreshed");

    await rollbackControlPlaneAdminProfile(kv.store, {
      profileId: "pro",
      version: 1,
      expectedActiveVersion: 2,
      confirmation: "ROLLBACK pro to v1",
    });
    const afterRollback = await listControlPlaneAdminAccounts(kv.store);
    expect(afterRollback.accounts[0]).toMatchObject({
      policyLabel: "Pro",
      effectivePolicyLabel: "Pro",
    });
    expect((await listControlPlaneAdminDevices(kv.store)).devices.find((device) => device.deviceId === registered.deviceId)?.policyLabel).toBe("Pro");
  });

  test("reports cached pricing for the draft runtime without refreshing providers", async () => {
    const kv = createKvStore();
    await putPricingRecord(kv.store, {
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4",
      pricingSource: "test-cache",
      checkedAt: "2026-07-14T12:00:00.000Z",
      status: "live",
      unitType: "per_1m_tokens",
      currency: "USD",
      inputPrice: "3.00",
      outputPrice: "15.00",
      audioInputPrice: null,
      audioOutputPrice: null,
      requestPrice: null,
      rawPriceJson: null,
    });
    for (const [provider, model] of [["groq", "whisper-large-v3-turbo"], ["groq", "llama-3.3-70b-versatile"]] as const) {
      await putPricingRecord(kv.store, {
        provider,
        model,
        pricingSource: "test-cache",
        checkedAt: "2026-07-14T12:00:00.000Z",
        status: "live",
        unitType: "per_1m_tokens",
        currency: "USD",
        inputPrice: "1.00",
        outputPrice: "2.00",
        audioInputPrice: null,
        audioOutputPrice: null,
        requestPrice: null,
        rawPriceJson: null,
      });
    }
    const created = await createControlPlaneAdminProfileDraft(kv.store, { profileId: "pro" });
    if (!created.draft) throw new Error("expected pro draft");
    await saveControlPlaneAdminProfileDraft(kv.store, {
      profileId: "pro",
      definition: {
        ...created.draft,
        runtime: {
          ...created.draft.runtime,
          postprocess: { engineId: "postprocess-openrouter-premium", promptId: "postProcessBase" },
        },
      },
    });

    const preview = await previewControlPlaneAdminProfile(kv.store, { profileId: "pro" });

    expect(preview.pricing).toMatchObject({
      availability: "available",
      cachedAt: "2026-07-14T12:00:00.000Z",
      targets: expect.arrayContaining([expect.objectContaining({ operation: "postprocess", provider: "openrouter", model: "anthropic/claude-sonnet-4", status: "live" })]),
    });
  });

  test("resolves a selected account target with its effective routing source", async () => {
    const kv = createKvStore();
    const accountId = "google:preview-account-target";
    const registered = await registerDevice(kv.store, {
      installId: "install-preview-account-target",
    }, { accountId, authProviders: ["google"] });
    await assignControlPlaneAdminAccountPolicy(kv.store, { accountId, policyId: "pro" });
    const account = (await listControlPlaneAdminAccounts(kv.store)).accounts[0];
    const created = await createControlPlaneAdminProfileDraft(kv.store, { profileId: "pro" });
    if (!created.draft || !account) throw new Error("expected account profile draft");

    const preview = await previewControlPlaneAdminProfile(kv.store, {
      profileId: "pro",
      accountHandle: account.accountHandle,
    });

    expect(preview.selectedTarget).toMatchObject({
      accountHandle: account.accountHandle,
      deviceId: registered.deviceId,
      profileId: "pro",
      policySource: "account",
      routing: {
        transcription: { engineId: "stt-groq-whisper-turbo", promptId: "transcriptBase" },
        postprocess: { engineId: "postprocess-groq-gpt-oss-120b", promptId: "postProcessBase" },
        selectionTransform: { engineId: "transform-groq-llama-70b", promptId: "selectionTransformBase" },
      },
    });
  });

  test("previews a draft without KV writes or changing the published runtime", async () => {
    const kv = createKvStore();
    const registered = await registerDevice(kv.store, { installId: "install-profile-preview" });
    await assignControlPlaneAdminDevicePolicy(kv.store, { deviceId: registered.deviceId, policyId: "pro" });
    const created = await createControlPlaneAdminProfileDraft(kv.store, { profileId: "pro" });
    if (!created.draft) throw new Error("expected pro draft");
    await saveControlPlaneAdminProfileDraft(kv.store, {
      profileId: "pro",
      definition: {
        ...created.draft,
        runtime: {
          ...created.draft.runtime,
          postprocess: { engineId: "postprocess-openrouter-premium", promptId: "postProcessBase" },
        },
      },
    });
    const publishedBefore = await resolveExecutionEngineForDevice(kv.store, {
      deviceId: registered.deviceId,
      usageKind: "aiAction",
      engineKind: "postprocess",
    });
    kv.puts.length = 0;

    const preview = await previewControlPlaneAdminProfile(kv.store, {
      profileId: "pro",
      deviceId: registered.deviceId,
    });

    expect(kv.puts).toEqual([]);
    expect(preview.diff).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "runtime", path: "runtime.postprocess.engineId", before: "postprocess-groq-gpt-oss-120b", after: "postprocess-openrouter-premium" }),
    ]));
    expect(preview.impact).toEqual({ accounts: 0, devices: 1, groups: 2 });
    expect(preview.selectedTarget).toMatchObject({ deviceId: registered.deviceId, profileId: "pro" });
    expect(preview.pricing).toMatchObject({ availability: "unavailable" });
    expect(preview.warnings).toEqual([]);

    const publishedAfter = await resolveExecutionEngineForDevice(kv.store, {
      deviceId: registered.deviceId,
      usageKind: "aiAction",
      engineKind: "postprocess",
    });
    expect(publishedAfter?.engines.selected?.id).toBe(publishedBefore?.engines.selected?.id);
    expect(publishedAfter?.engines.selected?.id).toBe("postprocess-groq-gpt-oss-120b");
  });
});

describe("stale-safe profile mutations", () => {
  test("rejects stale publish and rollback confirmations before writing history", async () => {
    const kv = createKvStore();
    const created = await createControlPlaneAdminProfileDraft(kv.store, { profileId: "pro" });
    if (!created.draft || !created.published) throw new Error("expected pro versions");
    const beforePublish = kv.read("control:profiles:v1");
    kv.puts.length = 0;

    await expect(publishControlPlaneAdminProfile(kv.store, {
      profileId: "pro",
      expectedActiveVersion: 99,
      expectedDraftVersion: created.draft.version,
      confirmation: "PUBLISH pro v2",
    })).rejects.toBeInstanceOf(ControlPlaneAdminProfileStaleError);
    expect(kv.puts).toEqual([]);
    expect(kv.read("control:profiles:v1")).toBe(beforePublish);

    const published = await publishControlPlaneAdminProfile(kv.store, {
      profileId: "pro",
      expectedActiveVersion: created.published.version,
      expectedDraftVersion: created.draft.version,
      confirmation: "PUBLISH pro v2",
    });
    if (!published.published) throw new Error("expected published version");
    const beforeRollback = kv.read("control:profiles:v1");
    kv.puts.length = 0;
    await expect(rollbackControlPlaneAdminProfile(kv.store, {
      profileId: "pro",
      version: 1,
      expectedActiveVersion: 1,
      confirmation: "ROLLBACK pro to v1",
    })).rejects.toBeInstanceOf(ControlPlaneAdminProfileStaleError);
    expect(kv.puts).toEqual([]);
    expect(kv.read("control:profiles:v1")).toBe(beforeRollback);
  });
});

describe("versioned profile composer", () => {
  test("discards only the expected draft while preserving published history", async () => {
    const kv = createKvStore();
    const created = await createControlPlaneAdminProfileDraft(kv.store, { profileId: "pro" });
    if (!created.draft || !created.published) throw new Error("expected pro draft and publication");

    await expect(discardControlPlaneAdminProfileDraft(kv.store, {
      profileId: "pro",
      expectedDraftVersion: created.draft.version + 1,
      confirmation: `DISCARD pro v${created.draft.version + 1}`,
    })).rejects.toBeInstanceOf(ControlPlaneAdminProfileStaleError);
    await expect(discardControlPlaneAdminProfileDraft(kv.store, {
      profileId: "pro",
      expectedDraftVersion: created.draft.version,
      confirmation: "DISCARD pro wrong",
    })).rejects.toThrow("invalid discard confirmation");

    expect(await discardControlPlaneAdminProfileDraft(kv.store, {
      profileId: "pro",
      expectedDraftVersion: created.draft.version,
      confirmation: `DISCARD pro v${created.draft.version}`,
    })).toEqual({ ok: true, profileId: "pro", discardedDraftVersion: created.draft.version, publishedVersion: created.published.version });
    const profile = (await listControlPlaneAdminProfiles(kv.store)).profiles.find((item) => item.profileId === "pro");
    expect(profile?.draft).toBeNull();
    expect(profile?.published?.version).toBe(created.published.version);
    expect(profile?.history.map((version) => version.version)).toEqual([created.published.version]);
  });

  test("seeds typed published profiles and persists a draft without changing runtime", async () => {
    const kv = createKvStore();
    const registered = await registerDevice(kv.store, {
      installId: "install-profile-composer",
      version: "0.1.0",
      platform: "win32",
    });
    await assignControlPlaneAdminDevicePolicy(kv.store, {
      deviceId: registered.deviceId,
      policyId: "pro",
    });

    const seeded = await listControlPlaneAdminProfiles(kv.store);
    expect(seeded.profiles.map((profile) => profile.profileId)).toEqual([
      "alpha-basic",
      "alpha-full",
      "alpha-private",
      "power-admin",
      "pro",
    ]);
    const pro = seeded.profiles.find((profile) => profile.profileId === "pro");
    expect(pro?.published).toMatchObject({
      schemaVersion: 1,
      profileId: "pro",
      label: "Pro",
      version: 1,
      status: "published",
      access: { capabilities: expect.arrayContaining(["dictation", "managed_stt"]) },
      runtime: {
        transcription: { engineId: "stt-groq-whisper-turbo", promptId: "transcriptBase" },
        postprocess: { engineId: "postprocess-groq-gpt-oss-120b", promptId: "postProcessBase" },
        selectionTransform: { engineId: "transform-groq-llama-70b", promptId: "selectionTransformBase" },
      },
      limits: { dailyUsd: 5, monthlyUsd: 50, mode: "warn", quotaProfile: "pro-unlimited" },
    });
    expect(pro?.draft).toBeNull();

    const created = await createControlPlaneAdminProfileDraft(kv.store, { profileId: "pro" });
    if (!created.draft) throw new Error("expected pro draft");
    const draft = {
      ...created.draft,
      runtime: {
        ...created.draft.runtime,
        postprocess: { engineId: "postprocess-openrouter-premium", promptId: "postProcessBase" },
      },
    };
    await saveControlPlaneAdminProfileDraft(kv.store, { profileId: "pro", definition: draft });

    const persisted = await listControlPlaneAdminProfiles(kv.store);
    expect(persisted.profiles.find((profile) => profile.profileId === "pro")?.draft?.runtime.postprocess.engineId).toBe("postprocess-openrouter-premium");
    const runtime = await resolveExecutionEngineForDevice(kv.store, {
      deviceId: registered.deviceId,
      usageKind: "aiAction",
      engineKind: "postprocess",
    });
    expect(runtime?.engines.selected?.id).toBe("postprocess-groq-gpt-oss-120b");

    await publishControlPlaneAdminProfile(kv.store, { profileId: "pro", expectedActiveVersion: 1, expectedDraftVersion: 2, confirmation: "PUBLISH pro v2" });
    const publishedRuntime = await resolveExecutionEngineForDevice(kv.store, {
      deviceId: registered.deviceId,
      usageKind: "aiAction",
      engineKind: "postprocess",
    });
    expect(publishedRuntime?.engines.selected).toMatchObject({ id: "postprocess-openrouter-premium", promptKey: "postProcessBase" });
  });

  test("applies published access, defaults, and user controls only after publish", async () => {
    const kv = createKvStore();
    const accountId = "google:profile-composer-account";
    const registered = await registerDevice(kv.store, {
      installId: "install-profile-access",
      version: "0.1.0",
      platform: "win32",
    }, { accountId, authProviders: ["google"] });
    await assignControlPlaneAdminDevicePolicy(kv.store, { deviceId: registered.deviceId, policyId: "pro" });
    const draftRecord = await createControlPlaneAdminProfileDraft(kv.store, { profileId: "pro" });
    if (!draftRecord.draft) throw new Error("expected pro draft");
    await saveControlPlaneAdminProfileDraft(kv.store, {
      profileId: "pro",
      definition: {
        ...draftRecord.draft,
        access: { capabilities: draftRecord.draft.access.capabilities.filter((capability) => capability !== "assistant_actions") },
        userControls: { ...draftRecord.draft.userControls, "voice.pressEnterAfterPaste": "visible-locked" },
        defaults: { ...draftRecord.draft.defaults, "voice.pressEnterAfterPaste": true },
      },
    });

    const beforePublish = await registerDevice(kv.store, {
      installId: "install-profile-access",
      deviceId: registered.deviceId,
      version: "0.1.0",
      platform: "win32",
    }, { accountId, authProviders: ["google"] });
    expect(beforePublish.auth.capabilities).toContain("assistant_actions");
    expect((beforePublish.defaults?.userSettingsDefaults as Record<string, Record<string, unknown>>)?.voice?.pressEnterAfterPaste).toBe(false);

    await publishControlPlaneAdminProfile(kv.store, { profileId: "pro", expectedActiveVersion: 1, expectedDraftVersion: 2, confirmation: "PUBLISH pro v2" });
    const afterPublish = await registerDevice(kv.store, {
      installId: "install-profile-access",
      deviceId: registered.deviceId,
      version: "0.1.0",
      platform: "win32",
    }, { accountId, authProviders: ["google"] });
    expect(afterPublish.auth.capabilities).not.toContain("assistant_actions");
    expect((afterPublish.defaults?.userSettingsDefaults as Record<string, Record<string, unknown>>)?.voice?.pressEnterAfterPaste).toBe(true);
    expect((afterPublish.defaults as unknown as Record<string, unknown>).profileUserControls).toMatchObject({ "voice.pressEnterAfterPaste": "visible-locked" });
  });

  test("publishes immutable versions as one KV snapshot and rolls back by appending history", async () => {
    const kv = createKvStore();
    await createControlPlaneAdminProfileDraft(kv.store, { profileId: "pro" });
    const firstList = await listControlPlaneAdminProfiles(kv.store);
    const firstDraft = firstList.profiles.find((profile) => profile.profileId === "pro")?.draft;
    if (!firstDraft) throw new Error("expected pro draft");
    await saveControlPlaneAdminProfileDraft(kv.store, {
      profileId: "pro",
      definition: {
        ...firstDraft,
        runtime: {
          ...firstDraft.runtime,
          postprocess: { engineId: "postprocess-openrouter-premium", promptId: "postProcessBase" },
        },
      },
    });

    kv.puts.length = 0;
    const published = await publishControlPlaneAdminProfile(kv.store, { profileId: "pro", expectedActiveVersion: 1, expectedDraftVersion: 2, confirmation: "PUBLISH pro v2" });
    expect(kv.puts).toEqual(["control:profiles:v1", "control:admin-audit:v1"]);
    expect((await listControlPlaneAdminAudit(kv.store)).records).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "publish", profileId: "pro", sourceVersion: 1, targetVersion: 2, result: "success" }),
    ]));
    expect(published.published).toMatchObject({ version: 2, status: "published", basedOnVersion: 1 });
    expect(published.history.map((version) => version.version)).toEqual([1, 2]);
    expect(published.history[0].runtime.postprocess.engineId).toBe("postprocess-groq-gpt-oss-120b");

    const rolledBack = await rollbackControlPlaneAdminProfile(kv.store, { profileId: "pro", version: 1, expectedActiveVersion: 2, confirmation: "ROLLBACK pro to v1" });
    expect(rolledBack.published).toMatchObject({ version: 3, status: "published", basedOnVersion: 1 });
    if (!rolledBack.published) throw new Error("expected rolled back publication");
    expect(rolledBack.published.runtime.postprocess.engineId).toBe("postprocess-groq-gpt-oss-120b");
    expect(rolledBack.history.map((version) => version.version)).toEqual([1, 2, 3]);
    expect(rolledBack.history[1].runtime.postprocess.engineId).toBe("postprocess-openrouter-premium");
    expect((await listControlPlaneAdminAudit(kv.store)).records).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "rollback", profileId: "pro", sourceVersion: 2, targetVersion: 1, resultingVersion: 3, requestedVersion: 1, result: "success" }),
    ]));
  });

  test("validates typed references and clones into a new draft profile", async () => {
    const kv = createKvStore();
    const cloned = await createControlPlaneAdminProfileDraft(kv.store, {
      profileId: "pro",
      draftProfileId: "pro-clone",
      label: "Pro clone",
    });
    expect(cloned.draft).toMatchObject({ profileId: "pro-clone", label: "Pro clone", status: "draft", basedOnVersion: 1 });
    expect(cloned.published).toBeNull();
    if (!cloned.draft) throw new Error("expected cloned draft");

    await expect(saveControlPlaneAdminProfileDraft(kv.store, {
      profileId: "pro-clone",
      definition: {
        ...cloned.draft,
        access: { capabilities: [...cloned.draft.access.capabilities, "generic_override"] },
      },
    })).rejects.toThrow("unknown capability");
    await expect(saveControlPlaneAdminProfileDraft(kv.store, {
      profileId: "pro-clone",
      definition: {
        ...cloned.draft,
        runtime: { ...cloned.draft.runtime, postprocess: { engineId: "missing-engine" } },
      },
    })).rejects.toThrow("unknown postprocess engine");
    const { "appearance.themeId": _missingControl, ...missingControl } = cloned.draft.userControls;
    await expect(saveControlPlaneAdminProfileDraft(kv.store, {
      profileId: "pro-clone",
      definition: { ...cloned.draft, userControls: missingControl },
    })).rejects.toThrow("missing user control");

    await publishControlPlaneAdminProfile(kv.store, { profileId: "pro-clone", expectedActiveVersion: null, expectedDraftVersion: 1, confirmation: "PUBLISH pro-clone v1" });
    const registered = await registerDevice(kv.store, { installId: "install-profile-clone" });
    const assigned = await assignControlPlaneAdminDevicePolicy(kv.store, { deviceId: registered.deviceId, policyId: "pro-clone" });
    expect(assigned.device.policyId).toBe("pro-clone");
    const runtime = await resolveExecutionEngineForDevice(kv.store, { deviceId: registered.deviceId, usageKind: "aiAction", engineKind: "postprocess" });
    expect(runtime?.profile.policyId).toBe("pro-clone");
    expect(runtime?.engines.selected?.id).toBe("postprocess-groq-gpt-oss-120b");

    const usageEventKey = `control:usage:${registered.deviceId}:events`;
    const preflight = await evaluateExecutionPreflight(kv.store, {
      mode: "managed",
      installId: "install-profile-clone",
      deviceId: registered.deviceId,
      usageKind: "transcription",
    });
    expect(preflight.allowed).toBe(true);
    expect(preflight.profile?.policyId).toBe("pro-clone");
    expect(preflight.limits?.managedUsage.windows.rolling5h.limit).toBe(1_000_000);
    expect(preflight.limits?.managedUsage.windows.weekly.limit).toBe(10_000_000);
    expect(kv.puts).not.toContain(usageEventKey);

    const listed = await listControlPlaneAdminDevices(kv.store);
    expect(listed.devices[0].limits.managedUsage.windows.rolling5h.limit).toBe(1_000_000);
  });

  test("protects engines and prompts referenced by published versions or drafts", async () => {
    const kv = createKvStore();
    await listControlPlaneAdminProfiles(kv.store);
    await expect(deleteControlPlaneAdminEngine(kv.store, { id: "stt-groq-whisper-turbo" })).rejects.toThrow("referenced by profile");
    await expect(deleteControlPlaneAdminPrompt(kv.store, { id: "postProcessBase" })).rejects.toThrow("referenced by profile");

    const draftRecord = await createControlPlaneAdminProfileDraft(kv.store, { profileId: "pro" });
    if (!draftRecord.draft) throw new Error("expected pro draft");
    await saveControlPlaneAdminProfileDraft(kv.store, {
      profileId: "pro",
      definition: {
        ...draftRecord.draft,
        runtime: { ...draftRecord.draft.runtime, postprocess: { engineId: "postprocess-openrouter-premium", promptId: "postProcessBase" } },
      },
    });
    await expect(deleteControlPlaneAdminEngine(kv.store, { id: "postprocess-openrouter-premium" })).rejects.toThrow("referenced by profile draft");

    const normalized = await saveControlPlaneAdminProfileDraft(kv.store, {
      profileId: "pro",
      definition: {
        ...draftRecord.draft,
        runtime: { ...draftRecord.draft.runtime, postprocess: { engineId: "assistant-groq-8b-instant" } },
      },
    });
    expect(normalized.draft?.runtime.postprocess.promptId).toBe("assistant.quickChat");
    await expect(deleteControlPlaneAdminPrompt(kv.store, { id: "assistant.quickChat" })).rejects.toThrow("referenced by profile draft");
  });
});
