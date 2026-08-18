import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function AccountNoticeSurface() {
  const close = () => {
    if (isTauri()) {
      void getCurrentWindow().close();
      return;
    }
    window.close();
  };

  return (
    <main className="account-notice" data-app-surface="account-notice" aria-live="polite">
      <h1 className="account-notice__title">Conectá tu cuenta</h1>
      <p className="account-notice__detail">Iniciá sesión para empezar a dictar.</p>
      <div className="account-notice__actions">
        <button type="button" className="button button-secondary" onClick={close}>
          Cerrar
        </button>
      </div>
    </main>
  );
}
