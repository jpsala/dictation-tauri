// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CompanionSurfaceView,
  getRuntimeRecoveryAction,
  isNoSpeechOutcome,
  resolvePresetPickerAction,
} from "../../src/App";
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
  it("routes companion close and choice Escape through vocabulary cancellation", () => {
    const appSource = readFileSync("src/App.tsx", "utf8");
    const choiceSource = readFileSync("src/voice-dock/VocabularyChoiceSurface.tsx", "utf8");

    expect(appSource).toContain('desktopSessionState.state === "waiting_for_choice"');
    expect(appSource).toContain("void cancelVocabularyChoice()");
    expect(appSource).toContain("cancelVocabularyResolution");
    expect(appSource).toContain("desktopSession.subscribeVocabularySettlement");
    expect(appSource).toContain("appliedDesktopSessionRef.current === session");
    expect(appSource).toContain("persistedHistoryEntryIdRef.current === entry.id");
    expect(choiceSource).toContain('event.key === "Escape"');
    expect(choiceSource).toContain("onCancel()");
  });

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
      label: "Revisar cuenta",
      reason:
        "Abrí Cuenta en Ajustes para revisar el acceso. El audio no se volverá a enviar automáticamente.",
    });
    expect(JSON.stringify(action)).not.toMatch(/device id|managed|provider|record again/i);
  });

  it("renders managed access denial as compact account guidance without a false retry", () => {
    const action = getRuntimeRecoveryAction({
      runId: "access-denied",
      terminalState: "error",
      capture: { artifact: undefined },
      error: {
        phase: "transcribing",
        message: "Fixvox managed transcription returned HTTP 403 Forbidden.",
      },
    } as SimulatedRunSummary);
    const snapshot = createDockCompanionSnapshot({
      voiceDockState: createVoiceDockState(
        session({
          state: "error",
          error: {
            code: "pipeline-error",
            message: "Completá la configuración de tu cuenta antes de dictar.",
          },
          recoveryAction: {
            kind: "inspect_setup",
            label: "Revisar cuenta",
            reason:
              "Abrí Cuenta en Ajustes para revisar el acceso. El audio no se volverá a enviar automáticamente.",
            clipAvailable: false,
          },
        }),
      ),
      resultHistoryOpen: false,
      resultHistoryEntries: [],
      settingsPanelOpen: false,
    });

    const html = renderToStaticMarkup(<CompanionSurfaceView snapshot={snapshot} />);

    expect(action).toMatchObject({ kind: "inspect_setup", label: "Revisar cuenta" });
    expect(html).toContain("dock-companion-card--recovery");
    expect(html).not.toContain("dock-companion-actions");
    expect(readFileSync("src/styles.css", "utf8")).toMatch(
      /\.dock-companion-card--recovery\s*\{\s*min-height:\s*0;/,
    );
    expect(html).toContain("Requiere atención");
    expect(html).toContain("Revisá tu cuenta");
    expect(html).toContain("Abrí Cuenta en Ajustes para revisar el acceso.");
    expect(html).not.toContain("Record again");
    expect(html).not.toContain("403");
    expect(html).not.toContain("managed");
  });

  it("renders no-speech as a compact Spanish notice with retry, close, Escape, and timeout", () => {
    const snapshot = createDockCompanionSnapshot({
      voiceDockState: { ...createVoiceDockState({ state: "idle" }), statusText: "Listo" },
      resultHistoryOpen: false,
      resultHistoryEntries: [],
      settingsPanelOpen: false,
      noSpeechNoticeOpen: true,
    });

    const html = renderToStaticMarkup(<CompanionSurfaceView snapshot={snapshot} />);
    const source = readFileSync("src/App.tsx", "utf8");

    expect(html).toContain('data-testid="no-speech-notice"');
    expect(html).toContain("No te escuché");
    expect(html).toContain("Grabar de nuevo");
    expect(html).toContain("Cerrar aviso");
    expect(html).toContain("Esc para cerrar");
    expect(html).not.toContain("Recovery");
    expect(html).not.toContain("Needs attention");
    expect(source).toContain("noticeRemainingMsRef.current - (Date.now() - noticeStartedAtRef.current)");
    expect(source).toContain('event.key === "Escape"');
    expect(isNoSpeechOutcome(undefined, "No speech detected in recording.")).toBe(true);
    expect(isNoSpeechOutcome(undefined, "Speech provider marked recording as no speech.")).toBe(true);
    expect(isNoSpeechOutcome(undefined, "Provider unavailable")).toBe(false);
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

  it("renders history as a stable table with explicit paste actions and an X close action", () => {
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
    const source = readFileSync("src/App.tsx", "utf8");
    const styles = readFileSync("src/styles.css", "utf8");

    expect(html).toContain("<table");
    expect(html).toContain("Result</th>");
    expect(html).toContain("Type</th>");
    expect(html).toContain("Status</th>");
    expect(html).toContain("rewrite this selected paragraph");
    expect(html).toContain("Transform");
    expect(html).toContain("Ready");
    expect(html).toContain("select_history_entry");
    expect(html).toContain("Paste</button>");
    expect(html).toContain("Clear history");
    expect(html).toContain("clear_result_history");
    expect(html).toContain("Close companion");
    expect(html).toContain("×");
    expect(html).toContain("dock-companion-card--history");
    expect(html).not.toContain("dock-companion-history-hover");
    expect(html).not.toContain("Dismiss");

    expect(styles).toMatch(/\.companion-shell \{[^}]*overflow: hidden;/);
    expect(styles).toMatch(/\.dock-companion-card--history \{[^}]*overflow: hidden;/);
    expect(styles).toMatch(/\.dock-companion-history-table-wrap \{[^}]*overflow-y: auto;/);
    expect(source).toContain("export const historyPreviewDelayMs = 800");
    expect(source).toContain("scheduleHistoryPreview(entry, event.currentTarget)");
    expect(source).toContain('data-testid="history-preview"');
  });

  it("routes the local smoke command through the production Teach correction handler", () => {
    const source = readFileSync("src/App.tsx", "utf8");
    const syncApply = source.slice(
      source.indexOf("function applyHostPresetMenuSyncResult"),
      source.indexOf("async function syncActivePresetMenu"),
    );

    expect(source).toContain('command === "teach_correction"');
    expect(source).toContain('source: "dock_companion"');
    expect(source).toContain('command: "teach_correction"');
    expect(source).toContain("handleCompanionCommandPayload");
    expect(syncApply).toContain("activePresetRef.current = undefined;");
    expect(syncApply).toContain("setActivePreset(undefined)");
    expect(syncApply).not.toContain("selectionContextRef.current = undefined;");
  });

  it("keeps the physical Teach correction smoke on the real picker event bridge", () => {
    const source = readFileSync("src/App.tsx", "utf8");
    const selectionSmoke = readFileSync("scripts/selection-capture-smoke.ps1", "utf8");
    const hotkeySmoke = readFileSync("scripts/action-hotkeys-physical-smoke.ps1", "utf8");
    const bridgeSource = readFileSync("src/voice-dock/companion-command-bridge.ts", "utf8");
    const generatedCapabilities = JSON.parse(
      readFileSync("src-tauri/gen/schemas/capabilities.json", "utf8"),
    ) as Record<string, { identifier?: string; windows?: string[]; permissions?: string[] }>;

    expect(selectionSmoke).toContain("picker_click_to_product_form");
    expect(selectionSmoke).toContain("__dictationCompanionCommandTransport");
    expect(source).toContain("__dictationCompanionCommandTransport");
    expect(source).toContain('dispatchToCurrentHandler("tauri_event"');
    expect(source).toContain("createCompanionCommandBridge");
    expect(source).toContain("createCompanionCommandDedupe");
    expect(source).toContain("seenCompanionCommandIds.claim");
    expect(source).toContain("seenCompanionCommandIds.release");
    expect(source).toContain("dockCompanionCommandAckEvent");
    expect(source).toContain("companionCommandHandlerRef.current = handleCompanionCommandPayload");
    expect(source).toContain("acknowledgeCommand");
    expect(source).toContain("emitToMain: (payload");
    expect(source).toContain("writeStorageFallback: (payload");
    expect(bridgeSource).toContain("COMPANION_COMMAND_ACK_TIMEOUT_MS");
    expect(bridgeSource).toContain("await options.emitToMain(envelope)");
    expect(bridgeSource).toContain("await options.emitGlobal(envelope)");
    expect(bridgeSource).toContain("options.writeStorageFallback(payload)");
    expect(readFileSync("src/voice-dock/companion-command-dedupe.ts", "utf8")).toContain(
      "DEFAULT_COMPANION_COMMAND_DEDUPE_MAX_ENTRIES",
    );
    expect(selectionSmoke).not.toContain("direct_product_teach_event");
    expect(selectionSmoke).not.toContain("plugin:event|emit");
    expect(selectionSmoke).not.toContain("command: 'teach_correction'");
    expect(selectionSmoke).toContain("liveRootRemoved");
    expect(selectionSmoke).toContain("Test-ProcessDescendsFrom -ProcessId");
    expect(selectionSmoke).toContain("Get-ProcessTreeIds");
    expect(selectionSmoke).toContain("tauriProcessTreeTerminated");
    expect(selectionSmoke).toContain("targetProcessTreeIds");
    expect(selectionSmoke).toContain("ownedTargetProcessIdsBeforeCleanup");
    expect(selectionSmoke).toContain("remainingTargetProcessIds");
    expect(selectionSmoke).toContain("targetProcessTreeTerminated");
    expect(selectionSmoke).toContain("target_process_tree");
    expect(selectionSmoke).toContain("Assert-CdpPortAvailable");
    expect(selectionSmoke).toContain("TcpListener");
    expect(selectionSmoke).toContain("WEBVIEW2_USER_DATA_FOLDER");
    expect(selectionSmoke).toContain("webViewUserDataFolder");
    expect(selectionSmoke).toContain("preflightPortAvailable");
    expect(selectionSmoke).toContain("direct_replace_guard_after_product_picker_flow");
    expect(selectionSmoke).toContain("assertionStatus");
    expect(selectionSmoke).toContain("environmentRestoreErrors");
    expect(selectionSmoke).toContain("environmentRestored");
    expect(selectionSmoke).toContain("cleanupFailed");
    expect(selectionSmoke).not.toContain("$report.teachCorrectionPicker $true");
    expect(selectionSmoke).toContain("$failedChecks");
    expect(hotkeySmoke).toContain("get_preset_picker_window_state");
    expect(hotkeySmoke).toContain("physical_alt_q_visible_foreground_transition");
    expect(hotkeySmoke).toContain("$last.foreground");
    expect(hotkeySmoke).toContain("Assert-CdpPortAvailable");
    expect(hotkeySmoke).toContain("TcpListener");
    expect(hotkeySmoke).toContain("Get-ProcessTreeIds");
    expect(hotkeySmoke).toContain("launcherProcessTreeTerminated");
    expect(hotkeySmoke).toContain("ownedProcessIdsBeforeCleanup");
    expect(hotkeySmoke).toContain("WEBVIEW2_USER_DATA_FOLDER");
    expect(hotkeySmoke).toContain("webViewUserDataFolder");
    expect(hotkeySmoke).toContain("preflightPortAvailable");
    expect(hotkeySmoke).toContain("environmentRestoreErrors");
    expect(hotkeySmoke).toContain("webViewEnvironmentRestored");
    expect(hotkeySmoke).toContain("webViewUserDataRemoved");
    expect(hotkeySmoke).toContain("cleanupFailed");
    expect(hotkeySmoke).not.toContain("smoke_host_event_fallback");
    expect(hotkeySmoke).not.toContain("[switch]$StopExisting");
    expect(hotkeySmoke).not.toContain("Get-Process -Name dictation-tauri -ErrorAction SilentlyContinue | Stop-Process");
    expect(generatedCapabilities["preset-picker-events"]).toMatchObject({
      identifier: "preset-picker-events",
      windows: ["preset-picker"],
      permissions: ["core:event:default"],
    });
  });
});
