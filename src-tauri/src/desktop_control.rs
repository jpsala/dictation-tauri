use serde::Serialize;

pub const DESKTOP_CONTROL_HOTKEY: &str = "Ctrl+Shift+F9";
pub const DESKTOP_CONTROL_HOTKEY_EVENT: &str = "desktop-control://global-hotkey";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopControlHotkeyPayload {
    pub source: &'static str,
    pub action: &'static str,
    pub shortcut: &'static str,
}

pub fn desktop_control_hotkey_pressed_payload() -> DesktopControlHotkeyPayload {
    desktop_control_hotkey_payload("pressed")
}

pub fn desktop_control_hotkey_released_payload() -> DesktopControlHotkeyPayload {
    desktop_control_hotkey_payload("released")
}

fn desktop_control_hotkey_payload(action: &'static str) -> DesktopControlHotkeyPayload {
    DesktopControlHotkeyPayload {
        source: "global_hotkey",
        action,
        shortcut: DESKTOP_CONTROL_HOTKEY,
    }
}

#[cfg(desktop)]
pub fn register_desktop_control_hotkey<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::Emitter;
    use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_shortcuts([DESKTOP_CONTROL_HOTKEY])?
            .with_handler(|app, shortcut, event| {
                if !shortcut.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::F9) {
                    return;
                }

                let payload = if event.state == ShortcutState::Pressed {
                    Some(desktop_control_hotkey_pressed_payload())
                } else if event.state == ShortcutState::Released {
                    Some(desktop_control_hotkey_released_payload())
                } else {
                    None
                };

                if let Some(payload) = payload {
                    let _ = app.emit(DESKTOP_CONTROL_HOTKEY_EVENT, payload);
                }
            })
            .build(),
    )?;

    Ok(())
}

#[cfg(not(desktop))]
pub fn register_desktop_control_hotkey<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payload_stays_fixed_to_pressed_and_released_hotkey() {
        assert_eq!(
            desktop_control_hotkey_pressed_payload(),
            DesktopControlHotkeyPayload {
                source: "global_hotkey",
                action: "pressed",
                shortcut: "Ctrl+Shift+F9",
            }
        );

        assert_eq!(
            desktop_control_hotkey_released_payload(),
            DesktopControlHotkeyPayload {
                source: "global_hotkey",
                action: "released",
                shortcut: "Ctrl+Shift+F9",
            }
        );
    }
}
