use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WindowEvent};

pub const SETTINGS_WINDOW_LABEL: &str = "settings";
const SETTINGS_WINDOW_TITLE: &str = "Dictation Tauri Settings";
const SETTINGS_WINDOW_URL: &str = "index.html#settings";
const DEFAULT_ADMIN_CONTROL_ROOM_URL: &str = "https://fixvox.jpsala.dev/admin/pi";

pub fn configure_settings_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        eprintln!("[dictation-tauri][settings] attaching close lifecycle to configured window");
        attach_close_lifecycle(window);
    } else {
        eprintln!("[dictation-tauri][settings] configured window not found during setup");
    }
}

pub fn show_settings_window_for_app<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    eprintln!("[dictation-tauri][settings] show requested");
    let window = if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        eprintln!("[dictation-tauri][settings] reusing configured window");
        window
    } else {
        create_fresh_settings_window(app)
            .map_err(|error| format!("settings window unavailable: {error}"))?
    };

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

pub fn show_admin_control_room_for_app<R: Runtime>(_app: &AppHandle<R>) -> Result<(), String> {
    if !crate::fixvox_cloud::policy_allows_admin_settings() {
        return Err("Admin settings are not allowed by the current Fixvox policy.".to_string());
    }

    let url = resolve_admin_control_room_url()?;
    crate::fixvox_cloud::open_external_browser_url(url.as_str())
        .map_err(|error| format!("admin control room browser open failed: {}", error.message))
}

fn resolve_admin_control_room_url() -> Result<tauri::Url, String> {
    let raw = std::env::var("FIXVOX_ADMIN_CONTROL_ROOM_URL")
        .unwrap_or_else(|_| DEFAULT_ADMIN_CONTROL_ROOM_URL.to_string());
    let url = tauri::Url::parse(raw.trim())
        .map_err(|_| "Admin Control Room URL is invalid.".to_string())?;
    let local_http =
        url.scheme() == "http" && matches!(url.host_str(), Some("localhost" | "127.0.0.1"));
    if url.scheme() != "https" && !local_http {
        return Err("Admin Control Room URL must use HTTPS or local HTTP.".to_string());
    }
    Ok(url)
}

fn create_fresh_settings_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
    eprintln!("[dictation-tauri][settings] creating fresh window fallback");
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
    .visible(false)
    .build()?;

    attach_close_lifecycle(window.clone());
    eprintln!("[dictation-tauri][settings] created fresh window fallback");
    Ok(window)
}

fn attach_close_lifecycle<R: Runtime>(window: WebviewWindow<R>) {
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { .. } = event {
            eprintln!("[dictation-tauri][settings] close requested, allowing window close");
        }
    });
}

#[tauri::command]
pub fn show_settings_window(app: AppHandle) -> Result<(), String> {
    show_settings_window_for_app(&app)
}

#[tauri::command]
pub fn show_admin_control_room(app: AppHandle) -> Result<(), String> {
    show_admin_control_room_for_app(&app)
}
