import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VoiceDock } from "../../src/voice-dock/VoiceDock";
import type { DockCommand, VoiceDockState } from "../../src/voice-dock/types";
import { createVoiceDockState } from "../../src/voice-dock/visual-semantics";
import type { DesktopDictationSession } from "../../src/desktop-control/types";

function session(input: Partial<DesktopDictationSession>): DesktopDictationSession {
  return {
    sessionId: "dock-ui-session-001",
    controlSource: "app_button",
    state: "idle",
    ...input,
  } as DesktopDictationSession;
}

type RenderedDock = {
  html: string;
  onCommand: ReturnType<typeof vi.fn<(command: DockCommand) => void>>;
};

function renderDock(state: VoiceDockState): RenderedDock {
  const onCommand = vi.fn<(command: DockCommand) => void>();
  const html = renderToStaticMarkup(
    <VoiceDock state={state} onCommand={onCommand} />,
  );

  expectNoPasteObservedWording(html);

  return { html, onCommand };
}

function expectNoPasteObservedWording(html: string): void {
  expect(html).not.toContain("paste_observed");
  expect(html.toLowerCase()).not.toContain("paste observed");
  expect(html.toLowerCase()).not.toContain("delivery observed");
}

function expectAction(html: string, label: string): void {
  expect(html).toMatch(
    new RegExp(`<button[^>]*>[^<]*${escapeRegExp(label)}[^<]*</button>`),
  );
}

function expectNoAction(html: string, label: string): void {
  expect(html).not.toMatch(
    new RegExp(`<button[^>]*>[^<]*${escapeRegExp(label)}[^<]*</button>`),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countNeedles(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("VoiceDock UI", () => {
  it("renders idle as a compact one-button launcher with an explicit state chip", () => {
    const { html } = renderDock(createVoiceDockState({ state: "idle" }));

    expect(html).toContain('data-testid="voice-dock"');
    expect(html).toContain('data-phase="idle"');
    expect(html).toContain("Ready");
    expect(html).toContain("Press the dictation key or start from the dock.");
    expectAction(html, "Start");
    expectNoAction(html, "Stop");
    expectNoAction(html, "Cancel");
    expectNoAction(html, "Copy transcript");
    expectNoAction(html, "Retry");
    expect(countNeedles(html, "<button")).toBe(1);
  });

  it("renders active recording controls with a seven-dot VU affordance", () => {
    const { html } = renderDock(
      createVoiceDockState(
        session({ state: "listening" }),
        { vuLevel: 0.72, vuBands: [0.1, 0.35, 0.8, 1, 0.7, 0.4, 0.2] },
      ),
    );

    expect(html).toContain('data-phase="recording"');
    expect(html).toContain("Recording");
    expect(html).toContain("Release or stop when finished.");
    expectAction(html, "Stop &amp; review");
    expectAction(html, "Cancel");
    expectNoAction(html, "Start");
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-label="Voice activity 72 percent"');
    expect(countNeedles(html, 'data-testid="voice-dock-vu-dot"')).toBe(7);
  });

  it("renders review state copy and safe recovery actions without overclaiming insertion", () => {
    const { html } = renderDock(
      createVoiceDockState(
        session({
          state: "reviewing",
          delivery: {
            status: "available",
            strategy: "review_only",
            output: "local transcript",
            message: "Transcript is available.",
          },
        }),
        { canPasteLastSafe: true },
      ),
    );

    expect(html).toContain('data-phase="review"');
    expect(html).toContain("Review ready");
    expect(html).toContain("Transcript ready");
    expect(html).toContain("Review the transcript locally or copy it manually.");
    expectAction(html, "Copy transcript");
    expectAction(html, "Paste last (safe)");
    expectNoAction(html, "Retry");
  });

  it("renders failed and cancelled recovery actions as explicit compact controls", () => {
    const failed = renderDock(
      createVoiceDockState(
        session({
          state: "error",
          error: { message: "Provider unavailable", code: "provider_unavailable" },
          recoveryAction: {
            kind: "retry_from_clip",
            label: "Retry",
            reason: "Provider failed.",
            clipAvailable: true,
          },
        }),
      ),
    ).html;

    expect(failed).toContain('data-phase="failed"');
    expect(failed).toContain("Needs attention");
    expect(failed).toContain("Dictation needs attention");
    expect(failed).toContain("Provider unavailable");
    expectAction(failed, "Retry");
    expectNoAction(failed, "Copy transcript");

    const cancelled = renderDock(createVoiceDockState(session({ state: "cancelled" }))).html;

    expect(cancelled).toContain('data-phase="cancelled"');
    expect(cancelled).toContain("Cancelled");
    expect(cancelled).toContain("Dictation cancelled");
    expect(cancelled).toContain("Nothing was inserted. Start again when ready.");
    expectAction(cancelled, "Record again");
    expectAction(cancelled, "Retry");
  });

  it("renders uncertain delivery as copy-first recovery and never says paste was observed", () => {
    const { html } = renderDock(
      createVoiceDockState(
        session({
          state: "done",
          delivery: {
            status: "uncertain",
            strategy: "paste_send",
            output: "local transcript",
            message: "Paste was not observed.",
          },
        }),
        { canPasteLastSafe: true },
      ),
    );

    expect(html).toContain('data-phase="uncertain"');
    expect(html).toContain("Check target");
    expect(html).toContain("Check the target app");
    expect(html).toContain("Delivery was not verified");
    expectAction(html, "Copy transcript");
    expectAction(html, "Paste last (safe)");
  });
});
