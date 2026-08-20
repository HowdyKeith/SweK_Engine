// ai-bridge/peerIdentityBridge.js — v1676
//
// A stable, private per-engine identity + a peer registry that dedups by that identity (not by IP/URL), so an
// engine that hops networks (LAN -> hub -> wifi -> dock) re-slots under its new IP as ONE row instead of piling up
// a new row per IP. Also prunes peers that aren't currently online and lets the user pin "Favorites" (always-on
// engines) that raise an alarm when they go missing.
//
// Identity model:
//   * key  — a private secret generated ONCE and stored locally (~/.voxelbridge/identity.json, 0600). Never leaves
//            this box. Two installs (even two machines both named "Galaxina") get different keys -> different ids.
//   * id   — the public identity advertised to LAN peers, derived as sha256(key)[:16]. Stable across restarts +
//            IP changes; provably owned by whoever holds the key. This is the dedup key.
//   * name — os.hostname(), shown to the user.
//
// The pure list builder (buildList) is unit-tested; the file I/O + registry are thin wrappers around it.

const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
const DIR = path.join(os.homedir(), ".voxelbridge");
const ID_PATH = path.join(DIR, "identity.json");
const FAV_PATH = path.join(DIR, "favorites.json");

let _self = null;
function self() {
    if (_self) return _self;
    try { const j = JSON.parse(fs.readFileSync(ID_PATH, "utf8")); if (j && j.id && j.key) { _self = j; if (!_self.name) _self.name = os.hostname() || "swek"; return _self; } } catch {}
    const key = crypto.randomBytes(32).toString("hex");
    const id = crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
    _self = { id, key, name: os.hostname() || "swek", created: Date.now() };
    try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(ID_PATH, JSON.stringify(_self, null, 2), { mode: 0o600 }); } catch {}
    return _self;
}
// public identity only (no secret key) — safe to advertise in caps
function publicId() { const s = self(); return { id: s.id, name: s.name }; }

// ---- registry: id -> { id, name, url, ip, lastSeen, online }, plus a url->id index so a saved URL can be
// resolved to its engine identity once we've seen/probed it. ---------------------------------------------------
const _reg = new Map();
const _urlId = new Map();
function note(entry) {
    if (!entry) return;
    let { id, url, name, ip, lastSeen, online } = entry;
    if (!id && url) id = _urlId.get(url);          // resolve identity from a known URL
    if (!id) return;
    if (url) _urlId.set(url, id);
    const prev = _reg.get(id) || {};
    _reg.set(id, {
        id, name: name || prev.name || "",
        url: url || prev.url || "", ip: ip || prev.ip || "",
        lastSeen: lastSeen || prev.lastSeen || Date.now(),
        online: (online != null ? !!online : !!prev.online),
        lastProbe: prev.lastProbe || 0,
    });
}
function markProbed(url) { const id = _urlId.get(url); if (id) { const r = _reg.get(id); if (r) r.lastProbe = Date.now(); } else { _urlId.set("probe:" + url, Date.now()); } }
function lastProbeOf(url) { const id = _urlId.get(url); if (id) { const r = _reg.get(id); if (r) return r.lastProbe || 0; } const t = _urlId.get("probe:" + url); return t || 0; }
function regByUrl(url) { const id = _urlId.get(url); return id ? _reg.get(id) : null; }
function reg(id) { return _reg.get(id) || null; }

// ---- favorites: persisted Set of ids -----------------------------------------------------------------------
let _fav = null;
function _loadFav() {
    if (_fav) return _fav;
    try { const a = JSON.parse(fs.readFileSync(FAV_PATH, "utf8")); _fav = new Set(Array.isArray(a) ? a : (a && a.ids) || []); }
    catch { _fav = new Set(); }
    return _fav;
}
function _saveFav() { try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FAV_PATH, JSON.stringify([..._loadFav()]), { mode: 0o600 }); } catch {} }
function favorites() { return [..._loadFav()]; }
function isFavorite(id) { return _loadFav().has(id); }
function setFavorite(id, on) { if (!id) return { ok: false, error: "id required" }; const f = _loadFav(); if (on) f.add(id); else f.delete(id); _saveFav(); return { ok: true, favorites: [...f] }; }

// ---- the pure list builder (dedup by id, exclude self, prune offline, merge favorites). Deterministic; tested.
// candidates: [{ id?, url, name?, ip?, lastSeen?, online? }]. opts: { now, onlineMs, selfId, favorites, registry }.
function buildList(candidates, opts = {}) {
    const now = opts.now || Date.now();
    const onlineMs = opts.onlineMs || 60000;
    const selfId = opts.selfId || self().id;
    const favSet = new Set(opts.favorites || [..._loadFav()]);
    const registry = opts.registry || _reg;

    const byId = new Map();
    for (const p of (candidates || [])) {
        const id = p.id || ("url:" + (p.url || ""));     // fall back to URL identity for peers not yet advertising an id
        if (id === selfId) continue;                      // never list ourselves
        const seen = p.lastSeen || now;
        const online = (p.online != null ? !!p.online : true) && (now - seen) <= onlineMs;
        const prev = byId.get(id);
        if (!prev || seen > prev._seen) {
            byId.set(id, { id, name: p.name || (prev && prev.name) || "", url: p.url || (prev && prev.url) || "",
                ip: p.ip || (prev && prev.ip) || "", online, favorite: favSet.has(id), _seen: seen });
        } else if (online && !prev.online) { prev.online = true; }
    }
    // keep online peers + favorites (even offline, so an always-on box you rely on still shows + alarms)
    const out = [];
    for (const e of byId.values()) { if (e.online || e.favorite) out.push(e); }
    // surface offline favorites that weren't seen at all this pass, from the registry (so they alarm when down)
    for (const fid of favSet) {
        if (fid === selfId || byId.has(fid)) continue;
        const r = registry.get ? registry.get(fid) : null;
        out.push({ id: fid, name: (r && r.name) || "", url: (r && r.url) || "", ip: (r && r.ip) || "", online: false, favorite: true, _seen: (r && r.lastSeen) || 0 });
    }
    out.sort((a, b) => (Number(b.favorite) - Number(a.favorite)) || (Number(b.online) - Number(a.online)) || String(a.name || a.ip).localeCompare(String(b.name || b.ip)));
    const peers = out.map((e) => ({ id: e.id, name: e.name, url: e.url, ip: e.ip, online: e.online, favorite: e.favorite }));
    const alarms = peers.filter((e) => e.favorite && !e.online).map((e) => ({ id: e.id, name: e.name, url: e.url }));
    return { ok: true, self: selfId, peers, alarms, online: peers.filter((p) => p.online).length };
}

module.exports = { self, publicId, note, markProbed, lastProbeOf, regByUrl, reg, favorites, isFavorite, setFavorite, buildList };
