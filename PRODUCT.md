# Product

## Register

product

## Users

Initial user: JP as a developer and power user building a desktop dictation tool with repeatable checks before manual voice testing.

Later users: people who need to dictate and insert text from the desktop with low friction, clear feedback, and no silent loss when delivery is uncertain.

The core context is an active desktop workflow: the user is in another app, triggers dictation, speaks, watches a compact status surface, and receives text through insertion or copy fallback.

## Product Purpose

Dictation Tauri is a fast, reliable desktop dictation app. It starts with universal direct dictation, then grows toward contextual writing over selected text and assisted surfaces after the base flow is stable.

Success means the user can dictate a sentence and trust the app to show the true state of capture, transcription, processing, delivery, completion, failure, or cancellation. Early development success means the team can validate that flow with fixtures, mock providers, synthetic audio, and automated checks before asking JP to repeat manual voice tests.

## Brand Personality

Precise, calm, operational.

The product should feel like a focused desktop instrument: quiet enough to stay out of the way, explicit enough to be trusted, and technical enough to expose state when something goes wrong.

The voice is direct and factual. Prefer concrete labels such as "Listening", "Transcribing", "Copied fallback", and "Delivery uncertain" over marketing language or vague AI phrasing.

## Anti-references

- Generic AI SaaS landing-page aesthetics: oversized hero copy, decorative gradients, abstract blobs, and product claims before behavior exists.
- Dark purple or blue gradient AI tool chrome.
- Busy recording dashboards that make dictation feel like audio engineering.
- Chat-first assistant UI as the main surface for MVP 0-3.
- Clipboard-manager UI patterns from CopyQ Tauri unless a Dictation Tauri spec explicitly needs them.
- Fixvox architecture or Electrobun/Bun UI assumptions copied directly into this app.
- Hidden failure states, optimistic paste claims, or UI that implies delivery was observed when only a send/copy action happened.

## Design Principles

1. State is the product surface.
   The interface must make the current phase obvious: idle, listening, transcribing, processing, delivering, completed, failed, or cancelled.

2. Recovery beats confidence theater.
   If delivery cannot be proven, the app should say so and give the user a clear copy or retry path.

3. Compact desktop ergonomics first.
   Surfaces should be small, scannable, keyboard-friendly, and suitable for repeated use while another app has the user's attention.

4. Automatable before manual.
   Early flows must be testable through fixtures, mock adapters, synthetic audio, and visual checks before they depend on real microphone sessions.

5. Durable UI follows documented product intent.
   App shell, voice dock, preview, recovery, settings, and onboarding should not become durable until they fit this product context and DESIGN.md.

## Accessibility & Inclusion

Target WCAG 2.2 AA for contrast, focus visibility, keyboard access, and status communication.

Status must not rely on color alone. Pair color with text, icon, motion, or structured layout where appropriate.

Motion must respect `prefers-reduced-motion`; state changes should remain understandable without animation.

Text must fit compact desktop windows without clipping or overlap. Error and recovery copy should remain readable in narrow layouts.

Audio, transcripts, prompts, corrections, and logs are sensitive by default. UI should avoid exposing sensitive text in large surfaces unless a later spec explicitly calls for preview or history.
