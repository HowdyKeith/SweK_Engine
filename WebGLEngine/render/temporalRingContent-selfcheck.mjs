#!/usr/bin/env node
// WebGLEngine/render/temporalRingContent-selfcheck.mjs -- v4559
//
// *** EVERY FLOOR NUMBER IN THIS ARC IS MEASURED ON ONE SMOOTH SINUSOID, WHICH IS BILINEAR REPROJECTION'S
// BEST CASE. *** v4558 said so in its own closing and shipped anyway. This round measures the floor on
// content with energy at the pixel scale, and the answer changes the conclusion of two rounds.
//
// WHAT SURVIVES, AND IS NOW FAR BETTER SUPPORTED: the phase law. An integer displacement is EXACT for a
// smooth sinusoid, for a texture four times finer, for a chequer AT the pixel scale, and for a hard step
// edge alike -- because a whole-texel step lands the bilinear fetch on texel centres and nothing is
// interpolated, whatever the texture holds. v4558 measured that on one content; it holds on all four.
//
// *** WHAT DOES NOT: THE MAGNITUDE. *** At a half-pixel phase the floor is 6.7e-4 on the smooth surface and
// 4.35e-1 on the chequer -- 650x -- and 4.35e-1 is EIGHT TIMES the arc's margin of 0.05.
//
// So v4557's withdrawn headline is TRUE AFTER ALL, and for a reason it never named. It said the floor
// crosses the margin as a function of camera SPEED; v4558 showed that is false, since integer speeds are
// exact. The floor crosses the margin as a function of CONTENT, and it crosses it at a period of about
// twelve pixels -- which is ordinary detail, not pixel-scale texture. A round can be wrong in its mechanism
// and right in its alarm, and both halves have to be said.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { makeLumaState, pushLuma, lumaMean, ringCoverage, ridgesCPU,
         makeLockState, advanceLocks } from "./temporalLock.mjs";
import { RING_PUSH_WGSL } from "./temporalLockWgsl.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 32, H = 32, NEAR = 1, FAR = 10, HALF = 4, Z = 8, S = 2 * HALF / W, P = jitterPhaseCount(1);
const ARC_MARGIN = 0.05;
const WORLD = 2 * HALF;                     // world units across the frame
const vp = (cx) => { const o = new Float32Array(16);
    o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1;
    const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx;
    return mat4Multiply(o, t); };
// four contents, from bilinear's best case to its worst. `sine(f)` is the same family at any frequency, so
// the sweep in section 3 varies ONE thing and the four named contents are points on or beside it.
const sine = (f) => (wx, wy) => 0.5 + 0.45 * Math.sin(wx * f * 2 * Math.PI) * Math.cos(wy * f * 2 * Math.PI * 0.8);
const CONTENT = {
    smooth: (wx, wy) => 0.5 + 0.45 * Math.sin(wx * 0.35) * Math.cos(wy * 0.28),          // the arc's fixture
    finer: (wx, wy) => 0.5 + 0.45 * Math.sin(wx * 1.4) * Math.cos(wy * 1.1),             // four times finer
    chequer: (wx, wy) => ((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? 0.92 : 0.06,  // AT the pixel scale
    edge: (wx) => wx < 0.37 ? 0.06 : 0.92,                                                // one hard step
};
function sweep(fn, speed, frames = 2 * P + 4) {
    const st = makeJitterState(1), lu = makeLumaState(W, H, P), offs = [];
    for (let i = 0; i < frames; i++) {
        const j = advanceJitter(st), cx = i * speed;
        const c = new Float32Array(W * H * 4), d = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const k = y * W + x, o = k * 4;
            const v = fn((2 * ((x + 0.5) / W) - 1) * HALF + cx + j[0] * S, (1 - 2 * ((y + 0.5) / H)) * HALF + j[1] * S);
            c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[k] = (Z - NEAR) / (FAR - NEAR);
        }
        pushLuma(lu, { current: c, motion: motionVectorsCPU(d, W, H, mat4Invert(vp(cx)), vp(cx - speed)).data, w: W, h: H });
        offs.push({ j, cx });
    }
    return { lu, offs: offs.slice(-P), cxNow: (frames - 1) * speed };
}
/** v4558's corrected reference: the surface at pixel i NOW, under each frame's jitter. */
function refNow(fn, offs, cxNow) {
    const a = new Float32Array(W * H);
    for (const o of offs) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        a[y * W + x] += fn((2 * ((x + 0.5) / W) - 1) * HALF + cxNow + o.j[0] * S,
                           (1 - 2 * ((y + 0.5) / H)) * HALF + o.j[1] * S) / offs.length;
    }
    return a;
}
const worstOf = (mm, a, lu) => {
    let w = 0; for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
        const i = y * W + x; if (lu.filled[i] < lu.frames) continue;
        w = Math.max(w, Math.abs(mm[i] - a[i]));
    } return w;
};
const floorOf = (fn, speed) => { const q = sweep(fn, speed); return worstOf(lumaMean(q.lu), refNow(fn, q.offs, q.cxNow), q.lu); };

console.log("temporalRingContent-selfcheck -- the floor on content that is not the arc's best case\n");
console.log("1. THE PHASE LAW HOLDS ON EVERY CONTENT, WHICH IS THE HALF OF v4558 THAT SURVIVES");

const F = {};
const TIE = { cpu: null, dev: null };
{
    for (const [name, fn] of Object.entries(CONTENT)) {
        F[name] = {};
        for (const spd of [0, 0.5, 1]) F[name][spd] = floorOf(fn, spd * S);
    }
    report("content  | speed 0   | 0.5       | 1 (integer)");
    for (const name of Object.keys(CONTENT)) {
        report(`  ${name.padEnd(7)} | ` + [0, 0.5, 1].map((s) => F[name][s].toExponential(2)).join(" | "));
    }
    // *** A WHOLE-TEXEL STEP IS EXACT WHATEVER THE TEXTURE HOLDS, because nothing is interpolated. ***
    const intWorst = Math.max(...Object.keys(CONTENT).flatMap((n) => [F[n][0], F[n][1]]));
    const fracWorst = Math.max(...Object.keys(CONTENT).map((n) => F[n][0.5]));
    ok(`*** integer displacements are EXACT on ALL FOUR contents -- worst ${intWorst.toExponential(2)} across a smooth sinusoid, a texture four times finer, a chequer at the pixel scale and a hard step edge -- because a whole-texel step lands the fetch on texel centres and nothing is interpolated ***`,
        intWorst < 1e-4 && fracWorst > intWorst * 1e3,
        Object.keys(CONTENT).map((n) => `${n} int ${Math.max(F[n][0], F[n][1]).toExponential(1)}`).join(", "));
    ok(`  so v4558's phase law was measured on one content and holds on four -- the EXACTNESS is a property of the fetch, not of the picture`,
        Object.keys(CONTENT).every((n) => Math.max(F[n][0], F[n][1]) < 1e-4));
}

console.log("\n2. *** BUT THE MAGNITUDE IS THE PICTURE'S, AND IT IS EIGHT TIMES THE ARC'S MARGIN ***");

{
    const sm = F.smooth[0.5], ch = F.chequer[0.5], ed = F.edge[0.5], fi = F.finer[0.5];
    report(`at a half-pixel phase: smooth ${sm.toExponential(2)}, four-times-finer ${fi.toExponential(2)}, hard edge ${ed.toExponential(2)}, chequer ${ch.toExponential(2)}`);
    ok(`*** the floor is ${(ch / sm).toExponential(0)}x larger on a pixel-scale chequer than on the arc's smooth fixture (${ch.toExponential(2)} against ${sm.toExponential(2)}) -- so every floor this arc has recorded is a LOWER BOUND measured on the easiest content there is ***`,
        ch > sm * 100, `smooth ${sm.toExponential(3)}, chequer ${ch.toExponential(3)}`);
    // *** AND THIS IS THE PICTURE v4553 THROUGH v4556 ARGUE OVER. *** Those rounds chose a pixel-scale
    // chequer deliberately, as the adversarial case for a lock detector. It is also the adversarial case for
    // the ring the detector reads.
    ok(`*** on that chequer the floor is ${(ch / ARC_MARGIN).toFixed(1)}x the arc's margin of ${ARC_MARGIN} -- and the chequer is not an exotic choice, it is the fixture v4553 through v4556 deliberately argue over ***`,
        ch > ARC_MARGIN * 4, `floor ${ch.toExponential(3)}, margin ${ARC_MARGIN}`);
    ok(`  and a single hard EDGE is nearly as bad (${ed.toExponential(2)}, ${(ed / ARC_MARGIN).toFixed(1)}x the margin), so this is not about periodic texture -- any content with energy at the pixel scale does it`,
        ed > ARC_MARGIN, `edge ${ed.toExponential(3)}`);
}

console.log("\n3. WHERE IT CROSSES, AND THE LAW ON THE WAY UP");

let CROSS = null;
{
    // one family, one varying parameter: cycles per pixel. The four contents above are points beside this.
    const rows = [];
    for (const f of [0.30, 0.45, 0.60, 0.75, 2.80]) {
        const cpp = f * WORLD / W;                       // cycles per PIXEL, which is the unit that matters
        const e = floorOf(sine(f), 0.5 * S);
        rows.push({ f, cpp, e, ratio: e / ARC_MARGIN, k: e / (cpp * cpp) });
    }
    for (const r of rows) report(`  ${r.cpp.toFixed(3)} cyc/px (period ${(1 / r.cpp).toFixed(1)} px): floor ${r.e.toExponential(2)}, ${r.ratio.toFixed(2)}x the margin, e/f^2 = ${r.k.toFixed(1)}`);
    // find the crossing by interpolation between the two rows that straddle it
    for (let i = 1; i < rows.length; i++) {
        if (rows[i - 1].ratio < 1 && rows[i].ratio >= 1) {
            const t = (1 - rows[i - 1].ratio) / (rows[i].ratio - rows[i - 1].ratio);
            CROSS = rows[i - 1].cpp + t * (rows[i].cpp - rows[i - 1].cpp);
            break;
        }
    }
    ok(`*** the floor reaches the arc's margin at ${CROSS.toFixed(3)} cycles per pixel -- a period of about ${(1 / CROSS).toFixed(0)} PIXELS, which is ordinary detail rather than pixel-scale texture ***`,
        CROSS !== null && CROSS > 0.05 && CROSS < 0.15, `crossing at ${CROSS && CROSS.toFixed(4)} cyc/px`);
    // *** QUADRATIC BELOW THE CROSSING, AND THAT IS WHAT BILINEAR ERROR IS. *** The residual of linear
    // interpolation goes with the second derivative, which goes with frequency squared -- so e/f^2 should be
    // flat while the signal is resolved, and fall away once the content reaches Nyquist and the error
    // saturates at the signal's own range.
    const below = rows.filter((r) => r.cpp <= 0.12).map((r) => r.k);
    const spread = (Math.max(...below) - Math.min(...below)) / Math.max(...below);
    ok(`*** and it is QUADRATIC in cycles-per-pixel below the crossing: e/f^2 stays within ${(spread * 100).toFixed(0)}% across those rows (${below.map((k) => k.toFixed(1)).join(", ")}) -- which is what linear interpolation's residual does, since it follows the second derivative ***`,
        spread < 0.25, `e/f^2 = ${below.map((k) => k.toFixed(2)).join(", ")}`);
    const sat = rows[rows.length - 1];
    ok(`  and it SATURATES above Nyquist rather than growing without bound -- at ${sat.cpp.toFixed(2)} cyc/px the floor is ${sat.e.toExponential(2)}, which is the signal's own range and not a multiple of it`,
        sat.e < 0.5 && sat.k < below[0] / 2, `at ${sat.cpp.toFixed(2)} cyc/px: ${sat.e.toExponential(3)}, e/f^2 ${sat.k.toFixed(2)}`);
}

console.log("\n4. WHAT THAT DOES TO v4557's WITHDRAWN HEADLINE");

{
    // v4557: "the floor climbs THROUGH the margin". v4558 withdrew it because integer speeds are exact.
    // Both stand: the mechanism was wrong and the alarm was right, and it is worth being precise about which.
    report(`v4557 claimed the floor crosses ${ARC_MARGIN} as a function of camera SPEED; v4558 withdrew that, since integer speeds are exact`);
    report(`it crosses as a function of CONTENT instead -- and on the arc's own adversarial fixture it is over by ${(F.chequer[0.5] / ARC_MARGIN).toFixed(1)}x`);
    // the two are distinguishable, and this row is what distinguishes them: hold the content and vary the
    // speed (exact at integers, so NOT a speed law), then hold the speed and vary the content (crosses).
    const speedSpread = F.chequer[1] / F.chequer[0.5];
    const contentSpread = F.chequer[0.5] / F.smooth[0.5];
    ok(`*** the two claims are told apart by holding one thing still: across SPEEDS on fixed content the floor spans ${speedSpread.toExponential(1)} (exact at integers), while across CONTENT at fixed speed it spans ${contentSpread.toExponential(0)}x -- so it is a content law with a phase gate, not a speed law ***`,
        speedSpread < 1e-3 && contentSpread > 100,
        `speed spread ${speedSpread.toExponential(2)}, content spread ${contentSpread.toExponential(2)}`);
    // and the consequence for the arc: on pixel-scale content under motion, ridges in the ring mean are
    // largely the reprojection's own artefacts, at a margin that cannot separate them
    const q = sweep(CONTENT.chequer, 0.5 * S);
    const mm = lumaMean(q.lu);
    const a = refNow(CONTENT.chequer, q.offs, q.cxNow);
    const rMeasured = ridgesCPU(mm, W, H, ARC_MARGIN, 2).count;
    const rTruth = ridgesCPU(a, W, H, ARC_MARGIN, 2).count;
    let agree = 0, either = 0;
    const A = ridgesCPU(mm, W, H, ARC_MARGIN, 2).data, B = ridgesCPU(a, W, H, ARC_MARGIN, 2).data;
    for (let i = 0; i < W * H; i++) { if (A[i] && B[i]) agree++; if (A[i] || B[i]) either++; }
    report(`ridges on the chequer at half-pixel motion: ${rMeasured} in the ring mean, ${rTruth} in the truth it is supposed to be, ${agree} of ${either} in common`);
    // the bound is what THIS fixture supports, stated after measuring it rather than carried from a longer
    // run -- shortening the sweep from 32 frames to 2P+4 moved it from 87% to 90%, which is the kind of drift
    // that turns a threshold into a number nobody re-took
    ok(`*** and the consequence is not abstract: on that content the ring's ridges and the truth's agree on only ${(agree / either * 100).toFixed(0)}% of the union, so a lock placed there is placed on the reprojection's artefacts as much as on the picture ***`,
        agree / either < 0.95 && either > 100, `${agree}/${either} = ${(agree / either * 100).toFixed(1)}%`);
}

console.log("\n5. *** A CROSS-BACKEND DIVERGENCE THIS ARC HAS CARRIED, VISIBLE ONLY ON THIS CONTENT ***");

const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** Sections 1-4 are CPU only; nothing above has run a kernel."); fails++; }
else {
    // Every device row in this arc has driven the ring on SMOOTH content, or at an integer speed, or with a
    // still camera. Under a HALF-TEXEL translation the reprojection reaches the frame edge at a coordinate
    // that lands exactly on the bounds test, and f64 here and f32 there fall on opposite sides: one mirror
    // resets the ring, the other reprojects. render/temporalLock.mjs records four repairs that did not hold.
    // This section does not assert agreement that is not there. It measures the divergence and bounds it.
    // *** 24, NOT 16, AND THAT IS PART OF THE FINDING. *** The divergence needs the reprojection to land
    // EXACTLY on the bounds test, which depends on the frame size as well as the speed: at 16 the same
    // fixture shows ZERO disagreements. A defect that appears at one resolution and not another is a defect
    // that a fixture can hide by accident, which is most of why six rounds of parity rows never met it.
    const DW = 24, DH = 24, speed = 0.5 * (2 * HALF / DW), FR = P + 2;  // the divergence appears by frame 3; a longer run only costs harness time
    const dvp = (cx) => { const o = new Float32Array(16);
        o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1;
        const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; return mat4Multiply(o, t); };
    const build = (fn) => {
        const cpu = makeLumaState(DW, DH, P), frames = [], st = makeJitterState(1);
        for (let f = 0; f < FR; f++) {
            const j = advanceJitter(st), cx = f * speed;
            const c = new Float32Array(DW * DH * 4), d = new Float32Array(DW * DH);
            for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
                const i = y * DW + x, o = i * 4;
                const v = fn((2 * ((x + 0.5) / DW) - 1) * HALF + cx + j[0] * S, (1 - 2 * ((y + 0.5) / DH)) * HALF + j[1] * S);
                c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[i] = (Z - NEAR) / (FAR - NEAR);
            }
            const m = motionVectorsCPU(d, DW, DH, mat4Invert(dvp(cx)), dvp(cx - speed)).data;
            frames.push({ colour: Array.from(c), motion: Array.from(m) });
            pushLuma(cpu, { current: c, motion: m, w: DW, h: DH });
        }
        return { cpu, frames };
    };
    const CH = build(CONTENT.chequer), SM = build(CONTENT.smooth);
    // *** THE DEVICE HAD NO TIE ROW AT ALL, AND THE SABOTAGE IS WHAT SAID SO. *** Rewriting the kernel's
    // floor back to round went 0-RED: the fix v4559 kept was pinned on the CPU only, so the mirror it was
    // FOR could have drifted straight back. This is a 24x1 push -- one dispatch on the device already
    // booted for the section -- with the fill counts seeded to the texel index, so the kernel's answer
    // names the texel it read rather than merely agreeing with a number computed here.
    const TW = 32;                          // 32 so texel 24 exists: a tie that clamps proves nothing
    const tieC = new Float32Array(TW * 4), tieM = new Float32Array(TW * 4), tieF = new Float32Array(TW);
    for (let x = 0; x < TW; x++) { tieM[x * 4] = 23.5 / TW - (x + 0.5) / TW; tieM[x * 4 + 2] = 1; tieF[x] = x; }
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W: DW, H: DH, P, chequer: CH.frames, smooth: SM.frames,
                    tie: { w: TW, colour: Array.from(tieC), motion: Array.from(tieM), filled: Array.from(tieF) } }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { RING_PUSH_WGSL } = await import("/render/temporalLockWgsl.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const N = a.W * a.H, F = 2 * a.P, groups = [Math.ceil(a.W / 8), Math.ceil(a.H / 8)];
        const go = async (frames) => {
            let rA = dev.buffer({ data: new Float32Array(N * F), usage: ["storage"] });
            let rB = dev.buffer({ data: new Float32Array(N * F), usage: ["storage"] });
            let fA = dev.buffer({ data: new Float32Array(N), usage: ["storage"] });
            let fB = dev.buffer({ data: new Float32Array(N), usage: ["storage"] });
            for (let f = 0; f < frames.length; f++) {
                const ub = new ArrayBuffer(16); new Uint32Array(ub, 0, 4).set([a.W, a.H, a.P, f === 0 ? 1 : 0]);
                const p = dev.compute({ wgsl: RING_PUSH_WGSL });
                p.bind("cur", dev.buffer({ data: new Float32Array(frames[f].colour), usage: ["storage"] }))
                 .bind("motion", dev.buffer({ data: new Float32Array(frames[f].motion), usage: ["storage"] }))
                 .bind("ringIn", rA).bind("filledIn", fA).bind("ringOut", rB).bind("filledOut", fB)
                 .bind("u", dev.buffer({ data: new Uint32Array(ub), usage: "uniform" }));
                dev.frame(({ pass }) => { pass.dispatch(p, groups); pass.clear([0,0,0,1]); }, { offscreen: true });
                const t = rA; rA = rB; rB = t; const g = fA; fA = fB; fB = g;
            }
            return { ring: Array.from(new Float32Array(await dev.read(rA))), filled: Array.from(new Float32Array(await dev.read(fA))) };
        };
        const goTie = async (t) => {
            const F2 = 2 * a.P;
            const p = dev.compute({ wgsl: RING_PUSH_WGSL });
            const fOut = dev.buffer({ data: new Float32Array(t.w), usage: ["storage"] });
            const ub = new ArrayBuffer(16); new Uint32Array(ub, 0, 4).set([t.w, 1, a.P, 0]);
            p.bind("cur", dev.buffer({ data: new Float32Array(t.colour), usage: ["storage"] }))
             .bind("motion", dev.buffer({ data: new Float32Array(t.motion), usage: ["storage"] }))
             .bind("ringIn", dev.buffer({ data: new Float32Array(t.w * F2), usage: ["storage"] }))
             .bind("filledIn", dev.buffer({ data: new Float32Array(t.filled), usage: ["storage"] }))
             .bind("ringOut", dev.buffer({ data: new Float32Array(t.w * F2), usage: ["storage"] }))
             .bind("filledOut", fOut)
             .bind("u", dev.buffer({ data: new Uint32Array(ub), usage: "uniform" }));
            dev.frame(({ pass }) => { pass.dispatch(p, [Math.ceil(t.w / 8), 1]); pass.clear([0,0,0,1]); }, { offscreen: true });
            return Array.from(new Float32Array(await dev.read(fOut)));
        };
        return { chequer: await go(a.chequer), smooth: await go(a.smooth), tie: await goTie(a.tie), errs, backend: dev.backend };
    }` });
    ok("the harness ran the ring push on both contents at a half-texel speed",
        r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
        r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        const gap = (dev, cpu) => {
            let wr = 0, fb = 0;
            for (let i = 0; i < DW * DH * 2 * P; i++) wr = Math.max(wr, Math.abs(dev.ring[i] - cpu.ring[i]));
            for (let i = 0; i < DW * DH; i++) if (dev.filled[i] !== cpu.filled[i]) fb++;
            return { wr, fb };
        };
        TIE.dev = r.result.tie[0] - 1;
        const gc = gap(r.result.chequer, CH.cpu), gs = gap(r.result.smooth, SM.cpu);
        const CONTRAST = 0.92 - 0.06;
        report(`chequer: ring gap ${gc.wr.toExponential(2)}, fill disagreements ${gc.fb} of ${DW * DH}`);
        report(`smooth : ring gap ${gs.wr.toExponential(2)}, fill disagreements ${gs.fb} of ${DW * DH}`);
        // *** THE DIVERGENCE IS IN THE BOUNDS TEST, SO ITS OCCURRENCE IS CONTENT-INDEPENDENT. *** Both
        // contents disagree on a similar number of pixels, because whether a pixel resets is decided by the
        // geometry, not the picture.
        ok(`*** the divergence is in the BOUNDS TEST, not the fetch: both contents disagree on a similar count of pixels (${gc.fb} and ${gs.fb} of ${DW * DH}) because what resets is decided by geometry, not by the picture ***`,
            gc.fb > 20 && gs.fb > 20 && Math.abs(gc.fb - gs.fb) < Math.max(gc.fb, gs.fb) * 0.5,
            `chequer ${gc.fb}, smooth ${gs.fb}`);
        // *** BUT ITS COST IS THE CONTENT'S. *** A pixel that resets on one side and reprojects on the other
        // differs by whatever the two values differ by -- on a chequer that is the full contrast.
        ok(`*** but its COST is the content's: the same disagreement is worth ${gc.wr.toExponential(2)} on the chequer, which is ${(gc.wr / CONTRAST * 100).toFixed(0)}% of that content's own contrast, and only ${gs.wr.toExponential(2)} on the smooth surface -- ${(gc.wr / gs.wr).toFixed(0)}x ***`,
            gc.wr > gs.wr * 5 && gc.wr <= CONTRAST * 1.01,
            `chequer ${gc.wr.toExponential(3)} of contrast ${CONTRAST}, smooth ${gs.wr.toExponential(3)}`);
        // and THAT is why six rounds of device-parity rows never saw it: they drove smooth content, or an
        // integer speed where the reprojection never lands on the boundary, or a still camera
        ok(`  and that is why six rounds of parity rows missed it -- they drove smooth content, an integer speed, or a still camera, and on smooth content the gap is ${(gs.wr / (1 / 255)).toFixed(1)} of an 8-bit LSB where those rows' bound was a twentieth`,
            gs.wr > (1 / 255) / 20, `smooth gap ${gs.wr.toExponential(3)} = ${(gs.wr / (1 / 255)).toFixed(2)} LSB`);
        // *** THE FIRST VERSION OF THIS ROW ASSERTED Math.floor(22.5/24*24) === 22 -- a fact about
        // JavaScript, not about this module -- and restoring the tie on either side went 0-RED. *** The
        // control has to drive the fill index the module actually computes: a motion that puts hu*w - 0.5
        // exactly on .5 reads texel 22 under floor and texel 23 under JS's round, so seeding the two texels
        // with different fill counts makes the module say which it used.
        // *** 23.5, NOT 22.5, AND THE SABOTAGE IS WHY. *** The first version of this fixture put the tie at
        // 22.5, where JavaScript's round goes half UP to 23 and WGSL's goes half to EVEN -- also 22, which is
        // floor's answer. So a kernel rewritten back to round() read the RIGHT texel at that tie and the
        // device row stayed green on a kernel with the defect in it. A tie at 23.5 breaks BOTH ways: half up
        // is 24 and half to even is 24, and floor is 23. One fixture value decided whether the control could
        // fail at all, on a defect whose whole subject is which way a tie breaks.
        const TW = 32, tf = new Float32Array(TW * 4), tm = new Float32Array(TW * 4);
        for (let x = 0; x < TW; x++) { tm[x * 4] = 23.5 / TW - (x + 0.5) / TW; tm[x * 4 + 2] = 1; }
        const ts = makeLumaState(TW, 1, P);
        pushLuma(ts, { current: tf, motion: null, w: TW, h: 1 });
        for (let x = 0; x < TW; x++) ts.filled[x] = x;          // texel i carries fill count i
        pushLuma(ts, { current: tf, motion: tm, w: TW, h: 1 });
        ok(`*** the fill index reads texel ${ts.filled[0] - 1} at an exact tie -- floor's answer, not JS round's ${ts.filled[0]} -- and this row drives the module rather than restating JavaScript's arithmetic ***`,
            ts.filled[0] === 24, `read texel ${ts.filled[0] - 1}, so filled became ${ts.filled[0]}`);
        TIE.cpu = ts.filled[0] - 1;
        // *** AND THE SAME LAW HAS A SECOND CALLER. *** advanceLocks reprojects the lock lifetimes through
        // the same nearest-texel question and, until this round, spelled it round(t - 0.5) -- identical in
        // f64, which is exactly why it drifted unnoticed. One law, two callers, and both pinned here: a fix
        // that lands on one spelling and not the other is what v4559 was cleaning up in the first place.
        const ls = makeLockState(TW, 1);
        for (let x = 0; x < TW; x++) ls.life[x] = x + 1;        // texel i carries lifetime i + 1
        advanceLocks(ls, { motion: tm, w: TW, h: 1, life: 4 });
        ok(`*** the lock carry reads the SAME texel ${ls.life[0]} at the same tie -- the second caller of the nearest-texel law, which until this round spelled it differently ***`,
            ls.life[0] === 23, `carried ${ls.life[0]}, expected 23`);
        // the device answer was read above; it is asserted HERE, after the mirror's, so the row compares two
        // measured texels rather than one measurement against a constant
        ok(`*** and the KERNEL reads texel ${TIE.dev} at that same tie, the same one the mirror reads (${TIE.cpu}) -- the fix v4559 kept is now pinned on the side it was FOR, which the sabotage found unguarded ***`,
            TIE.dev === 23 && TIE.cpu === 23 && TIE.dev === TIE.cpu, `device ${TIE.dev}, cpu ${TIE.cpu}`);
    }
}

// SABOTAGE. Seven rewrites of the ring's nearest-texel law and its reprojection, each run against FOUR
// gates -- this one, temporalRingFloor, temporalLock and temporalRidgeMargin -- with the crash rule of
// v4557 applied: a non-zero exit with no FAIL line is scored RED, because a stack trace is not a verdict.
//   GA  the nearest-texel law rounded, not floored (JS half UP)          7 red
//   GB  its axes swapped, y*w+x -> x*h+y                                 5 red
//   GC  the KERNEL's fill index rounded (WGSL half to EVEN)              4 red
//   GD  the kernel's fill count read at the pixel, not the reprojection  3 red
//   GE  ring coverage reporting the whole frame full                     3 red
//   GF  the bounds test opened at the top, hu < 1 -> hu <= 1             1 red
//   GG  the ring reprojection dropped on both sides                     17 red
//
// *** THE FIRST SWEEP OF THIS SET READ THREE ZEROS AND ALL THREE WERE MINE, NOT THE GATES'. ***
//   - the tie row asserted Math.floor(22.5/24*24) === 22, which is a fact about JavaScript. Restoring the
//     defect on either side left it green: it never called the module. It now seeds the fill counts to the
//     texel index so the module NAMES the texel it read.
//   - there was no device tie row at all. The fix v4559 kept was pinned only on the mirror it was for --
//     the kernel could have drifted straight back. GC is that row, and it costs one dispatch on a device
//     the section had already booted.
//   - the coverage rows live in temporalRidgeMargin-selfcheck, which was not in the set. A 0-RED that is a
//     hole in the SET reads exactly like a hole in the gates, and only reading the FAIL lines tells them
//     apart.
// *** AND THE FIXTURE VALUE ITSELF DECIDED WHETHER THE CONTROL COULD FAIL. *** At the tie 22.5 the device
// row was still blind: WGSL's round goes half to EVEN, which at 22.5 is 22 -- floor's own answer -- so a
// rounded kernel read the right texel. GC scored 3 with the row present and 4 once the tie moved to 23.5,
// where half up and half to even are both 24 and floor is 23. On a defect whose entire subject is which
// way a tie breaks, the fixture had picked the one tie where it does not matter.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("OPEN DEFECT, held as section 5 rather than hidden: the ring's bounds test disagrees between the " +
    "CPU mirror and the WGSL kernel at an exact boundary, and four repairs did not hold -- see " +
    "render/temporalLock.mjs. It is not fixed here. What IS fixed is the fill index's tie.");
console.log("unchecked here: what a caller should DO about a floor above the margin -- refusing the lock, " +
    "widening the margin per-frame from a measured content estimate, or accepting the artefacts, and " +
    "nothing here chooses; the floor on content that is neither a sinusoid nor a chequer, since a natural " +
    "image has a spectrum rather than a frequency; a PERSPECTIVE projection, still unmeasured after v4558 " +
    "named it; and whether the arc's gates should ADOPT any of this, which would move every number v4553 " +
    "onward recorded and is still a round of its own.");
process.exit(fails ? 1 : 0);
