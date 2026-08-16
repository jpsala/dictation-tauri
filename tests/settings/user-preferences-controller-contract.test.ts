import { describe, expect, it, vi } from "vitest";

const eventApi = vi.hoisted(() => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => eventApi);

import {
  defaultUserPreferences,
  userPreferencesChangedEvent,
  type UserPreferences,
} from "../../src/settings/user-preferences-control";
import {
  runUserPreferencesUpdate,
  tauriUserPreferencesAdapter,
  type UserPreferencesControllerAdapter,
  type UserPreferencesUpdateTransition,
} from "../../src/settings/controllers/use-user-preferences-controller";

const snapshot: UserPreferences = {
  ...defaultUserPreferences,
  dictationMode: "fast",
  showDockOnStartup: false,
};

describe("user preferences controller seams", () => {
  it("subscribes to the host event and forwards snapshots with an unsubscriber", async () => {
    const cleanup = vi.fn();
    let callback: ((event: { payload: UserPreferences }) => void) | undefined;
    eventApi.listen.mockImplementationOnce(async (eventName, eventHandler) => {
      expect(eventName).toBe(userPreferencesChangedEvent);
      callback = eventHandler as (event: { payload: UserPreferences }) => void;
      return cleanup;
    });
    const listener = vi.fn();

    const unsubscribe = await tauriUserPreferencesAdapter.subscribe(listener);
    callback?.({ payload: snapshot });

    expect(listener).toHaveBeenCalledWith(snapshot);
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("keeps the event name and host adapter boundary explicit", () => {
    expect(userPreferencesChangedEvent).toBe("settings://user-preferences-changed");
    expect(typeof tauriUserPreferencesAdapter.load).toBe("function");
    expect(typeof tauriUserPreferencesAdapter.save).toBe("function");
    expect(typeof tauriUserPreferencesAdapter.subscribe).toBe("function");
  });

  it("rolls back the optimistic snapshot when host persistence fails", async () => {
    const transitions: UserPreferencesUpdateTransition[] = [];
    const adapter: UserPreferencesControllerAdapter = {
      load: async () => snapshot,
      save: async () => {
        throw new Error("host persistence unavailable");
      },
      subscribe: async () => () => undefined,
    };

    const saved = await runUserPreferencesUpdate(
      adapter,
      snapshot,
      { showDockOnStartup: true },
      (transition) => transitions.push(transition),
    );

    expect(saved).toBe(false);
    expect(transitions).toEqual([
      {
        preferences: { ...snapshot, showDockOnStartup: true },
        state: { status: "saving", target: "showDockOnStartup", scope: "device" },
      },
      {
        preferences: snapshot,
        state: { status: "error", message: "No pudimos guardar el cambio.", rolledBack: true },
      },
    ]);
  });
});
