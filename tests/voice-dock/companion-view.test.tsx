// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CompanionSurfaceView } from "../../src/App";
import {
  createDockCompanionSnapshot,
  type DockCompanionCommandPayload,
} from "../../src/voice-dock";
import { createVoiceDockState } from "../../src/voice-dock/visual-semantics";
import type { DesktopDictationSession } from "../../src/desktop-control/types";

function session(input: Partial<DesktopDictationSession>): DesktopDictationSession {
  return {
    sessionId: "companion-view-session-001",
    controlSource: "app_button",
    state: "idle",
    ...input,
  } as DesktopDictationSession;
}

describe("dock companion view", () => {
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

  it("renders the Alt+Q action picker with preset commands", () => {
    const onCommand = vi.fn<(payload: DockCompanionCommandPayload) => void>();
    const snapshot = createDockCompanionSnapshot({
      voiceDockState: createVoiceDockState({ state: "idle" }),
      resultHistoryOpen: false,
      resultHistoryEntries: [],
      settingsPanelOpen: true,
      activePreset: { presetId: "corregir-texto", presetName: "Corregir texto", appKey: "global" },
    });

    const html = renderToStaticMarkup(
      <CompanionSurfaceView snapshot={snapshot} onCommand={onCommand} />,
    );

    expect(html).toContain("Preset picker");
    expect(html).toContain("Search presets…");
    expect(html).toContain("Como yo (español)");
    expect(html).toContain("Corregir texto");
    expect(html).toContain("Fix Writing");
    expect(html).toContain("Like me (English)");
    expect(html).toContain("Alt+Q then Y");
    expect(html).toContain("Preset multi-chord shortcuts");
    expect(html).toContain("navigate");
    expect(html).toContain("run");
    expect(html).toContain("quick run");
    expect(html).toContain("Quick Chat");
    expect(html).toContain("Separate surface");
    expect(html).toContain("Close companion");
    expect(html).toContain("×");
    expect(html).not.toContain("Dismiss");
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
    expect(source).toContain("quickRunHint");
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
    expect(html).toContain("Close companion");
    expect(html).toContain("×");
    expect(html).not.toContain("Dismiss");
  });
});
