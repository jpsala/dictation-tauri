#[path = "../src/fixvox_cloud.rs"]
mod fixvox_cloud;

use fixvox_cloud::*;
use serde::Deserialize;
use std::cell::RefCell;
use std::time::{SystemTime, UNIX_EPOCH};

fn fixture<T: for<'de> Deserialize<'de>>(json: &str) -> T {
    serde_json::from_str(json).expect("contract fixture should parse")
}

fn unique_temp_state_path(test_name: &str) -> std::path::PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("test clock should be after epoch")
        .as_nanos();
    std::env::temp_dir()
        .join("dictation-tauri-tests")
        .join(format!("{test_name}-{suffix}.json"))
}

struct FakeRegisterClient {
    endpoint: RefCell<Option<String>>,
    body: RefCell<Option<serde_json::Value>>,
    response: serde_json::Value,
}

impl DeviceRegisterHttpClient for FakeRegisterClient {
    fn post_json(
        &self,
        endpoint: &str,
        body: serde_json::Value,
    ) -> Result<serde_json::Value, FixvoxCloudError> {
        self.endpoint.replace(Some(endpoint.to_string()));
        self.body.replace(Some(body));
        Ok(self.response.clone())
    }
}

impl PreflightHttpClient for FakeRegisterClient {
    fn post_json(
        &self,
        endpoint: &str,
        body: serde_json::Value,
    ) -> Result<serde_json::Value, FixvoxCloudError> {
        self.endpoint.replace(Some(endpoint.to_string()));
        self.body.replace(Some(body));
        Ok(self.response.clone())
    }
}

#[test]
fn parses_fixvox_contract_fixtures_without_network() {
    let register: DeviceRegisterResponseFixture = fixture(include_str!(
        "../../specs/009-fixvox-cloud-runtime-port/fixtures/register.response.json"
    ));
    assert!(register.ok);
    assert!(register.activated);
    assert_eq!(register.policy_id, "alpha-basic");
    assert_eq!(register.auth["required"], false);
    assert!(register.transport_policy["mode"].is_string());

    let preflight: PreflightResponseFixture = fixture(include_str!(
        "../../specs/009-fixvox-cloud-runtime-port/fixtures/preflight.response.json"
    ));
    assert!(preflight.ok);
    assert!(preflight.allowed);
    assert_eq!(preflight.mode, "managed");
    assert_eq!(preflight.usage_kind, "transcription");

    let stt: SttResponseFixture = fixture(include_str!(
        "../../specs/009-fixvox-cloud-runtime-port/fixtures/stt.response.json"
    ));
    assert_eq!(stt.text, "fixture managed transcript");
    assert_eq!(stt.model, "whisper-large-v3");

    let chat: ChatCompletionResponseFixture = fixture(include_str!(
        "../../specs/009-fixvox-cloud-runtime-port/fixtures/chat.response.json"
    ));
    assert_eq!(chat.model, "openai/gpt-oss-120b");
    assert_eq!(
        chat.choices[0].message.content,
        "fixture cleaned transcript"
    );
}

#[test]
fn resolves_backend_url_with_safe_default_and_rejects_stale_fixvox_api() {
    let configured = resolve_backend_base_url(&|key| match key {
        "FIXVOX_BACKEND_URL" => Some(" https://custom-fixvox.example/ ".to_string()),
        _ => None,
    })
    .expect("explicit backend URL should resolve");
    assert_eq!(configured, "https://custom-fixvox.example");

    let default = resolve_backend_base_url(&|_key| None)
        .expect("missing backend env should use current safe default");
    assert_eq!(default, PREFERRED_FIXVOX_BACKEND_URL);
    assert_ne!(default, STALE_FIXVOX_BACKEND_URL);

    let stale = resolve_backend_base_url(&|key| match key {
        "FIXVOX_API_BASE_URL" => Some(STALE_FIXVOX_BACKEND_URL.to_string()),
        _ => None,
    })
    .expect_err("stale fixvox-api.jpsala.dev must be rejected explicitly");
    assert_eq!(stale.code, "FIXVOX_BACKEND_URL_STALE");
}

#[test]
fn resolves_cloud_runtime_config_with_install_and_device_ids() {
    let config = resolve_cloud_runtime_config(&|key| match key {
        "FIXVOX_BACKEND_URL" => Some("https://custom-fixvox.example/".to_string()),
        "FIXVOX_INSTALL_ID" => Some(" install_test_123 ".to_string()),
        "FIXVOX_DEVICE_ID" => Some(" dev_test_456 ".to_string()),
        _ => None,
    })
    .expect("runtime config should resolve from env seam");

    assert_eq!(config.backend_base_url, "https://custom-fixvox.example");
    assert_eq!(config.install_id, "install_test_123");
    assert_eq!(config.device_id.as_deref(), Some("dev_test_456"));
}

#[test]
fn builds_device_register_request_contract_shape() {
    let request = build_device_register_request(DeviceRegisterInput {
        install_id: "install_test_123".to_string(),
        device_id: None,
        version: "0.1.0".to_string(),
        platform: "windows".to_string(),
        arch: "x86_64".to_string(),
        hostname: "redacted-host".to_string(),
        ts: "2026-06-20T22:00:00Z".to_string(),
    })
    .expect("device register request should be constructable without network");

    let value = serde_json::to_value(request).expect("register request should serialize");
    assert_eq!(value["installId"], "install_test_123");
    assert_eq!(value["deviceId"], serde_json::Value::Null);
    assert_eq!(value["version"], "0.1.0");
    assert_eq!(value["platform"], "windows");
    assert_eq!(value["arch"], "x86_64");
    assert_eq!(value["hostname"], "redacted-host");
    assert_eq!(value["ts"], "2026-06-20T22:00:00Z");
}

#[test]
fn registers_device_through_injected_client_without_network() {
    let client = FakeRegisterClient {
        endpoint: RefCell::new(None),
        body: RefCell::new(None),
        response: fixture(include_str!(
            "../../specs/009-fixvox-cloud-runtime-port/fixtures/register.response.json"
        )),
    };
    let config = FixvoxCloudRuntimeConfig {
        backend_base_url: PREFERRED_FIXVOX_BACKEND_URL.to_string(),
        install_id: "install_test_123".to_string(),
        device_id: None,
    };

    let snapshot = register_device_with_client(
        &client,
        &config,
        DeviceRegisterInput {
            install_id: config.install_id.clone(),
            device_id: config.device_id.clone(),
            version: "0.1.0".to_string(),
            platform: "windows".to_string(),
            arch: "x86_64".to_string(),
            hostname: "redacted-host".to_string(),
            ts: "2026-06-20T22:00:00Z".to_string(),
        },
    )
    .expect("register should use injected client seam");

    assert_eq!(
        client.endpoint.borrow().as_deref(),
        Some("https://auth-fixvox.jpsala.dev/v2/device/register")
    );
    assert_eq!(
        client.body.borrow().as_ref().unwrap()["installId"],
        "install_test_123"
    );
    assert_eq!(snapshot.device_id, "dev_test_1234567890abcdef");
    assert_eq!(snapshot.policy_id, "alpha-basic");
}

#[test]
fn resolves_device_state_path_under_local_app_data() {
    let path = resolve_device_state_path(&|key| match key {
        "APPDATA" => Some("C:/Users/JP/AppData/Roaming".to_string()),
        _ => None,
    })
    .expect("device state path should resolve under local app data");

    assert!(path.ends_with("dictation-tauri/fixvox-device-state.json"));
    assert!(path
        .to_string_lossy()
        .contains("C:/Users/JP/AppData/Roaming"));
}

#[test]
fn persists_minimal_device_register_snapshot_outside_react() {
    let path = unique_temp_state_path("fixvox-device-state");
    let register: DeviceRegisterSnapshot = fixture(include_str!(
        "../../specs/009-fixvox-cloud-runtime-port/fixtures/register.response.json"
    ));
    let config = FixvoxCloudRuntimeConfig {
        backend_base_url: PREFERRED_FIXVOX_BACKEND_URL.to_string(),
        install_id: "install_test_123".to_string(),
        device_id: None,
    };

    let state = build_device_state_from_register(&config, &register);
    persist_device_state(&path, &state).expect("device state should be persisted as JSON");

    let raw = std::fs::read_to_string(&path).expect("persisted state should be readable");
    assert!(raw.contains("install_test_123"));
    assert!(raw.contains("dev_test_1234567890abcdef"));
    assert!(!raw.to_ascii_lowercase().contains("authorization"));
    assert!(!raw.to_ascii_lowercase().contains("api_key"));

    let restored = read_device_state(&path)
        .expect("device state read should succeed")
        .expect("device state should exist");
    assert_eq!(restored.install_id, "install_test_123");
    assert_eq!(
        restored.device_id.as_deref(),
        Some("dev_test_1234567890abcdef")
    );
    assert!(restored.last_register_ok);
    assert_eq!(restored.policy_id.as_deref(), Some("alpha-basic"));
    assert_eq!(restored.policy_label.as_deref(), Some("Alpha Basic"));
    assert_eq!(
        restored.transport_policy.as_ref().unwrap()["mode"],
        "managed"
    );

    let _ = std::fs::remove_file(path);
}

#[test]
fn persists_redacted_register_error_without_losing_existing_device_id() {
    let config = FixvoxCloudRuntimeConfig {
        backend_base_url: PREFERRED_FIXVOX_BACKEND_URL.to_string(),
        install_id: "install_test_123".to_string(),
        device_id: Some("dev_existing_123".to_string()),
    };
    let register_error = FixvoxCloudError {
        code: "FIXVOX_BACKEND_UNAVAILABLE".to_string(),
        message: "Backend unavailable.".to_string(),
        redacted: true,
    };

    let state = build_device_state_from_register_error(&config, &register_error);

    assert!(!state.last_register_ok);
    assert_eq!(state.device_id.as_deref(), Some("dev_existing_123"));
    assert_eq!(
        state.last_register_error_code.as_deref(),
        Some("FIXVOX_BACKEND_UNAVAILABLE")
    );
    assert_eq!(
        state.last_register_error_message.as_deref(),
        Some("Backend unavailable.")
    );
    assert!(state.transport_policy.is_none());
}

#[test]
fn builds_and_posts_preflight_request_without_network() {
    let client = FakeRegisterClient {
        endpoint: RefCell::new(None),
        body: RefCell::new(None),
        response: fixture(include_str!(
            "../../specs/009-fixvox-cloud-runtime-port/fixtures/preflight.response.json"
        )),
    };
    let config = FixvoxCloudRuntimeConfig {
        backend_base_url: PREFERRED_FIXVOX_BACKEND_URL.to_string(),
        install_id: "install_test_123".to_string(),
        device_id: Some("dev_test_1234567890abcdef".to_string()),
    };

    let decision = preflight_with_client(
        &client,
        &config,
        PreflightInput {
            install_id: config.install_id.clone(),
            device_id: config.device_id.clone().expect("device id should exist"),
            usage_kind: "transcription".to_string(),
            estimated_audio_seconds: Some(12),
        },
    )
    .expect("preflight should use injected client seam");

    assert_eq!(
        client.endpoint.borrow().as_deref(),
        Some("https://auth-fixvox.jpsala.dev/v2/execution/preflight")
    );
    let body = client.body.borrow();
    let body = body.as_ref().expect("preflight body should be captured");
    assert_eq!(body["mode"], "managed");
    assert_eq!(body["installId"], "install_test_123");
    assert_eq!(body["deviceId"], "dev_test_1234567890abcdef");
    assert_eq!(body["usageKind"], "transcription");
    assert_eq!(body["estimate"]["audioSeconds"], 12);
    assert!(decision.ok);
    assert!(decision.allowed);
    assert_eq!(decision.request_id.as_deref(), Some("fx_req_contract_123"));
}

#[test]
fn maps_preflight_denials_to_fail_closed_error_codes() {
    for (deny_code, expected) in [
        ("device_not_registered", "FIXVOX_DEVICE_NOT_REGISTERED"),
        ("auth_required", "FIXVOX_AUTH_REQUIRED"),
        ("policy_blocked", "FIXVOX_POLICY_BLOCKED"),
        ("quota_exceeded", "FIXVOX_QUOTA_EXCEEDED"),
        ("service_unavailable", "FIXVOX_SERVICE_UNAVAILABLE"),
        ("unknown", "FIXVOX_PREFLIGHT_DENIED"),
    ] {
        let decision = parse_preflight_decision(serde_json::json!({
            "ok": true,
            "allowed": false,
            "mode": "managed",
            "usageKind": "transcription",
            "requestId": "fx_req_contract_123",
            "denyCode": deny_code,
            "message": "redacted denial"
        }))
        .expect("denied preflight should parse");

        assert!(!decision.allowed);
        assert_eq!(preflight_denial_error_code(&decision), expected);
    }
}

#[test]
fn managed_stt_uses_device_id_header_and_never_vendor_bearer() {
    let preview = build_managed_stt_request_preview(
        FixvoxCloudConfig {
            backend_base_url: PREFERRED_FIXVOX_BACKEND_URL.to_string(),
            device_id: Some("dev_test_1234567890abcdef".to_string()),
        },
        ManagedSttInput {
            audio_file_name: "capture.wav".to_string(),
            model: "whisper-large-v3".to_string(),
            language: Some("es".to_string()),
        },
    )
    .expect("managed STT request preview should be constructable without network");

    assert_eq!(
        preview.endpoint,
        "https://auth-fixvox.jpsala.dev/v1/audio/transcriptions",
    );
    assert!(preview
        .headers
        .iter()
        .any(|(name, value)| name == "X-Device-Id" && value == "dev_test_1234567890abcdef"));
    assert!(!preview.has_authorization_header);
    assert!(preview
        .headers
        .iter()
        .all(|(name, _)| !name.eq_ignore_ascii_case("authorization")));
    assert!(preview.multipart_fields.contains(&"file".to_string()));
    assert!(preview.multipart_fields.contains(&"model".to_string()));
    assert!(preview.multipart_fields.contains(&"language".to_string()));
    assert!(preview
        .multipart_fields
        .contains(&"response_format".to_string()));
}

#[test]
fn managed_chat_postprocess_uses_device_id_header_and_never_vendor_bearer() {
    let preview = build_managed_chat_completion_request_preview(
        FixvoxCloudConfig {
            backend_base_url: PREFERRED_FIXVOX_BACKEND_URL.to_string(),
            device_id: Some("dev_test_1234567890abcdef".to_string()),
        },
        ManagedChatInput {
            transcript: "hola mundo".to_string(),
            system_prompt: "Clean up the transcript.".to_string(),
            model: "openai/gpt-oss-120b".to_string(),
            max_tokens: Some(512),
        },
    )
    .expect("managed chat request preview should be constructable without network");

    assert_eq!(
        preview.endpoint,
        "https://auth-fixvox.jpsala.dev/v1/chat/completions",
    );
    assert!(preview
        .headers
        .iter()
        .any(|(name, value)| name == "X-Device-Id" && value == "dev_test_1234567890abcdef"));
    assert!(!preview.has_authorization_header);
    assert!(preview
        .headers
        .iter()
        .all(|(name, _)| !name.eq_ignore_ascii_case("authorization")));
    assert_eq!(preview.body["model"], "openai/gpt-oss-120b");
    assert_eq!(preview.body["messages"][0]["role"], "system");
    assert_eq!(preview.body["messages"][1]["content"], "hola mundo");
    assert_eq!(preview.body["max_tokens"], 512);
    assert_eq!(preview.body["stream"], false);
}

#[test]
fn managed_mode_fails_closed_instead_of_silent_direct_groq_fallback() {
    let denied = choose_transcription_transport(TranscriptionTransportRequest {
        requested_mode: "managed".to_string(),
        managed_ready: false,
        direct_ready: true,
        direct_fallback_requested: false,
    })
    .expect_err("managed mode must fail closed when cloud is not ready");
    assert_eq!(denied.code, "FIXVOX_MANAGED_NOT_READY");
    assert!(!denied.message.to_ascii_lowercase().contains("groq"));

    let explicit_direct = choose_transcription_transport(TranscriptionTransportRequest {
        requested_mode: "direct".to_string(),
        managed_ready: false,
        direct_ready: true,
        direct_fallback_requested: true,
    })
    .expect("direct BYOK must remain available only when explicitly selected");
    assert_eq!(explicit_direct, TranscriptionTransport::DirectByok);
}

#[test]
fn parses_managed_stt_response_body_without_network() {
    let parsed = parse_managed_stt_json_response(include_str!(
        "../../specs/009-fixvox-cloud-runtime-port/fixtures/stt.response.json"
    ))
    .expect("managed STT response should parse from fixture JSON");

    assert_eq!(parsed.text, "fixture managed transcript");
    assert_eq!(parsed.model.as_deref(), Some("whisper-large-v3"));

    let missing_text = parse_managed_stt_json_response("{\"model\":\"whisper-large-v3\"}")
        .expect_err("managed STT response without text should fail closed");
    assert_eq!(missing_text.code, "FIXVOX_STT_RESPONSE_TEXT_MISSING");
}

#[test]
fn parses_managed_chat_response_body_without_network() {
    let parsed = parse_managed_chat_json_response(include_str!(
        "../../specs/009-fixvox-cloud-runtime-port/fixtures/chat.response.json"
    ))
    .expect("managed chat response should parse from fixture JSON");

    assert_eq!(parsed.output, "fixture cleaned transcript");
    assert_eq!(parsed.model.as_deref(), Some("openai/gpt-oss-120b"));

    let missing_text = parse_managed_chat_json_response(
        "{\"model\":\"openai/gpt-oss-120b\",\"choices\":[{\"message\":{}}]}",
    )
    .expect_err("managed chat response without output should fail closed");
    assert_eq!(missing_text.code, "FIXVOX_CHAT_RESPONSE_TEXT_MISSING");
}

#[test]
fn maps_fixvox_proxy_headers_into_typed_metadata() {
    let metadata = parse_fixvox_response_metadata(&[
        ("X-Fixvox-Request-Id", "fx_req_contract_123"),
        ("X-Provider-Request-Id", "groq_req_contract_456"),
        ("X-Fixvox-Cost-Usd", "0.000042"),
        ("X-Fixvox-Pricing-Source", "groq-live"),
        ("X-Fixvox-Limit", "3600"),
        ("X-Fixvox-Remaining", "3599"),
        ("X-Fixvox-Reset-At", "2026-06-21T00:00:00Z"),
        ("X-Fixvox-Usage-Key", "transcription:dev_test"),
        ("X-Fixvox-Proxy-Parse-Ms", "3"),
        ("X-Fixvox-Proxy-Usage-Ms", "4"),
        ("X-Fixvox-Proxy-Upstream-Ms", "125"),
        ("X-Fixvox-Proxy-Init-Ms", "1"),
        ("X-Fixvox-Proxy-Total-Ms", "140"),
        ("Server-Timing", "fixvox;dur=140"),
    ]);

    assert_eq!(
        metadata.fixvox_request_id.as_deref(),
        Some("fx_req_contract_123")
    );
    assert_eq!(
        metadata.provider_request_id.as_deref(),
        Some("groq_req_contract_456"),
    );
    assert_eq!(metadata.cost_usd.as_deref(), Some("0.000042"));
    assert_eq!(metadata.pricing_source.as_deref(), Some("groq-live"));
    assert_eq!(metadata.limit, Some(3600));
    assert_eq!(metadata.remaining, Some(3599));
    assert_eq!(metadata.reset_at.as_deref(), Some("2026-06-21T00:00:00Z"));
    assert_eq!(
        metadata.usage_key.as_deref(),
        Some("transcription:dev_test")
    );
    assert_eq!(metadata.proxy_parse_ms, Some(3));
    assert_eq!(metadata.proxy_usage_ms, Some(4));
    assert_eq!(metadata.proxy_upstream_ms, Some(125));
    assert_eq!(metadata.proxy_init_ms, Some(1));
    assert_eq!(metadata.proxy_total_ms, Some(140));
    assert_eq!(metadata.server_timing.as_deref(), Some("fixvox;dur=140"));
}
