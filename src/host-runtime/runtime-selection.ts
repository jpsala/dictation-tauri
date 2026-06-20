import { createUnavailableHostRuntimeClient } from "./client";
import {
  createTauriHostRuntimeClient,
  type TauriInvokeImpl,
} from "./tauri-client";
import type { HostRuntimeClient } from "./types";

export type HostClientRuntime = {
  client: HostRuntimeClient;
  label: string;
};

export type HostRuntimeSelectionOptions = {
  isTauriRuntime: boolean;
  invokeImpl?: TauriInvokeImpl;
  browserClient?: HostRuntimeClient;
};

export function createHostRuntimeClientRuntime(
  options: HostRuntimeSelectionOptions,
): HostClientRuntime {
  if (options.isTauriRuntime) {
    if (!options.invokeImpl) {
      throw new Error("Tauri host runtime selection requires an invoke implementation.");
    }

    return {
      client: createTauriHostRuntimeClient(options.invokeImpl),
      label: "Tauri host transcription",
    };
  }

  return {
    client: options.browserClient ?? createUnavailableHostRuntimeClient(),
    label: "Browser unavailable host",
  };
}
