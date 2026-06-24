use tauri::{AppHandle, Manager, Runtime};

pub const COMPANION_WINDOW_LABEL: &str = "dock-companion";
const DOCK_WINDOW_LABEL: &str = "main";

#[tauri::command]
pub fn show_companion(app: AppHandle) -> Result<(), String> {
    show_companion_window(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn hide_companion(app: AppHandle) -> Result<(), String> {
    hide_companion_window(&app).map_err(|error| error.to_string())
}

pub fn show_companion_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let companion = app
        .get_webview_window(COMPANION_WINDOW_LABEL)
        .ok_or_else(|| tauri::Error::WindowNotFound)?;

    if let Some(dock) = app.get_webview_window(DOCK_WINDOW_LABEL) {
        if let (Ok(dock_pos), Ok(dock_size)) = (dock.outer_position(), dock.outer_size()) {
            let width = 320_i32;
            let height = 158_i32;
            let x = dock_pos.x + (dock_size.width as i32 - width) / 2;
            let y = (dock_pos.y - height - 10).max(0);
            let _ = companion.set_position(tauri::LogicalPosition::new(x, y));
        }
    }

    companion.show()?;
    Ok(())
}

pub fn hide_companion_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let companion = app
        .get_webview_window(COMPANION_WINDOW_LABEL)
        .ok_or_else(|| tauri::Error::WindowNotFound)?;
    companion.hide()?;
    Ok(())
}
