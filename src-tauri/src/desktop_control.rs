use serde::Serialize;
use tauri_plugin_global_shortcut::{Code, Modifiers};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum HotkeyBackend {
    TauriGlobalShortcut,
    WindowsLowLevelHook,
}

pub const DEFAULT_DESKTOP_CONTROL_HOTKEY: &str = "Alt+Space";
pub const FALLBACK_DESKTOP_CONTROL_HOTKEY: &str = "Ctrl+Shift+F9";
pub const ALT_SPACE_DESKTOP_CONTROL_HOTKEY: &str = "Alt+Space";
pub const DESKTOP_CONTROL_HOTKEY_EVENT: &str = "desktop-control://global-hotkey";
pub const DICTATION_KEY_ENV: &str = "DICTATION_TAURI_DICTATION_KEY";
pub const ALT_SPACE_GATE_ENV: &str = "DICTATION_TAURI_ALLOW_ALT_SPACE";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct EffectiveDictationHotkey {
    pub shortcut: &'static str,
    pub modifiers: Modifiers,
    pub code: Code,
    pub backend: HotkeyBackend,
    pub requested_shortcut: Option<&'static str>,
    pub alt_space_requested: bool,
    pub alt_space_enabled: bool,
    pub fallback_reason: Option<&'static str>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopControlHotkeyConfig {
    pub shortcut: &'static str,
    pub default_shortcut: &'static str,
    pub requested_shortcut: Option<&'static str>,
    pub alt_space_requested: bool,
    pub alt_space_enabled: bool,
    pub backend: HotkeyBackend,
    pub fallback_reason: Option<&'static str>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopControlHotkeyPayload {
    pub source: &'static str,
    pub action: &'static str,
    pub shortcut: &'static str,
}

#[tauri::command]
pub fn get_desktop_control_hotkey_config() -> DesktopControlHotkeyConfig {
    desktop_control_hotkey_config_from_env()
}

#[tauri::command]
pub fn set_desktop_control_escape_cancel_enabled(enabled: bool) -> bool {
    native_escape_cancel::set_escape_cancel_enabled(enabled)
}

pub fn desktop_control_hotkey_config_from_env() -> DesktopControlHotkeyConfig {
    desktop_control_hotkey_config(resolve_effective_dictation_hotkey_from_env())
}

pub fn desktop_control_hotkey_config(
    hotkey: EffectiveDictationHotkey,
) -> DesktopControlHotkeyConfig {
    DesktopControlHotkeyConfig {
        shortcut: hotkey.shortcut,
        default_shortcut: DEFAULT_DESKTOP_CONTROL_HOTKEY,
        requested_shortcut: hotkey.requested_shortcut,
        alt_space_requested: hotkey.alt_space_requested,
        alt_space_enabled: hotkey.alt_space_enabled,
        backend: hotkey.backend,
        fallback_reason: hotkey.fallback_reason,
    }
}

pub fn resolve_effective_dictation_hotkey_from_env() -> EffectiveDictationHotkey {
    let requested = std::env::var(DICTATION_KEY_ENV).ok();
    let alt_space_allowed = std::env::var(ALT_SPACE_GATE_ENV)
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false);

    resolve_effective_dictation_hotkey(requested.as_deref(), alt_space_allowed)
}

pub fn resolve_effective_dictation_hotkey(
    requested: Option<&str>,
    alt_space_allowed: bool,
) -> EffectiveDictationHotkey {
    match requested.map(normalize_shortcut).as_deref() {
        None | Some("") if cfg!(windows) => alt_space_hotkey(None),
        None | Some("") => fallback_hotkey(None),
        Some("ctrl+shift+f9") => fallback_hotkey(Some(FALLBACK_DESKTOP_CONTROL_HOTKEY)),
        Some("alt+space") if alt_space_allowed && cfg!(windows) => {
            alt_space_hotkey(Some(ALT_SPACE_DESKTOP_CONTROL_HOTKEY))
        }
        Some("alt+space") if alt_space_allowed => EffectiveDictationHotkey {
            requested_shortcut: Some(ALT_SPACE_DESKTOP_CONTROL_HOTKEY),
            alt_space_requested: true,
            alt_space_enabled: false,
            fallback_reason: Some("alt_space_native_hook_windows_only"),
            ..fallback_hotkey(None)
        },
        Some("alt+space") => EffectiveDictationHotkey {
            requested_shortcut: Some(ALT_SPACE_DESKTOP_CONTROL_HOTKEY),
            alt_space_requested: true,
            alt_space_enabled: false,
            fallback_reason: Some("alt_space_requires_explicit_gate"),
            ..fallback_hotkey(None)
        },
        Some(_) => EffectiveDictationHotkey {
            requested_shortcut: Some("unsupported"),
            fallback_reason: Some("unsupported_shortcut"),
            ..fallback_hotkey(None)
        },
    }
}

fn fallback_hotkey(requested_shortcut: Option<&'static str>) -> EffectiveDictationHotkey {
    EffectiveDictationHotkey {
        shortcut: FALLBACK_DESKTOP_CONTROL_HOTKEY,
        modifiers: Modifiers::CONTROL | Modifiers::SHIFT,
        code: Code::F9,
        backend: HotkeyBackend::TauriGlobalShortcut,
        requested_shortcut,
        alt_space_requested: false,
        alt_space_enabled: false,
        fallback_reason: None,
    }
}

fn alt_space_hotkey(requested_shortcut: Option<&'static str>) -> EffectiveDictationHotkey {
    EffectiveDictationHotkey {
        shortcut: ALT_SPACE_DESKTOP_CONTROL_HOTKEY,
        modifiers: Modifiers::ALT,
        code: Code::Space,
        backend: HotkeyBackend::WindowsLowLevelHook,
        requested_shortcut,
        alt_space_requested: true,
        alt_space_enabled: true,
        fallback_reason: None,
    }
}

fn normalize_shortcut(value: &str) -> String {
    value
        .split('+')
        .map(|part| part.trim().to_ascii_lowercase())
        .collect::<Vec<_>>()
        .join("+")
}

pub fn desktop_control_hotkey_pressed_payload(
    hotkey: EffectiveDictationHotkey,
) -> DesktopControlHotkeyPayload {
    desktop_control_hotkey_payload("pressed", hotkey)
}

pub fn desktop_control_hotkey_released_payload(
    hotkey: EffectiveDictationHotkey,
) -> DesktopControlHotkeyPayload {
    desktop_control_hotkey_payload("released", hotkey)
}

pub fn desktop_control_escape_cancel_payload() -> DesktopControlHotkeyPayload {
    DesktopControlHotkeyPayload {
        source: "global_hotkey",
        action: "cancel",
        shortcut: "Escape",
    }
}

fn desktop_control_hotkey_payload(
    action: &'static str,
    hotkey: EffectiveDictationHotkey,
) -> DesktopControlHotkeyPayload {
    DesktopControlHotkeyPayload {
        source: "global_hotkey",
        action,
        shortcut: hotkey.shortcut,
    }
}

#[cfg(desktop)]
pub fn register_desktop_control_hotkey<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::Emitter;
    use tauri_plugin_global_shortcut::ShortcutState;

    let hotkey = resolve_effective_dictation_hotkey_from_env();
    native_escape_cancel::register_escape_cancel_hook(app)?;

    if hotkey.backend == HotkeyBackend::WindowsLowLevelHook {
        return native_alt_space::register_alt_space_hook(app, hotkey);
    }

    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_shortcuts([hotkey.shortcut])?
            .with_handler(move |app, shortcut, event| {
                if !shortcut.matches(hotkey.modifiers, hotkey.code) {
                    return;
                }

                let payload = if event.state == ShortcutState::Pressed {
                    Some(desktop_control_hotkey_pressed_payload(hotkey))
                } else if event.state == ShortcutState::Released {
                    Some(desktop_control_hotkey_released_payload(hotkey))
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

#[cfg(windows)]
mod native_escape_cancel {
    use super::{desktop_control_escape_cancel_payload, DESKTOP_CONTROL_HOTKEY_EVENT};
    use std::error::Error;
    use std::ptr::null_mut;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{mpsc, Mutex, OnceLock};
    use tauri::Emitter;
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::VK_ESCAPE;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, SetWindowsHookExW, HC_ACTION, KBDLLHOOKSTRUCT, MSG,
        WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    static EVENT_SENDER: OnceLock<Mutex<Option<mpsc::Sender<()>>>> = OnceLock::new();
    static ESCAPE_CANCEL_ENABLED: AtomicBool = AtomicBool::new(false);
    static ESCAPE_DOWN: AtomicBool = AtomicBool::new(false);

    pub fn set_escape_cancel_enabled(enabled: bool) -> bool {
        ESCAPE_CANCEL_ENABLED.store(enabled, Ordering::SeqCst);
        if !enabled {
            ESCAPE_DOWN.store(false, Ordering::SeqCst);
        }
        enabled
    }

    pub fn register_escape_cancel_hook<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
    ) -> Result<(), Box<dyn Error>> {
        let (tx, rx) = mpsc::channel::<()>();
        let sender = EVENT_SENDER.get_or_init(|| Mutex::new(None));
        *sender
            .lock()
            .map_err(|_| "escape cancel hook sender poisoned")? = Some(tx);

        let app_handle = app.clone();
        std::thread::spawn(move || {
            while rx.recv().is_ok() {
                let _ = app_handle.emit(
                    DESKTOP_CONTROL_HOTKEY_EVENT,
                    desktop_control_escape_cancel_payload(),
                );
            }
        });

        std::thread::spawn(move || unsafe {
            let module = GetModuleHandleW(null_mut());
            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), module, 0);
            if hook.is_null() {
                return;
            }

            let mut message: MSG = std::mem::zeroed();
            while GetMessageW(&mut message, null_mut(), 0, 0) > 0 {}
        });

        Ok(())
    }

    unsafe extern "system" fn keyboard_proc(
        code: i32,
        w_param: WPARAM,
        l_param: LPARAM,
    ) -> LRESULT {
        if code == HC_ACTION as i32 {
            let event = w_param as u32;
            let is_down = event == WM_KEYDOWN || event == WM_SYSKEYDOWN;
            let is_up = event == WM_KEYUP || event == WM_SYSKEYUP;
            let keyboard = &*(l_param as *const KBDLLHOOKSTRUCT);
            let is_escape = keyboard.vkCode == VK_ESCAPE as u32;
            let enabled = ESCAPE_CANCEL_ENABLED.load(Ordering::SeqCst);

            if is_escape && is_down && enabled {
                if !ESCAPE_DOWN.swap(true, Ordering::SeqCst) {
                    send_event();
                }
                return 1;
            }

            if is_escape && is_up && ESCAPE_DOWN.swap(false, Ordering::SeqCst) && enabled {
                return 1;
            }
        }

        CallNextHookEx(null_mut(), code, w_param, l_param)
    }

    fn send_event() {
        if let Some(lock) = EVENT_SENDER.get() {
            if let Ok(guard) = lock.lock() {
                if let Some(sender) = guard.as_ref() {
                    let _ = sender.send(());
                }
            }
        }
    }
}

#[cfg(not(windows))]
mod native_escape_cancel {
    use std::error::Error;

    pub fn set_escape_cancel_enabled(enabled: bool) -> bool {
        enabled
    }

    pub fn register_escape_cancel_hook<R: tauri::Runtime>(
        _app: &tauri::AppHandle<R>,
    ) -> Result<(), Box<dyn Error>> {
        Ok(())
    }
}

#[cfg(windows)]
mod native_alt_space {
    use super::{
        desktop_control_hotkey_pressed_payload, desktop_control_hotkey_released_payload,
        EffectiveDictationHotkey, DESKTOP_CONTROL_HOTKEY_EVENT,
    };
    use std::error::Error;
    use std::ptr::null_mut;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{mpsc, Mutex, OnceLock};
    use tauri::Emitter;
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        keybd_event, GetAsyncKeyState, KEYEVENTF_KEYUP, VK_MENU, VK_SPACE,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, SetWindowsHookExW, HC_ACTION, KBDLLHOOKSTRUCT, MSG,
        WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    #[derive(Clone, Copy, Debug)]
    enum NativeAltSpaceEvent {
        Pressed,
        Released,
    }

    static EVENT_SENDER: OnceLock<Mutex<Option<mpsc::Sender<NativeAltSpaceEvent>>>> =
        OnceLock::new();
    static SPACE_DOWN: AtomicBool = AtomicBool::new(false);

    pub fn register_alt_space_hook<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
        hotkey: EffectiveDictationHotkey,
    ) -> Result<(), Box<dyn Error>> {
        let (tx, rx) = mpsc::channel::<NativeAltSpaceEvent>();
        let sender = EVENT_SENDER.get_or_init(|| Mutex::new(None));
        *sender
            .lock()
            .map_err(|_| "alt-space hook sender poisoned")? = Some(tx);

        let app_handle = app.clone();
        std::thread::spawn(move || {
            while let Ok(event) = rx.recv() {
                let payload = match event {
                    NativeAltSpaceEvent::Pressed => desktop_control_hotkey_pressed_payload(hotkey),
                    NativeAltSpaceEvent::Released => {
                        desktop_control_hotkey_released_payload(hotkey)
                    }
                };
                let _ = app_handle.emit(DESKTOP_CONTROL_HOTKEY_EVENT, payload);
            }
        });

        std::thread::spawn(move || unsafe {
            let module = GetModuleHandleW(null_mut());
            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), module, 0);
            if hook.is_null() {
                return;
            }

            let mut message: MSG = std::mem::zeroed();
            while GetMessageW(&mut message, null_mut(), 0, 0) > 0 {}
        });

        Ok(())
    }

    unsafe extern "system" fn keyboard_proc(
        code: i32,
        w_param: WPARAM,
        l_param: LPARAM,
    ) -> LRESULT {
        if code == HC_ACTION as i32 {
            let event = w_param as u32;
            let is_down = event == WM_KEYDOWN || event == WM_SYSKEYDOWN;
            let is_up = event == WM_KEYUP || event == WM_SYSKEYUP;
            let keyboard = &*(l_param as *const KBDLLHOOKSTRUCT);
            let is_space = keyboard.vkCode == VK_SPACE as u32;
            let alt_down = (GetAsyncKeyState(VK_MENU as i32) & 0x8000u16 as i16) != 0;

            if is_space && alt_down && is_down {
                if !SPACE_DOWN.swap(true, Ordering::SeqCst) {
                    send_event(NativeAltSpaceEvent::Pressed);
                }
                return 1;
            }

            if is_space && is_up && SPACE_DOWN.swap(false, Ordering::SeqCst) {
                send_event(NativeAltSpaceEvent::Released);
                synthesize_alt_up();
                return 1;
            }
        }

        CallNextHookEx(null_mut(), code, w_param, l_param)
    }

    fn send_event(event: NativeAltSpaceEvent) {
        if let Some(lock) = EVENT_SENDER.get() {
            if let Ok(guard) = lock.lock() {
                if let Some(sender) = guard.as_ref() {
                    let _ = sender.send(event);
                }
            }
        }
    }

    fn synthesize_alt_up() {
        unsafe {
            keybd_event(VK_MENU as u8, 0, KEYEVENTF_KEYUP, 0);
        }
    }
}

#[cfg(not(windows))]
mod native_alt_space {
    use super::EffectiveDictationHotkey;
    use std::error::Error;

    pub fn register_alt_space_hook<R: tauri::Runtime>(
        _app: &tauri::AppHandle<R>,
        _hotkey: EffectiveDictationHotkey,
    ) -> Result<(), Box<dyn Error>> {
        Err("Alt+Space native hook is only available on Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_alt_space_on_windows() {
        let hotkey = resolve_effective_dictation_hotkey(None, false);

        assert_eq!(hotkey.shortcut, DEFAULT_DESKTOP_CONTROL_HOTKEY);
        assert_eq!(hotkey.modifiers, Modifiers::ALT);
        assert_eq!(hotkey.code, Code::Space);
        assert_eq!(hotkey.backend, HotkeyBackend::WindowsLowLevelHook);
        assert!(hotkey.alt_space_enabled);
        assert_eq!(hotkey.fallback_reason, None);
    }

    #[test]
    fn keeps_ctrl_shift_f9_as_explicit_fallback() {
        let hotkey = resolve_effective_dictation_hotkey(Some("Ctrl+Shift+F9"), false);

        assert_eq!(hotkey.shortcut, FALLBACK_DESKTOP_CONTROL_HOTKEY);
        assert_eq!(hotkey.modifiers, Modifiers::CONTROL | Modifiers::SHIFT);
        assert_eq!(hotkey.code, Code::F9);
        assert_eq!(hotkey.backend, HotkeyBackend::TauriGlobalShortcut);
    }

    #[test]
    fn gates_alt_space_behind_explicit_allow_flag() {
        let blocked = resolve_effective_dictation_hotkey(Some("Alt+Space"), false);
        assert_eq!(blocked.shortcut, FALLBACK_DESKTOP_CONTROL_HOTKEY);
        assert!(blocked.alt_space_requested);
        assert!(!blocked.alt_space_enabled);
        assert_eq!(
            blocked.fallback_reason,
            Some("alt_space_requires_explicit_gate")
        );

        let enabled = resolve_effective_dictation_hotkey(Some("Alt+Space"), true);
        assert_eq!(enabled.shortcut, ALT_SPACE_DESKTOP_CONTROL_HOTKEY);
        assert_eq!(enabled.modifiers, Modifiers::ALT);
        assert_eq!(enabled.code, Code::Space);
        assert_eq!(enabled.backend, HotkeyBackend::WindowsLowLevelHook);
        assert!(enabled.alt_space_enabled);
        assert_eq!(enabled.fallback_reason, None);
    }

    #[test]
    fn payload_uses_effective_shortcut() {
        let hotkey = resolve_effective_dictation_hotkey(Some("Alt+Space"), true);

        assert_eq!(
            desktop_control_hotkey_pressed_payload(hotkey),
            DesktopControlHotkeyPayload {
                source: "global_hotkey",
                action: "pressed",
                shortcut: "Alt+Space",
            }
        );

        assert_eq!(
            desktop_control_hotkey_released_payload(fallback_hotkey(None)),
            DesktopControlHotkeyPayload {
                source: "global_hotkey",
                action: "released",
                shortcut: "Ctrl+Shift+F9",
            }
        );
    }

    #[test]
    fn escape_cancel_payload_uses_existing_hotkey_event_channel() {
        assert_eq!(
            desktop_control_escape_cancel_payload(),
            DesktopControlHotkeyPayload {
                source: "global_hotkey",
                action: "cancel",
                shortcut: "Escape",
            }
        );
    }
}
