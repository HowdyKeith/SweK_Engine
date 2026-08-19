// ai-bridge/languagetoolBridge.js — v1926
// Grammar/spell/style checking via LanguageTool (languagetool-org/languagetool, LGPL). Talks to a
// LanguageTool HTTP server — either a self-hosted one (Docker/jar, no key) or the public api endpoint.
//
// Verified API (dev.languagetool.org/http-server, /v2):
//   POST {base}/v2/check   form: language=en-US (or "auto"), text=...   ->
//       { language, matches:[{ message, shortMessage, offset, length, replacements:[{value}],
//                              rule:{id,category:{name}}, context:{text,offset,length}, sentence }] }
//   GET  {base}/v2/languages -> [{name, code, longCode}]
// Self-host base e.g. http://localhost:8010/v2 (erikvl87 image) or :8081/v2 (jar). Public (rate-limited,
// no key): https://api.languagetool.org/v2. Config in ~/.voxelbridge/languagetool.json.
const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DIR = path.join(os.homedir(), ".voxelbridge");
const CFG = path.join(DIR, "languagetool.json");
function _load() { try { return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch { return {}; } }
function _save(o) { try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o, null, 2)); } catch {} }
let _cfg = _load();   // { base }

// default to a common self-host port; user can point at the public API or their own server.
function _base() { return (_cfg.base || process.env.LANGUAGETOOL_URL || "http://localhost:8010/v2").replace(/\/+$/, ""); }
function getConfig() { return { ok: true, base: _base(), isPublic: /languagetool\.org/.test(_base()) }; }
function setConfig(d) { d = d || {}; if (typeof d.base === "string" && d.base.trim()) { let b = d.base.trim(); if (!/\/v2$/.test(b)) b = b.replace(/\/+$/, "") + "/v2"; _cfg.base = b; } _save(_cfg); return getConfig(); }

function _form(obj) { return Object.keys(obj).map(k => encodeURIComponent(k) + "=" + encodeURIComponent(obj[k])).join("&"); }

function _post(urlPath, form, timeoutMs) {
    return new Promise((resolve) => {
        let u; try { u = new URL(_base() + urlPath); } catch { return resolve({ ok: false, error: "bad LanguageTool URL" }); }
        const lib = u.protocol === "https:" ? https : http;
        const data = Buffer.from(_form(form));
        const req = lib.request(u, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": data.length, "Accept": "application/json" } }, (res) => {
            const ch = []; res.on("data", c => ch.push(c)); res.on("end", () => {
                const txt = Buffer.concat(ch).toString();
                if (res.statusCode >= 200 && res.statusCode < 300) { try { resolve({ ok: true, data: JSON.parse(txt) }); } catch { resolve({ ok: false, error: "bad JSON from server" }); } }
                else resolve({ ok: false, status: res.statusCode, error: "HTTP " + res.statusCode, detail: txt.slice(0, 200) });
            });
        });
        req.on("error", (e) => resolve({ ok: false, error: String(e && e.message || e) + " (is a LanguageTool server running at " + _base() + "?)" }));
        req.setTimeout(timeoutMs || 20000, () => { try { req.destroy(); } catch {} resolve({ ok: false, error: "timed out contacting " + _base() }); });
        req.write(data); req.end();
    });
}

// check text -> normalized matches for the UI
async function check(text, language) {
    text = String(text == null ? "" : text);
    if (!text.trim()) return { ok: true, matches: [], language: language || "auto" };
    if (text.length > 60000) text = text.slice(0, 60000);   // keep requests sane
    const r = await _post("/check", { language: language || "auto", text, enabledOnly: "false" }, 30000);
    if (!r.ok) return r;
    const j = r.data || {};
    const matches = (j.matches || []).map(m => ({
        message: m.message, short: m.shortMessage || "",
        offset: m.offset, length: m.length,
        replacements: (m.replacements || []).slice(0, 6).map(x => x.value),
        rule: (m.rule && m.rule.id) || "", category: (m.rule && m.rule.category && m.rule.category.name) || "",
        context: (m.context && m.context.text) || "", ctxOffset: (m.context && m.context.offset) || 0, ctxLength: (m.context && m.context.length) || 0,
        issueType: (m.rule && m.rule.issueType) || "",
    }));
    return { ok: true, language: (j.language && (j.language.name || j.language.code)) || (language || "auto"), matches, count: matches.length };
}

async function languages() {
    return new Promise((resolve) => {
        let u; try { u = new URL(_base() + "/languages"); } catch { return resolve({ ok: false, error: "bad URL" }); }
        const lib = u.protocol === "https:" ? https : http;
        const req = lib.get(u, (res) => { const ch = []; res.on("data", c => ch.push(c)); res.on("end", () => { try { resolve({ ok: true, languages: JSON.parse(Buffer.concat(ch).toString()) }); } catch { resolve({ ok: false, error: "bad JSON" }); } }); });
        req.on("error", (e) => resolve({ ok: false, error: String(e && e.message || e) }));
        req.setTimeout(8000, () => { try { req.destroy(); } catch {} resolve({ ok: false, error: "timed out" }); });
    });
}

module.exports = { getConfig, setConfig, check, languages };
