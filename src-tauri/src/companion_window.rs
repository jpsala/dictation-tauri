use std::{
    sync::atomic::{AtomicU64, Ordering},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow, WindowEvent};

pub const COMPANION_WINDOW_LABEL: &str = "dock-companion";
pub const PRESET_PICKER_WINDOW_LABEL: &str = "preset-picker";
const DOCK_WINDOW_LABEL: &str = "main";
const COMPANION_WINDOW_WIDTH: i32 = 440;
const COMPANION_WINDOW_HEIGHT: i32 = 420;
const PRESET_PICKER_WINDOW_WIDTH: i32 = 380;
const PRESET_PICKER_WINDOW_HEIGHT: i32 = 320;
const DOCK_COMPANION_COMMAND_EVENT: &str = "dock-companion://command";
static PRESET_PICKER_WATCH_GENERATION: AtomicU64 = AtomicU64::new(0);

pub fn configure_companion_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(COMPANION_WINDOW_LABEL) {
        eprintln!("[dictation-tauri][companion] attaching hide-on-close");
        attach_hide_on_close(window);
    } else {
        eprintln!("[dictation-tauri][companion] configured window not found during setup");
    }

    if let Some(window) = app.get_webview_window(PRESET_PICKER_WINDOW_LABEL) {
        eprintln!("[dictation-tauri][preset-picker] attaching hide-on-close");
        attach_hide_on_close(window);
    } else {
        eprintln!("[dictation-tauri][preset-picker] configured window not found during setup");
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

#[tauri::command]
pub fn focus_companion(app: AppHandle) -> Result<(), String> {
    focus_window(&app, COMPANION_WINDOW_LABEL, "Dictation Companion")
}

#[tauri::command]
pub fn show_preset_picker(app: AppHandle) -> Result<(), String> {
    show_positioned_window(
        &app,
        PRESET_PICKER_WINDOW_LABEL,
        PRESET_PICKER_WINDOW_WIDTH,
        PRESET_PICKER_WINDOW_HEIGHT,
        "preset-picker",
    )
    .map_err(|error| error.to_string())?;
    watch_preset_picker_focus(&app);
    Ok(())
}

#[tauri::command]
pub fn hide_preset_picker(app: AppHandle) -> Result<(), String> {
    hide_window(&app, PRESET_PICKER_WINDOW_LABEL, "preset-picker")
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn focus_preset_picker(app: AppHandle) -> Result<(), String> {
    focus_window(&app, PRESET_PICKER_WINDOW_LABEL, "Preset Picker")
}

pub fn show_companion_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    show_positioned_window(
        app,
        COMPANION_WINDOW_LABEL,
        COMPANION_WINDOW_WIDTH,
        COMPANION_WINDOW_HEIGHT,
        "companion",
    )
}

pub fn hide_companion_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    hide_window(app, COMPANION_WINDOW_LABEL, "companion")
}

fn show_positioned_window<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    width: i32,
    height: i32,
    log_label: &str,
) -> tauri::Result<()> {
    eprintln!("[dictation-tauri][{log_label}] show requested");
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| tauri::Error::WindowNotFound)?;

    if let Some(dock) = app.get_webview_window(DOCK_WINDOW_LABEL) {
        if let (Ok(dock_pos), Ok(dock_size)) = (dock.outer_position(), dock.outer_size()) {
            let x = dock_pos.x + (dock_size.width as i32 - width) / 2;
            let y = (dock_pos.y - height - 10).max(0);
            let _ = window.set_position(tauri::LogicalPosition::new(x, y));
        }
    }

    window.set_size(tauri::LogicalSize::new(width as f64, height as f64))?;
    window.show()?;
    let _ = window.set_focus();
    let _ = focus_webview_child(&window);
    eprintln!("[dictation-tauri][{log_label}] show ok");
    Ok(())
}

fn hide_window<R: Runtime>(app: &AppHandle<R>, label: &str, log_label: &str) -> tauri::Result<()> {
    eprintln!("[dictation-tauri][{log_label}] hide requested");
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| tauri::Error::WindowNotFound)?;
    window.hide()?;
    eprintln!("[dictation-tauri][{log_label}] hide ok");
    Ok(())
}

fn focus_window<R: Runtime>(app: &AppHandle<R>, label: &str, name: &str) -> Result<(), String> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("{name} window is not available"))?;
    window.set_focus().map_err(|error| error.to_string())?;
    focus_webview_child(&window).map_err(|error| error.to_string())
}

#[cfg(windows)]
fn focus_webview_child<R: Runtime>(
    window: &WebviewWindow<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    use windows_sys::Win32::{
        Foundation::{BOOL, HWND, LPARAM},
        UI::{
            Input::KeyboardAndMouse::SetFocus,
            WindowsAndMessaging::{BringWindowToTop, EnumChildWindows},
        },
    };

    extern "system" fn first_child(hwnd: HWND, lparam: LPARAM) -> BOOL {
        unsafe {
            let target = &mut *(lparam as *mut HWND);
            if target.is_null() {
                *target = hwnd;
                return 0;
            }
        }
        1
    }

    let hwnd = window.hwnd()?;
    let raw_hwnd = hwnd.0 as HWND;
    let mut child: HWND = std::ptr::null_mut();
    unsafe {
        BringWindowToTop(raw_hwnd);
        EnumChildWindows(
            raw_hwnd,
            Some(first_child),
            &mut child as *mut HWND as LPARAM,
        );
        if !child.is_null() {
            SetFocus(child);
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn focus_webview_child<R: Runtime>(
    _window: &WebviewWindow<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

fn watch_preset_picker_focus<R: Runtime>(app: &AppHandle<R>) {
    let generation = PRESET_PICKER_WATCH_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let Some(window) = app.get_webview_window(PRESET_PICKER_WINDOW_LABEL) else {
        return;
    };
    let app = app.clone();

    thread::spawn(move || {
        let mut saw_picker_foreground = false;
        loop {
            if PRESET_PICKER_WATCH_GENERATION.load(Ordering::SeqCst) != generation
                || !window.is_visible().unwrap_or(false)
            {
                return;
            }

            if is_picker_foreground(&window) {
                saw_picker_foreground = true;
            } else if saw_picker_foreground {
                thread::sleep(Duration::from_millis(100));
                if PRESET_PICKER_WATCH_GENERATION.load(Ordering::SeqCst) != generation
                    || is_picker_foreground(&window)
                {
                    continue;
                }

                let _ = window.hide();
                let _ = app.emit_to(
                    DOCK_WINDOW_LABEL,
                    DOCK_COMPANION_COMMAND_EVENT,
                    serde_json::json!({
                        "source": "dock_companion",
                        "command": "close_companion",
                    }),
                );
                return;
            }

            thread::sleep(Duration::from_millis(60));
        }
    });
}

#[cfg(windows)]
fn is_picker_foreground<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetAncestor, GetForegroundWindow, GA_ROOT};

    let Ok(hwnd) = window.hwnd() else {
        return false;
    };
    let foreground = unsafe { GetForegroundWindow() };
    !foreground.is_null()
        && unsafe { GetAncestor(foreground, GA_ROOT) }
            == hwnd.0 as windows_sys::Win32::Foundation::HWND
}

#[cfg(not(windows))]
fn is_picker_foreground<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    window.is_focused().unwrap_or(false)
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
