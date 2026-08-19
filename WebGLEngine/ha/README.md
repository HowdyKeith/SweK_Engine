# Home Assistant panel wiring

Drops the VoxelEngine WebGL surface into your Home Assistant sidebar as
a custom `panel_iframe` panel. This is the "Path B" approach from the
earlier planning conversation: iframe the existing engine into HA so
you can hit it from the HA UI without authoring a separate panel.

## What gets installed

```
\\<HA host>\config\
├── configuration.yaml          ← appended with a panel_iframe entry
└── www\
    └── vba-gl-panel\
        └── panel.html          ← iframe wrapper, loads the engine
```

The iframe target defaults to `http://localhost:8787` — the Node bridge
on the same machine that's running HA in the iframe's tab. Override
with `-BridgeUrl http://192.168.x.y:8787` if the engine lives elsewhere
on the LAN.

## Prerequisites

1. **HA Samba share add-on** running. Settings → Add-ons → Samba share
   → Install + Start. Make sure the username/password let your Windows
   account write to the share.
2. **Node bridge running** on whatever machine you'll be opening the
   panel from. From the VoxelEngine root:
   ```
   node ai-bridge/server.js
   ```
3. **PowerShell 5+** on Windows (built into Win10/11).

## Install

Open PowerShell in `ha/`:

```powershell
./install.ps1
```

Defaults:
- HA hostname: `homeassistant`
- Share: `config`
- Panel folder: `vba-gl-panel`
- Bridge URL: `http://localhost:8787`

Custom:
```powershell
./install.ps1 -HostName "homeassistant.local" -BridgeUrl "http://192.168.1.42:8787"
```

The script:
1. Checks the Samba share is reachable
2. Copies `panel.html` to `config/www/vba-gl-panel/` (with the bridge
   URL substituted in)
3. Appends a `panel_iframe:` block to `configuration.yaml` — **only if
   one doesn't already exist**. If you already have other iframe panels,
   it prints the snippet for you to paste manually instead of trying to
   splice your YAML.
4. Prints restart instructions

Then in HA: Settings → System → Restart. After restart, "Engine Console"
appears in the sidebar with a gamepad icon.

## What the panel looks like

The panel is a full-screen iframe pointing at the bridge URL. A small
Voyager-blue status strip in the top-left shows the iframe target and
goes opaque on hover; click "reload" to refresh the iframe without
reloading the whole HA tab.

The status dot turns green when the iframe loads successfully, red if
it hasn't loaded after ~3 seconds (usually means the bridge isn't
running). This is a quick visual signal — no need to open browser
devtools.

## Cross-origin notes

The iframe loads `http://localhost:8787` from HA's origin
(`http://homeassistant.local:8123`). Since the iframe just _renders_ a
different origin (it doesn't try to script across the boundary), no
CORS or X-Frame-Options config is needed on the bridge.

If you do want the engine to talk back to HA (sending state, calling
services), you'd need either:
- HA's WebSocket API with a Long-Lived Access Token (the engine talks
  out, not the panel up); or
- `postMessage` between iframe and parent — but HA's `panel_iframe`
  doesn't expose a useful message bus on the parent side.

For most use cases (just opening the engine from the sidebar), neither
matters.

## Uninstall

```powershell
# Remove staged files
Remove-Item "\\homeassistant\config\www\vba-gl-panel" -Recurse -Force
```

Then edit `configuration.yaml` and delete the `panel_iframe:` block
(or just the `vba_gl:` entry if you have others). Restart HA.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Cannot reach \\\\homeassistant\\config" | Samba add-on not running, or hostname doesn't resolve. Try `-HostName` with the IP. |
| Panel appears in sidebar but page is blank/grey | Bridge URL is wrong, or Node server isn't running. Status dot in top-left will be red. |
| Status dot red on a remote machine | Bridge is bound to `localhost` only; rerun with `-BridgeUrl http://<your-LAN-IP>:8787` AND make sure the bridge listens on `0.0.0.0` (check `ai-bridge/server.js`). |
| "Mixed content" warning in browser | You're loading HA over HTTPS and trying to iframe an HTTP bridge. Use HTTP for HA or HTTPS-wrap the bridge. |
| Panel loads but engine looks broken | The engine itself has an issue — open `http://localhost:8787` directly in a normal browser tab to confirm. |

## Why not a "real" custom panel?

A custom HA panel (`panel_custom`) requires writing a LitElement
component, building a JS bundle, and registering it with HA's module
loader. For an engine that's already a self-contained web app, the
iframe approach gets you 95% of the experience for ~30 lines of HTML.
If you later want tighter HA integration (entity bindings, service
calls from inside the engine UI), the custom-panel route is open —
the engine's components can be re-exported as a LitElement wrapper.
