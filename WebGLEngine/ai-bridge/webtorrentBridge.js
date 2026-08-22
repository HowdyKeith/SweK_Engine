// webtorrentBridge.js -- native P2P data sharing for SweK. Seeds arbitrary output folders (cell-tracking runs,
// render exports, asset packs) as torrents and fetches them from peers, using WebTorrent (Node + browser, WebRTC +
// TCP/UTP, DHT + LSD local discovery). This is DISTINCT from biglybtBridge.js, which only read/controls an EXTERNAL
// BiglyBT client for consuming torrents -- this bridge CREATES and seeds SweK's own data, peer to peer, matching the
// standing "always offer P2P; prefer it when available" rule. No central server: a seeder broadcasts its magnet on
// the existing WS peer bus and peers auto-fetch.
//
// WebTorrent v2+ is ESM-only, so it is dynamic-imported lazily on first use; if it is not installed the bridge
// reports available:false and never blocks server startup (same lazy-guard discipline as the SQLite layer). Install
// on a rig with:  cd ai-bridge && npm i webtorrent
"use strict";

const path = require("path");
const fs = require("fs");

let _client = null;          // singleton WebTorrent client
let _loadErr = null;         // remembered import failure (so we don't retry every call)
let _loading = null;         // in-flight import promise
const _seeded = new Map();   // infoHash -> { magnet, name, size, dir, seeding:true }

// lazy dynamic-import + client construction. Returns the client or throws a friendly error.
async function ensureClient(opts = {}) {
    if (_client) return _client;
    if (_loadErr) throw new Error(_loadErr);
    if (!_loading) {
        _loading = (async () => {
            let WebTorrent;
            try { WebTorrent = (await import("webtorrent")).default; }
            catch (e) { _loadErr = "webtorrent not installed (cd ai-bridge && npm i webtorrent)"; throw new Error(_loadErr); }
            _client = new WebTorrent({ dht: opts.dht !== false, lsd: opts.lsd !== false, tracker: opts.tracker !== false });
            _client.on("error", () => {});   // never let a swarm error crash the host process
            return _client;
        })();
    }
    return _loading;
}

function available() { return _client != null || _loadErr == null; }   // optimistic until an import actually fails

// seed a folder or file -> a magnet other peers can fetch. Idempotent per path (re-seeding returns the same magnet).
async function seedPath(absPath, opts = {}) {
    if (!absPath || !fs.existsSync(absPath)) return { ok: false, error: "path does not exist: " + absPath };
    const client = await ensureClient(opts);
    // already seeding this path?
    for (const [hash, rec] of _seeded) if (rec.dir === absPath) return { ok: true, magnet: rec.magnet, infoHash: hash, name: rec.name, size: rec.size, reused: true };
    return await new Promise((resolve) => {
        const announce = opts.announce || [];   // LAN/DHT/LSD find peers without a tracker; pass trackers for WAN
        client.seed(absPath, { announce }, (torrent) => {
            const rec = { magnet: torrent.magnetURI, name: torrent.name, size: torrent.length, dir: absPath, files: torrent.files.length, seeding: true };
            _seeded.set(torrent.infoHash, rec);
            resolve({ ok: true, magnet: torrent.magnetURI, infoHash: torrent.infoHash, name: torrent.name, size: torrent.length, files: torrent.files.length });
        });
        setTimeout(() => resolve({ ok: false, error: "seed timed out (hashing large folder?)" }), opts.timeoutMs || 60000);
    });
}

// fetch a magnet from peers into downloadDir. Resolves when metadata arrives (files known); download continues async.
async function addMagnet(magnet, downloadDir, opts = {}) {
    if (!magnet || !/^magnet:/.test(magnet)) return { ok: false, error: "not a magnet URI" };
    const client = await ensureClient(opts);
    const dir = downloadDir || path.join(process.env.HOME || ".", "SweK-torrents");
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    // already have it?
    const existing = client.get(magnet); if (existing && existing.infoHash) return { ok: true, infoHash: existing.infoHash, name: existing.name, reused: true };
    return await new Promise((resolve) => {
        let settled = false;
        const t = client.add(magnet, { path: dir, announce: opts.announce || [] }, () => {});
        t.on("metadata", () => { if (settled) return; settled = true; resolve({ ok: true, infoHash: t.infoHash, name: t.name, size: t.length, files: t.files.length, dir }); });
        t.on("error", (e) => { if (settled) return; settled = true; resolve({ ok: false, error: String(e && e.message || e) }); });
        if (opts.peer) { try { t.addPeer(opts.peer); } catch {} }   // direct LAN peer (host:port) when discovery is off
        setTimeout(() => { if (!settled) { settled = true; resolve({ ok: true, infoHash: t.infoHash, name: t.name || "(pending)", pending: true, dir }); } }, opts.timeoutMs || 15000);
    });
}

// live status of every torrent this client is seeding or downloading
function status() {
    if (!_client) return { ok: true, available: _loadErr == null, installed: isInstalled(), installing: !!_installChild, installLog: _installLog.slice(-30), torrents: [], down: 0, up: 0 };
    const torrents = _client.torrents.map((t) => ({
        infoHash: t.infoHash, name: t.name, size: t.length,
        progress: Math.round((t.progress || 0) * 1000) / 10, done: !!t.done,
        peers: t.numPeers, down: Math.round(t.downloadSpeed || 0), up: Math.round(t.uploadSpeed || 0),
        seeding: _seeded.has(t.infoHash), magnet: t.magnetURI,
    }));
    return { ok: true, available: true, torrents, down: Math.round(_client.downloadSpeed || 0), up: Math.round(_client.uploadSpeed || 0) };
}

async function remove(infoHash) {
    if (!_client) return { ok: false, error: "no client" };
    return await new Promise((resolve) => {
        try { _client.remove(infoHash, {}, () => { _seeded.delete(infoHash); resolve({ ok: true, infoHash }); }); }
        catch (e) { resolve({ ok: false, error: String(e && e.message || e) }); }
    });
}

// one-click install of the webtorrent package into ai-bridge/, so "not installed" is a button, not a terminal trip.
// One-time, non-blocking; poll installState() for progress. Mirrors renderQaBridge's install discipline.
const { spawn } = require("child_process");
let _installChild = null, _installLog = [], _installExit = null;
function _pushI(chunk) { for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) _installLog.push(line); if (_installLog.length > 400) _installLog = _installLog.slice(-400); }
function isInstalled() { try { require.resolve("webtorrent", { paths: [__dirname] }); return true; } catch { return false; } }
function installState() { return { ok: true, installing: !!_installChild, installed: isInstalled() || _client != null, installLog: _installLog.slice(-30), installExit: _installExit }; }
function install() {
    if (_installChild) return { ok: false, error: "install already running", pid: _installChild.pid };
    if (isInstalled()) return { ok: true, already: true };
    _installLog = []; _installExit = null; _loadErr = null;   // clear any prior "not installed" so the next use retries
    _pushI("[webtorrent] npm install webtorrent (one-time)...");
    const isWin = process.platform === "win32";
    try { _installChild = spawn(isWin ? "npm.cmd" : "npm", ["install", "webtorrent@2", "--no-audit", "--no-fund"], { cwd: __dirname, windowsHide: true, shell: isWin }); }
    catch (e) { _installChild = null; return { ok: false, error: "spawn failed: " + e.message + " (is Node/npm on PATH?)" }; }
    _installChild.stdout && _installChild.stdout.on("data", _pushI);
    _installChild.stderr && _installChild.stderr.on("data", _pushI);
    _installChild.on("error", (e) => { _pushI("[webtorrent] install error: " + e.message); });
    _installChild.on("exit", (code) => { _installExit = code; _pushI("[webtorrent] install exited with code " + code); _installChild = null; });
    return { ok: true, pid: _installChild.pid };
}

module.exports = { ensureClient, available, isInstalled, install, installState, seedPath, addMagnet, status, remove, _seeded };
