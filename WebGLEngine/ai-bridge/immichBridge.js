// ai-bridge/immichBridge.js — v1548
// Front-end a self-hosted Immich (github.com/immich-app/immich) FROM the engine: browse recent
// photos and PULL one into the GPU_Assets folder to use as a texture / reference.
//
// Verified API (api.immich.app; base path /api, auth header x-api-key):
//   GET  {base}/api/server/ping                  -> { res: "pong" }
//   POST {base}/api/search/metadata {type,size}  -> { assets: { items: [ {id, originalFileName, type, ...} ] } }
//   GET  {base}/api/assets/{id}/thumbnail        -> image bytes (proxied so the browser needn't hold the key)
//   GET  {base}/api/assets/{id}/original         -> full file bytes (used by pull)
// Default base http://localhost:2283; create an API key in Immich (asset.read is enough to browse).
// Config in ~/.voxelbridge/immich.json so it survives engine updates.

const fs = require("fs");
const os = require("os");
const path = require("path");

const CFG_DIR = path.join(os.homedir(), ".voxelbridge");
const CFG = path.join(CFG_DIR, "immich.json");
const DEF = { baseUrl: "http://localhost:2283", apiKey: "" };

function load() { try { return Object.assign({}, DEF, JSON.parse(fs.readFileSync(CFG, "utf8")) || {}); } catch { return Object.assign({}, DEF); } }
function save(o) { try { fs.mkdirSync(CFG_DIR, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o, null, 2), { mode: 0o600 }); } catch {} }
function getConfig() { const c = load(); return { ok: true, config: { baseUrl: c.baseUrl, apiKeySet: !!c.apiKey } }; }
function setConfig(p) {
    const c = load(); p = p || {};
    if (p.baseUrl != null) c.baseUrl = String(p.baseUrl).trim().replace(/\/+$/, "") || DEF.baseUrl;
    if (p.apiKey != null) c.apiKey = String(p.apiKey).trim();
    save(c);
    return { ok: true, config: { baseUrl: c.baseUrl, apiKeySet: !!c.apiKey } };
}
function _api() { return (load().baseUrl || DEF.baseUrl).replace(/\/+$/, "") + "/api"; }
function _hdr(extra) { return Object.assign({ "x-api-key": load().apiKey || "", "Accept": "application/json" }, extra || {}); }

async function _req(url, opts, ms) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms || 10000);
    try { return await fetch(url, Object.assign({ signal: ac.signal }, opts || {})); }
    finally { clearTimeout(t); }
}

async function status() {
    const c = load();
    try {
        const r = await _req(_api() + "/server/ping", { headers: _hdr() }, 6000);
        let res = ""; try { res = (await r.json()).res || ""; } catch {}
        return { ok: true, reachable: r.ok, baseUrl: c.baseUrl, apiKeySet: !!c.apiKey, res };
    } catch (e) {
        return { ok: true, reachable: false, baseUrl: c.baseUrl, apiKeySet: !!c.apiKey, error: String((e && e.message) || e) };
    }
}

async function recent(n) {
    const c = load();
    if (!c.apiKey) return { ok: false, error: "no Immich API key \u2014 create one in Immich (Account Settings \u2192 API Keys), then set it in Settings \u2192 Assets" };
    const size = Math.max(1, Math.min(100, parseInt(n, 10) || 24));
    let r; try { r = await _req(_api() + "/search/metadata", { method: "POST", headers: _hdr({ "Content-Type": "application/json" }), body: JSON.stringify({ type: "IMAGE", size, page: 1, order: "desc" }) }, 12000); }
    catch (e) { return { ok: false, error: "Immich unreachable: " + String((e && e.message) || e) }; }
    if (!r.ok) { let t = ""; try { t = await r.text(); } catch {} return { ok: false, error: "Immich search HTTP " + r.status + (t ? (" " + t.slice(0, 140)) : "") }; }
    let j = null; try { j = await r.json(); } catch {}
    const items = (j && j.assets && (j.assets.items || j.assets)) || j && j.items || [];
    const assets = (Array.isArray(items) ? items : []).map(a => ({ id: a.id, name: a.originalFileName || a.id, type: a.type || "IMAGE" }));
    return { ok: true, assets };
}

// fetchBytes(id, kind) -> { ok, buffer, contentType }  (kind: "thumbnail" | "original")
async function fetchBytes(id, kind) {
    const c = load();
    if (!c.apiKey) return { ok: false, error: "no Immich API key set" };
    if (!id) return { ok: false, error: "no asset id" };
    const ep = (kind === "original") ? "/original" : "/thumbnail";
    let r; try { r = await _req(_api() + "/assets/" + encodeURIComponent(id) + ep, { headers: { "x-api-key": c.apiKey } }, 30000); }
    catch (e) { return { ok: false, error: "Immich unreachable: " + String((e && e.message) || e) }; }
    if (!r.ok) return { ok: false, error: "Immich asset HTTP " + r.status };
    const buffer = Buffer.from(await r.arrayBuffer());
    const contentType = r.headers.get("content-type") || (kind === "original" ? "application/octet-stream" : "image/jpeg");
    return { ok: true, buffer, contentType };
}

// pull(id, destDir) -> download the ORIGINAL into destDir (the engine assets folder)
async function pull(id, destDir, name) {
    const b = await fetchBytes(id, "original");
    if (!b.ok) return b;
    try { fs.mkdirSync(destDir, { recursive: true }); } catch {}
    let ext = ".jpg";
    if (/png/.test(b.contentType)) ext = ".png"; else if (/webp/.test(b.contentType)) ext = ".webp"; else if (/jpeg|jpg/.test(b.contentType)) ext = ".jpg";
    const safe = (String(name || ("immich_" + id)).replace(/[^a-zA-Z0-9._-]/g, "_")) || ("immich_" + Date.now());
    const fname = /\.[a-z0-9]+$/i.test(safe) ? safe : (safe + ext);
    const abs = path.join(destDir, fname);
    try { fs.writeFileSync(abs, b.buffer); } catch (e) { return { ok: false, error: "write failed: " + String((e && e.message) || e) }; }
    return { ok: true, file: fname, path: abs, bytes: b.buffer.length };
}

module.exports = { getConfig, setConfig, status, recent, fetchBytes, pull };
