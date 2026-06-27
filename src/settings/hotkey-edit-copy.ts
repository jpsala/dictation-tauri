export const hotkeyEditReasonCopy: Record<string, string> = {
  alt_space_hook_not_enabled:
    "The host could not verify the Alt+Space hook. The previous shortcut was restored.",
  alt_space_native_hook_windows_only:
    "Alt+Space needs the Windows native hook. Use this binding on Windows only.",
  alt_space_requires_explicit_gate:
    "Alt+Space needs the native host gate before it can be applied.",
  desktop_hotkey_registration_unavailable:
    "Native shortcut registration is unavailable in this runtime.",
  unsupported_persistent_shortcut:
    "This shortcut cannot be saved. Use Ctrl, Alt, or Shift plus a normal key.",
  empty_shortcut: "Choose a shortcut first.",
  shortcut_not_applicable:
    "The host rejected this binding without changing the current shortcut.",
  shortcut_not_registered_after_swap:
    "The host could not verify the new binding. The previous shortcut was restored.",
  tauri_runtime_unavailable:
    "Open Settings in the Tauri app to edit shortcuts.",
  unsupported_shortcut:
    "This shortcut is not available here yet. Use Ctrl, Alt, or Shift plus a normal key.",
};

export function formatHotkeyEditReason(reason: unknown): string {
  if (!reason) {
    return "Unknown host response.";
  }

  if (reason instanceof Error) {
    return reason.message;
  }

  const reasonText = String(reason);
  return hotkeyEditReasonCopy[reasonText] ?? reasonText.replaceAll("_", " ");
}
