// WebGLEngine/ai-bridge/puppeteerBridge.js — the engine's OWN eyes on its OWN pages.
//
// v2237. chrome-devtools-mcp is agent-driven (an MCP client issues the tool calls). This is the
// self-contained alternative: a small bridge that drives headless Chrome directly with puppeteer-core
// so the engine can screenshot, read console errors, and take a light performance sample of a page
// WITHOUT any agent or LLM in the loop. It closes the exact blind spot the headless render-qa cannot
// reach: what the WebGL pages actually paint, and what they log to the console.
//
// DELIBERATE CHOICES:
//   * puppeteer-CORE, not puppeteer: no bundled ~150 MB Chromium download. It uses the Google Chrome
//     the fleet already has (same path list as the engine's own Chrome launcher). If puppeteer-core is
//     not installed (optionalDependency), the bridge still LOADS and every route answers honestly with
//     "not installed" instead of throwing -- the ai-bridge must never fail to start over an optional dep.
//   * TRUSTED-ONLY. These routes launch a browser; they ride behind ctx.isTrusted like the other
//     process-spawning bridges.
//   * Aimed at the ENGINE'S pages. By default only localhost / 127.0.0.1 / private-LAN hosts are allowed;
//     a public URL is refused unless the caller passes allowExternal:true (and is trusted). This is a
//     QA tool for SweK's own UI, not a general screenshot-any-site service.
//   * Launch-per-call. Each request launches Chrome, does its work, and closes it in a finally -- no
//     cached browser to leak a headless Chrome across the fleet. Slower per call, but bulletproof.

"use strict";

const fs = require("fs");

const ROUTES = new Set(["/devtools/status", "/devtools/shot", "/devtools/console", "/devtools/perf"]);
const NAV_TIMEOUT_MS = 20000;

// Lazy + optional: never throw at require time.
function loadPuppeteer() {
    try { return require("puppeteer-core"); } catch { return null; }
}

// Same candidate list as the engine's Chrome launcher (server.js), so we find the same browser.
function findChrome() {
    const candidates = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        process.env.LOCALAPPDATA && (process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe"),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
    ].filter(Boolean);
    for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch {} }
    return null;   // caller falls back to the "chrome" channel
}

function isLocalHost(h) { h = (h || "").toLowerCase(); return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0"; }
function isPrivateLan(h) {
    return /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
        || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h) || /\.local$/.test(h);
}
function guardUrl(raw, allowExternal) {
    let u; try { u = new URL(raw); } catch { return { ok: false, error: "bad URL" }; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: "only http/https URLs" };
    if (!allowExternal && !isLocalHost(u.hostname) && !isPrivateLan(u.hostname)) {
        return { ok: false, error: "external URL blocked -- this bridge inspects the engine's own pages; pass allowExternal:true (trusted) to override" };
    }
    return { ok: true, url: u.toString() };
}

async function launchBrowser(opts = {}) {
    const pptr = loadPuppeteer();
    if (!pptr) { const e = new Error("puppeteer-core not installed -- run: npm install puppeteer-core (in ai-bridge)"); e.code = "NO_PUPPETEER"; throw e; }
    const exe = findChrome();
    const launchOpts = {
        headless: opts.headless === false ? false : "new",
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
    };
    if (exe) launchOpts.executablePath = exe; else launchOpts.channel = "chrome";   // let puppeteer resolve installed Chrome
    return pptr.launch(launchOpts);
}

// Launch, open a page, wire console/error capture, navigate, run fn, always close.
async function withPage(target, opts, fn) {
    const browser = await launchBrowser(opts);
    try {
        const page = await browser.newPage();
        const w = Math.min(Math.max(opts.width | 0 || 1280, 320), 3840);
        const h = Math.min(Math.max(opts.height | 0 || 800, 240), 2160);
        await page.setViewport({ width: w, height: h });
        const logs = [], errs = [];
        page.on("console", (m) => { try { logs.push({ type: m.type(), text: String(m.text()).slice(0, 500) }); } catch {} });
        page.on("pageerror", (e) => { try { errs.push(String((e && e.message) || e).slice(0, 500)); } catch {} });
        page.on("requestfailed", (r) => { try { errs.push("requestfailed: " + r.url().slice(0, 200) + " (" + (r.failure() && r.failure().errorText) + ")"); } catch {} });
        await page.goto(target, { waitUntil: "networkidle2", timeout: opts.navTimeout || NAV_TIMEOUT_MS });
        if (opts.waitMs) await new Promise((r) => setTimeout(r, Math.min(opts.waitMs | 0, 15000)));
        return await fn(page, { logs, errs, viewport: { w, h } });
    } finally { try { await browser.close(); } catch {} }
}

function status() {
    const pptr = !!loadPuppeteer();
    const chrome = findChrome();
    return {
        ok: true,
        puppeteer: pptr ? "installed" : "not installed (npm install puppeteer-core in ai-bridge)",
        chrome: chrome || "not found in standard paths (will try the 'chrome' channel)",
        ready: pptr,   // Chrome may still resolve via channel even when the path list misses
        routes: Array.from(ROUTES),
        note: "TRUSTED-only. Aimed at the engine's own pages (localhost / LAN). Headless WebGL renders via ANGLE/SwiftShader; pass headless:false for a faithful GPU paint.",
    };
}

function owns(url) { return ROUTES.has((url || "").split("?")[0]); }

async function handle(req, res, ctx = {}) {
    const sendJson = ctx.sendJson || ((o, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); });
    const p = (req.url || "").split("?")[0];
    const trusted = ctx.isTrusted ? !!ctx.isTrusted(req) : false;

    if (req.method === "GET" && p === "/devtools/status") return sendJson(status());

    if (req.method !== "POST") return sendJson({ ok: false, error: "POST required" }, 405);
    if (!trusted) return sendJson({ ok: false, error: "trusted-only route (browser control)" }, 403);

    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 65536) body = body.slice(0, 65536); });
    req.on("end", async () => {
        let j = {}; try { j = JSON.parse(body || "{}"); } catch { return sendJson({ ok: false, error: "bad JSON" }, 400); }
        const g = guardUrl(j.url || "", !!j.allowExternal);
        if (!g.ok) return sendJson(g, 400);
        const opts = { width: j.width, height: j.height, waitMs: j.waitMs, headless: j.headless, navTimeout: j.navTimeout };
        try {
            if (p === "/devtools/shot") {
                const out = await withPage(g.url, opts, async (page, cap) => {
                    const png = await page.screenshot({ fullPage: !!j.fullPage, type: "png", encoding: "base64" });
                    return { ok: true, url: g.url, pngBase64: png, viewport: cap.viewport, console: cap.logs, errors: cap.errs };
                });
                return sendJson(out);
            }
            if (p === "/devtools/console") {
                const out = await withPage(g.url, { ...opts, waitMs: opts.waitMs || 1500 }, async (page, cap) => {
                    const errCount = cap.logs.filter((l) => l.type === "error").length + cap.errs.length;
                    return { ok: true, url: g.url, errorCount: errCount, console: cap.logs, errors: cap.errs };
                });
                return sendJson(out);
            }
            if (p === "/devtools/perf") {
                const sampleMs = Math.min(Math.max(j.sampleMs | 0 || 1000, 250), 8000);
                const out = await withPage(g.url, opts, async (page, cap) => {
                    const perf = await page.evaluate((ms) => new Promise((resolve) => {
                        const nav = performance.getEntriesByType("navigation")[0] || {};
                        let frames = 0; const t0 = performance.now();
                        function tick() {
                            frames++;
                            if (performance.now() - t0 < ms) requestAnimationFrame(tick);
                            else resolve({
                                fps: Math.round(frames / ((performance.now() - t0) / 1000)),
                                domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd || 0),
                                loadMs: Math.round(nav.loadEventEnd || 0),
                                transferKB: Math.round((nav.transferSize || 0) / 1024),
                            });
                        }
                        requestAnimationFrame(tick);
                    }), sampleMs);
                    return { ok: true, url: g.url, perf, errorCount: cap.errs.length, errors: cap.errs };
                });
                return sendJson(out);
            }
            return sendJson({ ok: false, error: "unknown route" }, 404);
        } catch (e) {
            const code = e && e.code === "NO_PUPPETEER" ? 501 : 500;
            return sendJson({ ok: false, error: String((e && e.message) || e) }, code);
        }
    });
}

module.exports = { owns, handle, _status: status, _guardUrl: guardUrl, _findChrome: findChrome };
