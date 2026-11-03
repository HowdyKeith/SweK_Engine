#!/usr/bin/env node
// WebGLEngine/render/frameGenChainLive-selfcheck.mjs -- path-tracer.html's chain frame-generation view (backlog
// denoise-framegen-page-chain): render/frameGenChainLive.mjs's chain held to the arc's own pieces, its CPU generator, the compute
// generator (render/denoiseFrameGenGPU.mjs's createDeviceGenerator) against it in a browser at section 147's bound, and the wiring.
//
// SABOTAGED, each restored byte-identical (/root/swek-sab/safe2.py, against this gate and render/frameGenLive-selfcheck.mjs):
//   P1 the history over seven frames, P4 the motion field reversed, P5 the holes left black, P7 every vector valid in motionBuffer, P11 the
//   device's frame shown unlit, P12 makeLiveFrameGen's genOf ignored -> 1 red each; P6 indexed by the older frame, P8 the device's fill pass
//   skipped, P9 the device's two frames swapped, P10 the page never using WebGPU -> 2 red each; P2 the real frame lit at the orbit's start and
//   P3 the half-way lights at the newer eye -> *** 0 RED at first *** (the default scene has no light source in view anywhere on its orbit),
//   then 1 each with the R 990950 row added.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInEngineOrigin } from "../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const C = await imp("render/frameGenChainLive.mjs"), L = await imp("render/temporalLive.mjs"), FL = await imp("render/frameGenLive.mjs"), FGG = await imp("render/denoiseFrameGenGPU.mjs");
const D = await imp("render/denoiseScenes.mjs"), { FRAMES } = await imp("render/denoiseTemporal.mjs"), TU = await imp("render/denoiseTemporalUpscale.mjs"), FG = await imp("render/denoiseFrameGen.mjs");
const { emitterRadiance } = await imp("render/denoiseMask.mjs"), { compositeEmitters } = await imp("render/denoiseUpscale.mjs"), { interpolateFrameCPU } = await imp("render/frameInterp.mjs");
const { decodeNet } = await imp("render/denoiseDevice.mjs");
const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, "render", "denoise-net-r11.json"), "utf8")).net);
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const rgba = (img3) => { const n = img3.length / 3, o = new Float32Array(n * 4); for (let p = 0; p < n; p++) { o[p * 4] = img3[p * 3]; o[p * 4 + 1] = img3[p * 3 + 1]; o[p * 4 + 2] = img3[p * 3 + 2]; o[p * 4 + 3] = 1; } return o; };

console.log("1. THE CHAIN IS THE ARC's");
const W = 32, st = C.makeChainState({ net, W, sppIn: 1 }), steps = [];
for (let k = 0; k < 10; k++) steps.push(C.chainStep(st, k));
{
    ok("  the defaults: 128 x 128 traced at 64, 4 samples, 2.5 degrees a frame, a non-dataset scene, the shipped denoiser, FRAMEGEN_FILL with cross-faded holes at t 0.5",
        C.LIVE_C.W === 128 && C.LIVE_C.sppIn === 4 && C.LIVE_C.stepDeg === 2.5 && !D.isDatasetSeed(C.LIVE_C.seed) && C.LIVE_C.net === "render/denoise-net-r11.json" &&
        C.LIVE_C.fill === FG.FRAMEGEN_FILL && C.LIVE_C.holes === "crossfade" && C.LIVE_C.t === 0.5 && Object.isFrozen(C.LIVE_C));
    // frame 9 by hand: the last eight real frames (2-9), each liveFrame at its own eye, jitter and seed, accumulated as round 32 does
    const S = D.makeScene(C.LIVE_C.family, C.LIVE_C.seed), spec = (k) => ({ eye: FL.orbitEye(S, k * C.LIVE_C.stepDeg), jitter: TU.JITTER[k % FRAMES], seed: C.LIVE_C.seedBase + k, W, sppIn: 1 });
    const win = [2, 3, 4, 5, 6, 7, 8, 9].map((k) => L.liveFrame(S, net, spec(k))), acc = TU.accumulateUpscaled(win, win.map((f) => f.geo), W, W), f9 = steps[9];
    ok("!! real frame 9 is the chain over frames 2-9: each liveFrame at its eye, round 32's jitter and its seed, then Bt's history -- its light-free A and lengths bit for bit, its image A lit at eye 9",
        same(f9.A, rgba(acc.A)) && same(f9.n, acc.n) && same(f9.frame, rgba(compositeEmitters(acc.A, emitterRadiance({ ...S, eye: spec(9).eye }, W, W)))) && st.frames.length === FRAMES && f9.k === 9 && f9.W === W);
    const f1 = steps[1], m1 = FG.motionField(S, spec(0).eye, spec(1).eye, W, W), early = TU.accumulateUpscaled([0, 1].map((k) => L.liveFrame(S, net, spec(k))), [0, 1].map((k) => L.liveFrame(S, net, spec(k)).geo), W, W);
    ok("  ...before eight frames the history is all of them (frame 1 over frames 0-1); frame 1 carries the motion field from eye 0 and the light sources at eye 0.5; frame 0 neither",
        same(f1.A, rgba(early.A)) && same(f1.flow, m1.flow) && same(f1.depth, m1.depth) && same(f1.mid.E, emitterRadiance({ ...S, eye: FL.orbitEye(S, 0.5 * C.LIVE_C.stepDeg) }, W, W).E) && !("flow" in steps[0]) && !("mid" in steps[0]));
    // the default scene has no light source in view anywhere on its orbit, so the lighting rows need one that does: R 990950
    const sl = C.makeChainState({ net, W, sppIn: 1, seed: 990950 }), l0 = C.chainStep(sl, 0), l1 = C.chainStep(sl, 1), SL = D.makeScene("R", 990950);
    const at = (deg) => emitterRadiance({ ...SL, eye: FL.orbitEye(SL, deg) }, W, W), accL = TU.accumulateUpscaled(sl.frames, sl.frames.map((f) => f.geo), W, W);
    ok("!! where light sources are in view (R 990950): a real frame is lit at its OWN eye, and the half-way frame's lights are the half-way eye's -- neither the orbit's start nor the newer eye's",
        !D.isDatasetSeed(990950) && same(l1.frame, rgba(compositeEmitters(accL.A, at(2.5)))) && !same(l1.frame, rgba(compositeEmitters(accL.A, at(0)))) &&
        same(l1.mid.E, at(1.25).E) && !same(l1.mid.E, at(2.5).E) && !same(at(1.25).E, at(0).E) && l0.k === 0);
    let bad = null; try { C.chainStep(st, 12); } catch (e) { bad = e.message; }
    let noNet = null; try { C.makeChainState({ W }); } catch (e) { noNet = e.message; }
    ok("  frames out of order, and a chain without the denoiser, are refused", /come in order -- expected 10, got 12/.test(bad || "") && /needs the shipped denoiser/.test(noNet || ""));
}

console.log("\n2. THE GENERATOR, ON THE CPU");
const a = steps[8], b = steps[9];
const g = C.generateChainCPU(a, b);
{
    const want = interpolateFrameCPU({ prev: a.A, cur: b.A, w: W, h: W, flow: b.flow, bw: W, bh: W, block: 1, depthBlock: b.depth, indexedBy: "cur", t: 0.5,
        fill: { radius: 4, reach: 16, side: "blend", prefer: "farther" }, holes: "crossfade" });
    const N = W * W, lit = new Float64Array(N * 3); for (let p = 0; p < N; p++) for (let c = 0; c < 3; c++) lit[p * 3 + c] = want.frame[p * 4 + c];
    ok("!! generateChainCPU is interpolateFrameCPU between the two light-free histories -- indexed by the newer frame, at t 0.5, FRAMEGEN_FILL, the holes cross-faded -- then lit at the half-way eye",
        same(g.gen, want.frame) && same(g.frame, rgba(compositeEmitters(lit, b.mid))) && same(C.composeMid(want.frame, b), g.frame) && g.holes === want.holes && g.filled === want.filled, `${g.filled} filled, ${g.holes} left`);
    let e1 = null, e2 = null; try { C.generateChainCPU(steps[7], b); } catch (e) { e1 = e.message; } try { C.generateChainCPU(b, steps[0]); } catch (e) { e2 = e.message; }
    ok("  a pair that is not consecutive, or whose newer frame has no field, is refused", /two consecutive real frames -- got 7 and 9/.test(e1 || "") && /frame 0 has none/.test(e2 || ""));
    const mb = FGG.motionBuffer(Float32Array.of(2, -3, NaN, NaN), Float32Array.of(1.5, 1e9), 2, 1);
    ok("  motionBuffer: the field as the generator reads it -- the flow and depth, valid 1; no vector a zero flow and valid 0", same(mb, Float32Array.of(2, -3, 1.5, 1, 0, 0, 1e9, 0)) && FGG.MOT_STRIDE === 4);
    const v = FL.makeLiveFrameGen({ refresh: 16, genOf: (x, y) => ({ frame: Float32Array.of(7), holes: 3, from: [x.k, y.k] }) });
    v.real({ k: 0, frame: Float32Array.of(1) }, 0, 10); v.real({ k: 1, frame: Float32Array.of(2) }, 10, 20);
    const shown = Array.from({ length: 12 }, (_, i) => v.at(20 + i * 4)).find((s) => s.kind === "gen");
    ok("  makeLiveFrameGen's genOf: a half-way frame the page made on arrival is the one shown, with its holes", !!shown && same(shown.frame, Float32Array.of(7)) && shown.holes === 3 && v.generated >= 1);
}

console.log("\n3. THE COMPUTE GENERATOR AGAINST IT, IN A BROWSER");
{
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { W, prev: Array.from(a.A), cur: Array.from(b.A), flow: Array.from(b.flow), depth: Array.from(b.depth) }, script: `async (p) => {
        const { requestDevice } = await import("/gfx/device.js"), FGG = await import("/render/denoiseFrameGenGPU.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true }), errs = [];
        if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const gen = FGG.createDeviceGenerator(dev, p.W, p.W), f32 = (x) => Float32Array.from(x);
        const one = await gen.generate({ prev: f32(p.prev), cur: f32(p.cur), flow: f32(p.flow), depth: f32(p.depth) });
        const two = await gen.generate({ prev: f32(p.cur), cur: f32(p.prev), flow: f32(p.flow), depth: f32(p.depth) });
        let refused = null; try { await gen.generate({ prev: new Float32Array(4), cur: f32(p.cur), flow: f32(p.flow), depth: f32(p.depth) }); } catch (e) { refused = e.message; }
        return { frame: Array.from(one.frame), holes: one.holes, frame2: Array.from(two.frame), refused, errs };
    }` });
    if (r.skipped) { ok("  the browser ran (no WebGPU here: NOT A PASS)", false, r.reason); }
    else if (!r.ok || !r.result) ok("!! the browser ran the compute generator", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 300)}`);
    else {
        const R = r.result, N = W * W;
        let fw = 0; for (let i = 0; i < N * 4; i++) fw = Math.max(fw, Math.abs(R.frame[i] - g.gen[i]) / Math.max(1e-6, Math.abs(g.gen[i])));
        ok("!! *** section 147's bound: the compute generator on the chain's own pair is the CPU reference within 1e-5 relative, every pixel, with the same number of holes left ***",
            fw <= 1e-5 && R.holes === g.holes && !R.errs.length, `max relative ${fw.toExponential(2)}; holes ${R.holes} against ${g.holes}`);
        const g2 = interpolateFrameCPU({ prev: b.A, cur: a.A, w: W, h: W, flow: b.flow, bw: W, bh: W, block: 1, depthBlock: b.depth, indexedBy: "cur", t: 0.5, fill: { radius: 4, reach: 16, side: "blend", prefer: "farther" }, holes: "crossfade" });
        let fw2 = 0; for (let i = 0; i < N * 4; i++) fw2 = Math.max(fw2, Math.abs(R.frame2[i] - g2.frame[i]) / Math.max(1e-6, Math.abs(g2.frame[i])));
        ok("  ...a second call on the same device re-reads its inputs (the pair swapped gives the swapped answer); a frame of the wrong size is refused",
            fw2 <= 1e-5 && /two 32 x 32 x 4 frames -- got 4/.test(R.refused || ""), `max relative ${fw2.toExponential(2)}`);
    }
}

console.log("\n4. THE PAGE AND THE WORKER");
{
    const html = fs.readFileSync(path.join(ENG, "path-tracer.html"), "utf8"), wk = fs.readFileSync(path.join(ENG, "render", "frameGenChainLive-worker.mjs"), "utf8");
    ok("!! path-tracer.html has the chain view: the worker, the compute generator through createDeviceGenerator where WebGPU exists and the box is unticked, generateChainCPU otherwise, the device's frame lit by composeMid",
        /new Worker\("\/render\/frameGenChainLive-worker\.mjs", \{ type: "module" \}\)/.test(html) && /run\.gpu = createDeviceGenerator\(await requestDevice\(cv, \{ backend: "webgpu", offscreen: true \}\), LIVE_C\.W, LIVE_C\.W\)/.test(html) &&
        /if \(!\$\("fccpu"\)\.checked && navigator\.gpu\)/.test(html) && /m\.gen = \{ frame: composeMid\(g\.frame, m\), holes: g\.holes \}/.test(html) && /const g = generateChainCPU\(run\.prev, m\)/.test(html) &&
        ["fccv", "fcgen", "fccpu", "fcgo", "fcstop", "fcout"].every((id) => html.includes(`id="${id}"`)));
    ok("  ...the half-way frame made before its newer frame is handed to the pacer (genOf), and a line naming where it ran and its ms",
        /genOf: \(a, b\) => b\.gen/.test(html) && /the half-way frame generated on \$\{run\.where\} in \$\{run\.genMs\.toFixed\(1\)\} ms/.test(html) && html.indexOf("m.gen = {") < html.indexOf("run.view.real(m, run.sent, ready)"));
    ok("  the worker: the shipped denoiser checked as it loads, chainStep per frame, its buffers transferred",
        /fetch\("\/" \+ LIVE_C\.net\)/.test(wk) && /if \(!res\.ok\) throw/.test(wk) && /chainStep\(state, m\.k\)/.test(wk) && /self\.postMessage\(\{ type: "step", \.\.\.r, ms \}, xfer\)/.test(wk));
}

console.log("\n5. THE PAGE, DRIVEN");
{
    // path-tracer.html itself, in a frame at the engine's own origin: Start pressed, then read until a generated frame has been shown
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, script: `async () => {
        const f = document.createElement("iframe"); f.style.width = "1200px"; f.style.height = "900px"; f.src = "/path-tracer.html"; document.body.appendChild(f);
        await new Promise((r) => f.onload = r); const d = f.contentDocument, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 0; i < 50 && !d.getElementById("fcgo"); i++) await sleep(100);
        d.getElementById("fcgo").click(); let out = "";
        for (let i = 0; i < 240; i++) { await sleep(1000); out = d.getElementById("fcout").textContent; if (/generated [1-9]/.test(out) && /over 2 s/.test(out)) break; }
        d.getElementById("fcstop").click();
        const c = d.getElementById("fccv").getContext("2d").getImageData(0, 0, 128, 128).data; let lit = 0; for (let i = 0; i < c.length; i += 4) if (c[i] + c[i + 1] + c[i + 2] > 30) lit++;
        return { out, prog: d.getElementById("fcprog").textContent, lit, hasGpu: !!navigator.gpu };
    }` });
    if (r.skipped) ok("  the page ran (no browser here: NOT A PASS)", false, r.reason);
    else {
        const R = r.result || {}, m = /generated on (WebGPU|the CPU)[^\n]* in ([\d.]+) ms/.exec(R.out || "");
        ok("!! *** the page, driven: Start pressed, real chain frames come back from the worker, a half-way frame is generated -- on WebGPU where the browser has it -- and shown, the canvas painted, no page error ***",
            r.ok && /real frames [2-9]\d*, generated [1-9]/.test(R.out || "") && !!m && (R.hasGpu ? m[1] === "WebGPU" : true) && R.lit > 8000 && !(r.pageErrors || []).length && R.prog === "stopped",
            `${(R.out || "").replace(/\n/g, " | ").slice(0, 260)}; ${R.lit} lit pixels; ${JSON.stringify(r.pageErrors || []).slice(0, 200)}`);
    }
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: what the chain view costs per frame on a real GPU -- the page prints its own.");
process.exit(fails ? 1 : 0);
