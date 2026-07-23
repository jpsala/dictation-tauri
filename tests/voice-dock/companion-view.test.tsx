// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CompanionSurfaceView, getRuntimeRecoveryAction, resolvePresetPickerAction } from "../../src/App";
import {
  createDockCompanionSnapshot,
  type DockCompanionCommandPayload,
} from "../../src/voice-dock";
import { createVoiceDockState } from "../../src/voice-dock/visual-semantics";
import type { DesktopDictationSession } from "../../src/desktop-control/types";
import type { SimulatedRunSummary } from "../../src/pipeline/types";

function session(input: Partial<DesktopDictationSession>): DesktopDictationSession {
  return {
    sessionId: "companion-view-session-001",
    controlSource: "app_button",
    state: "idle",
    ...input,
  } as DesktopDictationSession;
}

describe("dock companion view", () => {
  it("turns account setup failures into Spanish configuration recovery", () => {
    const action = getRuntimeRecoveryAction({
      runId: "setup-failure",
      terminalState: "error",
      capture: { artifact: undefined },
      error: {
        phase: "transcribing",
        message: "Managed Fixvox transcription requires a registered device id.",
      },
    } as SimulatedRunSummary);

    expect(action).toMatchObject({
      kind: "inspect_setup",
      label: "Completar configuración",
      reason: "Conectá tu cuenta antes de volver a dictar.",
    });
    expect(JSON.stringify(action)).not.toMatch(/device id|managed|provider|record again/i);
  });

  it("renders recovery actions without exposing transcript text", () => {
    const snapshot = createDockCompanionSnapshot({
      voiceDockState: createVoiceDockState(
        session({
          state: "reviewing",
          delivery: {
            status: "available",
            strategy: "review_only",
            output: "sensitive transcript stays out of companion",
            message: "Transcript is available.",
          },
        }),
        { canPasteLastSafe: true },
      ),
      resultHistoryOpen: false,
      resultHistoryEntries: [],
      settingsPanelOpen: false,
    });

    const html = renderToStaticMarkup(<CompanionSurfaceView snapshot={snapshot} />);

    expect(html).toContain("Review only");
    expect(html).toContain("Copy transcript");
    expect(html).toContain("Paste last (safe)");
    expect(html).toContain("Close companion");
    expect(html).toContain("×");
    expect(html).not.toContain("Dismiss");
    expect(html).not.toContain("sensitive transcript stays out of companion");
    expect(html.toLowerCase()).not.toContain("paste observed");
  });

  it("renders a compact Alt+Q picker for persistent dictation presets", () => {
    const onCommand = vi.fn<(payload: DockCompanionCommandPayload) => void>();
    const snapshot = createDockCompanionSnapshot({
      voiceDockState: createVoiceDockState({ state: "idle" }),
      resultHistoryOpen: false,
      resultHistoryEntries: [],
      settingsPanelOpen: true,
      presetPickerMode: "dictation",
      activePreset: { presetId: "corregir-texto", presetName: "Corregir texto", appKey: "global" },
    });

    const html = renderToStaticMarkup(
      <CompanionSurfaceView snapshot={snapshot} onCommand={onCommand} />,
    );

    expect(html).toContain("Presets");
    expect(html).toContain("Set a persistent preset for future dictation.");
    expect(html).toContain("Search presets…");
    expect(html).toContain("Como yo (español)");
    expect(html).toContain("Corregir texto");
    expect(html).toContain("Fix Writing");
    expect(html).toContain("Like me (English)");
    expect(html).toContain("Active");
    expect(html).toContain("navigate");
    expect(html).toContain("select");
    expect(html).toContain("close");
    expect(html).not.toContain("Preset multi-chord shortcuts");
    expect(html).not.toContain("quick run");
    expect(html).not.toContain("Quick Chat");
    expect(html).not.toContain("Separate surface");
  });

  it("explains that presets apply immediately when text is selected", () => {
    const snapshot = createDockCompanionSnapshot({
      voiceDockState: createVoiceDockState({ state: "idle" }),
      resultHistoryOpen: false,
      resultHistoryEntries: [],
      settingsPanelOpen: true,
      presetPickerMode: "selection",
    });

    const html = renderToStaticMarkup(<CompanionSurfaceView snapshot={snapshot} />);

    expect(html).toContain("Apply a preset to the selected text.");
  });

  it("routes picker choices by selected, definitely empty, or uncertain capture", () => {
    expect(resolvePresetPickerAction("selected paragraph", "ok")).toBe("transform_selection");
    expect(resolvePresetPickerAction("   ", "no_selection")).toBe("activate_dictation_preset");
    expect(resolvePresetPickerAction(undefined, "failed")).toBe("selection_capture_failed");
    expect(resolvePresetPickerAction(undefined, "unsupported_target")).toBe("selection_capture_failed");
    expect(resolvePresetPickerAction(undefined)).toBe("activate_dictation_preset");
  });

  it("activates and restores a persistent dictation preset without starting capture", () => {
    const source = readFileSync("src/App.tsx", "utf8");
    const dockSurface = source.slice(
      source.indexOf("export function DockSurface"),
      source.indexOf("export function App"),
    );
    const transcribeFlow = dockSurface.slice(
      dockSurface.indexOf("async transcribe"),
      dockSurface.indexOf("const base = await runtimeForRoute.transcribe"),
    );
    const storedPresetFlow = source.slice(
      source.indexOf("function readStoredActivePreset"),
      source.indexOf("function storeDockCompanionSnapshot"),
    );
    const pickerFlow = source.slice(
      source.indexOf("async function runPickerPreset"),
      source.indexOf("function handleHostCommandPayload"),
    );

    expect(source).toContain("function readStoredActivePreset");
    expect(source).toContain("isSelectionTransformPresetAvailable(presetId)");
    expect(storedPresetFlow).not.toContain("normalizeDockPresetId");
    expect(storedPresetFlow).toContain("storedPreset?.presetId?.trim()");
    expect(source).toContain("function storeActivePreset");
    expect(source).toContain("storeActivePreset(nextPreset)");
    expect(source).toContain("useRef<DockActivePreset | undefined>(readStoredActivePreset())");
    expect(transcribeFlow).toContain("await loadSelectionPresetStore()");
    expect(transcribeFlow).toContain("const storedPresetId = activePresetRef.current?.presetId");
    expect(transcribeFlow).toContain("const activePresetId = normalizeDockPresetId(storedPresetId)");
    expect(transcribeFlow).toContain("else if (storedPresetId)");
    expect(transcribeFlow).toContain("clearActivePreset()");
    expect(transcribeFlow.indexOf("clearActivePreset()")).toBeLessThan(
      transcribeFlow.indexOf("resolveDictationPostProcessPolicy"),
    );
    expect(pickerFlow).toContain("await loadSelectionPresetStore()");
    expect(pickerFlow).toContain('action === "selection_capture_failed"');
    expect(pickerFlow).toContain('action === "activate_dictation_preset"');
    expect(pickerFlow).toContain("selectActivePreset(presetId)");
    expect(pickerFlow).toContain("clearActivePreset()");
    expect(pickerFlow).toContain("No preset was activated.");
    expect(source).toContain("hostSelectionCaptureForTargetWithClipboardCommand");
    expect(pickerFlow.lastIndexOf("clearActivePreset()")).toBeGreaterThan(
      pickerFlow.indexOf('action === "activate_dictation_preset"'),
    );
    expect(pickerFlow).toContain('targetAffinity: "saved"');
    expect(pickerFlow).not.toContain("startCapture(");
  });

  it("renders assistant quick chat with a local follow-up input", () => {
    const snapshot = createDockCompanionSnapshot({
      voiceDockState: createVoiceDockState({ state: "idle" }),
      resultHistoryOpen: false,
      resultHistoryEntries: [
        {
          id: "assistant-history-1",
          source: "assistant",
          text: "No hay preset activo ahora.",
          textLength: 27,
          deliveryEvidence: { status: "available" },
        },
      ],
      settingsPanelOpen: false,
      assistant: {
        open: true,
        runId: "assistant-run-2",
        message: "Preset activo: Corregir texto.",
        surface: { kind: "quickChat", title: "Quick Chat" },
      },
    });

    const html = renderToStaticMarkup(<CompanionSurfaceView snapshot={snapshot} />);

    expect(html).toContain("Quick Chat");
    expect(html).toContain("assistant-quick-chat-card");
    expect(html).toContain("Preset activo: Corregir texto.");
    expect(html).toContain("Quick Chat message");
    expect(html).toContain("Ask Lulu…");
    expect(html).toContain("Send");
    expect(html).toContain("Assistant quick chat history");
  });

  it("renders showMarkdown as a Lulu surface, not Quick Chat", () => {
    const snapshot = createDockCompanionSnapshot({
      voiceDockState: createVoiceDockState({ state: "idle" }),
      resultHistoryOpen: false,
      resultHistoryEntries: [],
      settingsPanelOpen: false,
      assistant: {
        open: true,
        runId: "assistant-run-markdown",
        message: "Memoria/contexto renderizado como markdown.",
        surface: {
          kind: "showMarkdown",
          title: "Contexto de Lulu",
          markdown: "Memoria/contexto renderizado como markdown.",
        },
      },
    });

    const html = renderToStaticMarkup(<CompanionSurfaceView snapshot={snapshot} />);

    expect(html).toContain("Lulu");
    expect(html).toContain("Contexto de Lulu");
    expect(html.toLowerCase()).toContain("memoria/contexto");
    expect(html).not.toContain("Quick Chat message");
    expect(html).not.toContain("Ask Lulu…");
    expect(html).not.toContain("Send");
    expect(html).not.toContain("Assistant reply is available");
  });

  it("renders optionPicker as a Lulu choice surface, not Quick Chat", () => {
    const snapshot = createDockCompanionSnapshot({
      voiceDockState: createVoiceDockState({ state: "idle" }),
      resultHistoryOpen: false,
      resultHistoryEntries: [],
      settingsPanelOpen: false,
      assistant: {
        open: true,
        runId: "assistant-run-picker",
        message: "Encontré más de un preset para JP.",
        surface: {
          kind: "optionPicker",
          title: "Elegir preset",
          prompt: "Encontré más de un preset para JP.",
          options: [
            { id: "como-yo-es", label: "JP español" },
            { id: "like-me-en", label: "JP English" },
          ],
        },
      },
    });

    const html = renderToStaticMarkup(<CompanionSurfaceView snapshot={snapshot} />);

    expect(html).toContain("Lulu");
    expect(html).toContain("Elegir preset");
    expect(html).toContain("JP español");
    expect(html).toContain("JP English");
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("Quick Chat message");
    expect(html).not.toContain("Ask Lulu…");
    expect(html).not.toContain("Assistant reply is available");
  });

  it("keeps preset picker quick-run keys wired without raw text side effects", () => {
    const source = readFileSync("src/App.tsx", "utf8");

    expect(source).toContain("getTauriActionHotkeyConfig");
    expect(source).toContain("presetPickerHotkeyLabel");
    expect(source).toContain("const pickerKey = presetPickerShortcut(preset.id)");
    expect(source).toContain("presetChordKeyCandidates");
    expect(source).toContain("candidate.chordKeys.some");
    expect(source).toContain("preset.presetId");
    expect(source).toContain("...preset.chordKeys");
    expect(source).toContain("executePickerPreset(preset.presetId)");
    expect(source).toContain("resolvePresetPickerChord");
    expect(source).toContain("run_preset_picker_chord");
    expect(source).not.toContain("dock-preset-picker-which-key");
  });

  it("renders history metadata as selectable buttons with an X close action", () => {
    const snapshot = createDockCompanionSnapshot({
      voiceDockState: createVoiceDockState({ state: "idle" }),
      resultHistoryOpen: true,
      resultHistoryEntries: [
        {
          id: "history-1",
          source: "selection_transform",
          text: "rewrite this selected paragraph into a clearer version with more detail on hover",
          textLength: 64,
          deliveryEvidence: { status: "available" },
        },
      ],
      settingsPanelOpen: false,
    });

    const html = renderToStaticMarkup(<CompanionSurfaceView snapshot={snapshot} />);

    expect(html).toContain("rewrite this selected paragraph");
    expect(html).toContain("selection transform · 64 chars · available");
    expect(html).toContain("select_history_entry");
    expect(html).toContain("Clear history");
    expect(html).toContain("clear_result_history");
    expect(html).toContain("Close companion");
    expect(html).toContain("×");
    expect(html).not.toContain("Dismiss");
  });
});
