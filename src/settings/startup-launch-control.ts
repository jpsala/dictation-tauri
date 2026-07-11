import { invoke, isTauri } from "@tauri-apps/api/core";

export type StartupLaunchConfig = {
  supported: boolean;
  enabled: boolean;
  launchPath: string;
  registeredCommand?: string;
  valueName: string;
  reason: "registered_current_exe" | "registered_other_command" | "not_registered" | "unsupported_platform" | string;
};

export async function getStartupLaunchConfig(): Promise<StartupLaunchConfig | undefined> {
  if (!isTauri()) {
    return undefined;
  }

  return invoke<StartupLaunchConfig>("get_startup_launch_config");
}

export async function setStartupLaunchEnabled(enabled: boolean): Promise<StartupLaunchConfig | undefined> {
  if (!isTauri()) {
    return undefined;
  }

  return invoke<StartupLaunchConfig>("set_startup_launch_enabled", { enabled });
}

export function summarizeStartupLaunchConfig(config: StartupLaunchConfig | undefined): string {
  if (!config) {
    return "Open Settings inside Fixvox to manage Windows startup.";
  }
  if (!config.supported) {
    return "Windows startup launch is only available in the Windows desktop app.";
  }
  if (config.enabled) {
    return "Fixvox will open automatically when Windows starts.";
  }
  if (config.reason === "registered_other_command") {
    return "A different Fixvox startup target exists; turn this on to repair it for this install.";
  }
  return "Keep Fixvox available after reboot by opening it when Windows starts.";
}
