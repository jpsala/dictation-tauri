#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(not(test))]
fn main() {
    dictation_tauri_lib::run();
}

#[cfg(test)]
fn main() {}
