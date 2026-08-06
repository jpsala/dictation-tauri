
import { useEffect, useRef } from "react";
import type { VocabularyChoiceSessionView } from "../personal-vocabulary";
import "./vocabulary-choice.css";

export type VocabularyChoiceSurfaceProps = {
  state: VocabularyChoiceSessionView;
  onChoice: (choiceId: string) => void;
  onKeepOriginal: () => void;
  onCancel?: () => void;
  disabled?: boolean;
};

/**
 * Compact companion surface for the pre-delivery vocabulary gate.  It keeps
 * the trigger and configured candidates visible, but never renders the full
 * dictated output or any diagnostic payload.
 */
export function VocabularyChoiceSurface({
  state,
  onChoice,
  onKeepOriginal,
  onCancel,
  disabled = false,
}: VocabularyChoiceSurfaceProps) {
  const firstChoiceRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstChoiceRef.current?.focus();
  }, [state.sessionId, state.group.id]);

  useEffect(() => {
    if (!onCancel) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <section
      className="vocabulary-choice-surface"
      data-testid="vocabulary-choice-surface"
      data-state="waiting_for_choice"
      aria-labelledby="vocabulary-choice-title"
    >
      <header className="vocabulary-choice-surface__header">
        <div>
          <p className="vocabulary-choice-surface__kicker">Vocabulario personal</p>
          <h2 id="vocabulary-choice-title">Esperando elección</h2>
        </div>
        <span className="vocabulary-choice-surface__progress" aria-label={`Elección ${state.groupIndex + 1} de ${state.groupCount}`}>
          {state.groupIndex + 1}/{state.groupCount}
        </span>
      </header>

      <p className="vocabulary-choice-surface__prompt">
        Elegí cómo entregar <strong>{state.group.trigger}</strong>. La elección se aplicará a {state.pendingOccurrences === 1 ? "esta coincidencia" : "todas sus coincidencias"}.
      </p>

      <div className="vocabulary-choice-surface__options" role="group" aria-label="Vocabulary choices">
        {state.group.candidates.map((candidate, index) => (
          <button
            key={candidate.id}
            ref={index === 0 ? firstChoiceRef : undefined}
            type="button"
            className="vocabulary-choice-surface__option"
            data-choice-id={candidate.id}
            disabled={disabled}
            onClick={() => onChoice(candidate.id)}
          >
            <span className="vocabulary-choice-surface__option-label">{candidate.written}</span>
            <span className="vocabulary-choice-surface__option-hint">Usar esta grafía</span>
          </button>
        ))}
        <button
          type="button"
          className="vocabulary-choice-surface__keep"
          data-choice-id="__keep_original__"
          disabled={disabled}
          onClick={onKeepOriginal}
        >
          Mantener original
        </button>
      </div>

      <footer className="vocabulary-choice-surface__footer">
        <span>Esc para mantener el original</span>
        {onCancel ? (
          <button
            type="button"
            className="vocabulary-choice-surface__cancel"
            disabled={disabled}
            onClick={onCancel}
          >
            Cancelar
          </button>
        ) : null}
      </footer>
    </section>
  );
}
