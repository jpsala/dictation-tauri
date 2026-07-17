import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DesktopDictationSession } from "../../src/desktop-control/types";
import { VoiceDock } from "../../src/voice-dock/VoiceDock";
import type { DockCommand, VoiceDockState } from "../../src/voice-dock/types";
import { createVoiceDockState } from "../../src/voice-dock/visual-semantics";

const styles = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");

function session(input: Partial<DesktopDictationSession>): DesktopDictationSession {
  return {
    sessionId: "dock-parity-session-001",
    controlSource: "app_button",
    state: "idle",
    ...input,
  } as DesktopDictationSession;
}

function renderDock(state: VoiceDockState): string {
  return renderToStaticMarkup(
    <VoiceDock state={state} onCommand={vi.fn<(command: DockCommand) => void>()} />,
  );
}

function expectNoDeveloperLeakage(html: string): void {
  expect(html).not.toContain("Developer evidence");
  expect(html).not.toContain("Transcribe with provider");
  expect(html).not.toContain("Check host boundary");
  expect(html).not.toContain("Provider readiness");
}

function expectNoPasteObservedWording(html: string): void {
  expect(html).not.toContain("paste_observed");
  expect(html.toLowerCase()).not.toContain("paste observed");
  expect(html.toLowerCase()).not.toContain("delivery observed");
}

describe("VoiceDock Fixvox Skin4 parity contract", () => {
  it("keeps the idle dock to the transparent 164x64 seven-dot launcher contract", () => {
    const html = renderDock(createVoiceDockState({ state: "idle" }));

    expect(html).toContain('data-testid="voice-dock"');
    expect(html).toContain('data-phase="idle"');
    expect(html).toContain('role="meter"');
    expect((html.match(/data-testid="voice-dock-vu-dot"/g) ?? []).length).toBe(7);
    expect((html.match(/--dot-width:4px/g) ?? []).length).toBe(7);
    expect((html.match(/--dot-height:5px/g) ?? []).length).toBe(7);
    expect((html.match(/data-active="false"/g) ?? []).length).toBe(7);
    expect(html).not.toContain('data-testid="voice-dock-companion"');
    expect(html).not.toContain('class="voice-dock__actions"');
    expectNoDeveloperLeakage(html);
    expectNoPasteObservedWording(html);
  });

  it("renders recording as seven live VU bars with side stop and cancel controls", () => {
    const html = renderDock(
      createVoiceDockState(
        session({ state: "listening" }),
        { vuLevel: 0.64, vuBands: [0.05, 0.25, 0.6, 1, 0.75, 0.35, 0.1] },
      ),
    );

    expect(html).toContain('data-phase="recording"');
    expect(html).toContain('aria-label="Voice activity 64 percent"');
    expect((html.match(/data-testid="voice-dock-vu-dot"/g) ?? []).length).toBe(7);
    expect((html.match(/voice-dock__vu-dot--recording/g) ?? []).length).toBe(7);
    expect(html).toContain('class="voice-dock__actions"');
    expect(html).toContain('data-command="stop"');
    expect(html).toContain('data-command="stop_submit"');
    expect(html).toContain('data-command="cancel"');
    expect(html).toContain("Stop &amp; review");
    expect(html).toContain("Stop &amp; submit");
    expect(html).toContain("Cancel");
    expect(html).not.toContain('data-command="copy"');
    expect(html).not.toContain('data-command="paste_last_safe"');
    expectNoDeveloperLeakage(html);
    expectNoPasteObservedWording(html);
  });

  it("renders Fixvox-style preset and assistant indicators as compact visual metadata", () => {
    const html = renderDock(
      createVoiceDockState(
        session({ state: "listening" }),
        {
          activePreset: { presetName: "Corregir texto", appKey: "global", presetId: "corregir-texto" },
          assistantModeEnabled: true,
        },
      ),
    );

    expect(html).toContain('data-testid="voice-dock-preset-badge"');
    expect(html).toContain('data-command="clear_preset"');
    expect(html).toContain("Corregir texto");
    expect(html).toContain("Disable active preset: Corregir texto");
    expect(html).toContain('data-testid="voice-dock-assistant-indicator"');
    expect(html).toContain("Assistant mode available");
    expectNoDeveloperLeakage(html);
    expectNoPasteObservedWording(html);
  });

  it("renders processing as a compact companion chip without dock actions or developer panel leakage", () => {
    const html = renderDock(createVoiceDockState(session({ state: "transcribing" })));

    expect(html).toContain('data-phase="processing"');
    expect(html).toContain('data-testid="voice-dock-companion"');
    expect(html).toContain("Processing");
    expect(html).not.toContain('class="voice-dock__actions"');
    expect((html.match(/voice-dock__vu-dot--processing/g) ?? []).length).toBe(7);
    expectNoDeveloperLeakage(html);
    expectNoPasteObservedWording(html);
  });

  it("keeps reduced-motion and compact shell CSS guardrails provider-free", () => {
    expect(styles).toMatch(/html,\s*\n#root\s*{[^}]*min-width:\s*164px;[^}]*min-height:\s*64px;/s);
    expect(styles).toMatch(/body\s*{[^}]*min-width:\s*164px;[^}]*min-height:\s*64px;[^}]*background:\s*transparent;/s);
    expect(styles).toMatch(/\.voice-dock\s*{[^}]*width:\s*164px;[^}]*height:\s*64px;[^}]*background:\s*transparent;/s);
    expect(styles).toMatch(/\.voice-dock__vu\s*{[^}]*gap:\s*3\.5px;[^}]*height:\s*24px;/s);
    expect(styles).toMatch(/\.voice-dock__vu-dot\s*{[^}]*--dot-neon-glow:\s*rgb\(239 68 68 \/ 82%\);[^}]*width:\s*var\(--dot-width, 4px\);[^}]*height:\s*var\(--dot-height, 5px\);[^}]*radial-gradient\(circle at 50% 16%[^}]*color-mix\(in srgb, var\(--dot-neon-color\) 28%, white\)[^}]*0 0 5px var\(--dot-neon-glow\);/s);
    expect(styles).toContain("--dot-neon-color: rgb(255 196 189)");
    expect(styles).toMatch(/\.voice-dock--idle \.voice-dock__vu-dot\s*{[^}]*opacity:\s*0\.96;[^}]*0 0 6px var\(--dot-neon-glow\);/s);
    expect(styles).toMatch(/\.voice-dock--idle \.voice-dock__orb:not\(:disabled\):hover \+ \.voice-dock__status \.voice-dock__vu-dot\s*{[^}]*animation:\s*voice-dock-dot-hover-comet 1120ms[^}]*animation-delay:\s*var\(--dot-hover-delay\);/s);
    expect(styles).toMatch(/@keyframes voice-dock-dot-hover-comet\s*{[\s\S]*?filter:\s*brightness\(1\.14\) saturate\(1\.12\);[\s\S]*?0 0 13px var\(--dot-neon-glow\);[\s\S]*?translateY\(-0\.5px\) scale\(1\.06\);/s);
    expect(styles).toContain("--dot-hover-delay: 420ms");
    expect(styles).toContain("--voice-dock-primary-cursor: default");
    expect(styles).toMatch(/\.voice-dock__orb\s*{[^}]*cursor:\s*var\(--voice-dock-primary-cursor\);/s);
    expect(styles).toMatch(/\.voice-dock__action::before\s*{[^}]*font-size:\s*22px;/s);
    expect(styles).toMatch(/\.voice-dock__action\[data-side="center"\]\s*{[^}]*transform:\s*translate\(-50%, calc\(34% \+ 5px\)\);/s);
    expect(styles).toMatch(/\.voice-dock--recording \.voice-dock__vu-dot\s*{[^}]*0 0 13px rgb\(239 68 68 \/ 72%\);/s);
    expect(styles).not.toContain("--voice-dock-mic-cursor");
    expect(styles).not.toContain("cursor: grab");
    expect(styles).not.toContain("cursor: grabbing");
    expect(styles).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[^}]*\.voice-dock__vu-dot\s*{[^}]*transition:\s*none;/s);
  });
});
