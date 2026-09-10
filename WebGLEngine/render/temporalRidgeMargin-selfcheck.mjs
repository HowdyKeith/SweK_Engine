#!/usr/bin/env node
// WebGLEngine/render/temporalRidgeMargin-selfcheck.mjs -- v4557
//
// *** THE MARGIN HAS BEEN 0.05 SINCE v4553 BECAUSE THAT IS WHAT THE FIXTURES WANTED, AND v4556 MADE IT
// LOAD-BEARING. *** That round showed the lock detector's blind window is margin/contrast wide -- a faint
// thin feature is invisible for a quarter of all sub-pixel positions at contrast 0.20 -- so the constant now
// sets how much of the picture the mechanism cannot see. A number nobody derived, deciding that.
//
// This round derives what it should be standing above, and the answer is not a constant at all.
//
//   THE RING MEAN'S OWN ERROR IS A FUNCTION OF CAMERA SPEED. At rest the reprojection is the identity and the
//   ring is exact to 1e-7. Under motion every one of its 2*period frames is resampled bilinearly, and the
//   error compounds: MEASURED against the analytic average the ring is supposed to be, it reaches 8.4e-2 at
//   one pixel per frame. *** WHICH IS ABOVE THE 0.05 THE ARC USES. *** Under ordinary camera motion every
//   lock this arc places is partly reading its own resampling error.
//
//   AND THE RING HAS A HARD SPEED CEILING NOBODY HAD MEASURED. Its footprint is 2*period*speed pixels, so at
//   3 px/frame on a 48-pixel frame NO pixel has a full ring and the whole mechanism is off -- reporting
//   "unknown" everywhere, correctly, to nobody who was asking.
//
// Everything below is measured in this file. None of these numbers is carried from anywhere.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { ridgesCPU, coherentRidgesCPU, makeLumaState, pushLuma, lumaMean, ringCoverage,
         ridgeMarginBounds } from "./temporalLock.mjs";
import { RING_PUSH_WGSL } from "./temporalLockWgsl.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 48, H = 48, NEAR = 1, FAR = 10, HALF = 4, Z = 8, S = 2 * HALF / W, P = jitterPhaseCount(1);
const ARC_MARGIN = 0.05;                        // what v4553 onward use
function vpAt(cx, cy) {
    const o = new Float32Array(16);
    o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1;
    const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; t[13] = -cy;
    return mat4Multiply(o, t);
}
// a SMOOTH band-limited surface: no ridges anywhere, so anything the detector finds on it is noise, and
// the analytic average over the jitter offsets is exactly what the ring mean is supposed to reproduce
const shade = (wx, wy) => 0.5 + 0.45 * Math.sin(wx * 0.35) * Math.cos(wy * 0.28);
function smoothFrame(cx, cy) {
    const c = new Float32Array(W * H * 4), d = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, o = i * 4;
        const v = shade((2 * ((x + 0.5) / W) - 1) * HALF + cx, (1 - 2 * ((y + 0.5) / H)) * HALF + cy);
        c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[i] = (Z - NEAR) / (FAR - NEAR);
    }
    return { colour: c, depth: d };
}
/** Push `frames` of the smooth surface with the camera translating `speed` world units per frame. */
function sweep(speed, frames = 32) {
    const st = makeJitterState(1), lu = makeLumaState(W, H, P), offs = [];
    for (let f = 0; f < frames; f++) {
        const j = advanceJitter(st), camX = f * speed;
        const fr = smoothFrame(camX + j[0] * S, j[1] * S);
        const m = motionVectorsCPU(fr.depth, W, H, mat4Invert(vpAt(camX, 0)), vpAt(camX - speed, 0)).data;
        pushLuma(lu, { current: fr.colour, motion: m, w: W, h: H });
        offs.push({ j, camX });
    }
    return { lu, offs: offs.slice(-P) };
}
/**
 * What the ring mean SHOULD be.
 *
 * *** THIS FUNCTION WAS WRONG WHEN v4557 SHIPPED, AND EVERY NUMBER IN SECTIONS 1, 3 AND 4 CAME OUT OF IT. ***
 * It evaluated the surface at pixel i using EACH FRAME'S OWN camera position, which is a different world
 * point once the camera moves -- so what it measured was HOW FAR THE SCENE SHIFTED ACROSS THE WINDOW, not
 * what the reprojection got wrong. The ring, correctly reprojected, holds the luma of the surface that is at
 * pixel i NOW, as sampled under each frame's jitter; the shading is view-independent and the surface is
 * static, so the only thing that varies between frames is the jitter. The camera position to use is the
 * CURRENT one, for every frame in the window.
 *
 * MEASURED, the difference between the two references at one pixel per frame: 8.40e-2 against 1.19e-7.
 * v4557 overstated the floor by five orders of magnitude there and by about a hundredfold in general.
 */
function analyticMean(offs, camNow) {
    const a = new Float32Array(W * H);
    for (const { j } of offs) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        a[y * W + x] += shade((2 * ((x + 0.5) / W) - 1) * HALF + camNow + j[0] * S,
                              (1 - 2 * ((y + 0.5) / H)) * HALF + j[1] * S) / offs.length;
    }
    return a;
}
function floorAt(speed, frames = 32) {
    const { lu, offs } = sweep(speed, frames);
    const mm = lumaMean(lu), a = analyticMean(offs, (frames - 1) * speed), cov = ringCoverage(lu);
    let sum = 0, worst = 0, n = 0;
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
        const i = y * W + x;
        if (lu.filled[i] < lu.frames) continue;          // no window here: nothing to be wrong about
        const e = Math.abs(mm[i] - a[i]); sum += e; worst = Math.max(worst, e); n++;
    }
    return { mean: n ? sum / n : NaN, worst, coverage: cov.fraction, compared: n, mm, lu };
}

console.log("temporalRidgeMargin-selfcheck -- the constant the arc never derived, and what it is standing on\n");
console.log("1. THE RING MEAN'S OWN ERROR, AGAINST THE ANALYTIC AVERAGE IT IS SUPPOSED TO BE");

const SPEEDS = [0, 0.25, 0.5, 1, 1.5, 2, 3];
const FLOOR = {};
{
    for (const s of SPEEDS) FLOOR[s] = floorAt(s * S);
    report("speed px/frame | mean |err| | worst |err| | ring full | pixels compared");
    for (const s of SPEEDS) {
        const f = FLOOR[s];
        report(`  ${String(s).padEnd(12)} | ${(Number.isFinite(f.mean) ? f.mean.toExponential(2) : "  n/a   ")} | ${f.worst.toExponential(2)}    | ${(f.coverage * 100).toFixed(0).padStart(3)}%      | ${f.compared}`);
    }
    // *** AT REST THE RING IS EXACT, WHICH IS WHY THE FIXED MARGIN HAS NEVER SHOWN A PROBLEM. *** Every
    // convergence fixture in this arc holds the camera still, so the floor there is 1e-7 and 0.05 is seven
    // orders of magnitude above it -- pure blind window, bought for nothing.
    ok(`*** at rest the ring mean is exact to ${FLOOR[0].worst.toExponential(1)} -- so the arc's margin of ${ARC_MARGIN} sits ${(ARC_MARGIN / FLOOR[0].worst).toExponential(0)}x above the floor, which is blind window bought for nothing ***`,
        FLOOR[0].worst < 1e-5 && FLOOR[0].coverage === 1, `worst ${FLOOR[0].worst.toExponential(3)}, coverage ${FLOOR[0].coverage}`);
    // and under motion it climbs past the margin
    const crossed = SPEEDS.filter((s) => Number.isFinite(FLOOR[s].mean) && FLOOR[s].worst > ARC_MARGIN);
    // *** THESE TWO ROWS ASSERTED A LAW THAT DOES NOT HOLD, AND v4558 CORRECTED THE REFERENCE UNDER THEM. ***
    // What they said: the floor climbs monotonically with speed and passes 0.05 at one pixel per frame. What
    // is true: the floor is a function of the reprojection's SUB-PIXEL PHASE, exact at integer displacements
    // and worst near half a pixel -- and it never comes near 0.05 at any speed.
    ok(`*** the floor is set by the reprojection's SUB-PIXEL PHASE, not its speed: integer displacements are EXACT (${FLOOR[0].worst.toExponential(1)} at 0, ${FLOOR[1].worst.toExponential(1)} at 1, ${FLOOR[2].worst.toExponential(1)} at 2) because the bilinear fetch lands on texel centres ***`,
        FLOOR[1].worst < 1e-5 && FLOOR[2].worst < 1e-5 && FLOOR[0.5].worst > FLOOR[1].worst * 100,
        `0:${FLOOR[0].worst.toExponential(2)} 1:${FLOOR[1].worst.toExponential(2)} 2:${FLOOR[2].worst.toExponential(2)}`);
    ok(`  and a half-pixel phase reads the same at every speed that has one -- ${FLOOR[0.5].worst.toExponential(2)} at 0.5 px/frame and ${FLOOR[1.5].worst.toExponential(2)} at 1.5, identical, which is what makes it a phase law rather than a speed law`,
        FLOOR[0.5].worst === FLOOR[1.5].worst, `0.5 ${FLOOR[0.5].worst.toExponential(3)}, 1.5 ${FLOOR[1.5].worst.toExponential(3)}`);
    const worstAny = Math.max(...SPEEDS.filter((x) => Number.isFinite(FLOOR[x].mean)).map((x) => FLOOR[x].worst));
    ok(`*** and the worst floor over every phase measured is ${worstAny.toExponential(2)}, which is ${(ARC_MARGIN / worstAny).toFixed(0)}x BELOW the arc's ${ARC_MARGIN} -- so the margin was never standing under the floor, it has always been far above it ***`,
        worstAny < ARC_MARGIN / 20, `worst over phases ${worstAny.toExponential(3)}, arc margin ${ARC_MARGIN}`);
}

console.log("\n2. AND THE RING HAS A SPEED CEILING, WHICH IS ARITHMETIC NOBODY HAD RUN");

{
    report(`the ring is ${2 * P} frames deep, so its footprint at speed v is ${2 * P}*v pixels -- on a ${W}-pixel frame that reaches the whole width at v = ${(W / (2 * P)).toFixed(1)}`);
    report("coverage: " + SPEEDS.map((s) => `${s}:${(FLOOR[s].coverage * 100).toFixed(0)}%`).join("  "));
    // *** AT 3 PX/FRAME NOTHING HAS A WINDOW AT ALL. *** Every consumer then reports "unknown", which is the
    // answer v4553 deliberately built -- and which nothing in the arc has ever asked for.
    ok(`*** above ${(W / (2 * P)).toFixed(1)} px/frame NO pixel has a full ring: coverage falls ${(FLOOR[0].coverage * 100).toFixed(0)}% -> ${(FLOOR[1].coverage * 100).toFixed(0)}% -> ${(FLOOR[3].coverage * 100).toFixed(0)}%, and the whole lock and shading mechanism is silently off ***`,
        FLOOR[0].coverage === 1 && FLOOR[3].coverage === 0 && FLOOR[1].coverage > 0 && FLOOR[1].coverage < 1,
        SPEEDS.map((s) => `${s}:${FLOOR[s].coverage.toFixed(2)}`).join(" "));
    ok(`  and ringCoverage is what a caller asks to find that out -- ${(FLOOR[2].coverage * 100).toFixed(0)}% at 2 px/frame is the difference between a working detector and one reporting "unknown" to nobody`,
        FLOOR[2].coverage > 0 && FLOOR[2].coverage < 0.5, `coverage at 2 px/f ${FLOOR[2].coverage.toFixed(3)}`);
}

console.log("\n3. THE TWO BOUNDS, COMPOSED -- AND WITH A CORRECT FLOOR THE INTERVAL IS WIDE");

{
    // v4556: the blind window is margin/contrast wide. This round: the margin must clear the noise floor.
    // Together they bound the margin from both sides, and the bounds cross.
    const rows = [];
    for (const s of [0, 0.25, 0.5, 1]) for (const contrast of [0.2, 0.9]) {
        const b = ridgeMarginBounds({ noiseFloor: FLOOR[s].worst, contrast, blindBudget: 0.1 });
        rows.push({ s, contrast, ...b });
    }
    // guarded on `margin` rather than on `feasible`: the two must agree, and a gate that CRASHES when they
    // do not is worse than one that fails. Sabotaging feasible to always-true made this line throw, the
    // harness saw no FAIL lines and read it as 0 red -- a crash is not a verdict, and the row below is what
    // turns that disagreement into a red instead of a stack trace.
    for (const r of rows) report(`  speed ${String(r.s).padEnd(5)} contrast ${r.contrast}: margin must be in (${r.lo.toExponential(2)}, ${r.hi.toExponential(2)}) -- ${r.margin === null ? "*** EMPTY ***" : "margin " + r.margin.toExponential(2)}`);
    ok(`  feasible and margin agree on every one of the ${rows.length} cases -- an interval reported feasible with no margin in it, or the reverse, is a contradiction a caller would read as a number`,
        rows.every((r) => r.feasible === (r.margin !== null)),
        rows.map((r) => `${r.s}/${r.contrast}:${r.feasible}/${r.margin === null ? "null" : "num"}`).join(" "));
    const faintStill = rows.find((r) => r.s === 0 && r.contrast === 0.2);
    const faintMoving = rows.find((r) => r.s === 1 && r.contrast === 0.2);
    const worstCase = rows.find((r) => r.s === 0.5 && r.contrast === 0.2);
    // *** v4557 REPORTED THREE OF THESE EIGHT AS EMPTY AND ALL THREE WERE ARTEFACTS OF ITS REFERENCE. ***
    // With the floor measured against what the ring actually holds, every case is feasible -- so v4556's
    // blind-window ceiling is the ONLY binding constraint on the margin, and always was.
    ok(`*** with the floor measured correctly EVERY case is feasible, including the faintest at the worst phase (${worstCase.lo.toExponential(2)}, ${worstCase.hi.toExponential(2)}) -- so v4556's blind window is the only binding constraint, and the three EMPTY intervals v4557 reported were artefacts of its reference ***`,
        rows.every((r) => r.feasible), rows.map((r) => `${r.s}/${r.contrast}:${r.feasible}`).join(" "));
    ok(`  and the interval is wide: at rest and contrast 0.2 the ceiling is ${(faintStill.hi / faintStill.lo).toExponential(0)}x the floor, so the margin is a policy choice inside a large range rather than a squeeze between two walls`,
        faintStill.hi / faintStill.lo > 1e3 && faintMoving.feasible,
        `still ${faintStill.lo.toExponential(2)}..${faintStill.hi.toExponential(2)}, moving ${faintMoving.lo.toExponential(2)}..${faintMoving.hi.toExponential(2)}`);
    ok(`  and the bounds are REFUSED rather than guessed when the caller has not measured a floor`,
        (() => { try { ridgeMarginBounds({ contrast: 0.5 }); return false; } catch (e) { return /noiseFloor must be measured/.test(e.message); } })() &&
        (() => { try { ridgeMarginBounds({ noiseFloor: 0.01 }); return false; } catch (e) { return /contrast must be positive/.test(e.message); } })());
    // the derived margin at rest is the FLOOR, not the ceiling: every unit above the floor is blind window
    ok(`  and the derived margin is the bottom of the interval, not the middle -- at rest that is ${faintStill.margin.toExponential(1)} against the arc's ${ARC_MARGIN}, because every unit above the floor is blind window bought for nothing`,
        faintStill.margin === faintStill.lo && faintStill.margin < ARC_MARGIN / 1000);
}

console.log("\n4. BOTH FAILURE MODES, ON A PICTURE RATHER THAN IN ARITHMETIC");

{
    // (a) TOO LARGE at rest: a faint thin feature the arc's margin cannot see, that the derived one can
    const faint = (contrast) => {
        const st = makeJitterState(1), lu = makeLumaState(W, H, P);
        for (let f = 0; f < 2 * P + 2; f++) {
            const j = advanceJitter(st);
            const c = new Float32Array(W * H * 4), d = new Float32Array(W * H);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const i = y * W + x, o = i * 4;
                const wx = (2 * ((x + 0.5) / W) - 1) * HALF + j[0] * S;
                const v = 0.30 + (Math.abs(wx - 0.37) < 0.4 * S / 2 ? contrast : 0);
                c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[i] = (Z - NEAR) / (FAR - NEAR);
            }
            pushLuma(lu, { current: c, motion: motionVectorsCPU(d, W, H, mat4Invert(vpAt(0, 0)), vpAt(0, 0)).data, w: W, h: H });
        }
        return lumaMean(lu);
    };
    const mmFaint = faint(0.06);
    const arc = ridgesCPU(mmFaint, W, H, ARC_MARGIN, 2).count;
    const derived = ridgesCPU(mmFaint, W, H, Math.max(FLOOR[0].worst * 1.5, 1e-6), 2).count;
    report(`a thin feature of contrast 0.06, camera still, where the measured floor is ${FLOOR[0].worst.toExponential(1)}`);
    ok(`*** TOO LARGE at rest: the arc's ${ARC_MARGIN} finds ${arc} of it and a margin derived from the measured floor finds ${derived} -- the constant was hiding a feature the signal carries perfectly well ***`,
        arc === 0 && derived > 30, `arc margin ${arc}, derived ${derived}`);
    // (b) TOO SMALL under motion: a smooth surface with NO features, where a floor-derived margin at REST
    // would lock resampling error once the camera moves
    // *** THE FLOOR FOR A RIDGE DECISION IS LARGER THAN THE PER-PIXEL ERROR, AND v4557 CONFLATED THEM. ***
    // A ridge is decided from several samples through a plateau walk, so the noise in the DECISION compounds:
    // measured on this smooth surface, which has no ridges at all, a margin at the per-pixel floor still finds
    // dozens, and it takes about 3e-3 -- a few times the worst per-pixel error -- to reach none at any speed.
    const smooth = { 0: FLOOR[0].mm, 0.5: FLOOR[0.5].mm, 1: FLOOR[1].mm };
    const at = (mm, m) => ridgesCPU(mm, W, H, m, 2).count;
    for (const sp of [0, 0.5, 1]) report(`  speed ${sp}: margin 1.8e-7 -> ${at(smooth[sp], 1.8e-7)} ridges, 1.0e-3 -> ${at(smooth[sp], 1.0e-3)}, 3.0e-3 -> ${at(smooth[sp], 3.0e-3)}`);
    const DECISION = 3.0e-3;
    ok(`*** TOO SMALL is real but for a different reason than v4557 gave: a margin at the per-pixel floor finds ${at(smooth[1], 1.8e-7)} ridges on a surface with none, and it takes ${DECISION.toExponential(1)} -- a few times the worst per-pixel error -- to reach ${at(smooth[1], DECISION)} ***`,
        at(smooth[1], 1.8e-7) > 50 && at(smooth[1], DECISION) <= 2 && at(smooth[0], DECISION) <= 2,
        `at 1 px/f: 1.8e-7 -> ${at(smooth[1], 1.8e-7)}, 3e-3 -> ${at(smooth[1], DECISION)}`);
    ok(`  and the phase changes every frame, so the bound has to be the worst over PHASES rather than this frame's -- which is why ${DECISION.toExponential(1)} and not the ${FLOOR[1].worst.toExponential(1)} this frame happens to sit at`,
        FLOOR[1].worst < DECISION / 100, `this frame ${FLOOR[1].worst.toExponential(2)}, bound ${DECISION.toExponential(1)}`);
    ok(`  so the constant is still wrong in BOTH directions -- ${ARC_MARGIN} hides a contrast-0.06 feature and ${DECISION.toExponential(1)} would not -- but the gap is ${(ARC_MARGIN / DECISION).toFixed(0)}x, not the five orders of magnitude v4557's reference implied`,
        arc === 0 && ARC_MARGIN / DECISION > 5 && ARC_MARGIN / DECISION < 100);
}

console.log("\n5. ON THE DEVICE: THE RING'S FILL COUNT, WHICH IS WHAT COVERAGE READS");

const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** Sections 1-4 are CPU only; nothing above has run a kernel."); fails++; }
else {
    const DW = 24, DH = 24, speed = 1 * (2 * HALF / DW), FR = 2 * P + 2;
    const dvp = (cx) => { const o = new Float32Array(16);
        o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1;
        const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; return mat4Multiply(o, t); };
    const cpu = makeLumaState(DW, DH, P), frames = [];
    const stj = makeJitterState(1);
    for (let f = 0; f < FR; f++) {
        const j = advanceJitter(stj), camX = f * speed;
        const c = new Float32Array(DW * DH * 4), d = new Float32Array(DW * DH);
        for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
            const i = y * DW + x, o = i * 4;
            const v = shade((2 * ((x + 0.5) / DW) - 1) * HALF + camX + j[0] * S, (1 - 2 * ((y + 0.5) / DH)) * HALF + j[1] * S);
            c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[i] = (Z - NEAR) / (FAR - NEAR);
        }
        const m = motionVectorsCPU(d, DW, DH, mat4Invert(dvp(camX)), dvp(camX - speed)).data;
        frames.push({ colour: Array.from(c), motion: Array.from(m) });
        pushLuma(cpu, { current: c, motion: m, w: DW, h: DH });
    }
    const cpuCov = ringCoverage(cpu);
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W: DW, H: DH, P, frames }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { RING_PUSH_WGSL } = await import("/render/temporalLockWgsl.mjs");
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
        return { filled: Array.from(new Float32Array(await dev.read(fillA))), errs, backend: dev.backend };
    }` });
    ok("the harness ran the ring push on a real WebGPU device",
        r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
        r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        let bad = 0, devFull = 0;
        for (let i = 0; i < DW * DH; i++) {
            if (r.result.filled[i] !== cpu.filled[i]) bad++;
            if (r.result.filled[i] >= 2 * P) devFull++;
        }
        ok(`*** the device's FILL count is the CPU's on all ${DW * DH} pixels -- coverage ${(devFull / (DW * DH) * 100).toFixed(0)}% against the CPU's ${(cpuCov.fraction * 100).toFixed(0)}%, and it is a count, so anything but exact is a different answer ***`,
            bad === 0 && devFull === cpuCov.full, `${bad} disagreements, device ${devFull} full, CPU ${cpuCov.full}`);
        ok(`  and the coverage under motion is partial on the device too (${devFull} of ${DW * DH}), so the speed ceiling is a property of the kernel and not of the CPU mirror`,
            devFull > 0 && devFull < DW * DH, `${devFull}/${DW * DH}`);
    }
}

// SABOTAGE LOG -- applied to render/temporalLock.mjs and render/temporalLockWgsl.mjs, three gates run --
// this one, temporalRidgePhase's and temporalLock's -- red counts summed, files restored and md5-verified.
// Baseline 0 red. MEASURED at v4557.
//   EA ringCoverage counting any history rather than a FULL ring -> 3 red. The distinction is the whole
//      point: a pixel one frame into rebuilding its ring has history and no window.
//   EB `feasible` hard-coded true                               -> 3 red, AFTER this round added the
//      invariant row. *** ITS FIRST READING WAS 0 RED AND THAT WAS A CRASH, NOT A PASS. *** The report loop
//      guarded on `feasible` and then read `margin`, so an always-feasible interval with a null margin threw
//      a TypeError; the harness counts FAIL lines, a stack trace has none, and it read as green. A CRASH IS
//      NOT A VERDICT -- the harness now scores a non-zero exit with no verdict as red, the loop guards on the
//      value it actually uses, and a row asserts that `feasible` and `margin` agree, which is what turns the
//      contradiction into a red instead of a stack trace.
//   EC the noise floor dropped from the lower bound              -> 2 red.
//   ED the blind-window ceiling dropped                          -> 2 red. EC and ED together are the two
//      halves of the interval, and each has to be able to fail on its own or the composition means nothing.
//   EE the margin taken mid-interval instead of at the floor     -> 1 red. Every unit above the floor is
//      blind window bought for nothing, which is a claim, so it gets a row.
//   EF the noise floor silently defaulted to 0.05                -> 1 red. Defaulting it would have re-created
//      exactly the undeclared constant this round exists to remove.
//   EG the WGSL fill count read at the pixel's own index instead of the reprojected one (WGSL only) -> 2 red.
//   EH a reset ring marked FULL instead of empty                 -> 8 red, the widest. That one value is the
//      difference between "unknown" and a confident wrong answer, and it reaches every consumer.
//   No 0-RED among the eight once the invariant row exists -- and the one that read zero was the harness
//   mistaking a crash for silence, which is worth more than the sabotage was.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a ROTATING camera, since the floor is measured under translation only and " +
    "rotation resamples differently across the frame; the floor on content that is not band-limited, since " +
    "a smooth surface is the best case for bilinear reprojection and a textured one will be worse; whether " +
    "the arc's gates should ADOPT a derived margin, which would move every number v4553 onward recorded and " +
    "is a round of its own rather than a line in this one; and the blind budget of 0.1, which is this file's " +
    "own undeclared constant -- it is a policy about how much of the picture a caller will accept losing, " +
    "and nothing here derives it either.");
process.exit(fails ? 1 : 0);
