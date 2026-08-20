# SweK Skyrim Telemetry — option 3 (no-compile, PapyrusUtil)

The bridge connector (`skyrimBridge.js`) is done and validated. Skyrim has no turnkey
telemetry endpoint, so this path has the game **write a JSON file** that the bridge
reads — no SKSE C++ plugin to compile.

## What you install on the rig
1. **SKSE64** (skse.silverlock.org) — you almost certainly already have it.
2. **PapyrusUtil SE** (Nexus) — provides `JsonUtil`, which lets Papyrus write JSON files.
3. The **SweK telemetry script** below, attached to a tiny looping quest (an .esp).

## How it works
A Papyrus script reads the player's actor values every few seconds and writes them to
a JSON file via `JsonUtil`. The bridge polls that file's mtime and parses it.

Point the connector at the file:
```js
window.skyrim && fetch("/skyrim/config", { method:"POST", headers:{"Content-Type":"application/json"},
  body: JSON.stringify({ enabled:true, filePath:"C:\\\\Users\\\\howdy\\\\Documents\\\\My Games\\\\Skyrim Special Edition\\\\SKSE\\\\swek_telemetry.json" }) });
```
Then open **`/skyrim.html`**.

## Where JsonUtil writes
`JsonUtil.Save(path)` writes relative to the game's runtime dir unless given an absolute
path. Simplest: write to an absolute path under `My Games\\...\\SKSE\\` and set the
connector `filePath` to match. Confirm the actual path it lands at on your rig and adjust.

## HONEST STATUS
The bridge + view are tested/clean. The Papyrus script (`SweK_Telemetry.psc`) is an
**untested scaffold** — I can't run the Creation Kit / compile Papyrus here. The actor
values + JsonUtil calls are standard; the bit to verify is the exact `JsonUtil` function
names/signatures against your PapyrusUtil version and the file path it actually writes.
Wrap it in a quest with a `RegisterForSingleUpdate` loop. Send me the Papyrus log if it
doesn't write and I'll correct it.

JSON shape the bridge expects (any subset works):
```json
{ "name":"Dragonborn", "level":34, "health":420, "healthMax":420,
  "magicka":180, "magickaMax":200, "stamina":150, "staminaMax":150,
  "gold":12840, "location":"Whiterun" }
```
