use std::{error::Error, io};

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewWindow};

pub const DOCK_WINDOW_LABEL: &str = "main";
pub const DOCK_WIDTH: i32 = 164;
pub const DOCK_HEIGHT: i32 = 64;
pub const DOCK_WINDOW_MARGIN: i32 = 16;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DockWorkArea {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DockPosition {
    pub x: i32,
    pub y: i32,
}

pub fn configure_dock_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn Error>> {
    let window = app.get_webview_window(DOCK_WINDOW_LABEL).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            "Dictation Dock window was not created",
        )
    })?;
    let position = resolve_dock_position(app, &window)?;

    window.set_size(PhysicalSize::new(DOCK_WIDTH as u32, DOCK_HEIGHT as u32))?;
    window.set_position(PhysicalPosition::new(position.x, position.y))?;
    window.set_skip_taskbar(true)?;
    window.set_always_on_top(true)?;
    platform::show_dock_window_no_activate(&window, position)?;

    Ok(())
}

fn resolve_dock_position<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
) -> Result<DockPosition, Box<dyn Error>> {
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

    Ok(calculate_bottom_center_position(DockWorkArea {
        x: work_area.position.x,
        y: work_area.position.y,
        width: work_area.size.width as i32,
        height: work_area.size.height as i32,
    }))
}

pub fn calculate_bottom_center_position(work_area: DockWorkArea) -> DockPosition {
    let available_width = (work_area.width - DOCK_WIDTH).max(0);
    let available_height = (work_area.height - DOCK_HEIGHT).max(0);
    let centered_x = work_area.x + available_width / 2;
    let bottom_y = work_area.y + available_height - DOCK_WINDOW_MARGIN;

    clamp_dock_position(
        DockPosition {
            x: centered_x,
            y: bottom_y,
        },
        work_area,
    )
}

fn clamp_dock_position(position: DockPosition, work_area: DockWorkArea) -> DockPosition {
    let min_x = work_area.x + DOCK_WINDOW_MARGIN;
    let min_y = work_area.y + DOCK_WINDOW_MARGIN;
    let max_x = work_area.x + work_area.width - DOCK_WIDTH - DOCK_WINDOW_MARGIN;
    let max_y = work_area.y + work_area.height - DOCK_HEIGHT - DOCK_WINDOW_MARGIN;

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
    use super::{DockPosition, DOCK_HEIGHT, DOCK_WIDTH};
    use std::{error::Error, io};
    use tauri::{Runtime, WebviewWindow};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, HWND_TOPMOST,
        SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_SHOWWINDOW, WS_EX_APPWINDOW, WS_EX_NOACTIVATE,
        WS_EX_TOOLWINDOW,
    };

    pub fn show_dock_window_no_activate<R: Runtime>(
        window: &WebviewWindow<R>,
        position: DockPosition,
    ) -> Result<(), Box<dyn Error>> {
        let hwnd = window.hwnd()?;
        let raw_hwnd = hwnd.0 as windows_sys::Win32::Foundation::HWND;

        unsafe {
            let existing_style = GetWindowLongPtrW(raw_hwnd, GWL_EXSTYLE);
            let dock_style = dock_extended_style(existing_style);
            SetWindowLongPtrW(raw_hwnd, GWL_EXSTYLE, dock_style);

            let ok = SetWindowPos(
                raw_hwnd,
                HWND_TOPMOST,
                position.x,
                position.y,
                DOCK_WIDTH,
                DOCK_HEIGHT,
                SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
            );
            if ok == 0 {
                return Err(Box::new(io::Error::last_os_error()));
            }
        }

        Ok(())
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
    }
}

#[cfg(not(windows))]
mod platform {
    use super::DockPosition;
    use std::error::Error;
    use tauri::{Runtime, WebviewWindow};

    pub fn show_dock_window_no_activate<R: Runtime>(
        window: &WebviewWindow<R>,
        _position: DockPosition,
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
            calculate_bottom_center_position(DockWorkArea {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            }),
            DockPosition { x: 878, y: 1000 }
        );
    }

    #[test]
    fn calculates_position_for_offset_monitor() {
        assert_eq!(
            calculate_bottom_center_position(DockWorkArea {
                x: -1280,
                y: 20,
                width: 1280,
                height: 984,
            }),
            DockPosition { x: -722, y: 924 }
        );
    }

    #[test]
    fn clamps_tiny_work_area_to_safe_margin() {
        assert_eq!(
            calculate_bottom_center_position(DockWorkArea {
                x: 10,
                y: 20,
                width: 120,
                height: 48,
            }),
            DockPosition { x: 26, y: 36 }
        );
    }
}
