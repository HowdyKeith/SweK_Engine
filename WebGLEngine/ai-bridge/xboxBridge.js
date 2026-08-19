"use strict";
// v1298 — Xbox control via the Xbox Device Portal (Dev Mode) REST API.
// Put the console in Developer Mode (Dev Home -> Remote Access -> on; set a username +
// password under "Remote Access Settings"). The Device Portal is HTTPS on port 11443 with
// a SELF-SIGNED cert, Basic auth, and a CSRF token for mutating calls — all handled here.
// It's the same Windows Device Portal (WDP) REST surface used on HoloLens/IoT, so:
//   GET    /api/os/machinename                         -> { ComputerName }
//   GET    /api/resourcemanager/systemperf             -> CPU/GPU/mem/network
//   GET    /api/app/packagemanager/packages            -> { InstalledPackages: [...] }
//   POST   /api/taskmanager/app?appid=<b64>&package=<b64>   -> launch
//   DELETE /api/taskmanager/app?package=<b64>          -> terminate
//   GET    /ext/screenshot                             -> PNG (Xbox media-capture; best-guess path)
// Config (host/port/user/pass) lives in xbox.config.json (0600). LAN-only.
const fs = require("fs"), path = require("path"), https = require("https");
const CONFIG = path.join(__dirname, "xbox.config.json");

function load() { try { if (fs.existsSync(CONFIG)) return JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch {} return {}; }
function save(c) { try { fs.writeFileSync(CONFIG, JSON.stringify(c), { mode: 0o600 }); return true; } catch (e) { console.warn("[xbox] config save:", e.message); return false; } }
const b64 = (s) => Buffer.from(String(s), "utf8").toString("base64");

function getConfig() { const c = load(); return { ok: true, host: c.host || "", port: c.port || 11443, user: c.user || "", passSet: !!c.pass }; }
function setConfig(d) { const c = load(); if (d) { if (typeof d.host === "string") c.host = d.host.trim(); if (d.port) c.port = parseInt(d.port, 10) || 11443; if (typeof d.user === "string") c.user = d.user.trim(); if (typeof d.pass === "string" && d.pass) c.pass = d.pass; } save(c); return getConfig(); }

// One HTTPS request to the Device Portal. Resolves { status, headers, json, buffer }.
function _req(method, p, { csrf, raw } = {}) {
    const c = load();
    if (!c.host) return Promise.resolve({ ok: false, error: "no Xbox host — set the console IP + Dev Portal user/pass first" });
    const headers = {};
    if (c.user || c.pass) headers["Authorization"] = "Basic " + b64((c.user || "") + ":" + (c.pass || ""));
    if (csrf) { headers["X-CSRF-Token"] = csrf; headers["Cookie"] = "CSRF-Token=" + csrf; }
    return new Promise((resolve) => {
        let done = false; const fin = (o) => { if (!done) { done = true; resolve(o); } };
        const opts = { host: c.host, port: c.port || 11443, method, path: p, headers, rejectUnauthorized: false, timeout: 8000 };
        const req = https.request(opts, (res) => {
            const chunks = [];
            res.on("data", (d) => chunks.push(d));
            res.on("end", () => {
                const buf = Buffer.concat(chunks);
                let json = null; if (!raw) { try { json = JSON.parse(buf.toString("utf8")); } catch {} }
                fin({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, headers: res.headers, json, buffer: buf });
            });
        });
        req.on("error", (e) => fin({ ok: false, error: String(e && e.message || e) }));
        req.on("timeout", () => { try { req.destroy(); } catch {} fin({ ok: false, error: "timeout (is the console on + in Dev Mode + reachable?)" }); });
        req.end();
    });
}

// Grab a CSRF token from a GET's Set-Cookie (Device Portal requires it on POST/DELETE).
async function _csrf() {
    const r = await _req("GET", "/api/os/machinename");
    const sc = r && r.headers && r.headers["set-cookie"];
    if (sc) { const m = String(Array.isArray(sc) ? sc.join(";") : sc).match(/CSRF-Token=([^;]+)/i); if (m) return m[1]; }
    return null;
}

async function status() {
    const r = await _req("GET", "/api/os/machinename");
    if (!r.ok) return { ok: false, error: r.error || ("http " + r.status), hint: r.status === 401 ? "auth failed — check the Dev Portal username/password" : undefined };
    return { ok: true, name: (r.json && (r.json.ComputerName || r.json.Computername)) || "Xbox", reachable: true };
}

async function perf() {
    const r = await _req("GET", "/api/resourcemanager/systemperf");
    if (!r.ok) return { ok: false, error: r.error || ("http " + r.status) };
    return { ok: true, perf: r.json || {} };
}

async function apps() {
    const r = await _req("GET", "/api/app/packagemanager/packages");
    if (!r.ok) return { ok: false, error: r.error || ("http " + r.status) };
    const list = (r.json && (r.json.InstalledPackages || r.json.Packages)) || [];
    const apps = list.map(p => ({
        name: p.Name || p.AppId || p.PackageFamilyName,
        familyName: p.PackageFamilyName || p.PackageFullName || "",
        fullName: p.PackageFullName || "",
        praid: p.PackageRelativeId || (Array.isArray(p.RegisteredUsers) ? "" : "") || p.AppId || "",
        version: (p.Version && (p.Version.Major != null ? [p.Version.Major, p.Version.Minor, p.Version.Build, p.Version.Revision].join(".") : p.Version)) || "",
    })).filter(a => a.familyName);
    return { ok: true, apps };
}

async function launch(praid, familyName) {
    if (!praid || !familyName) return { ok: false, error: "need both the app PRAID and the package family name" };
    const csrf = await _csrf();
    const r = await _req("POST", "/api/taskmanager/app?appid=" + encodeURIComponent(b64(praid)) + "&package=" + encodeURIComponent(b64(familyName)), { csrf });
    return r.ok ? { ok: true, launched: familyName } : { ok: false, error: r.error || ("http " + r.status) };
}

async function terminate(familyName) {
    if (!familyName) return { ok: false, error: "need the package family name" };
    const csrf = await _csrf();
    const r = await _req("DELETE", "/api/taskmanager/app?package=" + encodeURIComponent(b64(familyName)), { csrf });
    return r.ok ? { ok: true, terminated: familyName } : { ok: false, error: r.error || ("http " + r.status) };
}

// Best-guess Xbox media-capture screenshot endpoint; returns the PNG bytes (base64).
async function screenshot() {
    const r = await _req("GET", "/ext/screenshot", { raw: true });
    if (!r.ok) return { ok: false, error: r.error || ("http " + r.status), hint: "screenshot path may differ by console/OS build — verify on the rig" };
    return { ok: true, mime: "image/png", image: r.buffer.toString("base64") };
}

module.exports = { getConfig, setConfig, status, perf, apps, launch, terminate, screenshot };
