// ai-bridge/remoteVisitors.js — v1914
// Remembers a friendly NAME per remote IP (so a through-tunnel visitor shows as "Cousin Jesse" instead
// of "guest 96.238.x.x"), and caches a coarse GEO location per IP (city/region/country) so the peer list
// can show "California". Both persist to ~/.voxelbridge so names/geo survive restarts.
//
// Geo lookup uses ipapi.co (HTTPS, no key, ~1000/day free). Results are cached indefinitely per IP (a
// home IP's city rarely changes and we only see a handful of visitors), so we make at most one lookup
// per new IP. ip-api.com is a fallback but it's HTTP-only, so we only try it if ipapi.co fails.
const fs = require("fs");
const os = require("os");
const path = require("path");

const DIR = path.join(os.homedir(), ".voxelbridge");
const FILE = path.join(DIR, "remote-visitors.json");

let _db = null;   // { names: { ip: name }, geo: { ip: {city,region,country,at} } }
function _load() {
    if (_db) return _db;
    try { _db = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { _db = {}; }
    if (!_db.names) _db.names = {};
    if (!_db.geo) _db.geo = {};
    if (!_db.log) _db.log = {};   // v1919 — ip -> { first, last, visits, ua, lastName }
    return _db;
}
function _save() { try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(_db, null, 2), { mode: 0o600 }); } catch {} }

function nameFor(ip) { const d = _load(); return (ip && d.names[ip]) || ""; }
function setName(ip, name) {
    const d = _load();
    ip = String(ip || "").trim(); name = String(name || "").trim().slice(0, 40);
    if (!ip) return { ok: false, error: "no ip" };
    if (!name) { delete d.names[ip]; _save(); return { ok: true, cleared: true, ip }; }
    d.names[ip] = name; _save();
    return { ok: true, ip, name };
}
function allNames() { const d = _load(); return Object.assign({}, d.names); }

function geoFor(ip) { const d = _load(); return (ip && d.geo[ip]) || null; }
function _looksPublic(ip) {
    if (!ip || typeof ip !== "string") return false;
    if (/^(10\.|127\.|192\.168\.|169\.254\.|::1|fc|fd)/i.test(ip)) return false;   // private/loopback
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return false;
    return /\d+\.\d+\.\d+\.\d+/.test(ip) || ip.includes(":");   // v4 or v6
}

// look up + cache geo for an ip (once). fetchImpl passed in so we reuse the bridge's fetch.
async function lookupGeo(ip, fetchImpl) {
    const d = _load();
    if (!ip || !_looksPublic(ip)) return null;
    if (d.geo[ip]) return d.geo[ip];   // cached
    const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!f) return null;
    // 1) ipapi.co — HTTPS, no key
    try {
        const r = await f("https://ipapi.co/" + encodeURIComponent(ip) + "/json/", { signal: AbortSignal.timeout(6000), headers: { "User-Agent": "SweK/1" } });
        if (r.ok) {
            const j = await r.json();
            if (j && !j.error && (j.city || j.region || j.country_name)) {
                const geo = { city: j.city || "", region: j.region || "", country: j.country_name || j.country || "", cc: j.country || "", lat: (typeof j.latitude === "number" ? j.latitude : null), lon: (typeof j.longitude === "number" ? j.longitude : null), at: Date.now(), src: "ipapi.co" };
                d.geo[ip] = geo; _save(); return geo;
            }
        }
    } catch {}
    // 2) ip-api.com — HTTP only, non-commercial; last resort
    try {
        const r = await f("http://ip-api.com/json/" + encodeURIComponent(ip) + "?fields=status,country,countryCode,regionName,city,lat,lon", { signal: AbortSignal.timeout(6000) });
        if (r.ok) {
            const j = await r.json();
            if (j && j.status === "success") {
                const geo = { city: j.city || "", region: j.regionName || "", country: j.country || "", cc: j.countryCode || "", lat: (typeof j.lat === "number" ? j.lat : null), lon: (typeof j.lon === "number" ? j.lon : null), at: Date.now(), src: "ip-api.com" };
                d.geo[ip] = geo; _save(); return geo;
            }
        }
    } catch {}
    // negative cache (short) so we don't hammer on every poll for an unresolvable ip
    d.geo[ip] = { city: "", region: "", country: "", cc: "", at: Date.now(), src: "none" }; _save();
    return d.geo[ip];
}

// short human label like "San Jose, California" or "California, US" or ""
function geoLabel(geo) {
    if (!geo) return "";
    const parts = [];
    if (geo.city) parts.push(geo.city);
    if (geo.region && geo.region !== geo.city) parts.push(geo.region);
    if (!parts.length && geo.country) parts.push(geo.country);
    return parts.join(", ");
}

// ── v1919 — persistent visit log ─────────────────────────────────────────────
// Record each through-tunnel visit. A new "visit" is counted when the gap since this IP was last seen
// exceeds VISIT_GAP (30 min) — so a continuous browse is one visit, not hundreds. Bounded to MAX_LOG IPs
// (oldest-last-seen evicted), so the log can't grow without limit. Persisted with names/geo.
const VISIT_GAP = 30 * 60 * 1000;
const MAX_LOG = 500;
function recordVisit(ip, ua, name) {
    const d = _load();
    if (!ip || typeof ip !== "string") return;
    if (!_looksPublic(ip)) return;   // don't log LAN/loopback
    const now = Date.now();
    let e = d.log[ip];
    if (!e) { e = { first: now, last: now, visits: 1, ua: (ua || "").slice(0, 120), lastName: name || "" }; d.log[ip] = e; }
    else {
        if (now - e.last > VISIT_GAP) e.visits = (e.visits || 1) + 1;   // new session
        e.last = now;
        if (ua) e.ua = String(ua).slice(0, 120);
        if (name) e.lastName = name;
    }
    // evict oldest if over cap
    const ips = Object.keys(d.log);
    if (ips.length > MAX_LOG) {
        ips.sort((a, b) => (d.log[a].last || 0) - (d.log[b].last || 0));
        for (let i = 0; i < ips.length - MAX_LOG; i++) delete d.log[ips[i]];
    }
    _save();
}
// full log, newest-first, enriched with the current remembered name + geo label.
function visitLog(limit) {
    const d = _load();
    const out = Object.keys(d.log).map(ip => {
        const e = d.log[ip];
        return { ip, first: e.first, last: e.last, visits: e.visits || 1, ua: e.ua || "", name: (d.names[ip] || e.lastName || ""), geo: geoLabel(d.geo[ip]) };
    });
    out.sort((a, b) => (b.last || 0) - (a.last || 0));
    return (limit && limit > 0) ? out.slice(0, limit) : out;
}
function clearLog() { const d = _load(); d.log = {}; _save(); return { ok: true }; }
function forgetVisitor(ip) { const d = _load(); let n = 0; if (d.log[ip]) { delete d.log[ip]; n++; } if (d.names[ip]) { delete d.names[ip]; n++; } if (d.geo[ip]) { delete d.geo[ip]; n++; } _save(); return { ok: true, removed: n, ip }; }

module.exports = { nameFor, setName, allNames, geoFor, lookupGeo, geoLabel, recordVisit, visitLog, clearLog, forgetVisitor };
