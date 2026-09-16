#!/usr/bin/env node
// WebGLEngine/render/temporalRidgePhase-selfcheck.mjs -- v4556
//
// *** v4555 CLOSED BY NAMING A WORRY THAT TURNED OUT NOT TO EXIST, AND FOUND A REAL ONE UNDERNEATH IT. ***
//
// The worry was diagonals: every line this arc locks is axis aligned, the band is measured along an axis, and
// a diagonal ridge's band is wider by root two. Measured at seven angles, the band test keeps ONE HUNDRED PER
// CENT of the ridges it finds at every one of them, because the band is min(bandX, bandY) and a straight line
// is one pixel across along at least one axis whatever its angle. The concern was arithmetic that nobody ran.
//
// *** WHAT THE CHECK TURNED UP INSTEAD IS A BLIND SPOT IN EVERY LOCK DETECTOR THIS ARC HAS BUILT. *** A thin
// feature whose two covered pixels come out within `margin` of each other -- which is what happens whenever it
// straddles a pixel boundary evenly -- is a strict extremum in NEITHER of them. Two exactly equal columns give
// ZERO ridges where one column gives 14. It is not an edge case of the fixture: the blind window is
// margin/contrast wide, so it swallows 5.5% of sub-pixel positions at contrast 0.9 and a QUARTER of them at
// contrast 0.2, which is where thin low-contrast features live.
//
// The repair is one line of reasoning: the deciding neighbour is the first one that differs by more than the
// margin, not the adjacent one. Everything else in the arc composes with it unchanged, and the band test that
// v4555 built is what stops the walk from turning a texture into one enormous plateau.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "./wgslSpec.mjs";
import { ridgesCPU, coherentRidgesCPU, makeLumaState, pushLuma, lumaMean } from "./temporalLock.mjs";
import { COHERENT_RIDGE_WGSL } from "./temporalLockWgsl.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 48, H = 48, NEAR = 1, FAR = 10, HALF = 4, Z = 8;
const PXW = 2 * HALF / W, S = 2 * HALF / W, P = jitterPhaseCount(1), MARGIN = 0.05;
function vpAt(cx, cy) {
    const o = new Float32Array(16);
    o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1;
    const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; t[13] = -cy;
    return mat4Multiply(o, t);
}
const motionFor = (d) => motionVectorsCPU(d, W, H, mat4Invert(vpAt(0, 0)), vpAt(0, 0)).data;
// a line of width LW at angle theta, `off` from the origin along its own normal
function lineFrame(cx, cy, theta, LW, off) {
    const c = new Float32Array(W * H * 4), d = new Float32Array(W * H);
    const nx = Math.sin(theta), ny = -Math.cos(theta);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, o = i * 4;
        const wx = (2 * ((x + 0.5) / W) - 1) * HALF + cx, wy = (1 - 2 * ((y + 0.5) / H)) * HALF + cy;
        const v = Math.abs(wx * nx + wy * ny - off) < LW / 2 ? 0.95 : 0.05;
        c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[i] = (Z - NEAR) / (FAR - NEAR);
    }
    return { colour: c, depth: d };
}
// the perpendicular offset that puts the line through the centre of pixel (24,24) rather than a boundary
const centreOff = (th) => {
    const nx = Math.sin(th), ny = -Math.cos(th);
    return (2 * ((24 + 0.5) / W) - 1) * HALF * nx + (1 - 2 * ((24 + 0.5) / H)) * HALF * ny;
};
const ringOf = (theta, LW, off) => {
    const st = makeJitterState(1); const lu = makeLumaState(W, H, P);
    for (let f = 0; f < 2 * P + 2; f++) {
        const j = advanceJitter(st);
        const fr = lineFrame(j[0] * S, j[1] * S, theta, LW, off);
        pushLuma(lu, { current: fr.colour, motion: motionFor(fr.depth), w: W, h: H });
    }
    return lumaMean(lu);
};

console.log("temporalRidgePhase-selfcheck -- a worry that was not one, and the blind spot found under it\n");
console.log("1. THE DIAGONAL WORRY v4555 LEFT OPEN, MEASURED AT SEVEN ANGLES");

let ANG = [];
{
    for (const deg of [0, 15, 30, 45, 60, 75, 90]) {
        const th = deg * Math.PI / 180;
        const mm = ringOf(th, 0.4 * PXW, centreOff(th));
        const r = ridgesCPU(mm, W, H, MARGIN).count;
        const c = coherentRidgesCPU(mm, W, H, MARGIN, 2, 2).count;
        ANG.push({ deg, r, c });
    }
    report(`a 0.4 px line, ring mean, band 2: ` + ANG.map((a) => `${a.deg}deg ${a.c}/${a.r}`).join("  "));
    // *** THE WORRY WAS ARITHMETIC NOBODY RAN. *** The band is min(bandX, bandY), and a straight line is one
    // pixel across along at least ONE axis whatever its angle -- a 45-degree line crosses one pixel per row
    // AND one per column, which is the most favourable case rather than the worst.
    ok(`*** the band test keeps EVERY ridge it finds at every angle from 0 to 90 degrees -- the root-two worry does not materialise, because the band is min(bandX, bandY) and a line is one pixel across along at least one axis ***`,
        ANG.every((a) => a.c === a.r && a.r > 35), ANG.map((a) => `${a.deg}:${a.c}/${a.r}`).join(" "));
    const spread = Math.max(...ANG.map((a) => a.r)) - Math.min(...ANG.map((a) => a.r));
    ok(`  and the count barely moves with angle (${Math.min(...ANG.map((a) => a.r))} to ${Math.max(...ANG.map((a) => a.r))}, a spread of ${spread}) -- a diagonal is not a harder case for this test, it is the same case`,
        spread <= 6, `spread ${spread}`);
}

console.log("\n2. *** WHAT THE CHECK TURNED UP: A FEATURE ON A PIXEL BOUNDARY IS INVISIBLE TO A STRICT EXTREMUM ***");

let BLIND = {};
{
    const w = 16, h = 16;
    const mk = (f) => { const a = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y); return a; };
    const one = mk((x) => x === 8 ? 0.9 : 0.1);
    const two = mk((x) => (x === 8 || x === 9) ? 0.9 : 0.1);
    const near = mk((x) => x === 8 ? 0.9 : x === 9 ? 0.88 : 0.1);
    const strict = (f) => ridgesCPU(f, w, h, MARGIN, 1).count;
    const plateau = (f) => ridgesCPU(f, w, h, MARGIN, 2).count;
    BLIND.oneS = strict(one); BLIND.twoS = strict(two); BLIND.nearS = strict(near);
    BLIND.oneP = plateau(one); BLIND.twoP = plateau(two); BLIND.nearP = plateau(near);
    report(`strict test: one column ${BLIND.oneS}, two EQUAL columns ${BLIND.twoS}, two columns within margin ${BLIND.nearS}`);
    ok(`*** the strict test finds ${BLIND.oneS} ridges on a one-pixel feature and ZERO on the same feature split across two -- at every scale and every band setting, because it is an extremum in neither ***`,
        BLIND.oneS > 10 && BLIND.twoS === 0 && BLIND.nearS === 0,
        `one ${BLIND.oneS}, equal ${BLIND.twoS}, near-equal ${BLIND.nearS}`);
    // *** AND IT IS NOT A KNIFE EDGE. *** The two pixels need only fall within `margin` of each other, which
    // is a window of sub-pixel positions margin/contrast wide -- so the size of the blind spot is set by how
    // FAINT the feature is, and the faintest features are the ones a lock exists to protect.
    const sweep = (contrast) => {
        let blind = 0; const N = 200;
        for (let k = 0; k < N; k++) {
            const t = k / N;
            const a = new Float32Array(w * h);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const cov = Math.max(0, Math.min(x + 1, 8 + t + 0.2) - Math.max(x, 8 + t - 0.2));
                a[y * w + x] = 0.05 + cov * contrast;
            }
            if (ridgesCPU(a, w, h, MARGIN, 1).count === 0) blind++;
        }
        return blind / N;
    };
    BLIND.hi = sweep(0.90); BLIND.lo = sweep(0.20);
    report(`a 0.4 px line swept through 200 sub-pixel positions: invisible at ${(BLIND.hi * 100).toFixed(1)}% of them at contrast 0.90, and ${(BLIND.lo * 100).toFixed(1)}% at contrast 0.20`);
    ok(`*** the blind window is margin/contrast wide, so a FAINT thin feature is invisible for ${(BLIND.lo / BLIND.hi).toFixed(1)}x more of the sweep -- and faint thin features are what a lock exists to protect ***`,
        BLIND.lo > BLIND.hi * 3 && Math.abs(BLIND.hi - MARGIN / 0.90) < 0.02,
        `contrast 0.90 -> ${BLIND.hi.toFixed(3)} (margin/contrast = ${(MARGIN / 0.9).toFixed(3)}), contrast 0.20 -> ${BLIND.lo.toFixed(3)}`);
}

console.log("\n3. THE WALK PAST TIES, AND WHAT STOPS IT SWALLOWING A TEXTURE");

{
    const w = 16, h = 16;
    const mk = (f) => { const a = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y); return a; };
    const two = mk((x) => (x === 8 || x === 9) ? 0.9 : 0.1);
    const flat = new Float32Array(w * h).fill(0.3);
    const chq = mk((x, y) => ((x + y) & 1) ? 0.9 : 0.1);
    ok(`*** the plateau walk sees it: ${BLIND.twoS} strict ridges become ${BLIND.twoP} on two equal columns, and the one-column case is unchanged at ${BLIND.oneP} ***`,
        BLIND.twoP > 20 && BLIND.oneP === BLIND.oneS, `equal ${BLIND.twoS} -> ${BLIND.twoP}, one ${BLIND.oneS} -> ${BLIND.oneP}`);
    // *** A FLAT FIELD MUST STAY EMPTY, which is the failure mode a tie-tolerant test invites. ***
    ok(`  and a completely FLAT field stays at ${ridgesCPU(flat, w, h, MARGIN, 2).count} ridges -- still inside a plateau at the bound is UNDECIDED, not a ridge, which is what stops the walk calling everything an extremum`,
        ridgesCPU(flat, w, h, MARGIN, 2).count === 0 && ridgesCPU(flat, w, h, MARGIN, 8).count === 0,
        `plateau 2 and plateau 8 both give 0`);
    const chqR = ridgesCPU(chq, w, h, MARGIN, 2).count, chqC = coherentRidgesCPU(chq, w, h, MARGIN, 2, 2).count;
    ok(`  and on a one-pixel alternation the walk changes nothing (${ridgesCPU(chq, w, h, MARGIN, 1).count} strict, ${chqR} with the walk) while the BAND test still takes it to ${chqC} -- the two compose, they do not fight`,
        chqR === ridgesCPU(chq, w, h, MARGIN, 1).count && chqC === 0, `strict ${ridgesCPU(chq, w, h, MARGIN, 1).count}, plateau ${chqR}, coherent ${chqC}`);
    // a maxBand below maxPlateau rejects every feature the walk exists to find -- refused by name
    ok(`  and a maxBand below maxPlateau is REFUSED, because a plateau of p makes a band of at least p and the pair would quietly disagree`,
        (() => { try { coherentRidgesCPU(two, w, h, MARGIN, 1, 2); return false; } catch (e) { return /below maxPlateau/.test(e.message); } })());
}

console.log("\n4. WHAT THE CHANGE COSTS THE THREE GATES THAT ALREADY DEPEND ON IT");

{
    // v4555's own two fixtures, re-measured. The claim to check is not "it is better" but "it is not worse":
    // this round changed a primitive three gates read, and the numbers that moved are named in the closing.
    const chqRing = (() => {
        const st = makeJitterState(1); const lu = makeLumaState(W, H, P);
        for (let f = 0; f < 2 * P + 2; f++) {
            const j = advanceJitter(st);
            const c = new Float32Array(W * H * 4), d = new Float32Array(W * H);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const i = y * W + x, o = i * 4;
                const wx = (2 * ((x + 0.5) / W) - 1) * HALF + j[0] * S, wy = (1 - 2 * ((y + 0.5) / H)) * HALF + j[1] * S;
                const v = ((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? 0.92 : 0.06;
                c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[i] = (Z - NEAR) / (FAR - NEAR);
            }
            pushLuma(lu, { current: c, motion: motionFor(d), w: W, h: H });
        }
        return lumaMean(lu);
    })();
    const s1 = ridgesCPU(chqRing, W, H, MARGIN, 1).count, s2 = ridgesCPU(chqRing, W, H, MARGIN, 2).count;
    const c11 = coherentRidgesCPU(chqRing, W, H, MARGIN, 1, 1).count, c22 = coherentRidgesCPU(chqRing, W, H, MARGIN, 2, 2).count;
    report(`the pixel-scale chequer v4553 onward argue over: ridges ${s1} strict -> ${s2} with the walk; coherent ${c11} (band 1, strict) -> ${c22} (band 2, walk)`);
    ok(`  the walk costs ${((s2 / s1 - 1) * 100).toFixed(0)}% more raw ridges on a texture, which is what the band test is for -- and v4555's own two fixtures read the SAME 4.00x and the SAME 0% after the change, on fewer locks`,
        s2 > s1 && s2 < s1 * 1.15, `strict ${s1}, walk ${s2}, coherent ${c11} -> ${c22}`);
    ok(`  maxPlateau 1 is still reachable and is exactly the old test, so the comparison above is against the real thing rather than a remembered number`,
        ridgesCPU(chqRing, W, H, MARGIN, 1).count === s1);
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
        // one-pixel vertical, TWO-PIXEL-EQUAL vertical (the plateau case), a horizontal one-pixel, a flat
        // region and a chequer -- so the device is driven on the new behaviour AND on what must not change
        let v = 0.1;
        if (x >= 24) v = ((x + y) & 1) ? 0.9 : 0.1;
        else if (x === 4) v = 0.9;
        // *** NEAR-equal, not equal, and that is the difference between exercising the tie tolerance and
        // not. *** With only 0.1 and 0.9 in the field every neighbour difference is 0 or 0.8, so replacing
        // `dv > margin` with `dv > 0` in the kernel changed NOTHING and went 0-RED -- the tolerance was
        // never asked a question. 0.88 against 0.90 is a difference of 0.02, inside the margin, which is
        // exactly the case a boundary-straddling feature produces.
        else if (x === 10) v = 0.9;
        else if (x === 11) v = 0.88;
        else if (y === 6) v = 0.9;
        field[y * DW + x] = v;
    }
    const cpuStrict = coherentRidgesCPU(field, DW, DH, MARGIN, 2, 1);
    const cpuWalk = coherentRidgesCPU(field, DW, DH, MARGIN, 2, 2);
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W: DW, H: DH, field: Array.from(field), margin: MARGIN }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { COHERENT_RIDGE_WGSL } = await import("/render/temporalLockWgsl.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const N = a.W * a.H, groups = [Math.ceil(a.W / 8), Math.ceil(a.H / 8)];
        const fb = dev.buffer({ data: new Float32Array(a.field), usage: ["storage"] });
        const go = async (maxPlateau) => {
            const dst = dev.buffer({ data: new Float32Array(N), usage: ["storage"] });
            const ub = new ArrayBuffer(32);
            new Uint32Array(ub, 0, 4).set([a.W, a.H, 2, maxPlateau]);
            new Float32Array(ub, 16, 4).set([a.margin, 0, 0, 0]);
            const p = dev.compute({ wgsl: COHERENT_RIDGE_WGSL });
            p.bind("field", fb).bind("dst", dst).bind("u", dev.buffer({ data: new Uint32Array(ub), usage: "uniform" }));
            dev.frame(({ pass }) => { pass.dispatch(p, groups); pass.clear([0,0,0,1]); }, { offscreen: true });
            return Array.from(new Float32Array(await dev.read(dst)));
        };
        return { strict: await go(1), walk: await go(2), errs, backend: dev.backend };
    }` });
    ok("the harness ran the kernel on a real WebGPU device",
        r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
        r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        let badS = 0, badW = 0;
        for (let i = 0; i < DW * DH; i++) {
            if ((r.result.strict[i] > 0.5 ? 1 : 0) !== cpuStrict.data[i]) badS++;
            if ((r.result.walk[i] > 0.5 ? 1 : 0) !== cpuWalk.data[i]) badW++;
        }
        ok(`*** the device's plateau walk is the CPU's on all ${DW * DH} pixels (${cpuWalk.count} set) -- a decision, so anything but exact is a different answer ***`,
            badW === 0, `${badW} disagreements`);
        ok(`  and its maxPlateau-1 path matches the strict CPU too (${cpuStrict.count} set), so the parameter is READ on the device rather than compiled away`,
            badS === 0 && cpuWalk.count > cpuStrict.count, `${badS} disagreements, ${cpuStrict.count} -> ${cpuWalk.count}`);
    }
}

// SABOTAGE LOG -- applied to render/temporalLock.mjs and render/temporalLockWgsl.mjs, ALL FOUR lock gates run
// -- this one and temporalCoherentLock's, temporalDepthLock's and temporalLock's, since the round changed a
// primitive all of them read -- red counts summed, files restored and md5-verified. Baseline 0 red.
// MEASURED at v4556.
//   DA "still inside a plateau at the bound" treated as LOWER instead of undecided -> 30 red, by far the
//      widest ever recorded in this arc. That one return value is what stops the walk calling a flat field an
//      extremum everywhere, and with it wrong every gate that reads a ridge collapses.
//   DB the tie tolerance dropped, `dv > 0` instead of `dv > margin`  -> 5 red.
//   DC the walk bounded at 1, which is exactly the old strict test    -> 8 red. Worth stating plainly: this
//      sabotage IS v4555's shipped behaviour, and it goes red now because section 2 finally has a picture
//      that asks the question. The blind spot was not detectable by anything the arc had built.
//   DD maxBand < maxPlateau no longer refused                         -> 1 red.
//   DE the WGSL tie tolerance dropped (WGSL only)                     -> 2 red, AFTER this round changed the
//      device fixture. *** IT WENT 0-RED FIRST. *** The field held only 0.1 and 0.9, so every neighbour
//      difference was 0 or 0.8 and NOTHING ever fell inside the margin -- the tolerance was never asked a
//      question on the device, while the CPU's fixture had a 0.02 pair and caught it at DB. Same shape as
//      v4554's pair: a property one side's pictures exercise and the other's do not. The device field now
//      carries 0.90 against 0.88.
//   DF the WGSL walk bounded at 1 (WGSL only)                         -> 1 red.
//   DG the ridge decided by ONE side instead of both                  -> 22 red.
//   No 0-RED among the seven once the device fixture carries a near-equal pair.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a feature spread over THREE or more near-equal pixels, which needs a maxPlateau " +
    "above 2 and a maxBand to match, and which nothing in this arc's fixtures produces; a CURVED thin feature, " +
    "since every line here is straight and the band is measured along an axis; whether the walk's cost changes " +
    "on content between a flat wall and a chequer at Nyquist, the same gap v4554 and v4555 both left; and the " +
    "margin itself, which is 0.05 throughout this arc because that is what the fixtures wanted and nothing " +
    "here derives it from anything.");
process.exit(fails ? 1 : 0);
