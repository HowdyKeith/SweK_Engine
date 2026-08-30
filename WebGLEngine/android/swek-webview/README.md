# SweK WebView wrapper — an APK that opens the SweK server

Keith: *"can we make a apk WebView wrapper app that installs a web page that points to our SweK server?"*

Yes. This is it: one `Activity`, one `WebView`, no dependencies. The APK is a few hundred KB.

## *** WHAT THIS IS NOT — READ THIS FIRST IF YOU CAME FROM InstallerX ***

**InstallerX-Revived is the wrong tool for this and cannot do it.** It is a *package installer* — a
replacement for Android's stock "do you want to install this app?" screen, with Root/Shizuku/Dhizuku
authorisation, batch APKM/XAPK support and install profiles. It **installs** APKs; it does not **create**
them, and it has nothing to do with WebViews or web pages. Checked against the repository itself, not
assumed from the name.

Two further reasons it is not a shortcut here even if it were adjacent:

- It is **GPL-3.0**. Deriving from it would make whatever we ship GPL-3.0 too.
- The thing it does well — flexible installation — is a problem we do not have. Sideloading one debug-signed
  APK is already a solved, one-tap flow.

It *could* be useful later on the receiving phone, as a nicer installer for rung 4 of
`ai-bridge/androidInviteBridge.js`'s consent ladder. That is a different job from building this.

## *** AND IT IS NOT THE HARD APK THE TREE ALREADY WARNED ABOUT ***

`ai-bridge/androidInviteBridge.js`'s `apkStatus()` says an APK here is hard:

> the Termux peer CANNOT simply be wrapped into one: Android's sandbox forbids any app writing into Termux's
> private home directory … a nodejs-mobile wrapper app … All three need an Android SDK toolchain.

That is true **and it is about a different APK**. That note is about wrapping the *Termux node peer* — i.e.
**running a server on the phone**. This app runs no server and hosts no node. It is a **client** that opens a
page over the network. Both end in `.apk`; they are three orders of magnitude apart in difficulty, and they
should not be confused.

## Why not just use the PWA we already ship?

The tree already has `manifest.webmanifest` (`display: fullscreen`), linked by `phone.html`. Chrome's
"Install app" turns that into a chrome-less home-screen launcher — most of what this app is, with no build.

**It does not work on the LAN, and that is the whole reason this project exists.** Chrome only offers PWA
install from a **secure origin** (https, or localhost). The SweK server on the LAN is plain
`http://192.168.50.57:8787`, so the install prompt never appears. A WebView has no secure-origin rule.

So: **the PWA is the right answer through the Cloudflare tunnel (https); this APK is the right answer on the
LAN.** Neither replaces the other. If you are mostly using the tunnel, install the PWA and skip this
entirely.

## Building it

**This cannot be built in the Claude sandbox and was not.** JDK 21 and Gradle are present here, but the
Android SDK is not, and `dl.google.com` is blocked by this container's egress proxy (measured: `CONNECT
tunnel failed, response 403`). Build it on your own PC.

What *was* verified here: every XML file is well-formed, and `MainActivity.java` parses with no syntax
errors. What was **not**: it has never been compiled or type-checked against the real `android.*` classes,
and no APK has ever been produced from it. Treat the first build as a real build, not a formality.

```bash
# one-time: Android Studio, or just the command-line tools + SDK 34
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"

cd android/swek-webview
gradle wrapper                 # first time only
./gradlew assembleDebug        # debug-signed and installable
```

The APK lands at `app/build/outputs/apk/debug/app-debug.apk`.

`assembleRelease` is deliberately **unsigned** — a signing key committed to a repo is a key that is no longer
a key. For sideloading, `assembleDebug` is what you want.

### Dropping it into the engine's own serving path

`ai-bridge/server.js` already serves APKs out of `ai-bridge/apks/` (basename-validated, no path traversal),
and `androidInviteBridge.js` already lists that directory. Both exist; the directory is simply empty. So:

```bash
cp app/build/outputs/apk/debug/app-debug.apk ../../ai-bridge/apks/swek-webview.apk
```

…and it becomes downloadable through the invite flow that is already built, with no server change. Installing
it still requires the phone's own unknown-sources approval, which is a consent act and should stay one.

## Using it

On first launch it asks for the server address (default `http://192.168.50.57:8787/`) and remembers it.

**To change the address later: long-press on empty page background.** A long-press on a link, image or text
does the normal WebView thing instead. If a page fails to load, it offers the address prompt automatically —
which is the case that matters, since a wrong address is usually discovered by nothing appearing.

That gesture is the only way in, so it is written down here on purpose. The first version of this used an
options menu, which under `Theme.NoTitleBar` has no action bar to hang it on and no hardware menu key on any
phone since ~2012: it compiled, looked like a settings menu, and was unreachable — leaving no way to fix a
wrong IP short of clearing app data.

## The six WebView settings that matter, and what each one breaks

A stock `WebView` will not run this engine. Each of these is off or wrong by default:

| Setting | What breaks without it |
|---|---|
| `setJavaScriptEnabled(true)` | Every page is an ES-module app; they render blank. |
| `setDomStorageEnabled(true)` | **`localStorage` is off by default.** The tree leans on it hard — `voxelEngine.kpopFavorites` (avatar favourites), `swek-dash`, `swek.serverAvatarSlots`, panel state. Without it the app works and silently forgets everything. |
| `setMediaPlaybackRequiresUserGesture(false)` | Engine audio/video that starts itself stays muted. |
| `onShowFileChooser` | `<input type=file>` does **nothing at all** — no error, the picker just never opens. This is what makes krbn-compare's "Load .glb / .obj / .stl" real on a phone. |
| `networkSecurityConfig` | Plain-http LAN loads are blocked outright. See below. |
| `FLAG_KEEP_SCREEN_ON` | A long-running canvas you watch rather than tap hits the screen timeout and reads as a freeze. |

## The cleartext compromise, stated plainly

`res/xml/network_security_config.xml` sets `cleartextTrafficPermitted="true"` **app-wide**, which is broader
than anyone would like.

The narrow version does not exist. The first draft of that file listed `<domain>192.168.0.0</domain>` and
friends with a confident comment about "private ranges only" — **Android's `<domain>` matches literal
hostnames, not CIDR**, at any version (confirmed against Android's own Network Security Config docs). That
config would not have matched `192.168.50.57`: the app would have shipped looking carefully secured while
failing to load the one address it exists to load, with an error that reads like the server being down.

What keeps it honest is *behavioural, not declarative*, and that is weaker: `MainActivity.shouldOverrideUrlLoading`
only lets the WebView navigate to the configured server and private-LAN hosts, and hands every other URL to a
real browser. So the app never walks itself onto an arbitrary public `http://` origin — but the platform is
not enforcing that, the code is.

## Permissions

`INTERNET` and `ACCESS_NETWORK_STATE`. That is all.

`CAMERA` and `RECORD_AUDIO` are **commented out** in the manifest rather than deleted — the avatar/face pages
genuinely use them, and `onPermissionRequest` is already wired to grant them *to our own origin only*. To
enable: uncomment the permission **and** add a runtime request. Declared-but-unused permissions make the
install prompt ask for more than the app does, which is how an install prompt stops being read.

## Android TV / NVIDIA Shield (v4117)

Keith: *"would we be able to create an apk for the shield which implemented the browser only node option, and
do anything useful?"* — then: *"add the leanback + D-pad TV support"*.

### The three manifest lines, each of which fails silently

None of these produce an error when missing. The app installs, or does not, and simply **is not there**.

- **`android.hardware.touchscreen` `required="false"`** — the one that actually blocks the install. Android
  assumes an app needs a touchscreen unless told otherwise, and a TV has none, so without it the Shield calls
  the app incompatible before anything else matters.
- **`LEANBACK_LAUNCHER`** in the intent filter — the TV home screen lists *only* this category. A plain
  `LAUNCHER` app installs and can then be started only by adb or a sideloaded file manager.
- **`android:banner`** — required for a leanback entry. It is `res/drawable/tv_banner.xml`, a **drawable rather
  than a PNG**: a binary in a repo is a file nobody can review in a diff and nobody can regenerate.

`leanback` is `required="false"`, not `true`. `true` would mean **TV-only** and strand every phone already
running this wrapper.

### The settings gesture was unreachable on a TV — the same bug this project already recorded once

`installSettingsGesture()` puts the server address behind a **long-press on the page background**, and a D-pad
remote cannot long-press a background because it has no pointer. That is precisely the failure
`MainActivity.java` already describes for the action bar — *"an engine on the wrong IP with no way to say so is
a brick"* — arriving a second time on a different device. On a TV the same dialog is bound to a **long-press of
OK** (and MENU, where a remote has one). Both entry points share one dialog.

### D-pad navigation, and the conflict it has to solve

`res/raw/tv_nav.js` is injected on **every** `onPageFinished` — injecting once would give the landing page a
working remote and every page after it none, which is worse than never working.

Arrow keys already mean something on many of these pages: flight demos, `es-*`, `chess3d`, and every canvas
that steers a camera. So there are two modes:

| mode | arrows | entered by | left by |
|---|---|---|---|
| **nav** | move **focus** between controls | default | — |
| **capture** | go to the **page**, untouched | OK on a `<canvas>` or `[data-tv-capture]` | **BACK** |

Text fields are passthrough in both modes — a D-pad is the only caret this device has.

BACK asks the page first, reading the answer off `evaluateJavascript`'s return value rather than adding an
`addJavascriptInterface` bridge, which would be a new attack surface bought for one boolean.

### Why the navigation is JavaScript rather than Java

Two reasons. Chromium's own spatial navigation is **not exposed by `WebSettings`** — there is no setter, and
the flag that enables it needs adb to write `/data/local/tmp/webview-command-line`, which an app cannot do for
itself. And writing it as an injected script means the hard half of TV support — *does pressing Right land on
the control to the right* — can be **driven in a headless browser against the tree's real pages**, which is
what `tools/ship/androidTvNav-selfcheck.mjs` section 5 does. The untestable half of this round is the small
half.

That gate caught a real bug in the first draft: ranking candidates by `along + 2 * cross` chose a control
sitting **diagonally** up-left (score 170) over one **exactly** to the left (score 200). No fixed multiplier
fixes that — it only moves where it happens. Candidates are now **partitioned by rectangle overlap on the
perpendicular axis** first, so anything in the same row beats anything merely near, which is how a person reads
a remote and needs no tuned constant.

### What still has not been done

**No APK has ever been built from this tree, including this round.** The Android SDK is absent here and
`dl.google.com` is blocked (measured: `CONNECT` 403). What *is* verified: every XML file parses, `javac`
reports 101 errors of which **zero are syntax errors** (all are missing-`android.*` resolution failures), and
the D-pad script is driven for real in Chromium. Treat the first build as a real build.

### And the honest limit on "do anything useful"

WebGPU on Android ships by default for **Android 12+ with Qualcomm/ARM GPUs**. The Shield is **Android 11**
(Shield Experience 9.2.4) on an **NVIDIA Tegra X1** — outside that on *both* axes. So expect **WebGL2 yes,
WebGPU probably no**, which makes the Shield a *display / console / presence* node rather than a GPU-audition
or compute peer. That is a prediction from release notes, **not a measurement** — open `/webgpu-llm.html` on
the device and let the page answer it.
