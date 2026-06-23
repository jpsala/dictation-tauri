use serde::Serialize;

pub const DESKTOP_CONTROL_PRIMARY_HOTKEY: &str = "Alt+Space";
pub const DESKTOP_CONTROL_FALLBACK_HOTKEY: &str = "Ctrl+Shift+F9";
pub const DESKTOP_CONTROL_HOTKEY_EVENT: &str = "desktop-control://global-hotkey";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopControlHotkeyPayload {
    pub source: &'static str,
    pub action: &'static str,
    pub shortcut: &'static str,
}

pub fn desktop_control_primary_hotkey_pressed_payload() -> DesktopControlHotkeyPayload {
    desktop_control_hotkey_payload("pressed", DESKTOP_CONTROL_PRIMARY_HOTKEY)
}

pub fn desktop_control_primary_hotkey_released_payload() -> DesktopControlHotkeyPayload {
    desktop_control_hotkey_payload("released", DESKTOP_CONTROL_PRIMARY_HOTKEY)
}

pub fn desktop_control_fallback_hotkey_pressed_payload() -> DesktopControlHotkeyPayload {
    desktop_control_hotkey_payload("pressed", DESKTOP_CONTROL_FALLBACK_HOTKEY)
}

pub fn desktop_control_fallback_hotkey_released_payload() -> DesktopControlHotkeyPayload {
    desktop_control_hotkey_payload("released", DESKTOP_CONTROL_FALLBACK_HOTKEY)
}

fn desktop_control_hotkey_payload(
    action: &'static str,
    shortcut: &'static str,
) -> DesktopControlHotkeyPayload {
    DesktopControlHotkeyPayload {
        source: "global_hotkey",
        action,
        shortcut,
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
            .with_shortcuts([DESKTOP_CONTROL_PRIMARY_HOTKEY, DESKTOP_CONTROL_FALLBACK_HOTKEY])?
            .with_handler(|app, shortcut, event| {
                let matched_shortcut = if shortcut.matches(Modifiers::ALT, Code::Space) {
                    Some(DESKTOP_CONTROL_PRIMARY_HOTKEY)
                } else if shortcut.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::F9) {
                    Some(DESKTOP_CONTROL_FALLBACK_HOTKEY)
                } else {
                    None
                };

                let Some(matched_shortcut) = matched_shortcut else {
                    return;
                };

                let payload = if event.state == ShortcutState::Pressed {
                    if matched_shortcut == DESKTOP_CONTROL_PRIMARY_HOTKEY {
                        Some(desktop_control_primary_hotkey_pressed_payload())
                    } else {
                        Some(desktop_control_fallback_hotkey_pressed_payload())
                    }
                } else if event.state == ShortcutState::Released {
                    if matched_shortcut == DESKTOP_CONTROL_PRIMARY_HOTKEY {
                        Some(desktop_control_primary_hotkey_released_payload())
                    } else {
                        Some(desktop_control_fallback_hotkey_released_payload())
                    }
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
    fn payloads_include_primary_alt_space_and_fallback_hotkeys() {
        assert_eq!(
            desktop_control_primary_hotkey_pressed_payload(),
            DesktopControlHotkeyPayload {
                source: "global_hotkey",
                action: "pressed",
                shortcut: "Alt+Space",
            }
        );

        assert_eq!(
            desktop_control_primary_hotkey_released_payload(),
            DesktopControlHotkeyPayload {
                source: "global_hotkey",
                action: "released",
                shortcut: "Alt+Space",
            }
        );

        assert_eq!(
            desktop_control_fallback_hotkey_pressed_payload(),
            DesktopControlHotkeyPayload {
                source: "global_hotkey",
                action: "pressed",
                shortcut: "Ctrl+Shift+F9",
            }
        );

        assert_eq!(
            desktop_control_fallback_hotkey_released_payload(),
            DesktopControlHotkeyPayload {
                source: "global_hotkey",
                action: "released",
                shortcut: "Ctrl+Shift+F9",
            }
        );
    }
}
