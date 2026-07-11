pub(crate) const STARTUP_SMOKE_ENV: &str = "DICTATION_TAURI_STARTUP_SMOKE";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct StartupPolicy {
    pub(crate) hide_webviews: bool,
    pub(crate) suppress_desktop_side_effects: bool,
}

pub(crate) fn current() -> StartupPolicy {
    StartupPolicy::from_env_value(std::env::var(STARTUP_SMOKE_ENV).ok())
}

impl StartupPolicy {
    fn from_env_value(value: Option<String>) -> Self {
        let enabled = matches!(value.as_deref(), Some("1" | "true" | "TRUE"));
        Self {
            hide_webviews: enabled,
            suppress_desktop_side_effects: enabled,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_smoke_policy_requires_explicit_opt_in() {
        assert_eq!(
            StartupPolicy::from_env_value(None),
            StartupPolicy {
                hide_webviews: false,
                suppress_desktop_side_effects: false,
            }
        );
        assert!(StartupPolicy::from_env_value(Some("1".into())).hide_webviews);
        assert!(StartupPolicy::from_env_value(Some("true".into())).suppress_desktop_side_effects);
        assert!(!StartupPolicy::from_env_value(Some("yes".into())).hide_webviews);
    }
}
