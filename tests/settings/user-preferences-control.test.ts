import { describe, expect, it } from "vitest";
import {
  createAutoStopSilencePolicy,
  createMuteOutputPolicy,
  defaultAutoStopSilenceMs,
  defaultUserPreferences,
  maxAutoStopSilenceMs,
  minAutoStopSilenceMs,
  normalizeAutoStopSilenceMs,
  normalizeUserPreferences,
} from "../../src/settings/user-preferences-control";

describe("user preference contracts", () => {
  it("defaults auto-stop disabled with a safe silence duration", () => {
    expect(defaultUserPreferences).toMatchObject({
      followFocusUntilDelivery: true,
      autoStopOnSilenceEnabled: false,
      autoStopSilenceMs: defaultAutoStopSilenceMs,
      muteOutputDuringRecording: false,
      dictationSoundCuesEnabled: false,
    });
  });

  it("normalizes auto-stop silence duration for host persistence", () => {
    expect(normalizeAutoStopSilenceMs(100)).toBe(minAutoStopSilenceMs);
    expect(normalizeAutoStopSilenceMs(1_500)).toBe(1_500);
    expect(normalizeAutoStopSilenceMs(60_000)).toBe(maxAutoStopSilenceMs);
    expect(normalizeAutoStopSilenceMs(Number.NaN)).toBe(defaultAutoStopSilenceMs);
  });

  it("hydrates older preference files with auto-stop defaults", () => {
    expect(
      normalizeUserPreferences({
        schemaVersion: 1,
        showDockOnStartup: false,
        reviewBeforeDelivery: true,
        pressEnterAfterPaste: true,
      }),
    ).toMatchObject({
      showDockOnStartup: false,
      reviewBeforeDelivery: true,
      pressEnterAfterPaste: true,
      followFocusUntilDelivery: true,
      autoStopOnSilenceEnabled: false,
      autoStopSilenceMs: defaultAutoStopSilenceMs,
      muteOutputDuringRecording: false,
      dictationSoundCuesEnabled: false,
    });
  });

  it("creates the runtime auto-stop silence policy", () => {
    expect(
      createAutoStopSilencePolicy({
        autoStopOnSilenceEnabled: true,
        autoStopSilenceMs: 2_000,
      }),
    ).toEqual({
      enabled: true,
      silenceMs: 2_000,
    });
  });

  it("creates the runtime mute-output policy", () => {
    expect(
      createMuteOutputPolicy({
        muteOutputDuringRecording: true,
      }),
    ).toEqual({ enabled: true });
  });
});
