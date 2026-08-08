---
description: Commit, push, publish and install a verified Windows prerelease
---

Execute the complete Fixvox Tauri Windows release workflow for the current repository.

`/release` is explicit authorization for exactly these effects in this run: commit the reviewed intended changes, push `main` to `origin`, publish one unsigned Windows prerelease in `jpsala/fixvox-releases`, install the verified published installer on this machine, launch the installed app for a provider-free smoke, and return the direct installer URL. It does not authorize cloud/VPS/Admin deployment, DNS, provider calls, OAuth/login, microphone/audio, real hotkeys, clipboard mutation, or selection replacement.

Optional arguments are a preferred commit message: `$ARGUMENTS`. If empty, derive a concise conventional commit message from the reviewed diff.

Follow this fail-closed workflow without pausing between successful phases:

1. **Preflight and scope**
   - Read the active release track/runbook and repository guardrails.
   - Confirm the current branch is `main`, `origin` is the expected source repository, and GitHub CLI authentication can access `jpsala/fixvox-releases`; never print credentials or auth tokens.
   - Review the complete working tree and diff. Preserve unrelated user work. Include only intended source, tests, and durable docs. Exclude `.env`, secrets, tokens, raw transcripts, audio, caches, build output, temporary files, screenshots, and ignored artifacts.
   - Stop before any external effect if ownership of a changed file is ambiguous, a secret-like file is staged, the branch/remote is wrong, or required release tooling is unavailable.

2. **Validate before commit**
   - Run the focused tests for the changed contracts plus `npm run check`.
   - Run any additional repo-required release gate named by the active track.
   - Do not suppress warnings or continue past a failing check.

3. **Commit and push**
   - Stage explicit reviewed paths, never blanket-stage with `git add -A` or `git add .`.
   - Inspect the staged summary and confirm no excluded path is present.
   - Commit with the supplied `$ARGUMENTS` message, or the derived conventional message when arguments are empty.
   - Push `main` to `origin`, then verify local `HEAD` equals `origin/main`.
   - If there is no intended diff, reuse the existing pushed `HEAD`; do not create an empty commit.

4. **Build from pushed source**
   - Require a clean tracked tree at the pushed commit.
   - Run `npm run release:windows`. This is the canonical gate and must complete its focused product tests, frontend build, Rust formatting/check/test compile, and unsigned NSIS build.
   - Locate the single generated installer under `src-tauri/target/release/bundle/nsis/`, record its byte size, and compute SHA-256 without printing unrelated local data.

5. **Publish the prerelease**
   - Read the desktop version from the canonical Tauri configuration.
   - Create a UTC tag `fixvox-tauri-v<version>-<YYYYMMDDHHmmss>`.
   - Stage release assets only in an ignored temporary/artifact directory, naming them exactly `Fixvox-Tauri-Setup.exe` and `Fixvox-Tauri-Setup.exe.sha256.txt`.
   - The checksum file must contain the lowercase SHA-256 and canonical installer filename.
   - Create a GitHub **prerelease** in `jpsala/fixvox-releases` with source commit, validation summary, unsigned-installer warning, and both assets. Do not create or modify a cloud/VPS deployment.
   - Fetch the published release metadata and require both canonical assets to exist.

6. **Verify published bytes**
   - Download both assets fresh from GitHub into a new ignored directory.
   - Require the original installer SHA-256, checksum-file SHA-256 value, and redownloaded installer SHA-256 to be identical. Stop and report the release as unusable if any value differs.

7. **Install locally and smoke**
   - Emit a visible console notice and beep immediately before installation.
   - Install the freshly redownloaded `Fixvox-Tauri-Setup.exe` silently and require exit code `0`. Do not terminate unrelated processes; only close an existing installed Fixvox Tauri process when the installer requires it.
   - Verify the installed executable/uninstall entry and version, launch the installed app, and perform only a provider-free startup smoke. Do not trigger login, dictation, audio, clipboard, selection, or global-hotkey actions.
   - Leave the installed app in its normal ready state unless the smoke requires a controlled shutdown.

8. **Return evidence**
   - Report the source commit, pushed branch parity, tag, release URL, direct installer URL, byte size, SHA-256 equality, local installer exit code, installed version, and startup-smoke result.
   - End with the direct URL on its own line in this exact shape:

     `https://github.com/jpsala/fixvox-releases/releases/download/<tag>/Fixvox-Tauri-Setup.exe`

Never claim completion from a local build alone. Completion requires push, published asset redownload/hash equality, successful local installation, startup smoke, and the direct installer URL.