// ai-bridge/crawl4aiBridge.js — v1887
// Front crawl4ai (github.com/unclecode/crawl4ai) as a scrape backend, like firecrawlBridge:
// turn a URL into clean LLM-ready markdown via a LOCALLY-RUN crawl4ai server (the bgServices
// entry installs + runs it on :11235). This bridge just calls that server's REST API.
//
// crawl4ai's server API changed across versions, so we handle BOTH shapes:
//   - direct:  POST /crawl {urls:[url], ...} -> { results:[{ markdown, html, ... }] }  (v0.9+)
//   - task:    POST /crawl {urls:url} -> { task_id }, then poll GET /task/{id} until
//              status==="completed", result in .result / .results[0].          (0.3–0.7 Docker)
// Auth: v0.9 is secure-by-default — if the server was started with CRAWL4AI_API_TOKEN, requests
// need Authorization: Bearer <token>. We store an optional token; blank = no header (open server).
//
// Config in ~/.voxelbridge/crawl4ai.json so it survives engine updates.
const fs = require("fs");
const os = require("os");
const path = require("path");

const CFG_DIR = path.join(os.homedir(), ".voxelbridge");
const CFG = path.join(CFG_DIR, "crawl4ai.json");
const DEF = { baseUrl: "http://127.0.0.1:11235", token: "" };

function load() { try { return Object.assign({}, DEF, JSON.parse(fs.readFileSync(CFG, "utf8")) || {}); } catch { return Object.assign({}, DEF); } }
function save(o) { try { fs.mkdirSync(CFG_DIR, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o, null, 2), { mode: 0o600 }); } catch {} }
function getConfig() { const c = load(); return { ok: true, config: { baseUrl: c.baseUrl, tokenSet: !!c.token } }; }
function setConfig(p) {
    const c = load();
    if (p && typeof p.baseUrl === "string" && p.baseUrl.trim()) c.baseUrl = p.baseUrl.trim().replace(/\/+$/, "");
    if (p && typeof p.token === "string") c.token = p.token.trim();   // "" clears it
    save(c);
    return getConfig();
}
function _base() { return (load().baseUrl || DEF.baseUrl).replace(/\/+$/, ""); }
function _hdr() {
    const h = { "Content-Type": "application/json" };
    const t = load().token;
    if (t) h["Authorization"] = "Bearer " + t;
    return h;
}

async function _fetchJson(url, opts, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms || 60000);
    try {
        const r = await fetch(url, Object.assign({ signal: ctl.signal }, opts));
        const text = await r.text();
        let j = null; try { j = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
        return { ok: r.ok, status: r.status, json: j, text };
    } finally { clearTimeout(timer); }
}

// GET /health — the same probe bgServices uses; lets the panel show reachability.
async function status() {
    const c = load();
    try {
        const r = await _fetchJson(_base() + "/health", { method: "GET", headers: _hdr() }, 6000);
        return { ok: true, configured: true, baseUrl: c.baseUrl, tokenSet: !!c.token, reachable: r.ok, health: r.json || null };
    } catch (e) {
        return { ok: true, configured: true, baseUrl: c.baseUrl, tokenSet: !!c.token, reachable: false, error: String(e && e.message || e) };
    }
}

// pull the best "markdown" out of whatever shape a result object has.
function _extractMarkdown(res) {
    if (!res || typeof res !== "object") return null;
    const md = res.markdown;
    if (typeof md === "string") return md;
    if (md && typeof md === "object") return md.fit_markdown || md.raw_markdown || md.markdown || null;
    return res.extracted_content || res.cleaned_html || null;
}

async function scrape(url) {
    if (!url || !/^https?:\/\//i.test(url)) return { ok: false, error: "give a full http(s) URL" };
    const base = _base();

    // shape A (v0.9+): POST /crawl {urls:[url]} -> immediate results
    let r;
    try { r = await _fetchJson(base + "/crawl", { method: "POST", headers: _hdr(), body: JSON.stringify({ urls: [url] }) }, 120000); }
    catch (e) { return { ok: false, error: "crawl4ai server unreachable at " + base + " — install/start it (bgServices: crawl4ai) first. (" + (e && e.message || e) + ")" }; }

    if (r.status === 401 || r.status === 403) return { ok: false, error: "crawl4ai rejected auth (401/403) — the server was started with a token; set it in the crawl4ai config." };

    if (r.ok && r.json) {
        // direct results?
        const results = r.json.results || (Array.isArray(r.json) ? r.json : null);
        if (results && results.length) {
            const md = _extractMarkdown(results[0]);
            if (md != null) return { ok: true, url, markdown: md, engine: "crawl4ai", meta: results[0].metadata || null };
        }
        // shape B (task): got a task_id -> poll /task/{id}
        const taskId = r.json.task_id || r.json.taskId;
        if (taskId) return await _pollTask(base, taskId);
        // some builds return the single result at top level
        const md = _extractMarkdown(r.json);
        if (md != null) return { ok: true, url, markdown: md, engine: "crawl4ai", meta: r.json.metadata || null };
    }
    return { ok: false, error: "crawl4ai returned an unrecognized response (HTTP " + r.status + ")", raw: (r.text || "").slice(0, 300) };
}

async function _pollTask(base, taskId, maxMs) {
    const deadline = Date.now() + (maxMs || 120000);
    while (Date.now() < deadline) {
        await new Promise(res => setTimeout(res, 1500));
        let s; try { s = await _fetchJson(base + "/task/" + encodeURIComponent(taskId), { method: "GET", headers: _hdr() }, 15000); } catch { continue; }
        if (!s.ok || !s.json) continue;
        const st = s.json.status;
        if (st === "completed" || st === "done") {
            const res = s.json.result || (s.json.results && s.json.results[0]) || null;
            const md = _extractMarkdown(res);
            if (md != null) return { ok: true, taskId, markdown: md, engine: "crawl4ai", meta: (res && res.metadata) || null };
            return { ok: false, error: "crawl4ai task completed but no markdown in the result", raw: JSON.stringify(s.json).slice(0, 300) };
        }
        if (st === "failed" || st === "error") return { ok: false, error: "crawl4ai task failed: " + (s.json.error || "unknown") };
    }
    return { ok: false, error: "crawl4ai task timed out (still crawling after the wait window)" };
}

module.exports = { getConfig, setConfig, status, scrape };
