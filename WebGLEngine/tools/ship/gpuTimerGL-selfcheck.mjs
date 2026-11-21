// WebGLEngine/tools/ship/gpuTimerGL-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/gpuTimerGL-selfcheck.mjs      (under a minute: a fake context, then the page in headless Chromium)
//
// THE GPU TIMER ON A WEBGL2 PAGE, HELD. render/gpuTimerGL.mjs times stretches of WebGL2 commands by EXT_disjoint_timer_query_webgl2 and reports as render/gpuTimer.mjs does;
// engine/SplatRenderer.js times its re-upload and its draw; splat-gpu.html shows them on the WebGL2 renderer. Two things hold it:
//
//   1  THE LOGIC (a fake context whose queries answer when told to)   nanoseconds to milliseconds, stretches under one label summed; queries never nest (begin ends the
//                      open one); a frame is read only when EVERY query in it has answered, oldest frame first; a DISJOINT clock throws every waiting frame away; past
//                      `ring` waiting frames a frame is dropped, never queued; query objects are reused; without the extension everything is a no-op that says so
//   2  THE PAGE        splat-gpu.html?backend=webgl2 in headless Chromium (ANGLE on SwiftShader offers the extension): the draw and the upload timed on the card, on the
//                      status line, with no page error; ?gputimer=0 turns it off and says so
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createGpuTimerGL } from "../../render/gpuTimerGL.mjs";
import { timerLines } from "../../render/gpuTimer.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require = createRequire(import.meta.url), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };

/** A WebGL2 context with only what the timer touches. Queries answer when `answer(q, ns)` is called; `disjoint` is the driver's flag; mistakes a real driver refuses are counted. */
function fakeGL({ ext = true } = {}) {
    const E = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb }, made = [], log = { errors: 0, begun: 0, deleted: 0 };
    let active = null, disjoint = false;
    const gl = {
        QUERY_RESULT: 0x8866, QUERY_RESULT_AVAILABLE: 0x8867,
        getExtension: (n) => (ext && n === "EXT_disjoint_timer_query_webgl2" ? E : null),
        createQuery: () => { const q = { id: made.length, ns: null, ended: false }; made.push(q); return q; },
        deleteQuery: () => { log.deleted++; },
        beginQuery: (t, q) => { if (active || t !== E.TIME_ELAPSED_EXT) { log.errors++; return; } q.ns = null; q.ended = false; active = q; log.begun++; },
        endQuery: (t) => { if (!active || t !== E.TIME_ELAPSED_EXT) { log.errors++; return; } active.ended = true; active = null; },
        getQueryParameter: (q, p) => (p === 0x8867 ? q.ns !== null : q.ns),
        getParameter: (p) => (p === E.GPU_DISJOINT_EXT ? disjoint : null),
    };
    return { gl, log, made, answer: (q, ns) => { q.ns = ns; }, answerAll: (ns) => made.forEach((q, i) => { if (q.ended && q.ns === null) q.ns = typeof ns === "function" ? ns(q, i) : ns; }), setDisjoint: (v) => { disjoint = v; } };
}

console.log("gpuTimerGL-selfcheck -- the GPU timer on a WebGL2 page\n");

console.log("1. THE LOGIC (a fake context)");
await section(() => {
    const F = fakeGL(), t = createGpuTimerGL(F.gl, { smoothing: 0.5 });
    t.begin("draw"); t.end(); t.begin("upload"); t.end(); t.begin("draw"); t.end(); t.finish();
    ok("!! nothing is read before the card answers: a frame waits, no stall, no time made up", t.collect().frames === 0 && F.log.begun === 3 && F.log.errors === 0);
    F.answer(F.made[0], 2e6); F.answer(F.made[1], 5e5);
    ok("!! A FRAME IS READ ONLY WHEN EVERY QUERY IN IT HAS ANSWERED (two of three is not a frame)", t.collect().frames === 0);
    F.answer(F.made[2], 3e6); const s1 = JSON.parse(JSON.stringify(t.collect())), lines1 = timerLines(s1);   // a copy: stats() is the timer's live state
    ok("!! ...then nanoseconds become milliseconds and stretches under one label are summed: draw 2 + 3 = 5 ms, upload 0.5 ms, the total 5.5", s1.frames === 1 && s1.labels.draw.last === 5 && s1.labels.upload.last === 0.5 && s1.totalMs === 5.5);
    t.begin("draw"); t.begin("upload"); t.finish();
    ok("!! QUERIES NEVER NEST: begin() while one is open ends it first (a real driver refuses a second active TIME_ELAPSED query), and query objects are reused", F.log.errors === 0 && F.made.length === 3);
    F.answerAll(1e6); const s2 = t.collect();
    ok("!! a later frame is smoothed into the label (draw 5 then 1 at smoothing 0.5 is 3); `last` is the frame's own", s2.frames === 2 && s2.labels.draw.ms === 3 && s2.labels.draw.last === 1);
    const R = fakeGL(), r = createGpuTimerGL(R.gl, { ring: 2 });
    for (let f = 0; f < 4; f++) { r.time("p", () => {}); r.finish(); }
    ok("!! PAST `ring` WAITING FRAMES a frame goes untimed, never queued: ring 2, four frames, two queries made, the extra two not begun", R.made.length === 2 && R.log.begun === 2 && R.log.errors === 0);
    R.answerAll((q, i) => (i + 1) * 1e6); const sr = r.collect();
    ok("!! the waiting frames are read OLDEST FIRST, both at once (1 ms, then 2 ms smoothed: last 2)", sr.frames === 2 && sr.labels.p.last === 2);
    const J = fakeGL(), j = createGpuTimerGL(J.gl); j.time("p", () => {}); j.finish(); j.time("p", () => {}); j.finish(); J.answerAll(9e6); J.setDisjoint(true); const sj = j.collect();
    ok("!! A DISJOINT CLOCK THROWS EVERY WAITING FRAME AWAY, unread (a power-state change makes the numbers meaningless), and counts it", sj.frames === 0 && sj.dropped === 1 && !sj.labels.p);
    J.setDisjoint(false); j.time("p", () => {}); j.finish(); J.answerAll(4e6);
    ok("!! ...and the thrown-away queries are reused for the next frame, which is read", j.collect().labels.p.last === 4 && J.made.length === 2);
    const N = fakeGL({ ext: false }), n = createGpuTimerGL(N.gl), v = n.time("draw", () => 7); n.begin("x"); n.end(); n.finish();
    ok("!! WITHOUT THE EXTENSION it is a no-op that says so: unsupported, time() still runs its function, nothing begun, and the overlay's line says why", !n.supported && v === 7 && N.log.begun === 0 && n.collect().frames === 0 && /no timestamp-query/.test(timerLines(n.stats())[0]) && !createGpuTimerGL(null).supported);
    const D = fakeGL(), d = createGpuTimerGL(D.gl); d.time("a", () => {}); d.time("b", () => {}); d.finish(); D.answerAll(1e6); d.collect(); d.time("c", () => {}); d.finish(); d.destroy();
    const D2 = fakeGL(), d2 = createGpuTimerGL(D2.gl); d2.time("a", () => {}); d2.finish(); d2.begin("b"); d2.destroy();
    ok("!! destroy() ends an open query and deletes EVERY query it made -- waiting, open, and back in the reuse pool (a and b read and pooled, c reusing one and waiting: 2 made, 2 deleted; a waiting and b open: 2 and 2)", D.log.errors === 0 && D.made.length === 2 && D.log.deleted === 2 && D2.log.errors === 0 && D2.log.deleted === 2);
    ok("!! the overlay's lines are render/gpuTimer.mjs's, unchanged: largest first, then the total on the card", lines1.join("|") === "draw        5.00 ms|upload      0.50 ms|total       5.50 ms on the card");
});

console.log("2. THE PAGE (headless Chromium, ANGLE on SwiftShader)");
await section(async () => {
    const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
    const srv = http.createServer((q, r) => { const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
    await new Promise((res) => srv.listen(0, "127.0.0.1", res));
    const { chromium } = resolvePlaywright(require), browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) });
    const open = async (q) => { const p = await browser.newPage({ viewport: { width: 320, height: 200 } }), errors = []; p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(`http://127.0.0.1:${srv.address().port}/splat-gpu.html?n=10000&still=6&backend=webgl2${q}`);
        await p.waitForFunction(() => window.__splatGpu && (window.__splatGpu.gpuDrained || window.__splatGpu.error), null, { timeout: 90000 }).catch(() => {});
        const r = await p.evaluate(() => ({ backend: __splatGpu.backend, timer: __splatGpu.gpuTimer, times: __splatGpu.gpuTimes || null, frames: __splatGpu.gpuFrames || 0, error: __splatGpu.error, hud: document.getElementById("hud").textContent })); await p.close(); return { ...r, errors }; };
    const on = await open(""), off = await open("&gputimer=0");
    if (on.timer && on.timer !== "on") console.log(`  ----  this browser: ${on.timer}`);
    else ok("!! splat-gpu.html on WebGL2 times the draw and the re-upload on the card and puts them on its status line, with no page error", on.backend === "webgl2" && on.timer === "on" && on.frames >= 1 && on.times && on.times.draw > 0 && "upload" in on.times && /draw .* ms/.test(on.hud) && /on the card/.test(on.hud) && !on.error && on.errors.length === 0, JSON.stringify({ ...on, hud: on.hud.slice(-120) }));
    ok("!! ?gputimer=0 turns it off and says so", off.backend === "webgl2" && off.timer === "off" && !off.times && /GPU timer: off/.test(off.hud) && off.errors.length === 0, JSON.stringify({ ...off, hud: off.hud.slice(-80) }));
    await browser.close(); srv.close();
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 16 mutants, each in a hard-linked copy of the tree: ALL 16 RED. 11 of render/gpuTimerGL.mjs (nanoseconds read as microseconds, a label's stretches not
// summed, queries left to nest, a frame read when only some of its queries had answered, a disjoint clock ignored, the ring unbounded, no query reused, the newest
// frame read first, the WebGL1 extension's name, no smoothing, and destroy() leaving the reuse pool -- the last GREEN at first, as the check never pooled a query before
// destroying; it does now); 2 of engine/SplatRenderer.js (the draw untimed, the re-upload untimed); 3 of splat-gpu.html (no read-back after the loop stops, ?gputimer=0
// ignored, the timer not handed to the renderer).
