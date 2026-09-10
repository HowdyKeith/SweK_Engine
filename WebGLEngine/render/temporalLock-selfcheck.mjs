#!/usr/bin/env node
// WebGLEngine/render/temporalLock-selfcheck.mjs -- v4553
//
// PER-PIXEL STATE ACROSS FRAMES, and the rung that answers a refusal rather than adding a feature.
//
// v4552 wrote a shading-change detector three ways and refused all three: on a high-contrast surface a
// ONE-PIXEL JITTER MOVES A PIXEL BY AS MUCH AS A LIGHTING CHANGE DOES, so one frame cannot separate "the light
// changed" from "the sample moved". *** THAT REFUSAL STILL STANDS AND THIS GATE DOES NOT REPEAL IT. *** What is
// shown here is that a WINDOW can do what a frame cannot, for a reason that is arithmetic rather than tuning:
// over a whole jitter period the same phase offsets recur, so they contribute identically to two adjacent
// windows and cancel in the difference exactly.
//
// The rows: the premise, measured on its own before anything is built on it; the detector v4552 refused, run on
// v4552's OWN two fixtures; the lock, which is the other thing a ring buys; and the limit, which is real and is
// stated with a number rather than left to be discovered.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "./wgslSpec.mjs";
import { makeLumaState, pushLuma, lumaMean, lumaMeanPrev, lumaInstability, shadingShiftCPU,
         makeLockState, newLocksCPU, lockCandidatesFromRing, ridgesCPU, advanceLocks, lockRelaxation, luma } from "./temporalLock.mjs";
import { RING_PUSH_WGSL, SHADING_SHIFT_WGSL, RIDGE_WGSL } from "./temporalLockWgsl.mjs";
import { rectifiedAccumulateCPU, historyFactorCPU, disocclusionCPU } from "./temporalReject.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 48, H = 48, NEAR = 1, FAR = 10, HALF = 4, Z_OCC = 3, Z_BG = 8;
const PXW = 2 * HALF / W;                       // world units per pixel
const P = jitterPhaseCount(1);
function vpAt(camX) {
    const o = new Float32Array(16);
    o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1;
    const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -camX;
    return mat4Multiply(o, t);
}
// three pictures, each used only for what it can support:
//   "chequer" -- a texture AT THE PIXEL SCALE (cell 1.13 px), which is what v4552 established matters
//   "line"    -- a feature THINNER THAN A PIXEL (0.4 px) on a flat ground, which is what a lock is for
//   "bar"     -- a thin bright bar over the chequer, which is where the two collide
function renderFrame({ camX = 0, kind = "chequer", light = 1, occX = -9 } = {}) {
    const colour = new Float32Array(W * H * 4), depth = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, o = i * 4;
        const wx = (2 * ((x + 0.5) / W) - 1) * HALF + camX, wy = (1 - 2 * ((y + 0.5) / H)) * HALF;
        let r, g, b, z = Z_BG;
        if (kind === "line") { const v = Math.abs(wx - 0.37) < 0.4 * PXW / 2 ? 0.95 : 0.05; r = g = b = v; }
        else if (kind === "bar" && Math.abs(wx - occX) < 0.10 && Math.abs(wy) < 2.2) { r = g = b = 0.95; z = Z_OCC; }
        else if (kind === "bar") { const v = ((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? 0.30 : 0.10; r = g = b = v; }
        else { const c = ((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? 0.92 : 0.06; r = c; g = c * 0.55 + 0.03; b = 1 - c; }
        colour[o] = r * light; colour[o + 1] = g * light; colour[o + 2] = b * light; colour[o + 3] = 1;
        depth[i] = (z - NEAR) / (FAR - NEAR);
    }
    return { colour, depth };
}
const motionFor = (depth, camX, camXPrev) => motionVectorsCPU(depth, W, H, mat4Invert(vpAt(camX)), vpAt(camXPrev)).data;
const ALL = [...Array(W * H).keys()];
const rmsOver = (a, b, idx) => { let s = 0; for (const i of idx) for (let c = 0; c < 3; c++) { const d = a[i * 4 + c] - b[i * 4 + c]; s += d * d; } return Math.sqrt(s / (idx.length * 3)); };
const jitterCam = (j) => j[0] / W * 2 * HALF;

console.log("temporalLock-selfcheck -- a luma ring, a lock, and the detector one frame provably cannot build\n");
console.log("1. THE PREMISE, MEASURED BEFORE ANYTHING IS BUILT ON IT");

let RESIDUE = {};
{
    // per-pixel luma over many frames of a STATIC scene under jitter, then the worst difference between the
    // means of two adjacent windows of length N. This is the quantity a windowed detector reads.
    const st = makeJitterState(1); const S = [];
    for (let f = 0; f < 64; f++) { const j = advanceJitter(st); const fr = renderFrame({ camX: jitterCam(j) });
        const a = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) a[i] = luma(fr.colour[i * 4], fr.colour[i * 4 + 1], fr.colour[i * 4 + 2]);
        S.push(a); }
    const residue = (N) => { let worst = 0;
        for (let t = 2 * N; t <= 64; t++) for (let i = 0; i < W * H; i++) {
            let a = 0, b = 0;
            for (let k = 0; k < N; k++) { a += S[t - 2 * N + k][i] / N; b += S[t - N + k][i] / N; }
            worst = Math.max(worst, Math.abs(a - b)); }
        return worst; };
    for (const N of [1, 2, 3, 4, P]) RESIDUE[N] = residue(N);
    // the signal a light change puts into the same statistic
    const st2 = makeJitterState(1); const S2 = [];
    for (let f = 0; f < 2 * P; f++) { const j = advanceJitter(st2); const fr = renderFrame({ camX: jitterCam(j), light: f < P ? 1 : 0.55 });
        const a = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) a[i] = luma(fr.colour[i * 4], fr.colour[i * 4 + 1], fr.colour[i * 4 + 2]);
        S2.push(a); }
    let signal = 0;
    for (let i = 0; i < W * H; i++) { let a = 0, b = 0;
        for (let k = 0; k < P; k++) { a += S2[k][i] / P; b += S2[k + P][i] / P; }
        signal = Math.max(signal, Math.abs(a - b)); }

    report(`jitter phase count for ratio 1 is ${P}; a light drop to 0.55 puts ${signal.toFixed(4)} into this statistic`);
    report(`window residue by length: ` + [1, 2, 3, 4, P].map((N) => `${N}:${RESIDUE[N].toExponential(2)}`).join("  "));
    // *** THIS IS v4552's REFUSAL RESTATED AS A NUMBER. *** A one-frame detector's residue is the same size as
    // the signal, so its signal-to-residue is about 1 and no threshold can separate them.
    ok(`*** a ONE-frame window leaves residue ${RESIDUE[1].toFixed(4)} against a signal of ${signal.toFixed(4)} -- signal-to-residue ${(signal / RESIDUE[1]).toFixed(2)}, which is v4552's refusal as arithmetic ***`,
        signal / RESIDUE[1] < 1.2, `residue ${RESIDUE[1].toFixed(5)}, signal ${signal.toFixed(5)}`);
    ok(`*** a window of a WHOLE JITTER PERIOD (${P}) leaves residue ${RESIDUE[P].toExponential(1)} -- exactly zero, because the same phase offsets recur in both windows ***`,
        RESIDUE[P] === 0, `residue ${RESIDUE[P]}`);
    // *** AND IT IS NOT MONOTONIC, WHICH IS THE DESIGN RULE AND NOT A CURIOSITY. ***
    ok(`*** and it is NOT monotonic in the window length: 3 leaves ${RESIDUE[3].toExponential(2)}, WORSE than 2's ${RESIDUE[2].toExponential(2)} -- so the rule is "a whole number of periods", not "longer" ***`,
        RESIDUE[3] > RESIDUE[2], `1:${RESIDUE[1].toExponential(2)} 2:${RESIDUE[2].toExponential(2)} 3:${RESIDUE[3].toExponential(2)} 4:${RESIDUE[4].toExponential(2)}`);
    // NOT stated as a ratio: the phase-count ring leaves exactly zero, so a ratio against it is a division by
    // zero dressed up with an epsilon. The two numbers, side by side, say the thing without inventing one.
    ok(`  FSR2's ring of 4 would leave ${RESIDUE[4].toExponential(2)} on this sequence where the phase-count ring leaves 0 -- so the ring length is not a taste parameter, and 4 is a choice about memory rather than about accuracy`,
        RESIDUE[4] > 0 && RESIDUE[4] < RESIDUE[1] && RESIDUE[P] === 0);
    ok("  and the state refuses a period that is not a positive integer, rather than silently rounding one",
        (() => { try { makeLumaState(W, H, 2.5); return false; } catch (e) { return /period must be a positive integer/.test(e.message); } })());
}

console.log("\n2. THE DETECTOR v4552 REFUSED, ON v4552's OWN TWO FIXTURES");

let STATIC = {};
{
    // (a) the fixture the refusal was built on: a static jittered scene, where the accumulation with
    // alpha = 1/(n+1) is the exact running mean and any interference shows immediately.
    const runStatic = (period) => {
        const st = makeJitterState(1); let hist = null, out = null;
        const acc = new Float64Array(W * H * 4);
        const ls = period ? makeLumaState(W, H, period) : null;
        for (let f = 0; f < 32; f++) {
            const j = advanceJitter(st); const fr = renderFrame({ camX: jitterCam(j) });
            for (let i = 0; i < W * H * 4; i++) acc[i] += fr.colour[i];
            const m = motionFor(fr.depth, 0, 0);
            let factor = null;
            if (ls) { pushLuma(ls, { current: fr.colour, motion: m, w: W, h: H });
                factor = historyFactorCPU({ shading: shadingShiftCPU(ls, { scale: 0.25 }).data, n: W * H }); }
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, factor, w: W, h: H, alpha: 1 / (f + 1), space: "ycocg" });
            hist = r.data; out = r.data;
        }
        const mean = new Float32Array(W * H * 4); for (let i = 0; i < W * H * 4; i++) mean[i] = acc[i] / 32;
        return rmsOver(out, mean, ALL);
    };
    STATIC.off = runStatic(null); STATIC.p2 = runStatic(2); STATIC.p4 = runStatic(4); STATIC.pP = runStatic(P);
    report(`static jittered convergence: no detection ${STATIC.off.toExponential(3)}, period 2 ${STATIC.p2.toExponential(3)}, period 4 ${STATIC.p4.toExponential(3)}, period ${P} ${STATIC.pP.toExponential(3)}`);
    // *** THE ROW THIS WHOLE RUNG EXISTS FOR. *** v4552's one-frame detector cost 3.0e5x here at quarter
    // strength. At the phase count this costs NOTHING -- and "nothing" means the same float, not a small ratio.
    ok(`*** at a period of ${P} the detector costs EXACTLY NOTHING: ${STATIC.pP.toExponential(3)} against ${STATIC.off.toExponential(3)} with no detection, the same value to the bit -- where v4552's one-frame form cost 3.0e5x ***`,
        STATIC.pP === STATIC.off, `with ${STATIC.pP}, without ${STATIC.off}`);
    ok(`  and a period that is NOT the phase count still wrecks it: 2 costs ${(STATIC.p2 / STATIC.off).toExponential(2)}x and 4 costs ${(STATIC.p4 / STATIC.off).toExponential(2)}x, so the ring length is the whole difference between a working detector and v4552's`,
        STATIC.p2 / STATIC.off > 1e4 && STATIC.p4 / STATIC.off > 1e4,
        `p2 ${STATIC.p2.toExponential(3)}, p4 ${STATIC.p4.toExponential(3)}, off ${STATIC.off.toExponential(3)}`);

    // (b) the case it is FOR: does it still catch a global light change?
    const runLight = (period) => {
        const st = makeJitterState(1); let hist = null; const tr = [];
        const ls = period ? makeLumaState(W, H, period) : null;
        for (let f = 0; f < 24; f++) {
            const j = advanceJitter(st); const fr = renderFrame({ camX: jitterCam(j), light: f >= 12 ? 0.55 : 1 });
            const m = motionFor(fr.depth, 0, 0);
            let factor = null;
            if (ls) { pushLuma(ls, { current: fr.colour, motion: m, w: W, h: H });
                factor = historyFactorCPU({ shading: shadingShiftCPU(ls, { scale: 0.25 }).data, n: W * H }); }
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, factor, w: W, h: H, alpha: 0.15, space: "ycocg" });
            hist = r.data; if (f >= 12) tr.push(rmsOver(r.data, fr.colour, ALL));
        }
        return tr;
    };
    const lo = runLight(null), lr = runLight(P);
    const early = lo.slice(0, 4).every((v, k) => v === lr[k]);
    const gain = lo.slice(4, 12).reduce((a, v, k) => a + v / lr[k + 4], 0) / 8;
    report(`light drop at frame 12: no detection ${lo.slice(4, 8).map((v) => v.toFixed(4)).join(" ")} ... / with ring ${lr.slice(4, 8).map((v) => v.toFixed(4)).join(" ")} ...`);
    // THE LATENCY IS THE PRICE AND IT IS EXACT, NOT APPROXIMATE: for the first period after the change the two
    // windows both still straddle it, so the detector says nothing and the output is IDENTICAL to no detection.
    ok(`*** the price is one period of latency, and it is exact: the first 4 frames after the change are BIT-IDENTICAL to no detection, because both windows still straddle it ***`,
        early, `first four frames identical: ${early}`);
    ok(`  and after that it is worth ${gain.toFixed(2)}x on average over the next 8 frames -- a real gain, and a smaller one than the 30x an unmeasured full-strength detector appears to give by discarding everything`,
        gain > 1.4 && gain < 4, `mean ratio ${gain.toFixed(3)}`);
    ok("  a ring that is not yet full reports UNKNOWN (0) rather than clean -- an absence read as a pass is v4402's fault",
        (() => { const ls = makeLumaState(W, H, P); const fr = renderFrame({});
                 pushLuma(ls, { current: fr.colour, motion: null, w: W, h: H });
                 const s = shadingShiftCPU(ls, { scale: 0.25 });
                 return s.unknown === W * H && s.data.every((v) => v === 0); })());
}

console.log("\n3. THE RING REPROJECTS, AND A RING THAT DOES NOT IS MEASURING THE CAMERA");

{
    // a camera that MOVES, so a screen-indexed ring would average over different surfaces
    const step = 0.6;
    const build = (reproject) => {
        const ls = makeLumaState(W, H, P);
        for (let f = 0; f < 2 * P + 2; f++) {
            const camX = f * step;
            const fr = renderFrame({ camX });
            const m = motionFor(fr.depth, camX, camX - step);
            pushLuma(ls, { current: fr.colour, motion: reproject ? m : null, w: W, h: H });
        }
        return shadingShiftCPU(ls, { scale: 0.25 });
    };
    const withRe = build(true), without = build(false);
    let sw = 0, so = 0;
    for (let i = 0; i < W * H; i++) { sw += withRe.data[i] / (W * H); so += without.data[i] / (W * H); }
    report(`camera translating ${step} world units per frame; mean shading shift reported across the frame`);
    // NOTHING in this sequence changes its shading -- the camera moves and the scene does not. Every unit of
    // shift a screen-indexed ring reports is the scene sliding past, read as a change in the light.
    ok(`*** with reprojection the detector reports ${sw.toExponential(2)} on a scene whose shading never changes; WITHOUT it, ${so.toExponential(2)} -- ${(so / Math.max(sw, 1e-12)).toExponential(1)}x, and all of it is the camera ***`,
        so > sw * 10 && sw < 0.05, `with ${sw.toExponential(3)}, without ${so.toExponential(3)}`);

    // ---- *** THE DOUBLE BUFFER, WHICH WENT 0-RED AND IS THE REASON THIS BLOCK EXISTS. *** ------------------
    // pushLuma swaps a scratch pair rather than allocating a fresh ring each frame -- an optimisation made
    // when this gate came in at 3,180 ms against a 3,000 ms sweep budget. Pointing the scratch AT the ring, so
    // the push reads and writes one buffer, changed NOTHING anywhere in this gate: with zero motion the
    // reprojection is the identity and each pixel only shifts its own slots, and even section 3's moving
    // camera happened to read pixels in an order that survived it. An optimisation whose safety nothing
    // asserts is a defect waiting for a different motion vector.
    const naive = (() => {
        // the same computation with a fresh allocation every frame -- the thing the swap has to be equal to
        const st2 = makeLumaState(W, H, P);
        for (let f = 0; f < 2 * P + 2; f++) {
            const camX = f * step, fr = renderFrame({ camX });
            const m = motionFor(fr.depth, camX, camX - step);
            const F = st2.frames, out = new Float32Array(W * H * F), fill = new Uint8Array(W * H);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const i = y * W + x, o2 = i * 4;
                const l = luma(fr.colour[o2], fr.colour[o2 + 1], fr.colour[o2 + 2]);
                const uu = (x + 0.5) / W, vv = (y + 0.5) / H;
                const hu = uu + m[o2], hv = vv + m[o2 + 1];
                const usable = f > 0 && m[o2 + 2] !== 0 && hu >= 0 && hu < 1 && hv >= 0 && hv < 1;
                if (!usable) { for (let k = 0; k < F; k++) out[i * F + k] = l; fill[i] = 0; continue; }
                const bil = (k) => { const xx = hu * W - 0.5, yy = hv * H - 0.5;
                    const x0 = Math.floor(xx), y0 = Math.floor(yy), fx = xx - x0, fy = yy - y0;
                    const at = (a2, b2) => st2.ring[(Math.min(H - 1, Math.max(0, b2)) * W + Math.min(W - 1, Math.max(0, a2))) * F + k];
                    return at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy)
                         + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy; };
                for (let k = 0; k < F - 1; k++) out[i * F + k] = bil(k + 1);
                out[i * F + F - 1] = l;
                const px = Math.min(W - 1, Math.max(0, Math.round(hu * W - 0.5))), py = Math.min(H - 1, Math.max(0, Math.round(hv * H - 0.5)));
                fill[i] = Math.min(255, st2.filled[py * W + px] + 1);
            }
            st2.ring = out; st2.filled = fill; st2.n++;
        }
        return st2;
    })();
    const swapped = (() => { const st3 = makeLumaState(W, H, P);
        for (let f = 0; f < 2 * P + 2; f++) { const camX = f * step, fr = renderFrame({ camX });
            pushLuma(st3, { current: fr.colour, motion: motionFor(fr.depth, camX, camX - step), w: W, h: H }); }
        return st3; })();
    let wRing = 0; for (let i = 0; i < W * H * 2 * P; i++) wRing = Math.max(wRing, Math.abs(swapped.ring[i] - naive.ring[i]));
    ok(`*** the swapped ring is BIT-IDENTICAL to one allocated fresh every frame over ${2 * P + 2} frames of a moving camera -- worst ${wRing} -- so the optimisation is a control, not a hope ***`,
        wRing === 0, `worst ${wRing} over ${W * H * 2 * P} slots`);
    ok("  and the scratch pair stays DISTINCT from the live ring after every push, which is the invariant the swap rests on",
        swapped.ring !== swapped.scratchRing && swapped.filled !== swapped.scratchFilled);
}

console.log("\n4. THE LOCK: what a ring buys a THIN FEATURE, and what a single frame cannot see");

let LOCK = {};
{
    const X0 = 0.37;
    const TRUTH = (() => { const t = new Float32Array(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4;
            const lo = (2 * (x / W) - 1) * HALF, hi = (2 * ((x + 1) / W) - 1) * HALF;
            const a = Math.max(lo, X0 - 0.4 * PXW / 2), b = Math.min(hi, X0 + 0.4 * PXW / 2);
            const cov = Math.max(0, b - a) / (hi - lo), v = cov * 0.95 + (1 - cov) * 0.05;
            t[o] = v; t[o + 1] = v; t[o + 2] = v; t[o + 3] = 1; }
        return t; })();
    const cols = []; for (let x = 0; x < W; x++) { const lo = (2 * (x / W) - 1) * HALF, hi = (2 * ((x + 1) / W) - 1) * HALF;
        if (hi > X0 - PXW && lo < X0 + PXW) cols.push(x); }
    const near = []; for (let y = 0; y < H; y++) for (const x of cols) near.push(y * W + x);

    const run = ({ lock, life = 8, fromRing = true, relaxAll = null }) => {
        const st = makeJitterState(1); let hist = null, out = null;
        const ls = makeLockState(W, H), lu = makeLumaState(W, H, P);
        let held = 0;
        for (let f = 0; f < 32; f++) {
            const j = advanceJitter(st); const fr = renderFrame({ camX: jitterCam(j), kind: "line" });
            const m = motionFor(fr.depth, 0, 0);
            pushLuma(lu, { current: fr.colour, motion: m, w: W, h: H });
            let relax = null;
            if (relaxAll !== null) { relax = new Float32Array(W * H).fill(relaxAll); }
            else if (lock) {
                const nl = fromRing ? lockCandidatesFromRing(lu, { margin: 0.05 }) : newLocksCPU({ current: fr.colour, w: W, h: H, margin: 0.05 });
                advanceLocks(ls, { motion: m, newLocks: nl.data, w: W, h: H, life });
                relax = lockRelaxation(ls, { life });
                if (f === 31) for (let i = 0; i < W * H; i++) if (ls.life[i] > 0) held++;
            }
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, relax, w: W, h: H, alpha: 1 / (f + 1), space: "ycocg" });
            hist = r.data; out = r.data;
        }
        return { rms: rmsOver(out, TRUTH, near), held };
    };

    // *** WHAT A SINGLE FRAME SEES OF A FEATURE THINNER THAN A PIXEL: NOTHING, MOST FRAMES. ***
    const st = makeJitterState(1); let singleTotal = 0, ringTotal = 0;
    const lu = makeLumaState(W, H, P);
    for (let f = 0; f < 2 * P + 4; f++) { const j = advanceJitter(st); const fr = renderFrame({ camX: jitterCam(j), kind: "line" });
        const m = motionFor(fr.depth, 0, 0); pushLuma(lu, { current: fr.colour, motion: m, w: W, h: H });
        singleTotal = newLocksCPU({ current: fr.colour, w: W, h: H, margin: 0.05 }).count; }
    ringTotal = lockCandidatesFromRing(lu, { margin: 0.05 }).count;
    report(`a line 0.4 px wide crosses columns ${cols.join(",")}`);
    ok(`*** a single frame finds ${singleTotal} lock candidates on a 0.4 px line and the RING finds ${ringTotal} -- most jitter phases miss a sub-pixel feature entirely, so on most frames there is nothing to find ***`,
        singleTotal === 0 && ringTotal >= H - 2, `single ${singleTotal}, ring ${ringTotal}`);

    LOCK.off = run({ lock: false }).rms;
    const ringRun = run({ lock: true, fromRing: true, life: 8 });
    LOCK.ring = ringRun.rms;
    LOCK.ceiling = run({ lock: false, relaxAll: 1 }).rms;
    ok(`*** the lock is worth ${(LOCK.off / LOCK.ring).toFixed(2)}x on the feature (${LOCK.off.toFixed(5)} -> ${LOCK.ring.toFixed(5)}) while holding only ${ringRun.held} of ${W * H} pixels open -- ${(ringRun.held / (W * H) * 100).toFixed(1)}%, so the clamp still guards ${(100 - ringRun.held / (W * H) * 100).toFixed(1)}% of the frame ***`,
        LOCK.off / LOCK.ring > 2 && ringRun.held < W * H * 0.05, `off ${LOCK.off.toFixed(5)}, ring ${LOCK.ring.toFixed(5)}, held ${ringRun.held}`);
    report(`removing the clamp everywhere reaches ${LOCK.ceiling.toFixed(5)} on this picture -- better than the lock, and section 5 is what that costs`);
    // with a detector that actually finds the feature every frame, the LIFETIME stops mattering: the lock is
    // renewed before it can expire. FSR2's lifetime is compensating for detection that misses.
    const l4 = run({ lock: true, fromRing: true, life: 4 }).rms, l16 = run({ lock: true, fromRing: true, life: 16 }).rms;
    ok(`  and once the detector finds the feature every frame the LIFETIME stops mattering: life 4/8/16 give ${l4.toFixed(5)}/${LOCK.ring.toFixed(5)}/${l16.toFixed(5)}, identical, because the lock is renewed before it can expire`,
        Math.abs(l4 - LOCK.ring) < 1e-9 && Math.abs(l16 - LOCK.ring) < 1e-9, `${l4} ${LOCK.ring} ${l16}`);
}

console.log("\n5. *** THE LIMIT, WITH A NUMBER: A LOCK DETECTOR CANNOT TELL A THIN FEATURE FROM A PIXEL-SCALE TEXTURE ***");

{
    const occAt = (f) => -1.6 + f * 0.35, N = 14;
    const run = ({ life, fromRing }) => {
        let hist = null, prevDepth = null, out = null;
        const ls = makeLockState(W, H), lu = makeLumaState(W, H, P);
        for (let f = 0; f < N; f++) {
            const fr = renderFrame({ kind: "bar", occX: occAt(f) });
            const m = motionFor(fr.depth, 0, 0);
            let dis = null;
            if (prevDepth) dis = disocclusionCPU({ motion: m, prevDepth, w: W, h: H, threshold: 0.02 });
            pushLuma(lu, { current: fr.colour, motion: m, w: W, h: H });
            let relax = null;
            if (life > 0) {
                const nl = fromRing ? lockCandidatesFromRing(lu, { margin: 0.05 }) : newLocksCPU({ current: fr.colour, w: W, h: H, margin: 0.05 });
                advanceLocks(ls, { motion: m, disocclusion: dis ? dis.data : null, newLocks: nl.data, w: W, h: H, life });
                relax = lockRelaxation(ls, { life });
            }
            // the clamp is the ONLY defence here -- disocclusion is computed and used to KILL LOCKS, not to
            // discard history, which is what isolates what a lock removes
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, relax, w: W, h: H, alpha: 0.15, space: "ycocg" });
            hist = r.data; prevDepth = fr.depth; out = r.data;
        }
        return out;
    };
    const truth = renderFrame({ kind: "bar", occX: occAt(N - 1) }).colour;
    const prevF = renderFrame({ kind: "bar", occX: occAt(N - 2) }), nowF = renderFrame({ kind: "bar", occX: occAt(N - 1) });
    const trail = []; for (let i = 0; i < W * H; i++) if (nowF.depth[i] > 0.5 && prevF.depth[i] < 0.5) trail.push(i);
    const base = run({ life: 0, fromRing: false });
    const sf = run({ life: 8, fromRing: false }), rg = run({ life: 8, fromRing: true });
    const gBase = rmsOver(base, truth, trail), gSf = rmsOver(sf, truth, trail), gRg = rmsOver(rg, truth, trail);

    const fr7 = renderFrame({ kind: "bar", occX: occAt(7) });
    const lu = makeLumaState(W, H, P);
    { const st = makeJitterState(1);
      for (let f = 0; f < 2 * P; f++) { const j = advanceJitter(st); const f2 = renderFrame({ camX: jitterCam(j), kind: "bar", occX: occAt(7) });
          pushLuma(lu, { current: f2.colour, motion: motionFor(f2.depth, 0, 0), w: W, h: H }); } }
    const singleCount = newLocksCPU({ current: fr7.colour, w: W, h: H, margin: 0.05 }).count;
    const ringCount = lockCandidatesFromRing(lu, { margin: 0.05 }).count;
    report(`on a chequer at the pixel scale (cell 1.13 px): a single frame locks ${singleCount} of ${W * H}, the ring ${ringCount} -- the ring reduces it and does NOT solve it`);
    // *** THE HONEST NEGATIVE. *** A +/-0.5 px jitter cannot average away structure at 1.13 px, so the ring
    // mean of a Nyquist chequer is not flat and every cell reads as a ridge. There is no luma-only test that
    // separates "a thin bright feature" from "a texture at the pixel scale", because at the pixel scale they
    // are the same signal -- and v4552 established that the pictures where any of this matters are exactly the
    // high-contrast ones. The domain is named rather than papered over.
    ok(`*** and on such a picture the lock makes the ghost WORSE, not better: ${gBase.toFixed(5)} with no lock against ${gSf.toFixed(5)} (single frame) and ${gRg.toFixed(5)} (ring) -- ${((gRg / gBase - 1) * 100).toFixed(0)}% worse, which is what turning the clamp off over most of the frame costs ***`,
        gSf > gBase * 1.1 && gRg > gBase * 1.1 && ringCount > W * H * 0.3,
        `no lock ${gBase.toFixed(5)}, single ${gSf.toFixed(5)}, ring ${gRg.toFixed(5)}`);
    ok(`  so locks are for features against a background that is NOT itself at the pixel scale, and this row is the boundary rather than a bug`,
        gRg > gBase);
    // the kill rules are still gated, because a lock carried across a disocclusion relaxes the clamp on a
    // pixel whose history belongs to whatever used to be in front of it
    const killed = (() => { const ls = makeLockState(W, H); const one = new Float32Array(W * H).fill(1);
        ls.life = new Float32Array(W * H).fill(8);
        advanceLocks(ls, { motion: null, disocclusion: one, newLocks: null, w: W, h: H, life: 8 });
        return ls.life.every((v) => v === 0); })();
    ok("  a lock dies on disocclusion, and the rule is asserted rather than assumed", killed);
    const killedUnstable = (() => { const ls = makeLockState(W, H); const inst = new Float32Array(W * H).fill(0.9);
        ls.life = new Float32Array(W * H).fill(8);
        advanceLocks(ls, { motion: null, instability: inst, newLocks: null, w: W, h: H, life: 8, instabilityKill: 0.5 });
        return ls.life.every((v) => v === 0); })();
    ok("  and on instability above the caller's kill threshold, which defaults to Infinity so it is opt-in and never silent", killedUnstable);
}

console.log("\n6. THE WGSL, VALIDATED AND THEN RUN");

for (const [name, src] of [["ring push", RING_PUSH_WGSL], ["shading shift", SHADING_SHIFT_WGSL], ["ridge", RIDGE_WGSL]]) {
    const errs = validateWgsl(src);
    ok(`  ${name} validates against the spec scanner`, errs.length === 0, errs.join("; "));
}

const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** Sections 1-5 are CPU only; nothing above has run the kernels."); fails++; }
else {
    // *** THE DEVICE SECTION RUNS AT A QUARTER OF THE AREA, AND THAT IS A MEASURED DECISION. *** Seventeen
    // frames of 48x48 colour and motion is 313,000 numbers through the harness, and profiling put 25.6% of
    // this gate's runtime in serialising them -- which took the gate over the sweep's 3,000 ms budget, the
    // exact fault v4551 and v4552 both recorded (an over-budget gate is skipped, so the control stops being
    // run). The parity row asks whether the kernel computes what the CPU computes; it does not ask that at a
    // particular size, and 24x24 still spans 17 compounded reprojections over 576 pixels.
    const DW = 24, DH = 24;
    const dRender = (camX) => { const c = new Float32Array(DW * DH * 4), d = new Float32Array(DW * DH);
        for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) { const i = y * DW + x, o = i * 4;
            const wx = (2 * ((x + 0.5) / DW) - 1) * HALF + camX, wy = (1 - 2 * ((y + 0.5) / DH)) * HALF;
            const q = ((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? 0.92 : 0.06;
            c[o] = q; c[o + 1] = q * 0.55 + 0.03; c[o + 2] = 1 - q; c[o + 3] = 1;
            d[i] = (Z_BG - NEAR) / (FAR - NEAR); }
        return { colour: c, depth: d }; };
    const step = 0.35, FR = 2 * P + 1;
    const cpu = makeLumaState(DW, DH, P);
    const frames = [];
    for (let f = 0; f < FR; f++) {
        const camX = f * step, fr = dRender(camX);
        const m = motionVectorsCPU(fr.depth, DW, DH, mat4Invert(vpAt(camX)), vpAt(camX - step)).data;
        frames.push({ colour: Array.from(fr.colour), motion: Array.from(m) });
        pushLuma(cpu, { current: fr.colour, motion: m, w: DW, h: DH });
    }
    const cpuShift = shadingShiftCPU(cpu, { scale: 0.25 });
    const cpuRidge = lockCandidatesFromRing(cpu, { margin: 0.05 });
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W: DW, H: DH, P, frames, scale: 0.25, margin: 0.05 }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { RING_PUSH_WGSL, SHADING_SHIFT_WGSL, RIDGE_WGSL } = await import("/render/temporalLockWgsl.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const N = a.W * a.H, F = 2 * a.P, groups = [Math.ceil(a.W / 8), Math.ceil(a.H / 8)];
        let ringA = dev.buffer({ data: new Float32Array(N * F), usage: ["storage"] });
        let ringB = dev.buffer({ data: new Float32Array(N * F), usage: ["storage"] });
        let fillA = dev.buffer({ data: new Float32Array(N), usage: ["storage"] });
        let fillB = dev.buffer({ data: new Float32Array(N), usage: ["storage"] });
        for (let f = 0; f < a.frames.length; f++) {
            const cur = dev.buffer({ data: new Float32Array(a.frames[f].colour), usage: ["storage"] });
            const mot = dev.buffer({ data: new Float32Array(a.frames[f].motion), usage: ["storage"] });
            const ub = new ArrayBuffer(16);
            new Uint32Array(ub, 0, 4).set([a.W, a.H, a.P, f === 0 ? 1 : 0]);
            const p = dev.compute({ wgsl: RING_PUSH_WGSL });
            p.bind("cur", cur).bind("motion", mot).bind("ringIn", ringA).bind("filledIn", fillA)
             .bind("ringOut", ringB).bind("filledOut", fillB).bind("u", dev.buffer({ data: new Uint32Array(ub), usage: "uniform" }));
            dev.frame(({ pass }) => { pass.dispatch(p, groups); pass.clear([0,0,0,1]); }, { offscreen: true });
            const tr = ringA; ringA = ringB; ringB = tr;
            const tf = fillA; fillA = fillB; fillB = tf;
        }
        const sb = new ArrayBuffer(32);
        new Uint32Array(sb, 0, 4).set([a.W, a.H, a.P, 0]);
        new Float32Array(sb, 16, 4).set([a.scale, 1, 0, 0]);
        const sdst = dev.buffer({ data: new Float32Array(N), usage: ["storage"] });
        const sp = dev.compute({ wgsl: SHADING_SHIFT_WGSL });
        sp.bind("ring", ringA).bind("filled", fillA).bind("dst", sdst).bind("u", dev.buffer({ data: new Uint32Array(sb), usage: "uniform" }));
        dev.frame(({ pass }) => { pass.dispatch(sp, groups); pass.clear([0,0,0,1]); }, { offscreen: true });
        const rb = new ArrayBuffer(32);
        new Uint32Array(rb, 0, 4).set([a.W, a.H, a.P, 2]);   // the 4th slot is maxPlateau, 2 since v4556
        new Float32Array(rb, 16, 4).set([a.margin, 0, 0, 0]);
        const rdst = dev.buffer({ data: new Float32Array(N), usage: ["storage"] });
        const rp = dev.compute({ wgsl: RIDGE_WGSL });
        rp.bind("ring", ringA).bind("dst", rdst).bind("u", dev.buffer({ data: new Uint32Array(rb), usage: "uniform" }));
        dev.frame(({ pass }) => { pass.dispatch(rp, groups); pass.clear([0,0,0,1]); }, { offscreen: true });
        return { shift: Array.from(new Float32Array(await dev.read(sdst))), ridge: Array.from(new Float32Array(await dev.read(rdst))),
                 ring: Array.from(new Float32Array(await dev.read(ringA))), errs, backend: dev.backend };
    }` });
    ok("the harness ran all three kernels on a real WebGPU device",
        r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
        r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        let wr = 0; for (let i = 0; i < DW * DH * 2 * P; i++) wr = Math.max(wr, Math.abs(r.result.ring[i] - cpu.ring[i]));
        ok(`*** the device's RING is the CPU's after ${FR} frames of a moving camera -- worst ${wr.toExponential(2)}, which is ${(wr / (1 / 255)).toExponential(1)} of an 8-bit LSB, and it is ${FR} reprojections compounded ***`,
            wr < (1 / 255) / 20, `worst ${wr.toExponential(3)} over ${DW * DH * 2 * P} slots`);
        let ws = 0; for (let i = 0; i < DW * DH; i++) ws = Math.max(ws, Math.abs(r.result.shift[i] - cpuShift.data[i]));
        ok(`  and the device's shading shift matches to ${ws.toExponential(2)}`, ws < 1e-4, `worst ${ws.toExponential(3)}`);
        let bad = 0, on = 0;
        for (let i = 0; i < DW * DH; i++) { if ((r.result.ridge[i] > 0.5 ? 1 : 0) !== cpuRidge.data[i]) bad++; if (cpuRidge.data[i]) on++; }
        ok(`  and the device's RIDGE mask agrees on all ${DW * DH} pixels (${on} set) -- a decision, so anything but exact is a different answer`,
            bad === 0, `${bad} disagreements, ${on} ridges`);
    }
}

// SABOTAGE LOG -- applied to render/temporalLock.mjs, render/temporalLockWgsl.mjs and render/temporalReject.mjs
// (which gained `relax` this round), BOTH gates run -- this one and temporalReject's -- red counts summed, all
// files restored and md5-verified. Baseline 0 red. MEASURED at v4553.
//   BX the ring not reprojected, sampled at the pixel's own uv (CPU) -> 3 red. Section 3 exists for this: a
//      screen-indexed ring reports 1.26e-1 of "shading change" on a scene whose shading never changes, and all
//      of it is the camera.
//   BY lumaMean averaged over the WHOLE ring instead of the newer period -> 3 red. Subtle and plausible: it is
//      still a jitter-free mean, it is just the mean of a window that overlaps the one it is compared against,
//      so the detector reads half the signal and half the lag.
//   BZ the shift reading the newest FRAME against the older window's mean -> 2 red. This is the halfway house
//      between v4552's detector and this one, and it fails for v4552's reason: one side still carries jitter.
//   CA a not-yet-full ring reported as clean rather than unknown -> 5 red, the widest of the set. An absence
//      read as a pass is v4402's fault and it reaches every row that runs a sequence from a cold start.
//   CB the ridge test requiring BOTH axes instead of either -> 3 red. *** THIS WAS THE FIRST DRAFT'S ACTUAL
//      BUG, kept as a sabotage rather than quietly fixed. *** A pixel on a straight thin line is never an
//      extremum along the line's own direction, so requiring both axes finds nothing on any straight feature --
//      and it measured 1.00x against no lock at all, which reads as a feature that simply does not help.
//   CC the disocclusion kill rule removed -> 1 red. One row, and that is the honest count: nothing else in
//      this gate arranges a lock that outlives its surface.
//   CD `relax` ignored, the clamp always hard (in temporalReject.mjs) -> 3 red. Worth noting that before the
//      parameter existed, passing it did nothing and the lock measured 1.00x -- a silently ignored option is
//      indistinguishable from a feature that does not work, and the measurement is what told them apart.
//   CE the ring not reprojected in the WGSL ONLY -> 3 red, caught by the device-parity row over 17 frames of a
//      moving camera. Deliberately one-sided, because v4552's two 0-REDs and v4551's one were all changes made
//      to BOTH sides that left the mirror agreeing.
//   CF the WGSL shift halved (WGSL only) -> 1 red.
//   CG the scratch pair pointed AT the live ring, so the push reads and writes one buffer -> 1 red, AFTER this
//      round added the double-buffer rows. *** IT WENT 0-RED FIRST AND IT WAS THIS ROUND'S OWN OPTIMISATION
//      THAT INTRODUCED IT. *** pushLuma was changed to swap a scratch pair rather than allocate 147 KB a frame,
//      because the gate came in at 3,180 ms against a 3,000 ms sweep budget -- the exact fault v4551 and v4552
//      both recorded. Aliasing the two changed NOTHING anywhere: with zero motion the reprojection is the
//      identity so each pixel only shifts its own slots, and even the moving-camera section happened to read
//      pixels in a surviving order. The rows added for it compare the swapped ring against one allocated fresh
//      every frame (bit-identical over 18 frames) and assert the two buffers stay distinct.
//   CH the swap replaced by a fresh allocation each frame -> 0 red, AND THAT IS THE RIGHT ANSWER, recorded so
//      it is not mistaken for a gap. Reallocating is behaviour-preserving; it is only slower. Performance is
//      held by tools/ship/sweep-timings.json and the sweep's budget, not by a correctness row, and a gate that
//      went red on a slower-but-identical implementation would be asserting something it cannot measure.
//   No 0-RED among the ten once CG's rows exist, and CH's zero is a property rather than a hole.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a lock detector that CAN separate a thin feature from a pixel-scale texture -- " +
    "section 5 shows luma alone cannot, and FSR2 leans on depth and on material information this tree does not " +
    "carry into the pass; the ring at an upscale ratio other than 1, where jitterPhaseCount is larger and the " +
    "ring costs 2*P floats per pixel; a MOVING object rather than a moving camera, since motion vectors here " +
    "come from camera translation only; and the memory this rung spends, which is 2*P scalars per pixel and " +
    "is the reason FSR2 uses 4 rather than the phase count -- section 1 prices that choice but nothing here " +
    "argues the other side of it.");
process.exit(fails ? 1 : 0);
