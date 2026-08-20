// ai-bridge/firecrawlBridge.js — v1548
// Front-end Firecrawl (github.com/firecrawl/firecrawl) FROM the engine: turn a URL (or a
// search query) into clean LLM-ready Markdown. Pairs with markitdown (web->md vs doc->md).
//
// Verified API (docs.firecrawl.dev, v2):
//   POST {base}/v2/scrape  {url, formats:["markdown"], onlyMainContent} -> {success, data:{markdown, metadata}}
//   POST {base}/v2/search  {query, limit}                              -> {success, data:[{url,title,markdown}]}
//   Auth: header  Authorization: Bearer fc-...   (key from the Firecrawl dashboard; free tier exists)
// Cloud base https://api.firecrawl.dev by default; self-host sets a different base. Config in
// ~/.voxelbridge/firecrawl.json so it survives engine updates. The cloud API (just a key) is
// far simpler than self-hosting (Docker + Redis + Playwright).

const fs = require("fs");
const os = require("os");
const path = require("path");

const CFG_DIR = path.join(os.homedir(), ".voxelbridge");
const CFG = path.join(CFG_DIR, "firecrawl.json");
const DEF = { apiKey: "", baseUrl: "https://api.firecrawl.dev" };

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
function _base() { return (load().baseUrl || DEF.baseUrl).replace(/\/+$/, ""); }
function _hdr() { return { "Content-Type": "application/json", "Authorization": "Bearer " + (load().apiKey || "") }; }

async function _req(url, body, ms) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms || 120000);
    try {
        const r = await fetch(url, { method: "POST", headers: _hdr(), body: JSON.stringify(body), signal: ac.signal });
        const text = await r.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
        return { status: r.status, ok: r.ok, json, text };
    } finally { clearTimeout(t); }
}

function status() { const c = load(); return { ok: true, configured: !!c.apiKey, baseUrl: c.baseUrl }; }

async function scrape(url) {
    const c = load();
    if (!c.apiKey) return { ok: false, error: "no Firecrawl API key \u2014 get a free key at firecrawl.dev, then set it in Settings \u2192 Assets" };
    url = String(url || "").trim(); if (!url) return { ok: false, error: "no url" };
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    let r; try { r = await _req(_base() + "/v2/scrape", { url, formats: ["markdown"], onlyMainContent: true }, 120000); }
    catch (e) { return { ok: false, error: "Firecrawl unreachable: " + String((e && e.message) || e) }; }
    if (!r.ok || !r.json) return { ok: false, error: "Firecrawl scrape HTTP " + r.status + (r.text ? (" " + r.text.slice(0, 180)) : "") };
    const d = r.json.data || r.json || {};
    const md = d.markdown || "";
    const meta = d.metadata || {};
    return { ok: true, markdown: md, title: meta.title || meta.ogTitle || "", url: meta.sourceURL || url, chars: md.length };
}

async function search(query, limit) {
    const c = load();
    if (!c.apiKey) return { ok: false, error: "no Firecrawl API key set" };
    query = String(query || "").trim(); if (!query) return { ok: false, error: "no query" };
    let r; try { r = await _req(_base() + "/v2/search", { query, limit: Math.max(1, Math.min(20, parseInt(limit, 10) || 5)) }, 120000); }
    catch (e) { return { ok: false, error: "Firecrawl unreachable: " + String((e && e.message) || e) }; }
    if (!r.ok || !r.json) return { ok: false, error: "Firecrawl search HTTP " + r.status + (r.text ? (" " + r.text.slice(0, 180)) : "") };
    const d = r.json.data;
    const arr = Array.isArray(d) ? d : ((d && (d.web || d.results)) || r.json.results || []);
    const results = (arr || []).map(x => ({ url: x.url || "", title: x.title || "", markdown: (x.markdown || x.description || "") }));
    return { ok: true, results };
}

module.exports = { getConfig, setConfig, status, scrape, search };
