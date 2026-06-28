mod companion_window;
mod desktop_control;
mod desktop_delivery;
mod dock_shell;
mod fixvox_cloud;
mod native_capture;
mod result_history;
mod runtime_transcription;
pub mod selection_capture;
mod settings_window;
mod tray;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            desktop_delivery::start_delivery_target_watcher();
            dock_shell::configure_dock_window(app.handle())?;
            companion_window::configure_companion_window(app.handle());
            settings_window::configure_settings_window(app.handle());
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
            fixvox_cloud::get_fixvox_cloud_status,
            fixvox_cloud::register_fixvox_device,
            fixvox_cloud::refresh_fixvox_policy,
            fixvox_cloud::activate_fixvox_device,
            desktop_delivery::capture_desktop_delivery_target,
            desktop_delivery::get_cached_desktop_delivery_target,
            desktop_delivery::deliver_text_to_desktop_target,
            desktop_delivery::observe_desktop_paste,
            companion_window::show_companion,
            companion_window::hide_companion,
            dock_shell::update_dock_shell_state,
            dock_shell::get_dock_shell_position,
            dock_shell::move_dock_shell_position,
            dock_shell::save_dock_shell_position,
            dock_shell::show_dock,
            dock_shell::hide_dock,
            desktop_control::get_desktop_control_hotkey_config,
            desktop_control::preview_desktop_control_hotkey_registration,
            desktop_control::apply_desktop_control_hotkey_registration,
            desktop_control::set_desktop_control_escape_cancel_enabled,
            desktop_control::set_desktop_control_hotkey_capture_enabled,
            desktop_control::set_desktop_control_hotkey_listener_ready,
            desktop_control::drain_desktop_control_hotkey_events,
            selection_capture::capture_selection_context,
            result_history::append_result_history_entry,
            result_history::list_result_history_entries,
            result_history::clear_result_history,
            settings_window::show_settings_window,
            tray::show_dock_context_menu,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
