import { describe, expect, it } from "vitest";
import type { DesktopDictationSession } from "../../src/desktop-control/types";
import {
  createDockCompanionSnapshot,
  createDockCompanionSyncKey,
  createEmptyDockCompanionSnapshot,
  dockCompanionCommandEvent,
  dockCompanionStateEvent,
} from "../../src/voice-dock/companion-state";
import { createVoiceDockState } from "../../src/voice-dock/visual-semantics";

function session(input: Partial<DesktopDictationSession>): DesktopDictationSession {
  return {
    sessionId: "companion-session-001",
    controlSource: "app_button",
    state: "idle",
    ...input,
  } as DesktopDictationSession;
}

describe("dock companion state", () => {
  it("projects recovery and history into a companion-safe snapshot without transcript text", () => {
    const snapshot = createDockCompanionSnapshot({
      voiceDockState: createVoiceDockState(
        session({
          state: "reviewing",
          delivery: {
            status: "available",
            strategy: "review_only",
            output: "raw transcript must stay in main review only",
            message: "Transcript is available.",
          },
        }),
      ),
      resultHistoryOpen: true,
      resultHistoryEntries: [
        {
          id: "history-1",
          source: "dictation",
          text: "first reusable dictation result preview",
          textLength: 42,
          deliveryEvidence: { status: "available" },
        },
        {
          id: "history-2",
          source: "selection_transform",
          text: "second reusable result preview for hover details",
          textLength: 17,
          deliveryEvidence: { status: "uncertain" },
        },
      ],
      settingsPanelOpen: false,
    });

    expect(snapshot.visible).toBe(true);
    expect(snapshot.recovery).toMatchObject({
      title: "Transcript ready",
      message: "Review the transcript locally or copy it manually.",
    });
    expect(snapshot.history.items).toEqual([
      {
        id: "history-2",
        label: "selection transform",
        textLength: 17,
        deliveryStatus: "uncertain",
        textPreview: "second reusable result preview for hover details",
        hoverPreview: "second reusable result preview for hover details",
      },
      {
        id: "history-1",
        label: "dictation",
        textLength: 42,
        deliveryStatus: "available",
        textPreview: "first reusable dictation result preview",
        hoverPreview: "first reusable dictation result preview",
      },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain(
      "raw transcript must stay in main review only",
    );
  });

  it("opens for settings with the active preset metadata", () => {
    const snapshot = createDockCompanionSnapshot({
      voiceDockState: createVoiceDockState({ state: "idle" }),
      resultHistoryOpen: false,
      resultHistoryEntries: [],
      settingsPanelOpen: true,
      activePreset: { presetId: "rewrite", presetName: "Rewrite", appKey: "global" },
    });

    expect(snapshot.visible).toBe(true);
    expect(snapshot.settings).toEqual({
      open: true,
      activePreset: { presetId: "rewrite", presetName: "Rewrite", appKey: "global" },
    });
    expect(snapshot.history.items).toEqual([]);
  });

  it("stays hidden when no companion panel is requested", () => {
    const snapshot = createDockCompanionSnapshot({
      voiceDockState: createVoiceDockState({ state: "idle" }),
      resultHistoryOpen: false,
      resultHistoryEntries: [],
      settingsPanelOpen: false,
    });

    expect(snapshot.visible).toBe(false);
    expect(snapshot.status).toMatchObject({ phase: "idle", statusText: "Ready" });
  });

  it("keeps hidden sync stable across unrelated dock state changes", () => {
    const hiddenIdle = createDockCompanionSnapshot({
      voiceDockState: createVoiceDockState({ state: "idle" }),
      resultHistoryOpen: false,
      resultHistoryEntries: [],
      settingsPanelOpen: false,
    });
    const hiddenRecording = createDockCompanionSnapshot({
      voiceDockState: createVoiceDockState(session({ state: "recording" })),
      resultHistoryOpen: false,
      resultHistoryEntries: [],
      settingsPanelOpen: false,
    });
    const visibleHistory = createDockCompanionSnapshot({
      voiceDockState: createVoiceDockState(session({ state: "recording" })),
      resultHistoryOpen: true,
      resultHistoryEntries: [],
      settingsPanelOpen: false,
    });

    expect(createDockCompanionSyncKey(hiddenIdle)).toBe("hidden");
    expect(createDockCompanionSyncKey(hiddenRecording)).toBe("hidden");
    expect(createDockCompanionSyncKey(visibleHistory)).not.toBe("hidden");
  });

  it("exposes stable Tauri event names and empty snapshot", () => {
    expect(dockCompanionStateEvent).toBe("dock-companion://state");
    expect(dockCompanionCommandEvent).toBe("dock-companion://command");
    expect(createEmptyDockCompanionSnapshot()).toMatchObject({
      schemaVersion: 1,
      visible: false,
      history: { open: false, totalCount: 0, items: [] },
      settings: { open: false },
    });
  });
});
