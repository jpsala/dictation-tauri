use std::{
    fs,
    path::PathBuf,
    sync::mpsc,
    sync::{Arc, Mutex, OnceLock},
    thread::{self, JoinHandle},
    time::{SystemTime, UNIX_EPOCH},
};

use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    SampleFormat, Stream, StreamConfig,
};
use serde::Serialize;

static ACTIVE_CAPTURE: OnceLock<Mutex<Option<ActiveCapture>>> = OnceLock::new();

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CapturedAudioArtifact {
    artifact_id: String,
    capture_id: String,
    path: String,
    relative_path: String,
    mime_type: String,
    extension: String,
    size_bytes: u64,
    duration_ms: u64,
    sample_rate_hz: u32,
    channel_count: u16,
    sensitivity: &'static str,
    policy: &'static str,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptureMetadata {
    capture_id: String,
    source: &'static str,
    permission_status: &'static str,
    artifact_policy: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mime_type: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    artifact: Option<CapturedAudioArtifact>,
    device_kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    device_label: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureError {
    phase: &'static str,
    code: &'static str,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureLevel {
    active: bool,
    vu_level: f32,
    vu_bands: Vec<f32>,
    sample_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    ok: bool,
    metadata: CaptureMetadata,
    #[serde(skip_serializing_if = "Option::is_none")]
    artifact: Option<CapturedAudioArtifact>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<CaptureError>,
}

struct ActiveCapture {
    capture_id: String,
    started_at_ms: u64,
    device_label: Option<String>,
    sample_rate_hz: u32,
    channel_count: u16,
    samples: Arc<Mutex<Vec<i16>>>,
    stop_sender: mpsc::Sender<()>,
    capture_thread: JoinHandle<()>,
}

struct StartedCapture {
    device_label: Option<String>,
    sample_rate_hz: u32,
    channel_count: u16,
}

#[tauri::command]
pub fn start_native_microphone_capture() -> Result<CaptureMetadata, String> {
    let state = ACTIVE_CAPTURE.get_or_init(|| Mutex::new(None));
    let mut active = state
        .lock()
        .map_err(|_| "Native capture state is unavailable.".to_string())?;

    if let Some(existing) = active.as_ref() {
        return Err(format!(
            "Capture session already active: {}",
            existing.capture_id
        ));
    }

    let samples = Arc::new(Mutex::new(Vec::<i16>::new()));
    let capture_id = format!("capture-native-{}", now_ms());
    let (started_sender, started_receiver) = mpsc::channel::<Result<StartedCapture, String>>();
    let (stop_sender, stop_receiver) = mpsc::channel::<()>();
    let thread_samples = Arc::clone(&samples);
    let capture_thread = thread::spawn(move || {
        let started = start_capture_stream(thread_samples);
        match started {
            Ok((stream, info)) => {
                let _ = started_sender.send(Ok(info));
                let _ = stop_receiver.recv();
                drop(stream);
            }
            Err(message) => {
                let _ = started_sender.send(Err(message));
            }
        }
    });

    let started = match started_receiver.recv() {
        Ok(Ok(started)) => started,
        Ok(Err(message)) => {
            let _ = capture_thread.join();
            return Err(message);
        }
        Err(_) => {
            let _ = capture_thread.join();
            return Err("Native microphone capture thread did not start.".to_string());
        }
    };

    *active = Some(ActiveCapture {
        capture_id: capture_id.clone(),
        started_at_ms: now_ms(),
        device_label: started.device_label.clone(),
        sample_rate_hz: started.sample_rate_hz,
        channel_count: started.channel_count,
        samples,
        stop_sender,
        capture_thread,
    });

    Ok(create_metadata(capture_id, "granted", started.device_label))
}

#[tauri::command]
pub fn get_native_microphone_capture_level() -> CaptureLevel {
    let state = ACTIVE_CAPTURE.get_or_init(|| Mutex::new(None));
    let active = match state.lock() {
        Ok(guard) => guard,
        Err(_) => return inactive_capture_level(),
    };

    let Some(active) = active.as_ref() else {
        return inactive_capture_level();
    };

    let samples = match active.samples.lock() {
        Ok(guard) => guard,
        Err(_) => return inactive_capture_level(),
    };

    create_capture_level(&samples)
}

#[tauri::command]
pub fn stop_native_microphone_capture() -> CaptureResult {
    let state = ACTIVE_CAPTURE.get_or_init(|| Mutex::new(None));
    let active = match state.lock() {
        Ok(mut guard) => guard.take(),
        Err(_) => None,
    };

    let Some(active) = active else {
        return failure(
            create_metadata(format!("capture-native-{}", now_ms()), "unknown", None),
            "recording",
            "unknown",
            "No active native microphone capture.",
        );
    };

    let _ = active.stop_sender.send(());
    let _ = active.capture_thread.join();

    let duration_ms = now_ms().saturating_sub(active.started_at_ms);
    let samples = match active.samples.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => Vec::new(),
    };

    if samples.is_empty() {
        return failure(
            create_metadata(active.capture_id, "granted", active.device_label),
            "recording",
            "empty-audio",
            "Native microphone capture produced no audio data.",
        );
    }

    match write_wav_artifact(
        &active.capture_id,
        active.sample_rate_hz,
        active.channel_count,
        &samples,
        duration_ms,
    ) {
        Ok(artifact) => {
            let metadata = CaptureMetadata {
                capture_id: active.capture_id,
                source: "microphone",
                permission_status: "granted",
                artifact_policy: "gitignored-local",
                duration_ms: Some(duration_ms),
                mime_type: Some("audio/wav"),
                size_bytes: Some(artifact.size_bytes),
                artifact: Some(artifact.clone()),
                device_kind: "audioinput",
                device_label: active.device_label,
            };

            CaptureResult {
                ok: true,
                metadata,
                artifact: Some(artifact),
                error: None,
            }
        }
        Err(message) => failure(
            create_metadata(active.capture_id, "granted", active.device_label),
            "artifact",
            "artifact-write-failed",
            message,
        ),
    }
}

#[tauri::command]
pub fn cancel_native_microphone_capture() -> CaptureResult {
    let state = ACTIVE_CAPTURE.get_or_init(|| Mutex::new(None));
    let active = match state.lock() {
        Ok(mut guard) => guard.take(),
        Err(_) => None,
    };

    let metadata = active
        .as_ref()
        .map(|capture| {
            create_metadata(
                capture.capture_id.clone(),
                "granted",
                capture.device_label.clone(),
            )
        })
        .unwrap_or_else(|| {
            create_metadata(format!("capture-native-{}", now_ms()), "unknown", None)
        });

    if let Some(active) = active {
        let _ = active.stop_sender.send(());
        let _ = active.capture_thread.join();
    }

    failure(
        metadata,
        "cancelled",
        "cancelled",
        "Native microphone capture was cancelled.",
    )
}

fn start_capture_stream(samples: Arc<Mutex<Vec<i16>>>) -> Result<(Stream, StartedCapture), String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No microphone input device was found.".to_string())?;
    let device_label = device.name().ok();
    let supported_config = device
        .default_input_config()
        .map_err(|_| "Microphone input could not be configured.".to_string())?;
    let sample_format = supported_config.sample_format();
    let config: StreamConfig = supported_config.into();
    let sample_rate_hz = config.sample_rate.0;
    let channel_count = config.channels;
    let stream = build_input_stream(&device, &config, sample_format, samples)?;
    stream
        .play()
        .map_err(|_| "Microphone input could not be started.".to_string())?;

    Ok((
        stream,
        StartedCapture {
            device_label,
            sample_rate_hz,
            channel_count,
        },
    ))
}

fn build_input_stream(
    device: &cpal::Device,
    config: &StreamConfig,
    sample_format: SampleFormat,
    samples: Arc<Mutex<Vec<i16>>>,
) -> Result<Stream, String> {
    let error_callback = |error| {
        eprintln!("native microphone stream error: {error}");
    };

    match sample_format {
        SampleFormat::F32 => device
            .build_input_stream(
                config,
                move |data: &[f32], _| push_samples(&samples, data.iter().copied().map(f32_to_i16)),
                error_callback,
                None,
            )
            .map_err(|_| "Microphone input stream could not be built.".to_string()),
        SampleFormat::I16 => device
            .build_input_stream(
                config,
                move |data: &[i16], _| push_samples(&samples, data.iter().copied()),
                error_callback,
                None,
            )
            .map_err(|_| "Microphone input stream could not be built.".to_string()),
        SampleFormat::U16 => device
            .build_input_stream(
                config,
                move |data: &[u16], _| push_samples(&samples, data.iter().copied().map(u16_to_i16)),
                error_callback,
                None,
            )
            .map_err(|_| "Microphone input stream could not be built.".to_string()),
        _ => Err("Microphone sample format is not supported yet.".to_string()),
    }
}

fn push_samples<I>(samples: &Arc<Mutex<Vec<i16>>>, incoming: I)
where
    I: Iterator<Item = i16>,
{
    if let Ok(mut buffer) = samples.lock() {
        buffer.extend(incoming);
    }
}

fn f32_to_i16(sample: f32) -> i16 {
    (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
}

fn u16_to_i16(sample: u16) -> i16 {
    (sample as i32 - 32768) as i16
}

fn write_wav_artifact(
    capture_id: &str,
    sample_rate_hz: u32,
    channel_count: u16,
    samples: &[i16],
    duration_ms: u64,
) -> Result<CapturedAudioArtifact, String> {
    let artifact_root = writable_artifact_root()?;
    let relative_path = format!("artifacts/microphone-capture/audio/{capture_id}.wav");
    let artifact_path = artifact_root.join(&relative_path);

    if let Some(parent) = artifact_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|_| "Microphone artifact directory could not be created.".to_string())?;
    }

    let spec = hound::WavSpec {
        channels: channel_count,
        sample_rate: sample_rate_hz,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(&artifact_path, spec)
        .map_err(|_| "Microphone artifact file could not be created.".to_string())?;

    for sample in samples {
        writer
            .write_sample(*sample)
            .map_err(|_| "Microphone artifact samples could not be written.".to_string())?;
    }

    writer
        .finalize()
        .map_err(|_| "Microphone artifact file could not be finalized.".to_string())?;

    let size_bytes = fs::metadata(&artifact_path)
        .map_err(|_| "Microphone artifact metadata could not be read.".to_string())?
        .len();

    Ok(CapturedAudioArtifact {
        artifact_id: format!("artifact-{capture_id}"),
        capture_id: capture_id.to_string(),
        path: artifact_path.to_string_lossy().to_string(),
        relative_path,
        mime_type: "audio/wav".to_string(),
        extension: "wav".to_string(),
        size_bytes,
        duration_ms,
        sample_rate_hz,
        channel_count,
        sensitivity: "real-user-audio",
        policy: "gitignored-local",
    })
}

fn writable_artifact_root() -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(|path| path.to_path_buf())
            .ok_or_else(|| "Repository root could not be resolved.".to_string());
    }

    local_app_data_root()
        .or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .map(|path| path.to_path_buf())
        })
        .ok_or_else(|| "Local app data directory could not be resolved.".to_string())
}

fn local_app_data_root() -> Option<PathBuf> {
    ["APPDATA", "LOCALAPPDATA", "XDG_DATA_HOME", "HOME"]
        .iter()
        .find_map(|key| std::env::var(key).ok())
        .map(|base| PathBuf::from(base).join("dictation-tauri"))
}

fn create_capture_level(samples: &[i16]) -> CaptureLevel {
    const WINDOW_SIZE: usize = 2048;
    const BAND_COUNT: usize = 7;

    let sample_count = samples.len();
    if sample_count == 0 {
        return inactive_capture_level();
    }

    let start = sample_count.saturating_sub(WINDOW_SIZE);
    let window = &samples[start..];
    let vu_level = rms_level(window);
    let chunk_size = (window.len() / BAND_COUNT).max(1);
    let mut vu_bands = Vec::with_capacity(BAND_COUNT);

    for index in 0..BAND_COUNT {
        let band_start = index * chunk_size;
        let band_end = if index == BAND_COUNT - 1 {
            window.len()
        } else {
            ((index + 1) * chunk_size).min(window.len())
        };
        let chunk = if band_start < window.len() {
            &window[band_start..band_end]
        } else {
            &[]
        };
        vu_bands.push(rms_level(chunk));
    }

    CaptureLevel {
        active: true,
        vu_level,
        vu_bands,
        sample_count,
    }
}

fn inactive_capture_level() -> CaptureLevel {
    CaptureLevel {
        active: false,
        vu_level: 0.0,
        vu_bands: vec![0.0; 7],
        sample_count: 0,
    }
}

fn rms_level(samples: &[i16]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }

    let mean_square = samples
        .iter()
        .map(|sample| {
            let normalized = *sample as f32 / i16::MAX as f32;
            normalized * normalized
        })
        .sum::<f32>()
        / samples.len() as f32;
    let rms = mean_square.sqrt();

    ((rms.sqrt() * 3.4) - 0.03).clamp(0.0, 1.0)
}

fn create_metadata(
    capture_id: String,
    permission_status: &'static str,
    device_label: Option<String>,
) -> CaptureMetadata {
    CaptureMetadata {
        capture_id,
        source: "microphone",
        permission_status,
        artifact_policy: "gitignored-local",
        duration_ms: None,
        mime_type: None,
        size_bytes: None,
        artifact: None,
        device_kind: "audioinput",
        device_label,
    }
}

fn failure(
    metadata: CaptureMetadata,
    phase: &'static str,
    code: &'static str,
    message: impl Into<String>,
) -> CaptureResult {
    CaptureResult {
        ok: false,
        metadata,
        artifact: None,
        error: Some(CaptureError {
            phase,
            code,
            message: message.into(),
        }),
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}
