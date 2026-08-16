import type { ReactNode } from "react";

export type SettingsGroupProps = {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function SettingsGroup({ id, title, description, children, actions }: SettingsGroupProps) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} className="settings-group" aria-labelledby={headingId} tabIndex={id ? -1 : undefined}>
      <header className="settings-group-header">
        <div>
          <h2 id={headingId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="settings-group-actions">{actions}</div> : null}
      </header>
      <div className="settings-group-rows">{children}</div>
    </section>
  );
}
