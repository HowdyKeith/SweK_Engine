// bookloreBridge.js — v1135
// Connects the engine to a self-hosted BookLore instance (the self-hosted ebook /
// comics library: EPUB/PDF/CBR/CBZ reader, OPDS, Kobo/KOReader sync). BookLore runs
// as its own Docker app; this bridge just lets the engine point at it, check it's
// reachable, and tell the UI whether BookLore allows being embedded in an <iframe>
// (some reverse-proxy setups send X-Frame-Options / CSP frame-ancestors that block
// framing — in that case the panel shows an "open full" button instead of a dead frame).
//
// Config: ~/.voxelbridge/booklore.json { url }

const fs = require("fs");
const os = require("os");
const path = require("path");

const CFG = path.join(os.homedir(), ".voxelbridge", "booklore.json");
const DEFAULT_URL = "http://localhost:6060";

function load() { try { if (fs.existsSync(CFG)) return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch {} return {}; }
function save(o) { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o)); return true; } catch (e) { console.warn("[booklore] save failed:", e.message); return false; } }

function getConfig() { const c = load(); return { ok: true, url: c.url || "", defaultUrl: DEFAULT_URL }; }
function setConfig(d) { const c = load(); if (typeof (d || {}).url === "string") c.url = String(d.url).trim().replace(/\/+$/, ""); save(c); return { ok: true, url: c.url || "" }; }

// Server-side reachability + framing check (dodges browser CORS and lets us read the
// framing headers the browser can't see from script).
async function status() {
    const c = load();
    const url = (c.url || DEFAULT_URL).replace(/\/+$/, "");
    let res;
    try { res = await fetch(url + "/", { method: "GET", redirect: "manual", signal: AbortSignal.timeout(6000) }); }
    catch (e) { return { ok: true, url, reachable: false, error: String(e.message || e) }; }
    const xfo = (res.headers.get("x-frame-options") || "").toLowerCase();
    const csp = (res.headers.get("content-security-policy") || "").toLowerCase();
    // Embeddable unless it explicitly denies framing.
    const blocksFrame = /deny|sameorigin/.test(xfo) || /frame-ancestors\s+('none'|[^;]*\bself\b)/.test(csp);
    return { ok: true, url, reachable: res.status > 0, status: res.status, embeddable: !blocksFrame, xFrameOptions: xfo || null };
}

module.exports = { getConfig, setConfig, status, DEFAULT_URL };
