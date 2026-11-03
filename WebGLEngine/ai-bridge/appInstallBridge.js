// WebGLEngine/ai-bridge/appInstallBridge.js -- UNNUMBERED (the version is chosen at ship time) (the gate is tools/ship/appInstall-selfcheck.mjs)
//
// AN INSTALL BUTTON FOR TWO SOMEBODY-ELSE'S DESKTOP APPS (Nectarlink, DuoDesk), WHERE NOTHING OF THEIRS ENTERS THIS TREE.
//
// Keith (2026-11-03): "let's also do the DuoDesk and Nectarlink installs." Both ship as UNSIGNED binary installers (.exe, .dmg, .AppImage, .deb, .apk), so the galaxy-profile shape (git clone a pinned commit and run it) does not fit; the
// shape that does is voxtral's: PIN THE BYTES. Each asset below carries the SHA-256 and size of the file GitHub served on 2026-11-03, and this bridge will stage it only if what arrives matches both.
// *** WHAT THE PIN IS, SAID PLAINLY: trust on first use. The digests are of the release files as fetched that day; nobody read the binaries. They stop a later swap of the release asset or a tampered download from running unseen;
// they do not make the app safe. The apps are unsigned (their own README says so), which is why the launch is a separate, explicit step. ***
// GPL: Nectarlink's apps are GPL-3.0-or-later and DuoDesk is GPL-3.0 (a fork of TwinDesk). Nothing is copied into the tree or a release zip; the file is downloaded onto the user's OWN machine, outside the tree, and run as its own
// process, which is what a package manager does.
//
// WHAT IT DOES: status() (what each app offers this machine, what is staged); download(id, name) (a fire-and-poll job: stream from github.com, follow redirects only to GitHub's own hosts over https, refuse more bytes than the pin,
// hash while streaming, stage only on an exact match, delete otherwise); launch(id, name, {confirm:true}) (re-hash the staged file, then hand it to the host OS: run the .exe on Windows, `open` the .dmg on macOS, run the
// AppImage on Linux, `adb install` an .apk when a device is attached, otherwise say where the file is). A .deb is NEVER executed (it needs root: the command is returned for the user to run).
// REFUSED: a name the request invents (the asset is looked up in the table below, never joined onto a path); a launch without confirm:true; a launch of an unverified or mismatched file; running an asset built for another OS;
// a shell (no `shell: true` anywhere); a redirect off GitHub or to plain http; and any call from a remote (tunnel) session -- server.js routes these local-only.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const cp = require("child_process");

const PINNED_ON = "2026-11-03";
const GH_HOSTS = Object.freeze(["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]);
const MAX_REDIRECTS = 5;

const dl = (repo, tag, file) => `https://github.com/${repo}/releases/download/${tag}/${file}`;
const asset = (repo, tag, name, platform, arch, kind, bytes, sha256) => Object.freeze({ name, url: dl(repo, tag, name), platform, arch, kind, bytes, sha256 });

const APPS = Object.freeze({
    nectarlink: Object.freeze({
        id: "nectarlink", name: "Nectarlink", repo: "thtbee/nectarlink", version: "0.1.4", license: "GPL-3.0-or-later (apps), MPL-2.0 (core), CC BY 4.0 (protocol docs)",
        what: "your Android phone and Windows PC working as one: notifications, calls, files, clipboard, mirroring",
        assets: Object.freeze([
            asset("thtbee/nectarlink", "v0.1.4", "Nectarlink-0.1.4-x64-setup.exe", "win32", "x64", "exe", 38536301, "afdf6d9c1b94647a7888735193cfab24f6bb3236c98b8da51533ee0ffb516528"),
            asset("thtbee/nectarlink", "v0.1.4", "Nectarlink-0.1.4-android.apk", "android", null, "apk", 51754002, "26f5dc05460d1cc8390129569665a224cfbe4127b4cd12cd63ceeeaa7ab9d6de"),
        ]),
    }),
    duodesk: Object.freeze({
        id: "duodesk", name: "DuoDesk", repo: "0xCodez/DuoDesk", version: "2.5.0", license: "GPL-3.0 (a fork of TwinDesk)",
        what: "Mac, Windows, Linux and Android working as one desk: one mouse and keyboard, shared screens, files and clipboard",
        assets: Object.freeze([
            asset("0xCodez/DuoDesk", "v2.5.0", "DuoDesk-Setup-2.5.0.exe", "win32", "x64", "exe", 101596829, "800ac37d84d4d22c6ba2373284593c043dc0ebb6bea823d608c2005628cfecfb"),
            asset("0xCodez/DuoDesk", "v2.5.0", "DuoDesk-Setup-2.5.0-arm64.exe", "win32", "arm64", "exe", 103745923, "db1bb5e523baf122e18301d1da1cd76d5e3e2f72d9adefaa8e461b6ff698bb0e"),
            asset("0xCodez/DuoDesk", "v2.5.0", "DuoDesk-2.5.0-arm64.dmg", "darwin", "arm64", "dmg", 151162578, "47aab4238f21c9f62a21407fc8b02bdc7ea9c8f309ac636769037d8dfb4b8b61"),
            asset("0xCodez/DuoDesk", "v2.5.0", "DuoDesk-2.5.0-x86_64.AppImage", "linux", "x64", "appimage", 123490115, "51d4aa672d89faca0fbbf638a799ab9419b0a06bee554269371930fb4424e75e"),
            asset("0xCodez/DuoDesk", "v2.5.0", "DuoDesk-2.5.0-amd64.deb", "linux", "x64", "deb", 85470496, "a24d7a8eaad838b445339825b944d479607ccbe63bdaee40cefc5c1f151755ce"),
            asset("0xCodez/DuoDesk", "v2.5.0", "DuoDesk-2.5.0.apk", "android", null, "apk", 27764613, "e7c3a00b22529d25867b32af01da3e4a53594590f9b637454c86361b7a872de5"),
            asset("0xCodez/DuoDesk", "v2.5.0", "DuoDesk-2.5.0-full.apk", "android", null, "apk", 27764905, "68fe55d2ad2db434b6bf8c0c8e3fd9d03d616ff3a73d150dbb1a3a4b9eacec41"),
        ]),
    }),
});

// Everything the gate needs to replace: where files are staged, how bytes arrive, how a process starts, which machine this is.
const io = { apps: APPS, stageDir: process.env.SWEK_APPS_DIR || path.join(os.homedir(), ".voxelbridge", "apps"), get: https.get, spawn: cp.spawn, execFile: cp.execFile, platform: process.platform, arch: process.arch };
/** Replace any of apps (a table shaped like APPS), stageDir, get, spawn, execFile, platform, arch (the gate does; production never calls this). */
function configure(o) { Object.assign(io, o || {}); }

let _job = null;   // one download at a time: { id, name, received, total, done, ok, error }

const findApp = (id) => (Object.prototype.hasOwnProperty.call(io.apps, id) ? io.apps[id] : null);
/** The asset by NAME, looked up in the table. A request string is only ever compared against these names, never joined onto a path. */
function findAsset(id, name) { const a = findApp(id); return a ? a.assets.find((x) => x.name === name) || null : null; }
const stagedPath = (id, name) => path.join(io.stageDir, id, name);

/** The asset this machine can run: the same OS and architecture. A .deb is offered after the AppImage (the AppImage needs no root). */
function recommended(app, platform = io.platform, arch = io.arch) {
    const fits = app.assets.filter((x) => x.platform === platform && (x.arch === null || x.arch === arch));
    return fits.find((x) => x.kind !== "deb") || fits[0] || null;
}
const isStaged = (a, id) => { try { return fs.statSync(stagedPath(id, a.name)).size === a.bytes; } catch { return false; } };

function status() {
    return {
        ok: true, pinnedOn: PINNED_ON, host: { platform: io.platform, arch: io.arch }, job: _job ? { ..._job } : null,
        apps: Object.values(io.apps).map((app) => {
            const rec = recommended(app);
            return { id: app.id, name: app.name, repo: app.repo, version: app.version, license: app.license, what: app.what, recommended: rec ? rec.name : null,
                     assets: app.assets.map((a) => ({ name: a.name, kind: a.kind, platform: a.platform, arch: a.arch, bytes: a.bytes, sha256: a.sha256, url: a.url, staged: isStaged(a, app.id) })) };
        }),
    };
}

/** GET `url`, following redirects only to GitHub's own hosts over https. Calls onResponse(res) with the final 200 response, or onError(message). */
function fetchPinned(url, onResponse, onError, hops = 0) {
    let u; try { u = new URL(url); } catch { return onError("not a url: " + url); }
    if (u.protocol !== "https:") return onError("refused: " + u.protocol + " (https only)");
    if (!GH_HOSTS.includes(u.hostname)) return onError("refused: " + u.hostname + " is not one of GitHub's release hosts");
    const req = io.get(u, { headers: { "User-Agent": "swek-engine-app-install" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            if (hops >= MAX_REDIRECTS) return onError("refused: more than " + MAX_REDIRECTS + " redirects");
            return fetchPinned(new URL(res.headers.location, u).toString(), onResponse, onError, hops + 1);
        }
        if (res.statusCode !== 200) { res.resume(); return onError("HTTP " + res.statusCode + " from " + u.hostname); }
        onResponse(res);
    });
    if (req && req.on) req.on("error", (e) => onError(String((e && e.message) || e)));
}

/** Start the download of one pinned asset. Returns at once; poll status().job. The file is staged only if its size and SHA-256 match the pin exactly. */
function download(id, name) {
    const a = findAsset(id, name);
    if (!a) return { ok: false, error: "unknown app or asset (only the pinned assets can be downloaded)" };
    if (_job && !_job.done) return { ok: false, error: "a download is already running (" + _job.name + ")" };
    const dir = path.join(io.stageDir, id), final = stagedPath(id, a.name), part = final + ".part";
    const job = (_job = { id, name: a.name, received: 0, total: a.bytes, done: false, ok: false, error: null });
    let sink = null;   // the write stream, once there is one: the .part file is removed only AFTER it has closed (a stream destroyed before its open completes would otherwise recreate it)
    const unlinkPart = () => { try { fs.unlinkSync(part); } catch {} };
    const fail = (msg) => {
        if (job.done) return;
        job.done = true; job.ok = false; job.error = msg;
        if (sink && !sink.closed) { sink.once("close", unlinkPart); sink.destroy(); } else unlinkPart();
    };
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { fail("cannot create " + dir + ": " + e.message); return { ok: true, started: false, job: { ...job } }; }
    fetchPinned(a.url, (res) => {
        const hash = crypto.createHash("sha256"), out = (sink = fs.createWriteStream(part));
        res.on("data", (b) => {
            job.received += b.length;
            if (job.received > a.bytes) { res.destroy(); return fail("refused: more bytes than the pin (" + a.bytes + ")"); }
            hash.update(b);
        });
        res.pipe(out);
        res.on("error", (e) => fail("download failed: " + e.message));
        out.on("error", (e) => fail("write failed: " + e.message));
        out.on("close", () => {   // close, not finish: on Windows a file cannot be renamed while its handle is open
            if (job.done) return;
            const got = hash.digest("hex");
            if (job.received !== a.bytes) return fail("refused: " + job.received + " bytes arrived, the pin says " + a.bytes);
            if (got !== a.sha256) return fail("refused: the SHA-256 of the download (" + got.slice(0, 16) + "...) does not match the pin (" + a.sha256.slice(0, 16) + "...); nothing was staged");
            try { fs.renameSync(part, final); } catch (e) { return fail("could not stage: " + e.message); }
            job.done = true; job.ok = true;
        });
    }, fail);
    return { ok: true, started: true, job: { ...job } };
}

const sha256File = (abs) => crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
/** Is the staged file there and exactly the pinned bytes? Hashes it (the whole file, every time). */
function verify(id, name) {
    const a = findAsset(id, name); if (!a) return { ok: false, error: "unknown app or asset" };
    const abs = stagedPath(id, a.name);
    if (!fs.existsSync(abs)) return { ok: false, verified: false, error: "not downloaded yet" };
    const got = sha256File(abs);
    return got === a.sha256 ? { ok: true, verified: true, path: abs } : { ok: false, verified: false, path: abs, error: "the staged file does not match the pin (" + got.slice(0, 16) + "...)" };
}

const adbDevice = () => new Promise((resolve) => {
    io.execFile("adb", ["devices"], { timeout: 8000, windowsHide: true }, (err, stdout) => {
        if (err) return resolve(null);
        const line = String(stdout).split("\n").slice(1).map((l) => l.trim().split(/\s+/)).find((p) => p[1] === "device");
        resolve(line ? line[0] : null);
    });
});
const detached = (cmd, args) => { const c = io.spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: false }); if (c && c.unref) c.unref(); if (c && c.on) c.on("error", () => {}); return c; };

/**
 * Hand a staged, re-verified asset to the host OS. Requires { confirm: true }. exe: run it (Windows); dmg: `open` it (macOS); appimage: mark it executable and run it (Linux); apk: `adb install -r` to an attached
 * device, else the path and the way to sideload it; deb: never run, the command is returned. An asset for another OS is refused.
 */
async function launch(id, name, opts = {}) {
    const a = findAsset(id, name);
    if (!a) return { ok: false, error: "unknown app or asset" };
    if (opts.confirm !== true) return { ok: false, error: "launch needs an explicit confirm: these apps are not code-signed" };
    const v = verify(id, name); if (!v.ok) return { ok: false, error: v.error };
    const abs = v.path;
    if (a.kind === "apk") {
        const dev = await adbDevice();
        if (!dev) return { ok: true, launched: false, path: abs, note: "no Android device is attached over adb. Copy this file to the phone and open it (allow unknown apps, then More details > Install anyway if Play Protect objects), or attach the phone with wireless debugging and press Install again." };
        return new Promise((resolve) => io.execFile("adb", ["-s", dev, "install", "-r", abs], { timeout: 180000, windowsHide: true }, (err, so, se) =>
            resolve(err ? { ok: false, error: "adb install failed: " + String(se || err.message).trim().slice(0, 300) } : { ok: true, launched: true, via: "adb", device: dev, note: String(so).trim().slice(0, 200) })));
    }
    if (a.platform !== io.platform) return { ok: false, error: a.name + " is for " + a.platform + "; this machine is " + io.platform };
    if (a.arch !== null && a.arch !== io.arch) return { ok: false, error: a.name + " is for " + a.arch + "; this machine is " + io.arch };
    if (a.kind === "deb") return { ok: true, launched: false, path: abs, note: "a .deb needs root, so SweK does not run it. In a terminal: sudo apt install '" + abs + "'" };
    // explorer.exe is the same hand-off as a double click: it applies the installer's own elevation prompt, which a bare spawn of an exe that asks for administrator cannot
    if (a.kind === "exe") { detached("explorer.exe", [abs]); return { ok: true, launched: true, path: abs, note: "the installer is starting; if SmartScreen appears choose More info > Run anyway (the app is not code-signed)" }; }
    if (a.kind === "dmg") { detached("open", [abs]); return { ok: true, launched: true, path: abs, note: "drag the app into Applications, then System Settings > Privacy & Security > Open Anyway on first run" }; }
    if (a.kind === "appimage") { try { fs.chmodSync(abs, 0o755); } catch (e) { return { ok: false, error: "could not mark it executable: " + e.message }; } detached(abs, []); return { ok: true, launched: true, path: abs }; }
    return { ok: false, error: "no launch rule for " + a.kind };
}

module.exports = { APPS, GH_HOSTS, PINNED_ON, configure, status, download, verify, launch, recommended, findAsset, sha256File };
