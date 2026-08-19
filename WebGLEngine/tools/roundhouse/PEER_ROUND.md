# SweK Peer Round (Android + iOS) — v2919–v2926

The mobile-peer work, in one place. If you unzipped a full `SweK_Engine_vNNNN.zip`, **the server is already
wired** — the installers below were run before packaging, so `server.js` and `server.html` already carry the
hooks. You only need the installers if you are applying this as a *patch* onto your own older tree.

## What it is

A phone or tablet can join the fleet as a peer. What that means depends on the platform:

- **Android** (real peer): Termux gives an unrestricted Node, so the full physics suite runs natively, the GPU
  auditions, and the ballot comes home. Hub: `/android-peer.html`.
- **iOS / iPadOS** (partial peer): no Termux, no native Node, no app push. What runs: the **portable physics
  subset** in Safari's JS engine, the **GPU audition** on the Apple GPU (a first-class third vendor), and the
  fleet console. Hub: `/ios-peer.html`. It is honest on the page about what iOS cannot do.

## Install on the phone (Termux) -- full walkthrough

### The one-paste version

Pasting a multi-line block into Termux **does** run each line as it arrives, so the whole install can be one
paste. Three things still cannot be automated and must happen first or in the middle, which is why this is not
simply "one command and walk away":

* **Installing the apps themselves** (Termux, and optionally Termux:API / Termux:Boot) happens in F-Droid,
  outside Termux. Nothing inside Termux can install them.
* **`termux-setup-storage` raises an Android permission dialog.** The block below pauses and waits up to 60
  seconds for you to tap **ALLOW**, instead of racing ahead and failing on a directory that does not exist yet.
* **The zip must already be downloaded** in Chrome on the phone.

With Termux installed and the zip downloaded, this whole block is one copy-paste. It stops at the first real
failure rather than continuing blindly, picks the **highest version number** if you have several zips (including
Chrome's `... (1).zip` duplicates), and leaves you in the right directory:

```
pkg update -y && pkg upgrade -y && pkg install -y nodejs unzip termux-api && \
{ [ -d "$HOME/storage/downloads" ] || { echo ">> Tap ALLOW on the storage prompt..."; termux-setup-storage; \
  n=0; while [ ! -d "$HOME/storage/downloads" ] && [ $n -lt 60 ]; do sleep 1; n=$((n+1)); done; }; } && \
{ [ -d "$HOME/storage/downloads" ] || { echo "!! storage still not granted - re-run termux-setup-storage and tap ALLOW"; false; }; } && \
ZIP="$(ls -1 "$HOME/storage/downloads"/SweK_Engine_v*.zip 2>/dev/null | sed 's/.*SweK_Engine_v\([0-9]*\).*/\1 &/' | sort -rn | head -1 | cut -d' ' -f2-)" && \
{ [ -n "$ZIP" ] || { echo "!! no SweK_Engine_vNNNN.zip in Downloads - download it in Chrome first"; false; }; } && \
echo ">> using: $ZIP" && cd "$HOME" && unzip -oq "$ZIP" && \
DIR="$(ls -1d "$HOME"/SweK_Engine_v*/ 2>/dev/null | sed 's/.*SweK_Engine_v\([0-9]*\).*/\1 &/' | sort -rn | head -1 | cut -d' ' -f2-)" && \
cd "${DIR}WebGLEngine" && echo "" && echo ">> READY in: $(pwd)" && \
echo ">> next: bash tools/roundhouse/termux_peer.sh   (15-25 min)"
```

It deliberately does **not** launch the suite -- that is a 15-25 minute run and should be a decision, not a
side effect. When it prints `READY`, start it yourself with `bash tools/roundhouse/termux_peer.sh`.

### The same thing step by step (use this to diagnose a failure)


**Get Termux from F-Droid, not the Play Store.** The Play Store build is abandoned and its package
repositories fail. Grab the APK from https://f-droid.org/packages/com.termux/ (or the Termux GitHub releases).
If you want start-on-boot persistence, also install the **Termux:Boot** add-on from the same place; if you want
`termux-wake-lock`, you need the **Termux:API** add-on app *as well as* the `termux-api` package -- the package
alone is only the client, and the commands silently do nothing without the companion app installed.

```
pkg update && pkg upgrade -y
pkg install nodejs unzip -y      # unzip is NOT installed by default -- this is a common first failure
termux-setup-storage             # tap ALLOW on the Android prompt; creates ~/storage/downloads
pkg install termux-api -y        # optional, for wake-lock (needs the Termux:API app too)
```

Then download `SweK_Engine_vNNNN.zip` in Chrome on the phone and extract it:

```
cd ~
ls ~/storage/downloads/SweK_Engine_v*.zip     # LOOK FIRST -- see exactly what you have
unzip -o ~/storage/downloads/SweK_Engine_v2942.zip     # name it EXPLICITLY, no glob
cd SweK_Engine_v2942/WebGLEngine
```

### If the extract or `cd` fails, it is almost always one of these four

Name the version explicitly rather than globbing, and these mostly disappear. Diagnose with
`ls ~/storage/downloads/ | grep -i swek` and `ls ~`.

1. **More than one zip downloaded.** `unzip ~/storage/downloads/SweK_Engine_v*.zip` looks like it means "unzip
   the SweK zip", but if the glob matches two or more files, `unzip A.zip B.zip` means *"extract the member
   named B.zip out of A.zip"* -- so it prints `caution: filename not matched` and extracts nothing useful.
   Likewise `cd SweK_Engine_v*/WebGLEngine` with two extracted folders fails with *too many arguments*.
   **Fix: name the exact version in both commands.**
2. **Chrome renamed the file.** A second download of the same name becomes `SweK_Engine_v2942 (1).zip` -- the
   space and parentheses break an unquoted glob. **Fix: quote it**, e.g.
   `unzip -o "$HOME/storage/downloads/SweK_Engine_v2942 (1).zip"`.
3. **`termux-setup-storage` was never run, or was denied.** Then `~/storage/downloads` does not exist at all and
   every path under it fails. **Check with `ls ~/storage/`** -- if it is empty or missing, re-run
   `termux-setup-storage` and tap ALLOW. (Android's own folder is `Download`, singular; `~/storage/downloads` is
   the symlink Termux creates to it. Use the Termux path.)
4. **`unzip` is not installed.** The error is `unzip: command not found`, which is easy to misread as a path
   problem. **Fix: `pkg install unzip -y`.**

Sanity check that you are in the right place before running anything:

```
pwd                    # should end in .../SweK_Engine_vNNNN/WebGLEngine
ls tools/roundhouse/termux_peer.sh    # should exist
```

## Operating it (Android)

1. Operator (on the host or LAN) opens `/android-peer.html`, sweeps for candidates, and mints an invite for one.
2. The phone's owner opens the invite link, installs Termux, and runs the one-line bootstrap it shows.
3. `bash tools/roundhouse/termux_peer.sh` on the phone runs the suite (~15–25 min) and drops
   `android-phone.json` into shared Downloads.
4. Optionally, open `/magmap-android.html` in Chrome to audition the GPU.
5. Operator presses **grade the ballot** on the hub. The verdict is written to the peer info pool
   (served at `/android/verdict` and copied to Downloads).

### Optional: persistence (longitudinal, v2935)

To have the phone re-run on every boot and build the survival ledger that grades `survivesDoze` /
`survivesMemoryPressure`, the phone's owner installs the **Termux:Boot add-on from F-Droid** (the Play Store
build is deprecated and silently will not run boot scripts), then, once, in Termux:

```
mkdir -p ~/.termux/boot
cp ~/SweK_Engine*/WebGLEngine/tools/roundhouse/termux_boot_peer.sh ~/.termux/boot/
chmod +x ~/.termux/boot/termux_boot_peer.sh
```

From then on each boot appends a `started`/`finished` pair to
`~/storage/downloads/swek-persistence-ledger.jsonl`. Upload that file with the transcript; the desktop
`androidVerdict.mjs` grades the two survival predictions from it (`gradePersistence`). Grade it on the desktop with:

```
node tools/roundhouse/androidVerdict.mjs android-reference.json android-phone.json magmap-report.json swek-persistence-ledger.jsonl
```

(the magmap and ledger arguments are optional and positional; pass `""` for magmap if you have a ledger but no GPU report). Note the boundary: this
gives start-on-boot and Doze survival, **not** a foreground service — Android still reaps Termux under memory
pressure, and a reap in the ledger *confirms* that prediction rather than failing it. A true service needs a
nodejs-mobile wrapper app, which is a project, not a config step.

Neither F-Droid nor the Termux GitHub repo is a place to publish these scripts: those host the Termux app and
its add-ons (Termux:Boot, Termux:API). Our scripts run *inside* Termux and depend on those add-ons; there is
nothing to submit upstream. What you install from F-Droid is Termux:Boot itself.

## Security model (v2926)

The `/android/*` routes split in two:

- **Operator routes** — `candidates`, `invite`, `push`, `status`, `verdict` — are **trusted-only**: reachable
  from the host, the LAN, or an authenticated session, and **refused (403) over the Cloudflare tunnel**. A
  remote visitor must not be able to enumerate the host's LAN devices/MACs, mint invites, or reach the push
  endpoint.
- **Phone routes** — `join`, `manifest`, `bootstrap.sh` — are **token-gated**, so a remote phone that was
  *handed an invite link by the operator* still works. The token is the capability; handing it out is the
  consent.

The APK push (`adb`) additionally requires a verbatim consent phrase AND the phone's owner to have enabled
wireless debugging and approved this host — none of which can be bypassed from the server. There is no APK
that repackages Termux (Android's sandbox forbids it); the working path is the bootstrap script.

## Installers (patch-delta only)

Idempotent, marker-wrapped, and they edit copies in tests — never the real tree as a side effect. A second run
is a byte-identical no-op; a missing anchor prints the exact line to hand-paste rather than guessing.

    node ai-bridge/installAndroidPeerBridge.mjs     # front door: /android/status, /android/verdict + the header button
    node ai-bridge/installPeerConsoleAge.mjs        # peer rows show "console active Ns ago" (surfaces _lastConsoleHit)
    node ai-bridge/installIosPeerButton.mjs         # the iOS Peer header button

## The gates

Run any of these with `node tools/roundhouse/<name>-selfcheck.mjs`:

| gate | covers |
|---|---|
| `androidPeer` | the six items + the frozen registration (manifest-level) |
| `androidVerdict` | the grader: reference defines the graded set, slow ≠ wrong, right host or no verdict |
| `magmapAndroid` | the GPU experiment: browser-safe kernel graph, specified-ops-only WGSL |
| `androidPeerBridge` | the front door: routes, pool write-back, installer idempotency |
| `androidInvite` | the consent ladder + the v2926 trust gate (remote refused, token honoured) |
| `peerVisibility` | tunnel detection, the operator-route block, peer console-age installer |
| `iosPeer` | the portable subset (pure, correct), Apple graded first-class, page honesty |

The reference transcript the phone is graded against is
`tools/roundhouse/android-reference.json`.

## Known limits (stated, not hidden)

- The whole round is verified in a sandbox, not on real phones. Confirm on hardware: the ARP/adb behaviour on
  your LAN, that your tunnel passes `cf-ray` (the trust gate falls back to hostname if not), and that
  Safari 18 reports a usable `adapter.info.vendor` of "apple".
- iOS has no Downloads folder a magmap report lands in automatically; the report goes to the Files app and is
  handed back manually.
- Persistence (start-on-boot, surviving memory pressure) is the genuinely hard part on both platforms and is
  registered as a prediction, not a solved feature.
