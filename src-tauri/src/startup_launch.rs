use serde::Serialize;

const RUN_KEY_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_VALUE_NAME: &str = "Fixvox Tauri";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupLaunchConfig {
    supported: bool,
    enabled: bool,
    launch_path: String,
    registered_command: Option<String>,
    value_name: String,
    reason: String,
}

#[tauri::command]
pub fn get_startup_launch_config() -> Result<StartupLaunchConfig, String> {
    read_startup_launch_config()
}

#[tauri::command]
pub fn set_startup_launch_enabled(enabled: bool) -> Result<StartupLaunchConfig, String> {
    set_startup_launch_enabled_internal(enabled)
}

#[cfg(windows)]
fn read_startup_launch_config() -> Result<StartupLaunchConfig, String> {
    let launch_path = current_exe_path()?;
    let registered_command = windows_run_key::read_value(RUN_VALUE_NAME)?;
    let enabled = registered_command
        .as_deref()
        .map(|command| command_targets_exe(command, &launch_path))
        .unwrap_or(false);
    let reason = match registered_command.as_deref() {
        Some(_) if enabled => "registered_current_exe",
        Some(_) => "registered_other_command",
        None => "not_registered",
    };

    Ok(StartupLaunchConfig {
        supported: true,
        enabled,
        launch_path,
        registered_command,
        value_name: RUN_VALUE_NAME.to_string(),
        reason: reason.to_string(),
    })
}

#[cfg(windows)]
fn set_startup_launch_enabled_internal(enabled: bool) -> Result<StartupLaunchConfig, String> {
    let launch_path = current_exe_path()?;
    if enabled {
        windows_run_key::write_value(RUN_VALUE_NAME, &quote_windows_arg(&launch_path))?;
    } else {
        windows_run_key::delete_value(RUN_VALUE_NAME)?;
    }

    read_startup_launch_config()
}

#[cfg(not(windows))]
fn read_startup_launch_config() -> Result<StartupLaunchConfig, String> {
    Ok(StartupLaunchConfig {
        supported: false,
        enabled: false,
        launch_path: String::new(),
        registered_command: None,
        value_name: RUN_VALUE_NAME.to_string(),
        reason: "unsupported_platform".to_string(),
    })
}

#[cfg(not(windows))]
fn set_startup_launch_enabled_internal(_enabled: bool) -> Result<StartupLaunchConfig, String> {
    read_startup_launch_config()
}

#[cfg(windows)]
fn current_exe_path() -> Result<String, String> {
    std::env::current_exe()
        .map_err(|error| format!("Unable to resolve current executable: {error}"))
        .map(|path| path.to_string_lossy().to_string())
}

fn quote_windows_arg(path: &str) -> String {
    format!("\"{}\"", path.replace('"', ""))
}

fn command_targets_exe(command: &str, launch_path: &str) -> bool {
    let command_target = first_windows_command_token(command);
    normalize_windows_path(&command_target) == normalize_windows_path(launch_path)
}

fn first_windows_command_token(command: &str) -> String {
    let trimmed = command.trim();
    if let Some(rest) = trimmed.strip_prefix('"') {
        if let Some(end_quote) = rest.find('"') {
            return rest[..end_quote].to_string();
        }
    }

    trimmed
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .trim_matches('"')
        .to_string()
}

fn normalize_windows_path(path: &str) -> String {
    path.trim()
        .trim_matches('"')
        .replace('/', "\\")
        .to_ascii_lowercase()
}

#[cfg(windows)]
mod windows_run_key {
    use super::RUN_KEY_PATH;
    use std::{mem, ptr};
    use windows_sys::Win32::{
        Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS},
        System::Registry::{
            RegCloseKey, RegCreateKeyW, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW,
            RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE, REG_SZ,
        },
    };

    pub fn read_value(value_name: &str) -> Result<Option<String>, String> {
        let key = open_run_key(KEY_READ)?;
        let name = wide_null(value_name);
        let mut value_type = 0;
        let mut byte_len = 0u32;
        let status = unsafe {
            RegQueryValueExW(
                key,
                name.as_ptr(),
                ptr::null_mut(),
                &mut value_type,
                ptr::null_mut(),
                &mut byte_len,
            )
        };

        if status == ERROR_FILE_NOT_FOUND {
            unsafe { RegCloseKey(key) };
            return Ok(None);
        }
        if status != ERROR_SUCCESS {
            unsafe { RegCloseKey(key) };
            return Err(format!(
                "Unable to read Windows startup value metadata: code {status}"
            ));
        }
        if value_type != REG_SZ || byte_len == 0 {
            unsafe { RegCloseKey(key) };
            return Ok(None);
        }

        let mut buffer = vec![0u16; (byte_len as usize + 1) / mem::size_of::<u16>()];
        let status = unsafe {
            RegQueryValueExW(
                key,
                name.as_ptr(),
                ptr::null_mut(),
                &mut value_type,
                buffer.as_mut_ptr().cast::<u8>(),
                &mut byte_len,
            )
        };
        unsafe { RegCloseKey(key) };
        if status != ERROR_SUCCESS {
            return Err(format!(
                "Unable to read Windows startup value: code {status}"
            ));
        }

        while buffer.last() == Some(&0) {
            buffer.pop();
        }
        Ok(Some(String::from_utf16_lossy(&buffer)))
    }

    pub fn write_value(value_name: &str, command: &str) -> Result<(), String> {
        let key = create_run_key()?;
        let name = wide_null(value_name);
        let data = wide_null(command);
        let byte_len = (data.len() * mem::size_of::<u16>()) as u32;
        let status = unsafe {
            RegSetValueExW(
                key,
                name.as_ptr(),
                0,
                REG_SZ,
                data.as_ptr().cast::<u8>(),
                byte_len,
            )
        };
        unsafe { RegCloseKey(key) };
        if status != ERROR_SUCCESS {
            return Err(format!(
                "Unable to write Windows startup value: code {status}"
            ));
        }
        Ok(())
    }

    pub fn delete_value(value_name: &str) -> Result<(), String> {
        let key = open_run_key(KEY_SET_VALUE)?;
        let name = wide_null(value_name);
        let status = unsafe { RegDeleteValueW(key, name.as_ptr()) };
        unsafe { RegCloseKey(key) };
        if status == ERROR_SUCCESS || status == ERROR_FILE_NOT_FOUND {
            return Ok(());
        }
        Err(format!(
            "Unable to delete Windows startup value: code {status}"
        ))
    }

    fn open_run_key(access: u32) -> Result<HKEY, String> {
        let path = wide_null(RUN_KEY_PATH);
        let mut key: HKEY = ptr::null_mut();
        let status =
            unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, path.as_ptr(), 0, access, &mut key) };
        if status != ERROR_SUCCESS {
            return Err(format!(
                "Unable to open Windows startup Run key: code {status}"
            ));
        }
        Ok(key)
    }

    fn create_run_key() -> Result<HKEY, String> {
        let path = wide_null(RUN_KEY_PATH);
        let mut key: HKEY = ptr::null_mut();
        let status = unsafe { RegCreateKeyW(HKEY_CURRENT_USER, path.as_ptr(), &mut key) };
        if status != ERROR_SUCCESS {
            return Err(format!(
                "Unable to create Windows startup Run key: code {status}"
            ));
        }
        Ok(key)
    }

    fn wide_null(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_windows_launch_path() {
        assert_eq!(
            quote_windows_arg("C:\\Users\\JP\\App Data\\Fixvox Tauri\\dictation-tauri.exe"),
            "\"C:\\Users\\JP\\App Data\\Fixvox Tauri\\dictation-tauri.exe\"",
        );
    }

    #[test]
    fn detects_registered_current_exe_with_or_without_args() {
        let exe = "C:\\Users\\JP\\AppData\\Local\\Fixvox Tauri\\dictation-tauri.exe";
        assert!(command_targets_exe(&quote_windows_arg(exe), exe));
        assert!(command_targets_exe(
            &format!("{} --ignored", quote_windows_arg(exe)),
            exe
        ));
        assert!(command_targets_exe(
            "\"C:/Users/JP/AppData/Local/Fixvox Tauri/dictation-tauri.exe\"",
            exe,
        ));
    }

    #[test]
    fn rejects_registered_other_exe() {
        assert!(!command_targets_exe(
            "\"C:\\Old\\Fixvox Tauri\\dictation-tauri.exe\"",
            "C:\\Users\\JP\\AppData\\Local\\Fixvox Tauri\\dictation-tauri.exe",
        ));
    }
}
