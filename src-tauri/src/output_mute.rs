use serde::Serialize;
use tauri::{AppHandle, Runtime};

use crate::user_preferences::read_user_preferences_for_app;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputMuteEvidence {
    pub enabled: bool,
    pub attempted: bool,
    pub muted_by_app: bool,
    pub restored: bool,
    pub status: &'static str,
    pub reason: &'static str,
    pub redacted: bool,
}

#[cfg(windows)]
#[derive(Clone, Debug)]
struct EndpointMuteSnapshot {
    device_id: String,
    muted: bool,
}

#[derive(Clone, Debug)]
pub struct OutputMuteSession {
    evidence: OutputMuteEvidence,
    #[cfg(windows)]
    snapshots: Vec<EndpointMuteSnapshot>,
}

impl OutputMuteSession {
    pub fn restore(mut self) -> OutputMuteEvidence {
        if !self.evidence.muted_by_app {
            return self.evidence;
        }

        #[cfg(windows)]
        match windows_audio::restore_default_outputs(&self.snapshots) {
            Ok(()) => {
                self.evidence.restored = true;
                self.evidence.status = "restored";
                self.evidence.reason = "output_mute_restored";
            }
            Err(error) => {
                eprintln!("[dictation-tauri][output-mute] restore failed: {error}");
                self.evidence.status = "restore_failed";
                self.evidence.reason = "output_mute_restore_failed";
            }
        }

        #[cfg(not(windows))]
        {
            self.evidence.status = "restore_failed";
            self.evidence.reason = "platform_not_supported";
        }

        self.evidence
    }
}

pub fn begin_output_mute_for_capture<R: Runtime>(app: &AppHandle<R>) -> OutputMuteSession {
    let preferences = read_user_preferences_for_app(app);
    if !preferences.mute_output_during_recording {
        return skipped_session(false, false, "preference_disabled");
    }

    #[cfg(windows)]
    {
        match windows_audio::mute_default_outputs() {
            Ok(snapshots) => OutputMuteSession {
                evidence: OutputMuteEvidence {
                    enabled: true,
                    attempted: true,
                    muted_by_app: true,
                    restored: false,
                    status: "muted",
                    reason: "output_muted",
                    redacted: true,
                },
                snapshots,
            },
            Err(error) => {
                eprintln!("[dictation-tauri][output-mute] mute failed: {error}");
                skipped_session(true, true, "windows_output_mute_failed")
            }
        }
    }

    #[cfg(not(windows))]
    {
        skipped_session(true, true, "platform_not_supported")
    }
}

fn skipped_session(enabled: bool, attempted: bool, reason: &'static str) -> OutputMuteSession {
    OutputMuteSession {
        evidence: OutputMuteEvidence {
            enabled,
            attempted,
            muted_by_app: false,
            restored: false,
            status: "skipped",
            reason,
            redacted: true,
        },
        #[cfg(windows)]
        snapshots: Vec::new(),
    }
}

#[cfg(windows)]
mod windows_audio {
    use std::collections::HashSet;

    use windows::{
        core::HSTRING,
        Win32::{
            Foundation::RPC_E_CHANGED_MODE,
            Media::Audio::{
                eCommunications, eConsole, eMultimedia, eRender, Endpoints::IAudioEndpointVolume,
                IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator,
            },
            System::Com::{
                CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
                CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
            },
        },
    };

    use super::EndpointMuteSnapshot;

    struct ComApartment {
        uninitialize: bool,
    }

    impl ComApartment {
        fn initialize() -> Result<Self, String> {
            match unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.ok() {
                Ok(()) => Ok(Self { uninitialize: true }),
                Err(error) if error.code() == RPC_E_CHANGED_MODE => {
                    // Tauri may dispatch synchronous commands on its existing STA thread.
                    // COM is already usable there; only the requested apartment differs.
                    Ok(Self {
                        uninitialize: false,
                    })
                }
                Err(error) => Err(format!("CoreAudio COM initialization failed: {error}")),
            }
        }
    }

    impl Drop for ComApartment {
        fn drop(&mut self) {
            if self.uninitialize {
                unsafe { CoUninitialize() };
            }
        }
    }

    pub fn mute_default_outputs() -> Result<Vec<EndpointMuteSnapshot>, String> {
        let _apartment = ComApartment::initialize()?;
        let enumerator = create_enumerator()?;
        let mut seen_ids = HashSet::new();
        let mut endpoints = Vec::<(EndpointMuteSnapshot, IAudioEndpointVolume)>::new();

        for role in [eConsole, eMultimedia, eCommunications] {
            let Ok(device) = (unsafe { enumerator.GetDefaultAudioEndpoint(eRender, role) }) else {
                continue;
            };
            let device_id = read_device_id(&device)?;
            if !seen_ids.insert(device_id.clone()) {
                continue;
            }
            let volume: IAudioEndpointVolume = unsafe {
                device
                    .Activate(CLSCTX_INPROC_SERVER, None)
                    .map_err(|error| format!("CoreAudio endpoint activation failed: {error}"))?
            };
            let muted = unsafe {
                volume
                    .GetMute()
                    .map_err(|error| format!("CoreAudio mute state read failed: {error}"))?
                    .as_bool()
            };
            endpoints.push((EndpointMuteSnapshot { device_id, muted }, volume));
        }

        if endpoints.is_empty() {
            return Err("No active Windows output endpoint was available.".to_string());
        }

        for (_, volume) in &endpoints {
            if let Err(error) = unsafe { volume.SetMute(true, std::ptr::null()) } {
                for (snapshot, initialized_volume) in &endpoints {
                    let _ = unsafe { initialized_volume.SetMute(snapshot.muted, std::ptr::null()) };
                }
                return Err(format!("CoreAudio output mute failed: {error}"));
            }
        }

        Ok(endpoints
            .into_iter()
            .map(|(snapshot, _)| snapshot)
            .collect())
    }

    pub fn restore_default_outputs(snapshots: &[EndpointMuteSnapshot]) -> Result<(), String> {
        let _apartment = ComApartment::initialize()?;
        let enumerator = create_enumerator()?;
        let mut first_error = None;

        for snapshot in snapshots {
            let device_id = HSTRING::from(snapshot.device_id.as_str());
            let result = unsafe { enumerator.GetDevice(&device_id) }.and_then(|device| unsafe {
                let volume: IAudioEndpointVolume = device.Activate(CLSCTX_INPROC_SERVER, None)?;
                volume.SetMute(snapshot.muted, std::ptr::null())
            });
            if let Err(error) = result {
                first_error.get_or_insert_with(|| error.to_string());
            }
        }

        match first_error {
            Some(error) => Err(format!("CoreAudio output restore failed: {error}")),
            None => Ok(()),
        }
    }

    fn create_enumerator() -> Result<IMMDeviceEnumerator, String> {
        unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_INPROC_SERVER) }
            .map_err(|error| format!("CoreAudio device enumerator is unavailable: {error}"))
    }

    fn read_device_id(device: &IMMDevice) -> Result<String, String> {
        let raw = unsafe { device.GetId() }
            .map_err(|error| format!("CoreAudio endpoint id read failed: {error}"))?;
        let result = unsafe { raw.to_string() }
            .map_err(|error| format!("CoreAudio endpoint id conversion failed: {error}"));
        unsafe { CoTaskMemFree(Some(raw.0.cast())) };
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skipped_session_does_not_claim_restore() {
        let skipped = skipped_session(true, true, "backend_unavailable").restore();
        assert!(!skipped.restored);
        assert_eq!(skipped.status, "skipped");
    }
}
