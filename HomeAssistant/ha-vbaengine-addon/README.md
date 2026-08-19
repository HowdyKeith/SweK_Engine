# VBA Engine — Home Assistant add-on repository

A Home Assistant add-on that serves a slimmed WebGL engine build as a sidebar
**panel** via ingress. Because the engine ships *inside* the add-on, installing
the add-on installs the engine — no separate prerequisite step.

> **Before publishing:** run `./set-repo.ps1 -User <your-github-username>` to stamp
> your repo URL into `repository.yaml`, `config.yaml`, the badge below, and the VBA
> installer. Then push (commands in `PUBLISHING.md`).

[![Add repository to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FYOURNAME%2Fha-vbaengine-addon)

Once the repo is public on GitHub, the badge above is the **one-click install
button**: it opens your Home Assistant and pre-fills this repo in the add-on store.

## Install
1. **Settings → Add-ons → Add-on Store → ⋮ → Repositories**, paste this repo's
   GitHub URL, **Add**.
2. The **VBA Engine Panel** add-on appears in the store → **Install** → **Start**.
3. Enable **Show in sidebar**. The panel opens via ingress (HA handles auth/TLS).

> Requires a Home Assistant install with the Supervisor (HA OS or Supervised).
> On Core/Container, use `panel_custom` or HACS instead (see add-on DOCS.md).

## Replace the placeholder with your real build
Drop your slimmed engine build into `vbaengine_panel/www/`. **Ingress rule:** all
asset paths must be **relative** (`./main.js`), never absolute (`/main.js`).
