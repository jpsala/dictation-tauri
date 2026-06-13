mod native_capture;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            native_capture::start_native_microphone_capture,
            native_capture::stop_native_microphone_capture,
            native_capture::cancel_native_microphone_capture,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
