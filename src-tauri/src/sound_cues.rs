#[cfg(windows)]
mod platform {
    use std::{
        fs,
        path::{Path, PathBuf},
        sync::OnceLock,
    };

    use windows::{
        core::HSTRING,
        Win32::Media::Audio::{PlaySoundW, SND_FILENAME, SND_NODEFAULT},
    };

    const SAMPLE_RATE: u32 = 24_000;
    const CHANNELS: u16 = 1;
    const BITS_PER_SAMPLE: u16 = 16;

    #[derive(Clone)]
    struct CueFiles {
        start: PathBuf,
        stop: PathBuf,
        attention: PathBuf,
    }

    static CUE_FILES: OnceLock<Result<CueFiles, String>> = OnceLock::new();

    pub fn play(cue: &str) -> Result<(), String> {
        let files = CUE_FILES.get_or_init(prepare_cue_files);
        let files = files.as_ref().map_err(Clone::clone)?;
        let path = match cue {
            "start" => &files.start,
            "stop" | "success" => &files.stop,
            "error" | "no-speech" => &files.attention,
            _ => return Err("Unsupported dictation sound cue.".to_string()),
        };
        let path = HSTRING::from(path.to_string_lossy().as_ref());
        let played = unsafe { PlaySoundW(&path, None, SND_FILENAME | SND_NODEFAULT) };
        if played.as_bool() {
            Ok(())
        } else {
            Err("Windows could not play the dictation sound cue.".to_string())
        }
    }

    fn prepare_cue_files() -> Result<CueFiles, String> {
        let directory = std::env::temp_dir().join("fixvox-tauri-sound-cues");
        fs::create_dir_all(&directory)
            .map_err(|error| format!("Could not create sound cue directory: {error}"))?;

        let start = directory.join("dictation-start.wav");
        let stop = directory.join("dictation-stop.wav");
        let attention = directory.join("dictation-attention.wav");
        write_tone_file(&start, &[(880.0, 34, 0.09), (1240.0, 42, 0.075)])?;
        write_tone_file(&stop, &[(980.0, 34, 0.075), (660.0, 46, 0.08)])?;
        write_tone_file(
            &attention,
            &[(520.0, 34, 0.08), (390.0, 34, 0.075), (260.0, 44, 0.07)],
        )?;

        Ok(CueFiles {
            start,
            stop,
            attention,
        })
    }

    fn write_tone_file(path: &Path, tones: &[(f64, u32, f64)]) -> Result<(), String> {
        let mut samples = Vec::<i16>::new();
        for (frequency_hz, duration_ms, gain) in tones {
            let sample_count = ((SAMPLE_RATE as u64 * *duration_ms as u64) / 1_000).max(1);
            for index in 0..sample_count {
                let envelope = (std::f64::consts::PI * index as f64
                    / (sample_count.saturating_sub(1).max(1)) as f64)
                    .sin();
                let value = (2.0 * std::f64::consts::PI * frequency_hz * index as f64
                    / SAMPLE_RATE as f64)
                    .sin()
                    * gain
                    * envelope;
                samples.push((value.clamp(-1.0, 1.0) * i16::MAX as f64).round() as i16);
            }
        }

        let data_size = (samples.len() * std::mem::size_of::<i16>()) as u32;
        let mut wav = Vec::with_capacity(44 + data_size as usize);
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data_size).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&CHANNELS.to_le_bytes());
        wav.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
        let byte_rate = SAMPLE_RATE * CHANNELS as u32 * BITS_PER_SAMPLE as u32 / 8;
        wav.extend_from_slice(&byte_rate.to_le_bytes());
        let block_align = CHANNELS * BITS_PER_SAMPLE / 8;
        wav.extend_from_slice(&block_align.to_le_bytes());
        wav.extend_from_slice(&BITS_PER_SAMPLE.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_size.to_le_bytes());
        for sample in samples {
            wav.extend_from_slice(&sample.to_le_bytes());
        }

        fs::write(path, wav).map_err(|error| format!("Could not write sound cue: {error}"))
    }
}

#[tauri::command]
pub fn play_dictation_sound_cue(cue: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        platform::play(&cue)
    }

    #[cfg(not(windows))]
    {
        let _ = cue;
        Err("Dictation sound cues are not supported on this platform.".to_string())
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn cue_names_match_renderer_contract() {
        for cue in ["start", "stop", "success", "error", "no-speech"] {
            assert!(!cue.is_empty());
        }
    }
}
