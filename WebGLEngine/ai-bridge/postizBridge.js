// ai-bridge/postizBridge.js — v1925
// Post & SCHEDULE to social channels (Facebook Page, X, LinkedIn, Instagram, Threads, Mastodon, Bluesky,
// Telegram, Discord, ... 28+) through a self-hosted or cloud Postiz (gitroomhq/postiz-app, AGPL-3.0).
// The API key stays SERVER-SIDE (browser never sees it), like the maps/firecrawl bridges.
//
// Verified public API (docs.postiz.com/public-api, v1):
//   Base: cloud https://api.postiz.com/public/v1 ; self-host https://{BACKEND_URL}/public/v1
//   Auth: header  Authorization: {apiKey}   (Postiz Settings -> API Key)
//   GET  /integrations                 -> [{ id, name, identifier(=provider e.g. "facebook"), disabled }]
//   POST /upload  (multipart file)     -> { id, path }   (media, path must be an uploads.* URL)
//   POST /posts   { type:"now"|"schedule"|"draft", date, shortLink, tags, posts:[
//                    { integration:{id}, value:[{content, image:[{id,path}]}], settings:{__type:<provider>} } ] }
//   Rate limit ~30/hr self-host (API_LIMIT env), 100/hr cloud — only the create-post endpoint is limited.
const https = require("https");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DIR = path.join(os.homedir(), ".voxelbridge");
const CFG = path.join(DIR, "postiz.json");
function _load() { try { return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch { return {}; } }
function _save(o) { try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o, null, 2), { mode: 0o600 }); } catch {} }
let _cfg = _load();   // { key, base }

function _key() { return _cfg.key || process.env.POSTIZ_API_KEY || ""; }
function _base() { return (_cfg.base || process.env.POSTIZ_BASE_URL || "https://api.postiz.com/public/v1").replace(/\/+$/, ""); }
function getConfig() { return { ok: true, hasKey: !!_key(), base: _base(), selfHosted: !/api\.postiz\.com/.test(_base()) }; }
function setConfig(d) { d = d || {}; if (typeof d.key === "string") _cfg.key = d.key.trim(); if (typeof d.base === "string" && d.base.trim()) _cfg.base = d.base.trim(); if (d.clear) _cfg.key = ""; _save(_cfg); return getConfig(); }

// minimal JSON request against the Postiz API (http or https by base scheme)
function _req(method, urlPath, body) {
    return new Promise((resolve) => {
        const key = _key(); if (!key) return resolve({ ok: false, error: "no Postiz API key set" });
        let u; try { u = new URL(_base() + urlPath); } catch { return resolve({ ok: false, error: "bad base URL" }); }
        const lib = u.protocol === "http:" ? http : https;
        const data = body ? Buffer.from(JSON.stringify(body)) : null;
        const req = lib.request(u, { method, headers: Object.assign({ "Authorization": key, "Accept": "application/json" }, data ? { "Content-Type": "application/json", "Content-Length": data.length } : {}) }, (res) => {
            const ch = []; res.on("data", c => ch.push(c)); res.on("end", () => {
                const txt = Buffer.concat(ch).toString();
                let j = null; try { j = JSON.parse(txt); } catch {}
                if (res.statusCode >= 200 && res.statusCode < 300) resolve({ ok: true, status: res.statusCode, data: j != null ? j : txt });
                else resolve({ ok: false, status: res.statusCode, error: (j && (j.message || j.error)) || ("HTTP " + res.statusCode), detail: txt.slice(0, 200) });
            });
        });
        req.on("error", (e) => resolve({ ok: false, error: String(e && e.message || e) }));
        req.setTimeout(15000, () => { try { req.destroy(); } catch {} resolve({ ok: false, error: "timed out (is Postiz reachable at " + _base() + "?)" }); });
        if (data) req.write(data); req.end();
    });
}

// list connected channels (the API calls them "integrations")
async function channels() {
    const r = await _req("GET", "/integrations");
    if (!r.ok) return r;
    const list = Array.isArray(r.data) ? r.data : (r.data && r.data.integrations) || [];
    return { ok: true, channels: list.map(i => ({ id: i.id, name: i.name, provider: i.identifier || i.providerIdentifier || "", disabled: !!i.disabled, picture: i.picture || "" })) };
}

// create a post. opts: { integrationId, provider, content, when("now"|ISO date), settings?, imagePath? }
async function createPost(opts) {
    opts = opts || {};
    if (!opts.integrationId) return { ok: false, error: "integrationId (channel) required" };
    if (!opts.content && !opts.imagePath) return { ok: false, error: "content or image required" };
    const now = opts.when === "now" || !opts.when;
    const value = [{ content: String(opts.content || "") }];
    if (opts.imageId && opts.imagePath) value[0].image = [{ id: opts.imageId, path: opts.imagePath }];
    const settings = Object.assign({ __type: opts.provider || "" }, opts.settings || {});
    const body = {
        type: now ? "now" : (opts.draft ? "draft" : "schedule"),
        date: now ? new Date().toISOString() : new Date(opts.when).toISOString(),
        shortLink: !!opts.shortLink, tags: [],
        posts: [{ integration: { id: opts.integrationId }, value, settings }],
    };
    return _req("POST", "/posts", body);
}

// list scheduled/published posts in a date window
async function listPosts(startISO, endISO) {
    const s = startISO || new Date(Date.now() - 7 * 864e5).toISOString();
    const e = endISO || new Date(Date.now() + 30 * 864e5).toISOString();
    return _req("GET", "/posts?startDate=" + encodeURIComponent(s) + "&endDate=" + encodeURIComponent(e));
}

module.exports = { getConfig, setConfig, channels, createPost, listPosts };
