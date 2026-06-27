---
name: Dictation Tauri
description: A restrained desktop product system for fast, trustworthy dictation.
colors:
  bg: "oklch(1.000 0.000 0)"
  surface: "oklch(0.970 0.004 230)"
  surface-raised: "oklch(0.995 0.000 0)"
  ink: "oklch(0.210 0.018 235)"
  muted: "oklch(0.450 0.020 235)"
  border: "oklch(0.860 0.012 235)"
  primary: "oklch(0.560 0.150 35)"
  primary-deep: "oklch(0.410 0.120 35)"
  accent: "oklch(0.390 0.110 205)"
  success: "oklch(0.520 0.115 150)"
  warning: "oklch(0.660 0.140 70)"
  danger: "oklch(0.540 0.165 25)"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "2rem"
    fontWeight: 720
    lineHeight: 1.15
    letterSpacing: "0"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.375rem"
    fontWeight: 680
    lineHeight: 1.2
    letterSpacing: "0"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "0"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.78rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "22px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.bg}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  panel:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  status-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
---

# Design System: Dictation Tauri

## 1. Overview

**Creative North Star: "The Quiet Control Room"**

Dictation Tauri should feel like a compact desktop control surface: restrained, legible, and exact about what is happening. The interface serves an active workflow, so the design must stay calm while another application is the user's main context.

The system uses a pure white canvas, cool technical neutrals, and a small amount of warm coral as the primary action color. Warmth lives in the accent, not in a cream surface. The main product UI should reject generic AI SaaS landing-page aesthetics, dark purple gradient chrome, and audio-engineering dashboards. The voice dock is a utility-overlay exception: it should deliberately adapt the compact Fixvox dock ergonomics when that improves always-on desktop usability, without copying legacy Fixvox desktop implementation details.

**Key Characteristics:**

- Compact desktop density with clear hierarchy.
- State-first surfaces for listening, transcribing, delivering, completion, failure, and cancellation.
- Restrained color, with primary color used for current action and active state only.
- Familiar product controls: buttons, chips, panels, tabs, menus, and settings patterns.
- Accessible by default: visible focus, high contrast, reduced motion support, and text that fits narrow windows.

## 2. Colors

The palette is restrained: pure white and cool neutral surfaces carry most of the interface, with warm coral reserved for primary action and active recording moments.

### Primary

- **Burnt Signal** (`primary`): Use for primary action buttons, active dictation state, and the single most important actionable element on a surface.
- **Deep Signal** (`primary-deep`): Use for pressed states, strong emphasis, and high-contrast active indicators when text is not placed directly on the fill.

### Secondary

- **Assurance Blue** (`accent`): Use for informational state, selected technical context, and secondary links. It must not compete with active recording.

### Neutral

- **Clear Canvas** (`bg`): Use as the main app background and default content canvas.
- **Instrument Surface** (`surface`): Use for toolbars, grouped rows, side panels, and quiet section backgrounds.
- **Raised Surface** (`surface-raised`): Use for foreground panels and modal-like containers.
- **Control Ink** (`ink`): Use for primary text.
- **Muted Ink** (`muted`): Use for secondary text that still needs readable contrast.
- **Calibration Line** (`border`): Use for dividers and panel edges.

### State

- **Stable Green** (`success`): Completion or successful mock delivery.
- **Attention Amber** (`warning`): Uncertain delivery, degraded provider state, or fallback path.
- **Failure Red** (`danger`): Failed capture, failed transcription, failed delivery, or destructive action.

### Named Rules

**The Ten Percent Signal Rule.** Burnt Signal may occupy no more than a small fraction of a screen. If every panel is warm, nothing is active.

**The No Purple AI Chrome Rule.** Purple, blue-purple gradients, and decorative AI glows are prohibited for core product chrome.

## 3. Typography

**Display Font:** Inter, system UI fallback.
**Body Font:** Inter, system UI fallback.
**Label/Mono Font:** Use the same sans stack until logs, timings, or code-like diagnostics require a mono role.

**Character:** One clear product sans carries the whole interface. The typography should feel like a reliable utility, not a brand campaign.

### Hierarchy

- **Display** (720, 2rem, 1.15): Only for the app name, major empty states, or first-run setup headings.
- **Headline** (680, 1.375rem, 1.2): Use for panel headings and durable surface titles.
- **Title** (650, 1rem, 1.3): Use for controls, grouped settings, status modules, and card headings.
- **Body** (400, 1rem, 1.55): Use for explanations and recovery copy. Keep prose at 65-75ch.
- **Label** (700, 0.78rem, 1.25): Use for short control labels, status metadata, and field labels. Uppercase is allowed only for short technical labels.

### Named Rules

**The Product Scale Rule.** Do not use fluid viewport-scaled type in app surfaces. Product UI uses fixed rem steps so controls remain predictable.

## 4. Elevation

Depth is mostly tonal, not shadow-heavy. Panels separate through surface color, borders, and spacing. Shadows are allowed only for foreground tools that need separation from desktop or app content.

### Shadow Vocabulary

- **Panel Lift** (`0 8px 18px rgb(35 45 55 / 8%)`): Use for a floating voice dock or active recovery panel, not for every card.
- **Focus Ring** (`0 0 0 3px oklch(0.560 0.150 35 / 28%)`): Use for keyboard focus around interactive controls.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Elevation appears only when a panel must visually detach from surrounding content.

## 5. Components

Components should look familiar and task-oriented. Build states before decoration: default, hover, focus, active, disabled, loading, error, and selected must be defined before a component ships.

### Buttons

- **Shape:** Gently squared product controls (6px radius).
- **Primary:** Burnt Signal fill with white text, used for one primary command per surface.
- **Hover / Focus:** Slight tonal darkening on hover; visible focus ring using Burnt Signal at low alpha.
- **Secondary / Ghost:** Raised Surface or transparent background with Control Ink text and Calibration Line border.

### Chips

- **Style:** Compact rectangular chips (4px radius) with Instrument Surface fill and Control Ink text.
- **State:** Selected chips use a Burnt Signal marker, not a full saturated fill unless the state is critical.

### Cards / Containers

- **Corner Style:** 8px radius maximum for panels.
- **Background:** Raised Surface for foreground panels; Instrument Surface for grouped tool areas.
- **Shadow Strategy:** Follow the Flat-By-Default Rule.
- **Border:** One-pixel Calibration Line. No colored side stripes.
- **Internal Padding:** 22-32px for panels; 10-14px for compact rows.

### Inputs / Fields

- **Style:** Raised Surface background, Calibration Line border, 6px radius.
- **Focus:** Burnt Signal focus ring plus border shift.
- **Error / Disabled:** Error uses Failure Red text plus message. Disabled state reduces contrast only when still legible.

### Navigation

- **Style:** Compact tabs or segmented controls for modes. Settings should use predictable sidebar or tab navigation once it exists.
- **States:** Active navigation uses text weight and a small state marker. Avoid full-width saturated active backgrounds.
- **Mobile / Narrow Windows:** Collapse labels only when icon meaning is obvious and tooltips remain available.

### Voice Dock / Status Surface

- **Reference:** Adapt the Fixvox dock experience: tiny floating launcher, state chips, stop/cancel controls only while active, live VU/dots feedback, and recovery companion when needed.
- **Character:** A compact state machine, not a waveform showpiece or a large dashboard.
- **Idle:** Quiet launcher with one clear mic/dictation trigger.
- **Arming / Listening:** Active marker plus live audio feedback; text labels must remain available for accessibility where space allows.
- **Transcribing / Processing:** Short status chip such as Transcribing, Finding target, Cleaning up, Preparing output, or Inserting.
- **Delivering:** Show delivery target/confidence only when known and useful.
- **Failed / Uncertain:** Use Warning or Failure state with retry, copy fallback, or recovery companion. Do not claim paste observation without a verified observer.

## 6. Do's and Don'ts

### Do:

- **Do** make the current dictation state visible in text, not just color.
- **Do** keep the main surface compact enough for desktop overlay use.
- **Do** reserve Burnt Signal for primary action, active listening, and one selected state.
- **Do** use standard product controls before inventing custom affordances.
- **Do** include focus-visible treatment and reduced-motion behavior in every durable UI surface.
- **Do** distinguish "paste sent", "copy fallback", and "delivery observed" when those states exist.

### Don't:

- **Don't** use generic AI SaaS landing-page aesthetics.
- **Don't** use dark purple or blue gradient AI tool chrome in product windows; the dock may use a restrained dark/translucent utility-overlay treatment when adapting Fixvox ergonomics.
- **Don't** make the app look like an audio engineering dashboard.
- **Don't** make chat-first assistant UI the main surface for MVP 0-3.
- **Don't** copy Clipboard-manager UI patterns from Copicu unless a Dictation Tauri spec explicitly needs them.
- **Don't** imply delivery was observed when the app only sent paste or copied text.
- **Don't** use colored side stripes, gradient text, glassmorphism, decorative blobs, oversized hero sections, or repeated marketing card grids.
