use serde::{Deserialize, Serialize};
use std::{error::Error, fs, io, path::PathBuf};

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewWindow};

pub const DOCK_WINDOW_LABEL: &str = "main";
pub const DOCK_WIDTH: i32 = 164;
pub const DOCK_HEIGHT: i32 = 64;
pub const DOCK_WINDOW_MARGIN: i32 = 16;
pub const DOCK_POSITION_FILE: &str = "dock-position.v1.json";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DockWorkArea {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockPosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DockShellState {
    Idle,
    Arming,
    Recording,
    Processing,
    Review,
    Uncertain,
    Failed,
    Cancelled,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DockShellLayout {
    pub width: i32,
    pub height: i32,
    pub hit_region: DockHitRegion,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DockHitRegion {
    Full,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockShellSnapshot {
    width: i32,
    height: i32,
    state: DockShellState,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredDockPosition {
    schema_version: u8,
    x: i32,
    y: i32,
}

#[tauri::command]
pub fn update_dock_shell_state(
    app: AppHandle,
    state: DockShellState,
) -> Result<DockShellSnapshot, String> {
    apply_dock_shell_state(&app, state).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_dock_shell_position(app: AppHandle) -> Result<DockPosition, String> {
    current_dock_position(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn move_dock_shell_position(app: AppHandle, x: i32, y: i32) -> Result<DockPosition, String> {
    move_dock_position(&app, DockPosition { x, y }).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_dock_shell_position(app: AppHandle) -> Result<DockPosition, String> {
    save_current_dock_position(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn show_dock(app: AppHandle) -> Result<(), String> {
    show_dock_window(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn hide_dock(app: AppHandle) -> Result<(), String> {
    hide_dock_window(&app).map_err(|error| error.to_string())
}

pub fn configure_dock_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn Error>> {
    let window = app.get_webview_window(DOCK_WINDOW_LABEL).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "Dictation Dock window was not created",
        )
    })?;
    let layout = dock_shell_layout(DockShellState::Idle);
    let position = resolve_dock_position(app, &window, layout)?;

    window.set_size(PhysicalSize::new(layout.width as u32, layout.height as u32))?;
    window.set_position(PhysicalPosition::new(position.x, position.y))?;
    window.set_skip_taskbar(true)?;
    window.set_always_on_top(true)?;
    platform::show_dock_window_no_activate(&window, position, layout)?;

    Ok(())
}

pub fn show_dock_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn Error>> {
    apply_dock_shell_state(app, DockShellState::Idle).map(|_| ())
}

pub fn hide_dock_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn Error>> {
    let window = app.get_webview_window(DOCK_WINDOW_LABEL).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "Dictation Dock window is not available",
        )
    })?;

    window.hide()?;
    Ok(())
}

fn apply_dock_shell_state<R: Runtime>(
    app: &AppHandle<R>,
    state: DockShellState,
) -> Result<DockShellSnapshot, Box<dyn Error>> {
    let window = app.get_webview_window(DOCK_WINDOW_LABEL).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "Dictation Dock window is not available",
        )
    })?;
    let layout = dock_shell_layout(state);
    let position = resolve_state_position(app, &window, layout)?;

    platform::show_dock_window_no_activate(&window, position, layout)?;

    Ok(DockShellSnapshot {
        width: layout.width,
        height: layout.height,
        state,
    })
}

fn resolve_dock_position<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
    layout: DockShellLayout,
) -> Result<DockPosition, Box<dyn Error>> {
    let work_area = resolve_work_area(app, window)?;
    let saved = read_saved_dock_position(app).ok().flatten();

    Ok(resolve_saved_or_default_position(saved, work_area, layout))
}

fn resolve_state_position<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
    next_layout: DockShellLayout,
) -> Result<DockPosition, Box<dyn Error>> {
    let work_area = resolve_work_area(app, window)?;
    let current_position = window.outer_position()?;
    let current_size = window.outer_size()?;

    Ok(calculate_centered_bottom_resize_position(
        DockPosition {
            x: current_position.x,
            y: current_position.y,
        },
        current_size.width as i32,
        current_size.height as i32,
        next_layout,
        work_area,
    ))
}

fn resolve_work_area<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
) -> Result<DockWorkArea, Box<dyn Error>> {
    let monitor = window
        .current_monitor()?
        .or(app.primary_monitor()?)
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                "No monitor available for Dictation Dock",
            )
        })?;
    let work_area = monitor.work_area();

    Ok(DockWorkArea {
        x: work_area.position.x,
        y: work_area.position.y,
        width: work_area.size.width as i32,
        height: work_area.size.height as i32,
    })
}

fn current_dock_position<R: Runtime>(app: &AppHandle<R>) -> Result<DockPosition, Box<dyn Error>> {
    let window = app.get_webview_window(DOCK_WINDOW_LABEL).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "Dictation Dock window is not available",
        )
    })?;
    let position = window.outer_position()?;
    Ok(DockPosition {
        x: position.x,
        y: position.y,
    })
}

fn move_dock_position<R: Runtime>(
    app: &AppHandle<R>,
    position: DockPosition,
) -> Result<DockPosition, Box<dyn Error>> {
    let window = app.get_webview_window(DOCK_WINDOW_LABEL).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "Dictation Dock window is not available",
        )
    })?;
    window.set_position(PhysicalPosition::new(position.x, position.y))?;
    Ok(position)
}

fn save_current_dock_position<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<DockPosition, Box<dyn Error>> {
    let dock_position = current_dock_position(app)?;
    write_saved_dock_position(app, dock_position)?;
    Ok(dock_position)
}

fn dock_position_path<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<PathBuf> {
    Ok(app.path().app_data_dir()?.join(DOCK_POSITION_FILE))
}

fn read_saved_dock_position<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Option<DockPosition>> {
    let path = dock_position_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(path)?;
    let stored = serde_json::from_str::<StoredDockPosition>(&content)?;
    if stored.schema_version != 1 {
        return Ok(None);
    }

    Ok(Some(DockPosition {
        x: stored.x,
        y: stored.y,
    }))
}

fn write_saved_dock_position<R: Runtime>(
    app: &AppHandle<R>,
    position: DockPosition,
) -> Result<(), Box<dyn Error>> {
    let path = dock_position_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    fs::write(
        path,
        serde_json::to_string_pretty(&StoredDockPosition {
            schema_version: 1,
            x: position.x,
            y: position.y,
        })?,
    )?;
    Ok(())
}

pub fn dock_shell_layout(state: DockShellState) -> DockShellLayout {
    match state {
        DockShellState::Idle => DockShellLayout {
            width: DOCK_WIDTH,
            height: DOCK_HEIGHT,
            hit_region: DockHitRegion::Full,
        },
        DockShellState::Arming | DockShellState::Recording => DockShellLayout {
            width: DOCK_WIDTH,
            height: DOCK_HEIGHT,
            hit_region: DockHitRegion::Full,
        },
        DockShellState::Processing => expanded_layout(236, 84),
        DockShellState::Review
        | DockShellState::Uncertain
        | DockShellState::Failed
        | DockShellState::Cancelled => expanded_layout(260, 90),
    }
}

fn expanded_layout(width: i32, height: i32) -> DockShellLayout {
    DockShellLayout {
        width,
        height,
        hit_region: DockHitRegion::Full,
    }
}

pub fn resolve_saved_or_default_position(
    saved: Option<DockPosition>,
    work_area: DockWorkArea,
    layout: DockShellLayout,
) -> DockPosition {
    saved
        .map(|position| clamp_dock_position(position, work_area, layout))
        .unwrap_or_else(|| calculate_bottom_center_position(work_area, layout))
}

pub fn calculate_bottom_center_position(
    work_area: DockWorkArea,
    layout: DockShellLayout,
) -> DockPosition {
    let available_width = (work_area.width - layout.width).max(0);
    let available_height = (work_area.height - layout.height).max(0);
    let centered_x = work_area.x + available_width / 2;
    let bottom_y = work_area.y + available_height - DOCK_WINDOW_MARGIN;

    clamp_dock_position(
        DockPosition {
            x: centered_x,
            y: bottom_y,
        },
        work_area,
        layout,
    )
}

pub fn calculate_centered_bottom_resize_position(
    current_position: DockPosition,
    current_width: i32,
    current_height: i32,
    next_layout: DockShellLayout,
    work_area: DockWorkArea,
) -> DockPosition {
    let centered_x = current_position.x + (current_width - next_layout.width) / 2;
    let bottom_y = current_position.y + current_height - next_layout.height;

    clamp_dock_position(
        DockPosition {
            x: centered_x,
            y: bottom_y,
        },
        work_area,
        next_layout,
    )
}

fn clamp_dock_position(
    position: DockPosition,
    work_area: DockWorkArea,
    layout: DockShellLayout,
) -> DockPosition {
    let min_x = work_area.x + DOCK_WINDOW_MARGIN;
    let min_y = work_area.y + DOCK_WINDOW_MARGIN;
    let max_x = work_area.x + work_area.width - layout.width - DOCK_WINDOW_MARGIN;
    let max_y = work_area.y + work_area.height - layout.height - DOCK_WINDOW_MARGIN;

    DockPosition {
        x: clamp_axis(position.x, min_x, max_x),
        y: clamp_axis(position.y, min_y, max_y),
    }
}

fn clamp_axis(value: i32, min: i32, max: i32) -> i32 {
    if max < min {
        min
    } else {
        value.clamp(min, max)
    }
}

#[cfg(windows)]
mod platform {
    use super::{DockHitRegion, DockPosition, DockShellLayout};
    use std::{error::Error, io};
    use tauri::{Runtime, WebviewWindow};
    use windows_sys::Win32::{
        Graphics::Gdi::SetWindowRgn,
        UI::WindowsAndMessaging::{
            GetWindowLongPtrW, IsWindowVisible, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE,
            HWND_TOPMOST, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_SHOWWINDOW, WS_EX_APPWINDOW,
            WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
        },
    };

    pub fn show_dock_window_no_activate<R: Runtime>(
        window: &WebviewWindow<R>,
        position: DockPosition,
        layout: DockShellLayout,
    ) -> Result<(), Box<dyn Error>> {
        let hwnd = window.hwnd()?;
        let raw_hwnd = hwnd.0 as windows_sys::Win32::Foundation::HWND;

        unsafe {
            let existing_style = GetWindowLongPtrW(raw_hwnd, GWL_EXSTYLE);
            let dock_style = dock_extended_style(existing_style);
            let style_changed = dock_style != existing_style;
            if style_changed {
                SetWindowLongPtrW(raw_hwnd, GWL_EXSTYLE, dock_style);
            }
            apply_hit_region(raw_hwnd, layout.hit_region)?;

            let ok = SetWindowPos(
                raw_hwnd,
                HWND_TOPMOST,
                position.x,
                position.y,
                layout.width,
                layout.height,
                dock_set_window_pos_flags(style_changed, IsWindowVisible(raw_hwnd) != 0),
            );
            if ok == 0 {
                return Err(Box::new(io::Error::last_os_error()));
            }
        }

        Ok(())
    }

    fn apply_hit_region(
        hwnd: windows_sys::Win32::Foundation::HWND,
        hit_region: DockHitRegion,
    ) -> Result<(), Box<dyn Error>> {
        unsafe {
            match hit_region {
                DockHitRegion::Full => {
                    if SetWindowRgn(hwnd, std::ptr::null_mut(), 0) == 0 {
                        return Err(Box::new(io::Error::last_os_error()));
                    }
                }
            }
        }

        Ok(())
    }

    fn dock_set_window_pos_flags(style_changed: bool, already_visible: bool) -> u32 {
        let mut flags = SWP_NOACTIVATE;
        if !already_visible {
            flags |= SWP_SHOWWINDOW;
        }
        if style_changed {
            flags |= SWP_FRAMECHANGED;
        }
        flags
    }

    fn dock_extended_style(existing_style: isize) -> isize {
        let style = existing_style as u32;
        ((style | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW) & !WS_EX_APPWINDOW) as isize
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn dock_extended_style_marks_no_activate_tool_window_and_removes_app_window() {
            let style = dock_extended_style(WS_EX_APPWINDOW as isize) as u32;

            assert_eq!(style & WS_EX_NOACTIVATE, WS_EX_NOACTIVATE);
            assert_eq!(style & WS_EX_TOOLWINDOW, WS_EX_TOOLWINDOW);
            assert_eq!(style & WS_EX_APPWINDOW, 0);
        }

        #[test]
        fn visible_unchanged_dock_updates_do_not_force_show_or_frame_change() {
            let flags = dock_set_window_pos_flags(false, true);

            assert_eq!(flags & SWP_NOACTIVATE, SWP_NOACTIVATE);
            assert_eq!(flags & SWP_SHOWWINDOW, 0);
            assert_eq!(flags & SWP_FRAMECHANGED, 0);
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::{DockPosition, DockShellLayout};
    use std::error::Error;
    use tauri::{Runtime, WebviewWindow};

    pub fn show_dock_window_no_activate<R: Runtime>(
        window: &WebviewWindow<R>,
        _position: DockPosition,
        _layout: DockShellLayout,
    ) -> Result<(), Box<dyn Error>> {
        window.show()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calculates_bottom_center_position_inside_work_area() {
        assert_eq!(
            calculate_bottom_center_position(
                DockWorkArea {
                    x: 0,
                    y: 0,
                    width: 1920,
                    height: 1080,
                },
                dock_shell_layout(DockShellState::Idle),
            ),
            DockPosition { x: 878, y: 1000 }
        );
    }

    #[test]
    fn calculates_position_for_offset_monitor() {
        assert_eq!(
            calculate_bottom_center_position(
                DockWorkArea {
                    x: -1280,
                    y: 20,
                    width: 1280,
                    height: 984,
                },
                dock_shell_layout(DockShellState::Idle),
            ),
            DockPosition { x: -722, y: 924 }
        );
    }

    #[test]
    fn restores_saved_position_inside_work_area() {
        assert_eq!(
            resolve_saved_or_default_position(
                Some(DockPosition { x: 200, y: 300 }),
                DockWorkArea {
                    x: 0,
                    y: 0,
                    width: 1920,
                    height: 1080,
                },
                dock_shell_layout(DockShellState::Idle),
            ),
            DockPosition { x: 200, y: 300 }
        );
    }

    #[test]
    fn clamps_saved_position_to_current_work_area() {
        assert_eq!(
            resolve_saved_or_default_position(
                Some(DockPosition {
                    x: -10_000,
                    y: 10_000
                }),
                DockWorkArea {
                    x: 0,
                    y: 0,
                    width: 1920,
                    height: 1080,
                },
                dock_shell_layout(DockShellState::Idle),
            ),
            DockPosition { x: 16, y: 1000 }
        );
    }

    #[test]
    fn clamps_tiny_work_area_to_safe_margin() {
        assert_eq!(
            calculate_bottom_center_position(
                DockWorkArea {
                    x: 10,
                    y: 20,
                    width: 120,
                    height: 48,
                },
                dock_shell_layout(DockShellState::Idle),
            ),
            DockPosition { x: 26, y: 36 }
        );
    }

    #[test]
    fn idle_layout_uses_full_hit_region_for_reliable_drag() {
        assert_eq!(
            dock_shell_layout(DockShellState::Idle).hit_region,
            DockHitRegion::Full,
        );
    }

    #[test]
    fn recording_layout_keeps_full_hit_region_for_side_controls() {
        assert_eq!(
            dock_shell_layout(DockShellState::Recording),
            DockShellLayout {
                width: 164,
                height: 64,
                hit_region: DockHitRegion::Full,
            }
        );
    }

    #[test]
    fn review_layout_expands_while_preserving_center_and_bottom() {
        assert_eq!(
            calculate_centered_bottom_resize_position(
                DockPosition { x: 878, y: 1000 },
                164,
                64,
                dock_shell_layout(DockShellState::Review),
                DockWorkArea {
                    x: 0,
                    y: 0,
                    width: 1920,
                    height: 1080,
                },
            ),
            DockPosition { x: 830, y: 974 }
        );
    }
}
