mod companion_window;
mod desktop_control;
mod desktop_delivery;
mod dictation_experiments;
mod dictation_lab;
mod dictation_lab_jobs;
mod dock_shell;
mod fixvox_cloud;
mod native_capture;
mod output_mute;
mod personal_vocabulary_cache;
mod result_history;
mod runtime_transcription;
pub mod selection_capture;
mod selection_presets;
mod settings_window;
mod sound_cues;
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
                for label in ["main", "dock-companion", "preset-picker", "settings", "dictation-lab"] {
                    if let Some(window) = app.get_webview_window(label) {
                        window.hide()?;
                    }
                }
                eprintln!("[dictation-tauri][startup-smoke] hid configured WebViews");
            } else {
                dock_shell::configure_dock_window(app.handle())?;
                companion_window::configure_companion_window(app.handle());
                settings_window::configure_settings_window(app.handle());
                if std::env::var_os("DICTATION_LAB_SMOKE_OFFLINE").is_some() {
                    eprintln!(
                        "[dictation-tauri][laboratory-smoke] offline mode selected; cloud/provider effects remain disabled"
                    );
                }
                if std::env::var_os("DICTATION_LAB_SMOKE_AUTO_SHOW").is_some() {
                    settings_window::show_dictation_lab_window_for_app(app.handle())?;
                }
                if std::env::var_os("DICTATION_LAB_SMOKE_REPLAY").is_some() {
                    tauri::async_runtime::spawn(async {
                        match dictation_lab_jobs::start_provider_free_smoke_job().await {
                            Ok(snapshot) => eprintln!(
                                "[dictation-tauri][laboratory-smoke] provider-free replay started: {}",
                                snapshot.job_id
                            ),
                            Err(error) => eprintln!(
                                "[dictation-tauri][laboratory-smoke] provider-free replay failed: {}",
                                error.code
                            ),
                        }
                    });
                }
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
            dictation_experiments::get_dictation_experiment_state,
            dictation_experiments::set_dictation_experiment_selection,
            dictation_lab_jobs::estimate_dictation_lab_experiment,
            dictation_lab_jobs::get_dictation_lab_local_plan,
            dictation_lab_jobs::list_dictation_lab_gate_sources,
            dictation_lab_jobs::plan_dictation_lab_metadata_experiment,
            dictation_lab_jobs::recover_dictation_lab_gate_a_completion,
            dictation_lab_jobs::abort_dictation_lab_execution,
            dictation_lab_jobs::start_dictation_lab_job,
            dictation_lab_jobs::get_dictation_lab_job,
            dictation_lab_jobs::cancel_dictation_lab_job,
            dictation_lab::get_dictation_lab_catalog,
            dictation_lab::request_dictation_lab_execution_grant,
            dictation_lab::capture_dictation_lab_vocabulary_snapshot,
            dictation_lab::list_dictation_lab_vocabulary_snapshots,
            dictation_lab::resolve_dictation_lab_vocabulary_snapshot,
            dictation_lab::request_dictation_lab,
            dictation_lab::list_dictation_lab_artifacts,
            dictation_lab::load_dictation_lab_run,
            dictation_lab::load_dictation_lab_sample,
            dictation_lab::read_dictation_lab_private_text,
            dictation_lab::resolve_dictation_lab_audio,
            dictation_lab::record_dictation_lab_verdict,
            runtime_transcription::prewarm_fixvox_managed_transcription,
            runtime_transcription::transcribe_captured_audio,
            runtime_transcription::transform_selected_text,
            runtime_transcription::run_assistant_chat,
            fixvox_cloud::get_fixvox_cloud_status,
            fixvox_cloud::get_fixvox_setup_readiness,
            fixvox_cloud::get_fixvox_auth_session_status,
            fixvox_cloud::poll_fixvox_cloud_login,
            fixvox_cloud::register_fixvox_device,
            fixvox_cloud::refresh_fixvox_policy,
            fixvox_cloud::refresh_fixvox_personal_vocabulary,
            fixvox_cloud::get_fixvox_personal_vocabulary_snapshot,
            fixvox_cloud::create_fixvox_personal_vocabulary_rule,
            fixvox_cloud::update_fixvox_personal_vocabulary_rule,
            fixvox_cloud::delete_fixvox_personal_vocabulary_rule,
            fixvox_cloud::activate_fixvox_device,
            fixvox_cloud::start_fixvox_cloud_login,
            desktop_delivery::capture_desktop_delivery_target,
            desktop_delivery::get_cached_desktop_delivery_target,
            desktop_delivery::deliver_text_to_desktop_target,
            desktop_delivery::replace_captured_selection_if_unchanged,
            desktop_delivery::observe_desktop_paste,
            desktop_delivery::copy_text_to_clipboard,
            companion_window::show_companion,
            companion_window::hide_companion,
            companion_window::focus_companion,
            companion_window::show_preset_picker,
            companion_window::hide_preset_picker,
            companion_window::focus_preset_picker,
            companion_window::get_preset_picker_window_state,
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
            desktop_control::set_desktop_control_host_command_listener_ready,
            desktop_control::drain_desktop_control_host_commands,
            selection_capture::capture_selection_context,
            selection_capture::capture_selection_context_for_target,
            selection_capture::capture_selection_context_for_target_with_clipboard,
            selection_presets::get_selection_presets_store,
            selection_presets::save_selection_presets_store,
            result_history::append_result_history_entry,
            result_history::list_result_history_entries,
            result_history::clear_result_history,
            settings_window::show_settings_window,
            settings_window::show_account_setup_window,
            settings_window::show_dictation_lab_window,
            settings_window::show_admin_control_room,
            sound_cues::play_dictation_sound_cue,
            startup_launch::get_startup_launch_config,
            startup_launch::set_startup_launch_enabled,
            dictation_experiments::get_dictation_mode_catalog,
            user_preferences::get_user_preferences,
            user_preferences::set_user_preferences,
            tray::show_dock_context_menu,
            tray::sync_host_preset_menu_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
