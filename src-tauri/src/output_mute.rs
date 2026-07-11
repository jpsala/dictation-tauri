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

#[derive(Clone, Debug)]
pub struct OutputMuteSession {
    evidence: OutputMuteEvidence,
}

impl OutputMuteSession {
    pub fn restore(mut self) -> OutputMuteEvidence {
        if self.evidence.muted_by_app {
            self.evidence.restored = true;
            self.evidence.status = "restored";
            self.evidence.reason = "output_mute_restored";
        }
        self.evidence
    }
}

pub fn begin_output_mute_for_capture<R: Runtime>(app: &AppHandle<R>) -> OutputMuteSession {
    let preferences = read_user_preferences_for_app(app);
    if !preferences.mute_output_during_recording {
        return OutputMuteSession {
            evidence: OutputMuteEvidence {
                enabled: false,
                attempted: false,
                muted_by_app: false,
                restored: false,
                status: "skipped",
                reason: "preference_disabled",
                redacted: true,
            },
        };
    }

    #[cfg(windows)]
    {
        // First safe host-owned slice: keep the state machine and restore guard in the
        // Tauri host, but fail closed until a native CoreAudio endpoint-volume backend
        // is added. This avoids pretending the speaker was muted when the OS state was
        // not changed.
        OutputMuteSession {
            evidence: OutputMuteEvidence {
                enabled: true,
                attempted: true,
                muted_by_app: false,
                restored: false,
                status: "skipped",
                reason: "windows_coreaudio_backend_pending",
                redacted: true,
            },
        }
    }

    #[cfg(not(windows))]
    {
        OutputMuteSession {
            evidence: OutputMuteEvidence {
                enabled: true,
                attempted: true,
                muted_by_app: false,
                restored: false,
                status: "skipped",
                reason: "platform_not_supported",
                redacted: true,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restore_marks_only_app_owned_mute_as_restored() {
        let skipped = OutputMuteSession {
            evidence: OutputMuteEvidence {
                enabled: true,
                attempted: true,
                muted_by_app: false,
                restored: false,
                status: "skipped",
                reason: "backend_pending",
                redacted: true,
            },
        }
        .restore();
        assert!(!skipped.restored);
        assert_eq!(skipped.status, "skipped");

        let restored = OutputMuteSession {
            evidence: OutputMuteEvidence {
                enabled: true,
                attempted: true,
                muted_by_app: true,
                restored: false,
                status: "muted",
                reason: "output_muted",
                redacted: true,
            },
        }
        .restore();
        assert!(restored.restored);
        assert_eq!(restored.status, "restored");
        assert_eq!(restored.reason, "output_mute_restored");
    }
}
