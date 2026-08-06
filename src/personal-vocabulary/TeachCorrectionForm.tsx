
import { useEffect, useRef, useState } from "react";
import {
  createTeachCorrectionDraft,
  validateTeachCorrectionDraft,
  type TeachCorrectionAction,
  type TeachCorrectionConflict,
  type TeachCorrectionConflictChoice,
  type TeachCorrectionDraft,
} from "./teach-correction";

export type TeachCorrectionSession = Readonly<{
  sessionId: string;
  spoken: string;
  selectionLength: number;
  selectionTruncated: boolean;
}>;

export type TeachCorrectionEvent =
  | Readonly<{ kind: "open"; session: TeachCorrectionSession }>
  | Readonly<{ kind: "close"; sessionId?: string }>
  | Readonly<{ kind: "pending"; sessionId: string }>
  | Readonly<{
      kind: "choice_required";
      sessionId: string;
      action: TeachCorrectionAction;
      conflict: TeachCorrectionConflict;
    }>
  | Readonly<{
      kind: "result";
      sessionId: string;
      status: TeachCorrectionSaveResultStatus;
      message: string;
    }>;

export type TeachCorrectionSaveResultStatus =
  | "saved_and_replaced"
  | "saved_only"
  | "saved_selection_unchanged"
  | "invalid"
  | "conflict"
  | "network_error";

export type TeachCorrectionFormNotice = Readonly<{
  tone: "idle" | "success" | "warning" | "danger";
  message: string;
}>;

export type TeachCorrectionFormProps = Readonly<{
  session?: TeachCorrectionSession;
  conflict?: Readonly<{
    action: TeachCorrectionAction;
    conflict: TeachCorrectionConflict;
  }>;
  busy?: boolean;
  notice?: TeachCorrectionFormNotice;
  onCancel: () => void;
  onSubmit: (
    draft: TeachCorrectionDraft,
    action: TeachCorrectionAction,
    conflictChoice?: TeachCorrectionConflictChoice,
  ) => void;
}>;

export function TeachCorrectionForm({
  session,
  conflict,
  busy = false,
  notice,
  onCancel,
  onSubmit,
}: TeachCorrectionFormProps) {
  const [draft, setDraft] = useState<TeachCorrectionDraft>(() =>
    createTeachCorrectionDraft(session?.spoken ?? ""),
  );
  const [alternativeDraft, setAlternativeDraft] = useState("");
  const writtenRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(createTeachCorrectionDraft(session?.spoken ?? ""));
    setAlternativeDraft("");
    if (session) {
      requestAnimationFrame(() => writtenRef.current?.focus());
    }
  }, [session?.sessionId, session?.spoken]);

  if (!session) {
    return (
      <section className="dock-teach-correction" aria-labelledby="teach-correction-title">
        <div className="dock-teach-correction-header">
          <div>
            <strong id="teach-correction-title">Enseñar corrección</strong>
            <span>Seleccioná texto antes de abrir el picker para guardar una regla.</span>
          </div>
          <button type="button" className="dock-teach-correction-close" onClick={onCancel} aria-label="Cerrar Enseñar corrección">
            ×
          </button>
        </div>
        <p className="dock-teach-correction-empty">No hay una selección segura disponible.</p>
      </section>
    );
  }

  const validation = validateTeachCorrectionDraft(draft);
  const canSubmit = validation.ok && !session.selectionTruncated && session.selectionLength > 0 && !busy;
  const shortOrCommon = validation.warnings.length > 0;

  function updateDraft(patch: Partial<TeachCorrectionDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function addAlternative() {
    const next = alternativeDraft;
    if (!next || next.trim().length === 0 || draft.alternatives.includes(next)) {
      return;
    }
    updateDraft({ alternatives: [...draft.alternatives, next], mode: "ask", automaticConfirmed: false });
    setAlternativeDraft("");
  }

  function removeAlternative(value: string) {
    updateDraft({ alternatives: draft.alternatives.filter((candidate) => candidate !== value) });
  }

  function submit(action: TeachCorrectionAction) {
    if (!canSubmit || conflict) {
      return;
    }
    onSubmit(draft, action);
  }

  function submitConflict(choice: TeachCorrectionConflictChoice) {
    if (!canSubmit || !conflict) {
      return;
    }
    onSubmit(draft, conflict.action, choice);
  }

  return (
    <section className="dock-teach-correction" aria-labelledby="teach-correction-title">
      <div className="dock-teach-correction-header">
        <div>
          <strong id="teach-correction-title">Enseñar corrección</strong>
          <span>{session.selectionLength} caracteres seleccionados</span>
        </div>
        <button type="button" className="dock-teach-correction-close" onClick={onCancel} aria-label="Cerrar Enseñar corrección" disabled={busy}>
          ×
        </button>
      </div>

      <form
        className="dock-teach-correction-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit("replace_and_remember");
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <label className="dock-teach-correction-field">
          <span>Texto hablado</span>
          <input value={draft.spoken} readOnly aria-describedby="teach-correction-spoken-help" />
          <small id="teach-correction-spoken-help">Se conserva exactamente como origen de la regla.</small>
        </label>

        <label className="dock-teach-correction-field">
          <span>Texto correcto</span>
          <textarea
            ref={writtenRef}
            value={draft.written}
            onChange={(event) => updateDraft({ written: event.currentTarget.value })}
            rows={2}
            maxLength={256}
            required
            aria-describedby="teach-correction-written-help"
          />
          <small id="teach-correction-written-help">La grafía se usará en futuros dictados.</small>
        </label>

        <fieldset className="dock-teach-correction-mode">
          <legend>Aplicación</legend>
          <label>
            <input
              type="radio"
              name="teach-correction-mode"
              value="automatic"
              checked={draft.mode === "automatic"}
              onChange={() => updateDraft({
                mode: "automatic",
                automaticConfirmed: draft.mode === "automatic" && draft.automaticConfirmed,
              })}
            />
            <span><strong>Automática</strong><small>Reemplaza sin pausar el dictado.</small></span>
          </label>
          <label>
            <input
              type="radio"
              name="teach-correction-mode"
              value="ask"
              checked={draft.mode === "ask"}
              onChange={() => updateDraft({ mode: "ask", automaticConfirmed: false })}
            />
            <span><strong>Preguntar</strong><small>Permite elegir entre alternativas antes de entregar.</small></span>
          </label>
        </fieldset>

        <div className="dock-teach-correction-alternatives">
          <div className="dock-teach-correction-field-heading">
            <span>Alternativas</span>
            <small>Opcional, activa Preguntar.</small>
          </div>
          <div className="dock-teach-correction-alternative-entry">
            <input
              value={alternativeDraft}
              onChange={(event) => setAlternativeDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addAlternative();
                }
              }}
              maxLength={256}
              placeholder="Otra grafía"
              aria-label="Nueva alternativa"
            />
            <button type="button" className="dock-teach-correction-button dock-teach-correction-button-quiet" onClick={addAlternative} disabled={!alternativeDraft.trim() || busy}>
              Agregar
            </button>
          </div>
          {draft.alternatives.length ? (
            <ul className="dock-teach-correction-alternative-list" aria-label="Alternativas guardadas en este borrador">
              {draft.alternatives.map((alternative) => (
                <li key={alternative}>
                  <span>{alternative}</span>
                  <button type="button" onClick={() => removeAlternative(alternative)} aria-label={`Quitar alternativa ${alternative}`} disabled={busy}>×</button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {shortOrCommon ? (
          <div className="dock-teach-correction-warning" role="note">
            Este disparador es corto o común. Usá Preguntar o confirmá explícitamente Automática.
            {draft.mode === "automatic" ? (
              <label>
                <input type="checkbox" checked={draft.automaticConfirmed} onChange={(event) => updateDraft({ automaticConfirmed: event.currentTarget.checked })} />
                Confirmo usar Automática para este disparador.
              </label>
            ) : null}
          </div>
        ) : null}

        {session.selectionTruncated ? (
          <div className="dock-teach-correction-warning" role="alert">La selección supera el límite seguro y no se puede guardar.</div>
        ) : null}
        {conflict ? (
          <div className="dock-teach-correction-conflict" role="alert" data-testid="teach-correction-conflict">
            <strong>Ya existe una corrección para «{conflict.conflict.spoken}».</strong>
            <span>
              Revisión {conflict.conflict.revision}. Salidas actuales: {conflict.conflict.candidates.join(" · ") || "sin salida"}.
            </span>
            <span>Elegí cómo reconciliarla antes de guardar.</span>
            <div className="dock-teach-correction-conflict-actions">
              <button
                type="button"
                className="dock-teach-correction-button dock-teach-correction-button-secondary"
                onClick={() => submitConflict("replace")}
                disabled={!canSubmit || busy}
              >
                Reemplazar salida
              </button>
              <button
                type="button"
                className="dock-teach-correction-button dock-teach-correction-button-primary"
                onClick={() => submitConflict("add_alternative")}
                disabled={!canSubmit || busy}
              >
                Agregar alternativa y preguntar
              </button>
            </div>
          </div>
        ) : null}
        {notice?.message ? <div className={`dock-teach-correction-notice dock-teach-correction-notice-${notice.tone}`} role="status" aria-live="polite">{notice.message}</div> : null}

        <div className="dock-teach-correction-actions">
          <button type="button" className="dock-teach-correction-button dock-teach-correction-button-quiet" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="button" className="dock-teach-correction-button dock-teach-correction-button-secondary" onClick={() => submit("remember_only")} disabled={!canSubmit || Boolean(conflict)}>{busy ? "Guardando…" : "Sólo recordar"}</button>
          <button type="submit" className="dock-teach-correction-button dock-teach-correction-button-primary" disabled={!canSubmit || Boolean(conflict)}>{busy ? "Guardando…" : "Reemplazar y recordar"}</button>
        </div>
      </form>
    </section>
  );
}
