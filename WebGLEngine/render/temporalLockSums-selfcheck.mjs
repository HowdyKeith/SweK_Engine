#!/usr/bin/env node
// WebGLEngine/render/temporalLockSums-selfcheck.mjs -- the lock-ring round
//
// THE LOCK'S TWO WINDOWS AS THREE RUNNING SUMS, HELD TO THE RING THEY REPLACE. render/temporalLockSums.mjs's makeLumaSums
// keeps each jitter period's sum instead of its lumas -- one float texel a pixel on the device at any upscale, where the
// ring is 2 * period floats and 265 MB at 2x at 960x540, which is why fx/fsr/fsrTemporalTsl.mjs ships with the lock off.
//
// The rows: what it costs in memory; THE IDENTITY that makes it the same detector -- at every period boundary the sums
// are the ring's two halves summed, because bilinear reprojection is linear, under a moving camera as well as a still
// one; the still picture and the lock, where it is the ring; what it gives up, which is WHEN a change is seen, held to
// the bound the construction gives; the moving camera; and the device -- render/temporalLockSumsTsl.mjs's makeLumaSums
// against the mirror on both backends, and the driver's `lock: "sums"` wired as the ring is.
//
// MEASURED BEFORE IT WAS BUILT (a prototype on render/temporalLock-selfcheck.mjs's fixtures), and the one thing the
// prototype got wrong is a row here: its fill test was the ring's (filled >= 2P), which is one frame conservative and
// costs the ring one frame -- and costs the sums a WHOLE PERIOD, because their windows only close on a boundary.
"use strict";
import { makeLumaState, pushLuma, shadingShiftCPU, lumaMean, lockCandidatesFromRing, makeLockState, advanceLocks, lockRelaxation } from "./temporalLock.mjs";
import { makeLumaSums, pushLumaSums, lumaSumsMean, lumaSumsShiftCPU, lockCandidatesFromSums, sumsKnown, sumsCoverage } from "./temporalLockSums.mjs";
import { rectifiedAccumulateCPU, historyFactorCPU } from "./temporalReject.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

// render/temporalLock-selfcheck.mjs's camera and pictures, so the two gates drive the same thing. *** THE RING IT IS
// COMPARED WITH IS MOST OF ITS TIME *** -- 2 * period slots a pixel, 64 at 2x -- so the ring runs at 2x only where
// nothing else implies the answer, which kept this gate inside the sweep's 3 s budget. A 32 px frame was tried first
// and dropped: the still picture's three-way equality, exact at 48, was not exact there.
const W = 48, H = 48, NEAR = 1, FAR = 10, HALF = 4, Z_BG = 8, PXW = 2 * HALF / W;
function vpAt(camX) {
    const o = new Float32Array(16);
    o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1;
    const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -camX;
    return mat4Multiply(o, t);
}
function renderFrame({ camX = 0, kind = "chequer", light = 1 } = {}) {
    const colour = new Float32Array(W * H * 4), depth = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, o = i * 4;
        const wx = (2 * ((x + 0.5) / W) - 1) * HALF + camX, wy = (1 - 2 * ((y + 0.5) / H)) * HALF;
        let r, g, b;
        if (kind === "line") { const v = Math.abs(wx - 0.37) < 0.4 * PXW / 2 ? 0.95 : 0.05; r = g = b = v; }
        else if (kind === "smooth") { r = 0.5 + 0.4 * Math.sin(wx * 0.9) * Math.cos(wy * 0.7); g = r * 0.55 + 0.03; b = 1 - r; }
        else { const c = ((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? 0.92 : 0.06; r = c; g = c * 0.55 + 0.03; b = 1 - c; }
        colour[o] = r * light; colour[o + 1] = g * light; colour[o + 2] = b * light; colour[o + 3] = 1;
        depth[i] = (Z_BG - NEAR) / (FAR - NEAR);
    }
    return { colour, depth };
}
const motionFor = (depth, camX, camXPrev) => motionVectorsCPU(depth, W, H, mat4Invert(vpAt(camX)), vpAt(camXPrev)).data;
// a still camera under jitter draws the same P pictures over and over, and its field is the same every frame: sections 3
// and 4 run ~5,000 such frames, and drawing each afresh was most of this gate's CPU time. The cache hands out the SAME
// arrays, which every consumer here only reads.
const frameMemo = new Map();
const stillFrame = (opts) => { const k = JSON.stringify(opts); let f = frameMemo.get(k); if (!f) frameMemo.set(k, (f = renderFrame(opts))); return f; };
let STILL_MOTION = null;
const stillMotion = (depth) => STILL_MOTION || (STILL_MOTION = motionFor(depth, 0, 0));
const ALL = [...Array(W * H).keys()];
const rmsOver = (a, b, idx) => { let s = 0; for (const i of idx) for (let c = 0; c < 3; c++) { const d = a[i * 4 + c] - b[i * 4 + c]; s += d * d; } return Math.sqrt(s / (idx.length * 3)); };
const jitterCam = (j) => j[0] / W * 2 * HALF;
const DEVICE_BYTES = { ring: (w, h, P) => 2 * w * h * Math.ceil(2 * P / 4) * 16 + 2 * w * h * 16, sums: (w, h) => 2 * w * h * 16 };   // fx/fsr/fsrTemporalTsl.mjs's memory

console.log("temporalLockSums-selfcheck -- the ring's two windows as running sums, and what that gives up\n");
console.log("1. THE REFUSALS, AND WHAT IT COSTS");
{
    const refuse = (f) => { try { f(); return "no throw"; } catch (e) { return String(e.message); } };
    const a = refuse(() => makeLumaSums(4, 4, 2.5)), b = refuse(() => makeLumaSums(4, 4, 0));
    ok("makeLumaSums refuses a period that is not a positive integer, as makeLumaState does -- a window that is not a whole jitter period has jitter left in it",
        /positive integer/.test(a) && /positive integer/.test(b), a);
    const rows = [1, 1.5, 2, 3].map((r) => { const P = jitterPhaseCount(r);
        return { r, P, ring: DEVICE_BYTES.ring(960, 540, P) / 1e6, sums: DEVICE_BYTES.sums(960, 540) / 1e6 }; });
    for (const x of rows) report(`${x.r}x: period ${x.P}, the ring ${x.ring.toFixed(1)} MB on the device, the sums ${x.sums.toFixed(1)} MB (${(x.ring / x.sums).toFixed(1)}x less)`);
    ok("the sums cost the SAME at every ratio and less than the ring at every one -- one texel a pixel, where the ring grows with the period",
        rows.every((x) => x.sums === rows[0].sums && x.sums < x.ring), `${rows[0].sums.toFixed(1)} MB at 960x540 against ${rows.map((x) => x.ring.toFixed(0)).join(" / ")} MB`);
}

console.log("\n2. THE IDENTITY: at every period boundary the sums ARE the ring's two halves, summed -- still and moving, at 1x and 2x");
// *** WHY THIS HOLDS AND WHAT BOUNDS ITS ERROR. *** Bilinear reprojection is linear, so reprojecting a sum is summing the
// reprojected lumas -- the ring fetches each slot, the sums fetch the total, and the same restart rule writes both.
// What differs is f32 rounding: one store per sum per frame, each within half an ulp of a value at most P, which is
// 2^-24 of the MEAN per frame. So the bound is frames x 2^-24 -- derived, not tuned, and the measurement sits well
// inside it because rounding errors do not all point one way.
{
    const runs = [];
    // 1x still, slow and fast; 2x still -- the 2x ring is the expensive one, and 1x moving already crosses the
    // restart and the reprojection, which do not depend on the period
    for (const [R, speed] of [[1, 0], [1, 0.05], [1, 0.2], [2, 0]]) {
        const P = jitterPhaseCount(R), js = makeJitterState(R), ring = makeLumaState(W, H, P), sums = makeLumaSums(W, H, P);
        const FR = (R === 1 ? 4 : 3) * P + 3, bound = FR * 2 ** -24;
        // a translating camera over a flat wall has one field for every frame; drawn once, as the still camera's is
        const m = motionFor(renderFrame().depth, speed, 0);
        let wNew = 0, wOld = 0, wMean = 0, fillBad = 0, bounds = 0, onlySums = 0, onlyRing = 0, wShift = 0, judged = 0;
        for (let f = 0; f < FR; f++) {
            const j = advanceJitter(js), fr = renderFrame({ camX: f * speed + jitterCam(j), light: f > 2 * P + P / 2 ? 0.6 : 1 });
            pushLuma(ring, { current: fr.colour, motion: m, w: W, h: H }); pushLumaSums(sums, { current: fr.colour, motion: m, w: W, h: H });
            for (let i = 0; i < W * H; i++) if (ring.filled[i] !== sums.filled[i]) fillBad++;
            if (sums.phase !== 0) continue;
            bounds++;
            const F = 2 * P, a = lumaSumsShiftCPU(sums), b = shadingShiftCPU(ring), ma = lumaSumsMean(sums), mb = lumaMean(ring);
            for (let i = 0; i < W * H; i++) {
                let n = 0, o = 0; for (let k = 0; k < P; k++) { o += ring.ring[i * F + k]; n += ring.ring[i * F + P + k]; }
                wNew = Math.max(wNew, Math.abs(n - sums.prev[i]) / P); wOld = Math.max(wOld, Math.abs(o - sums.prev2[i]) / P);
                wMean = Math.max(wMean, Math.abs(ma[i] - mb[i]));
                const ka = sumsKnown(sums, i), kb = ring.filled[i] >= F;
                if (ka && !kb) onlySums++; if (kb && !ka) onlyRing++;
                if (ka && kb) { judged++; wShift = Math.max(wShift, Math.abs(a.data[i] - b.data[i])); }
            }
        }
        runs.push({ R, P, px: speed / PXW, FR, bound, wNew, wOld, wMean, fillBad, bounds, onlySums, onlyRing, wShift, judged });
    }
    for (const x of runs) report(`${x.R}x (P ${x.P}), ${x.px.toFixed(1)} px/frame, ${x.FR} frames: ${x.bounds} boundaries; newer half ${x.wNew.toExponential(2)}, older ${x.wOld.toExponential(2)}, mask ${x.wShift.toExponential(2)} over ${x.judged} judged pixel-boundaries (bound ${x.bound.toExponential(2)})`);
    ok("*** at every boundary of every run the sums' last closed period is the ring's NEWER half and the one before is its OLDER half, within frames x 2^-24 -- moving or still ***",
        runs.every((x) => x.bounds >= 3 && x.wNew <= x.bound && x.wOld <= x.bound), runs.map((x) => `${x.R}x/${x.px.toFixed(1)}px ${Math.max(x.wNew, x.wOld).toExponential(1)}`).join(", "));
    ok("  and lumaSumsMean -- the field the lock's candidates are taken from -- is the ring's lumaMean there, within the same bound",
        runs.every((x) => x.wMean <= x.bound), runs.map((x) => x.wMean.toExponential(1)).join(", "));
    ok("  and the FILL COUNT is the ring's on every pixel of every frame -- the same nearest-texel fetch and the same restart",
        runs.every((x) => x.fillBad === 0), runs.map((x) => x.fillBad).join("/"));
    ok("  and where both say they know, the shading MASK is the ring's within the same bound -- and the moving runs judge something, so that is not an absence",
        runs.every((x) => x.wShift <= x.bound) && runs.filter((x) => x.px > 0 && x.R === 1).every((x) => x.judged > 0),
        runs.map((x) => `${x.judged}`).join("/") + " judged");
    // the ring's test asks one frame more than its windows need (filled >= 2P where 2P real frames are filled >= 2P - 1);
    // the sums' test is exact. So the sums know at least everywhere the ring does, and the difference is that one frame
    ok("  and the sums know EVERYWHERE the ring knows, and more only where the ring's own test is one frame conservative",
        runs.every((x) => x.onlyRing === 0), runs.map((x) => `+${x.onlySums}`).join(" "));
    // the prototype's fault, as a row: the ring's test on the sums loses a whole period of warm-up, not one frame
    const P = jitterPhaseCount(2), js = makeJitterState(2), st = makeLumaSums(W, H, P); let firstExact = -1, firstRingRule = -1;
    for (let f = 0; f < 4 * P; f++) { const fr = stillFrame({ camX: jitterCam(advanceJitter(js)) });
        pushLumaSums(st, { current: fr.colour, motion: stillMotion(fr.depth), w: W, h: H });
        if (firstExact < 0 && sumsCoverage(st).full === W * H) firstExact = f;
        if (firstRingRule < 0 && st.filled[0] >= st.phase + 2 * P) firstRingRule = f; }
    ok(`*** the sums' fill test is EXACT: on a still picture at 2x they know every pixel at frame ${firstExact} (= 2P - 1, both windows closed); the ring's one-frame-conservative test would not until frame ${firstRingRule} ***`,
        firstExact === 2 * P - 1 && firstRingRule === 3 * P - 1, `the prototype carried the ring's test and lost a period -- ${firstRingRule - firstExact} frames -- at every warm-up`);
}

console.log("\n3. WHERE IT IS THE RING: the still picture, and the lock on a thin line");
{
    const runStatic = (kind, R, F) => {
        const P = jitterPhaseCount(R), st = makeJitterState(R); let hist = null, out = null; const acc = new Float64Array(W * H * 4);
        const ring = kind === "ring" ? makeLumaState(W, H, P) : null, sums = kind === "sums" ? makeLumaSums(W, H, P) : null;
        for (let f = 0; f < F; f++) {
            const fr = stillFrame({ camX: jitterCam(advanceJitter(st)) }); for (let i = 0; i < W * H * 4; i++) acc[i] += fr.colour[i];
            const m = stillMotion(fr.depth); let factor = null;
            if (ring) { pushLuma(ring, { current: fr.colour, motion: m, w: W, h: H }); factor = historyFactorCPU({ shading: shadingShiftCPU(ring, { scale: 0.25 }).data, n: W * H }); }
            if (sums) { pushLumaSums(sums, { current: fr.colour, motion: m, w: W, h: H }); factor = historyFactorCPU({ shading: lumaSumsShiftCPU(sums, { scale: 0.25 }).data, n: W * H }); }
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, factor, w: W, h: H, alpha: 1 / (f + 1), space: "ycocg" }); hist = r.data; out = r.data;
        }
        const mean = new Float32Array(W * H * 4); for (let i = 0; i < W * H * 4; i++) mean[i] = acc[i] / F; return rmsOver(out, mean, ALL);
    };
    // at 2x the ring is not run: section 2 holds its windows to the sums', so equality with the sums is equality with it
    for (const [R, F] of [[1, 32], [2, 96]]) {
        const off = runStatic("off", R, F), ring = R === 1 ? runStatic("ring", R, F) : null, sums = runStatic("sums", R, F);
        ok(`*** [${R}x] a still picture under jitter converges to the SAME number with the sums' mask as ${ring !== null ? "with the ring's and " : ""}with none -- ${sums.toExponential(3)} over ${F} frames ***`,
            sums === off && (ring === null || sums === ring), `off ${off.toExponential(4)}, ${ring !== null ? `ring ${ring.toExponential(4)}, ` : ""}sums ${sums.toExponential(4)} -- the jitter cancels in both windows' difference, exactly`);
    }
    // the lock on a feature 0.4 px wide: candidates from each history's mean, then the line's error with locks from each
    const X0 = 0.37, P = jitterPhaseCount(1);
    const TRUTH = new Float32Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, lo = (2 * (x / W) - 1) * HALF, hi = (2 * ((x + 1) / W) - 1) * HALF;
        const a = Math.max(lo, X0 - 0.4 * PXW / 2), b = Math.min(hi, X0 + 0.4 * PXW / 2), cov = Math.max(0, b - a) / (hi - lo), v = cov * 0.95 + (1 - cov) * 0.05;
        TRUTH[o] = TRUTH[o + 1] = TRUTH[o + 2] = v; TRUTH[o + 3] = 1; }
    const cols = []; for (let x = 0; x < W; x++) { const lo = (2 * (x / W) - 1) * HALF, hi = (2 * ((x + 1) / W) - 1) * HALF; if (hi > X0 - PXW && lo < X0 + PXW) cols.push(x); }
    const near = []; for (let y = 0; y < H; y++) for (const x of cols) near.push(y * W + x);
    const run = (kind) => { const st = makeJitterState(1); let hist = null, out = null, held = 0;
        const ls = makeLockState(W, H), ring = makeLumaState(W, H, P), sums = makeLumaSums(W, H, P);
        for (let f = 0; f < 32; f++) { const fr = stillFrame({ camX: jitterCam(advanceJitter(st)), kind: "line" }), m = stillMotion(fr.depth);
            pushLuma(ring, { current: fr.colour, motion: m, w: W, h: H }); pushLumaSums(sums, { current: fr.colour, motion: m, w: W, h: H });
            let relax = null;
            if (kind !== "off") { const nl = kind === "ring" ? lockCandidatesFromRing(ring, { margin: 0.05 }) : lockCandidatesFromSums(sums, { margin: 0.05 });
                advanceLocks(ls, { motion: m, newLocks: nl.data, w: W, h: H, life: 8 }); relax = lockRelaxation(ls, { life: 8 });
                if (f === 31) for (let i = 0; i < W * H; i++) if (ls.life[i] > 0) held++; }
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, relax, w: W, h: H, alpha: 1 / (f + 1), space: "ycocg" }); hist = r.data; out = r.data; }
        return { rms: rmsOver(out, TRUTH, near), held }; };
    // candidates at a boundary, where both means are a whole closed period
    const st = makeJitterState(1), lu = makeLumaState(W, H, P), su = makeLumaSums(W, H, P);
    for (let f = 0; f < 3 * P; f++) { const fr = stillFrame({ camX: jitterCam(advanceJitter(st)), kind: "line" }), m = stillMotion(fr.depth);
        pushLuma(lu, { current: fr.colour, motion: m, w: W, h: H }); pushLumaSums(su, { current: fr.colour, motion: m, w: W, h: H }); }
    const ca = lockCandidatesFromRing(lu, { margin: 0.05 }), cb = lockCandidatesFromSums(su, { margin: 0.05 });
    let agree = 0; for (let i = 0; i < W * H; i++) if ((ca.data[i] > 0) === (cb.data[i] > 0)) agree++;
    ok(`*** the LOCK's candidates from the sums' mean are the ring's on all ${agree} of ${W * H} pixels at a boundary -- ${cb.count} found, the ring ${ca.count} ***`,
        agree === W * H && ca.count > 0 && su.phase === 0, "lockCandidatesFromSums is ridgesCPU over lumaSumsMean, as lockCandidatesFromRing is over lumaMean");
    const off = run("off"), ring = run("ring"), sums = run("sums");
    ok(`  and the 0.4 px line's error with locks from the sums is the ring's -- ${sums.rms.toFixed(5)} against ${ring.rms.toFixed(5)}, from ${off.rms.toFixed(5)} with no lock, ${sums.held} held`,
        Math.abs(sums.rms - ring.rms) <= 1e-6 && sums.rms < off.rms && sums.held === ring.held, `between boundaries the sums' mean is a period behind the ring's; on a still feature that is the same picture`);
}

console.log("\n4. WHAT IT GIVES UP: a change of light is seen at the next period boundary, not the next frame");
// *** THE BOUND IS THE CONSTRUCTION'S. *** The windows close every P frames, so a drop landing on any frame of a period
// is inside a closed window at most P - 1 frames later. Measured at 2x for drops on the period's first frame (the
// latest a change can be seen, P - 1) and its LAST (seen at once: the window closes on it). The prototype measured
// eight phases between, every one at exactly P - 1 - phase; two keep this gate inside the sweep's 3 s budget.
{
    const runLight = (kind, dropAt, frames, R) => { const P = jitterPhaseCount(R), st = makeJitterState(R); let hist = null; const tr = [];
        const ring = kind === "ring" ? makeLumaState(W, H, P) : null, sums = kind === "sums" ? makeLumaSums(W, H, P) : null;
        for (let f = 0; f < frames; f++) { const fr = stillFrame({ camX: jitterCam(advanceJitter(st)), light: f >= dropAt ? 0.55 : 1 }), m = stillMotion(fr.depth); let factor = null;
            if (ring) { pushLuma(ring, { current: fr.colour, motion: m, w: W, h: H }); factor = historyFactorCPU({ shading: shadingShiftCPU(ring, { scale: 0.25 }).data, n: W * H }); }
            if (sums) { pushLumaSums(sums, { current: fr.colour, motion: m, w: W, h: H }); factor = historyFactorCPU({ shading: lumaSumsShiftCPU(sums, { scale: 0.25 }).data, n: W * H }); }
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, factor, w: W, h: H, alpha: 0.15, space: "ycocg" }); hist = r.data;
            if (f >= dropAt) tr.push(rmsOver(r.data, fr.colour, ALL)); }
        return tr; };
    const firstBelow = (tr, ref) => tr.findIndex((v, k) => v < ref[k] * 0.98);
    const R = 2, P = jitterPhaseCount(R), rows = [];
    for (const dropAt of [2 * P, 3 * P - 1]) {
        // the ring reacts on the frame wherever the drop lands; it is run for the first, where the sums are latest
        const off = runLight("off", dropAt, dropAt + P + 8, R), ring = dropAt === 2 * P ? runLight("ring", dropAt, dropAt + P + 8, R) : null, sums = runLight("sums", dropAt, dropAt + P + 8, R);
        const sum = (tr) => tr.slice(0, P + 8).reduce((a, v) => a + v, 0);
        rows.push({ dropAt, phase: dropAt % P, off: sum(off), ring: ring && sum(ring), sums: sum(sums), ringAt: ring && firstBelow(ring, off), sumsAt: firstBelow(sums, off) });
    }
    for (const x of rows) report(`drop on phase ${String(x.phase).padStart(2)}: summed error over ${P + 8} frames -- none ${x.off.toFixed(3)}${x.ring !== null ? `, ring ${x.ring.toFixed(3)} (reacts after ${x.ringAt})` : ""}, sums ${x.sums.toFixed(3)} (after ${x.sumsAt})`);
    ok(`*** [2x] the sums react to every drop by the end of the period it lands in -- P - 1 = ${P - 1} frames at the latest, at once on its last frame ***`,
        rows.every((x) => x.sumsAt === P - 1 - x.phase) && rows[0].sumsAt === P - 1 && rows[rows.length - 1].sumsAt === 0,
        rows.map((x) => `phase ${x.phase}: ${x.sumsAt}`).join(", ") + " frames -- exactly P - 1 - phase, the frames left in its window");
    const r0 = rows[0];
    ok("  and they always help -- less error than no detector on every drop -- but on the drop they see latest, less than the ring, which reacts on the frame",
        rows.every((x) => x.sums < x.off) && r0.sums > r0.ring && r0.ringAt === 0,
        `there the sums keep ${((r0.off - r0.sums) / (r0.off - r0.ring)).toFixed(2)} of the ring's gain over none; the prototype measured 0.47 to 0.67 across eight phases`);
}

console.log("\n5. A MOVING CAMERA: smooth shading reads still; the pixel-scale chequer is the ring's limit, reported");
{
    const P = jitterPhaseCount(1), SLOW = 0.2;
    const build = (kind, reproject) => { const st = makeLumaSums(W, H, P);
        for (let f = 0; f < 4 * P + 2; f++) { const camX = f * SLOW, fr = renderFrame({ camX, kind }), m = motionFor(fr.depth, camX, camX - SLOW);
            pushLumaSums(st, { current: fr.colour, motion: reproject ? m : null, w: W, h: H }); }
        return st; };
    const mean = (st, other = st) => { const s = lumaSumsShiftCPU(other, { scale: 0.25 }); let a = 0, n = 0;
        for (let i = 0; i < W * H; i++) if (sumsKnown(st, i)) { a += s.data[i]; n++; } return { mean: n ? a / n : NaN, n }; };
    const withRe = build("smooth", true), without = build("smooth", false), a = mean(withRe), b = mean(withRe, without);
    ok(`*** over smooth shading at ${(SLOW / PXW).toFixed(1)} px a frame the sums report ${a.mean.toExponential(2)} on the ${a.n} pixels they judge; without reprojection, ${b.mean.toExponential(2)} ***`,
        a.n >= W * H / 2 && a.mean < 0.05 && b.mean > a.mean * 10, "the ring's row in render/temporalLock-selfcheck.mjs section 3, on the sums");
    const chq = mean(build("chequer", true));
    report(`over the pixel-scale chequer, the same drive: ${chq.mean.toExponential(2)} on ${chq.n} judged pixels -- reprojection blur read as light, as the ring reads it (that gate records 1.0e-1 at 2P+2 frames)`);
}

// SABOTAGE LOG -- applied to render/temporalLockSums.mjs, render/temporalLockSumsTsl.mjs and fx/fsr/fsrTemporalTsl.mjs; BOTH gates
// run for each -- this one (mirror) and render/temporalLockSumsTsl-selfcheck.mjs (device) -- files restored and
// md5-verified. Baseline 0 red. MEASURED the round the sums were built.
//                                                                              mirror  device
//   E1  the windows tumble a frame late (phase === P)                            8       7
//   E2  the ring's one-frame-conservative fill test on the sums                  1       3
//   E3  the sums not reprojected, read at the pixel's own texel                  4       7
//   E4  a restart writes ONE luma into each closed window instead of P           1       4
//   E5  lumaSumsMean reads the OLDER closed window                               1       3
//   E6  the TSL push tumbles a frame late                                        0       7
//   E7  the TSL fill count fetched bilinearly instead of at the nearest texel    0       4
//   E8  the TSL shading test reads the phase BEFORE the push                     0       3
//   E9  the TSL mask ignores `scale`                                             0       2
//   E10 the TSL push reads its sums at the pixel's own uv (bounds still tested)  0       7
//   E11 the driver builds the ring when asked for the sums                       0       2
//   E12 the driver pushes the sums before this frame's resolve is drawn          0       1
//   E13 the driver does not refresh the lock mean from the sums                  0       1
//   E14 the driver reports the sums' memory as the ring's                        0       1
// No 0-RED anywhere: every mirror fault reddens the device gate too, because it grades against the mirror. *** E5 IS
// WHY SECTION 2's MEAN ROW EXISTS. *** It was written before E5 was run, on the guess that the lock's rows would not see
// it, and they did not: on a still feature the older closed window IS the newer one, so the candidates and the line's
// error came out identical. A mean a period stale is invisible until something changes, which is the case nothing in
// section 3 drives. E4 is the restart rule's only row in this gate and it is the moving runs' identity: a pixel that
// restarts and then reprojects carries the wrong total for a whole period.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the device, which is render/temporalLockSumsTsl-selfcheck.mjs; lumaInstability, which a sum cannot give and nothing " +
    "in the tree wires; and whether a caller should turn the lock on now that it is affordable -- fx/fsr/fsrTemporalLocks-selfcheck.mjs measures the " +
    "locks, not the mask, and section 4 here is what the mask gives up.");
process.exitCode = fails ? 1 : 0;
