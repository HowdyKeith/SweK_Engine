"use strict";
// v1629 — bridge-proxied Google Maps. The API key stays SERVER-SIDE: the browser never sees it. Two operations:
//   geocode(address) -> {lat,lng,formatted}, cached to disk so the same address never re-bills.
//   staticMap({markers,...}) -> a map image with pins, fetched here (key hidden), cached in-memory per request.
// The real cost guardrail is a daily quota cap + budget alert you set in the Google console; the caches just stop
// needless repeat billing. Enable the "Maps Static API" and "Geocoding API" on the key.
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DIR = path.join(os.homedir(), ".voxelbridge");
const CFG = path.join(DIR, "maps.json");
const GEOCACHE = path.join(DIR, "maps-geocache.json");

function _load(file, dflt) { try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")); } catch {} return dflt; }
function _save(file, obj) { try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj)); } catch {} }

let _cfg = _load(CFG, { key: "" });
let _geo = _load(GEOCACHE, {});   // lowercased address -> { lat, lng, formatted, ts }

function _key() { return _cfg.key || process.env.GOOGLE_MAPS_KEY || ""; }
function getConfig() { return { ok: true, hasKey: !!_key() }; }
function setConfig(d) { d = d || {}; if (typeof d.key === "string") _cfg.key = d.key.trim(); if (d.clear) _cfg.key = ""; _save(CFG, _cfg); return getConfig(); }

function _httpsGet(url, timeoutMs) {
    return new Promise((resolve) => {
        let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
        const rq = https.get(url, (resp) => { const chunks = []; resp.on("data", (c) => chunks.push(c)); resp.on("end", () => fin({ status: resp.statusCode, headers: resp.headers, buf: Buffer.concat(chunks) })); });
        rq.on("error", (e) => fin({ status: 0, error: String(e && e.message || e) }));
        rq.setTimeout(timeoutMs || 10000, () => { try { rq.destroy(); } catch {} fin({ status: 0, error: "timed out" }); });
    });
}

async function geocode(address) {
    address = String(address || "").trim();
    if (!address) return { ok: false, error: "address required" };
    const key = _key(); if (!key) return { ok: false, error: "no Maps API key set (Settings -> Google -> Maps)" };
    const ck = address.toLowerCase();
    if (_geo[ck]) return { ok: true, cached: true, lat: _geo[ck].lat, lng: _geo[ck].lng, formatted: _geo[ck].formatted };
    const url = "https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(address) + "&key=" + encodeURIComponent(key);
    const r = await _httpsGet(url, 10000);
    if (r.status !== 200) return { ok: false, error: "geocode HTTP " + r.status + (r.error ? (" " + r.error) : "") };
    let j; try { j = JSON.parse(r.buf.toString()); } catch { return { ok: false, error: "bad geocode response" }; }
    if (j.status !== "OK" || !j.results || !j.results[0]) return { ok: false, error: "geocode: " + (j.status || "no result") + (j.error_message ? (" \u2014 " + j.error_message) : "") };
    const loc = j.results[0].geometry.location, formatted = j.results[0].formatted_address || address;
    _geo[ck] = { lat: loc.lat, lng: loc.lng, formatted, ts: Date.now() }; _save(GEOCACHE, _geo);
    return { ok: true, lat: loc.lat, lng: loc.lng, formatted };
}

// Build the Static Maps URL. params: { size, scale, maptype, center, zoom, markers:[{lat,lng,label,color}] }.
// With no center/zoom, Static Maps auto-fits to the markers.
function _buildStaticUrl(p, key) {
    p = p || {};
    const size = (String(p.size || "640x400").match(/^\d{1,4}x\d{1,4}$/) || ["640x400"])[0];
    const parts = ["https://maps.googleapis.com/maps/api/staticmap?size=" + size, "scale=" + (p.scale === 2 ? 2 : 1)];
    if (p.maptype) parts.push("maptype=" + encodeURIComponent(String(p.maptype)));
    if (p.center) parts.push("center=" + encodeURIComponent(String(p.center)));
    if (p.zoom) parts.push("zoom=" + encodeURIComponent(String(p.zoom)));
    for (const m of (Array.isArray(p.markers) ? p.markers : [])) {
        if (!m || m.lat == null || m.lng == null) continue;
        const color = String(m.color || "red").replace(/[^a-z0-9]/gi, "") || "red";
        const label = m.label ? ("label:" + encodeURIComponent(String(m.label).slice(0, 1).toUpperCase()) + "%7C") : "";
        parts.push("markers=color:" + color + "%7C" + label + Number(m.lat) + "," + Number(m.lng));
    }
    parts.push("key=" + encodeURIComponent(key));
    return parts.join("&");
}

const _imgCache = new Map();   // request hash -> { buf, type, ts }
const IMG_TTL = 30 * 60 * 1000;
async function staticMap(p) {
    const key = _key(); if (!key) return { ok: false, error: "no Maps API key set (Settings -> Google -> Maps)" };
    p = p || {};
    const hash = JSON.stringify({ size: p.size, scale: p.scale, maptype: p.maptype, center: p.center, zoom: p.zoom, markers: p.markers });
    const hit = _imgCache.get(hash); if (hit && (Date.now() - hit.ts < IMG_TTL)) return { ok: true, cached: true, buf: hit.buf, type: hit.type };
    const r = await _httpsGet(_buildStaticUrl(p, key), 12000);
    if (r.status !== 200) return { ok: false, error: "staticmap HTTP " + r.status + (r.error ? (" " + r.error) : ""), detail: r.buf ? r.buf.toString().slice(0, 160) : "" };
    const type = (r.headers && r.headers["content-type"]) || "image/png";
    if (_imgCache.size > 200) _imgCache.clear();
    _imgCache.set(hash, { buf: r.buf, type, ts: Date.now() });
    return { ok: true, buf: r.buf, type };
}

// ── v1921 — OpenStreetMap providers (no Google key needed) ───────────────────────────────────────
// Three OSM-based options, all respecting the OSM tile policy (identify via User-Agent; cache to disk with
// a >=7-day TTL; only fetch tiles for the requested view — no bulk/offline prefetch against public OSM):
//   1. LIVE OSM  — fetch {z}/{x}/{y} tiles on demand and stitch a static image (free, no key).
//   2. CACHED    — same, but the disk tile cache means revisits are served locally (offline-ish, policy-ok).
//   3. SELF-HOST — if the user points TILE_DIR at their own tiles (e.g. self-hosted RI extract), we serve
//      those first and never hit the network — the truly-offline, fully-owned option.
// A provider key can also select Geoapify/Stadia/MapTiler (OSM-derived, nicer styles) when a key is set.
const http = require("http");
const TILE_CACHE = path.join(DIR, "map-tiles");           // disk tile cache: <provider>/<z>/<x>/<y>.png
const TILE_TTL = 30 * 24 * 3600 * 1000;                   // 30 days (well past OSM's 7-day minimum)
const UA = "SweKEngine/1.0 (LAN portfolio engine; +https://github.com/HowdyKeith)";   // OSM policy: identify yourself

// provider registry. url template uses {s}{z}{x}{y}{k}. keyed ones only used when a key is present.
const TILE_PROVIDERS = {
    osm:      { name: "OpenStreetMap",        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", key: false, attr: "\u00a9 OpenStreetMap contributors" },
    osm_de:   { name: "OSM Germany",          url: "https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png", key: false, subs: ["a", "b", "c"], attr: "\u00a9 OpenStreetMap contributors" },
    geoapify: { name: "Geoapify (toner-grey)",url: "https://maps.geoapify.com/v1/tile/toner-grey/{z}/{x}/{y}.png?apiKey={k}", key: true, attr: "\u00a9 OpenStreetMap contributors, \u00a9 Geoapify" },
    stadia:   { name: "Stadia (dark)",        url: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png?api_key={k}", key: true, attr: "\u00a9 Stadia Maps, \u00a9 OpenStreetMap contributors" },
    maptiler: { name: "MapTiler",             url: "https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key={k}", key: true, attr: "\u00a9 MapTiler, \u00a9 OpenStreetMap contributors" },
};
function mapProviders() { return Object.keys(TILE_PROVIDERS).map(id => ({ id, name: TILE_PROVIDERS[id].name, needsKey: !!TILE_PROVIDERS[id].key, hasKey: !TILE_PROVIDERS[id].key || !!_providerKey(id) })); }
function _providerKey(id) { return (_cfg.providerKeys && _cfg.providerKeys[id]) || ""; }
function setProviderKey(id, key) { if (!TILE_PROVIDERS[id]) return { ok: false, error: "unknown provider" }; _cfg.providerKeys = _cfg.providerKeys || {}; _cfg.providerKeys[id] = String(key || "").trim(); _save(CFG, _cfg); return { ok: true, id, hasKey: !!_providerKey(id) }; }
// user's own self-hosted tile dir (fully offline). set to a folder of <z>/<x>/<y>.png.
function selfHostDir() { return (_cfg.tileDir && String(_cfg.tileDir)) || ""; }
function setSelfHostDir(dir) { _cfg.tileDir = String(dir || "").trim(); _save(CFG, _cfg); return { ok: true, tileDir: _cfg.tileDir }; }

function _lonLatToTile(lon, lat, z) {
    const n = Math.pow(2, z);
    const x = Math.floor((lon + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)), n };
}
function _tilePath(provider, z, x, y) { return path.join(TILE_CACHE, provider, String(z), String(x), String(y) + ".png"); }

// fetch a single tile: self-hosted dir -> disk cache -> network (with UA + caching). returns Buffer|null.
async function _getTile(provider, z, x, y) {
    // 1) self-hosted dir wins (fully offline)
    const sh = selfHostDir();
    if (sh) { try { const p = path.join(sh, String(z), String(x), String(y) + ".png"); if (fs.existsSync(p)) return fs.readFileSync(p); } catch {} }
    // 2) disk cache
    const cp = _tilePath(provider, z, x, y);
    try { const st = fs.statSync(cp); if (Date.now() - st.mtimeMs < TILE_TTL) return fs.readFileSync(cp); } catch {}
    // 3) network
    const def = TILE_PROVIDERS[provider] || TILE_PROVIDERS.osm;
    if (def.key && !_providerKey(provider)) return null;   // keyed provider without a key
    let url = def.url.replace("{z}", z).replace("{x}", x).replace("{y}", y).replace("{k}", encodeURIComponent(_providerKey(provider)));
    if (def.subs) url = url.replace("{s}", def.subs[(x + y) % def.subs.length]);
    const buf = await new Promise((resolve) => {
        let done = false; const fin = v => { if (!done) { done = true; resolve(v); } };
        const rq = https.get(url, { headers: { "User-Agent": UA, "Accept": "image/png,image/*" } }, (resp) => {
            if (resp.statusCode !== 200) { resp.resume(); return fin(null); }
            const ch = []; resp.on("data", c => ch.push(c)); resp.on("end", () => fin(Buffer.concat(ch)));
        });
        rq.on("error", () => fin(null)); rq.setTimeout(10000, () => { try { rq.destroy(); } catch {} fin(null); });
    });
    if (buf && buf.length) { try { fs.mkdirSync(path.dirname(cp), { recursive: true }); fs.writeFileSync(cp, buf); } catch {} }
    return buf;
}

// Stitch a static map image from OSM tiles for a center + zoom. Returns a PNG Buffer of ~ size px.
// No native image libs available in the bridge, so we return a small JSON tile manifest the CLIENT stitches
// onto a canvas (which also lets the pip-boy recolor it Pip-Boy green). Keeps the bridge dependency-free.
async function osmTiles(p) {
    p = p || {};
    const provider = TILE_PROVIDERS[p.provider] ? p.provider : "osm";
    const z = Math.max(1, Math.min(19, parseInt(p.zoom, 10) || 15));
    const lat = Number(p.lat), lon = Number(p.lon);
    if (!isFinite(lat) || !isFinite(lon)) return { ok: false, error: "lat/lon required" };
    const cols = Math.max(1, Math.min(6, parseInt(p.cols, 10) || 3));   // odd = centered
    const rows = Math.max(1, Math.min(6, parseInt(p.rows, 10) || 3));
    const c = _lonLatToTile(lon, lat, z);
    const x0 = c.x - Math.floor(cols / 2), y0 = c.y - Math.floor(rows / 2);
    const tiles = [];
    for (let ry = 0; ry < rows; ry++) for (let rx = 0; rx < cols; rx++) {
        const tx = x0 + rx, ty = y0 + ry;
        if (tx < 0 || ty < 0 || tx >= c.n || ty >= c.n) { tiles.push({ rx, ry, empty: true }); continue; }
        const buf = await _getTile(provider, z, tx, ty);
        tiles.push({ rx, ry, x: tx, y: ty, dataUrl: buf ? ("data:image/png;base64," + buf.toString("base64")) : null });
    }
    return { ok: true, provider, attr: (TILE_PROVIDERS[provider] || {}).attr || "", z, cols, rows, tileSize: 256, center: { lat, lon, tileX: c.x, tileY: c.y }, tiles };
}

// prefetch/cache a local area (only allowed for keyed providers or self-host; OSM public forbids bulk).
async function cacheArea(p) {
    p = p || {};
    const provider = TILE_PROVIDERS[p.provider] ? p.provider : "osm";
    if (provider === "osm" || provider === "osm_de") return { ok: false, error: "the public OSM tile servers prohibit bulk/offline prefetch. Use a keyed provider (Geoapify/Stadia/MapTiler) or point Self-host at your own tiles." };
    if (TILE_PROVIDERS[provider].key && !_providerKey(provider)) return { ok: false, error: "set a key for " + provider + " first" };
    const z = Math.max(1, Math.min(18, parseInt(p.zoom, 10) || 15));
    const lat = Number(p.lat), lon = Number(p.lon), radius = Math.max(1, Math.min(4, parseInt(p.radius, 10) || 2));   // tiles each way
    if (!isFinite(lat) || !isFinite(lon)) return { ok: false, error: "lat/lon required" };
    const c = _lonLatToTile(lon, lat, z); let n = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) { const b = await _getTile(provider, z, c.x + dx, c.y + dy); if (b) n++; }
    return { ok: true, cached: n, provider, zoom: z };
}

module.exports = { getConfig, setConfig, geocode, staticMap, _buildStaticUrl, _key, mapProviders, setProviderKey, selfHostDir, setSelfHostDir, osmTiles, cacheArea, TILE_PROVIDERS };
