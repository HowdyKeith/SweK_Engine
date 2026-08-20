"use strict";
// v1617 — cloud link: connects this bridge to a SweK rendezvous server (see cloud/swek-rendezvous/). When
// enabled it (a) registers on a heartbeat so the box shows in the cross-network directory, (b) caches that
// directory for the panel, and (c) PROXIES WebRTC signaling so the browser can open a P2P link to a remote
// peer/user WITHOUT ever seeing the shared token (it stays here, server-side). Config: ~/.voxelbridge/cloud.json.

const fs = require("fs"), path = require("path"), os = require("os"), http = require("http"), https = require("https");
const CFG = path.join(os.homedir(), ".voxelbridge", "cloud.json");

let _cfg = { enabled: false, url: "", token: "", id: "", name: "", turnUrl: "", turnUser: "", turnCred: "" };
let _dir = [];
let _last = { ok: false, at: 0, error: "", registered: false };
let _timer = null;
let _annTimer = null;
let _lastAnnTs = 0;
let _onAnnounce = null;
let _nameFn = () => os.hostname();

function _load() { try { Object.assign(_cfg, JSON.parse(fs.readFileSync(CFG, "utf8")) || {}); } catch {} if (!_cfg.id) { _cfg.id = "swek-" + Math.random().toString(36).slice(2, 10); _save(); } }
function _save() { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(_cfg)); } catch {} }
_load();

// standalone http/https JSON call (the bridge's _peerJSON is scoped inside server.js; keep this module self-contained)
function _httpJSON(fullUrl, method, bodyObj, timeoutMs) {
    return new Promise((resolve) => {
        let u; try { u = new URL(fullUrl); } catch { return resolve({ ok: false, error: "bad url" }); }
        const mod = u.protocol === "https:" ? https : http;
        const payload = bodyObj != null ? Buffer.from(JSON.stringify(bodyObj)) : null;
        const headers = {}; if (payload) { headers["Content-Type"] = "application/json"; headers["Content-Length"] = payload.length; }
        let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
        const rq = mod.request({ hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80), path: u.pathname + (u.search || ""), method: method || "GET", headers }, (resp) => {
            let d = ""; resp.on("data", (c) => d += c); resp.on("end", () => { try { fin(JSON.parse(d || "{}")); } catch { fin({ ok: false, error: "bad json", raw: String(d).slice(0, 160) }); } });
        });
        rq.on("error", (e) => fin({ ok: false, error: String((e && e.message) || e), unreachable: true }));
        rq.setTimeout(timeoutMs || 6000, () => { try { rq.destroy(); } catch {} fin({ ok: false, error: "timed out", unreachable: true }); });
        if (payload) rq.write(payload); rq.end();
    });
}
function _base() { return String(_cfg.url || "").replace(/\/+$/, ""); }
function _tok() { return _cfg.token ? ("token=" + encodeURIComponent(_cfg.token)) : ""; }
function _withTok(pathPart) { const t = _tok(); return _base() + pathPart + (t ? (pathPart.includes("?") ? "&" : "?") + t : ""); }

function init(opts) { opts = opts || {}; if (typeof opts.name === "function") _nameFn = opts.name; if (typeof opts.onAnnounce === "function") _onAnnounce = opts.onAnnounce; _restart(); }
// getConfig never returns the rendezvous token VALUE — just whether one is set. TURN url/user/cred ARE returned
// because WebRTC ICE needs them client-side (they only grant relay use, not rendezvous access).
function getConfig() { return { enabled: !!_cfg.enabled, url: _cfg.url || "", token: _cfg.token ? "set" : "", id: _cfg.id, name: _cfg.name || "", turnUrl: _cfg.turnUrl || "", turnUser: _cfg.turnUser || "", turnCred: _cfg.turnCred || "" }; }
function setConfig(o) {
    o = o || {};
    if ("enabled" in o) _cfg.enabled = !!o.enabled;
    if ("url" in o) _cfg.url = String(o.url || "").trim();
    if ("token" in o && o.token !== "set") _cfg.token = String(o.token || "");   // "set" sentinel = leave unchanged
    if ("name" in o) _cfg.name = String(o.name || "").slice(0, 64);
    if ("turnUrl" in o) _cfg.turnUrl = String(o.turnUrl || "").trim();
    if ("turnUser" in o) _cfg.turnUser = String(o.turnUser || "").trim();
    if ("turnCred" in o) _cfg.turnCred = String(o.turnCred || "");
    _save(); _restart(); return getConfig();
}
function status() { return Object.assign({ enabled: !!_cfg.enabled, url: _cfg.url, id: _cfg.id, peers: _dir.length }, _last); }
function directory() { return _dir; }

async function _beat() {
    if (!_cfg.enabled || !_cfg.url) return;
    let name = ""; try { name = _cfg.name || _nameFn() || os.hostname(); } catch { name = os.hostname(); }
    const r = await _httpJSON(_withTok("/register"), "POST", { id: _cfg.id, name, kind: "engine" }, 6000);
    if (r && r.ok) { _dir = Array.isArray(r.peers) ? r.peers : []; _last = { ok: true, at: Date.now(), error: "", registered: true }; }
    else { _last = { ok: false, at: Date.now(), error: (r && r.error) || "register failed", registered: false }; }
}
function _restart() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    if (_annTimer) { clearInterval(_annTimer); _annTimer = null; }
    if (_cfg.enabled && _cfg.url) {
        _lastAnnTs = Date.now();                                          // only relay announces from NOW on (no backlog replay on connect)
        _beat().catch(() => {}); _timer = setInterval(() => _beat().catch(() => {}), 20000); if (_timer.unref) _timer.unref();
        _annTimer = setInterval(() => _annPoll().catch(() => {}), 6000); if (_annTimer.unref) _annTimer.unref();
    }
}

// --- announce relay (cross-network disk/peer alerts) ----------------------------------------------------
// publishAnnounce(a): push a LOCALLY-originated announcement (with its id) to the cloud, tagged with our id so
// we don't replay it to ourselves. _annPoll(): pull remote announcements and hand them to onAnnounce, which the
// server wires to the same path a LAN /announce takes (dedup by id -> avatar cameo).
async function publishAnnounce(ann) {
    if (!_cfg.enabled || !_cfg.url || !ann) return;
    await _httpJSON(_withTok("/announce"), "POST", { channel: "main", ann: Object.assign({}, ann, { _origin: _cfg.id }) }, 6000);
}
// v1624 — upload an image to the rendezvous blob relay; returns { ok, url } (a public, TTL'd fetch URL the remote
// peer's cast device can reach). The token stays server-side here.
async function uploadBlob(buf, type) {
    if (!_cfg.enabled || !_cfg.url) return { ok: false, error: "cloud not enabled" };
    const data = Buffer.isBuffer(buf) ? buf.toString("base64") : String(buf || "");
    if (!data) return { ok: false, error: "no data" };
    const r = await _httpJSON(_withTok("/blob"), "POST", { data, type: type || "image/jpeg" }, 20000);
    return r || { ok: false, error: "no response" };
}
// v1625 — probe the rendezvous /health (no auth needed) so the panel can show reachability + round-trip latency.
async function health() {
    if (!_cfg.url) return { ok: false, reachable: false, error: "no url" };
    const t0 = Date.now();
    const r = await _httpJSON(_base() + "/health", "GET", null, 6000);
    const latencyMs = Date.now() - t0;
    if (r && r.ok) return { ok: true, reachable: true, latencyMs, peers: r.peers, auth: !!r.auth, service: r.service || "" };
    return { ok: false, reachable: false, latencyMs, error: (r && r.error) || "unreachable" };
}
async function _annPoll() {
    if (!_cfg.enabled || !_cfg.url) return;
    const r = await _httpJSON(_withTok("/announce?channel=main&since=" + _lastAnnTs), "GET", null, 6000);
    if (!r || !r.ok || !Array.isArray(r.anns)) return;
    for (const it of r.anns) {
        if (it && it.ts > _lastAnnTs) _lastAnnTs = it.ts;
        const ann = it && it.ann; if (!ann || ann._origin === _cfg.id) continue;   // skip our own echo
        if (ann.to && ann.to !== _cfg.id) continue;                                 // v1622 — targeted wave: only the addressed peer reacts
        if (typeof _onAnnounce === "function") { try { _onAnnounce(ann); } catch {} }
    }
}

// --- signaling proxy (browser -> bridge -> cloud, so the token never reaches the browser) ----------------
async function sendSignal(to, from, kind, data) {
    if (!_cfg.enabled || !_cfg.url) return { ok: false, error: "cloud link disabled" };
    return _httpJSON(_withTok("/signal"), "POST", { to, from, kind, data }, 6000);
}
async function pollSignal(id) {
    if (!_cfg.enabled || !_cfg.url) return { ok: false, error: "cloud link disabled", msgs: [] };
    return _httpJSON(_withTok("/signal?id=" + encodeURIComponent(id)), "GET", null, 6000);
}

async function pilots() {   // admin spectator: aggregate live pilots across all rooms (token stays here)
    if (!_cfg.url) return { ok: false, error: "no url", rooms: {}, total: 0 };
    const r = await _httpJSON(_withTok("/presence/all"), "GET", null, 6000);
    if (r && r.ok) return { ok: true, rooms: r.rooms || {}, total: r.total || 0 };
    return { ok: false, error: (r && r.error) || "unreachable", rooms: {}, total: 0 };
}
function rawToken() { return _cfg.token || ""; }   // raw token for browser P2P signaling; ONLY returned by a local/trusted bridge route
module.exports = { init, getConfig, setConfig, status, directory, sendSignal, pollSignal, publishAnnounce, uploadBlob, health, pilots, rawToken, _beat };
