use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WindowEvent};

pub const SETTINGS_WINDOW_LABEL: &str = "settings";
const SETTINGS_WINDOW_TITLE: &str = "Dictation Tauri Settings";
const SETTINGS_WINDOW_URL: &str = "index.html?surface=settings";

pub fn configure_settings_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        eprintln!("[dictation-tauri][settings] attaching hide-on-close to configured window");
        attach_hide_on_close(window);
    } else {
        eprintln!("[dictation-tauri][settings] configured window not found during setup");
    }
}

pub fn show_settings_window_for_app<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    eprintln!("[dictation-tauri][settings] show requested");
    let window = create_fresh_settings_window(app)
        .map_err(|error| format!("settings window unavailable: {error}"))?;

    window
        .show()
        .map_err(|error| format!("settings window show failed: {error}"))?;
    eprintln!("[dictation-tauri][settings] show ok");
    window
        .unminimize()
        .map_err(|error| format!("settings window restore failed: {error}"))?;
    eprintln!("[dictation-tauri][settings] restore ok");
    window
        .set_focus()
        .map_err(|error| format!("settings window focus failed: {error}"))?;
    eprintln!("[dictation-tauri][settings] focus ok");

    Ok(())
}

fn create_fresh_settings_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        eprintln!("[dictation-tauri][settings] destroying stale window before open");
        window.destroy()?;
    }

    eprintln!("[dictation-tauri][settings] creating fresh window");
    let window = tauri::WebviewWindowBuilder::new(
        app,
        SETTINGS_WINDOW_LABEL,
        WebviewUrl::App(SETTINGS_WINDOW_URL.into()),
    )
    .title(SETTINGS_WINDOW_TITLE)
    .inner_size(720.0, 480.0)
    .min_inner_size(620.0, 420.0)
    .resizable(true)
    .decorations(true)
    .shadow(true)
    .focused(true)
    .skip_taskbar(false)
    .visible(true)
    .build()?;

    attach_hide_on_close(window.clone());
    eprintln!("[dictation-tauri][settings] created fresh window");
    Ok(window)
}

fn attach_hide_on_close<R: Runtime>(window: WebviewWindow<R>) {
    let settings_window = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { .. } = event {
            eprintln!("[dictation-tauri][settings] close requested, allowing destroy");
            drop(settings_window.clone());
        }
    });
}

#[tauri::command]
pub fn show_settings_window(app: AppHandle) -> Result<(), String> {
    show_settings_window_for_app(&app)
}
