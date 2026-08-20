// FILE: ai-bridge/nearShareBridge.js
//
// v2981 -- NEARBY SHARE, and the first thing this file does is refuse to pretend there is one of them.
//
// THERE ARE TWO DIFFERENT PROTOCOLS WEARING ALMOST THE SAME NAME, and the repo lists that circulate mix them
// freely. They are not alternatives. They point in opposite directions:
//
//   GOOGLE QUICK SHARE (formerly Nearby Share) -- Android's AirDrop. BLE advertisement, then mDNS, then WiFi.
//       Implementations for a desktop: Martichou/rquickshare (Linux + macOS, GPL-3.0, Tauri app over a Rust
//       core_lib), grishka/NearDrop (macOS, Swift), CrossDrop (Flutter). A desktop running these becomes a
//       QUICK SHARE TARGET, so an ANDROID PHONE can send to it.
//
//   MICROSOFT NEARBY SHARING / PROJECT ROME (MS-CDP + NearShare) -- the share built into Windows 10/11.
//       Implementations: nearby-sharing/cli (cross-platform CLI), nearby-sharing/android (.NET, an ANDROID app),
//       nearby-sharing/windows, nearby-sharing/linux. These let a device talk to WINDOWS' OWN share.
//
// A BUTTON LABELLED "NEARBY SHARE" WITH NO PROTOCOL NAMED WOULD SEND A FILE INTO THE VOID -- the phone is
// listening for one handshake and the tool is speaking the other. So every capability this bridge reports names
// its protocol, and the gate asserts they are never merged into one.
//
// WHY THIS IS A BRIDGE AND NOT AN IMPLEMENTATION. Both protocols need BLE ADVERTISING and OS-specific radio
// access. Node cannot do that portably, and a hand-rolled partial implementation of a security-relevant
// handshake is exactly the thing this project refuses to ship untested. So this drives what is installed --
// the same discipline as cloudflared, RustDesk and CrossDesk -- and reports honestly when nothing is.
//
// WHAT IT ADDS TO THE FLEET: SweK's existing peer transfer moves files between SweK NODES. This reaches devices
// with no SweK on them at all -- a phone. That is also precisely the gap CrossDesk left open at v2980: control
// FROM a phone, but no way to move a file to one.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const PREFIX = "/nearshare";
function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }

const QUICK_SHARE = "google-quick-share";
const PROJECT_ROME = "ms-nearby-sharing";

/**
 * Known implementations, each tagged with WHICH PROTOCOL IT SPEAKS and which platforms it runs on. Data, not
 * prose, so the check and the claim cannot drift -- and so a reader can see at a glance that the two columns
 * are different questions.
 */
const IMPLS = [
    { id: "rquickshare", protocol: QUICK_SHARE, label: "rquickshare (Rust)", talksTo: "Android phones",
      platforms: ["linux", "darwin"], license: "GPL-3.0-or-later",
      note: "Needs Bluetooth to broadcast the advertisement that makes Android reveal its mDNS service. A Windows fork exists (oop7/rquickshare-x) but is not this project.",
      bins: { linux: ["/usr/bin/rquickshare", "/usr/local/bin/rquickshare", path.join(os.homedir(), "Applications/r-quick-share.AppImage")],
              darwin: ["/Applications/RQuickShare.app/Contents/MacOS/RQuickShare"] } },
    { id: "neardrop", protocol: QUICK_SHARE, label: "NearDrop (Swift)", talksTo: "Android phones",
      platforms: ["darwin"], license: "unverified -- check before redistributing",
      note: "macOS only, and receive-oriented. Confirm send support before relying on it for outbound.",
      bins: { darwin: ["/Applications/NearDrop.app/Contents/MacOS/NearDrop"] } },
    { id: "ns-cli", protocol: PROJECT_ROME, label: "nearby-sharing/cli", talksTo: "Windows 10/11 built-in share",
      platforms: ["linux", "darwin", "win32"], license: "GPL-3.0",
      note: "A real CLI rather than a GUI, which is why it is the one a bridge can drive properly.",
      bins: { linux: ["/usr/local/bin/nearshare", "/usr/bin/nearshare"],
              darwin: ["/usr/local/bin/nearshare"],
              win32: [path.join(process.env["LOCALAPPDATA"] || "", "nearshare", "nearshare.exe")] } },
];

function findBin(impl) {
    const list = (impl.bins || {})[process.platform] || [];
    for (const p of list) { try { if (p && fs.existsSync(p)) return p; } catch {} }
    // A PATH lookup as a fallback, explicitly and not as the only route -- a Finder-launched process has a
    // minimal PATH, which this project has paid for four separate times.
    try {
        const r = process.platform === "win32"
            ? spawnSync("where", [impl.id], { encoding: "utf8", timeout: 4000, windowsHide: true })
            : spawnSync("/bin/sh", ["-c", "command -v " + impl.id], { encoding: "utf8", timeout: 4000 });
        const out = String((r && r.stdout) || "").trim().split("\n")[0].trim();
        if (out) return out;
    } catch {}
    return null;
}

function survey() {
    return IMPLS.map((i) => {
        const supported = i.platforms.includes(process.platform);
        const bin = supported ? findBin(i) : null;
        return {
            id: i.id, protocol: i.protocol, label: i.label, talksTo: i.talksTo, license: i.license, note: i.note,
            supportedHere: supported, installed: !!bin, bin,
            why: supported ? null : i.label + " does not run on " + process.platform,
        };
    });
}

function status() {
    const impls = survey();
    const ready = impls.filter((i) => i.installed);
    const protocols = [...new Set(ready.map((i) => i.protocol))];
    return {
        ok: true, platform: process.platform, arch: os.arch(),
        impls, ready: ready.map((i) => i.id), protocols,
        // NEVER a single "nearby share works" boolean. Which protocol is available decides which DEVICES you can
        // reach, and collapsing that into one flag is the mistake this whole file exists to avoid.
        canReachAndroid: protocols.includes(QUICK_SHARE),
        canReachWindowsShare: protocols.includes(PROJECT_ROME),
        protocolsAreDifferent: "Google Quick Share and Microsoft Project Rome are separate handshakes. A tool speaking one cannot see a device advertising the other, so the target device decides which you need -- not preference.",
        extends: "SweK's peer transfer moves files between SweK nodes. This reaches devices with no SweK installed -- notably a phone, which is the gap CrossDesk left open.",
    };
}

/** Send a file via a named implementation. Refuses clearly rather than guessing which one you meant. */
function send(implId, file) {
    if (!implId) return { ok: false, error: "no-impl", message: "Name the implementation. There are two different protocols and picking for you could send the file to nothing.", choices: survey().filter((i) => i.installed).map((i) => i.id) };
    const impl = IMPLS.find((i) => i.id === implId);
    if (!impl) return { ok: false, error: "unknown-impl", choices: IMPLS.map((i) => i.id) };
    if (!impl.platforms.includes(process.platform)) return { ok: false, error: "platform", message: impl.label + " does not run on " + process.platform };
    const bin = findBin(impl);
    if (!bin) return { ok: false, error: "not-installed", message: impl.label + " is not installed. " + impl.note, protocol: impl.protocol };
    if (!file) return { ok: false, error: "no-file", message: "a file path is required" };
    let real;
    try { real = fs.realpathSync(file); if (!fs.statSync(real).isFile()) throw new Error("not a file"); }
    catch (e) { return { ok: false, error: "bad-file", message: String((e && e.message) || e) }; }
    try {
        spawn(bin, [real], { detached: true, stdio: "ignore", windowsHide: false }).unref();
        return { ok: true, launched: true, impl: impl.id, protocol: impl.protocol, bin, file: real,
                 note: "The receiving device must accept the transfer; nothing here can confirm delivery." };
    } catch (e) { return { ok: false, error: "spawn", message: String((e && e.message) || e) }; }
}

function readBody(req, limit = 32768) {
    return new Promise((resolve) => {
        let s = "";
        req.on("data", (c) => { s += c; if (s.length > limit) { s = s.slice(0, limit); req.destroy(); } });
        req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } });
        req.on("error", () => resolve({}));
    });
}

async function handle(req, res, { sendJson }) {
    const route = new URL(req.url, "http://x").pathname.slice(PREFIX.length) || "/";
    if (route === "/" || route === "/status") return sendJson(status());
    if (route === "/send") {
        if (req.method !== "POST") return sendJson({ ok: false, error: "method", message: "POST {impl, file} to /nearshare/send" }, 405);
        const b = await readBody(req);
        const r = send(b.impl, b.file);
        return sendJson(r, r.ok ? 200 : 400);
    }
    return sendJson({ ok: false, error: "unknown-route", route }, 404);
}

module.exports = { owns, handle, PREFIX, status, survey, send, findBin, IMPLS, QUICK_SHARE, PROJECT_ROME };
