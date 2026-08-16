import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createVoiceDockModeMetadata, VoiceDock } from "../../src/voice-dock/VoiceDock";
import type { DockSkinId } from "../../src/voice-dock/skins";
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

function renderDock(
  state: VoiceDockState,
  options: { allowPasteObservedWording?: boolean; skinId?: DockSkinId } = {},
): RenderedDock {
  const onCommand = vi.fn<(command: DockCommand) => void>();
  const html = renderToStaticMarkup(
    <VoiceDock state={state} skinId={options.skinId} onCommand={onCommand} />,
  );

  if (!options.allowPasteObservedWording) {
    expectNoPasteObservedWording(html);
  }

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
    expect(html).toContain("Tap toggles · Hold to talk.");
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
      { skinId: "classic-7" },
    );

    expect(html).toContain('data-phase="recording"');
    expect(html).toContain("Recording");
    expect(html).toContain("Release to stop · tap again if latched.");
    expect(html).toContain('class="voice-dock__orb" data-command="stop"');
    expect(html).toContain('aria-label="Stop recording for review"');
    expectAction(html, "Stop &amp; review");
    expectAction(html, "Stop &amp; submit");
    expectAction(html, "Cancel");
    expectNoAction(html, "Start");
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-label="Voice activity 72 percent"');
    expect(countNeedles(html, 'data-testid="voice-dock-vu-dot"')).toBe(7);
  });

  it("renders compact preset and assistant indicators when idle", () => {
    const { html } = renderDock(
      createVoiceDockState(
        { state: "idle" },
        {
          activePreset: { presetName: "Corregir texto", appKey: "global" },
          assistantModeEnabled: true,
        },
      ),
    );

    expect(html).toContain('data-context-menu="available"');
    expect(html).toContain('data-testid="voice-dock-preset-badge"');
    expect(html).toContain('data-command="clear_preset"');
    expect(html).toContain("Corregir texto");
    expect(html).toContain("Disable active preset: Corregir texto");
    expect(html).toContain('data-testid="voice-dock-assistant-indicator"');
    expect(html).toContain("Assistant mode available");
  });

  it("shows accessible non-profile mode badges without replacing the preset badge", () => {
    const state = createVoiceDockState(
      { state: "idle" },
      { activePreset: { presetName: "Corregir texto", appKey: "global" } },
    );

    const profileHtml = renderToStaticMarkup(
      <VoiceDock
        state={state}
        modeMetadata={createVoiceDockModeMetadata("profile")}
        onCommand={vi.fn()}
      />,
    );
    expect(profileHtml).not.toContain('data-testid="voice-dock-mode-badge"');

    for (const mode of ["fast", "safeCleanup", "complete"] as const) {
      const html = renderToStaticMarkup(
        <VoiceDock
          state={state}
          modeMetadata={createVoiceDockModeMetadata(mode)}
          onCommand={vi.fn()}
        />,
      );
      expect(html).toContain('data-testid="voice-dock-mode-badge"');
      expect(html).toContain(`data-mode="${mode}"`);
      expect(html).toContain('data-command="clear_mode"');
      expect(html).toContain("Use profile mode instead of");
      expect(html).toContain('data-testid="voice-dock-preset-badge"');
      expect(html).toContain("Corregir texto");
      expect(html).toContain("×");
    }

    const activeHtml = renderToStaticMarkup(
      <VoiceDock
        state={createVoiceDockState(
          session({ state: "listening" }),
          { activePreset: { presetName: "Corregir texto", appKey: "global" } },
        )}
        modeMetadata={createVoiceDockModeMetadata("fast")}
        onCommand={vi.fn()}
      />,
    );
    expect(activeHtml).not.toContain('data-testid="voice-dock-mode-badge"');
    expect(activeHtml).not.toContain('data-testid="voice-dock-preset-badge"');
    expect(activeHtml).toContain(
      'aria-label="Voice dock, dictation mode Rápido, action Corregir texto"',
    );
  });

  it("renders a passive transient audio enhancement notice", () => {
    const { html } = renderDock(
      createVoiceDockState({ state: "idle" }),
    );
    const enhancedHtml = renderToStaticMarkup(
      <VoiceDock
        state={createVoiceDockState({ state: "idle" })}
        audioEnhancementNotice="Mejorado +16 dB"
        onCommand={vi.fn()}
      />,
    );

    expect(html).not.toContain('data-testid="voice-dock-audio-enhancement"');
    expect(enhancedHtml).toContain('data-testid="voice-dock-audio-enhancement"');
    expect(enhancedHtml).toContain('role="status"');
    expect(enhancedHtml).toContain("Mejorado +16 dB");
    expect(countNeedles(enhancedHtml, "<button")).toBe(1);
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
    expect(html).toContain("Review only");
    expect(html).toContain("Nothing was inserted. Review the transcript locally or copy it manually.");
    expect(html).not.toContain('data-testid="voice-dock-companion"');
    expectAction(html, "Copy transcript");
    expectAction(html, "Paste last (safe)");
    expectNoAction(html, "Retry");
  });

  it("shows a specific selection failure and never offers paste-last for the dictated instruction", () => {
    const { html } = renderDock(
      createVoiceDockState(
        session({
          state: "reviewing",
          delivery: {
            status: "available",
            strategy: "review_only",
            output: "dictated instruction",
            message: "Selected text was not changed.",
          },
        }),
        {
          canPasteLastSafe: true,
          selectionTransformFailed: true,
          selectionTransformFailureMessage:
            "Selected text was not changed because this account does not include selection editing. The dictated instruction remains available to copy.",
        },
      ),
    );

    expect(html).toContain("Selection unavailable");
    expect(html).toContain("Selected text unchanged");
    expect(html).toContain("this account does not include selection editing");
    expectAction(html, "Copy transcript");
    expectNoAction(html, "Paste last (safe)");
  });

  it("renders failed recovery actions and lets cancellation settle quietly", () => {
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
    expect(failed).toContain("No pudimos completar el dictado");
    expect(failed).toContain("Provider unavailable");
    expectAction(failed, "Retry");
    expectNoAction(failed, "Copy transcript");

    const cancelled = renderDock(createVoiceDockState(session({ state: "cancelled" }))).html;

    expect(cancelled).toContain('data-phase="idle"');
    expect(cancelled).toContain("Ready");
    expect(cancelled).not.toContain("Dictation cancelled");
    expect(cancelled).not.toContain("Nothing was inserted. Start again when ready.");
    expectAction(cancelled, "Start");
    expectNoAction(cancelled, "Record again");
    expectNoAction(cancelled, "Retry");
  });

  it("distinguishes paste-last and copy failures from dictation failures", () => {
    const pasteFailure = renderDock(
      createVoiceDockState(
        session({
          state: "error",
          error: {
            code: "paste-last-failed",
            message: "Delivery failed: No assured editable target is available.",
          },
          delivery: {
            status: "failed",
            strategy: "paste_send",
            output: "older History transcript",
            message: "Paste failed.",
          },
        }),
      ),
    ).html;

    expect(pasteFailure).toContain("Paste last failed");
    expect(pasteFailure).toContain("No assured editable target");
    expect(pasteFailure).not.toContain("Dictation needs attention");
    expectAction(pasteFailure, "Copy transcript");
    expectAction(pasteFailure, "Retry");

    const unavailable = renderDock(
      createVoiceDockState(
        session({
          state: "error",
          error: {
            code: "paste-last-failed",
            message: "The latest dictation attempt produced no text.",
          },
        }),
      ),
    ).html;

    expect(unavailable).toContain("Nothing to paste");
    expect(unavailable).toContain("latest dictation attempt produced no text");
    expectNoAction(unavailable, "Copy transcript");

    const selectionFailure = renderDock(
      createVoiceDockState(
        session({
          state: "error",
          error: {
            code: "selection-transform-failed",
            message: "Selected text could not be captured safely.",
          },
        }),
      ),
    ).html;

    expect(selectionFailure).toContain("Selected text unchanged");
    expect(selectionFailure).toContain("could not be captured safely");
    expect(selectionFailure).not.toContain("Dictation needs attention");
    expectNoAction(selectionFailure, "Copy transcript");

    const copyFailure = renderDock(
      createVoiceDockState(
        session({
          state: "error",
          error: { code: "copy-failed", message: "Clipboard is busy." },
          delivery: {
            status: "failed",
            strategy: "copy",
            output: "transcript remains available",
            message: "Copy failed.",
          },
        }),
      ),
    ).html;

    expect(copyFailure).toContain("Copy failed");
    expect(copyFailure).toContain("Clipboard is busy");
    expect(copyFailure).not.toContain("Dictation needs attention");
  });

  it("settles uncertain delivery to idle without leaving a persistent check-target state", () => {
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

    expect(html).toContain('data-phase="idle"');
    expect(html).toContain('data-delivery-status="uncertain"');
    expect(html).toContain("Ready");
    expect(html).not.toContain("Delivery uncertain");
    expect(html).not.toContain("Insertion was not verified");
    expectAction(html, "Start");
    expectNoAction(html, "Copy transcript");
    expectNoAction(html, "Paste last (safe)");
  });

  it("returns verified paste observation to quiet idle with machine-readable dock evidence", () => {
    const { html } = renderDock(
      createVoiceDockState(
        session({
          state: "done",
          delivery: {
            status: "paste_observed",
            strategy: "paste_send",
            output: "local transcript",
            message: "Paste insertion was observed by a verified desktop observer.",
          },
        }),
        { canPasteLastSafe: true },
      ),
      { allowPasteObservedWording: true },
    );

    expect(html).toContain('data-phase="idle"');
    expect(html).toContain('data-delivery-status="paste_observed"');
    expect(html).toContain('data-testid="voice-dock-delivery-status"');
    expect(html).toContain("Ready");
    expect(html).toContain("Delivery status:");
    expect(html).toContain("paste_observed · verified");
    expect(html).not.toContain("Copy transcript");
  });
});
