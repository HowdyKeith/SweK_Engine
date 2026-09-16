#!/usr/bin/env node
// WebGLEngine/render/temporalReject-selfcheck.mjs -- v4552
//
// THE LAST FOUR ITEMS ON THE TEMPORAL LIST: disocclusion, reactive masks, shading-change detection, and the
// YCoCg box FSR rectifies in. Three of them ship. The fourth is REFUSED HERE, by measurement, and section 4 is
// the row that keeps it refused.
//
// *** THE FINDING THAT ORGANISES ALL OF THEM: A NEIGHBOURHOOD CLAMP FAILS BY BEING TOO WIDE, NOT TOO TIGHT. ***
// v4550 measured this from the other side without naming it -- its anti-ghosting row could clear 2,304 pixels of
// 2,304 down to 322, and the 322 left were the EDGE pixels, where the current 3x3 spans the range and the ghost
// is a value that could legitimately be there. So every picture in this gate is deliberately HIGH CONTRAST: on a
// flat picture the clamp already does the work and any of these features would read as an improvement it is not.
// The mean 3x3 span here is measured and reported rather than assumed.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "./wgslSpec.mjs";
import { rgbToYCoCg, yCoCgToRgb, luma, disocclusionCPU, historyFactorCPU, rectifiedAccumulateCPU, CLAMP_SPACES } from "./temporalReject.mjs";
import { DISOCCLUSION_WGSL, RECTIFY_WGSL } from "./temporalRejectWgsl.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter } from "./jitter.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

// ---- THE SCENE: an occluder sweeping over a high-contrast background, orthographic so the unprojection is
// exact and the motion vectors can be checked by arithmetic rather than by eye.
const W = 48, H = 48, NEAR = 1, FAR = 10, HALF = 4, Z_OCC = 3, Z_BG = 8;
const dOf = (z) => (z - NEAR) / (FAR - NEAR);
function vpAt(camX) {
    const o = new Float32Array(16);
    o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1;
    const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -camX;
    return mat4Multiply(o, t);
}
function renderFrame({ camX = 0, occX = -9, mono = false, light = 1, particle = null, tilt = 0 } = {}) {
    const colour = new Float32Array(W * H * 4), depth = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, o = i * 4;
        const wx = (2 * ((x + 0.5) / W) - 1) * HALF + camX, wy = (1 - 2 * ((y + 0.5) / H)) * HALF;
        let rgb, z;
        if (Math.abs(wx - occX) < 1.1 && Math.abs(wy) < 2.2) { rgb = mono ? [0.60, 0.25, 0.25] : [0.95, 0.15, 0.15]; z = Z_OCC; }
        else {
            // *** 5.3 AND NOT 6, AND THAT IS A BUG THIS GATE ALREADY HAD. *** At 6 the chequer cell is exactly
            // ONE pixel wide and phase-locked to the pixel grid: a pixel centre sits at the middle of a cell, so
            // a jitter of +/-0.5 px REACHES the cell boundary and never crosses it, and 32 jittered frames came
            // out bit-identical. The static-convergence row read rms 0 for every variant and looked like a pass.
            // A picture with nothing to average is not a test of an averaging pass. 5.3 puts the cell at 1.13 px,
            // near Nyquist and not commensurate with the grid, which is the content temporal AA exists for.
            const c = ((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? (mono ? 0.85 : 0.92) : (mono ? 0.15 : 0.06);
            rgb = mono ? [c, c, c] : [c, c * 0.55 + 0.03, 1 - c];
            // a gentle tilt puts SMALL depth differences between neighbouring texels -- what the threshold
            // exists to tolerate, and what a scene with one flat background can never produce
            z = Z_BG + tilt * wx;
        }
        rgb = rgb.map((v) => v * light);
        if (particle && particle.test(x, y)) rgb = particle.rgb.slice();
        colour[o] = rgb[0]; colour[o + 1] = rgb[1]; colour[o + 2] = rgb[2]; colour[o + 3] = 1;
        depth[i] = dOf(z);
    }
    return { colour, depth };
}
const motionFor = (depth, camX, camXPrev) => motionVectorsCPU(depth, W, H, mat4Invert(vpAt(camX)), vpAt(camXPrev)).data;
const rmsOver = (a, b, idx) => { let s = 0; for (const i of idx) for (let c = 0; c < 3; c++) { const d = a[i * 4 + c] - b[i * 4 + c]; s += d * d; } return Math.sqrt(s / (idx.length * 3)); };
const ALL = [...Array(W * H).keys()];
const occAt = (f) => -1.6 + f * 0.35;
const meanSpan = (buf, ch) => { let s = 0, n = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { let lo = 9, hi = -9;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = buf[((y + dy) * W + (x + dx)) * 4 + ch]; if (v < lo) lo = v; if (v > hi) hi = v; }
        s += hi - lo; n++; }
    return s / n; };

console.log("temporalReject-selfcheck -- the last four temporal items, three shipped and one refused\n");
console.log("1. THE COLOUR SPACE: exactly invertible, and a box that is not what the folklore says");

{
    let worst = 0, n = 0, exact = 0;
    let rng = 987654321; const rnd = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let t = 0; t < 20000; t++) {
        const r = rnd(), g = rnd(), b = rnd();
        const y = rgbToYCoCg(r, g, b), back = yCoCgToRgb(y[0], y[1], y[2]);
        const e = Math.max(Math.abs(back[0] - r), Math.abs(back[1] - g), Math.abs(back[2] - b));
        if (e === 0) exact++;
        worst = Math.max(worst, e); n++;
    }
    // *** THIS ROW WAS WRITTEN CLAIMING BIT EXACTNESS AND THE MEASUREMENT SAID OTHERWISE. *** The reasoning
    // was that every coefficient is a negative power of two, so each product is exactly representable -- true,
    // and not enough: the SUMS round. 42% of colours return bit exact and the rest are one ulp out. The
    // concern the claim was defending is real -- this space sits inside a feedback loop, and a per-frame loss
    // would compound -- so the answer is to measure the compounding rather than to assert it away: one ulp
    // over the longest accumulation in this tree (32 frames) is 7.1e-15, which is 1.8e-12 of an 8-bit LSB.
    // (The integer YCoCg-R lifting scheme IS exactly reversible; this float form is not, and calling it so
    // would have been a claim nobody had run.)
    ok(`*** the YCoCg round trip is exact for ${(exact / n * 100).toFixed(1)}% of ${n} random colours and ONE ULP for the rest -- worst ${worst.toExponential(2)}, which is ${(worst * 32 / (1 / 255)).toExponential(1)} of an 8-bit LSB after 32 frames ***`,
        worst <= Number.EPSILON && exact > n * 0.3, `worst ${worst.toExponential(3)} = ${(worst / Number.EPSILON).toFixed(2)} ulp, exact ${exact}/${n}`);
    ok("  and luma() is the transform's own first axis, not a second definition of brightness",
        luma(0.3, 0.7, 0.2) === rgbToYCoCg(0.3, 0.7, 0.2)[0]);
    ok("  and the space is refused by name rather than silently defaulted",
        (() => { try { rectifiedAccumulateCPU({ current: new Float32Array(4), history: null, w: 1, h: 1, alpha: 1, space: "hsv" }); return false; }
                 catch (e) { return /space must be one of/.test(e.message) && CLAMP_SPACES.length === 2; } })());

    // WHAT THE TWO BOXES ACTUALLY ADMIT. The usual claim is that the YCoCg box is TIGHTER. Measured over
    // 200,000 two-material neighbourhoods with a foreign colour offered to each box, it is barely tighter --
    // and it is not a subset either: each admits thousands the other rejects.
    let rng2 = 12345; const r2 = () => ((rng2 = (rng2 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let admitR = 0, admitY = 0, rOnly = 0, yOnly = 0, rOnlyD = 0, yOnlyD = 0;
    const T = 200000;
    for (let t = 0; t < T; t++) {
        const A = [r2(), r2(), r2()], B = [r2(), r2(), r2()];
        const nb = []; for (let k = 0; k < 9; k++) nb.push(k < 5 ? A : B);
        const rl = [9, 9, 9], rh = [-9, -9, -9], yl = [9, 9, 9], yh = [-9, -9, -9];
        for (const c of nb) { const y = rgbToYCoCg(c[0], c[1], c[2]);
            for (let k = 0; k < 3; k++) { rl[k] = Math.min(rl[k], c[k]); rh[k] = Math.max(rh[k], c[k]); yl[k] = Math.min(yl[k], y[k]); yh[k] = Math.max(yh[k], y[k]); } }
        const cand = [r2(), r2(), r2()], cy = rgbToYCoCg(cand[0], cand[1], cand[2]);
        const inR = cand.every((v, k) => v >= rl[k] - 1e-9 && v <= rh[k] + 1e-9);
        const inY = cy.every((v, k) => v >= yl[k] - 1e-9 && v <= yh[k] + 1e-9);
        if (inR) admitR++; if (inY) admitY++;
        const d = Math.min(...nb.map((c) => Math.hypot(c[0] - cand[0], c[1] - cand[1], c[2] - cand[2])));
        if (inR && !inY) { rOnly++; rOnlyD += d; }
        if (inY && !inR) { yOnly++; yOnlyD += d; }
    }
    const dR = rOnlyD / rOnly, dY = yOnlyD / yOnly;
    report(`over ${T} two-material neighbourhoods: RGB admits ${admitR} foreign colours, YCoCg ${admitY}`);
    ok(`*** the YCoCg box is only ${(admitR / admitY).toFixed(2)}x tighter, NOT the decisive win it is usually sold as ***`,
        admitR / admitY > 1 && admitR / admitY < 1.25, `${admitR} vs ${admitY}`);
    ok(`  and neither box contains the other -- RGB-only ${rOnly}, YCoCg-only ${yOnly}, so it is not a subset`,
        rOnly > 1000 && yOnly > 1000);
    // THE DIFFERENCE THAT IS REAL: not how many get through, but how wrong the ones that do are.
    ok(`*** what RGB uniquely admits is ${((dR / dY - 1) * 100).toFixed(0)}% FARTHER from any real neighbour than what YCoCg uniquely admits (${dR.toFixed(4)} vs ${dY.toFixed(4)}) ***`,
        dR > dY * 1.05, `rgb-only ${dR.toFixed(5)}, ycocg-only ${dY.toFixed(5)}`);
}

console.log("\n2. DISOCCLUSION: the one rejection reason that is DERIVED, and the depth channel it needs");

{
    const fr = renderFrame({ camX: 0.25, occX: 0.4 });
    const m = motionFor(fr.depth, 0.25, 0);
    const i = (24 * W + 24) * 4;
    // *** THE FOURTH MOTION CHANNEL WAS A HARD-CODED ZERO UNTIL THIS ROUND. *** It is now the depth this
    // surface would have had last frame, and it is checked against arithmetic, not against itself: the camera
    // moved 0.25 world units across an 8-unit ortho extent, so du is 0.25/8 exactly, and the occluder sits at
    // z = 3 in a [1, 10] range, so zPrev is (3-1)/9.
    ok("*** motion's fourth channel carries zPrev, the expected previous depth -- checked against arithmetic ***",
        Math.abs(m[i] - 0.25 / 8) < 1e-6 && Math.abs(m[i + 3] - dOf(Z_OCC)) < 1e-6,
        `du ${m[i].toFixed(6)} (expect ${(0.25 / 8).toFixed(6)}), zPrev ${m[i + 3].toFixed(6)} (expect ${dOf(Z_OCC).toFixed(6)})`);
    ok("  and a threshold is REQUIRED, because no default is right for both depth conventions",
        (() => { try { disocclusionCPU({ motion: m, prevDepth: fr.depth, w: W, h: H }); return false; }
                 catch (e) { return /threshold must be a positive depth/.test(e.message); } })());

    // the sweep: the occluder uncovers background on its trailing edge every frame
    const N = 12, ALPHA = 0.15;
    const run = (useDisocc) => {
        let hist = null, prevDepth = null, last = null;
        for (let f = 0; f < N; f++) {
            const fr2 = renderFrame({ occX: occAt(f) });
            const motion = motionFor(fr2.depth, 0, 0);
            let factor = null, dis = null;
            if (useDisocc && prevDepth) {
                dis = disocclusionCPU({ motion, prevDepth, w: W, h: H, threshold: 0.02 });
                factor = historyFactorCPU({ disocclusion: dis.data, n: W * H });
            }
            const r = rectifiedAccumulateCPU({ current: fr2.colour, history: hist, motion, factor, w: W, h: H, alpha: ALPHA, space: "ycocg" });
            hist = r.data; prevDepth = fr2.depth; last = { r, dis };
        }
        return last;
    };
    const truth = renderFrame({ occX: occAt(N - 1) }).colour;
    const prevF = renderFrame({ occX: occAt(N - 2) }), nowF = renderFrame({ occX: occAt(N - 1) });
    const trueDis = []; for (let i2 = 0; i2 < W * H; i2++) if (nowF.depth[i2] > 0.5 && prevF.depth[i2] < 0.5) trueDis.push(i2);
    const off = run(false), on = run(true);
    const flagged = new Set(); for (let i2 = 0; i2 < W * H; i2++) if (on.dis.data[i2] > 0) flagged.add(i2);
    const tp = trueDis.filter((i2) => flagged.has(i2)).length;

    report(`mean 3x3 red span on this picture: ${meanSpan(nowF.colour, 0).toFixed(4)} of a [0,1] range -- the clamp's box is this wide`);
    // *** THE DETECTOR IS THE MEASUREMENT, NOT THE rms. *** With the history discarded the output IS the current
    // frame and the ground truth IS the current frame, so "rms 0 in the disoccluded region" is true by
    // construction and says nothing. What carries information is whether the flagged set is the true set.
    ok(`*** the detector finds the disoccluded set EXACTLY: ${tp} of ${trueDis.length} true positives, ${flagged.size} flagged, so no false positives either ***`,
        tp === trueDis.length && flagged.size === trueDis.length && trueDis.length > 20,
        `flagged ${flagged.size}, true ${trueDis.length}, recall ${(tp / trueDis.length * 100).toFixed(1)}%`);
    const gOff = rmsOver(off.r.data, truth, trueDis);
    ok(`  and the ghost it prevents is worth ${gOff.toFixed(4)} rms -- what the clamp ALONE leaves behind in that region`,
        gOff > 0.3, `clamp only ${gOff.toFixed(5)}`);
    const wOff = rmsOver(off.r.data, truth, ALL), wOn = rmsOver(on.r.data, truth, ALL);
    ok(`  over the WHOLE frame, where most pixels are not disoccluded: ${wOff.toFixed(5)} -> ${wOn.toFixed(5)}, ${(wOff / wOn).toFixed(2)}x`,
        wOn < wOff * 0.6, `off ${wOff.toFixed(5)}, on ${wOn.toFixed(5)}`);

    // ---- *** THE THRESHOLD, WHICH WENT 0-RED AND IS THE REASON THIS BLOCK EXISTS. *** --------------------
    // Replacing `gap > threshold` with `gap > 0` changed NOTHING above: the occluder sits at z = 3 and the
    // background at z = 8, so every real disocclusion has a gap of 0.556 and every non-disocclusion has a gap
    // of exactly 0, and any threshold between them gives the same set. A parameter no picture can distinguish
    // is a parameter nobody has tested. The threshold's actual job is to TOLERATE the small depth differences
    // a reprojection lands on -- so the picture has to contain some. A tilted background under camera motion
    // does: neighbouring texels differ in depth, the reprojection lands between them, and the gap is small and
    // positive across the whole surface.
    {
        // the tilt SIGN decides which way the quantisation error falls: with the surface receding away from
        // the camera motion the recorded depth reads FARTHER than expected (a negative gap, never a
        // disocclusion) and the row would pass for the wrong reason. Measured both ways before choosing.
        const tf = renderFrame({ camX: 0.3, occX: -9, tilt: -0.35 });
        const tp2 = renderFrame({ camX: 0, occX: -9, tilt: -0.35 });
        const tm = motionFor(tf.depth, 0.3, 0);
        const loose = disocclusionCPU({ motion: tm, prevDepth: tp2.depth, w: W, h: H, threshold: 0.02 });
        const tight = disocclusionCPU({ motion: tm, prevDepth: tp2.depth, w: W, h: H, threshold: 1e-5 });
        report(`a tilted background under a 0.3-unit camera move: nothing is disoccluded, and ${loose.noHistory} pixels legitimately have NO history (the strip the camera uncovered at the frame edge)`);
        // the surviving 96 are not false positives: they reprojected off screen, which is the OTHER reason
        // this function returns 1, and the assertion says so by name rather than tolerating a leftover count.
        ok(`*** the threshold is what separates a disocclusion from reprojection quantisation: ${tight.flagged} of ${W * H} flagged at 1e-5, down to exactly the ${loose.noHistory} with no history at 0.02 -- and nothing in this scene is disoccluded ***`,
            tight.flagged === W * H && loose.flagged === loose.noHistory && loose.noHistory > 0,
            `tight ${tight.flagged}, loose ${loose.flagged}, noHistory ${loose.noHistory}, of ${W * H} pixels`);
    }
}

console.log("\n3. THE YCoCg BOX ON A PICTURE, AND THE EXACT LIMIT OF ANY BOX");

{
    // the monochrome background is the case the YCoCg box exists for: the occluder's LUMA sits inside the
    // background's range, so only a chroma axis can reject it.
    const N = 12, ALPHA = 0.15;
    const run = (space) => { let hist = null, last = null;
        for (let f = 0; f < N; f++) { const fr = renderFrame({ occX: occAt(f), mono: true });
            const m = motionFor(fr.depth, 0, 0);
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, w: W, h: H, alpha: ALPHA, space });
            hist = r.data; last = r; }
        return last; };
    const truth = renderFrame({ occX: occAt(N - 1), mono: true }).colour;
    const prevF = renderFrame({ occX: occAt(N - 2), mono: true }), nowF = renderFrame({ occX: occAt(N - 1), mono: true });
    const trail = []; for (let i = 0; i < W * H; i++) if (nowF.depth[i] > 0.5 && prevF.depth[i] < 0.5) trail.push(i);
    const pure = trail.filter((i) => { const x = i % W, y = (i / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = Math.min(W - 1, Math.max(0, x + dx)), ny = Math.min(H - 1, Math.max(0, y + dy));
            if (nowF.depth[ny * W + nx] < 0.5) return false; }
        return true; });
    const mixed = trail.filter((i) => !pure.includes(i));
    const R2 = run("rgb"), Y2 = run("ycocg");
    const pr = rmsOver(R2.data, truth, pure), py = rmsOver(Y2.data, truth, pure);
    const mr = rmsOver(R2.data, truth, mixed), my = rmsOver(Y2.data, truth, mixed);
    report(`occluder luma ${luma(0.60, 0.25, 0.25).toFixed(4)} sits inside the background's [0.15, 0.85]; its Co is ${rgbToYCoCg(0.60, 0.25, 0.25)[1].toFixed(4)} against a background Co of exactly 0`);
    report(`of ${trail.length} trail pixels, ${pure.length} have a PURE-background 3x3 and ${mixed.length} touch the occluder`);
    ok(`  the YCoCg box beats RGB where a box CAN act: ${pr.toFixed(5)} -> ${py.toFixed(5)}, ${(pr / py).toFixed(2)}x -- a small win, stated as small`,
        py < pr && pr / py < 1.5, `rgb ${pr.toFixed(5)}, ycocg ${py.toFixed(5)}`);
    // *** THE WIDE-BOX LIMIT, MEASURED TO THE DIGIT. *** Where the 3x3 touches the occluder, the occluder's own
    // colour is IN the neighbourhood, so it is inside every box in every space and no rectification can reject
    // it. The two spaces agree to the bit there, and that is the whole reason the other three items exist.
    ok(`*** and where the 3x3 TOUCHES the occluder the two spaces are identical to ${Math.abs(mr - my).toExponential(0)} -- no box in any space can reject a colour its own neighbours have ***`,
        Math.abs(mr - my) < 1e-9 && mixed.length > 10, `rgb ${mr.toFixed(6)}, ycocg ${my.toFixed(6)}`);
    ok(`  and YCoCg clamps MORE pixels while winning less (${R2.stats.clamped} -> ${Y2.stats.clamped}), so "clamps more" is not "corrects more"`,
        Y2.stats.clamped > R2.stats.clamped);
}

console.log("\n4. THE REACTIVE MASK: the case the clamp cannot see, because the box is wide");

{
    const N = 14, ALPHA = 0.15;
    const PART = { test: (x, y) => x >= 20 && x < 28 && y >= 20 && y < 28, rgb: [0.05, 0.95, 0.35] };
    const partIdx = []; for (let y = 20; y < 28; y++) for (let x = 20; x < 28; x++) partIdx.push(y * W + x);
    const mask = new Float32Array(W * H); for (const i of partIdx) mask[i] = 1;
    const run = (useMask) => { let hist = null, last = null;
        for (let f = 0; f < N; f++) { const on = f >= 8;
            const fr = renderFrame({ occX: -9, particle: on ? PART : null });
            const m = motionFor(fr.depth, 0, 0);
            const factor = (useMask && on) ? historyFactorCPU({ reactive: mask, n: W * H }) : null;
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, factor, w: W, h: H, alpha: ALPHA, space: "ycocg" });
            hist = r.data; last = r; }
        return last; };
    const truth = renderFrame({ occX: -9, particle: PART }).colour;
    const base = renderFrame({ occX: -9 }).colour;
    let span = 0; for (const i of partIdx) { const x = i % W, y = (i / W) | 0; let lo = 9, hi = -9;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = base[((y + dy) * W + (x + dx)) * 4 + 1]; if (v < lo) lo = v; if (v > hi) hi = v; }
        span += hi - lo; }
    const off = run(false), on = run(true);
    const eOff = rmsOver(off.data, truth, partIdx), eOn = rmsOver(on.data, truth, partIdx);
    report(`mean green 3x3 span under the particle: ${(span / partIdx.length).toFixed(4)} -- the particle's own green (0.95) is inside it, which is why the clamp passes the stale history`);
    ok(`*** six frames after the particle appears the clamp alone still owes ${eOff.toFixed(5)} rms, and the mask owes ${eOn.toFixed(5)} ***`,
        eOff > 0.1 && eOn < 1e-9, `clamp only ${eOff.toFixed(5)}, with mask ${eOn.toFixed(5)}`);
    // said plainly, because the zero is not a measurement: factor = 0 makes the output the current frame and
    // the truth IS the current frame. The number that carries information is what the clamp alone leaves.
    report("the masked rms is 0 BY CONSTRUCTION (factor 0 means 'take this frame'), so the informative number is the 0.14885 the clamp alone cannot remove");
    ok("  and the three reasons MULTIPLY rather than max(), so two weak reasons compound",
        (() => { const a = new Float32Array([0.5]), b = new Float32Array([0.5]);
                 return historyFactorCPU({ disocclusion: a, reactive: b, n: 1 })[0] === 0.25; })(),
        "0.5 and 0.5 give 0.25, not 0.5 -- a max() would let the stronger reason hide the other");
}

console.log("\n5. *** SHADING-CHANGE DETECTION: WRITTEN, MEASURED, AND REFUSED. THIS ROW KEEPS IT REFUSED. ***");

{
    // The detector, re-derived inline in its BEST form (formulation 3: current 3x3 mean luma against the
    // PREVIOUS FRAME's, both equally aliased, normalised by the neighbourhood's own span). It is not exported
    // from temporalReject.mjs and this is the only place it exists.
    const detect = (current, previous, motion, strength) => {
        const out = new Float32Array(W * H);
        const at = (buf, u, v, c) => { const x = Math.min(W - 1, Math.max(0, Math.round(u * W - 0.5))), y = Math.min(H - 1, Math.max(0, Math.round(v * H - 0.5))); return buf[(y * W + x) * 4 + c]; };
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, o = i * 4;
            const hu = (x + 0.5) / W + motion[o], hv = (y + 0.5) / H + motion[o + 1];
            let cs = 0, ps = 0, lo = Infinity, hi = -Infinity;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = Math.min(W - 1, Math.max(0, x + dx)), ny = Math.min(H - 1, Math.max(0, y + dy)), no = (ny * W + nx) * 4;
                const l = luma(current[no], current[no + 1], current[no + 2]);
                cs += l; if (l < lo) lo = l; if (l > hi) hi = l;
                ps += luma(at(previous, hu + dx / W, hv + dy / H, 0), at(previous, hu + dx / W, hv + dy / H, 1), at(previous, hu + dx / W, hv + dy / H, 2));
            }
            out[i] = Math.min(1, Math.max(0, strength * Math.abs(cs - ps) / 9 / (hi - lo + 1e-3)));
        }
        return out;
    };

    // (a) it WORKS on the case it is sold for: a global light drop
    const N = 14;
    const runLight = (strength) => { let hist = null, prevC = null, tr = [];
        for (let f = 0; f < N; f++) { const light = f >= 8 ? 0.55 : 1;
            const fr = renderFrame({ occX: -9, light });
            const m = motionFor(fr.depth, 0, 0);
            const factor = (strength != null && prevC) ? historyFactorCPU({ shading: detect(fr.colour, prevC, m, strength), n: W * H }) : null;
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, factor, w: W, h: H, alpha: 0.15, space: "ycocg" });
            hist = r.data; prevC = fr.colour; if (f >= 8) tr.push(rmsOver(r.data, fr.colour, ALL)); }
        return tr; };
    const lOff = runLight(null), lOn = runLight(1), lWeak = runLight(0.25);
    // At full strength the factor goes to 0 across the frame and the output IS the current frame, so the rms is
    // 0 BY CONSTRUCTION and the ratio is infinite -- degenerate, not impressive. The quarter-strength run is the
    // one that carries information, and the degeneracy is itself the warning: a detector that answers "discard
    // everything" to a global light change will answer it to anything else that moves every pixel.
    report(`after a global light drop: no detection ${lOff[0].toFixed(5)} rms, strength 0.25 ${lWeak[0].toFixed(5)}, strength 1 ${lOn[0].toFixed(5)} (0 by construction -- it discarded the whole history)`);
    // *** THE TRADE, IN THE TWO NUMBERS THAT MATTER, AND IT IS CATASTROPHIC IN BOTH DIRECTIONS. *** At a
    // strength weak enough not to be degenerate the detector buys only 1.5x on the case it is FOR -- and
    // section (b) below shows that same setting still costs 3.0e5x on the case this arc is for. There is no
    // strength at which the exchange is worth making, and that is the refusal, stated as a ratio rather than
    // as an opinion.
    ok(`  it helps only ${(lOff[0] / lWeak[0]).toFixed(1)}x on the case it is sold for (${lOff[0].toFixed(5)} -> ${lWeak[0].toFixed(5)} at quarter strength) -- and full strength is 0 only because it discarded everything`,
        lWeak[0] < lOff[0] && lOff[0] / lWeak[0] < 3 && lOn[0] <= lWeak[0],
        `off ${lOff[0].toFixed(5)}, s=0.25 ${lWeak[0].toFixed(5)}, s=1 ${lOn[0].toFixed(5)}`);

    // (b) and it is CATASTROPHIC on the case this whole arc exists for: a static jittered scene converging
    const NJ = 32;
    const runStatic = (strength) => {
        const st = makeJitterState(1); let hist = null, prevC = null, out = null;
        const acc = new Float64Array(W * H * 4);
        for (let f = 0; f < NJ; f++) {
            const j = advanceJitter(st);
            const fr = renderFrame({ camX: j[0] / W * 2 * HALF, occX: -9 });
            for (let i = 0; i < W * H * 4; i++) acc[i] += fr.colour[i];
            const m = motionFor(fr.depth, 0, 0);
            const factor = (strength != null && prevC) ? historyFactorCPU({ shading: detect(fr.colour, prevC, m, strength), n: W * H }) : null;
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, factor, w: W, h: H, alpha: 1 / (f + 1), space: "ycocg" });
            hist = r.data; prevC = fr.colour; out = r.data;
        }
        const mean = new Float32Array(W * H * 4); for (let i = 0; i < W * H * 4; i++) mean[i] = acc[i] / NJ;
        return rmsOver(out, mean, ALL);
    };
    const cOff = runStatic(null), cOn = runStatic(1), cWeak = runStatic(0.25);
    report(`static jittered convergence to the mean of ${NJ} frames: detection off ${cOff.toExponential(3)}, strength 0.25 ${cWeak.toExponential(3)}, strength 1 ${cOn.toExponential(3)}`);
    // *** THE ROW THAT REFUSES THE FEATURE. *** If someone later re-exports a one-frame shading detector and
    // wires it in, this goes red. The reason is not tuning: on a high-contrast surface a ONE-PIXEL JITTER moves
    // a pixel by as much as a lighting change does, and moving the sample point by a pixel is what jitter IS.
    // Turning the strength down does not escape it -- 0.25 is still five orders of magnitude worse.
    ok(`*** a one-frame shading detector DESTROYS convergence by ${(cOn / cOff).toExponential(1)}x, and at quarter strength still ${(cWeak / cOff).toExponential(1)}x -- so it is not exported, and this row is why ***`,
        cOn / cOff > 1e4 && cWeak / cOff > 1e4, `off ${cOff.toExponential(3)}, s=1 ${cOn.toExponential(3)}, s=0.25 ${cWeak.toExponential(3)}`);
    report("three formulations were measured and all three fail the same way -- point-vs-history 2.3e5x, mean-vs-history 1.7e5x, mean-vs-previous-frame 2.5e5x. FSR2 uses a per-pixel LOCK and multi-frame luma instability instead, which is state this tree does not have and a rung of its own.");
}

console.log("\n6. THE WGSL, VALIDATED AND THEN RUN");

{
    for (const [name, src] of [["disocclusion", DISOCCLUSION_WGSL], ["rectify", RECTIFY_WGSL]]) {
        const errs = validateWgsl(src);
        ok(`  ${name} validates against the spec scanner`, errs.length === 0, errs.join("; "));
    }
}

const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** Sections 1-5 are CPU only; nothing above has run the kernels."); fails++; }
else {
    const fr = renderFrame({ occX: occAt(6) });
    const prev = renderFrame({ occX: occAt(5) });
    const motion = motionFor(fr.depth, 0.2, 0);
    const dis = disocclusionCPU({ motion, prevDepth: prev.depth, w: W, h: H, threshold: 0.02 });
    const factor = historyFactorCPU({ disocclusion: dis.data, n: W * H });
    const CPU = {
        yc: rectifiedAccumulateCPU({ current: fr.colour, history: prev.colour, motion, factor, w: W, h: H, alpha: 0.15, space: "ycocg" }),
        rgb: rectifiedAccumulateCPU({ current: fr.colour, history: prev.colour, motion, factor, w: W, h: H, alpha: 0.15, space: "rgb" }),
        noclamp: rectifiedAccumulateCPU({ current: fr.colour, history: prev.colour, motion, factor, w: W, h: H, alpha: 0.15, space: "ycocg", clampToNeighbourhood: false }),
    };
    const r = await runInEngineOrigin({ engineRoot: ENG, args: {
        W, H, cur: Array.from(fr.colour), hist: Array.from(prev.colour), motion: Array.from(motion),
        prevDepth: Array.from(prev.depth), factor: Array.from(factor), alpha: 0.15, threshold: 0.02,
    }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { DISOCCLUSION_WGSL, RECTIFY_WGSL } = await import("/render/temporalRejectWgsl.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const N = a.W * a.H, groups = [Math.ceil(a.W / 8), Math.ceil(a.H / 8)];
        const cur = dev.buffer({ data: new Float32Array(a.cur), usage: ["storage"] });
        const hist = dev.buffer({ data: new Float32Array(a.hist), usage: ["storage"] });
        const motion = dev.buffer({ data: new Float32Array(a.motion), usage: ["storage"] });
        const fac = dev.buffer({ data: new Float32Array(a.factor), usage: ["storage"] });

        const db = new ArrayBuffer(16);
        new Uint32Array(db, 0, 2).set([a.W, a.H]);
        new Float32Array(db, 8, 1).set([a.threshold]);
        new Uint32Array(db, 12, 1).set([1]);
        const dprev = dev.buffer({ data: new Float32Array(a.prevDepth), usage: ["storage"] });
        const ddst = dev.buffer({ data: new Float32Array(N), usage: ["storage"] });
        const dp = dev.compute({ wgsl: DISOCCLUSION_WGSL });
        dp.bind("motion", motion).bind("prevDepth", dprev).bind("dst", ddst).bind("u", dev.buffer({ data: new Uint32Array(db), usage: "uniform" }));
        dev.frame(({ pass }) => { pass.dispatch(dp, groups); pass.clear([0,0,0,1]); }, { offscreen: true });
        const disocc = Array.from(new Float32Array(await dev.read(ddst)));

        const go = async (flags) => {
            const dst = dev.buffer({ data: new Float32Array(N * 4), usage: ["storage"] });
            const ub = new ArrayBuffer(16);
            new Uint32Array(ub, 0, 2).set([a.W, a.H]);
            new Float32Array(ub, 8, 1).set([a.alpha]);
            new Uint32Array(ub, 12, 1).set([flags]);
            const p = dev.compute({ wgsl: RECTIFY_WGSL });
            p.bind("cur", cur).bind("hist", hist).bind("motion", motion).bind("factor", fac).bind("dst", dst)
             .bind("u", dev.buffer({ data: new Uint32Array(ub), usage: "uniform" }));
            dev.frame(({ pass }) => { pass.dispatch(p, groups); pass.clear([0,0,0,1]); }, { offscreen: true });
            return Array.from(new Float32Array(await dev.read(dst)));
        };
        // FLAG_YCOCG 1, FLAG_CLAMP 2, FLAG_HAS_HIST 4, FLAG_HAS_FAC 8
        return { disocc, yc: await go(15), rgb: await go(14), noclamp: await go(13), errs, backend: dev.backend };
    }` });
    ok("the harness ran both kernels on a real WebGPU device",
        r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
        r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        let wd = 0; for (let i = 0; i < W * H; i++) wd = Math.max(wd, Math.abs(r.result.disocc[i] - dis.data[i]));
        ok(`*** the device's DISOCCLUSION buffer is the CPU's on all ${W * H} pixels -- worst ${wd} -- and it is a decision, so anything but 0 is a different answer ***`,
            wd === 0, `worst ${wd}, flagged CPU ${dis.flagged}`);
        const cmp = (G, ref) => { let w = 0; for (let i = 0; i < W * H * 4; i++) w = Math.max(w, Math.abs(G[i] - ref[i])); return w; };
        const wy = cmp(r.result.yc, CPU.yc.data), wr = cmp(r.result.rgb, CPU.rgb.data), wn = cmp(r.result.noclamp, CPU.noclamp.data);
        const LSB = 1 / 255, worst = Math.max(wy, wr, wn);
        ok(`*** the device's rectified accumulate matches on all three paths -- worst ${worst.toExponential(2)}, ${(worst / LSB).toExponential(1)} of an 8-bit LSB (ycocg ${wy.toExponential(2)}, rgb ${wr.toExponential(2)}, unclamped ${wn.toExponential(2)}) ***`,
            worst < LSB / 50, `ycocg ${wy.toExponential(3)}, rgb ${wr.toExponential(3)}, noclamp ${wn.toExponential(3)}; LSB ${LSB.toExponential(2)}`);
        // the device's OWN round trip, not inherited: ycocg and rgb must DIFFER on the device too, or the
        // flag is being ignored and both paths are silently running the same code.
        let diff = 0; for (let i = 0; i < W * H * 4; i++) diff = Math.max(diff, Math.abs(r.result.yc[i] - r.result.rgb[i]));
        ok(`  and the device's two spaces actually DIFFER (worst ${diff.toExponential(2)}), so the flag is read rather than ignored`,
            diff > 1e-3, `worst difference ${diff.toExponential(3)}`);
    }
}

// SABOTAGE LOG -- applied to render/temporalReject.mjs, render/temporalRejectWgsl.mjs, render/motionVectors.mjs
// and render/motionVectorsWgsl.mjs, BOTH gates run (this one and motionVectors', since this round changed a
// buffer they share), red counts summed, all files restored and md5-verified. Baseline 0 red. MEASURED at v4552.
//   BO the disocclusion test's sign flipped                  -> 4 red. The sign IS the test, and a flipped one
//      still produces a plausible-looking mask -- of exactly the wrong pixels.
//   BP zPrev not written, the fourth channel back to 0 (CPU) -> 5 red.
//   BQ zPrev not written in the WGSL ONLY                    -> 1 red, AFTER this round added a row to
//      render/motionVectors-selfcheck.mjs for it. *** IT WENT 0-RED FIRST AND ACROSS BOTH GATES. *** The motion
//      gate compared channels 0, 1 and 2 and nothing read channel 3; and this gate's device section uploads a
//      CPU-built motion buffer, so it never runs that kernel at all. A channel two gates consume and neither
//      measured -- the same shape as v4550's two 0-REDs, and the third time this session that a mirror agreed
//      with itself because nothing drove the side being mirrored.
//   BR the space flag ignored, always clamping in RGB (CPU)  -> 5 red.
//   BS all three reasons combined with min() instead of multiplied -> 1 red. *** THE FIRST ATTEMPT AT THIS
//      SABOTAGE WAS A NO-OP AND THAT IS WORTH RECORDING: *** changing only the disocclusion line to min() gives
//      the same answer as multiplying whenever the other reasons still multiply, so it went 0-RED and the gate
//      was not at fault. A sabotage that does not change behaviour measures nothing about the gate.
//   BT the threshold ignored, `gap > 0` instead of `gap > threshold` -> 1 red, AFTER this round added the
//      tilted-background row. *** ALSO 0-RED FIRST. *** The occluder sits at z = 3 and the background at z = 8,
//      so every disocclusion had a gap of 0.556 and everything else exactly 0: no threshold between them could
//      be distinguished from any other, and the parameter was decoration. The threshold's real job is to
//      TOLERATE the small positive gaps a nearest-texel depth fetch produces against an exactly reprojected
//      expectation, so the picture had to contain some. The tilt's SIGN matters too and was measured both ways
//      -- tilted the other direction the gaps come out negative and the row would have passed for no reason.
//   BU yCoCgToRgb's inverse wrong (t = y + cg)               -> 5 red.
//   BV the clamp removed in the WGSL ONLY                    -> 2 red, caught by the device parity row and by
//      the row asserting the device's two spaces actually differ from each other.
//   BW the refused shading detector made inert (out[i] = 0)  -> 2 red. Section 5's refusal is a claim about a
//      real measurement, so it needs a real detector behind it; an inert one would make the refusal vacuous.
//   Two 0-REDs among the nine, and both were the same fault: a value produced on one side and consumed on the
//   other with nothing in between asserting it. Both now have a row.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a per-pixel LOCK and multi-frame luma instability, which is how FSR2 does what section 5 " +
    "refuses and is a rung of its own; the reactive mask's CONTENT, which comes from an application that knows which " +
    "of its own draws were transparent and which no renderer in this tree produces; disocclusion under a MOVING " +
    "camera with rotation, since the sweep here translates; a depth buffer in the reversed-Z convention, where " +
    "nearerIsLess flips and only the caller knows; and UPSCALING, since this rectifies at ratio 1 and the " +
    "jitter-aware resolve above it is render/temporalResolve.mjs's rung.");
process.exit(fails ? 1 : 0);
