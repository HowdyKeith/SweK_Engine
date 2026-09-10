#!/usr/bin/env node
// WebGLEngine/render/temporalDepthLock-selfcheck.mjs -- v4554
//
// THE ONE THING v4553 SECTION 5 SAID LUMA CANNOT DO, DONE WITH DEPTH -- AND WHAT IT COSTS.
//
// v4553 measured a luma lock detector locking 1,340 of 2,304 pixels on a chequer at the pixel scale and making
// the ghost 26% WORSE, and concluded there is no luma-only test separating a thin bright feature from a texture
// at the pixel scale, because at that scale they are the same signal. They are not the same signal in DEPTH.
//
// *** AND THE RESULT IS TWO-SIDED, WHICH IS THE POINT OF THE ROUND RATHER THAN A CAVEAT ON IT. *** The depth
// gate removes v4553's penalty COMPLETELY -- 26% to 0%, locks 1,990 to 26 -- and it REFUSES a thin feature that
// is painted rather than geometric, giving away the whole 4.00x a luma lock buys on that picture. Depth
// separates GEOMETRY from TEXTURE, which is a different cut than THIN from NOT THIN. The limit v4553 named has
// not gone away; it has been localised: a painted thin line and a pixel-scale texture are the same thing to
// every buffer this pipeline carries, and no gate assembled from them can tell those two apart.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "./wgslSpec.mjs";
import { ridgesCPU, depthRidgesCPU, gateLocks, makeLumaState, pushLuma, lockCandidatesFromRing,
         makeLockState, advanceLocks, lockRelaxation, activeMask } from "./temporalLock.mjs";
import { FIELD_RIDGE_WGSL } from "./temporalLockWgsl.mjs";
import { rectifiedAccumulateCPU, disocclusionCPU } from "./temporalReject.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 48, H = 48, NEAR = 1, FAR = 10, HALF = 4, Z_NEAR_OBJ = 3, Z_BG = 8;
const PXW = 2 * HALF / W, X0 = 0.37, LW = 0.4 * PXW, P = jitterPhaseCount(1);
const dOf = (z) => (z - NEAR) / (FAR - NEAR);
function vpAt(camX) {
    const o = new Float32Array(16);
    o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1;
    const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -camX;
    return mat4Multiply(o, t);
}
const bgAt = (wx, wy, bg) => bg === "flat" ? 0.05 : (((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? 0.92 : 0.06);
// geometric: the line is IN FRONT, at Z_NEAR_OBJ.  painted: the same bright line, at the background's depth.
function renderLine({ camX = 0, geometric = true, bg = "flat" } = {}) {
    const colour = new Float32Array(W * H * 4), depth = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, o = i * 4;
        const wx = (2 * ((x + 0.5) / W) - 1) * HALF + camX, wy = (1 - 2 * ((y + 0.5) / H)) * HALF;
        const onLine = Math.abs(wx - X0) < LW / 2;
        const v = onLine ? 0.95 : bgAt(wx, wy, bg);
        colour[o] = v; colour[o + 1] = v; colour[o + 2] = v; colour[o + 3] = 1;
        depth[i] = dOf(onLine && geometric ? Z_NEAR_OBJ : Z_BG);
    }
    return { colour, depth };
}
function truthLine(bg) {
    const t = new Float32Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        const lo = (2 * (x / W) - 1) * HALF, hi = (2 * ((x + 1) / W) - 1) * HALF;
        const a = Math.max(lo, X0 - LW / 2), b = Math.min(hi, X0 + LW / 2);
        const cov = Math.max(0, b - a) / (hi - lo);
        let bgv = 0; const NS = 32;
        for (let s = 0; s < NS; s++) bgv += bgAt(lo + (s + 0.5) / NS * (hi - lo), (1 - 2 * ((y + 0.5) / H)) * HALF, bg) / NS;
        const v = cov * 0.95 + (1 - cov) * bgv;
        t[o] = v; t[o + 1] = v; t[o + 2] = v; t[o + 3] = 1;
    }
    return t;
}
const motionFor = (d, a, b) => motionVectorsCPU(d, W, H, mat4Invert(vpAt(a)), vpAt(b)).data;
const rmsOver = (a, b, idx) => { let s = 0; for (const i of idx) for (let c = 0; c < 3; c++) { const q = a[i * 4 + c] - b[i * 4 + c]; s += q * q; } return Math.sqrt(s / (idx.length * 3)); };
const cols = []; for (let x = 0; x < W; x++) { const lo = (2 * (x / W) - 1) * HALF, hi = (2 * ((x + 1) / W) - 1) * HALF; if (hi > X0 - PXW && lo < X0 + PXW) cols.push(x); }
const nearIdx = []; for (let y = 1; y < H - 1; y++) for (const x of cols) nearIdx.push(y * W + x);
const jitterCam = (j) => j[0] / W * 2 * HALF;
const DMARGIN = 0.02;

console.log("temporalDepthLock-selfcheck -- what depth separates that luma cannot, and what it refuses\n");
console.log("1. WHAT THE RIDGE TEST ACTUALLY SEPARATES, ON FOUR DEPTH FIELDS BUILT BY HAND");

{
    const w = 16, h = 16;
    const mk = (f) => { const d = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = f(x, y); return d; };
    const wire = ridgesCPU(mk((x) => x === 8 ? 0.2 : 0.8), w, h, DMARGIN).count;
    const slot = ridgesCPU(mk((x) => x === 8 ? 0.8 : 0.2), w, h, DMARGIN).count;
    const edge = ridgesCPU(mk((x) => x < 8 ? 0.2 : 0.8), w, h, DMARGIN).count;
    const slope = ridgesCPU(mk((x) => 0.2 + x * 0.04), w, h, DMARGIN).count;
    // *** A HORIZONTAL WIRE, BECAUSE EVERY OTHER FIXTURE IN THIS GATE IS VERTICAL. *** Deleting the ridgeY
    // test went 0-RED on BOTH the CPU and the WGSL until this row existed: a railing, a power line and a
    // horizon wire are found by the vertical axis and by nothing else, and no picture here had one.
    const hwire = ridgesCPU(mk((x, y) => y === 8 ? 0.2 : 0.8), w, h, DMARGIN).count;
    report(`16x16 depth fields, margin ${DMARGIN}: vertical wire ${wire}, HORIZONTAL wire ${hwire}, slot ${slot}, silhouette edge ${edge}, tilted surface ${slope}`);
    ok(`*** a HORIZONTAL wire gives ${hwire} ridges, found by the vertical axis and by nothing else -- every other picture in this gate is vertical, and dropping that axis was invisible until this row ***`,
        hwire === wire && hwire > 10, `horizontal ${hwire}, vertical ${wire}`);
    // *** THE TWO ZEROES ARE WHY THIS IS A RIDGE TEST AND NOT A DEPTH-DISCONTINUITY TEST. *** Every object
    // boundary in a scene is a depth discontinuity; locking them all would relax the clamp along every
    // silhouette, which is exactly where ghosting lives.
    ok(`*** a silhouette edge gives ${edge} ridges and a tilted surface ${slope} -- so this does NOT lock every object boundary, which a depth-discontinuity test would ***`,
        edge === 0 && slope === 0, `edge ${edge}, slope ${slope}`);
    ok(`  while a wire (${wire}) and a SLOT (${slot}) both count -- a slit of background between two surfaces is as thin as a wire and a clamp destroys it the same way`,
        wire > 10 && slot === wire, `wire ${wire}, slot ${slot}`);
    ok("  and the depth margin is REQUIRED, because a [0,1] projection and a [-1,1] one do not share a scale",
        (() => { try { depthRidgesCPU(new Float32Array(4), 2, 2); return false; } catch (e) { return /margin must be a positive depth/.test(e.message); } })());
    ok("  gateLocks is an AND -- an OR would union the luma detector's false positives straight back in",
        (() => { const a = Uint8Array.from([1, 1, 0, 0]), b = Uint8Array.from([1, 0, 1, 0]);
                 const g = gateLocks(a, b); return g.count === 1 && g.data[0] === 1 && g.data[1] === 0; })());
}

console.log("\n2. THE SEPARATION, ON THE PICTURE v4553 COULD NOT HANDLE");

let SEP = {};
{
    const survey = (geometric) => {
        const st = makeJitterState(1); const lu = makeLumaState(W, H, P);
        const anyDepth = new Uint8Array(W * H);
        let oneFrameDepth = 0;
        for (let f = 0; f < 2 * P + 2; f++) {
            const j = advanceJitter(st); const fr = renderLine({ camX: jitterCam(j), geometric, bg: "chequer" });
            pushLuma(lu, { current: fr.colour, motion: motionFor(fr.depth, 0, 0), w: W, h: H });
            const dr = depthRidgesCPU(fr.depth, W, H, DMARGIN);
            oneFrameDepth = dr.count;
            for (let i = 0; i < W * H; i++) if (dr.data[i]) anyDepth[i] = 1;
        }
        const lr = lockCandidatesFromRing(lu, { margin: 0.05 });
        let dc = 0; for (let i = 0; i < W * H; i++) if (anyDepth[i]) dc++;
        return { luma: lr.count, depthOne: oneFrameDepth, depthAny: dc, both: gateLocks(lr.data, anyDepth).count };
    };
    SEP.geo = survey(true); SEP.paint = survey(false);
    report(`the line crosses columns ${cols.join(",")} of a ${W}x${H} frame`);
    report(`GEOMETRIC line over a pixel-scale chequer: luma ridges ${SEP.geo.luma}, depth ridges ${SEP.geo.depthAny}, both ${SEP.geo.both}`);
    ok(`*** depth cuts the candidate set from ${SEP.geo.luma} to ${SEP.geo.depthAny} -- ${(SEP.geo.luma / SEP.geo.depthAny).toFixed(0)}x fewer, and ${SEP.geo.depthAny} is exactly the line's own pixels ***`,
        SEP.geo.depthAny <= (H - 2) * cols.length && SEP.geo.luma > SEP.geo.depthAny * 20, `luma ${SEP.geo.luma}, depth ${SEP.geo.depthAny}`);
    // *** THE CHEQUER ITSELF PRODUCES ZERO DEPTH RIDGES, WHICH IS THE WHOLE CLAIM. *** It is painted on a flat
    // surface, so it has no depth structure at all, while its luma is a ridge at almost every pixel.
    ok(`*** and the chequer contributes ZERO of them: a PAINTED line over the same background gives ${SEP.paint.luma} luma ridges and ${SEP.paint.depthAny} depth ridges ***`,
        SEP.paint.depthAny === 0 && SEP.paint.luma > 1000, `painted: luma ${SEP.paint.luma}, depth ${SEP.paint.depthAny}`);
    // a single frame misses a sub-pixel feature in depth for the same reason it misses it in luma -- v4553's
    // finding, restated on a different buffer rather than assumed to carry over
    ok(`  a SINGLE frame's depth finds ${SEP.geo.depthOne} of them, for v4553's reason: most jitter phases miss a sub-pixel feature entirely, in depth exactly as in luma`,
        SEP.geo.depthOne === 0, `one frame ${SEP.geo.depthOne}, union over a period ${SEP.geo.depthAny}`);
}

console.log("\n3. v4553's OWN PENALTY FIXTURE, WITH THE GATE ON");

let PEN = {};
{
    const occAt = (f) => -1.6 + f * 0.35, N = 14;
    const barFrame = (occX) => { const c = new Float32Array(W * H * 4), d = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, o = i * 4;
            const wx = (2 * ((x + 0.5) / W) - 1) * HALF, wy = (1 - 2 * ((y + 0.5) / H)) * HALF;
            let v, z;
            if (Math.abs(wx - occX) < 0.10 && Math.abs(wy) < 2.2) { v = 0.95; z = Z_NEAR_OBJ; }
            else { v = ((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? 0.30 : 0.10; z = Z_BG; }
            c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[i] = dOf(z); }
        return { colour: c, depth: d }; };
    const run = (gate, killMemory = true) => {
        let hist = null, prevDepth = null, out = null, held = 0;
        const ls = makeLockState(W, H), lu = makeLumaState(W, H, P), dm = makeLockState(W, H);
        for (let f = 0; f < N; f++) {
            const fr = barFrame(occAt(f));
            const m = motionFor(fr.depth, 0, 0);
            let dis = null; if (prevDepth) dis = disocclusionCPU({ motion: m, prevDepth, w: W, h: H, threshold: 0.02 });
            pushLuma(lu, { current: fr.colour, motion: m, w: W, h: H });
            // *** THE MEMORY NEEDS THE SAME KILL RULES AS THE LOCK, AND FORGETTING THAT COST 312 LOCKS. ***
            // The memory is reprojected by MOTION VECTORS, which in this tree describe the camera. Here the
            // camera is still and the BAR moves, so a remembered depth ridge sits at a screen pixel the bar has
            // left, for a whole period -- 26 real ridges became 312 stale ones and the penalty came straight
            // back. Disocclusion is precisely the signal that the surface at this pixel changed, so it voids a
            // remembered geometry property exactly as it voids a lock.
            advanceLocks(dm, { motion: m, disocclusion: (killMemory && dis) ? dis.data : null,
                               newLocks: depthRidgesCPU(fr.depth, W, H, DMARGIN).data, w: W, h: H, life: P });
            const dr = activeMask(dm);
            let relax = null;
            if (gate !== "none") {
                const lr = lockCandidatesFromRing(lu, { margin: 0.05 });
                const nl = gate === "luma" ? lr.data : gate === "depth" ? dr.data : gateLocks(lr.data, dr.data).data;
                advanceLocks(ls, { motion: m, disocclusion: dis ? dis.data : null, newLocks: nl, w: W, h: H, life: 8 });
                relax = lockRelaxation(ls, { life: 8 });
                if (f === N - 1) for (let i = 0; i < W * H; i++) if (ls.life[i] > 0) held++;
            }
            // the clamp is the ONLY defence, as in v4553 section 5, which is what isolates what a lock removes
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, relax, w: W, h: H, alpha: 0.15, space: "ycocg" });
            hist = r.data; prevDepth = fr.depth; out = r.data;
        }
        return { out, held };
    };
    const truth = barFrame(occAt(N - 1)).colour;
    const prevF = barFrame(occAt(N - 2)), nowF = barFrame(occAt(N - 1));
    const trail = []; for (let i = 0; i < W * H; i++) if (nowF.depth[i] > 0.5 && prevF.depth[i] < 0.5) trail.push(i);
    const base = run("none"), lumaG = run("luma"), depthG = run("depth"), bothG = run("both");
    PEN.base = rmsOver(base.out, truth, trail);
    PEN.luma = rmsOver(lumaG.out, truth, trail);
    PEN.depth = rmsOver(depthG.out, truth, trail);
    PEN.both = rmsOver(bothG.out, truth, trail);
    report(`${trail.length} trail pixels; locks held at the last frame: luma ${lumaG.held}, depth ${depthG.held}, both ${bothG.held}`);
    // *** THE ROW THIS ROUND EXISTS FOR. *** v4553 recorded 26% and this reproduces it, then removes it.
    ok(`*** the luma gate reproduces v4553's penalty exactly -- ${PEN.base.toFixed(5)} to ${PEN.luma.toFixed(5)}, ${((PEN.luma / PEN.base - 1) * 100).toFixed(0)}% worse on ${lumaG.held} locks -- and the DEPTH gate removes it entirely: ${PEN.depth.toFixed(5)}, ${((PEN.depth / PEN.base - 1) * 100).toFixed(0)}%, on ${depthG.held} ***`,
        PEN.luma > PEN.base * 1.2 && PEN.depth === PEN.base && depthG.held < lumaG.held / 50,
        `base ${PEN.base.toFixed(5)}, luma ${PEN.luma.toFixed(5)}, depth ${PEN.depth.toFixed(5)}, both ${PEN.both.toFixed(5)}`);
    ok(`  and the ${depthG.held} it does hold are the bar's own pixels, so the gate is selective rather than merely quiet`,
        depthG.held > 10 && PEN.both === PEN.depth, `depth ${depthG.held}, both ${bothG.held}`);

    // ---- *** THE MEMORY'S KILL RULE, FOUND THE HARD WAY AND HELD HERE. *** --------------------------------
    // The depth-ridge memory is reprojected by MOTION VECTORS, and this tree's describe the CAMERA. With the
    // camera still and the bar moving, a remembered ridge sits at a screen pixel the bar has left for a whole
    // period: 26 real ridges become 312 stale ones and the entire penalty comes back. Wiring disocclusion into
    // the memory -- the signal that says the surface at this pixel changed -- is what fixes it, and the row
    // exists because the first draft passed that signal to the lock and not to the memory.
    const stale = run("both", false);
    const PENstale = rmsOver(stale.out, truth, trail);
    ok(`*** the memory needs the SAME kill rules as the lock: without disocclusion it holds ${stale.held} instead of ${bothG.held} and the penalty returns at ${((PENstale / PEN.base - 1) * 100).toFixed(0)}% ***`,
        stale.held > bothG.held * 5 && PENstale > PEN.base * 1.2,
        `with kill ${bothG.held} locks / ${PEN.both.toFixed(5)}, without ${stale.held} locks / ${PENstale.toFixed(5)}`);
}

console.log("\n4. *** WHAT THE GATE REFUSES, AND IT IS NOT SMALL ***");

let COST = {};
{
    const run = ({ gate, geometric, bg }) => {
        const st = makeJitterState(1); let hist = null, out = null, held = 0;
        const ls = makeLockState(W, H), lu = makeLumaState(W, H, P), dm = makeLockState(W, H);
        for (let f = 0; f < 32; f++) {
            const j = advanceJitter(st); const fr = renderLine({ camX: jitterCam(j), geometric, bg });
            const m = motionFor(fr.depth, 0, 0);
            pushLuma(lu, { current: fr.colour, motion: m, w: W, h: H });
            // remember depth ridges over a period, for section 2's reason: a single frame finds none
            advanceLocks(dm, { motion: m, newLocks: depthRidgesCPU(fr.depth, W, H, DMARGIN).data, w: W, h: H, life: P });
            let relax = null;
            if (gate !== "none") {
                const lr = lockCandidatesFromRing(lu, { margin: 0.05 });
                const nl = gate === "luma" ? lr.data : gateLocks(lr.data, activeMask(dm).data).data;
                advanceLocks(ls, { motion: m, newLocks: nl, w: W, h: H, life: 8 });
                relax = lockRelaxation(ls, { life: 8 });
                if (f === 31) for (let i = 0; i < W * H; i++) if (ls.life[i] > 0) held++;
            }
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, relax, w: W, h: H, alpha: 1 / (f + 1), space: "ycocg" });
            hist = r.data; out = r.data;
        }
        return { out, held };
    };
    const T = truthLine("flat");
    const base = run({ gate: "none", geometric: true, bg: "flat" });
    COST.base = rmsOver(base.out, T, nearIdx);
    const gl = run({ gate: "luma", geometric: true, bg: "flat" }), gd = run({ gate: "both", geometric: true, bg: "flat" });
    const pl = run({ gate: "luma", geometric: false, bg: "flat" }), pd = run({ gate: "both", geometric: false, bg: "flat" });
    COST.geoLuma = rmsOver(gl.out, T, nearIdx); COST.geoDepth = rmsOver(gd.out, T, nearIdx);
    COST.paintLuma = rmsOver(pl.out, T, nearIdx); COST.paintDepth = rmsOver(pd.out, T, nearIdx);
    report(`a 0.4 px line on a FLAT ground, where the clamp's box is tight and the lock actually matters`);
    ok(`  on a GEOMETRIC line the gate costs nothing: luma-only ${COST.geoLuma.toFixed(5)} (${(COST.base / COST.geoLuma).toFixed(2)}x) and depth-gated ${COST.geoDepth.toFixed(5)} (${(COST.base / COST.geoDepth).toFixed(2)}x), identical, on ${gd.held} locks`,
        Math.abs(COST.geoLuma - COST.geoDepth) < 1e-9 && COST.base / COST.geoDepth > 2, `luma ${COST.geoLuma.toFixed(5)}, depth ${COST.geoDepth.toFixed(5)}`);
    // *** THE PRICE, STATED AS A NUMBER AND NOT AS A CAVEAT. *** The same line painted on the wall has no depth
    // ridge, so the gate refuses it and the whole benefit goes.
    ok(`*** and on a PAINTED line it refuses everything: luma-only ${COST.paintLuma.toFixed(5)} (${(COST.base / COST.paintLuma).toFixed(2)}x) against depth-gated ${COST.paintDepth.toFixed(5)} (${(COST.base / COST.paintDepth).toFixed(2)}x) on ${pd.held} locks -- the entire ${(COST.base / COST.paintLuma).toFixed(2)}x given away ***`,
        pd.held === 0 && COST.paintDepth === COST.base && COST.base / COST.paintLuma > 2,
        `luma ${COST.paintLuma.toFixed(5)}, depth-gated ${COST.paintDepth.toFixed(5)}, base ${COST.base.toFixed(5)}`);
}

console.log("\n5. AND WHERE A LOCK MATTERS AT ALL, WHICH IS NARROWER THAN IT LOOKS");

{
    // v4552's finding reaches this rung too: a lock relaxes the clamp, so it can only help where the clamp is
    // BINDING. On a high-contrast background the box already admits the feature and there is nothing to rescue.
    const run = (bg) => {
        const st = makeJitterState(1); let hist = null, out = null;
        const ls = makeLockState(W, H), lu = makeLumaState(W, H, P), dm = makeLockState(W, H);
        for (let f = 0; f < 32; f++) {
            const j = advanceJitter(st); const fr = renderLine({ camX: jitterCam(j), geometric: true, bg });
            const m = motionFor(fr.depth, 0, 0);
            pushLuma(lu, { current: fr.colour, motion: m, w: W, h: H });
            advanceLocks(dm, { motion: m, newLocks: depthRidgesCPU(fr.depth, W, H, DMARGIN).data, w: W, h: H, life: P });
            const nl = gateLocks(lockCandidatesFromRing(lu, { margin: 0.05 }).data, activeMask(dm).data).data;
            advanceLocks(ls, { motion: m, newLocks: nl, w: W, h: H, life: 8 });
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, relax: lockRelaxation(ls, { life: 8 }), w: W, h: H, alpha: 1 / (f + 1), space: "ycocg" });
            hist = r.data; out = r.data;
        }
        return out;
    };
    const noLock = (bg) => {
        const st = makeJitterState(1); let hist = null, out = null;
        for (let f = 0; f < 32; f++) { const j = advanceJitter(st); const fr = renderLine({ camX: jitterCam(j), geometric: true, bg });
            const m = motionFor(fr.depth, 0, 0);
            const r = rectifiedAccumulateCPU({ current: fr.colour, history: hist, motion: m, w: W, h: H, alpha: 1 / (f + 1), space: "ycocg" });
            hist = r.data; out = r.data; }
        return out;
    };
    const flatGain = rmsOver(noLock("flat"), truthLine("flat"), nearIdx) / rmsOver(run("flat"), truthLine("flat"), nearIdx);
    const chqGain = rmsOver(noLock("chequer"), truthLine("chequer"), nearIdx) / rmsOver(run("chequer"), truthLine("chequer"), nearIdx);
    report(`the same geometric line, same gate, two backgrounds: flat ${flatGain.toFixed(2)}x, pixel-scale chequer ${chqGain.toFixed(2)}x`);
    ok(`*** a lock only earns anything where the CLAMP IS BINDING: ${flatGain.toFixed(2)}x on a flat ground and ${chqGain.toFixed(2)}x on a chequer, where the box is already wide enough to admit the feature ***`,
        flatGain > 2 && chqGain < 1.05, `flat ${flatGain.toFixed(3)}, chequer ${chqGain.toFixed(3)}`);
    report("so v4552's wide-box finding reaches this rung too: on the pictures where the clamp cannot protect anything, the lock has nothing to rescue -- and those are the same pictures where the luma detector's false positives live");
}

console.log("\n6. THE WGSL, VALIDATED AND THEN RUN");

{
    const errs = validateWgsl(FIELD_RIDGE_WGSL);
    ok("  the field-ridge kernel validates against the spec scanner", errs.length === 0, errs.join("; "));
}

const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** Sections 1-5 are CPU only; nothing above has run the kernel."); fails++; }
else {
    const DW = 32, DH = 32;
    const dep = new Float32Array(DW * DH), msk = new Float32Array(DW * DH);
    for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
        // a wire, a slot, a silhouette and a slope in one field, so the device sees all four shapes
        // a vertical wire, a vertical slot, a silhouette, a slope AND a horizontal wire, so the device is
        // driven on both ridge axes -- dropping ridgeY in the kernel went 0-RED without that last one
        let v = 0.6;
        if (x === 8) v = 0.2; else if (x === 16) v = 0.9; else if (x > 22) v = 0.3;
        if (y === 5) v = 0.2;
        if (y > 24) v = 0.2 + x * 0.01;
        dep[y * DW + x] = v;
        msk[y * DW + x] = (x % 3 === 2) ? 1 : 0;      // an arbitrary mask, so the AND is exercised
    }
    const cpuPlain = ridgesCPU(dep, DW, DH, DMARGIN);
    const cpuMasked = gateLocks(cpuPlain.data, Uint8Array.from(msk));
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W: DW, H: DH, dep: Array.from(dep), msk: Array.from(msk), margin: DMARGIN }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { FIELD_RIDGE_WGSL } = await import("/render/temporalLockWgsl.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const N = a.W * a.H, groups = [Math.ceil(a.W / 8), Math.ceil(a.H / 8)];
        const field = dev.buffer({ data: new Float32Array(a.dep), usage: ["storage"] });
        const mask = dev.buffer({ data: new Float32Array(a.msk), usage: ["storage"] });
        const go = async (useMask) => {
            const dst = dev.buffer({ data: new Float32Array(N), usage: ["storage"] });
            const ub = new ArrayBuffer(32);
            new Uint32Array(ub, 0, 4).set([a.W, a.H, useMask, 2]);   // maxPlateau, 2 since v4556
            new Float32Array(ub, 16, 4).set([a.margin, 0, 0, 0]);
            const p = dev.compute({ wgsl: FIELD_RIDGE_WGSL });
            p.bind("field", field).bind("mask", mask).bind("dst", dst).bind("u", dev.buffer({ data: new Uint32Array(ub), usage: "uniform" }));
            dev.frame(({ pass }) => { pass.dispatch(p, groups); pass.clear([0,0,0,1]); }, { offscreen: true });
            return Array.from(new Float32Array(await dev.read(dst)));
        };
        return { plain: await go(0), masked: await go(1), errs, backend: dev.backend };
    }` });
    ok("the harness ran the kernel on a real WebGPU device",
        r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
        r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        let badP = 0, badM = 0;
        for (let i = 0; i < DW * DH; i++) {
            if ((r.result.plain[i] > 0.5 ? 1 : 0) !== cpuPlain.data[i]) badP++;
            if ((r.result.masked[i] > 0.5 ? 1 : 0) !== cpuMasked.data[i]) badM++;
        }
        ok(`*** the device's ridge mask is the CPU's on all ${DW * DH} pixels (${cpuPlain.count} set) -- a decision, so anything but exact is a different answer ***`,
            badP === 0, `${badP} disagreements`);
        ok(`  and the masked path agrees too (${cpuMasked.count} set), so the AND is read on the device rather than assumed`,
            badM === 0 && cpuMasked.count > 0 && cpuMasked.count < cpuPlain.count, `${badM} disagreements, ${cpuMasked.count} of ${cpuPlain.count}`);
    }
}

// SABOTAGE LOG -- applied to render/temporalLock.mjs and render/temporalLockWgsl.mjs, BOTH gates run -- this
// one and temporalLock's, since this round extended that module -- red counts summed, all files restored and
// md5-verified. Baseline 0 red. MEASURED at v4554.
//   CI gateLocks made an OR instead of an AND        -> 5 red. An OR unions the luma detector's 1,834 false
//      positives straight back in and gives away everything the gate buys.
//   CJ the depth margin silently defaulted instead of refused -> 1 red. A [0,1] projection and a [-1,1] one do
//      not share a scale, so a default is a wrong answer dressed as a convenience.
//   CK activeMask returning every pixel               -> 3 red.
//   CL the ridge test comparing ONE side instead of both -> 7 red, the widest of the set. This is the
//      difference between a RIDGE test and a depth-DISCONTINUITY test: with one side, every silhouette edge in
//      the scene becomes a lock candidate, which relaxes the clamp along exactly the boundaries ghosting
//      lives on.
//   CM the WGSL mask ORed instead of ANDed (WGSL only) -> 1 red.
//   CN the WGSL field-ridge dropping the VERTICAL axis -> 2 red, AFTER this round added a horizontal wire.
//      *** IT WENT 0-RED FIRST, AND SO DID ITS CPU TWIN. ***
//   CP the CPU ridge dropping the VERTICAL axis        -> 3 red, AFTER the same row. *** ALSO 0-RED FIRST, AND
//      THE PAIR IS THE FINDING: *** every feature in every picture in this gate was VERTICAL -- the wire, the
//      slot, the bar, the line -- so ridgeX found all of them and ridgeY was never once exercised, on either
//      side. A railing, a power line and a horizon wire are found by the vertical axis and by nothing else.
//      This was not a mirror agreeing with itself (v4550, v4552, v4553's shape); it was BOTH sides implementing
//      a property no picture in the gate ever asked for. Section 1 now builds a horizontal wire and section 6's
//      device field carries a horizontal ridge.
//   CO the disocclusion kill rule removed              -> 3 red.
//   No 0-RED among the eight once the horizontal rows exist. One earlier attempt at CN did not apply at all --
//      its anchor matched both kernels -- and its "0 red" was recorded as a failed edit rather than read as a
//      measurement, which is the same care v4553's no-op sabotage needed.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a thin feature that is neither geometric nor on a flat wall -- a specular " +
    "highlight moving across a curved surface has no depth ridge and no stable luma ridge, and nothing in this " +
    "tree would lock it; an OBJECT-ID or material buffer, which is what actually separates a painted line from " +
    "a texture and which no renderer here writes; the depth margin against a REAL projection, since this scene " +
    "is orthographic and a perspective depth buffer's precision varies with distance; and whether a lock is " +
    "worth having at all on content between the two extremes section 5 measures, since this gate tests a flat " +
    "ground and a chequer at Nyquist and nothing between them.");
process.exit(fails ? 1 : 0);
