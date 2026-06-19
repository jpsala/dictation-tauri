mod native_capture;
mod runtime_transcription;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            native_capture::start_native_microphone_capture,
            native_capture::stop_native_microphone_capture,
            native_capture::cancel_native_microphone_capture,
            runtime_transcription::get_runtime_transcription_readiness,
            runtime_transcription::transcribe_captured_audio,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
