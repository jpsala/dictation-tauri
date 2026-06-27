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

    expect(html).toContain("Transcript ready");
    expect(html).toContain("Copy transcript");
    expect(html).toContain("Paste last (safe)");
    expect(html).toContain("Close companion");
    expect(html).toContain("×");
    expect(html).not.toContain("Dismiss");
    expect(html).not.toContain("sensitive transcript stays out of companion");
    expect(html.toLowerCase()).not.toContain("paste observed");
  });

  it("renders settings preset actions as companion commands", () => {
    const onCommand = vi.fn<(payload: DockCompanionCommandPayload) => void>();
    const snapshot = createDockCompanionSnapshot({
      voiceDockState: createVoiceDockState({ state: "idle" }),
      resultHistoryOpen: false,
      resultHistoryEntries: [],
      settingsPanelOpen: true,
      activePreset: { presetId: "rewrite", presetName: "Rewrite", appKey: "global" },
    });

    const html = renderToStaticMarkup(
      <CompanionSurfaceView snapshot={snapshot} onCommand={onCommand} />,
    );

    expect(html).toContain("Active preset: Rewrite");
    expect(html).toContain("Rewrite");
    expect(html).toContain("Shorten");
    expect(html).toContain("Bulletize");
    expect(html).toContain("Clear preset");
    expect(html).toContain("Close companion");
    expect(html).toContain("×");
    expect(html).not.toContain("Dismiss");
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
