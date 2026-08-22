"use strict";
// v1636 — "Peer Avatar Visit Synch". A peer's announcement carries its current avatar URL. When one arrives, pull
// that avatar file to ~/.voxelbridge/peer_avatars/<peer>/ IF it fits the budget (the Settings slider, MB). This is
// announce-driven, so it runs even when full asset sync is OFF (no external folder) - it's the minimal data a peer
// needs to be visited by its real avatar. NEVER writes into the versioned engine tree. Budget 0 = off. A HEAD
// checks size first; the GET is hard-capped at the budget so an oversized/mislabeled file can't blow past it.
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const urlMod = require("url");

const DIR = path.join(os.homedir(), ".voxelbridge", "peer_avatars");
let _getBudgetMB = () => 150;
function init(opts) { if (opts && typeof opts.getBudgetMB === "function") _getBudgetMB = opts.getBudgetMB; return { ok: true, dir: DIR }; }
function budgetMB() { try { return Math.max(0, Math.min(300, parseInt(_getBudgetMB(), 10) || 0)); } catch { return 0; } }

const _recent = new Map();   // peer|url -> ts (skip re-pulling the same avatar for a while)
function _safe(s) { return String(s == null ? "peer" : s).replace(/[^a-z0-9_.-]/gi, "_").slice(0, 64) || "peer"; }

function _req(method, u, capBytes) {
    return new Promise((resolve) => {
        let lib, opts; try { const p = new urlMod.URL(u); lib = p.protocol === "https:" ? https : http; opts = { method, hostname: p.hostname, port: p.port, path: p.pathname + (p.search || ""), timeout: 12000 }; } catch { resolve({ ok: false, error: "bad url" }); return; }
        const rq = lib.request(opts, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); resolve(_req(method, new urlMod.URL(res.headers.location, u).href, capBytes)); return; }
            if (res.statusCode !== 200) { res.resume(); resolve({ ok: false, error: "HTTP " + res.statusCode, headers: res.headers }); return; }
            if (method === "HEAD") { res.resume(); resolve({ ok: true, headers: res.headers }); return; }
            const chunks = []; let n = 0, aborted = false;
            res.on("data", (c) => { n += c.length; if (capBytes && n > capBytes) { aborted = true; try { rq.destroy(); } catch {} } else chunks.push(c); });
            res.on("end", () => resolve(aborted ? { ok: false, error: "exceeded budget mid-download" } : { ok: true, headers: res.headers, buf: Buffer.concat(chunks) }));
        });
        rq.on("error", (e) => resolve({ ok: false, error: String(e && e.message || e) }));
        rq.on("timeout", () => { try { rq.destroy(); } catch {} resolve({ ok: false, error: "timed out" }); });
        rq.end();
    });
}

// Resolve the avatar URL to something fetchable. Absolute http(s) wins; otherwise resolve a relative path against
// the announcing peer's base URL (the announce's `from`).
function _resolve(avatarUrl, peerBase) {
    avatarUrl = String(avatarUrl || "").trim(); if (!avatarUrl) return "";
    if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl;
    try { if (peerBase) return new urlMod.URL(avatarUrl, peerBase).href; } catch {}
    return "";
}

async function pull(peer, avatarUrl, peerBase) {
    try {
        const mb = budgetMB(); if (mb <= 0) return { ok: false, skipped: "synch off (budget 0)" };
        const u = _resolve(avatarUrl, peerBase); if (!u) return { ok: false, skipped: "no fetchable avatar url" };
        const key = _safe(peer) + "|" + u;
        if (_recent.get(key) && Date.now() - _recent.get(key) < 5 * 60000) return { ok: true, cached: true };
        const cap = mb * 1048576;
        const head = await _req("HEAD", u);
        if (head.ok) { const len = parseInt((head.headers && head.headers["content-length"]) || "0", 10); if (len && len > cap) { _recent.set(key, Date.now()); return { ok: false, skipped: "avatar " + (len / 1048576).toFixed(1) + "MB exceeds " + mb + "MB budget" }; } }
        const body = await _req("GET", u, cap);
        if (!body.ok) return { ok: false, error: body.error };
        const peerDir = path.join(DIR, _safe(peer)); fs.mkdirSync(peerDir, { recursive: true });
        let fname = _safe(path.basename(urlMod.parse(u).pathname || "") || "avatar.glb"); if (!/\.[a-z0-9]{2,5}$/i.test(fname)) fname += ".glb";
        fs.writeFileSync(path.join(peerDir, fname), body.buf);
        fs.writeFileSync(path.join(peerDir, "meta.json"), JSON.stringify({ peer: String(peer), url: u, file: fname, bytes: body.buf.length, at: Date.now() }, null, 2));
        _recent.set(key, Date.now());
        return { ok: true, file: fname, bytes: body.buf.length, mb: +(body.buf.length / 1048576).toFixed(2) };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

function localFor(peer) { try { return JSON.parse(fs.readFileSync(path.join(DIR, _safe(peer), "meta.json"), "utf8")); } catch { return null; } }
function list() {
    const out = [];
    try { for (const p of fs.readdirSync(DIR)) { const m = localFor(p); if (m) out.push({ peer: p, file: m.file, mb: +(m.bytes / 1048576).toFixed(2), at: m.at }); } } catch {}
    return { ok: true, budgetMB: budgetMB(), dir: DIR, avatars: out };
}
// absolute path of a cached peer-avatar file, scoped under DIR (path-traversal safe). "" if not present.
function filePath(peer, file) {
    const base = path.join(DIR, _safe(peer)); const fp = path.resolve(base, _safe(file));
    if (fp !== base && !fp.startsWith(base + path.sep)) return "";
    try { return fs.statSync(fp).isFile() ? fp : ""; } catch { return ""; }
}

module.exports = { init, pull, list, localFor, filePath, budgetMB, DIR };
