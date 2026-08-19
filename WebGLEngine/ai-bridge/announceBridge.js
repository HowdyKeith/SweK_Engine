// announceBridge.js — v1552
// Peer "announcement" broadcast: a SweK Engine with something to say (e.g. low disk)
// fans a short message out to its LAN peers. Each receiver routes it to whatever surface
// is being watched: a live avatar scene performs a visiting-avatar CAMEO (the announcer's
// avatar steps in, waves, speaks, jumps, leaves); any other surface shows a toast/ticker.
// This module owns the message model + fan-out + a recent ring; the server wires it to the
// /avatar/events SSE (pushAvatarEvent) and a low-disk watcher.
"use strict";
const os = require("os");
const fs = require("fs");
const path = require("path");

const CFG = path.join(os.homedir(), ".voxelbridge", "announce.json");
function _load() { try { return JSON.parse(fs.readFileSync(CFG, "utf8")) || {}; } catch { return {}; } }
function _save(o) { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o)); return true; } catch { return false; } }
function getSettings() { const c = _load(); return { ok: true, autoDisk: c.autoDisk !== false, diskGb: (c.diskGb == null ? 2 : c.diskGb) }; }
function setSettings(d) { const c = _load(); if (d && typeof d.autoDisk === "boolean") c.autoDisk = d.autoDisk; if (d && d.diskGb != null) c.diskGb = Math.max(0.2, Math.min(100, Number(d.diskGb) || 2)); _save(c); return getSettings(); }

let _recent = [];          // ring of announcements we've seen (received or sent)
let _seen = new Set();     // dedup by id
let _lastAutoDisk = 0;     // rate-limit the auto disk-low broadcast

const GESTURES = new Set(["wave", "speak", "jump", "dance", "bow", "point"]);
function _id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function _norm(p) {
    p = p || {};
    let g = Array.isArray(p.gestures) ? p.gestures.map(x => String(x).toLowerCase()).filter(x => GESTURES.has(x)) : [];
    if (!g.length) g = ["wave", "speak", "jump"];
    return {
        id: String(p.id || _id()).slice(0, 40),
        at: p.at || Date.now(),
        from: String(p.from || "").replace(/\/+$/, "").slice(0, 200),
        fromName: String(p.fromName || "a peer").slice(0, 60),
        avatar: String(p.avatar || "").slice(0, 400),
        kind: String(p.kind || "info").slice(0, 24),     // disk | info | ...
        text: String(p.text || "").slice(0, 400),
        gestures: g.slice(0, 8),
        ttlMs: Math.max(3000, Math.min(60000, (p.ttlMs | 0) || 13000)),
        // v2209 -- CAST TO PEER. An announcement may carry a stream a peer can open. `_norm` drops every
        // field it does not know, which is why this had to be added here rather than passed through: a
        // message model that silently discards half a payload is worse than one that refuses it.
        //
        // A url that arrives from the network is a url a page will OPEN, so it is validated, not trusted.
        stream: _stream(p.stream),
    };
}

// http, https, ws, wss. Nothing else, ever. `javascript:` and `data:` are how a toast becomes an exploit,
// and a url carrying credentials is a password in somebody's log.
const STREAM_SCHEMES = new Set(["http:", "https:", "ws:", "wss:"]);
function _stream(s) {
    if (!s || typeof s !== "object") return null;
    const raw = String(s.url || "").trim();
    if (!raw || raw.length > 500) return null;
    let u;
    try { u = new URL(raw); } catch { return null; }
    if (!STREAM_SCHEMES.has(u.protocol)) return null;
    if (u.username || u.password) return null;
    return {
        url: u.toString(),
        title: String(s.title || "").slice(0, 80),
        // What the receiver should do with it. A hint, not an instruction: the receiver decides.
        mode: ["webrtc", "mjpeg", "hls", "page"].includes(String(s.mode)) ? String(s.mode) : "page",
    };
}

// receive one announcement (POST /announce). Dedups by id so a re-broadcast won't repeat.
function receive(p) {
    const a = _norm(p);
    if (!a.id || _seen.has(a.id)) return { ok: true, dup: true };
    _seen.add(a.id); _recent.push(a); if (_recent.length > 60) _recent.shift();
    if (_seen.size > 400) _seen = new Set(_recent.map(x => x.id));
    return { ok: true, new: true, announcement: a };
}
function recent(since) { since = since | 0; return _recent.filter(a => a.at > since); }

// fan an announcement out to peers (POST /announce on each). Fire-and-forget per peer.
async function broadcast(payload, peers, selfUrl) {
    if (typeof fetch !== "function") return { ok: false, error: "fetch unavailable (need Node 18+/Bun)" };
    const self = String(selfUrl || "").replace(/\/+$/, "");
    const a = _norm(Object.assign({ from: self, id: _id(), at: Date.now() }, payload));
    const targets = [...new Set((peers || []).map(u => String(u || "").replace(/\/+$/, "")).filter(u => u && u !== self))];
    let sent = 0;
    await Promise.all(targets.map(async u => {
        try { const r = await fetch(u + "/announce", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a), signal: AbortSignal.timeout(6000) }); if (r.ok) sent++; } catch {}
    }));
    return { ok: true, sent, targets: targets.length, announcement: a };
}

// true at most once per minIntervalMs (so a persistently-full disk doesn't spam peers)
function autoDiskAllowed(minIntervalMs) { const now = Date.now(); if (now - _lastAutoDisk < (minIntervalMs || 3600000)) return false; _lastAutoDisk = now; return true; }

module.exports = { getSettings, setSettings, receive, recent, broadcast, autoDiskAllowed, hostName: () => os.hostname(), normalize: _norm, normalizeStream: _stream, STREAM_SCHEMES };
