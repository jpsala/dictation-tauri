# Spec: Real Provider UI Gate

## Goal

Let JP run the already-implemented host-side real Groq transcription path from the desktop UI through an explicit, visible user gesture.

## User Story

As JP, after capturing audio and seeing host readiness configured, I can click a dedicated real-provider transcription action so the app sends the captured artifact to the Tauri host with `mode: real` and `allowProviderCall: true`, then review/copy the transcript with the same honest evidence model.

## Requirements

- Keep the existing safe submit action provider-free by default.
- Add a separate real-provider action that is disabled unless a captured artifact exists and host readiness is configured.
- Renderer must still send no secrets, API keys, auth headers, or raw provider payloads.
- Browser/default automated checks must not perform provider calls.
- Transcript/copy/recovery behavior must stay unchanged once a host response is returned.
