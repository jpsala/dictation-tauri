import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  defaultUserPreferences,
  getUserPreferences,
  setUserPreferences,
  userPreferencesChangedEvent,
  type UserPreferences,
} from "../user-preferences-control";
import type { SettingsPersistenceState } from "../section-contracts";


export type UserPreferencesController = {
  preferences: UserPreferences;
  state: SettingsPersistenceState;
  available: boolean;
  refresh: () => Promise<void>;
  update: (patch: Partial<UserPreferences>) => Promise<boolean>;
};

export type UserPreferencesControllerAdapter = {
  load: () => Promise<UserPreferences>;
  save: (preferences: UserPreferences) => Promise<UserPreferences>;
  subscribe: (listener: (preferences: UserPreferences) => void) => Promise<() => void>;
};

export const tauriUserPreferencesAdapter: UserPreferencesControllerAdapter = {
  load: getUserPreferences,
  save: setUserPreferences,
  subscribe: async (listener) => listen<UserPreferences>(userPreferencesChangedEvent, (event) => listener(event.payload)),
};

export type UserPreferencesUpdateTransition = {
  preferences: UserPreferences;
  state: SettingsPersistenceState;
  available?: boolean;
};

export async function runUserPreferencesUpdate(
  adapter: UserPreferencesControllerAdapter,
  previous: UserPreferences,
  patch: Partial<UserPreferences>,
  onTransition: (transition: UserPreferencesUpdateTransition) => void,
): Promise<boolean> {
  const optimistic = { ...previous, ...patch };
  const target = Object.keys(patch).join(", ") || "preferencias";
  onTransition({
    preferences: optimistic,
    state: { status: "saving", target, scope: "device" },
  });
  try {
    const saved = await adapter.save(optimistic);
    onTransition({
      preferences: saved,
      state: { status: "saved", target, scope: "device" },
      available: true,
    });
    return true;
  } catch {
    onTransition({
      preferences: previous,
      state: { status: "error", message: "No pudimos guardar el cambio.", rolledBack: true },
    });
    return false;
  }
}

export function useUserPreferencesController(
  enabled = isTauri(),
  adapter: UserPreferencesControllerAdapter = tauriUserPreferencesAdapter,
): UserPreferencesController {
  const [preferences, setPreferences] = useState(defaultUserPreferences);
  const [state, setState] = useState<SettingsPersistenceState>(
    enabled ? { status: "loading", target: "preferencias" } : { status: "idle" },
  );
  const [available, setAvailable] = useState(false);
  const preferencesRef = useRef(preferences);
  const mutationRef = useRef(0);

  const applySnapshot = useCallback((snapshot: UserPreferences) => {
    preferencesRef.current = snapshot;
    setPreferences(snapshot);
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const mutation = mutationRef.current;
    setState({ status: "loading", target: "preferencias" });
    try {
      const loaded = await adapter.load();
      if (mutation !== mutationRef.current) return;
      applySnapshot(loaded);
      setAvailable(true);
      setState({ status: "idle" });
    } catch {
      if (mutation !== mutationRef.current) return;
      setState({ status: "error", message: "No pudimos leer tus preferencias.", rolledBack: false });
    }
  }, [adapter, applySnapshot, enabled]);

  const update = useCallback(async (patch: Partial<UserPreferences>) => {
    if (!enabled) return false;
    const mutation = ++mutationRef.current;
    return runUserPreferencesUpdate(adapter, preferencesRef.current, patch, (transition) => {
      if (mutation !== mutationRef.current) return;
      applySnapshot(transition.preferences);
      if (transition.available) setAvailable(true);
      setState(transition.state);
    });
  }, [adapter, applySnapshot, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void refresh();
    void adapter.subscribe((snapshot) => {
      if (!disposed) {
        mutationRef.current += 1;
        applySnapshot(snapshot);
        setAvailable(true);
        setState({ status: "idle" });
      }
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unsubscribe = cleanup;
    });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [adapter, applySnapshot, enabled, refresh]);

  return { preferences, state, available, refresh, update };
}
