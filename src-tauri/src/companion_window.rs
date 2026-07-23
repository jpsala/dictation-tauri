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
const POSITIONED_WINDOW_GAP: i32 = 10;
const DOCK_COMPANION_COMMAND_EVENT: &str = "dock-companion://command";
static PRESET_PICKER_WATCH_GENERATION: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct PhysicalRect {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct PhysicalWindowLayout {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

fn scale_physical_dimension(value: i32, scale_factor: f64) -> i32 {
    ((value as f64) * scale_factor.max(0.1)).round().max(1.0) as i32
}

fn clamp_physical_axis(value: i32, min: i32, max: i32) -> i32 {
    if max < min {
        min
    } else {
        value.clamp(min, max)
    }
}

fn position_window_above_anchor(
    anchor: PhysicalRect,
    work_area: PhysicalRect,
    logical_width: i32,
    logical_height: i32,
    scale_factor: f64,
) -> PhysicalWindowLayout {
    let width = scale_physical_dimension(logical_width, scale_factor);
    let height = scale_physical_dimension(logical_height, scale_factor);
    let gap = scale_physical_dimension(POSITIONED_WINDOW_GAP, scale_factor);
    let candidate_x = anchor.x + (anchor.width - width) / 2;
    let candidate_y = anchor.y - height - gap;
    let max_x = work_area.x + work_area.width - width;
    let max_y = work_area.y + work_area.height - height;

    PhysicalWindowLayout {
        x: clamp_physical_axis(candidate_x, work_area.x, max_x),
        y: clamp_physical_axis(candidate_y, work_area.y, max_y),
        width,
        height,
    }
}

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
    let mut used_physical_layout = false;

    if let Some(dock) = app.get_webview_window(DOCK_WINDOW_LABEL) {
        if let (Ok(dock_pos), Ok(dock_size)) = (dock.outer_position(), dock.outer_size()) {
            let monitor = dock
                .current_monitor()
                .ok()
                .flatten()
                .or_else(|| window.current_monitor().ok().flatten())
                .or_else(|| app.primary_monitor().ok().flatten());

            if let Some(monitor) = monitor {
                let monitor_work_area = monitor.work_area();
                let layout = position_window_above_anchor(
                    PhysicalRect {
                        x: dock_pos.x,
                        y: dock_pos.y,
                        width: i32::try_from(dock_size.width).unwrap_or(i32::MAX),
                        height: i32::try_from(dock_size.height).unwrap_or(i32::MAX),
                    },
                    PhysicalRect {
                        x: monitor_work_area.position.x,
                        y: monitor_work_area.position.y,
                        width: i32::try_from(monitor_work_area.size.width).unwrap_or(i32::MAX),
                        height: i32::try_from(monitor_work_area.size.height).unwrap_or(i32::MAX),
                    },
                    width,
                    height,
                    monitor.scale_factor(),
                );

                eprintln!(
                    "[dictation-tauri][{log_label}] layout scale={:.2} work_area=({},{} {}x{}) anchor=({},{} {}x{}) window=({},{} {}x{})",
                    monitor.scale_factor(),
                    monitor_work_area.position.x,
                    monitor_work_area.position.y,
                    monitor_work_area.size.width,
                    monitor_work_area.size.height,
                    dock_pos.x,
                    dock_pos.y,
                    dock_size.width,
                    dock_size.height,
                    layout.x,
                    layout.y,
                    layout.width,
                    layout.height,
                );
                window.set_size(tauri::PhysicalSize::new(
                    layout.width as u32,
                    layout.height as u32,
                ))?;
                window.set_position(tauri::PhysicalPosition::new(layout.x, layout.y))?;
                used_physical_layout = true;
            }
        }
    }

    if !used_physical_layout {
        window.set_size(tauri::LogicalSize::new(width as f64, height as f64))?;
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn scaled_anchor(scale_factor: f64) -> PhysicalRect {
        PhysicalRect {
            x: (500.0 * scale_factor).round() as i32,
            y: (700.0 * scale_factor).round() as i32,
            width: (100.0 * scale_factor).round() as i32,
            height: (40.0 * scale_factor).round() as i32,
        }
    }

    fn scaled_work_area(scale_factor: f64) -> PhysicalRect {
        PhysicalRect {
            x: 0,
            y: 0,
            width: (1920.0 * scale_factor).round() as i32,
            height: (1040.0 * scale_factor).round() as i32,
        }
    }

    #[test]
    fn positions_window_with_one_physical_conversion_across_supported_scales() {
        let cases = [
            (
                1.0,
                PhysicalWindowLayout {
                    x: 360,
                    y: 370,
                    width: 380,
                    height: 320,
                },
            ),
            (
                1.25,
                PhysicalWindowLayout {
                    x: 450,
                    y: 462,
                    width: 475,
                    height: 400,
                },
            ),
            (
                1.5,
                PhysicalWindowLayout {
                    x: 540,
                    y: 555,
                    width: 570,
                    height: 480,
                },
            ),
            (
                2.0,
                PhysicalWindowLayout {
                    x: 720,
                    y: 740,
                    width: 760,
                    height: 640,
                },
            ),
        ];

        for (scale_factor, expected) in cases {
            assert_eq!(
                position_window_above_anchor(
                    scaled_anchor(scale_factor),
                    scaled_work_area(scale_factor),
                    PRESET_PICKER_WINDOW_WIDTH,
                    PRESET_PICKER_WINDOW_HEIGHT,
                    scale_factor,
                ),
                expected,
                "scale factor {scale_factor}",
            );
        }
    }

    #[test]
    fn clamps_window_to_work_area_edges_and_taskbar() {
        let work_area = PhysicalRect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1040,
        };

        assert_eq!(
            position_window_above_anchor(
                PhysicalRect {
                    x: 1850,
                    y: 1400,
                    width: 100,
                    height: 40,
                },
                work_area,
                PRESET_PICKER_WINDOW_WIDTH,
                PRESET_PICKER_WINDOW_HEIGHT,
                1.0,
            ),
            PhysicalWindowLayout {
                x: 1540,
                y: 720,
                width: 380,
                height: 320,
            },
        );

        assert_eq!(
            position_window_above_anchor(
                PhysicalRect {
                    x: 500,
                    y: 100,
                    width: 100,
                    height: 40,
                },
                work_area,
                PRESET_PICKER_WINDOW_WIDTH,
                PRESET_PICKER_WINDOW_HEIGHT,
                1.0,
            ),
            PhysicalWindowLayout {
                x: 360,
                y: 0,
                width: 380,
                height: 320,
            },
        );
    }

    #[test]
    fn clamps_window_on_monitor_with_negative_origin() {
        assert_eq!(
            position_window_above_anchor(
                PhysicalRect {
                    x: -1800,
                    y: -1000,
                    width: 100,
                    height: 40,
                },
                PhysicalRect {
                    x: -1920,
                    y: -1080,
                    width: 1920,
                    height: 1040,
                },
                PRESET_PICKER_WINDOW_WIDTH,
                PRESET_PICKER_WINDOW_HEIGHT,
                1.0,
            ),
            PhysicalWindowLayout {
                x: -1920,
                y: -1080,
                width: 380,
                height: 320,
            },
        );
    }
}
