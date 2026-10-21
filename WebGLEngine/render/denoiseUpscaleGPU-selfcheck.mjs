#!/usr/bin/env node
// WebGLEngine/render/denoiseUpscaleGPU-selfcheck.mjs -- round 31 (backlog denoise-halfres-rig-timing): round 30's
// emitter-aware chain on a device, held to its CPU references before the rig times it.
//
//   1. the CPU reference of the bounded fill (render/denoiseUpscale.mjs's fillEmittersBounded) against fillEmitters
//   2. the kernels: each validates against render/wgslSpec.mjs, and the constants they carry are the CPU's
//   3. ON THE DEVICE (Chromium's WebGPU through tools/ship/webgpuHarness.mjs -- SwiftShader here, the GPU on the rig):
//      coverage against emitterRadiance on three of round 30's R scenes, the bounded fill against fillEmittersBounded, and
//      the whole chain on one encoder against emitterAwareUpscale(..., "easu", full)
//
// The tolerances are f32 against f64 and were fixed from this file's first run on SwiftShader, which is said beside each.
//
// SABOTAGED (round 31), each by the byte-safe runner in render/denoiser-arc-handoff.md, restored, sha-256 identical. The kernels
// were then in a module of their own, render/denoiseUpscaleWgsl.mjs, since folded into the runner unchanged:
//   G1  a ring fills a pixel only with two known neighbours            2 RED (the device fill; the chain)
//   G2  the composite without (1 - cov)                                1 RED (the chain)
//   G3  the coverage kernel takes the farther root                     1 RED (coverage). 0 RED at first: no sphere overlapped
//       another, and then the far roots order as the near ones do -- the fourth scene's overlapping sphere is the fix
//   G4  the transfer records no brightest t                            1 RED (the chain)
//   G5  a pixel no ring reached keeps its value on the device          1 RED (the device fill, short of rings)
//   G6  the CPU bound leaves those pixels at their value               3 RED (the two CPU rows it states; the device fill)
//   G7  the runner does not swap the ring buffers                      2 RED (the device fill; the chain)
//   G8  EASU reads the frame before the fill                           1 RED (the chain). Its first form -- EASU bound to the
//       input buffer -- was no sabotage at all: 24 rings is an even number of swaps, so the filled frame IS that buffer
//   G9  the camera uniform's aspect inverted                           1 RED (the layout row; every frame here is square)
//   and section 4's caller, by the same runner:
//   T1  timeHalfChain's sum leaves the fill out                        1 RED (the sum row)
//   T2  the fill on the device's clock past 30 passes                  1 RED (the sum row: the fill must be the wall's)
//   T3  the page's table without the fill's row                        1 RED (the page row: 7 rows, not 8)
//   T4  the full-size page timed from the half-size row                1 RED (the sum row). 0 RED at first: nothing held which
//       ladder row each network time came from; the row now names both
//   and section 6's accumulation on the device (round 33), by the same runner:
//   X1  the accumulation kernel ignores its clamp                      3 RED (given the CPU's hits; the composite; with its own hits)
//   X2  the history lengthens by two a frame                           3 RED (the same three)
//   X3  the first hits' normal left unnormalised                       2 RED (the hits row; the accumulation with its own hits)
//   X4  the shift kernel the wrong way                                 3 RED (the three accumulation rows)
//   X5  frame 0 reprojected onto itself, not onto sky                  0 RED, AND IT IS AN EQUIVALENT MUTANT: the history starts at
//       zero with n = 0, so whatever frame 0 finds is clamped into the current range and blended at n = 0 + 1 = 1 -- the current
//       frame either way. The buffer of sky stays, so the rule is stated rather than relied on.
//   X6  the temporal sum without the composite                         1 RED (the timing sum row)
//   X7  the position tolerance at 30 footprints                        2 RED (the constants row; the uniform's layout row, which
//       reads the tolerance at its offset). 0 RED at first: on smooth spheres
//       a looser tolerance turns no tap valid; the row holding the kernel's constants to round 4's is the fix
//   and section 5's verdict (section 94), by the same runner:
//   V1  the rule asks one GPU, not both                                1 RED (the rule row)
//   V2  a run counts at any commit                                     1 RED (the rule row: a stale run must leave it owed)
//   V3  H holding at 0.9 x                                             1 RED (the rule row)
//   V4  C2 dropped -- any ring count                                   1 RED (the rule row). 0 RED at first: no fixture's fill
//       used all 96 rings; one does now
//   V5  the Intel's predicted range widened to 1.3                     1 RED (the predictions row)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInEngineOrigin } from "../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "./wgslSpec.mjs";
import { COVERAGE_WGSL, FILL_RING_WGSL, FILL_LEFT_WGSL, TO_T_WGSL, COMPOSITE_WGSL, COVERAGE_GRID_WGSL, SPHERE_STRIDE, packSpheres, cameraUniform, DenoiseUpscaleGPU, TEMPORAL_CONSTANTS, GEO_STRIDE, FIRSTHITS_WGSL, SHIFT_WGSL, ACCUM_WGSL, FINAL_WGSL, accumUniform, packGeometry } from "./denoiseUpscaleGPU.mjs";
import { fillEmitters, fillEmittersBounded, emitterAwareUpscale, GAMMA } from "./denoiseUpscale.mjs";
import { emitterRadiance, COVERAGE_GRID } from "./denoiseMask.mjs";
import { makeScene } from "./denoiseScenes.mjs";
import { gateReport } from "../tools/ship/gateReport.mjs";
const REPORT = gateReport("render/denoiseUpscaleGPU-selfcheck.mjs");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);

let sd = 31;
const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
/** A w x h rgb frame of smooth light with grain, and a coverage of round discs (radius in pixels) -- the fill's shapes. */
function synth(w, h, discs) {
    const img = new Float64Array(w * h * 3), cov = new Float64Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = y * w + x;
        for (let c = 0; c < 3; c++) img[p * 3 + c] = 0.2 + 0.6 * (x / w) * (c + 1) / 3 + 0.3 * (y / h) + 0.05 * rnd();
        for (const [cx, cy, r] of discs) {
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
            if (d < r) { cov[p] = Math.min(1, Math.max(cov[p], r - d)); for (let c = 0; c < 3; c++) img[p * 3 + c] = 20 + c; }
        }
    }
    return { img, cov };
}
const maxRel = (a, b, floor = 1e-3) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]) / (Math.abs(b[i]) + floor)); return m; };

console.log("denoiseUpscaleGPU-selfcheck -- round 30's emitter-aware chain on a device, against its CPU references\n");

console.log("1. THE BOUNDED FILL'S CPU REFERENCE");
const F1 = synth(24, 20, [[6, 6, 3.2], [17, 13, 5.5], [23, 1, 2]]);
{
    const full = fillEmitters(F1.img, F1.cov, 24, 20), b = fillEmittersBounded(F1.img, F1.cov, 24, 20, 16);
    ok("!! with rings to spare, fillEmittersBounded is fillEmitters value for value, and leaves nothing",
        b.left === 0 && b.rings > 2 && b.rings < 16 && b.y.every((v, i) => Object.is(v, full[i])), `${b.rings} rings, ${b.left} left`);
    const s = fillEmittersBounded(F1.img, F1.cov, 24, 20, 2);
    const unknown = F1.cov.reduce((k, c) => k + (c > 0 ? 1 : 0), 0);
    ok("  ...and short of rings it stops there: 2 rings, the rest left at 0 -- never an emitter's radiance",
        s.rings === 2 && s.left > 0 && s.left < unknown && [...Array(24 * 20).keys()].every((p) => F1.cov[p] === 0 || s.y[p * 3] < 20),
        `${s.left} of ${unknown} emitter pixels left`);
    const all = fillEmittersBounded(new Float64Array(12).fill(5), new Float64Array(4).fill(1), 2, 2, 4);
    ok("  ...a frame that is all emitter leaves every pixel, at 0, and refuses no call", all.rings === 0 && all.left === 4 && all.y.every((v) => v === 0));
    let threw = 0;
    for (const m of [-1, 1.5, NaN]) try { fillEmittersBounded(F1.img, F1.cov, 24, 20, m); } catch { threw++; }
    ok("  ...and a ring count that is not a whole number is refused", threw === 3);
}

console.log("\n2. THE KERNELS");
{
    const ks = { COVERAGE_WGSL, FILL_RING_WGSL, FILL_LEFT_WGSL, TO_T_WGSL, COMPOSITE_WGSL, FIRSTHITS_WGSL, SHIFT_WGSL, ACCUM_WGSL, FINAL_WGSL };
    const bad = Object.entries(ks).map(([k, s]) => [k, validateWgsl(s)]).filter(([, p]) => p.length);
    ok("every kernel validates against the spec scanner", !bad.length, bad.map(([k, p]) => `${k}: ${p.join("; ")}`).join(" | "));
    ok("  the constants the kernels carry are the CPU's: the coverage grid, the transfer's gamma, its top below the pole",
        COVERAGE_GRID_WGSL === COVERAGE_GRID && GAMMA === 2.2 && /pow\(v \/ \(1\.0 \+ v\), 1\.0 \/ 2\.2\)/.test(TO_T_WGSL) && /pow\(tt, 2\.2\)/.test(COMPOSITE_WGSL) &&
        /1\.0 - 5\.9604645e-8/.test(COMPOSITE_WGSL) && Math.abs(5.9604645e-8 - 2 ** -24) < 1e-14 && /> 1e-6/.test(COVERAGE_WGSL),
        `grid ${COVERAGE_GRID_WGSL} against ${COVERAGE_GRID}; gamma ${GAMMA}`);
    const S = makeScene("R", 44001), sp = packSpheres(S.scene), em = S.scene.findIndex((s) => s.emit);
    ok("  a scene packs as SPHERE_STRIDE floats a sphere, its emitter flagged and its emission spread to rgb",
        SPHERE_STRIDE === 8 && sp.length === S.scene.length * 8 && sp[em * 8 + 7] === 1 && sp[7] === 0 && sp[em * 8 + 4] === Math.fround(typeof S.scene[em].emit === "number" ? S.scene[em].emit : S.scene[em].emit[0]));
    let mesh = null; try { packSpheres([{ bvh: {} }]); } catch (e) { mesh = e.message; }
    ok("  ...and a scene with a mesh is refused by name -- the coverage kernel intersects spheres only", /spheres only/.test(mesh || ""));
    // round 33: the accumulation's uniform (two cameras, then w h clamp frames, then the scales and tolerances) and the packed geometry
    const au = new DataView(accumUniform(S, S.eye, S.eye, 32, 24).buffer), pg0 = packGeometry({ pos: [1, 2, 3], nrm: [0, 1, 0], obj: [4] }, 1);
    ok("  round 33: the accumulation's uniform is the kernel's struct (five vec4, w h clamp frames, then prevScale aspect curScale posTol normalDot), and a pixel's geometry packs as GEO_STRIDE floats",
        au.byteLength === 128 && au.getUint32(80, true) === 32 && au.getUint32(84, true) === 24 && au.getUint32(88, true) === 1 && au.getUint32(92, true) === 8 &&
        Math.abs(au.getFloat32(100, true) - 32 / 24) < 1e-6 && au.getFloat32(108, true) === 3 && Math.abs(au.getFloat32(112, true) - 0.9) < 1e-7 &&
        pg0.length === GEO_STRIDE && pg0[0] === 1 && pg0[4] === 1 && pg0[6] === 4);
    const cu = new DataView(cameraUniform(S, 32, 24, 6).buffer);
    ok("  the camera uniform's layout is the kernel's struct: four vec4, w h nSph grid, scale and aspect",
        cu.byteLength === 96 && cu.getUint32(64, true) === 32 && cu.getUint32(68, true) === 24 && cu.getUint32(72, true) === 6 && cu.getUint32(76, true) === 8 &&
        Math.abs(cu.getFloat32(84, true) - 32 / 24) < 1e-6);
}

console.log("\n3. ON THE DEVICE");
// three of round 30's R images with an emitter in view (section 92: 44001, 44002, 44004), at 64 x 64 full and 32 x 32 half,
// and a fourth, built by hand: one sphere between the camera and the light, covering part of it, and one OVERLAPPING the light.
// Sabotage G3 (the coverage kernel taking the farther root) went 0 RED on the three R scenes and on the first draft of this
// one, which had the in-front sphere alone: where spheres do not overlap, their far roots come in the same order as their
// near ones, so the nearest sphere -- all coverage asks -- never changes. The arc's scenes keep their spheres apart, so on
// them G3 is no change at all; the overlapping sphere is here so the kernel is held to the root rule anyway (measured on
// the CPU at 32 x 32: 1,806 rays reach the light with the near root, 1,832 with the far one).
const OCCLUDED = { seed: "occluded", eye: [0, 1.5, 5], look: [0, 1.5, 0], up: [0, 1, 0], fovDeg: 40, scene: [
    { centre: [0, -100, 0], radius: 100, albedo: [0.5, 0.5, 0.5] },
    { centre: [0, 1.5, 0], radius: 0.6, albedo: 0, emit: [12, 10, 8] },
    { centre: [-0.35, 1.5, 2.2], radius: 0.3, albedo: [0.6, 0.6, 0.6] },
    { centre: [0.35, 1.5, 0.5], radius: 0.6, albedo: [0.6, 0.6, 0.6] }] };
const SCENES = [...[44001, 44002, 44004].map((s) => makeScene("R", s)), OCCLUDED];
const W = 64, Hh = 32, wire = (S) => ({ scene: S.scene, eye: S.eye, look: S.look, up: S.up, fovDeg: S.fovDeg });
const CPU = SCENES.map((S) => ({ full: emitterRadiance(S, W, W), half: emitterRadiance(S, Hh, Hh) }));
// each chain's input: smooth light, and the emitters' own radiance where they cover a pixel -- what a traced frame holds there
const chainIn = CPU.map(({ half }) => {
    const img = new Float64Array(Hh * Hh * 3);
    for (let p = 0; p < Hh * Hh; p++) for (let c = 0; c < 3; c++) img[p * 3 + c] = half.E[p * 3 + c] + (1 - half.cov[p]) * (0.1 + 0.5 * ((p % Hh) / Hh) + 0.2 * c * Math.floor(p / Hh) / Hh);
    return img;
});
const RINGS = 24;
const payload = { scenes: SCENES.map(wire), fill: { img: Array.from(F1.img), cov: Array.from(F1.cov) }, chainIn: chainIn.map((a) => Array.from(a)),
    covHalf: CPU.map((c) => Array.from(c.half.cov)), full: CPU.map((c) => ({ cov: Array.from(c.full.cov), E: Array.from(c.full.E) })), W, Hh, RINGS };
const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 900000, args: { payload }, script: `async (a) => {
    const P = a.payload;
    const { requestDevice } = await import("/gfx/device.js");
    const { DenoiseUpscaleGPU } = await import("/render/denoiseUpscaleGPU.mjs");
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    const errs = [];
    if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
    const g = new DenoiseUpscaleGPU(dev), A = (x) => Array.from(x);
    const cov = [];
    for (const S of P.scenes) { const f = await g.coverage(S, P.W, P.W), h = await g.coverage(S, P.Hh, P.Hh); cov.push({ full: { cov: A(f.cov), E: A(f.E) }, half: { cov: A(h.cov), E: A(h.E) } }); }
    const fills = [];
    for (const m of [16, 2]) { const f = await g.fill(Float64Array.from(P.fill.img), Float64Array.from(P.fill.cov), 24, 20, m); fills.push({ ...f, y: A(f.y) }); }
    const chains = [];
    for (let i = 0; i < P.chainIn.length; i++) {
        const c = await g.chain(Float64Array.from(P.chainIn[i]), Float64Array.from(P.covHalf[i]), P.Hh, P.Hh, P.W, P.W,
            { cov: Float64Array.from(P.full[i].cov), E: Float64Array.from(P.full[i].E) }, P.RINGS);
        chains.push({ ...c, y: A(c.y) });
    }
    let wrongBackend = null;
    try { new DenoiseUpscaleGPU(await requestDevice(document.createElement("canvas"), { backend: "webgl2", offscreen: true })); } catch (e) { wrongBackend = String(e.message).slice(0, 160); }
    const ad = await navigator.gpu.requestAdapter(), info = ad.info || {};
    return { cov, fills, chains, errs, backend: dev.backend, wrongBackend, adapter: [info.vendor, info.architecture, info.description].filter(Boolean).join(" / ") };
}` });

if (r.skipped) console.log("  SKIP  " + r.reason);
else if (!r.ok) ok("!! the device ran the chain", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 400)}`);
else {
    const R = r.result;
    say(`adapter: ${R.adapter || "unnamed"}; backend ${R.backend}`);
    ok("  the device ran with no uncaptured WebGPU error, and the runner refuses a WebGL2 device by name",
        !R.errs.length && /webgpu backend/.test(R.wrongBackend || ""), R.errs.join("; ") || (R.wrongBackend || "").slice(0, 100));
    // COVERAGE: rays are counted, so a difference is a whole ray. f32 against f64 can flip a ray that grazes a silhouette.
    // First run on SwiftShader: one ray different over all six frames (R 44001 at half size), E within 3.8e-7 where the count
    // agreed. Held at no more than 1 in 10,000 of a frame's rays, and E within 1e-5.
    const cmp = R.cov.flatMap((g, i) => [["full", W, CPU[i].full, g.full], ["half", Hh, CPU[i].half, g.half]].map(([k, n, c, d]) => {
        let rays = 0, eMax = 0, inView = 0;
        for (let p = 0; p < n * n; p++) {
            rays += Math.abs(Math.round(c.cov[p] * 64) - Math.round(d.cov[p] * 64));
            if (c.cov[p] > 0) inView++;
            if (Math.round(c.cov[p] * 64) === Math.round(d.cov[p] * 64)) for (let ch = 0; ch < 3; ch++) eMax = Math.max(eMax, Math.abs(c.E[p * 3 + ch] - d.E[p * 3 + ch]) / (Math.abs(c.E[p * 3 + ch]) + 1e-6));
        }
        return { k: `R ${SCENES[i].seed} ${k}`, rays, eMax, inView, budget: Math.floor(n * n * 64 / 10000) };
    }));
    ok("!! coverage on the device is emitterRadiance's: per frame, no more rays different than 1 in 10,000, and E within 1e-5 where the count agrees -- on frames with an emitter in view",
        cmp.length === 8 && cmp.every((c) => c.rays <= c.budget && c.eMax <= 1e-5) && cmp.every((c) => c.inView > 0),
        cmp.map((c) => `${c.k}: ${c.rays} ray(s) (of ${c.budget} allowed), E ${c.eMax.toExponential(1)}, ${c.inView} px in view`).join("; "));
    // THE FILL: each ring's mean in f32 against f64. First run: worst relative difference 1.2e-7. Held at 1e-5.
    const b16 = fillEmittersBounded(F1.img, F1.cov, 24, 20, 16), b2 = fillEmittersBounded(F1.img, F1.cov, 24, 20, 2), [g16, g2] = R.fills;
    ok("!! the bounded fill on the device is fillEmittersBounded's: the same rings and pixels left, and every value within 1e-5 -- with rings to spare and short of them",
        g16.rings === b16.rings && g16.left === b16.left && g2.rings === b2.rings && g2.left === b2.left && maxRel(g16.y, b16.y) <= 1e-5 && maxRel(g2.y, b2.y) <= 1e-5,
        `16: ${g16.rings} rings, ${g16.left} left, worst ${maxRel(g16.y, b16.y).toExponential(1)}; 2: ${g2.rings} rings, ${g2.left} left, worst ${maxRel(g2.y, b2.y).toExponential(1)}; per ring ${g16.perRing.slice(0, g16.rings + 1).join(",")}`);
    // THE CHAIN: against emitterAwareUpscale(..., "easu", full) -- the f64 chain round 30 measured. EASU in f32 against the CPU's
    // f64, through the transfer's inverse, which stretches a difference near the frame's brightest t. First run: worst 2.3e-6.
    // Held at 1e-3, relative with a floor of 1e-3.
    const ref = chainIn.map((img, i) => emitterAwareUpscale(img, CPU[i].half.cov, Hh, Hh, W, W, "easu", CPU[i].full));
    const ch = R.chains.map((c, i) => ({ k: `R ${SCENES[i].seed}`, rel: maxRel(c.y, ref[i]), rings: c.rings, left: c.left }));
    ok("!! the whole chain on one encoder -- bounded fill, transfer, EASU, inverse, composite -- is emitterAwareUpscale's with EASU, within 1e-3, every emitter pixel reached",
        ch.length === 4 && ch.every((c) => c.rel <= 1e-3 && c.left === 0 && c.rings > 0 && c.rings < RINGS),
        ch.map((c) => `${c.k}: worst ${c.rel.toExponential(1)}, ${c.rings} rings, ${c.left} left`).join("; "));
}

console.log("\n4. THE CALLER: denoise.html's \"Time the half-size chain\", at its pilot size, in Chromium");
{
    const drive = (size, ms) => runInEngineOrigin({ engineRoot: ENG, timeoutMs: ms + 60000, args: { size, ms }, script: `async (a) => {
        const f = document.createElement("iframe"); f.style.width = "1200px"; f.style.height = "900px"; f.src = "/denoise.html"; document.body.appendChild(f);
        await new Promise((r) => f.onload = r);
        const d = f.contentDocument, $ = (id) => d.getElementById(id), wait = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 0; i < 100 && !$("chain"); i++) await wait(50);
        $("chainSize").value = a.size; $("chain").click();
        const t = Date.now();
        while (Date.now() - t < a.ms && ($("chain").disabled || !$("chainJson").textContent) && !/failed|no WebGPU/.test($("chainStatus").textContent)) await wait(100);
        return { status: $("chainStatus").textContent, json: $("chainJson").textContent, shown: $("chainTable").style.display !== "none", rows: $("chainTable").querySelectorAll("tbody tr").length };
    }` });
    const pg = await drive("128x72", 540000);
    if (pg.skipped) console.log("  SKIP  " + pg.reason);
    else {
        let J = null; try { J = JSON.parse(pg.result?.json || "null"); } catch {}
        const st = J && J.chain && J.chain.steps, keys = ["covHalf", "covFull", "fill", "rest", "whole", "hits", "shift", "accum", "final"];
        const fine = (x) => !!x && Number.isFinite(x.ms) && x.ms > 0 && (x.clock === "device" || x.clock === "wall");
        ok("!! the page timed every step of the chain and both networks at its pilot size -- each a positive time on a named clock, the table shown, no page error",
            pg.ok && !!st && keys.every((k) => fine(st[k])) && fine(J.networkFull) && fine(J.networkHalf) && !!J.full && !!J.half && !!J.temporal && pg.result.shown && pg.result.rows === 11 && !pg.pageErrors.length,
            pg.ok ? (pg.result?.status || "").slice(0, 200) : pg.reason);
        if (st) {
            // the network times are the ladder's rows, w x h then W x H (T4 went 0 RED before this held which was which); today's page
            // is the full-size network and its mask, the chain the half-size network and every step
            const [halfRow, fullRow] = J.ladder.rows[J.kernels], med = (x) => (x.gpu ? x.gpu.median : x.wall.median);
            const parts = J.half ? J.half.ms : NaN, sum = med(halfRow) + ["covHalf", "covFull", "fill", "rest"].reduce((a, k) => a + st[k].ms, 0);
            ok("  ...the chain in all is the half-size network plus the four steps, today's page the full-size network and its mask, each network its own ladder row, the fill by the wall clock, on scene R 990000 with its light in view, every ring budgeted and some used",
                Math.abs(parts - sum) < 1e-9 && st.fill.clock === "wall" && fullRow.W === 128 && fullRow.H === 72 && halfRow.W === 64 && halfRow.H === 36 &&
                J.networkFull.ms === med(fullRow) && J.networkHalf.ms === med(halfRow) && Math.abs(J.full.ms - (med(fullRow) + st.covFull.ms)) < 1e-9 && st.whole.clock === "wall" && J.chain.maxRings === 96 && J.chain.rings > 0 && J.chain.rings < 96 &&
                J.chain.inView > 0 && JSON.stringify(J.scene) === JSON.stringify(["R", 990000]) && J.chain.W === 128 && J.chain.w === 64,
                `${J.chain.rings} of 96 rings filled; ${J.chain.inView} px in view at 64 x 36; ${keys.map((k) => `${k} ${st[k].ms.toFixed(2)} ms (${st[k].clock})`).join(", ")}`);
            // round 33: the chain with its history is the chain and round 32's four passes, each one pass on the device's clock where it has one
            const hist = ["hits", "shift", "accum", "final"];
            ok("  round 33: the chain with its history is the half-size chain plus the history's four passes -- first hits, shift, accumulation, composite -- each one pass, on the device's clock where the device has one",
                !!J.temporal && Math.abs(J.temporal.ms - (J.half.ms + hist.reduce((a, k) => a + st[k].ms, 0))) < 1e-9 && hist.every((k) => st[k].clock === st.covHalf.clock),
                hist.map((k) => `${k} ${st[k].ms.toFixed(2)} ms (${st[k].clock})`).join(", "));
        }
        // ON A GPU, THE RIG'S SIZE (pre-registration section 93): 960 x 540 -> 1920 x 1080, every step a measured line the rig's
        // report keeps. Not on a software adapter: SwiftShader's 1080p would be minutes of a CPU's time that decides nothing.
        // SWEK_HALFCHAIN_RIGSIZE=1 runs it on any adapter -- how its plumbing was driven here once, on SwiftShader
        if (J && J.ladder.adapter.software && process.env.SWEK_HALFCHAIN_RIGSIZE !== "1") console.log(`  SKIP  the rig's size, 1920 x 1080: ${J.ladder.adapter.name} is a software adapter -- section 93 reads a GPU's`);
        else if (J) {
            const rg = await drive("1920x1080", 1500000);
            let K = null; try { K = JSON.parse(rg.result?.json || "null"); } catch {}
            const ks = K && K.chain && K.chain.steps;
            ok("!! section 93: at 1920 x 1080 the page timed both networks and every step of the chain, the fill reaching every pixel in its 96 rings",
                rg.ok && !!ks && keys.every((k) => fine(ks[k])) && fine(K.networkFull) && fine(K.networkHalf) && !!K.full && !!K.half && !!K.temporal && K.chain.rings > 0 && K.chain.rings < 96 && !rg.pageErrors.length,
                rg.ok ? (rg.result?.status || "").slice(0, 200) : rg.reason);
            if (ks) {
                const row = (x) => (x.skipped ? `not measured (${x.reason})` : `${(x.gpu ? x.gpu.median : x.wall.median).toFixed(3)} ms (${x.gpu ? "device" : "wall"})`), [lh, lf] = K.ladder.rows[K.kernels];
                say(`section 93: ${K.ladder.adapter.name}, kernels ${K.kernels}; the network at 1920 x 1080 ${row(lf)}, at 960 x 540 ${row(lh)}; ` +
                    (K.full && K.half ? `today's page (network and mask) ${K.full.ms.toFixed(3)} ms (${K.full.clocks.join(" + ")}); the half-size chain ${K.half.ms.toFixed(3)} ms (${K.half.clocks.join(" + ")}); ratio ${(K.full.ms / K.half.ms).toFixed(3)} x` : "no ratio: a part was not measured"));
                say("section 93: the chain's steps -- " + ["covHalf", "covFull", "fill", "rest", "whole"].map((k) => `${k} ${fine(ks[k]) ? ks[k].ms.toFixed(3) + " ms (" + ks[k].clock + ")" : "not measured"}`).join("; ") +
                    `; ${K.chain.rings} of 96 rings filled`);
                // round 33 (section 97): the history's passes and the chain with them, in a line of their own -- section 94 reads the two above
                say("section 97: the history's passes -- " + ["hits", "shift", "accum", "final"].map((k) => `${k} ${fine(ks[k]) ? ks[k].ms.toFixed(3) + " ms (" + ks[k].clock + ")" : "not measured"}`).join("; ") +
                    (K.full && K.temporal ? `; the half-size chain with its history ${K.temporal.ms.toFixed(3)} ms (${K.temporal.clocks.join(" + ")}); ratio ${(K.full.ms / K.temporal.ms).toFixed(3)} x` : "; no ratio: a part was not measured"));
            }
        }
    }
}

console.log("\n5. SECTION 94: ROUND 31'S VERDICT, RE-DERIVED FROM THE FOUR REPORTS AS COMMITTED");
{
    // the commits that carry section 93 and that the rig ran: 1c60b346 brought it, 77aaece5 added one sentence to it
    const SECTION93_COMMITS = Object.freeze(["1c60b346", "77aaece5"]);
    const GPUS = { "intel-gen9": "intel / gen-9", gtx1080: "nvidia / pascal" };
    const num = (re, t) => { const m = t.match(re); return m ? Number(m[1]) : null; };
    // one report: its commit, every gate's verdict, and the two section-93 lines of the chain's gate, read back to numbers
    const readRun = (rep) => {
        const g = rep.gates.find((x) => x.gate === "render/denoiseUpscaleGPU-selfcheck.mjs"), m = (g && g.measured) || [];
        const a = m.find((l) => /^section 93: .*kernels/.test(l)) || "", b = m.find((l) => /^section 93: the chain's steps/.test(l)) || "";
        const step = (k) => ({ ms: num(new RegExp(`${k} ([0-9.]+) ms`), b), clock: (b.match(new RegExp(`${k} [0-9.]+ ms \\((\\w+)\\)`)) || [])[1] || null });
        return { commit: String(rep.commit || "").slice(0, 8), allGreen: rep.gates.length === 4 && rep.gates.every((x) => x.ok), adapter: (a.match(/^section 93: ([^,]+),/) || [])[1] || null,
            kernels: (a.match(/kernels (\w+);/) || [])[1] || null,
            netFull: { ms: num(/1920 x 1080 ([0-9.]+) ms/, a), clock: (a.match(/1920 x 1080 [0-9.]+ ms \((\w+)\)/) || [])[1] || null },
            netHalf: { ms: num(/at 960 x 540 ([0-9.]+) ms/, a), clock: (a.match(/at 960 x 540 [0-9.]+ ms \((\w+)\)/) || [])[1] || null },
            full: num(/today's page \(network and mask\) ([0-9.]+) ms/, a), half: num(/the half-size chain ([0-9.]+) ms/, a), ratio: num(/ratio ([0-9.]+) x/, a),
            covHalf: step("covHalf"), covFull: step("covFull"), fill: step("fill"), rest: step("rest"), whole: step("whole"),
            rings: num(/; (\d+) of 96 rings filled/, b) };
    };
    // section 93's rule: a run counts when it is at a commit carrying section 93, every gate is green (C1), the fill reached every
    // pixel and filled on fewer than 96 rings (C2), and both networks are on the device's clock (C3); H holds on a GPU when both
    // its runs count and the ratio, re-made from the two times, is above 1.0 in each
    const counts = (r) => SECTION93_COMMITS.includes(r.commit) && r.allGreen && r.rings > 0 && r.rings < 96 && r.netFull.clock === "device" && r.netHalf.clock === "device" &&
        [r.full, r.half, r.ratio].every((v) => Number.isFinite(v) && v > 0) && Math.abs(r.full / r.half - r.ratio) < 0.002;
    const H = (runs) => (runs.length === 2 && runs.every(counts) ? (runs.every((r) => r.full / r.half > 1) ? "holds" : "fails") : "no verdict");
    const rule94 = (byGpu) => { const v = Object.values(byGpu).map(H); return v.every((x) => x === "holds") ? "fsr2-temporal" : v.includes("no verdict") ? "owed again" : "name the steps"; };
    const R = {};
    for (const g of Object.keys(GPUS)) R[g] = ["a", "b"].map((k) => readRun(JSON.parse(fs.readFileSync(path.join(ENG, "render", `denoise-rig-r31-${k}-${g}.json`), "utf8"))));
    const all = Object.values(R).flat();
    ok("!! section 94: the four reports read back -- each at a commit carrying section 93, on its GPU's adapter and the page's kernel set for it, every gate green, the fill short of its 96 rings, both networks on the device's clock",
        Object.entries(R).every(([g, rs]) => rs.every((r) => counts(r) && r.adapter === GPUS[g] && r.kernels === (g === "gtx1080" ? "r18t" : "r18u"))),
        all.map((r) => `${r.adapter} ${r.commit}: ${r.kernels}, ${r.rings} rings, ratio ${r.ratio}`).join("; "));
    const slow = (rs, i) => rs.map((r, j) => (j === i ? { ...r, half: r.full * 1.01, ratio: Math.round(100000 / 1.01) / 100000 } : r));
    const stale = (rs) => rs.map((r, j) => (j === 0 ? { ...r, commit: "502091b1" } : r));
    // and a run whose fill used every ring: C2 then cannot say every pixel was reached (V4 went 0 RED before this fixture)
    const full96 = (rs) => rs.map((r, j) => (j === 0 ? { ...r, rings: 96 } : r));
    ok("!! *** section 94's rule, as section 93 fixed it: the chain cheaper than today's page in both runs on both GPUs -- so denoise-fsr2-temporal is the arc's next round ***",
        H(R["intel-gen9"]) === "holds" && H(R.gtx1080) === "holds" && rule94(R) === "fsr2-temporal" &&
        rule94({ ...R, gtx1080: slow(R.gtx1080, 1) }) === "name the steps" && rule94({ ...R, "intel-gen9": stale(R["intel-gen9"]) }) === "owed again" && rule94({ ...R, gtx1080: full96(R.gtx1080) }) === "owed again" && H(R.gtx1080.slice(0, 1)) === "no verdict",
        Object.entries(R).map(([g, rs]) => `${g}: ${rs.map((r) => (r.full / r.half).toFixed(3)).join(" and ")} x`).join("; "));
    // the predictions, read off the reports: they decided nothing, and section 94 says which held
    const within = (rs, f, lo, hi) => rs.every((r) => f(r) >= lo && f(r) <= hi);
    const I = R["intel-gen9"], N = R.gtx1080, cov = (r) => r.covHalf.ms + r.covFull.ms;
    const P = { ratio1080: within(N, (r) => r.ratio, 1.4, 3.0), ratioIntel: within(I, (r) => r.ratio, 2.0, 4.0), net1080: within(N, (r) => r.netHalf.ms, 18, 25),
                cov1080: within(N, cov, 1, 10), fill1080: within(N, (r) => r.fill.ms, 3, 15), rest1080: within(N, (r) => r.rest.ms, 1, 3), rings: all.every((r) => r.rings === 87) };
    ok("  section 94's account of section 93's predictions: the 1080's ratio, its half-size network, its last three passes and the 87 rings held; the Intel's ratio, and the 1080's coverage and fill, did not",
        P.ratio1080 && P.net1080 && P.rest1080 && P.rings && !P.ratioIntel && !P.cov1080 && !P.fill1080 && all.every((r) => r.fill.clock === "wall" && r.whole.clock === "wall" && r.covFull.clock === "device"),
        `Intel ratio ${I.map((r) => r.ratio).join(", ")} (2.0-4.0 predicted); 1080 coverage ${N.map((r) => cov(r).toFixed(1)).join(", ")} ms (1-10), fill ${N.map((r) => r.fill.ms).join(", ")} ms (3-15)`);
    // reported: what the chain's own steps cost against the half-size network they sit beside
    for (const [g, rs] of Object.entries(R)) say(`section 94, ${g}: the network at 960 x 540 ${rs.map((r) => r.netHalf.ms.toFixed(1)).join(" / ")} ms; the chain's own steps (both coverages, the fill, the rest) ${rs.map((r) => (r.half - r.netHalf.ms).toFixed(1)).join(" / ")} ms -- reported, deciding nothing`);
}

console.log("\n6. ROUND 33: ROUND 32'S ACCUMULATION ON THE DEVICE, AGAINST render/denoiseTemporalUpscale.mjs");
{
    const { firstHits: hitsCPU, cameraPath } = await import(pathToFileURL(path.join(ENG, "render", "denoiseTemporal.mjs")).href);
    const { accumulateUpscaled, JITTER, halfShift } = await import(pathToFileURL(path.join(ENG, "render", "denoiseTemporalUpscale.mjs")).href);
    const { compositeEmitters } = await import(pathToFileURL(path.join(ENG, "render", "denoiseUpscale.mjs")).href);
    // the constants the accumulation kernel carries are round 4's, exactly (X7 -- the position tolerance at 30 -- went 0 RED before this
    // row: on a sequence of smooth spheres a looser tolerance turns no tap valid that 3 footprints did not)
    const RT = await import(pathToFileURL(path.join(ENG, "render", "denoiseTemporal.mjs")).href);
    ok("  round 33: the accumulation kernel's constants are render/denoiseTemporal.mjs's -- POS_TOL, NORMAL_DOT and FRAMES -- and its geometry is GEO_STRIDE floats a pixel",
        TEMPORAL_CONSTANTS.posTol === RT.POS_TOL && TEMPORAL_CONSTANTS.normalDot === RT.NORMAL_DOT && TEMPORAL_CONSTANTS.frames === RT.FRAMES && GEO_STRIDE === 8 && Object.isFrozen(TEMPORAL_CONSTANTS),
        JSON.stringify(TEMPORAL_CONSTANTS));
    const N = 64, S = makeScene("R", 990000), eyes = cameraPath(S).eyes, geo = eyes.map((e) => hitsCPU(S, e, N, N)), full = emitterRadiance(S, N, N);
    let sd2 = 77; const r2 = () => (sd2 = (sd2 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    // each frame smooth light with grain, on its jittered grid -- the shape of an upscaled frame, cost and content aside
    const frames = eyes.map((_, f) => ({ y: Float64Array.from({ length: N * N * 3 }, (_, i) => 0.3 + 0.4 * ((i / 3 | 0) % N) / N + 0.1 * (i % 3) + 0.05 * r2()), shift: halfShift(JITTER[f]) }));
    const ref = accumulateUpscaled(frames, geo, N, N), refNo = accumulateUpscaled(frames, geo, N, N, { clamp: false }), refY = compositeEmitters(ref.A, full);
    const wireS = { scene: S.scene, eye: S.eye, look: S.look, up: S.up, fovDeg: S.fovDeg };
    const A = (x) => Array.from(x), g64 = geo.map((g) => ({ pos: A(g.pos), nrm: A(g.nrm), obj: A(g.obj) }));
    const pl = { S: wireS, eyes, N, frames: frames.map((f) => ({ y: A(f.y), shift: f.shift })), geo: g64, full: { cov: A(full.cov), E: A(full.E) } };
    const q = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 600000, args: { pl }, script: `async (a) => {
        const P = a.pl, { requestDevice } = await import("/gfx/device.js"), { DenoiseUpscaleGPU } = await import("/render/denoiseUpscaleGPU.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true }), errs = [];
        if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const g = new DenoiseUpscaleGPU(dev), A = (x) => Array.from(x), fr = P.frames.map((f) => ({ y: Float64Array.from(f.y), shift: f.shift }));
        const hits = []; for (const e of [P.eyes[0], P.eyes[P.eyes.length - 1]]) { const h = await g.firstHits(P.S, e, P.N, P.N); hits.push({ pos: A(h.pos), nrm: A(h.nrm), obj: A(h.obj) }); }
        const geo = P.geo.map((x) => ({ pos: Float64Array.from(x.pos), nrm: Float64Array.from(x.nrm), obj: Int32Array.from(x.obj) })), full = { cov: Float64Array.from(P.full.cov), E: Float64Array.from(P.full.E) };
        const withCpuGeo = await g.accumulate(P.S, P.eyes, fr, P.N, P.N, { geo, full }), noClamp = await g.accumulate(P.S, P.eyes, fr, P.N, P.N, { geo, clamp: false });
        const ownGeo = await g.accumulate(P.S, P.eyes, fr, P.N, P.N, { full });
        const pk = (r) => ({ A: A(r.A), n: A(r.n), y: A(r.y) });
        return { hits, withCpuGeo: pk(withCpuGeo), noClamp: pk(noClamp), ownGeo: pk(ownGeo), errs };
    }` });
    if (q.skipped) console.log("  SKIP  " + q.reason);
    else if (!q.ok) ok("!! round 33: the device ran the accumulation", false, `${q.reason || "no result"} ${JSON.stringify(q.pageErrors || []).slice(0, 300)}`);
    else {
        const Q = q.result;
        // FIRST HITS: an object index differing is a ray that went to another sphere; f32 against f64 can flip one at a silhouette.
        // First run on SwiftShader: no flip at either eye, position and normal within 1.7e-4 (relative to 1 + |x|) -- the ground is a
        // sphere of radius 100, and its ray-sphere arithmetic cancels in f32. Held at 1 in 1,000 pixels and 1e-3.
        const hitCmp = Q.hits.map((h, k) => { const c = geo[k ? geo.length - 1 : 0]; let flips = 0, worst = 0;
            for (let p = 0; p < N * N; p++) { if (h.obj[p] !== c.obj[p]) { flips++; continue; } if (c.obj[p] < 0) continue;
                for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(h.pos[p * 3 + i] - c.pos[p * 3 + i]) / (1 + Math.abs(c.pos[p * 3 + i])), Math.abs(h.nrm[p * 3 + i] - c.nrm[p * 3 + i])); }
            return { flips, worst }; });
        ok("!! round 33: the device's first hits are render/denoiseTemporal.mjs's -- the same sphere at all but 1 in 1,000 pixels, position and normal within 1e-3 where it agrees",
            !Q.errs.length && hitCmp.every((h) => h.flips <= N * N / 1000 && h.worst <= 1e-3), hitCmp.map((h, k) => `eye ${k ? "last" : "first"}: ${h.flips} flip(s), worst ${h.worst.toExponential(1)}`).join("; ") + (Q.errs.length ? "; " + Q.errs[0] : ""));
        // the history length n is a weighted sum of the taps' lengths, so it is fractional and f32 moves it: first run, within 3.1e-5
        // given the CPU's hits and 5.1e-5 with the device's own; the light within 5.5e-7 and 2.6e-6. Held at 1e-4 and 1e-5 / 1e-3.
        const cmp = (d, r) => { let nDiff = 0, worst = 0, nWorst = 0; for (let p = 0; p < N * N; p++) { nWorst = Math.max(nWorst, Math.abs(d.n[p] - r.n[p])); if (Math.abs(d.n[p] - r.n[p]) > 1e-4) nDiff++; for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(d.A[p * 3 + c] - r.A[p * 3 + c]) / (Math.abs(r.A[p * 3 + c]) + 1e-3)); } return { nDiff, worst, nWorst }; };
        const c1 = cmp(Q.withCpuGeo, ref), c0 = cmp(Q.noClamp, refNo), cOwn = cmp(Q.ownGeo, ref);
        ok("!! round 33: given the CPU's first hits, the device's accumulation is accumulateUpscaled's -- the history length within 1e-4 at every pixel, the light within 1e-5, clamped and not",
            c1.nDiff === 0 && c1.worst <= 1e-5 && c0.nDiff === 0 && c0.worst <= 1e-5 && Q.noClamp.A.some((v, i) => Math.abs(v - Q.withCpuGeo.A[i]) > 1e-4),
            `clamped: ${c1.nDiff} n differ by over 1e-4 (worst ${c1.nWorst.toExponential(1)}), light worst ${c1.worst.toExponential(1)}; unclamped: ${c0.nDiff}, ${c0.worst.toExponential(1)}`);
        let yw = 0; for (let i = 0; i < refY.length; i++) yw = Math.max(yw, Math.abs(Q.withCpuGeo.y[i] - refY[i]) / (Math.abs(refY[i]) + 1e-3));
        ok("  ...and its composite is compositeEmitters on the accumulated light, within 1e-5", yw <= 1e-5, `worst ${yw.toExponential(1)}`);
        ok("  ...and with its own first hits the whole accumulation has at most 1 in 1,000 pixels with a history length off by over 1e-4, and the light within 1e-3",
            cOwn.nDiff <= N * N / 1000 && cOwn.worst <= 1e-3, `${cOwn.nDiff} of ${N * N} pixels' n differ by over 1e-4 (worst ${cOwn.nWorst.toExponential(1)}); light worst ${cOwn.worst.toExponential(1)}`);
    }
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nALL GREEN");
console.log("not read here: any time section 4 printed. On SwiftShader a kernel's time is a CPU's; the rig round reads them (backlog denoise-halfres-rig-timing).");
REPORT.write();
process.exit(fails ? 1 : 0);
