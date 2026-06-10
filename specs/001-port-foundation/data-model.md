# Data Model: Port Foundation

MVP 0 introduces no product data model and no persistent domain entities.

## Technical Entities

### App Shell Placeholder

Purpose: A neutral rendered surface proving that the React app is running.

Fields:

- `title`: static string shown for smoke verification.
- `status`: static string indicating this is the technical foundation.
- `scope`: static text listing that dictation is not enabled in MVP 0.

Validation:

- Must render without requiring network access, user secrets, audio devices, or
  local storage.
- Must not claim microphone, STT, delivery, settings, or product UI behavior.

Lifecycle:

```text
loaded -> visible
```

### Tauri Main Window

Purpose: The first desktop app window managed by Tauri.

Fields:

- `label`: `main`.
- `title`: `Dictation Tauri`.
- `url`: Vite dev URL during development or frontend bundle in production.
- `capabilities`: `default` capability with `core:default`.

Validation:

- Must open without app-specific permissions beyond `core:default`.
- Must not register global shortcuts, tray icons, microphone listeners, or
  background behavior.

Lifecycle:

```text
created -> visible -> closed
```

## Deferred Entities

The following entities are intentionally not modeled in MVP 0:

- Dictation Session.
- Transcript.
- Audio fixture.
- ModelGateway request/response.
- App Settings.
- Delivery target.
- Result history.

They require separate MVP 1-3 specs or explicit extensions to this spec.
