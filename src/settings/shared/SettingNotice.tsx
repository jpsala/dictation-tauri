import type { ReactNode } from "react";
import type { SettingsPersistenceState } from "../section-contracts";

export type SettingNoticeTone = "info" | "success" | "warning" | "danger";

export type SettingNoticeProps = {
  tone?: SettingNoticeTone;
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
  persistence?: SettingsPersistenceState;
};

export function getPersistenceMessage(state: SettingsPersistenceState): string | undefined {
  switch (state.status) {
    case "idle":
      return undefined;
    case "loading":
      return "Cargando…";
    case "saving":
      return "Guardando…";
    case "saved":
      return state.scope === "device" ? "Guardado en esta computadora" : `Guardado en ${state.scope === "account" ? "tu cuenta" : "tu perfil"}`;
    case "dirty":
      return `${state.count} ${state.count === 1 ? "cambio sin guardar" : "cambios sin guardar"}`;
    case "error":
      return state.rolledBack ? `${state.message} Restauramos el valor anterior.` : state.message;
  }
}

export function SettingNotice({ tone = "info", title, children, actions, persistence }: SettingNoticeProps) {
  const persistenceMessage = persistence ? getPersistenceMessage(persistence) : undefined;
  if (!children && !persistenceMessage) return null;
  const resolvedTone = persistence?.status === "error" ? "danger" : tone;
  return (
    <div className="setting-notice" data-tone={resolvedTone} role={resolvedTone === "danger" ? "alert" : "status"}>
      <div>
        {title ? <strong>{title}</strong> : null}
        <div>{children ?? persistenceMessage}</div>
      </div>
      {actions ? <div className="setting-notice-actions">{actions}</div> : null}
    </div>
  );
}
