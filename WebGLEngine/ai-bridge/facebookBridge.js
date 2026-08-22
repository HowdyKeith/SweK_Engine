// FILE: ai-bridge/facebookBridge.js
// v974 — ASSISTED Facebook composer. Two posting paths, owner-gated:
//
//   (1) ASSISTED (default, no app/token): the human posts. The composer page
//       copies the assembled text to the clipboard and opens Facebook (or the
//       link-share dialog); the human pastes + clicks Post. This is why it's
//       "assisted" — no Graph app review, no long-lived token, nothing posts
//       without a human in the loop. Facebook removed URL message-prefill years
//       ago, so clipboard + open is the reliable path for status text; the
//       sharer dialog still prefills a LINK.
//
//   (2) PAGE (optional): if you own a Facebook PAGE and store a Page access
//       token, postToPage() publishes directly via the Graph API. Personal
//       timeline posting via API is not available to third-party apps, so the
//       assisted path stays the default for personal posts.
//
// A draft store lets the composer (and, later, UI-TARS driving the browser)
// fetch the current assembled post to type into Facebook's real composer.
//
// Config: ~/.voxelbridge/facebook.json { pageId, pageToken, apiVersion }.

const fs = require("fs");
const path = require("path");
const os = require("os");

const CFG_DIR = path.join(os.homedir(), ".voxelbridge");
const CFG_PATH = path.join(CFG_DIR, "facebook.json");
const DEFAULTS = { pageId: "", pageToken: "", apiVersion: "v21.0" };

let _draft = { text: "", link: "", image: "", updatedAt: 0 };

function loadCfg() {
    try { if (fs.existsSync(CFG_PATH)) return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(CFG_PATH, "utf8"))); } catch {}
    return Object.assign({}, DEFAULTS);
}
function saveCfg(obj) {
    try { fs.mkdirSync(CFG_DIR, { recursive: true }); fs.writeFileSync(CFG_PATH, JSON.stringify(obj, null, 2), { mode: 0o600 }); return true; }
    catch (e) { console.warn("[facebook] config save failed:", e.message); return false; }
}

function config(patch) {
    const c = loadCfg();
    if (patch && typeof patch === "object") {
        if (patch.pageId != null)     c.pageId = String(patch.pageId);
        if (patch.pageToken != null)  c.pageToken = String(patch.pageToken);
        if (patch.apiVersion != null) c.apiVersion = String(patch.apiVersion);
    }
    saveCfg(c);
    // never echo the token back
    return { ok: true, config: { pageId: c.pageId, apiVersion: c.apiVersion, hasToken: !!c.pageToken } };
}

// Build the assisted payload: the text to copy + the URL(s) to open.
function compose({ text = "", link = "", image = "" } = {}) {
    _draft = { text: String(text || ""), link: String(link || ""), image: String(image || ""), updatedAt: Date.now() };
    const shareUrl = _draft.link
        ? "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(_draft.link)
        : null;
    return {
        ok: true,
        draft: _draft,
        // facebook.com opens the real composer; the page copies `text` to the
        // clipboard first so the human just pastes + posts.
        composerUrl: "https://www.facebook.com/",
        shareUrl,   // prefilled LINK share dialog (text is not prefilled by FB)
        note: "Assisted: text is copied to your clipboard; paste into the opened Facebook composer and post. Use shareUrl for a link-only share dialog.",
    };
}
function getDraft() { return { ok: true, draft: _draft }; }

// Optional direct PAGE post via the Graph API (needs a stored Page token).
async function postToPage({ text = "", link = "" } = {}) {
    const c = loadCfg();
    if (!c.pageId || !c.pageToken) {
        return { ok: false, error: "no page configured — set pageId + pageToken via facebook.config(), or use the assisted path (human posts)" };
    }
    const base = `https://graph.facebook.com/${c.apiVersion}/${encodeURIComponent(c.pageId)}/feed`;
    const params = new URLSearchParams();
    if (text) params.set("message", text);
    if (link) params.set("link", link);
    params.set("access_token", c.pageToken);
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);
        const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString(), signal: ctrl.signal });
        clearTimeout(t);
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) return { ok: false, status: r.status, error: (j.error && j.error.message) || ("HTTP " + r.status) };
        return { ok: true, postId: j.id || null };
    } catch (e) {
        return { ok: false, error: (e && e.message) || String(e) };
    }
}

function status() {
    const c = loadCfg();
    return { ok: true, pageConfigured: !!(c.pageId && c.pageToken), pageId: c.pageId || null, apiVersion: c.apiVersion, hasDraft: !!_draft.updatedAt };
}

module.exports = { config, compose, getDraft, postToPage, status, loadCfg };
