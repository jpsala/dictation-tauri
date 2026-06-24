import type { CSSProperties } from "react";
import type { DockCommand, VoiceDockState } from "./types";

export type VoiceDockProps = {
  state: VoiceDockState;
  hotkeyLabel?: string;
  transcriptPreview?: string;
  onCommand: (command: DockCommand) => void;
};

type DockAction = {
  command: DockCommand;
  label: string;
  variant: "primary" | "secondary" | "ghost" | "danger";
  visible: boolean;
  disabled?: boolean;
};

export function VoiceDock({
  state,
  hotkeyLabel = "Ctrl+Shift+F9",
  transcriptPreview,
  onCommand,
}: VoiceDockProps) {
  const actions = createDockActions(state);
  const visibleActions = actions.filter((action) => action.visible);
  const companion = createCompanionChip(state);

  return (
    <section
      className={`voice-dock voice-dock--${state.phase}`}
      data-testid="voice-dock"
      data-phase={state.phase}
      data-delivery-status={state.deliveryStatus}
      aria-label="Voice dock"
    >
      <div className="voice-dock__main">
        <button
          type="button"
          className="voice-dock__orb"
          onClick={() => onCommand(state.canStart ? "start" : state.canStopSubmit ? "stop_submit" : "cancel")}
          aria-label={getPrimaryActionLabel(state)}
          disabled={!state.canStart && !state.canStopSubmit && !state.canCancel}
        >
          {getPrimaryActionLabel(state)}
        </button>

        <div className="voice-dock__status" role="status" aria-live="polite">
          <div className="voice-dock__row">
            <span className="voice-dock__chip" data-testid="voice-dock-state-chip">
              {state.statusText}
            </span>
            <span className="voice-dock__hotkey">{hotkeyLabel}</span>
          </div>
          {state.statusDetail ? (
            <p className="voice-dock__detail">{state.statusDetail}</p>
          ) : null}
          {state.deliveryStatusLabel ? (
            <p
              className="voice-dock__delivery-status"
              data-testid="voice-dock-delivery-status"
            >
              Delivery status: <code>{state.deliveryStatusLabel}</code>
            </p>
          ) : null}
          <div
            className="voice-dock__vu"
            role="meter"
            aria-label={`Voice activity ${Math.round(state.vuLevel * 100)} percent`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(state.vuLevel * 100)}
            data-testid="voice-dock-vu"
          >
            {state.vuBands.map((band, index) => {
              const dot = getDotVisual(state, band, index);

              return (
                <span
                  key={index}
                  className={`voice-dock__vu-dot voice-dock__vu-dot--${state.phase}`}
                  data-testid="voice-dock-vu-dot"
                  data-active={band > 0 ? "true" : "false"}
                  style={{
                    "--dot-width": `${dot.width}px`,
                    "--dot-height": `${dot.height}px`,
                    "--dot-opacity": dot.opacity,
                    "--dot-delay": `${index * 80}ms`,
                    "--dot-offset": `${dot.offset}px`,
                  } as CSSProperties}
                />
              );
            })}
          </div>
        </div>
      </div>

      {companion ? (
        <div
          className={`voice-dock__companion voice-dock__companion--${companion.tone}`}
          data-testid="voice-dock-companion"
          aria-live="polite"
        >
          <span className="voice-dock__companion-pulse" aria-hidden="true" />
          <span>{companion.label}</span>
        </div>
      ) : null}

      {visibleActions.length > 0 ? (
        <div className="voice-dock__actions" aria-label="Voice dock actions">
          {visibleActions.map((action) => (
            <button
              key={action.command}
              type="button"
              className={`voice-dock__action voice-dock__action--${action.variant}`}
              data-command={action.command}
              disabled={action.disabled}
              onClick={() => onCommand(action.command)}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      {state.recovery ? (
        <aside className="voice-dock__recovery" aria-label="Recovery actions">
          <strong>{state.recovery.title}</strong>
          <p>{state.recovery.message}</p>
        </aside>
      ) : null}

      {transcriptPreview ? (
        <p className="voice-dock__preview" data-testid="voice-dock-transcript-preview">
          {transcriptPreview}
        </p>
      ) : null}
    </section>
  );
}

function getPrimaryActionLabel(state: VoiceDockState): string {
  if (state.phase === "cancelled") {
    return "Record again";
  }

  if (state.canStart) {
    return "Start";
  }

  if (state.canStopSubmit) {
    return "Stop";
  }

  return "Cancel";
}

type DotVisual = {
  width: number;
  height: number;
  opacity: number;
  offset: number;
};

const idleDotHeights = [6, 6, 6, 6, 6, 6, 6] as const;
const armingDotHeights = [8, 8, 9, 9, 9, 8, 8] as const;
const processingDotHeights = [7, 8, 8, 9, 8, 8, 7] as const;
const recordingBaseDotSizes = [6, 6, 6, 6, 6, 6, 6] as const;
const recordingRangeDotSizes = [15, 15, 15, 15, 15, 15, 15] as const;
const recordingOpacityWeights = [0.1, 0.12, 0.11, 0.14, 0.11, 0.12, 0.1] as const;

function getDotVisual(
  state: VoiceDockState,
  band: number,
  index: number,
): DotVisual {
  if (state.phase === "recording") {
    const rawLevel = Math.max(band, state.vuLevel * 0.35);
    const barLevel = rawLevel > 0
      ? clamp(0.18 + Math.sqrt(rawLevel) * 0.82, 0, 1)
      : 0;
    const base = recordingBaseDotSizes[index] ?? 6;
    const range = recordingRangeDotSizes[index] ?? 15;

    return {
      width: 5,
      height: Math.round(base + barLevel * range),
      opacity: clamp(
        0.56 + barLevel * 0.3 + state.vuLevel * (recordingOpacityWeights[index] ?? 0.14),
        0.56,
        0.98,
      ),
      offset: 0,
    };
  }

  if (state.phase === "arming") {
    return { width: 5, height: armingDotHeights[index] ?? 8, opacity: 0.9, offset: 0 };
  }

  if (state.phase === "processing") {
    return {
      width: 5,
      height: processingDotHeights[index] ?? 8,
      opacity: 0.82,
      offset: 0,
    };
  }

  return { width: 5, height: idleDotHeights[index] ?? 6, opacity: 0.72, offset: 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type CompanionChip = {
  label: string;
  tone: "processing" | "ready" | "warning" | "failed";
};

function createCompanionChip(state: VoiceDockState): CompanionChip | undefined {
  switch (state.phase) {
    case "processing":
      return { label: "Processing", tone: "processing" };
    case "review":
      return { label: "Transcript ready", tone: "ready" };
    case "uncertain":
      return { label: "Check target", tone: "warning" };
    case "failed":
      return { label: "Needs attention", tone: "failed" };
    case "cancelled":
      return { label: "Cancelled", tone: "warning" };
    case "idle":
    case "arming":
    case "recording":
      return undefined;
  }
}

function createDockActions(state: VoiceDockState): DockAction[] {
  return [
    {
      command: "stop_submit",
      label: "Stop & review",
      variant: "primary",
      visible: state.canStopSubmit,
    },
    {
      command: "cancel",
      label: "Cancel",
      variant: "ghost",
      visible: state.canCancel,
    },
    {
      command: "retry",
      label: "Retry",
      variant: "secondary",
      visible: state.canRetry,
    },
    {
      command: "copy",
      label: "Copy transcript",
      variant: "secondary",
      visible: state.canCopy,
    },
    {
      command: "paste_last_safe",
      label: "Paste last (safe)",
      variant: "secondary",
      visible: state.canPasteLastSafe,
    },
  ];
}
