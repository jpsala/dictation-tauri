# Fixvox Pages site

This directory owns the public Fixvox landing page served at
`https://fixvox.pages.dev`.

## Current production

- Source deployment commit: `6ba7f54a8484e8702682debbd160bca5d73ec205`.
- Cloudflare Pages deployment: `https://0e00217a.fixvox.pages.dev`.
- Installer release: `fixvox-tauri-v0.1.0-20260724125602`.
- Installer SHA-256:
  `53115eb673f2b9e72a6782c151a29a122675d2dcaf34a68dbb3e3e048510bd2a`.

## Local commands

From the repository root:

```powershell
npm run site:dev
npm run site:build
npm run site:preview
```

`site:build` writes ignored output to `site/dist/`.

## Installer link contract

The landing page does not host the Windows installer. Release artifacts remain
in the public `jpsala/fixvox-releases` repository.

For a release build, set `VITE_FIXVOX_INSTALLER_URL` to a verified Tauri asset
whose URL ends in `Fixvox-Tauri-Setup.exe`. Without that variable, download
links stay disabled and explain that publication is pending. Never point the
page at the legacy Electrobun `Fixvox-Installer.exe` channel.

## Deployment gate

The Cloudflare Pages project is `fixvox`. Deployment is an external production
mutation and requires explicit authorization after:

1. publishing and redownloading the corrected Tauri installer;
2. verifying its checksum;
3. building this site with the exact published asset URL;
4. checking desktop and mobile screenshots;
5. confirming that no private artifacts, account data, or secrets are in `site/dist/`.

A direct upload would use Wrangler against `site/dist/`, but the command and
any Wrangler installation or authentication must be approved separately. Do
not copy the legacy repo's `.wrangler`, cache, or account metadata into this
repository.
