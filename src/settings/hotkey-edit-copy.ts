export const hotkeyEditReasonCopy: Record<string, string> = {
  alt_space_hook_not_enabled: "No se pudo verificar el atajo. Se restauró el anterior.",
  alt_space_native_hook_windows_only: "Este atajo sólo está disponible en Windows.",
  alt_space_requires_explicit_gate: "El sistema debe habilitar este atajo antes de aplicarlo.",
  desktop_hotkey_registration_unavailable: "El registro de atajos no está disponible.",
  unsupported_persistent_shortcut: "Este atajo no se puede guardar. Usá Ctrl, Alt o Shift con una tecla.",
  empty_shortcut: "Elegí un atajo primero.",
  shortcut_not_applicable: "El atajo no se pudo aplicar; el actual no cambió.",
  shortcut_not_registered_after_swap: "No se pudo verificar el nuevo atajo. Se restauró el anterior.",
  tauri_runtime_unavailable: "Abrí Ajustes en la aplicación para editar atajos.",
  unsupported_shortcut: "Este atajo todavía no está disponible.",
};

export function formatHotkeyEditReason(reason: unknown): string {
  const code = typeof reason === "string"
    ? reason
    : reason && typeof reason === "object" && typeof (reason as Record<string, unknown>).code === "string"
      ? (reason as Record<string, string>).code
      : undefined;
  return (code && hotkeyEditReasonCopy[code]) ?? "No se pudo completar la operación.";
}
