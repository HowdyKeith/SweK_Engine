// WebGLEngine/tools/ship/gpuTimerAuto-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/gpuTimerAuto-selfcheck.mjs      (about five minutes: every page that carries the line, twice, in headless Chromium on SwiftShader)
//
// THE GPU TIMER ON THE OTHER WEBGL2 PAGES, HELD. render/gpuTimerAuto.js is one line in a page's <head>; this gate drives every page that carries it.
//
//   1  THE SOURCE   every page that makes a WebGL2 context itself carries the line or has its own timer; where it is carried it is the FIRST script in the page;
//                   no page that carries it runs TIME_ELAPSED queries of its own (WebGL2 allows one at a time)
//   2  THE HELPER   a test page: a 2 x 2 probe context first, then the canvas drawn on -- the drawn one is timed; a draw done ONCE, on a timer, not in an animation
//                   frame, is timed, and then the page is idle and the overlay says so; the page's requestAnimationFrame is the browser's own; when the drawn
//                   canvas leaves the page the timer moves to the one left; ?gputimer=0 installs nothing (getContext the browser's own, no overlay); a page
//                   with no context shows no overlay
//   3  THE PAGES    every page that carries it loads with no page error that it does not also have with ?gputimer=0; a page that makes its context only when
//                   asked (a button) says "no WebGL2 context" and shows nothing; every other page is timed on a canvas, shows the overlay, and -- for those
//                   listed as drawing at load or every frame -- has timed a frame that drew (0.01 ms or more)
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require = createRequire(import.meta.url), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };

const TAG = '<script src="render/gpuTimerAuto.js"></script>';
const OWN_TIMER = ["celltrack-splat.html", "ocean-default.html", "splat-gpu.html", "star_gas.html"];   // they time their own passes (render/gpuTimerGL.mjs, gpuTimer.mjs)
const ON_ASK = ["backend-dom.html", "path-tracer.html", "population.html"];                           // their WebGL2 context is made by a button, not at load
// drawing at load or every frame, as measured here (2026-11-22). The rest that carry the line -- gallery, indexPlus, panels, sky, sphere-impostor -- drew nothing the
// timer saw (their first draw comes before it, or on a control): they are held to "timed, overlay shown, no error", and reported
const DRAWS = ["avatarstage.html", "benchmark.html", "brain-room.html", "bzflag.html", "camera-effects.html", "comic-voxel-fire.html", "cube.html", "index.html", "krbn-compare.html", "mesh-line.html", "nebula.html", "phone.html", "pom-demo.html", "raymarch-gl-demo.html", "raymarch-live.html", "rps.html", "sinogram-gpu.html", "slug-text.html", "volume-cache.html", "voxel-viewer.html", "water.html", "wormhole-jump.html", "zoom-blur.html"];

const html = fs.readdirSync(ENG).filter((f) => f.endsWith(".html")).sort(), src = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
const carriers = html.filter((f) => src(f).includes(TAG));

console.log("gpuTimerAuto-selfcheck -- the GPU timer on the other WebGL2 pages\n");

console.log("1. THE SOURCE");
await section(() => {
    const makers = html.filter((f) => /getContext\(\s*["']webgl2["']/.test(src(f)));
    const missing = makers.filter((f) => !carriers.includes(f) && !OWN_TIMER.includes(f));
    ok(`!! every page that makes a WebGL2 context itself carries the line or times its own passes (${makers.length} pages: ${carriers.length} carry it, ${OWN_TIMER.length} have their own)`, missing.length === 0 && carriers.length >= 31 && OWN_TIMER.every((f) => !carriers.includes(f) && /gpuTimer/.test(src(f))), missing.join(", "));
    const late = carriers.filter((f) => { const s = src(f), first = s.search(/<script\b/i); return s.indexOf(TAG) !== first; });
    ok("!! where it is carried it is the FIRST script in the page (it must see the context made)", late.length === 0, late.join(", "));
    const clash = carriers.filter((f) => /TIME_ELAPSED|disjoint_timer_query/.test(src(f)));
    ok("!! no page that carries it runs timer queries of its own", clash.length === 0, clash.join(", "));
});

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".css": "text/css" };
const TEST = `<!doctype html><html><head><meta charset="utf-8">${TAG}</head><body><script>
const Q = new URLSearchParams(location.search);
window.__nativeRaf = /\\[native code\\]/.test(Function.prototype.toString.call(window.requestAnimationFrame));
window.__nativeGet = /\\[native code\\]/.test(Function.prototype.toString.call(HTMLCanvasElement.prototype.getContext));
if (Q.get("none") !== "1") {
    const probe = document.createElement("canvas"); probe.width = probe.height = 2; probe.getContext("webgl2");   // a capability probe, never on the page
    const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; document.body.appendChild(c); return c; };
    const big = mk(320, 200), small = mk(64, 40), gl = big.getContext("webgl2"), gl2 = small.getContext("webgl2");
    const prog = (g) => { const sh = (t, s) => { const o = g.createShader(t); g.shaderSource(o, s); g.compileShader(o); return o; }, p = g.createProgram();
        g.attachShader(p, sh(g.VERTEX_SHADER, "#version 300 es\\nvoid main(){ vec2 v = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 4.0 - 1.0; gl_Position = vec4(v, 0.0, 1.0); }"));
        g.attachShader(p, sh(g.FRAGMENT_SHADER, "#version 300 es\\nprecision highp float; out vec4 o; void main(){ float a = 0.0; for (int i = 0; i < 400; i++) a = fract(a * 1.31 + sin(gl_FragCoord.x * 0.01 + float(i))); o = vec4(a, a, a, 1.0); }"));
        g.linkProgram(p); return p; };
    const pb = prog(gl);
    window.__drawOnce = () => { gl.useProgram(pb); for (let k = 0; k < 6; k++) gl.drawArrays(gl.TRIANGLES, 0, 3); };
    setTimeout(() => { window.__drawOnce(); window.__drewAt = performance.now(); }, 400);   // ONCE, on a timer -- not in an animation frame
    window.__dropBig = () => big.remove(); window.__grow = () => { big.width = 400; };
}
<\/script></body></html>`;

let browser = null, srv = null;
const server = async () => {
    srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split("?")[0]); if (u === "/__auto.html") { r.writeHead(200, { "Content-Type": "text/html" }); return r.end(TEST); } const f = path.join(ENG, u); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
    await new Promise((res) => srv.listen(0, "127.0.0.1", res));
    const { chromium } = resolvePlaywright(require); browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) });
};
const R = () => window.__gpuTimerAuto, box = () => (document.getElementById("gpuTimerAuto") || {}).textContent || null;

console.log("2. THE HELPER (a test page)");
await section(async () => {
    await server();
    const base = `http://127.0.0.1:${srv.address().port}/__auto.html`, p = await browser.newPage(), pe = []; p.on("pageerror", (e) => pe.push(e.message));
    await p.goto(base);
    await p.waitForFunction(() => window.__gpuTimerAuto.busy != null && window.__drewAt && performance.now() - window.__drewAt > 1500, null, { timeout: 60000 }).catch(() => {});
    const a = await p.evaluate(() => ({ ...window.__gpuTimerAuto, raf: window.__nativeRaf, get: window.__nativeGet, box: (document.getElementById("gpuTimerAuto") || {}).textContent }));
    if (a.state !== "on") { console.log(`  ----  this browser: ${a.state}`); await browser.close(); srv.close(); browser = null; return; }
    ok("!! THE CANVAS DRAWN ON IS TIMED, not the 2 x 2 probe made first, nor the smaller canvas", a.canvas === "320 x 200", a.canvas);
    ok("!! A DRAW DONE ONCE, ON A TIMER (not in any animation frame), IS TIMED; then the page is idle and the overlay says how long the frame that drew took", a.busy > 0.05 && a.last < 0.01 && /idle; the last frame that drew took/.test(a.box) && pe.length === 0, JSON.stringify({ busy: a.busy, last: a.last, box: a.box, pe: pe.slice(0, 1) }));
    ok("!! the page's requestAnimationFrame is the browser's own, untouched (getContext is the one function wrapped)", a.raf === true && a.get === false);
    await p.evaluate(() => window.__grow()); await p.waitForTimeout(500);
    ok("!! the size it reports is the canvas's as it is now (a page sizes its canvas after making the context)", await p.evaluate(() => window.__gpuTimerAuto.canvas) === "400 x 200");
    await p.evaluate(() => window.__dropBig()); await p.waitForFunction(() => window.__gpuTimerAuto.canvas === "64 x 40", null, { timeout: 20000 }).catch(() => {});
    ok("!! when the drawn canvas leaves the page, the timer moves to the one left", await p.evaluate(() => window.__gpuTimerAuto.canvas) === "64 x 40" && pe.length === 0);
    const off = await browser.newPage(); await off.goto(base + "?gputimer=0"); await off.waitForTimeout(1500);
    const o = await off.evaluate(() => ({ s: window.__gpuTimerAuto.state, get: window.__nativeGet, raf: window.__nativeRaf, box: !!document.getElementById("gpuTimerAuto") }));
    ok("!! ?gputimer=0 installs nothing: getContext is the browser's own, no overlay, and it says off", o.s === "off" && o.get === true && o.raf === true && !o.box, JSON.stringify(o));
    const none = await browser.newPage(); await none.goto(base + "?none=1"); await none.waitForTimeout(1500);
    const n = await none.evaluate(() => ({ s: window.__gpuTimerAuto.state, box: !!document.getElementById("gpuTimerAuto") }));
    ok("!! a page that makes no WebGL2 context shows no overlay and says so", n.s === "no WebGL2 context" && !n.box, JSON.stringify(n));
    await p.close(); await off.close(); await none.close();
});

console.log("3. THE PAGES (every page that carries the line, in headless Chromium on SwiftShader)");
await section(async () => {
    if (!browser) { console.log("  ----  skipped: the test page found no timer in this browser"); return; }
    const open = async (pg, q) => {
        const p = await browser.newPage({ viewport: { width: 640, height: 400 } }), errs = []; p.on("pageerror", (e) => errs.push(e.message.slice(0, 100)));
        try { await p.goto(`http://127.0.0.1:${srv.address().port}/${pg}${q}`, { timeout: 30000 }); } catch (e) { errs.push("did not load: " + e.message.slice(0, 60)); }
        if (!q) {
            await p.waitForFunction(() => window.__gpuTimerAuto && window.__gpuTimerAuto.frames >= 3, null, { timeout: 15000 }).catch(() => {});
            await p.setViewportSize({ width: 600, height: 380 }); await p.waitForTimeout(2500);   // a resize: many pages draw again on one
        } else await p.waitForTimeout(3000);
        const r = await p.evaluate(() => ({ ...window.__gpuTimerAuto, box: (document.getElementById("gpuTimerAuto") || {}).textContent || null })).catch((e) => ({ state: "page gone: " + e.message.slice(0, 40) }));
        await p.close(); return { ...r, errs };
    };
    const rows = [];
    for (let i = 0; i < carriers.length; i += 4) rows.push(...await Promise.all(carriers.slice(i, i + 4).map(async (pg) => { const on = await open(pg, ""), off = await open(pg, "?gputimer=0"); return { pg, on, off, extra: on.errs.filter((e) => !off.errs.includes(e)) }; })));
    const extra = rows.filter((r) => r.extra.length);
    ok(`!! ALL ${rows.length} PAGES LOAD WITH NO PAGE ERROR THE LINE BRINGS (any error a page has, it has with ?gputimer=0 too)`, extra.length === 0, extra.map((r) => `${r.pg}: ${r.extra[0]}`).join("; "));
    const ask = rows.filter((r) => ON_ASK.includes(r.pg)), badAsk = ask.filter((r) => r.on.state !== "no WebGL2 context" || r.on.box);
    ok(`!! the ${ON_ASK.length} pages that make their context only when asked say "no WebGL2 context" and show nothing`, ask.length === ON_ASK.length && badAsk.length === 0, badAsk.map((r) => `${r.pg}: ${r.on.state}`).join("; "));
    const rest = rows.filter((r) => !ON_ASK.includes(r.pg)), notOn = rest.filter((r) => r.on.state !== "on" || !r.on.canvas || !r.on.box || r.off.state !== "off");
    ok(`!! the other ${rest.length} are timed on a canvas and show the overlay (and with ?gputimer=0 say off)`, notOn.length === 0, notOn.map((r) => `${r.pg}: ${r.on.state} / ${r.off.state}`).join("; "));
    const drew = rest.filter((r) => DRAWS.includes(r.pg)), idle = drew.filter((r) => !(r.on.busy >= 0.01));
    ok(`!! the ${DRAWS.length} that draw at load or every frame have each timed a frame that drew`, drew.length === DRAWS.length && idle.length === 0, idle.map((r) => r.pg).join(", "));
    for (const r of rest) console.log(`  ....  ${r.pg.padEnd(22)} ${r.on.canvas || ""}  ${r.on.box || ""}`);
    await browser.close(); srv.close();
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 12 mutants, ALL 12 RED. 10 of render/gpuTimerAuto.js, each in a hard-linked copy of the tree (the first context timed, not the largest; a canvas
// off the page counted; the query not held open between boundaries; the page's requestAnimationFrame wrapped; ?gputimer=0 ignored; the timer never moving; busy never
// kept; the overlay shown with no context; idle judged by the smoothed time; the size not refreshed -- the last GREEN until the test page grew its canvas after the
// context was made). 2 of the pages, against section 1 (the line taken out of cube.html; the line moved after sky.html's module script -- moved only to BEFORE it
// at first, which left it first and was no mutant at all).
