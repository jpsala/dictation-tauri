mod companion_window;
mod desktop_control;
mod desktop_delivery;
mod dock_shell;
mod fixvox_cloud;
mod native_capture;
mod output_mute;
mod result_history;
mod runtime_transcription;
pub mod selection_capture;
mod selection_presets;
mod settings_window;
mod startup_launch;
mod startup_smoke;
mod tray;
mod user_preferences;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let startup_policy = startup_smoke::current();
            if startup_policy.hide_webviews {
                dock_shell::prepare_hidden_dock_for_startup_smoke();
                for label in ["main", "dock-companion", "preset-picker", "settings"] {
                    if let Some(window) = app.get_webview_window(label) {
                        window.hide()?;
                    }
                }
                eprintln!("[dictation-tauri][startup-smoke] hid configured WebViews");
            } else {
                dock_shell::configure_dock_window(app.handle())?;
                companion_window::configure_companion_window(app.handle());
                settings_window::configure_settings_window(app.handle());
            }

            if startup_policy.suppress_desktop_side_effects {
                eprintln!(
                    "[dictation-tauri][startup-smoke] suppressed tray, global hotkeys, low-level hooks, and foreground watcher"
                );
            } else {
                desktop_delivery::start_delivery_target_watcher();
                tray::configure_tray_and_background(app.handle())?;
                desktop_control::register_desktop_control_hotkey(app.handle())?;
            }
            Ok(())
        })
        .on_page_load(|window, _payload| {
            if startup_smoke::current().hide_webviews && window.label() == "main" {
                eprintln!("[dictation-tauri][startup-smoke] main WebView loaded");
            }
        })
        .invoke_handler(tauri::generate_handler![
            native_capture::start_native_microphone_capture,
            native_capture::get_native_microphone_capture_level,
            native_capture::stop_native_microphone_capture,
            native_capture::cancel_native_microphone_capture,
            runtime_transcription::get_runtime_transcription_readiness,
            runtime_transcription::prewarm_fixvox_managed_transcription,
            runtime_transcription::transcribe_captured_audio,
            runtime_transcription::transform_selected_text,
            runtime_transcription::run_assistant_chat,
            fixvox_cloud::get_fixvox_cloud_status,
            fixvox_cloud::get_fixvox_auth_session_status,
            fixvox_cloud::poll_fixvox_cloud_login,
            fixvox_cloud::register_fixvox_device,
            fixvox_cloud::refresh_fixvox_policy,
            fixvox_cloud::activate_fixvox_device,
            fixvox_cloud::start_fixvox_cloud_login,
            desktop_delivery::capture_desktop_delivery_target,
            desktop_delivery::get_cached_desktop_delivery_target,
            desktop_delivery::deliver_text_to_desktop_target,
            desktop_delivery::observe_desktop_paste,
            desktop_delivery::copy_text_to_clipboard,
            companion_window::show_companion,
            companion_window::hide_companion,
            companion_window::focus_companion,
            companion_window::show_preset_picker,
            companion_window::hide_preset_picker,
            companion_window::focus_preset_picker,
            dock_shell::update_dock_shell_state,
            dock_shell::get_dock_shell_position,
            dock_shell::move_dock_shell_position,
            dock_shell::save_dock_shell_position,
            dock_shell::show_dock,
            dock_shell::hide_dock,
            desktop_control::get_desktop_control_hotkey_config,
            desktop_control::preview_desktop_control_hotkey_registration,
            desktop_control::apply_desktop_control_hotkey_registration,
            desktop_control::get_desktop_control_action_hotkey_config,
            desktop_control::preview_desktop_control_action_hotkey_registration,
            desktop_control::apply_desktop_control_action_hotkey_registration,
            desktop_control::set_desktop_control_escape_cancel_enabled,
            desktop_control::set_desktop_control_hotkey_capture_enabled,
            desktop_control::set_desktop_control_hotkey_listener_ready,
            desktop_control::drain_desktop_control_hotkey_events,
            selection_capture::capture_selection_context,
            selection_capture::capture_selection_context_for_target,
            selection_presets::get_selection_presets_store,
            selection_presets::save_selection_presets_store,
            result_history::append_result_history_entry,
            result_history::list_result_history_entries,
            result_history::clear_result_history,
            settings_window::show_settings_window,
            startup_launch::get_startup_launch_config,
            startup_launch::set_startup_launch_enabled,
            user_preferences::get_user_preferences,
            user_preferences::set_user_preferences,
            tray::show_dock_context_menu,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
