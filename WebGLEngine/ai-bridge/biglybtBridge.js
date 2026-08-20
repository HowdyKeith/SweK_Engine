"use strict";
// v1635 — control BiglyBT over its "Web Remote" plugin, which speaks a Transmission-compatible JSON-RPC at
// http://<host>:<port>/transmission/rpc. Transmission requires a CSRF handshake: the first call returns 409 with
// an X-Transmission-Session-Id header; we cache that token and resend. Optional HTTP Basic auth. Config lives in
// ~/.voxelbridge/biglybt.json so it survives engine updates. In BiglyBT: install "BiglyBT Web Remote" (Tools ->
// Plugins -> Get Plugins, or Tools -> Remote Pairing) and enable "Allow Remote Control on LAN" to get host:port.
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const CFG = path.join(os.homedir(), ".voxelbridge", "biglybt.json");
let _cfg = (() => { try { return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch { return {}; } })();
let _sid = "";   // cached X-Transmission-Session-Id (CSRF token)

function _save() { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(_cfg, null, 2)); } catch {} }
function _host() { return _cfg.host || "127.0.0.1"; }
function _port() { return _cfg.port || 9091; }
function getConfig() { return { ok: true, host: _host(), port: _port(), hasAuth: !!(_cfg.user || _cfg.pass), configured: !!_cfg.host }; }
function setConfig(d) {
    d = d || {};
    if (d.clear) { _cfg = {}; _sid = ""; _save(); return getConfig(); }
    if (d.host != null) _cfg.host = String(d.host).trim();
    if (d.port != null) { const p = parseInt(d.port, 10); if (p > 0) _cfg.port = p; }
    if (d.user != null) _cfg.user = String(d.user);
    if (d.pass != null) _cfg.pass = String(d.pass);
    _sid = ""; _save(); return getConfig();
}

// One JSON-RPC call. Handles the 409 session-id handshake (one retry) + optional basic auth.
function _rpc(method, args, _retried) {
    return new Promise((resolve) => {
        const body = JSON.stringify({ method, arguments: args || {} });
        const headers = { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) };
        if (_sid) headers["X-Transmission-Session-Id"] = _sid;
        if (_cfg.user || _cfg.pass) headers["Authorization"] = "Basic " + Buffer.from((_cfg.user || "") + ":" + (_cfg.pass || "")).toString("base64");
        const req = http.request({ host: _host(), port: _port(), path: "/transmission/rpc", method: "POST", headers, timeout: 8000 }, (res) => {
            if (res.statusCode === 409) {
                const sid = res.headers["x-transmission-session-id"]; res.resume();
                if (sid && !_retried) { _sid = sid; resolve(_rpc(method, args, true)); }
                else resolve({ ok: false, error: "session handshake failed" });
                return;
            }
            if (res.statusCode === 401) { res.resume(); resolve({ ok: false, error: "auth rejected \u2014 check the username/password" }); return; }
            let data = ""; res.on("data", (c) => data += c); res.on("end", () => {
                let j; try { j = JSON.parse(data); } catch { resolve({ ok: false, error: "bad RPC response (HTTP " + res.statusCode + ")" }); return; }
                if (j.result && j.result !== "success") resolve({ ok: false, error: String(j.result) });
                else resolve({ ok: true, arguments: j.arguments || {} });
            });
        });
        req.on("error", (e) => resolve({ ok: false, error: String((e && e.code === "ECONNREFUSED") ? "connection refused \u2014 is BiglyBT + the Web Remote plugin running?" : (e && e.message) || e) }));
        req.on("timeout", () => { try { req.destroy(); } catch {} resolve({ ok: false, error: "timed out (BiglyBT not reachable at " + _host() + ":" + _port() + ")" }); });
        req.write(body); req.end();
    });
}

const STATUS = { 0: "stopped", 1: "check-wait", 2: "checking", 3: "queued", 4: "downloading", 5: "seed-wait", 6: "seeding" };
const FIELDS = ["id", "name", "percentDone", "rateDownload", "rateUpload", "status", "eta", "totalSize", "sizeWhenDone", "leftUntilDone", "downloadedEver", "uploadedEver", "peersConnected", "error", "errorString", "hashString", "isFinished", "downloadLimit", "downloadLimited", "uploadLimit", "uploadLimited"];

async function status() {
    const r = await _rpc("torrent-get", { fields: FIELDS });
    if (!r.ok) return r;
    const torrents = (r.arguments.torrents || []).map((t) => ({
        id: t.id, name: t.name || "(unnamed)", hash: t.hashString || "",
        pct: Math.round((t.percentDone || 0) * 1000) / 10,
        state: STATUS[t.status] != null ? STATUS[t.status] : String(t.status),
        statusCode: t.status, down: t.rateDownload || 0, up: t.rateUpload || 0,
        eta: (t.eta == null ? -1 : t.eta), size: t.sizeWhenDone || t.totalSize || 0,
        peers: t.peersConnected || 0,
        done: !!t.isFinished || (t.leftUntilDone === 0 && (t.sizeWhenDone || 0) > 0),
        downLimit: t.downloadLimited ? (t.downloadLimit || 0) : 0,   // v1647 — KB/s, 0 = unlimited
        upLimit: t.uploadLimited ? (t.uploadLimit || 0) : 0,
        error: t.error ? (t.errorString || ("error " + t.error)) : "",
    }));
    const st = await _rpc("session-stats", {});
    const session = st.ok ? { down: st.arguments.downloadSpeed || 0, up: st.arguments.uploadSpeed || 0, active: st.arguments.activeTorrentCount || 0, total: st.arguments.torrentCount != null ? st.arguments.torrentCount : torrents.length } : null;
    return { ok: true, torrents, session, count: torrents.length };
}

async function add(d) {
    d = d || {};
    const src = String(d.magnet || d.url || d.filename || "").trim();
    if (!src) return { ok: false, error: "a magnet link or .torrent URL is required" };
    const r = await _rpc("torrent-add", { filename: src, paused: !!d.paused });
    if (!r.ok) return r;
    const a = r.arguments || {}; const t = a["torrent-added"] || a["torrent-duplicate"] || {};
    return { ok: true, added: !!a["torrent-added"], duplicate: !!a["torrent-duplicate"], id: t.id, name: t.name };
}
async function addFile(base64, paused) {
    if (!base64) return { ok: false, error: "no .torrent data" };
    const r = await _rpc("torrent-add", { metainfo: String(base64), paused: !!paused });
    if (!r.ok) return r;
    const a = r.arguments || {}; const t = a["torrent-added"] || a["torrent-duplicate"] || {};
    return { ok: true, added: !!a["torrent-added"], duplicate: !!a["torrent-duplicate"], id: t.id, name: t.name };
}
function _ids(ids) { return Array.isArray(ids) ? ids : (ids != null ? [ids] : undefined); }
async function start(ids) { return _rpc("torrent-start", { ids: _ids(ids) }); }
async function stop(ids) { return _rpc("torrent-stop", { ids: _ids(ids) }); }
async function remove(ids, deleteData) { return _rpc("torrent-remove", { ids: _ids(ids), "delete-local-data": !!deleteData }); }
// v1647 — per-torrent speed caps via torrent-set (downloadLimit/uploadLimit in KB/s; the *Limited flags toggle
// whether each cap is honored). A blank/non-positive value clears that cap (unlimited). Field names per the
// Transmission RPC spec (torrent-set: downloadLimit/downloadLimited/uploadLimit/uploadLimited).
async function setLimits(ids, opts) {
    opts = opts || {};
    const args = { ids: _ids(ids) };
    if ("down" in opts) {
        const d = parseInt(opts.down, 10);
        if (isFinite(d) && d > 0) { args.downloadLimited = true; args.downloadLimit = d; } else { args.downloadLimited = false; }
    }
    if ("up" in opts) {
        const u = parseInt(opts.up, 10);
        if (isFinite(u) && u > 0) { args.uploadLimited = true; args.uploadLimit = u; } else { args.uploadLimited = false; }
    }
    return _rpc("torrent-set", args);
}
async function test() {
    const r = await _rpc("session-get", {});
    if (!r.ok) return r;
    const a = r.arguments || {};
    return { ok: true, version: a["biglybt-version"] || a["version"] || "?", rpcVersion: a["rpc-version"], downloadDir: a["download-dir"] || "" };
}

module.exports = { getConfig, setConfig, status, add, addFile, start, stop, remove, setLimits, test, _rpc };
