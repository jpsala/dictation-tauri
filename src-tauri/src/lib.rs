mod desktop_control;
mod desktop_delivery;
mod dock_shell;
mod fixvox_cloud;
mod native_capture;
mod runtime_transcription;
pub mod selection_capture;
mod tray;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            dock_shell::configure_dock_window(app.handle())?;
            tray::configure_tray_and_background(app.handle())?;
            desktop_control::register_desktop_control_hotkey(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            native_capture::start_native_microphone_capture,
            native_capture::get_native_microphone_capture_level,
            native_capture::stop_native_microphone_capture,
            native_capture::cancel_native_microphone_capture,
            runtime_transcription::get_runtime_transcription_readiness,
            runtime_transcription::transcribe_captured_audio,
            desktop_delivery::capture_desktop_delivery_target,
            desktop_delivery::deliver_text_to_desktop_target,
            dock_shell::update_dock_shell_state,
            dock_shell::show_dock,
            dock_shell::hide_dock,
            desktop_control::get_desktop_control_hotkey_config,
            selection_capture::capture_selection_context,
            tray::show_dock_context_menu,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
