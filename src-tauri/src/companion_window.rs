use tauri::{AppHandle, Manager, Runtime, WebviewWindow, WindowEvent};

pub const COMPANION_WINDOW_LABEL: &str = "dock-companion";
const DOCK_WINDOW_LABEL: &str = "main";
const COMPANION_WINDOW_WIDTH: i32 = 440;
const COMPANION_WINDOW_HEIGHT: i32 = 420;

pub fn configure_companion_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(COMPANION_WINDOW_LABEL) {
        eprintln!("[dictation-tauri][companion] attaching hide-on-close");
        attach_hide_on_close(window);
    } else {
        eprintln!("[dictation-tauri][companion] configured window not found during setup");
    }
}

#[tauri::command]
pub fn show_companion(app: AppHandle) -> Result<(), String> {
    show_companion_window(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn hide_companion(app: AppHandle) -> Result<(), String> {
    hide_companion_window(&app).map_err(|error| error.to_string())
}

pub fn show_companion_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    eprintln!("[dictation-tauri][companion] show requested");
    let companion = app
        .get_webview_window(COMPANION_WINDOW_LABEL)
        .ok_or_else(|| tauri::Error::WindowNotFound)?;

    if let Some(dock) = app.get_webview_window(DOCK_WINDOW_LABEL) {
        if let (Ok(dock_pos), Ok(dock_size)) = (dock.outer_position(), dock.outer_size()) {
            let width = COMPANION_WINDOW_WIDTH;
            let height = COMPANION_WINDOW_HEIGHT;
            let x = dock_pos.x + (dock_size.width as i32 - width) / 2;
            let y = (dock_pos.y - height - 10).max(0);
            let _ = companion.set_position(tauri::LogicalPosition::new(x, y));
        }
    }

    companion.set_size(tauri::LogicalSize::new(
        COMPANION_WINDOW_WIDTH as f64,
        COMPANION_WINDOW_HEIGHT as f64,
    ))?;
    companion.show()?;
    eprintln!("[dictation-tauri][companion] show ok");
    Ok(())
}

pub fn hide_companion_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    eprintln!("[dictation-tauri][companion] hide requested");
    let companion = app
        .get_webview_window(COMPANION_WINDOW_LABEL)
        .ok_or_else(|| tauri::Error::WindowNotFound)?;
    companion.hide()?;
    eprintln!("[dictation-tauri][companion] hide ok");
    Ok(())
}

fn attach_hide_on_close<R: Runtime>(window: WebviewWindow<R>) {
    let companion_window = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            eprintln!("[dictation-tauri][companion] close requested, hiding window");
            api.prevent_close();
            if let Err(error) = companion_window.hide() {
                eprintln!("[dictation-tauri][companion] hide-on-close failed: {error}");
            }
        }
    });
}
