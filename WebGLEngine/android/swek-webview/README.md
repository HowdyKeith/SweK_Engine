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
