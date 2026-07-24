# Fixvox Pages site

This directory is the source owner for the public Fixvox landing page. It will
replace the legacy build currently served at `https://fixvox.pages.dev`.

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
