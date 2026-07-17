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
    return "Abrí Ajustes en Dictation para administrar el inicio de Windows.";
  }
  if (!config.supported) {
    return "El inicio automático está disponible sólo en la aplicación de Windows.";
  }
  if (config.enabled) {
    return "Dictation se abrirá automáticamente cuando inicie Windows.";
  }
  if (config.reason === "registered_other_command") {
    return "Hay una configuración de inicio anterior. Activá esta opción para usarla con esta instalación.";
  }
  return "Abrí Dictation al iniciar Windows para tenerlo disponible después de reiniciar.";
}
