import type { ReactNode } from "react";

export type SettingsPageProps = {
  title: string;
  summary: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function SettingsPage({ title, summary, children, actions }: SettingsPageProps) {
  return (
    <section className="settings-page" aria-labelledby="settings-page-title">
      <header className="settings-page-header">
        <div>
          <p className="settings-path">Ajustes</p>
          <h1 id="settings-page-title">{title}</h1>
          <p>{summary}</p>
        </div>
        {actions ? <div className="settings-page-actions">{actions}</div> : null}
      </header>
      <div className="settings-page-body">{children}</div>
    </section>
  );
}
