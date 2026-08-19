# Publishing the add-on repository (so the install button works)

The "Install HA Panel" button opens a **My Home Assistant** redirect that adds
*this repo* as an add-on repository. That only works once the repo is public on
GitHub and `HA_ADDON_REPO_URL` in `modHAInstall.bas` points at it.

## 1. Push this folder to a public GitHub repo
From `HomeAssistant/ha-vbaengine-addon/`:
```bash
git init
git add .
git commit -m "VBA Engine Panel add-on v0.1.0"
git branch -M main
git remote add origin https://github.com/YOURNAME/ha-vbaengine-addon.git
git push -u origin main
```

## 2. Point the engine at it
In `VBAEngineCore/modHAInstall.bas` set:
```vba
Private Const HA_ADDON_REPO_URL As String = "https://github.com/YOURNAME/ha-vbaengine-addon"
```
(Re-import the module into the workbook.)

## 3. Build the slim engine into the add-on before pushing (delivery mode)
```bash
node ../slim-build.mjs        # fills vbaengine_panel/www/ from the full engine
```
Commit the generated `www/` (or wire it into CI). The placeholder page is only a
fallback if `www/` is empty.

## 4. Add the one-click badge to this repo's README (optional, nice)
```md
[![Add repository to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FYOURNAME%2Fha-vbaengine-addon)
```

## 5. Install flow the user sees
Button (or badge) → HA opens → **Add** repository → Add-on Store shows
**VBA Engine Panel** → **Install** → **Start** → toggle **Show in sidebar**.

## Notes
- Requires HA with the Supervisor (HA OS / Supervised). Core/Container users use
  `panel_custom` or HACS (see DOCS.md), or the iframe route (`ha/install.ps1`).
- Versioning: bump `version:` in `vbaengine_panel/config.yaml` on each change so
  the Supervisor offers an update.
