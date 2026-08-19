// FILE: ai-bridge/crossdeskBridge.js
//
// v2980 -- CrossDesk BESIDE RustDesk, not instead of it.
//
// Keith's call, and it is the right one: RustDesk stays. This adds a second option, because the two are not
// interchangeable and each covers a case the other does not.
//
// WHAT CROSSDESK BRINGS THAT RUSTDESK DOES NOT, HERE:
//   A FIRST-CLASS WEB CLIENT. Browser in, no install, no binary on the controlling device -- an iPhone driving a
//   Windows box through Safari. RustDesk can do this only if you build and host its web client yourself.
//   LGPL-3.0 rather than AGPL-3.0, which matters if anything here is ever linked rather than merely run.
//   Optional CUDA/NVENC hardware encode, which on a GTX 10-series box is a real path rather than a checkbox.
//
// WHAT IT DOES NOT BRING, AND THIS IS WHY RUSTDESK STAYS:
//   NO ANDROID OR iOS TARGETS. You can CONTROL from a phone via the browser; you cannot remote INTO one.
//   RustDesk does both.
//   A HIGH OS FLOOR -- see PLATFORM_FLOOR below, and the whole reason this bridge reports it.
//
// THE FLOOR IS THE POINT OF THIS FILE. CrossDesk documents minimum versions: Windows 10 64-bit, macOS Apple
// Silicon 14.0 / Intel 15.0, Ubuntu 22.04. Those are HIGHER than RustDesk's, and an older Mac is exactly the
// machine you discover this on -- after installing, configuring and failing to connect. So the bridge checks
// THIS machine against the documented floor and says so BEFORE any of that. A requirement nobody checks is an
// afternoon somebody loses.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const PREFIX = "/crossdesk";
function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }

const CFG = process.env.CROSSDESK_CFG || path.join(os.homedir(), ".voxelbridge", "crossdesk.json");
const DEFAULTS = {
    // Self-hosted server, mirroring the docker deployment's own parameter names so the two cannot drift.
    serverAddress: "", serverPort: "", relayPort: "",
    webClient: "https://web.crossdesk.cn/",
    machines: [],                 // [{ name, id, note }]
};

/**
 * Documented minimum versions, from the project's own system-requirements table. Recorded as DATA with its
 * source, not as prose in a comment, so the check and the claim cannot drift apart.
 */
const PLATFORM_FLOOR = {
    win32:  { label: "Windows 10 or later (64-bit)", major: 10 },
    darwin: { label: "macOS 14.0 on Apple Silicon, 15.0 on Intel", appleSilicon: 14, intel: 15 },
    linux:  { label: "Ubuntu 22.04 or later (older needs building from source)", ubuntu: "22.04" },
    source: "kunkundi/crossdesk README system-requirements table",
};

function loadCfg() { try { if (fs.existsSync(CFG)) return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(CFG, "utf8"))); } catch {} return { ...DEFAULTS }; }
function saveCfg(c) { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(c, null, 2), { mode: 0o600 }); } catch {} }

const cleanMachine = (m) => ({ name: String(m.name || m.id).slice(0, 64), id: String(m.id).slice(0, 64), note: String(m.note || "").slice(0, 200) });

function getConfig() {
    const c = loadCfg();
    return { ok: true, ...c, selfHosted: !!(c.serverAddress && c.serverPort), configured: !!(c.serverAddress || (c.machines || []).length) };
}
function setConfig(d) {
    const c = loadCfg();
    for (const k of ["serverAddress", "serverPort", "relayPort", "webClient"]) if (d && d[k] !== undefined) c[k] = String(d[k]).slice(0, 200);
    saveCfg(c); return getConfig();
}
function addMachine(m) { const c = loadCfg(); if (m && m.id) { c.machines = (c.machines || []).filter((x) => x.id !== String(m.id)); c.machines.push(cleanMachine(m)); saveCfg(c); } return getConfig(); }
function removeMachine(id) { const c = loadCfg(); c.machines = (c.machines || []).filter((x) => x.id !== String(id)); saveCfg(c); return getConfig(); }

/** Locate a CrossDesk binary. Same search discipline as the other bridges: explicit paths, never a bare name. */
function crossdeskBin() {
    const cands = process.platform === "win32"
        ? [path.join(process.env["ProgramFiles"] || "C:/Program Files", "CrossDesk", "CrossDesk.exe"),
           path.join(process.env["LOCALAPPDATA"] || "", "CrossDesk", "CrossDesk.exe")]
        : process.platform === "darwin"
            ? ["/Applications/CrossDesk.app/Contents/MacOS/CrossDesk", path.join(os.homedir(), "Applications/CrossDesk.app/Contents/MacOS/CrossDesk")]
            : ["/usr/bin/crossdesk", "/usr/local/bin/crossdesk", "/opt/crossdesk/crossdesk"];
    for (const p of cands) { try { if (fs.existsSync(p)) return p; } catch {} }
    return null;
}

/**
 * Does THIS machine meet the documented floor? Returns { meets, detail, floor } -- and `meets: null` where the
 * answer genuinely cannot be determined, rather than guessing. An unknown reported as a pass is the failure this
 * function exists to prevent.
 */
function platformCheck() {
    const p = process.platform;
    const floor = PLATFORM_FLOOR[p] || null;
    if (!floor) return { meets: null, detail: "platform " + p + " is not in CrossDesk's supported list", floor: null };

    if (p === "darwin") {
        // Darwin kernel 23 = macOS 14 (Sonoma), 24 = macOS 15 (Sequoia).
        const kernel = parseInt(os.release().split(".")[0], 10);
        const macMajor = Number.isFinite(kernel) ? kernel - 9 : null;
        const arm = os.arch() === "arm64";
        const need = arm ? floor.appleSilicon : floor.intel;
        if (macMajor == null) return { meets: null, detail: "could not read the macOS version", floor: floor.label };
        return {
            meets: macMajor >= need,
            detail: "macOS " + macMajor + " on " + (arm ? "Apple Silicon" : "Intel") + ", needs " + need + "+" +
                    (macMajor < need ? " -- buildable from source below that, but the release binaries will not run" : ""),
            floor: floor.label,
        };
    }
    if (p === "win32") {
        const major = parseInt(os.release().split(".")[0], 10);
        const is64 = os.arch() === "x64" || os.arch() === "arm64";
        return { meets: major >= floor.major && is64, detail: "Windows kernel " + os.release() + ", " + os.arch(), floor: floor.label };
    }
    // Linux: the floor is a DISTRO version, and the kernel does not tell you it. Say so rather than inventing one.
    let distro = null;
    try {
        const rel = fs.readFileSync("/etc/os-release", "utf8");
        distro = (rel.match(/^PRETTY_NAME="?([^"\n]+)/m) || [])[1] || null;
    } catch {}
    return { meets: null, detail: distro ? distro + " -- CrossDesk documents Ubuntu 22.04+; other distros build from source" : "could not read /etc/os-release", floor: floor.label };
}

function status() {
    const bin = crossdeskBin();
    const cfg = getConfig();
    const plat = platformCheck();
    return {
        ok: true, installed: !!bin, bin: bin || null, platform: process.platform, arch: os.arch(),
        configured: cfg.configured, selfHosted: cfg.selfHosted,
        webClient: cfg.webClient || DEFAULTS.webClient,
        platformOk: plat.meets, platformDetail: plat.detail, platformFloor: plat.floor,
        // The comparison a reader actually needs, stated rather than implied.
        vsRustDesk: "Adds a browser web client (control from a phone with nothing installed) and is LGPL-3.0 rather than AGPL-3.0. Does NOT provide Android or iOS targets -- you can control FROM a phone, not INTO one -- and its OS floor is higher. Both are installed side by side on purpose.",
        floorSource: PLATFORM_FLOOR.source,
    };
}

/** Launch the local client. There is no documented crossdesk:// URI scheme, so this does not invent one. */
function launch() {
    const bin = crossdeskBin();
    if (!bin) return { ok: false, error: "not-installed", message: "No CrossDesk binary found. Install from crossdesk.cn, or build it (xmake). RustDesk is unaffected and still available." };
    const plat = platformCheck();
    if (plat.meets === false) return { ok: false, error: "platform-floor", message: "This machine is below CrossDesk's documented minimum: " + plat.detail };
    try {
        spawn(bin, [], { detached: true, stdio: "ignore", windowsHide: false }).unref();
        return { ok: true, launched: true, bin };
    } catch (e) { return { ok: false, error: "spawn", message: String((e && e.message) || e) }; }
}

/** The web client needs NO local binary at all -- which is the whole reason this option is worth having. */
function webClientUrl() {
    const c = loadCfg();
    return { ok: true, url: c.webClient || DEFAULTS.webClient, selfHosted: !!(c.serverAddress && c.serverPort),
             note: "The web client needs nothing installed on the controlling device. It is the capability RustDesk only provides if you host its web client yourself." };
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
    if (route === "/config") {
        if (req.method === "POST") return sendJson(setConfig(await readBody(req)));
        return sendJson(getConfig());
    }
    if (route === "/web") return sendJson(webClientUrl());
    if (route === "/launch") {
        if (req.method !== "POST") return sendJson({ ok: false, error: "method", message: "POST to /crossdesk/launch" }, 405);
        const r = launch();
        return sendJson(r, r.ok ? 200 : 400);
    }
    if (route === "/machine") {
        if (req.method !== "POST") return sendJson({ ok: false, error: "method" }, 405);
        const b = await readBody(req);
        return sendJson(b.remove ? removeMachine(b.remove) : addMachine(b));
    }
    return sendJson({ ok: false, error: "unknown-route", route }, 404);
}

module.exports = { owns, handle, PREFIX, status, getConfig, setConfig, addMachine, removeMachine,
                   crossdeskBin, platformCheck, launch, webClientUrl, PLATFORM_FLOOR, DEFAULTS };
