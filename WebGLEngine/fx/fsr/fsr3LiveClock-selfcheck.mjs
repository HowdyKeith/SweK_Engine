#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsr3LiveClock-selfcheck.mjs -- v4756
//
// FSR3 PACED ON THE BROWSER'S OWN CLOCK. Every pacing gate before this ran on an ideal refresh grid: fx/fsr/fsr3Pacing-
// selfcheck.mjs and fx/fsr/fsr3Late-selfcheck.mjs step a nominal clock, and fsr-three.html's paced view did the same. Here
// the loop is requestAnimationFrame's: each refresh is the timestamp the browser calls it with, the scene is sampled at it,
// a real frame is ready when the GPU's queue has drained after it, and what a callback draws counts as shown at the next
// callback's timestamp -- render/framePacer.mjs's makeLivePacing, the log fsr-three.html's "pacing: the browser's clock"
// grades for its stat line. FSR3 at 32 -> 64, a real frame every second callback, the refresh estimated from the first
// twelve timestamps (refreshFromStamps), then makeFramePacer with it: "none", and "timed" holding two pairs.
// *** THIS DEVICE IS SWIFTSHADER IN A HEADLESS BROWSER. *** Its timestamps and its render times are its own; what is
// asserted is that the live grading is the log's and the pacer asks only for what FSR3 holds -- the judder is reported.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { pacingMetrics, refreshFromStamps } from "../../render/framePacer.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const CALLBACKS = 70, N = 2;

console.log("\n1. ON THE DEVICE: FSR3 paced on requestAnimationFrame's timestamps");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Nothing here is static."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { CALLBACKS, N }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const F3 = await import("/fx/fsr/fsr3Tsl.mjs"); const FP = await import("/render/framePacer.mjs");
        const out = {};
        for (const mode of ["webgpu"]) {
            try {
                // the images go to a display-sized target: this harness's browser runs without presentation, as every device gate's does
                const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
                const renderer = new THREE.WebGPURenderer({ canvas, antialias: false }); await renderer.init();
                const dev = renderer.backend.device, drained = async () => { await dev.queue.onSubmittedWorkDone(); return performance.now(); };
                const scene = new THREE.Scene(); scene.background = new THREE.Color(0.02, 0.03, 0.06);
                const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.28, 120, 16), new THREE.MeshNormalNodeMaterial()); scene.add(knot);
                const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 0.6, 5.2); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
                const at = (ms) => { const t = ms / 1000; knot.rotation.set(0.4 + t * 0.4, 0.6 + t * 0.6, 0); knot.updateMatrixWorld(); };
                const fsr2 = { renderWidth: 32, renderHeight: 32, displayWidth: 64, displayHeight: 64, threshold: 1e-3, type: THREE.FloatType };
                const disp = new THREE.RenderTarget(64, 64, { type: THREE.FloatType });
                const o = {};
                for (const policy of ["none", "timed"]) {
                    const f3 = F3.makeFsr3(THREE, T, renderer, { fsr2, hold: policy === "timed" ? 2 : 1 });
                    const live = FP.makeLivePacing(), early = [], stamps = [];
                    let pacer = null, refresh = 0, v = 0, refused = 0;
                    await new Promise((resolve, reject) => {
                        const step = async (stamp) => {
                            try {
                                if (!pacer) { stamps.push(stamp); if (stamps.length >= 12) { refresh = FP.refreshFromStamps(stamps); pacer = FP.makeFramePacer({ refresh, policy, margin: 0, pairs: policy === "timed" ? "two" : "newest" });
                                    for (const e of early) pacer.real(...e); } }
                                if (v % a.N === 0) { at(stamp); await f3.render(scene, cam, false); const e = [v / a.N, stamp, await drained()];
                                    if (pacer) pacer.real(...e); else early.push(e); live.real(...e); }
                                if (!pacer) { const f0 = f3.frames; if (f0) await f3.show(f0 - 1, disp); live.tick(stamp, f0 ? { kind: "real", k: f0 - 1, t: 1, scene: early[f0 - 1][1] } : null); }
                                else {
                                    // what this callback draws is on the display at the NEXT one: the pacer decides for then. Asked for
                                    // now, it has not seen the frame just rendered as ready -- the queue drained after this timestamp --
                                    // while FSR3 has already taken it in, and the timed line asked for a pair FSR3 had let go. And the next
                                    // callback is no sooner than NOW: a render longer than a refresh puts it later than stamp + refresh
                                    const s = pacer.at(Math.max(stamp + refresh, performance.now())), f = f3.frames;
                                    if (s.kind === "gen") { if (s.k === f - 1 || (policy === "timed" && s.k === f - 2 && s.k >= 1)) await f3.generate(disp, { t: s.t, pair: s.k }); else refused++; }
                                    else if (s.kind === "real") { if (s.k >= f - f3.hold - 1 && s.k <= f - 1) await f3.show(s.k, disp); else refused++; }
                                    live.tick(stamp, s.kind === "hold" && s.k < 0 ? null : s);
                                }
                                v++;
                                if (v < a.CALLBACKS) requestAnimationFrame(step); else resolve();
                            } catch (e) { reject(e); }
                        };
                        requestAnimationFrame(step);
                    });
                    const m = live.metrics(Math.min(2000, live.stamps[live.stamps.length - 1] - live.stamps[0] - 1));
                    o[policy] = { refused, inPage: m, refresh: live.refresh(), pacerRefresh: refresh, first12: stamps.slice(0, 12), shown: live.shown.map((x) => ({ ...x })), frames: live.frames.map((x) => ({ ...x })), stamps: live.stamps.slice(),
                                  window: Math.min(2000, live.stamps[live.stamps.length - 1] - live.stamps[0] - 1) };
                    f3.dispose();
                }
                disp.dispose(); out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran both policies on requestAnimationFrame", r.ok && r.result && !r.result.webgpu.err, r.ok ? `webgpu ${r.result.webgpu.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.webgpu.err) {
        const o = r.result.webgpu, f = (x) => x.toFixed(2);
        for (const p of ["none", "timed"]) {
            const x = o[p], d = x.frames.map((q) => q.ready - q.start).sort((a, b) => a - b);
            say(`${p.padEnd(5)} ${x.stamps.length} timestamps kept, the refresh ${f(x.refresh)} ms by their median; a real frame ready ${f(d[d.length >> 1])} ms after it began (median of ${d.length}); over the last ${f(x.window)} ms: judder ${f(x.inPage.judder)} ms, ${f(x.inPage.newPerSecond)} new images/s, latency ${f(x.inPage.meanLatency)} ms`);
        }
        const again = (x) => { const to = x.stamps[x.stamps.length - 1]; return pacingMetrics({ shown: x.shown, frames: x.frames }, { from: to - x.window, to }); };
        const same = (a, b) => ["judder", "newPerSecond", "meanLatency", "maxLatency", "refreshes", "repeats"].every((k) => Math.abs(a[k] - b[k]) < 1e-9);
        ok(`*** the live grading is the LOG's: judder, new images, latency and repeats read in the page are pacingMetrics over the log it kept, for both policies -- ${["none", "timed"].map((p) => `${p} ${f(again(o[p]).judder)} ms`).join(", ")} ***`,
           same(o.none.inPage, again(o.none)) && same(o.timed.inPage, again(o.timed)), "what fsr-three.html's stat line prints on the browser's clock is this reading");
        const onStamps = ["none", "timed"].every((p) => { const S = new Set(o[p].stamps); return o[p].frames.filter((q) => q && q.start >= o[p].stamps[0]).every((q) => S.has(q.start) && q.ready > q.start); });
        const est = ["none", "timed"].every((p) => Math.abs(o[p].refresh - refreshFromStamps(o[p].stamps)) < 1e-9);
        ok(`  ...and the pacer is built with the refresh the browser's first twelve timestamps give -- ${["none", "timed"].map((p) => `${f(o[p].pacerRefresh)} ms`).join(" and ")} -- not a nominal 60 Hz`,
           ["none", "timed"].every((p) => o[p].first12.length === 12 && Math.abs(o[p].pacerRefresh - refreshFromStamps(o[p].first12)) < 1e-9),
           "on this device the next callback is mostly decided by how long the render took, so the refresh the pacer holds changes little here; on a display that keeps up it is the time of the next refresh");
        ok(`  ...and the clock is the browser's: every real frame began at a requestAnimationFrame timestamp and was ready LATER -- when the queue drained -- and each shown image is dated at a timestamp (${est})`,
           onStamps && est && ["none", "timed"].every((p) => { const S = new Set(o[p].stamps); return o[p].shown.every((q) => S.has(q.time)); }), "a callback's drawing goes up at the next callback");
        ok(`  ...and on it the pacer asks FSR3 only for what it holds: ${o.none.refused} and ${o.timed.refused} refused`, o.none.refused === 0 && o.timed.refused === 0,
           "the timed policy's line on real, uneven times stays within the two pairs makeFsr3({ hold: 2 }) keeps");
    }
}

// ---- v4756 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/framePacer.mjs, in render/framePacer-selfcheck.mjs (section 10) and here:
//   L1 the refresh the MEAN of the intervals       -> 1, 0     L4 the window from the first stamp, not the last -> 1, 1
//   L2 a drawing dated at its own timestamp        -> 1, 0     L5 the intervals not sorted before the median    -> 1, 0
//   L3 nothing let go of                           -> 1, 1
// Against this gate's loop, which is fsr-three.html's: P1 the pacer asked for the callback's own time -> 1 (4 refused);
// P2 a real frame ready when it began -> 1; P3 the pacer built with a nominal 60 Hz -> 0 FIRST, and the row naming the refresh
// it was built with was written for it -> 1.
// *** THE FIRST DRAFT ASKED THE PACER FOR THE CALLBACK'S OWN TIME, AND THE TIMED POLICY ASKED FOR PAIRS FSR3 HAD LET GO. *** The
// real frame rendered in a callback is ready when the queue drains, AFTER its timestamp, so the pacer did not yet count it
// while FSR3 had already taken it into its ring: 5 refused, and 1 still with the next refresh's time, because a render
// longer than a refresh puts the next callback later than that. It is asked for the later of the next refresh and now,
// which is when what it draws goes up: 0 refused, and the timed policy's judder on this device 6.7 and 11.5 ms over two
// runs where it read 78 and 89. fsr-three.html's paced view on the browser's clock asks the same way; no gate draws that
// view -- this device takes seconds a frame at 960 x 540.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the time an image REACHES the display -- the next callback's timestamp is when the browser composites, not " +
    "when the panel shows it, and nothing in a page can read the latter; a real GPU and a real display, where the judder means " +
    "what a viewer sees -- this device's render times are a CPU rasteriser's; and fsr-three.html itself, at 960 x 540, which this " +
    "device draws at seconds a frame.");
process.exitCode = fails ? 1 : 0;
