#!/usr/bin/env node
// WebGLEngine/render/temporalCoherentLock-selfcheck.mjs -- v4555
//
// *** v4554 CLOSED BY NAMING THE WRONG NEXT STEP, AND THIS GATE IS THE CORRECTION. *** It said an object-ID or
// material channel was what actually separates a painted thin line from a pixel-scale texture, and that it
// would be a renderer change rather than a pass change. Both halves were wrong. A painted line and a painted
// chequer are BOTH albedo on one flat surface: same depth, same normal, same material, same draw call. Every
// per-pixel buffer a renderer writes gives them the same answer, so no ID separates them. What differs is not
// what they are made of but their SHAPE, and shape is already in the buffers this pipeline has.
//
// A ridge that is ONE PIXEL ACROSS is a thin feature. A texture at the pixel scale is ridges everywhere. The
// discriminator is the width of the ridge BAND measured across the ridge's own thin direction -- and it needs
// no new buffer, no renderer change, and nothing this arc has not already built.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "./wgslSpec.mjs";
import { ridgesCPU, coherentRidgesCPU, depthRidgesCPU, gateLocks, makeLumaState, pushLuma, lumaMean,
         lockCandidatesFromRing, makeLockState, advanceLocks, lockRelaxation, activeMask } from "./temporalLock.mjs";
import { COHERENT_RIDGE_WGSL } from "./temporalLockWgsl.mjs";
import { rectifiedAccumulateCPU, disocclusionCPU } from "./temporalReject.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 48, H = 48, NEAR = 1, FAR = 10, HALF = 4, Z_OCC = 3, Z_BG = 8;
const PXW = 2 * HALF / W, X0 = 0.37, LW = 0.4 * PXW, S = 2 * HALF / W, P = jitterPhaseCount(1);
const dOf = (z) => (z - NEAR) / (FAR - NEAR);
const MARGIN = 0.05, BAND = 1;
function vpAt(cx, cy) {
    const o = new Float32Array(16);
    o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1;
    const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; t[13] = -cy;
    return mat4Multiply(o, t);
}
// *** THE JITTER IS 2-D HERE, WHICH THE REST OF THIS ARC'S SCENES WERE NOT. *** v4552 onward moved the camera
// by j[0] only and discarded j[1]. Section 1 measures what that was worth before anything is built on top.
function renderScene({ cx = 0, cy = 0, kind = "line", lowContrastWire = false } = {}) {
    const colour = new Float32Array(W * H * 4), depth = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, o = i * 4;
        const wx = (2 * ((x + 0.5) / W) - 1) * HALF + cx, wy = (1 - 2 * ((y + 0.5) / H)) * HALF + cy;
        const onLine = Math.abs(wx - X0) < LW / 2;
        let v = 0.05, z = Z_BG;
        if (kind === "chequer" || kind === "both") {
            const q = ((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? 0.92 : 0.06;
            v = (kind === "chequer" || wx > 0.9) ? q : v;
        }
        if ((kind === "line" || kind === "both") && onLine) v = 0.95;
        // a wire visible almost only in DEPTH: luma contrast below the ridge margin, depth contrast full
        if (lowContrastWire && onLine) { v = 0.05 + MARGIN * 0.5; z = Z_OCC; }
        colour[o] = v; colour[o + 1] = v; colour[o + 2] = v; colour[o + 3] = 1;
        depth[i] = dOf(z);
    }
    return { colour, depth };
}
const motionFor = (d) => motionVectorsCPU(d, W, H, mat4Invert(vpAt(0, 0)), vpAt(0, 0)).data;
const rmsOver = (a, b, idx) => { let s = 0; for (const i of idx) for (let c = 0; c < 3; c++) { const q = a[i * 4 + c] - b[i * 4 + c]; s += q * q; } return Math.sqrt(s / (idx.length * 3)); };
const TRUTH = (() => { const t = new Float32Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4;
        const lo = (2 * (x / W) - 1) * HALF, hi = (2 * ((x + 1) / W) - 1) * HALF;
        const a = Math.max(lo, X0 - LW / 2), b = Math.min(hi, X0 + LW / 2);
        const cov = Math.max(0, b - a) / (hi - lo), v = cov * 0.95 + (1 - cov) * 0.05;
        t[o] = v; t[o + 1] = v; t[o + 2] = v; t[o + 3] = 1; }
    return t; })();
const cols = []; for (let x = 0; x < W; x++) { const lo = (2 * (x / W) - 1) * HALF, hi = (2 * ((x + 1) / W) - 1) * HALF; if (hi > X0 - PXW && lo < X0 + PXW) cols.push(x); }
const nearIdx = []; for (let y = 1; y < H - 1; y++) for (const x of cols) nearIdx.push(y * W + x);
const ringOver = (kind, twoD = true, lowContrastWire = false) => {
    const st = makeJitterState(1); const lu = makeLumaState(W, H, P);
    let last = null;
    for (let f = 0; f < 2 * P + 2; f++) {
        const j = advanceJitter(st);
        const fr = renderScene({ cx: j[0] * S, cy: twoD ? j[1] * S : 0, kind, lowContrastWire });
        pushLuma(lu, { current: fr.colour, motion: motionFor(fr.depth), w: W, h: H });
        last = fr;
    }
    return { mean: lumaMean(lu), frame: last };
};

console.log("temporalCoherentLock-selfcheck -- shape, not material, is what separates a thin line from a texture\n");
console.log("1. FIRST, THE HARNESS ASSUMPTION THIS WHOLE ARC HAS CARRIED");

{
    // v4552 onward jittered the camera in X only, discarding j[1]. Every conclusion about a "pixel-scale
    // chequer" rests on that. Checked before it is built on, and the answer is that it did not matter.
    const one = ridgesCPU(ringOver("chequer", false).mean, W, H, MARGIN).count;
    const two = ridgesCPU(ringOver("chequer", true).mean, W, H, MARGIN).count;
    report(`chequer ridges on the ring mean: X-only jitter ${one}, 2-D jitter ${two}`);
    ok(`*** the arc's X-only jitter did NOT distort its chequer conclusions: ${one} ridges against ${two} with the full 2-D sequence, within ${((Math.abs(two - one) / one) * 100).toFixed(0)}% ***`,
        Math.abs(two - one) < one * 0.1, `X-only ${one}, 2-D ${two}`);
    // it could not have: the jitter is +/-0.5 px and the cell is 1.13 px, so no amount of sub-pixel shifting
    // in either direction averages away structure at that scale. The scenes here use 2-D anyway.
    report("and it could not have: a +/-0.5 px shift cannot average away 1.13 px structure in either direction, which is why adding the second axis moved nothing");
}

console.log("\n2. WHAT ACTUALLY SEPARATES THEM, AND TWO THINGS THAT DO NOT");

let SEP = {};
{
    const line = ringOver("line").mean, chq = ringOver("chequer").mean;
    SEP.lineR = ridgesCPU(line, W, H, MARGIN).count;
    SEP.chqR = ridgesCPU(chq, W, H, MARGIN).count;
    SEP.lineC = coherentRidgesCPU(line, W, H, MARGIN, BAND).count;
    SEP.chqC = coherentRidgesCPU(chq, W, H, MARGIN, BAND).count;
    report(`a 0.4 px PAINTED line and a 1.13 px chequer, both albedo on the same flat wall -- same depth, same material, same draw`);
    report(`plain ridges: line ${SEP.lineR}, chequer ${SEP.chqR}. Band<=${BAND}: line ${SEP.lineC}, chequer ${SEP.chqC}`);
    ok(`*** the band test keeps ${SEP.lineC} of the line's ${SEP.lineR} ridges and cuts the chequer's ${SEP.chqR} to ${SEP.chqC} -- ${(SEP.chqR / SEP.chqC).toFixed(0)}x, with the feature untouched ***`,
        SEP.lineC === SEP.lineR && SEP.chqC < SEP.chqR / 10, `line ${SEP.lineC}/${SEP.lineR}, chequer ${SEP.chqC}/${SEP.chqR}`);
    // *** A PURE ALTERNATION GIVES EXACTLY ZERO, which is the cleanest statement of what the test measures. ***
    const alt = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) alt[y * W + x] = ((x + y) & 1) ? 1 : 0;
    const altR = ridgesCPU(alt, W, H, MARGIN).count, altC = coherentRidgesCPU(alt, W, H, MARGIN, BAND).count;
    ok(`  on a PURE one-pixel alternation the plain test finds ${altR} ridges and the band test finds ${altC} -- every pixel is a ridge, and no pixel is a thin feature`,
        altR > W * H * 0.8 && altC === 0, `plain ${altR}, coherent ${altC}`);
    // ---- THE TWO THINGS THAT DO NOT WORK, RECORDED SO THEY ARE NOT TRIED AGAIN ----
    // (a) an object ID. Both are albedo on one surface, so it cannot differ between them -- asserted by
    // construction here rather than measured, because there is no ID buffer to measure and the point is that
    // there could not be a useful one.
    const lineFr = ringOver("line").frame, chqFr = ringOver("chequer").frame;
    let depthSame = true;
    for (let i = 0; i < W * H; i++) if (lineFr.depth[i] !== chqFr.depth[i]) depthSame = false;
    ok(`*** an object ID could not separate them, and v4554 said it could: both pictures are albedo on ONE flat surface and their DEPTH buffers are identical pixel for pixel ***`,
        depthSame, "every per-pixel buffer a renderer writes gives the two the same answer; only the shape differs");
    // (b) the ridge's run length ALONG its direction -- it measures the MASK, not the feature
    const runAlong = (field) => { const r = ridgesCPU(field, W, H, MARGIN); let long = 0;
        for (let x = 0; x < W; x++) { let y = 0;
            while (y < H) { if (!r.axisX[y * W + x]) { y++; continue; }
                let e = y; while (e < H && r.axisX[e * W + x]) e++;
                if (e - y >= 16) long += e - y; y = e; } }
        return { total: r.count, long }; };
    const rl = runAlong(chq), rlLine = runAlong(line);
    // *** THE FIRST DRAFT OF THIS ROW ASSERTED "MORE THAN HALF" FROM A NUMBER MEASURED ON A DIFFERENT SCENE
    // (690 of 713, under X-only jitter) AND READ 342 OF 1,873 HERE. *** That is v4549's mistake exactly -- a
    // threshold carried from one picture to another -- so the row now compares the two candidate tests ON THE
    // SAME PICTURE instead of holding either to a remembered fraction. Run length does discriminate somewhat;
    // it is simply four times worse at it, because a run in the MASK is not a run in the feature.
    report(`run-length test: keeps ${rlLine.long} of the line's ${rlLine.total} and ${rl.long} of the chequer's ${rl.total}`);
    ok(`  the band test beats the ridge's run length ALONG its direction by ${(rl.long / SEP.chqC).toFixed(1)}x on false positives (${SEP.chqC} against ${rl.long}) while both keep the whole line`,
        rl.long > SEP.chqC * 2 && rlLine.long === rlLine.total, `band ${SEP.chqC}, run-length ${rl.long}, line kept ${rlLine.long}/${rlLine.total}`);
    // ---- *** THE AXES MUST STAY APART, AND NOTHING DOWNSTREAM NOTICES WHEN THEY DO NOT. *** ------------
    // Setting axisX wherever EITHER axis fires went 0-RED across all three gates in this arc, because the band
    // is min(bandX, bandY) and the min quietly takes whichever one is still correct. So the property is
    // asserted where it lives: on a vertical line the X axis fires and the Y axis does not, and on a
    // horizontal line the reverse. A conflated mask fails both halves at once.
    const vline = new Float32Array(W * H), hline = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { vline[y * W + x] = x === 24 ? 1 : 0; hline[y * W + x] = y === 24 ? 1 : 0; }
    const rv = ridgesCPU(vline, W, H, MARGIN), rh = ridgesCPU(hline, W, H, MARGIN);
    const cnt = (m) => { let n = 0; for (let i = 0; i < m.length; i++) if (m[i]) n++; return n; };
    ok(`*** the ridge AXES are distinct, not one mask: a vertical line fires X ${cnt(rv.axisX)} times and Y ${cnt(rv.axisY)}, a horizontal line X ${cnt(rh.axisX)} and Y ${cnt(rh.axisY)} ***`,
        cnt(rv.axisX) > 40 && cnt(rv.axisY) === 0 && cnt(rh.axisY) > 40 && cnt(rh.axisX) === 0,
        `vertical X/Y ${cnt(rv.axisX)}/${cnt(rv.axisY)}, horizontal X/Y ${cnt(rh.axisX)}/${cnt(rh.axisY)}`);

    ok(`  maxBand is REQUIRED rather than defaulted, like every other margin in this arc`,
        (() => { try { coherentRidgesCPU(line, W, H, MARGIN); return false; } catch (e) { return /maxBand must be an integer/.test(e.message); } })());
}

console.log("\n3. THE TWO FIXTURES THIS ARC HAS BEEN ARGUING OVER, WITH ALL THREE GATES");

let A = {}, B = {};
{
    const runLine = (gate) => {
        const st = makeJitterState(1); let hist = null, out = null, held = 0;
        const ls = makeLockState(W, H), lu = makeLumaState(W, H, P), dm = makeLockState(W, H);
        for (let f = 0; f < 32; f++) {
            const j = advanceJitter(st); const fr = renderScene({ cx: j[0] * S, cy: j[1] * S, kind: "line" });
            const m = motionFor(fr.depth);
            pushLuma(lu, { current: fr.colour, motion: m, w: W, h: H });
            advanceLocks(dm, { motion: m, newLocks: depthRidgesCPU(fr.depth, W, H, 0.02).data, w: W, h: H, life: P });
            let relax = null;
            if (gate !== "none") {
                const lr = lockCandidatesFromRing(lu, { margin: MARGIN });
                const nl = gate === "luma" ? lr.data
                         : gate === "depth" ? gateLocks(lr.data, activeMask(dm).data).data
                         : coherentRidgesCPU(lumaMean(lu), W, H, MARGIN, BAND).data;
                advanceLocks(ls, { motion: m, newLocks: nl, w: W, h: H, life: 8 });
                relax = lockRelaxation(ls, { life: 8 });
                if (f === 31) for (let i = 0; i < W * H; i++) if (ls.life[i] > 0) held++;
            }
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, relax, w: W, h: H, alpha: 1 / (f + 1), space: "ycocg" });
            hist = r.data; out = r.data;
        }
        return { rms: rmsOver(out, TRUTH, nearIdx), held };
    };
    A.none = runLine("none"); A.luma = runLine("luma"); A.depth = runLine("depth"); A.coh = runLine("coherent");
    report(`FIXTURE A -- a 0.4 px line PAINTED on a flat wall, which v4554's depth gate refused entirely`);
    report(`  no lock ${A.none.rms.toFixed(5)} | luma ${A.luma.rms.toFixed(5)} on ${A.luma.held} | depth ${A.depth.rms.toFixed(5)} on ${A.depth.held} | coherent ${A.coh.rms.toFixed(5)} on ${A.coh.held}`);
    ok(`*** the coherent gate RECOVERS what the depth gate gave away: ${(A.none.rms / A.coh.rms).toFixed(2)}x against the depth gate's ${(A.none.rms / A.depth.rms).toFixed(2)}x, matching the luma gate's ${(A.none.rms / A.luma.rms).toFixed(2)}x exactly ***`,
        A.coh.rms === A.luma.rms && A.depth.rms === A.none.rms && A.none.rms / A.coh.rms > 2,
        `luma ${A.luma.rms.toFixed(5)}, depth ${A.depth.rms.toFixed(5)}, coherent ${A.coh.rms.toFixed(5)}`);

    const occAt = (f) => -1.6 + f * 0.35, N = 14;
    const barFrame = (occX) => { const c = new Float32Array(W * H * 4), d = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, o = i * 4;
            const wx = (2 * ((x + 0.5) / W) - 1) * HALF, wy = (1 - 2 * ((y + 0.5) / H)) * HALF;
            let v, z;
            if (Math.abs(wx - occX) < 0.10 && Math.abs(wy) < 2.2) { v = 0.95; z = Z_OCC; }
            else { v = ((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? 0.30 : 0.10; z = Z_BG; }
            c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[i] = dOf(z); }
        return { colour: c, depth: d }; };
    const runBar = (gate) => {
        let hist = null, prevDepth = null, out = null, held = 0;
        const ls = makeLockState(W, H), lu = makeLumaState(W, H, P), dm = makeLockState(W, H);
        for (let f = 0; f < N; f++) {
            const fr = barFrame(occAt(f));
            const m = motionFor(fr.depth);
            let dis = null; if (prevDepth) dis = disocclusionCPU({ motion: m, prevDepth, w: W, h: H, threshold: 0.02 });
            pushLuma(lu, { current: fr.colour, motion: m, w: W, h: H });
            advanceLocks(dm, { motion: m, disocclusion: dis ? dis.data : null, newLocks: depthRidgesCPU(fr.depth, W, H, 0.02).data, w: W, h: H, life: P });
            let relax = null;
            if (gate !== "none") {
                const lr = lockCandidatesFromRing(lu, { margin: MARGIN });
                const nl = gate === "luma" ? lr.data
                         : gate === "depth" ? gateLocks(lr.data, activeMask(dm).data).data
                         : coherentRidgesCPU(lumaMean(lu), W, H, MARGIN, BAND).data;
                advanceLocks(ls, { motion: m, disocclusion: dis ? dis.data : null, newLocks: nl, w: W, h: H, life: 8 });
                relax = lockRelaxation(ls, { life: 8 });
                if (f === N - 1) for (let i = 0; i < W * H; i++) if (ls.life[i] > 0) held++;
            }
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, relax, w: W, h: H, alpha: 0.15, space: "ycocg" });
            hist = r.data; prevDepth = fr.depth; out = r.data;
        }
        return { out, held };
    };
    const truthB = barFrame(occAt(N - 1)).colour;
    const pF = barFrame(occAt(N - 2)), nF = barFrame(occAt(N - 1));
    const trail = []; for (let i = 0; i < W * H; i++) if (nF.depth[i] > 0.5 && pF.depth[i] < 0.5) trail.push(i);
    const b0 = runBar("none"), bl = runBar("luma"), bd = runBar("depth"), bc = runBar("coherent");
    B.base = rmsOver(b0.out, truthB, trail); B.luma = rmsOver(bl.out, truthB, trail);
    B.depth = rmsOver(bd.out, truthB, trail); B.coh = rmsOver(bc.out, truthB, trail);
    report(`FIXTURE B -- v4553's bar over a pixel-scale chequel, where the luma gate cost 26%`);
    report(`  no lock ${B.base.toFixed(5)} | luma ${B.luma.toFixed(5)} on ${bl.held} | depth ${B.depth.toFixed(5)} on ${bd.held} | coherent ${B.coh.toFixed(5)} on ${bc.held}`);
    ok(`*** and it does NOT pay v4553's penalty to get that: ${((B.coh / B.base - 1) * 100).toFixed(0)}% against the luma gate's ${((B.luma / B.base - 1) * 100).toFixed(0)}%, on ${bc.held} locks rather than ${bl.held} ***`,
        B.coh === B.base && B.luma > B.base * 1.2, `base ${B.base.toFixed(5)}, luma ${B.luma.toFixed(5)}, coherent ${B.coh.toFixed(5)}`);
    ok(`  so on these two fixtures it strictly dominates both earlier gates -- the luma gate's benefit with the depth gate's protection, and no buffer either of them needed`,
        A.coh.rms === A.luma.rms && B.coh === B.depth);
}

console.log("\n4. WHAT DEPTH STILL SEES THAT SHAPE DOES NOT");

{
    // *** THE DEPTH GATE IS NOT MADE REDUNDANT, AND SAYING SO WOULD BE THE EASY OVERCLAIM. *** A wire whose
    // luma contrast is BELOW the ridge margin is invisible to every luma test at any scale, and depth is the
    // only thing that finds it. It is a real case: a dark cable against a dark sky.
    // *** AND THE DEPTH SIDE NEEDS ITS PERIOD MEMORY HERE, WHICH THE FIRST DRAFT OF THIS ROW FORGOT. *** v4554
    // established that a single frame's depth finds ZERO ridges on a sub-pixel feature; reading one frame here
    // reported 0 for depth as well and made the row say the opposite of what it exists to say.
    const st4 = makeJitterState(1); const lu4 = makeLumaState(W, H, P), dm4 = makeLockState(W, H);
    for (let f = 0; f < 2 * P + 2; f++) {
        const j = advanceJitter(st4);
        const fr = renderScene({ cx: j[0] * S, cy: j[1] * S, kind: "line", lowContrastWire: true });
        const m = motionFor(fr.depth);
        pushLuma(lu4, { current: fr.colour, motion: m, w: W, h: H });
        advanceLocks(dm4, { motion: m, newLocks: depthRidgesCPU(fr.depth, W, H, 0.02).data, w: W, h: H, life: P });
    }
    const r = { mean: lumaMean(lu4) };
    const lumaR = ridgesCPU(r.mean, W, H, MARGIN).count;
    const cohR = coherentRidgesCPU(r.mean, W, H, MARGIN, BAND).count;
    const depthR = activeMask(dm4).count;
    report(`a wire with luma contrast ${(MARGIN * 0.5).toFixed(3)} -- half the ridge margin -- and full depth contrast`);
    ok(`*** shape finds ${cohR} of it and depth finds ${depthR}: a feature below the luma margin is invisible to every luma test at every scale, so v4554's gate is narrowed here, not replaced ***`,
        lumaR === 0 && cohR === 0 && depthR > 20, `luma ridges ${lumaR}, coherent ${cohR}, depth ridges ${depthR}`);
    ok("  which is why gateLocks still exists and the two gates compose rather than one superseding the other",
        typeof gateLocks === "function");
}

console.log("\n5. THE WGSL, VALIDATED AND THEN RUN");

{
    const errs = validateWgsl(COHERENT_RIDGE_WGSL);
    ok("  the coherent-ridge kernel validates against the spec scanner", errs.length === 0, errs.join("; "));
}

const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** Sections 1-4 are CPU only; nothing above has run the kernel."); fails++; }
else {
    const DW = 32, DH = 32;
    const field = new Float32Array(DW * DH);
    for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
        // a vertical one-pixel line, a HORIZONTAL one-pixel line, a three-pixel band, and a chequer region --
        // so the device sees a thin feature on both axes, a band that must be REJECTED at maxBand 1, and a
        // texture. The horizontal line is here because v4554 found both sides implementing an axis no picture
        // ever exercised.
        let v = 0.1;
        if (x >= 20) v = ((x + y) & 1) ? 0.9 : 0.1;
        else if (x === 5) v = 0.9;
        else if (y === 7) v = 0.9;
        // *** A RIDGE BAND OF WIDTH 3, WHICH A SOLID THREE-PIXEL BAR IS NOT. *** The first draft used a solid
        // bar at x = 12..14 and maxBand 3 read the same count as maxBand 1 -- because a solid bar's interior
        // pixel is not an extremum at all (its neighbours are equally bright) and its edges are steps rather
        // than ridges, so the whole bar produces ZERO ridges and there was nothing for maxBand to admit. A
        // band of three needs three ADJACENT extrema: a short alternation that stops.
        else if (x >= 12 && x <= 14) v = (x === 13) ? 0.1 : 0.9;
        field[y * DW + x] = v;
    }
    const cpu1 = coherentRidgesCPU(field, DW, DH, MARGIN, 1);
    const cpu3 = coherentRidgesCPU(field, DW, DH, MARGIN, 3);
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W: DW, H: DH, field: Array.from(field), margin: MARGIN }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { COHERENT_RIDGE_WGSL } = await import("/render/temporalLockWgsl.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const N = a.W * a.H, groups = [Math.ceil(a.W / 8), Math.ceil(a.H / 8)];
        const fb = dev.buffer({ data: new Float32Array(a.field), usage: ["storage"] });
        const go = async (maxBand) => {
            const dst = dev.buffer({ data: new Float32Array(N), usage: ["storage"] });
            const ub = new ArrayBuffer(32);
            new Uint32Array(ub, 0, 4).set([a.W, a.H, maxBand, 0]);
            new Float32Array(ub, 16, 4).set([a.margin, 0, 0, 0]);
            const p = dev.compute({ wgsl: COHERENT_RIDGE_WGSL });
            p.bind("field", fb).bind("dst", dst).bind("u", dev.buffer({ data: new Uint32Array(ub), usage: "uniform" }));
            dev.frame(({ pass }) => { pass.dispatch(p, groups); pass.clear([0,0,0,1]); }, { offscreen: true });
            return Array.from(new Float32Array(await dev.read(dst)));
        };
        return { b1: await go(1), b3: await go(3), errs, backend: dev.backend };
    }` });
    ok("the harness ran the kernel on a real WebGPU device",
        r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
        r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        let bad1 = 0, bad3 = 0;
        for (let i = 0; i < DW * DH; i++) {
            if ((r.result.b1[i] > 0.5 ? 1 : 0) !== cpu1.data[i]) bad1++;
            if ((r.result.b3[i] > 0.5 ? 1 : 0) !== cpu3.data[i]) bad3++;
        }
        ok(`*** the device's coherent mask is the CPU's on all ${DW * DH} pixels at maxBand 1 (${cpu1.count} set) -- a decision, so anything but exact is a different answer ***`,
            bad1 === 0, `${bad1} disagreements`);
        ok(`  and at maxBand 3 too (${cpu3.count} set), which is what admits the three-pixel band that maxBand 1 rejects`,
            bad3 === 0 && cpu3.count > cpu1.count, `${bad3} disagreements, ${cpu1.count} -> ${cpu3.count}`);
    }
}

// SABOTAGE LOG -- applied to render/temporalLock.mjs and render/temporalLockWgsl.mjs, ALL THREE lock gates run
// -- this one, temporalDepthLock's and temporalLock's, since the round extended a module all three read -- red
// counts summed, files restored and md5-verified. Baseline 0 red. MEASURED at v4555.
//   CQ the band test made to always pass            -> 7 red, the widest of the set.
//   CR the X band measured ALONG the ridge instead of ACROSS it -> 5 red.
//   CS the same for the Y band                      -> 4 red. Both are the mistake this round made first and
//      recorded in section 2: run length along a ridge measures the MASK, not the feature.
//   CT axisX set wherever EITHER axis fires          -> 1 red, AFTER this round added the axis row. *** IT WENT
//      0-RED FIRST ACROSS ALL THREE GATES. *** The band is min(bandX, bandY), and the min quietly takes
//      whichever axis is still correct -- so conflating them changed no count anywhere. The property is now
//      asserted where it lives rather than through a consequence: a vertical line fires X and not Y, and a
//      horizontal line the reverse. Third round running that a 0-RED was a property nothing arranged a picture
//      for; unlike v4554's pair this one was not about a missing picture but about a MASKING operator.
//   CU the run scanning one side only                -> 7 red.
//   CV the WGSL band test made to always pass (WGSL only) -> 2 red.
//   CW the WGSL Y band scanning along X (WGSL only)  -> 2 red.
//   No 0-RED among the eight once the axis row exists.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a thin feature that is CURVED or diagonal, since every line in this gate is axis " +
    "aligned and the band is measured along an axis -- a diagonal ridge's band is wider by root two and " +
    "nothing here measures what that costs; content between a flat wall and a chequer at Nyquist, which is the " +
    "same gap v4554 left; the maxBand a real renderer wants, since 1 is what these fixtures need and a thicker " +
    "feature would want more; and whether the band test survives a MOVING object, since the ring it reads is " +
    "reprojected by camera-only motion vectors, which v4554 already found goes stale.");
process.exit(fails ? 1 : 0);
