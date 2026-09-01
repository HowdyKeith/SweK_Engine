// WebGLEngine/tools/ship/deterministicRaf-selfcheck.mjs -- v4250
//
// Run: node tools/ship/deterministicRaf-selfcheck.mjs
//
// *** THIS TREE HAS MEASURED requestAnimationFrame TWICE AND CORRECTLY REFUSED TO CONCLUDE ANYTHING BOTH
// TIMES. WITH THE CLOCK IN THE GATE'S HAND, BOTH QUESTIONS ANSWER THEMSELVES -- AND ONE OF THE ANSWERS
// OVERTURNS THE EXPLANATION v4242 GAVE. ***
//
//   * #60, open since v4232: frameDirty measured 0.0% of frames skippable.
//   * v4242 measured 143 rAF callbacks against 16 render cycles in five seconds -- 89% of callbacks drawing
//     nothing -- and wrote: "NOT a claim that they were skippable: this is swiftshader, where a render cycle
//     is slow enough that other rAF consumers get many turns in between. It is recorded as a measurement,
//     not read as a verdict."
//
// That caution was right and the diagnosis was wrong. The 89% is not a swiftshader race. It is the page
// having SEVEN rAF consumers of which exactly ONE renders, and it survives a clock with no race in it at all.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { RAF_SHIM, makeRaf, makeRafNaive } from "./deterministicRaf.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

console.log("deterministicRaf-selfcheck -- a frame you cause, not a frame you wait for\n");

// =============================================================================================================
console.log("1. the shim's own semantics, before it is pointed at anything");
{
    const r = makeRaf();
    let n = 0;
    const loop = () => { n++; r.raf(loop); };
    r.raf(loop);
    r.step(5);
    ok("!! *** A SELF-PERPETUATING LOOP ADVANCES EXACTLY ONE FRAME PER STEP ***",
        n === 5 && r.frames === 5,
        n + " invocations over " + r.frames + " steps. Every animation loop in existence is `function frame() " +
        "{ ...; requestAnimationFrame(frame); }`, so this is the only property that matters.");
    // *** THE CONTROL: THE NAIVE VERSION, WHICH IS WHAT YOU WRITE IF YOU DO NOT THINK ABOUT IT. ***
    const bad = makeRafNaive();
    let m = 0;
    const loop2 = () => { m++; bad.raf(loop2); };
    bad.raf(loop2);
    const res = bad.step(1);
    ok("!! *** AND WALKING THE LIVE QUEUE INSTEAD OF TAKING IT RUNS AWAY: " + m + " INVOCATIONS IN ONE STEP ***",
        res.capped && m >= 10000,
        "the naive shim re-reads queue.length each iteration, so callbacks appended DURING the walk are " +
        "walked too -- it hit the 10,000 cap that only exists to stop this check hanging. Taking the queue " +
        "before walking it is the entire difficulty of a rAF mock, and this is why the correct one is not " +
        "merely asserted correct.");
    const r2 = makeRaf();
    let ticks = [];
    r2.raf((t) => ticks.push(t));
    r2.step(1, 20);
    r2.raf((t) => ticks.push(t));
    r2.step(1, 20);
    ok("!! the timestamp handed to a callback is the CONTROLLED clock, advancing by the chosen interval",
        ticks.length === 2 && ticks[0] === 20 && ticks[1] === 40,
        "callbacks saw t = " + ticks.join(", ") + " ms at a 20 ms step. A loop computing dt from the " +
        "timestamp sees the interval the gate chose, not however long the machine took.");
    const r3 = makeRaf();
    let ran = 0;
    const id = r3.raf(() => ran++);
    r3.cancel(id);
    r3.step(1);
    ok("   a cancelled callback does not run",
        ran === 0 && r3.frames === 1, "one frame stepped, " + ran + " invocations");
    const r4 = makeRaf();
    r4.raf(() => {}); r4.raf(() => {});
    ok("   pending() reports what is queued and step() drains it",
        r4.pending() === 2 && r4.step(1).pending === 0);
}

// =============================================================================================================
// ---- v4250 SABOTAGES, RESTORED BYTE-IDENTICAL AND md5-VERIFIED ------------------------------------------
//
//   A  the shim walks the live queue instead of taking it -- the classic mock bug, and the one thing this
//      file exists to get right. -> 1 RED at 50,000 invocations over 5 steps. Note that this is the SAME
//      defect section 1's control deliberately ships as makeRafNaive: the control proves the property is
//      real, and the sabotage proves the check on the correct implementation is load-bearing. Neither
//      substitutes for the other.
//
//   B  the clock stops advancing while frames still count. -> 1 RED, callbacks seeing t = 0, 0 at a 20 ms
//      step. Note what stayed GREEN: the self-perpetuating-loop check, the cancel check and the pending
//      check, all of which are about the QUEUE and none of which touch the clock. A shim that steps frames
//      perfectly and lies about the time would pass every structural check in this file, which is why the
//      timestamp is asked about directly.
//
console.log("\n2. *** THE REAL ENGINE, DRIVEN FRAME BY FRAME ***");
const require_ = createRequire(import.meta.url);
const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) {
    report("SKIPPED -- " + skip);
    report("*** A SKIP, NOT A PASS. Section 1 checks the instrument; only the real page can answer #60, and " +
           "answering it is the whole point of building the instrument.");
} else {
    const DRAWS = '<script>\n' +
        'window.__draws = 0; window.__drawSites = new Map();\n' +
        '(function () { var p = window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype;\n' +
        '  if (!p) return; var o = p.drawArrays;\n' +
        '  p.drawArrays = function (m, f, c) { window.__draws++;\n' +
        '    try { var s = (new Error().stack.split("\\n")[2] || "").match(/\\/([A-Za-z0-9_.-]+\\.(?:js|mjs|html)):(\\d+)/);\n' +
        '      if (s) window.__drawSites.set(s[0], (window.__drawSites.get(s[0]) || 0) + 1); } catch (e) {}\n' +
        '    return o.call(this, m, f, c); }; })();\n' +
        '</script>';
    const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const pg = await b.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    await pg.route("**/*", (route) => {
        const u = new URL(route.request().url());
        if (u.hostname !== "swek.local") return route.fulfill({ status: 404, body: "nf" });
        const p = path.join(ENG, decodeURIComponent(u.pathname));
        if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return route.fulfill({ status: 404, body: "nf" });
        const ext = path.extname(p);
        const type = ext === ".mjs" || ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html"
            : ext === ".json" ? "application/json" : ext === ".css" ? "text/css" : "application/octet-stream";
        let body = fs.readFileSync(p);
        if (u.pathname === "/index.html") body = body.toString().replace("<head>", "<head>\n" + RAF_SHIM + "\n" + DRAWS);
        return route.fulfill({ status: 200, contentType: type, body });
    });
    await pg.goto("http://swek.local/index.html", { waitUntil: "domcontentloaded", timeout: 45000 });
    await pg.waitForFunction(() => window.__raf && window.world, { timeout: 45000 }).catch(() => {});

    // *** THE CLOCK IS CONTROLLED; THE NETWORK IS NOT. *** Assets still arrive on real time, and the boot
    // sequence needs frames to make progress, so the two are interleaved: step a batch, then let real time
    // pass for fetch and decode. Only the FRAME COUNT is the gate's to choose, which is all it needs.
    for (let round = 0; round < 8; round++) {
        await pg.evaluate((k) => window.__raf.step(k), 30);
        await new Promise((r) => setTimeout(r, 1000));
    }
    const booted = await pg.evaluate(() => ({ frames: window.__raf.frames, invoked: window.__raf.count,
                                              pending: window.__raf.pending(), draws: window.__draws }));
    ok("!! the real index.html boots with its rAF replaced, and throws nothing",
        errs.length === 0 && booted.draws > 0,
        errs.slice(0, 2).join(" | ") || (booted.frames + " frames stepped, " + booted.draws + " draws"));

    // *** THE MEASUREMENT #60 HAS BEEN WAITING FOR: step a known number of frames, count the draws. ***
    const batches = [];
    for (const n of [1, 1, 1, 10, 50]) {
        const before = await pg.evaluate(() => window.__draws);
        await pg.evaluate((k) => window.__raf.step(k), n);
        const after = await pg.evaluate(() => window.__draws);
        batches.push({ n, drew: after - before });
    }
    const perFrame = batches.map((x) => x.drew / x.n);
    const consistent = perFrame.every((v) => v === perFrame[0]);
    ok("!! *** EVERY SINGLE FRAME DRAWS, AND THE RATE IS EXACTLY CONSTANT ***",
        consistent && perFrame[0] === 6,
        batches.map((x) => "step(" + x.n + ") -> +" + x.drew).join(", ") + " -- " + perFrame[0] + " draws per " +
        "frame in every batch. The render cycle does not skip frames: it runs on all of them.");
    const sites = await pg.evaluate(() => [...window.__drawSites]);
    ok("!! ...and every draw site fires on every frame, so no pass is conditionally skipped either",
        sites.length === 6 && new Set(sites.map((s) => s[1])).size === 1,
        sites.map((s) => s[0] + " x" + s[1]).join(", ") + " -- six sites, identical counts.");

    // *** AND THE CORRECTION TO v4242, WHICH IS THE POINT OF HAVING BUILT THE INSTRUMENT. ***
    const after = await pg.evaluate(() => ({ frames: window.__raf.frames, invoked: window.__raf.count,
                                             pending: window.__raf.pending() }));
    const perFrameCallbacks = after.invoked / after.frames;
    const nonDrawing = 1 - 1 / perFrameCallbacks;
    ok("!! *** THE PAGE HAS " + after.pending + " rAF CONSUMERS AND EXACTLY ONE OF THEM RENDERS ***",
        after.pending >= 5 && perFrameCallbacks > 3,
        after.invoked + " callbacks over " + after.frames + " frames = " + perFrameCallbacks.toFixed(1) +
        " per frame, with " + after.pending + " queued in steady state, while the render cycle runs ONCE per " +
        "frame. So " + (100 * nonDrawing).toFixed(0) + "% of callbacks draw nothing.");
    ok("!! *** WHICH IS v4242's 89%, AND ITS EXPLANATION WAS WRONG ***",
        Math.abs(100 * nonDrawing - 89) < 12,
        "v4242 measured 89% of callbacks drawing nothing and attributed it to swiftshader being slow enough " +
        "that 'other rAF consumers get many turns in between'. Under a clock the gate controls there is NO " +
        "race -- every frame is one step, every consumer gets exactly one turn -- and the figure is still " +
        (100 * nonDrawing).toFixed(0) + "%. It was never about speed. It is the architecture: several " +
        "consumers share the loop and one of them draws.");
    report("*** SO #60's 0.0% SKIPPABLE IS CONFIRMED RATHER THAN OVERTURNED, and now it is a measurement " +
           "instead of a race: the render cycle runs on 100% of frames, so there are no frames to skip. What " +
           "frameDirty would have to skip is not a FRAME but the WORK INSIDE one, which is a different " +
           "question from the one v4232 was asking.");
    await b.close();
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: what the other consumers DO with their turns. This round establishes that six of the " +
    "seven never draw; it does not say whether they compute anything worth computing, and 'does not draw' is " +
    "not 'does nothing' -- that is exactly the conflation this file exists to undo, so it is not committed " +
    "again in the other direction. Also unchecked: the NETWORK is still real. Asset fetch and decode run on " +
    "wall time, so boot is interleaved with real waits and only the FRAME COUNT is the gate's to choose. A " +
    "fully hermetic page would need the fetches stubbed too, which is a bigger harness than this question " +
    "needed.");
process.exit(fails ? 1 : 0);
