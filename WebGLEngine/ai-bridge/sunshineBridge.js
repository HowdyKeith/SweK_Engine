// FILE: ai-bridge/sunshineBridge.js -- v4154
//
// *** THE HOST HALF. *** Keith asked whether features could be pushed INTO Moonlight V+
// (qiin2333/moonlight-vplus). Read for real, the answer is no and the reason is structural: that app has no
// ServerSocket, no HttpServer, no exported service and no content provider -- four exported components in its
// whole manifest, of which one is the main activity, one a home-screen widget, and one the shortcut trampoline
// below. MOONLIGHT IS A CLIENT. It dials OUT to a Sunshine/GameStream host, and the only channel that exists is
// video and audio down, INPUT UP. So you never add features to the client; you add them to the HOST and the
// client relays them. That is what this bridge installs.
//
// What it buys the engine: a SweK screen streaming to a phone at up to 165 Hz, and the phone's touch, stylus,
// gyroscope and gamepad arriving back as real input events -- the SweK remote with gyro aim, using their
// on-screen key editor rather than one written here.
//
// ---- LICENCE, AND WHY NOTHING IS VENDORED ------------------------------------------------------------------
// Sunshine (LizardByte/Sunshine) is GPL-3.0. This bridge NEVER vendors it, never links it, never reimplements
// any part of it: it shells out to a binary the user installed through their own platform's package manager,
// which is the same arrangement ntfsMounterBridge uses for a script whose licence is absent entirely. The
// engine ships no Sunshine code, so the engine's release zip carries none.
//
// ---- *** WHAT HAS NEVER BEEN RUN, SAID FIRST RATHER THAN LAST *** -------------------------------------------
// NO SUNSHINE HAS EVER RUN AGAINST THIS BRIDGE. The box this was written on has no GPU, no Sunshine binary and
// no flatpak; every install command below is transcribed from LizardByte's own documentation and NOT executed
// here. detect() and the refusals ARE exercised by the gate, because they are the paths that must behave on a
// box with nothing installed -- which is this one. Everything past "the binary exists" is unverified, and
// sunshine.html says so per row rather than in a footnote.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFile } = require("child_process");

const UPSTREAM = Object.freeze({
    project: "LizardByte/Sunshine",
    repo: "https://github.com/LizardByte/Sunshine",
    license: "GPL-3.0",
    what: "a self-hosted game-stream HOST that Moonlight clients connect to",
    client: "qiin2333/moonlight-vplus (GPL-3.0) -- the Android client this pairs with; also any stock Moonlight",
});

// Sunshine's own defaults, kept rather than renumbered so a user's existing install is found unchanged.
const WEB_PORT = 47990;          // its configuration UI, https, self-signed
const DEFAULT_HOST = "127.0.0.1";

// *** THE INSTALL LINE PER PLATFORM, AND NOT ONE OF THEM IS RUN WITHOUT A BUTTON PRESS. ***
// SteamOS's root filesystem is read-only, so flatpak is the only one of these that works on a Deck unmodified
// -- the same reason install-steamdeck.sh reaches for Distrobox rather than pacman.
const INSTALL = Object.freeze({
    linux:  { cmd: "flatpak", args: ["install", "-y", "--user", "flathub", "dev.lizardbyte.app.Sunshine"],
              note: "flatpak, --user so it needs no root. The only route that works on SteamOS's read-only root." },
    win32:  { cmd: "winget", args: ["install", "-e", "--id", "LizardByte.Sunshine"],
              note: "winget. LizardByte also ship an .exe installer for boxes without it." },
    darwin: { cmd: "brew", args: ["install", "--cask", "sunshine"],
              note: "Homebrew cask. LizardByte call macOS support EXPERIMENTAL and without hardware encoding; " +
                    "this bridge repeats that rather than presenting the three platforms as equal." },
});

// The binaries a detect() should find, per platform, in the order worth trying.
const PROBES = Object.freeze({
    linux:  [["flatpak", ["run", "dev.lizardbyte.app.Sunshine", "--version"]], ["sunshine", ["--version"]]],
    win32:  [["sunshine.exe", ["--version"]], ["sunshine", ["--version"]]],
    darwin: [["sunshine", ["--version"]]],
});

// *** WHAT THIS BRIDGE REFUSES TO DO. *** Each line is a thing that would be easy, looks helpful, and is wrong.
const REFUSED = Object.freeze([
    { what: "type the pairing PIN for you",
      why: "pairing is a FOUR-DIGIT SECRET the phone shows and a human types into Sunshine's own web UI. A " +
           "bridge that automated it would be a bridge that can pair ANY client that reaches this port, which " +
           "is the entire control that stops a stranger on the LAN streaming your desktop." },
    { what: "store or forward Sunshine's web-UI credentials",
      why: "Sunshine keeps its own username and password. Proxying them through this engine would put a second " +
           "copy of a credential in a second place, and the engine has no better claim to hold it than Sunshine." },
    { what: "reimplement any part of the encoder or the protocol",
      why: "it is GPL-3.0 and it is also 40,000 lines of NVENC/VAAPI/VideoToolbox handling that a reimplementation " +
           "would get wrong. This bridge starts a process and reads its status." },
    { what: "open the host to the internet, or configure a tunnel to it",
      why: "a game-stream host is a REMOTE DESKTOP with an input channel. cloudflareTunnel.js exists and is " +
           "deliberately not called from here: exposing this is a decision that needs its own sentence from a " +
           "person, not a side effect of pressing Install." },
    { what: "auto-start it with the engine",
      why: "it grabs a display, a GPU encoder and an audio device. Something that heavy starting because the " +
           "engine started is the surprise this tree's launch guard exists to prevent." },
]);

// ------------------------------------------------------------------------------------------------------------
// Detection -- the only part of this file this box can actually exercise
// ------------------------------------------------------------------------------------------------------------

function _run(cmd, args, timeout = 8000) {
    return new Promise((resolve) => {
        try {
            execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
                resolve({ ok: !err, out: String(stdout || "") + String(stderr || ""), err: err && err.message });
            });
        } catch (e) { resolve({ ok: false, out: "", err: String((e && e.message) || e) }); }
    });
}

/** Is a Sunshine binary reachable, and by which route? Never installs, never starts. */
async function detect() {
    const probes = PROBES[process.platform] || [];
    for (const [cmd, args] of probes) {
        const r = await _run(cmd, args);
        // --version prints and exits 0 on a real install; a missing binary is ENOENT, which _run reports as !ok.
        if (r.ok) {
            const m = /(\d+\.\d+\.\d+)/.exec(r.out);
            return { ok: true, found: true, via: cmd, version: m ? m[1] : null, raw: r.out.trim().slice(0, 200) };
        }
    }
    return { ok: true, found: false, platform: process.platform,
             hint: (INSTALL[process.platform] || {}).note || "no install route is recorded for this platform" };
}

// ------------------------------------------------------------------------------------------------------------
// Install / start / stop
// ------------------------------------------------------------------------------------------------------------

let _job = null;        // the install, if one is running
let _proc = null;       // the running host, if this bridge started it

function installStatus() { return _job ? { ok: true, running: !_job.done, kind: _job.kind, code: _job.code, log: _job.log.slice(-80) } : null; }

/** Run the platform's package manager. Refuses to start a second one. */
function install() {
    if (_job && !_job.done) return { ok: false, error: "an install is already running" };
    const spec = INSTALL[process.platform];
    if (!spec) return { ok: false, error: "no install route for " + process.platform, refused: true };
    _job = { kind: spec.cmd, done: false, code: null, log: [] };
    const push = (s) => { _job.log.push(String(s).trimEnd()); if (_job.log.length > 400) _job.log.shift(); };
    push("$ " + spec.cmd + " " + spec.args.join(" "));
    let child;
    try { child = spawn(spec.cmd, spec.args, { windowsHide: true }); }
    catch (e) { _job.done = true; _job.code = -1; push(String((e && e.message) || e)); return { ok: false, error: "could not spawn " + spec.cmd }; }
    child.stdout && child.stdout.on("data", (b) => push(b));
    child.stderr && child.stderr.on("data", (b) => push(b));
    child.on("error", (e) => { push("spawn error: " + ((e && e.message) || e)); _job.done = true; _job.code = -1; });
    child.on("exit", (code) => { _job.done = true; _job.code = code; push("exit " + code); });
    return { ok: true, started: true, kind: spec.cmd, note: spec.note };
}

/** Start the host. The handle is KEPT so status() can tell whether the kill landed (v4152's rule). */
function start() {
    if (_proc) return { ok: true, already: true, note: "this bridge already started one" };
    const spec = process.platform === "linux"
        ? { cmd: "flatpak", args: ["run", "dev.lizardbyte.app.Sunshine"] }
        : { cmd: "sunshine", args: [] };
    let child;
    try { child = spawn(spec.cmd, spec.args, { detached: false, windowsHide: true, stdio: "ignore" }); }
    catch (e) { return { ok: false, error: "could not start: " + ((e && e.message) || e) }; }
    _proc = child;
    child.on("exit", () => { _proc = null; });
    child.on("error", () => { _proc = null; });
    return { ok: true, started: true, pid: child.pid, webUi: "https://" + DEFAULT_HOST + ":" + WEB_PORT,
             next: "open the web UI, set a username and password, then pair the phone with the PIN IT shows you" };
}

function stop() {
    if (!_proc) return { ok: true, running: false, note: "this bridge did not start one" };
    try { _proc.kill(); } catch {}
    // Handle KEPT; the exit listener clears it. A kill SENDS a signal (v4152), so this says stopping, not stopped.
    return { ok: true, stopping: true, verifyWith: "status().running" };
}

async function status() {
    const d = await detect();
    return {
        ok: true,
        upstream: UPSTREAM,
        installed: d.found, via: d.via || null, version: d.version || null,
        running: !!_proc, pid: _proc ? _proc.pid : null,
        webUi: "https://" + DEFAULT_HOST + ":" + WEB_PORT,
        installRoute: INSTALL[process.platform] || null,
        installJob: installStatus(),
        refused: REFUSED,
        // *** THE HONEST LINE, CARRIED IN EVERY REPLY RATHER THAN LIVING IN A HEADER SOMEBODY READ ONCE. ***
        verified: "detection and every refusal are gated and run. NO SUNSHINE HAS EVER RUN AGAINST THIS BRIDGE: " +
                  "the box it was written on has no GPU and no Sunshine, so install/start/stop are transcribed " +
                  "from LizardByte's documentation and unexecuted.",
    };
}

// ------------------------------------------------------------------------------------------------------------
// *** THE OTHER HALF KEITH ASKED FOR: am start, FROM THE DECK, INTO MOONLIGHT ***
// ------------------------------------------------------------------------------------------------------------
//
// The ONE push surface that app has. ShortcutTrampoline is android:exported="true" and reads its host from an
// intent extra, so anything holding adb -- the Deck does, since install-steamdeck.sh gained android-tools at
// v4142 -- can launch it straight into a host and an app. LAUNCH-ONLY AND ONE-WAY: there is no reply, no
// status, and no second command. Anything more would need a surface the app does not have.
//
// EVERY ONE OF THESE STRINGS WAS READ OUT OF THE SOURCE, NOT GUESSED, and two of them would have failed
// silently if they had been:
//   * the package is com.limelight.root, NOT upstream Moonlight's com.limelight -- this fork suffixes it, and
//     the stock name would have targeted an activity that is not installed.
//   * the trampoline reads AppId with getStringExtra and calls .toInt() on it, while Game reads the same key
//     with getIntExtra. So it must be sent as a STRING (--es), and --ei would be dropped on the floor.
// (AppView.kt:128-129 for UUID/Name; Game.kt:2962-2969 for the rest.)
const MOONLIGHT = Object.freeze({
    package: "com.limelight.root",
    activity: "com.limelight.ShortcutTrampoline",
    extras: Object.freeze({ uuid: "UUID", name: "Name", appId: "AppId", appName: "AppName", hdr: "HDR" }),
});

// A value that reaches an argument list is checked, even though execFile uses no shell -- the day somebody
// swaps execFile for exec, the argument shape is all that is left. (githubBridge's own argument, same rule.)
const SAFE_SERIAL = /^[\w.:-]{1,64}$/;
const SAFE_UUID = /^[0-9A-Fa-f-]{1,64}$/;
const SAFE_APPID = /^\d{1,12}$/;

/**
 * Launch Moonlight V+ on a connected Android device, straight into a host (and optionally an app).
 *
 * @param o.serial   adb device serial; optional when exactly one device is attached
 * @param o.uuid     the host's UUID as Moonlight knows it -- OR
 * @param o.name     the host's NAME. The trampoline falls back to getComputerByName when UUID is empty
 *                   (ShortcutTrampoline.kt:313-317), so a human-readable PC name is enough and is friendlier:
 *                   the Deck does not have to learn the phone's internal id for a machine.
 * @param o.appId    numeric app id, sent as a string (see the note above); omit to land on the app list
 */
async function launchMoonlight(o = {}) {
    const serial = (o.serial || "").trim();
    const uuid = (o.uuid || "").trim();
    const name = (o.name || "").trim();
    const appId = (o.appId === undefined || o.appId === null) ? "" : String(o.appId).trim();
    const appName = (o.appName || "").trim();

    if (!uuid && !name) return { ok: false, error: "need a host: pass uuid, or name (the PC's name in Moonlight)" };
    if (serial && !SAFE_SERIAL.test(serial)) return { ok: false, error: "bad adb serial: " + serial };
    if (uuid && !SAFE_UUID.test(uuid)) return { ok: false, error: "bad uuid: " + uuid };
    if (appId && !SAFE_APPID.test(appId)) return { ok: false, error: "appId must be digits, got: " + appId };

    const probe = await _run("adb", ["version"], 6000);
    if (!probe.ok) {
        return { ok: false, error: "adb is not on PATH. On a Steam Deck, install-steamdeck.sh offers android-tools (v4142); " +
                                  "elsewhere it ships with Google's platform-tools." };
    }
    const args = [];
    if (serial) args.push("-s", serial);
    args.push("shell", "am", "start", "-n", MOONLIGHT.package + "/" + MOONLIGHT.activity);
    if (uuid) args.push("--es", MOONLIGHT.extras.uuid, uuid);
    if (name) args.push("--es", MOONLIGHT.extras.name, name);
    if (appId) args.push("--es", MOONLIGHT.extras.appId, appId);
    if (appName) args.push("--es", MOONLIGHT.extras.appName, appName);

    const r = await _run("adb", args, 15000);
    // *** `am start` EXITS 0 EVEN WHEN THE ACTIVITY DOES NOT EXIST -- it prints "Error type 3 ... does not
    // exist" on stdout and still succeeds. *** Reporting ok on the exit code alone would say "launched" for a
    // phone with no Moonlight on it, which is the silent-success failure this tree keeps paying for.
    const out = (r.out || "").trim();
    const failed = /Error type|does not exist|Exception|Permission Denial/i.test(out);
    return {
        ok: r.ok && !failed,
        launched: r.ok && !failed,
        command: "adb " + args.join(" "),
        output: out.slice(0, 400),
        error: failed ? "am start reported: " + out.slice(0, 200) : (r.ok ? undefined : r.err),
        note: failed ? "is Moonlight V+ installed? this targets " + MOONLIGHT.package + ", not stock Moonlight's com.limelight" : undefined,
    };
}

/** Devices adb can see, so a caller can offer a list rather than a text box. */
async function adbDevices() {
    const r = await _run("adb", ["devices"], 8000);
    if (!r.ok) return { ok: false, error: "adb not available", devices: [] };
    const devices = r.out.split("\n").slice(1)
        .map((l) => l.trim()).filter((l) => l && !l.startsWith("*"))
        .map((l) => { const [serial, state] = l.split(/\s+/); return { serial, state }; })
        .filter((d) => d.serial);
    return { ok: true, devices };
}

// ------------------------------------------------------------------------------------------------------------
// The door. owns/handle rather than seven branches in server.js -- the same shape deviceBridge and
// repoTerrainBridge use, so the route list lives with the code that answers it.
// ------------------------------------------------------------------------------------------------------------
const PREFIX = "/sunshine";
function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }

const ROUTES = Object.freeze([
    "GET  " + PREFIX + "/status",
    "POST " + PREFIX + "/install",
    "GET  " + PREFIX + "/install/status",
    "POST " + PREFIX + "/start",
    "POST " + PREFIX + "/stop",
    "GET  " + PREFIX + "/adb/devices",
    "POST " + PREFIX + "/moonlight/launch",
]);

async function handle(req, res, ctx) {
    const sendJson = ctx && ctx.sendJson;
    const readJson = ctx && ctx.readJson;
    const route = String(req.url || "").split("?")[0];
    const m = req.method;
    if (m === "GET" && (route === PREFIX + "/status" || route === PREFIX)) { sendJson(await status()); return; }
    if (m === "GET" && route === PREFIX + "/install/status") { sendJson(installStatus() || { ok: true, running: false, note: "no install has been started" }); return; }
    if (m === "GET" && route === PREFIX + "/adb/devices") { sendJson(await adbDevices()); return; }
    if (m === "POST" && route === PREFIX + "/install") { const r = install(); sendJson(r, r.ok ? 200 : 400); return; }
    if (m === "POST" && route === PREFIX + "/start") { const r = start(); sendJson(r, r.ok ? 200 : 400); return; }
    if (m === "POST" && route === PREFIX + "/stop") { sendJson(stop()); return; }
    if (m === "POST" && route === PREFIX + "/moonlight/launch") {
        if (typeof readJson !== "function") { sendJson({ ok: false, error: "no body reader" }, 500); return; }
        readJson(async (d) => { const r = await launchMoonlight(d || {}); sendJson(r, r.ok ? 200 : 400); });
        return;
    }
    sendJson({ ok: false, error: "unknown route", routes: ROUTES }, 404);
}

module.exports = { owns, handle, PREFIX, ROUTES, detect, install, installStatus, start, stop, status,
                   launchMoonlight, adbDevices, UPSTREAM, INSTALL, PROBES, REFUSED, MOONLIGHT, WEB_PORT };
