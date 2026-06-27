export type HotkeyEditPlanStepId =
  | "capture"
  | "conflict_check"
  | "swap"
  | "rollback"
  | "verify";

export type HotkeyEditPlanStep = {
  id: HotkeyEditPlanStepId;
  label: string;
  guardrail: string;
};

export type HotkeyEditCandidate = {
  id: "alt-space" | "alt-3" | "ctrl-shift-f9";
  shortcut: "Alt+Space" | "Alt+3" | "Ctrl+Shift+F9";
  label: string;
  description: string;
  badge: string;
};

export type HotkeyEditContract = {
  status: "host_owned_editing";
  statusLabel: string;
  heading: string;
  summary: string;
  candidates: readonly HotkeyEditCandidate[];
  steps: readonly HotkeyEditPlanStep[];
  rendererBoundary: {
    editableControlsAllowed: true;
    keyboardCaptureAllowed: false;
    registrationAllowed: false;
    persistenceAllowed: false;
  };
};

export const nativeHotkeyEditCandidates = [
  {
    id: "alt-space",
    shortcut: "Alt+Space",
    label: "Alt+Space",
    description: "Fixvox-like dictation key through the Windows native hook.",
    badge: "Default",
  },
  {
    id: "alt-3",
    shortcut: "Alt+3",
    label: "Alt+3",
    description: "Compact alternate dictation key using Tauri global-shortcut.",
    badge: "Alternate",
  },
  {
    id: "ctrl-shift-f9",
    shortcut: "Ctrl+Shift+F9",
    label: "Ctrl+Shift+F9",
    description: "Safe Tauri global-shortcut fallback for debugging and recovery.",
    badge: "Fallback",
  },
] as const satisfies readonly HotkeyEditCandidate[];

export const nativeHotkeyEditContract: HotkeyEditContract = {
  status: "host_owned_editing",
  statusLabel: "Persistent",
  heading: "Dictation key editor",
  summary:
    "Host-owned changes apply now, verify in place, and save to local preference storage.",
  candidates: nativeHotkeyEditCandidates,
  steps: [
    {
      id: "capture",
      label: "Capture",
      guardrail: "Capture and normalize the candidate shortcut in the native host, not through a renderer hotkey plugin.",
    },
    {
      id: "conflict_check",
      label: "Check conflict",
      guardrail: "Reject OS-reserved or already-owned shortcuts before unregistering the active binding.",
    },
    {
      id: "swap",
      label: "Swap",
      guardrail: "Unregister and register through one host-owned operation.",
    },
    {
      id: "rollback",
      label: "Rollback",
      guardrail: "Restore the previous working binding if registration or verification fails.",
    },
    {
      id: "verify",
      label: "Verify",
      guardrail: "Confirm the effective shortcut from the host before persistence or UI success copy.",
    },
  ],
  rendererBoundary: {
    editableControlsAllowed: true,
    keyboardCaptureAllowed: false,
    registrationAllowed: false,
    persistenceAllowed: false,
  },
} as const;

export function hotkeyEditPlanLabels(
  contract: HotkeyEditContract = nativeHotkeyEditContract,
): string[] {
  return contract.steps.map((step) => step.label);
}
