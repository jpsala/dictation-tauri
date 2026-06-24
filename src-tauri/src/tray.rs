use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

pub const TRAY_ID: &str = "dictation-tray";
pub const TRAY_MENU_SHOW_DOCK: &str = "show_dock";
pub const TRAY_MENU_HIDE_DOCK: &str = "hide_dock";
pub const TRAY_MENU_SETTINGS: &str = "settings";
pub const TRAY_MENU_QUIT: &str = "quit";

pub fn register_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show_dock = MenuItem::with_id(app, TRAY_MENU_SHOW_DOCK, "Show Dock", true, None::<&str>)?;
    let hide_dock = MenuItem::with_id(app, TRAY_MENU_HIDE_DOCK, "Hide Dock", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, TRAY_MENU_SETTINGS, "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, TRAY_MENU_QUIT, "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_dock, &hide_dock, &settings, &quit])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Dictation Tauri")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_MENU_SHOW_DOCK => show_dock_window(app),
            TRAY_MENU_HIDE_DOCK => hide_dock_window(app),
            TRAY_MENU_SETTINGS => show_dock_window(app),
            TRAY_MENU_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_dock_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

fn toggle_dock_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

fn show_dock_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_dock_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}
