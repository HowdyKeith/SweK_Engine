#!/usr/bin/env node
// WebGLEngine/render/temporalRingFloor-selfcheck.mjs -- v4558
//
// *** v4557 MEASURED THE RING'S NOISE FLOOR AGAINST THE WRONG REFERENCE, AND EVERY NUMBER IN ITS HEADLINE
// CAME OUT OF IT. *** Its analytic average evaluated the surface at pixel i using EACH FRAME'S OWN camera
// position -- a different world point once the camera moves -- so what it measured was HOW FAR THE SCENE
// SHIFTED ACROSS THE WINDOW, not what the reprojection got wrong.
//
// The ring, correctly reprojected, holds the luma of the surface that is at pixel i NOW, as sampled under
// each frame's jitter. The shading is view-independent and the surface is static, so the only thing that
// differs between frames is the jitter: the camera position to use is the CURRENT one, for every frame.
//
//   AT ONE PIXEL PER FRAME:  v4557's reference 8.40e-2      what the ring holds 1.19e-7
//
// Five orders of magnitude. v4557 concluded the floor "climbs THROUGH" the arc's margin of 0.05 and that
// "every lock placed while the camera moves is partly reading resampling error". Both are false. It also
// reported three feasibility intervals as EMPTY; all three were artefacts. Those rows are corrected in that
// file and the reasoning is here.
//
// WHAT SURVIVES v4557 UNTOUCHED: the ring's speed ceiling, which is a count of `filled` and never depended on
// the reference -- coverage really does fall to zero at 3 px/frame. And the SHAPE of the argument: a floor
// and a ceiling bounding the margin. Only the floor's value was wrong.
//
// WHAT THIS ROUND ADDS: the law the floor actually follows, and the answer to the question v4557's closing
// left open -- whether a ROTATING camera needs a per-pixel bound. It does not.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { makeLumaState, pushLuma, lumaMean, ringCoverage, ridgesCPU } from "./temporalLock.mjs";
import { RING_PUSH_WGSL } from "./temporalLockWgsl.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 48, H = 48, NEAR = 1, FAR = 10, HALF = 4, Z = 8, S = 2 * HALF / W, P = jitterPhaseCount(1);
const ARC_MARGIN = 0.05;
const ortho = () => { const o = new Float32Array(16);
    o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1; return o; };
const rotZ = (a) => { const m = new Float32Array(16), c = Math.cos(a), s = Math.sin(a);
    m[0] = c; m[1] = s; m[4] = -s; m[5] = c; m[10] = 1; m[15] = 1; return m; };
const transX = (x) => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; m[12] = -x; return m; };
const vpFor = (a, cx) => mat4Multiply(ortho(), mat4Multiply(rotZ(a), transX(cx)));
const shade = (wx, wy) => 0.5 + 0.45 * Math.sin(wx * 0.35) * Math.cos(wy * 0.28);
const eyeOf = (x, y) => [(2 * ((x + 0.5) / W) - 1) * HALF, (1 - 2 * ((y + 0.5) / H)) * HALF];
/** The world point sampled at pixel (x,y) with roll `a`, camera at `cx`, eye-space jitter `j`. */
function worldAt(x, y, a, cx, j) {
    const [ex, ey] = eyeOf(x, y);
    const sx = ex + j[0] * S, sy = ey + j[1] * S;
    const c = Math.cos(-a), s = Math.sin(-a);
    return [sx * c - sy * s + cx, sx * s + sy * c];
}
function sweep(kind, rate, frames = 32) {
    const st = makeJitterState(1), lu = makeLumaState(W, H, P), offs = [];
    for (let f = 0; f < frames; f++) {
        const j = advanceJitter(st);
        const a = kind === "roll" ? f * rate : 0, cx = kind === "trans" ? f * rate : 0;
        const ap = kind === "roll" ? (f - 1) * rate : 0, cxp = kind === "trans" ? (f - 1) * rate : 0;
        const c = new Float32Array(W * H * 4), d = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, o = i * 4;
            const [wx, wy] = worldAt(x, y, a, cx, j);
            const v = shade(wx, wy);
            c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[i] = (Z - NEAR) / (FAR - NEAR);
        }
        const m = motionVectorsCPU(d, W, H, mat4Invert(vpFor(a, cx)), vpFor(ap, cxp)).data;
        pushLuma(lu, { current: c, motion: m, w: W, h: H });
        offs.push({ j, a, cx, m });
    }
    const last = offs[offs.length - 1];
    return { lu, offs: offs.slice(-P), aNow: last.a, cxNow: last.cx, motion: last.m };
}
/** WRONG, and kept so the comparison is against the real thing: each frame's own camera position. */
function refMoving(offs) {
    const a = new Float32Array(W * H);
    for (const o of offs) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const [wx, wy] = worldAt(x, y, o.a, o.cx, o.j);
        a[y * W + x] += shade(wx, wy) / offs.length;
    }
    return a;
}
/** RIGHT: the surface at pixel i NOW, under each frame's jitter in that frame's eye orientation. */
function refNow(offs, aNow, cxNow) {
    const a = new Float32Array(W * H);
    const cn = Math.cos(-aNow), sn = Math.sin(-aNow);
    for (const o of offs) {
        const c = Math.cos(-o.a), s = Math.sin(-o.a);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const [ex, ey] = eyeOf(x, y);
            const wx0 = ex * cn - ey * sn + cxNow, wy0 = ex * sn + ey * cn;   // the point now at this pixel
            const jx = o.j[0] * S, jy = o.j[1] * S;                          // its jitter, rotated into world
            a[y * W + x] += shade(wx0 + jx * c - jy * s, wy0 + jx * s + jy * c) / offs.length;
        }
    }
    return a;
}
const compare = (mm, a, lu) => {
    let worst = 0, sum = 0, n = 0;
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
        const i = y * W + x;
        if (lu.filled[i] < lu.frames) continue;
        const e = Math.abs(mm[i] - a[i]); worst = Math.max(worst, e); sum += e; n++;
    }
    return { worst, mean: n ? sum / n : NaN, n };
};

console.log("temporalRingFloor-selfcheck -- the reference v4557 got wrong, and the law underneath it\n");
console.log("1. THE TWO REFERENCES, SIDE BY SIDE");

const TRANS = {};
// *** ONE SWEEP PER SPEED, SHARED BY SECTIONS 1 AND 2. *** Each sweep is 32 frames of a 16-deep ring over
// 2,304 pixels, and the first draft ran seventeen of them -- 3,070 ms against a 3,000 ms sweep budget, which
// is the fault v4553 and v4551 both recorded: an over-budget gate is skipped and its control stops running.
const SPEEDS_ALL = [0, 0.125, 0.25, 0.375, 0.5, 0.75, 1, 1.5, 2];
{
    for (const spd of SPEEDS_ALL) {
        const r = sweep("trans", spd * S);
        const mm = lumaMean(r.lu);
        const now = compare(mm, refNow(r.offs, r.aNow, r.cxNow), r.lu);
        // the wrong reference is only needed for the four speeds section 1 prints
        const moving = [0, 0.25, 0.5, 1, 2].includes(spd) ? compare(mm, refMoving(r.offs), r.lu) : null;
        TRANS[spd] = { moving, now, coverage: ringCoverage(r.lu).fraction, mm };
    }
    report("speed | v4557's reference (each frame's camera) | what the ring holds (camera NOW)");
    for (const spd of [0, 0.25, 0.5, 1, 2]) {
        const t = TRANS[spd];
        report(`  ${String(spd).padEnd(5)} | worst ${t.moving.worst.toExponential(2)}                        | worst ${t.now.worst.toExponential(2)}`);
    }
    // *** AT REST THE TWO AGREE, WHICH IS WHY THE ERROR SURVIVED. *** With the camera still, "each frame's
    // camera" and "the camera now" are the same position, so v4557's only exact row was also its only
    // correct one -- and every convergence fixture in this arc holds the camera still.
    ok(`*** at rest the two references AGREE (${TRANS[0].moving.worst.toExponential(2)} against ${TRANS[0].now.worst.toExponential(2)}) -- which is why the error survived: the arc's fixtures hold the camera still, and that is the one case where a reference that moves with the camera does not move ***`,
        TRANS[0].moving.worst === TRANS[0].now.worst && TRANS[0].now.worst < 1e-5,
        `moving ${TRANS[0].moving.worst.toExponential(3)}, now ${TRANS[0].now.worst.toExponential(3)}`);
    ok(`*** and under motion they part company by five orders of magnitude: at one pixel per frame v4557 read ${TRANS[1].moving.worst.toExponential(2)} where the ring's actual error is ${TRANS[1].now.worst.toExponential(2)} ***`,
        TRANS[1].moving.worst > TRANS[1].now.worst * 1e4,
        `moving ${TRANS[1].moving.worst.toExponential(3)}, now ${TRANS[1].now.worst.toExponential(3)}`);
    // v4557's headline: "the floor climbs THROUGH the margin". It does not go near it.
    const worstNow = Math.max(...[0, 0.25, 0.5, 1, 2].map((s) => TRANS[s].now.worst));
    ok(`*** so v4557's headline is withdrawn: the worst true floor over every speed measured is ${worstNow.toExponential(2)}, which is ${(ARC_MARGIN / worstNow).toFixed(0)}x BELOW the arc's ${ARC_MARGIN} rather than 1.7x above it ***`,
        worstNow < ARC_MARGIN / 20, `worst true floor ${worstNow.toExponential(3)}`);
}

console.log("\n2. THE LAW THE FLOOR ACTUALLY FOLLOWS: THE SUB-PIXEL PHASE, NOT THE SPEED");

{
    const PH = {};
    for (const spd of SPEEDS_ALL) PH[spd] = TRANS[spd].now.worst;
    report("speed -> worst |err|: " + Object.entries(PH).map(([k, v]) => `${k}:${v.toExponential(1)}`).join("  "));
    // *** INTEGER DISPLACEMENTS ARE EXACT, and that is the whole law. *** A whole-pixel step puts the bilinear
    // fetch on texel centres, so nothing is interpolated and nothing is lost.
    ok(`*** integer displacements are EXACT -- ${PH[0].toExponential(1)} at 0, ${PH[1].toExponential(1)} at 1, ${PH[2].toExponential(1)} at 2 -- because a whole-pixel step lands the bilinear fetch on texel centres ***`,
        PH[1] < 1e-5 && PH[2] < 1e-5 && PH[0.5] > PH[1] * 100,
        `0:${PH[0].toExponential(2)} 1:${PH[1].toExponential(2)} 2:${PH[2].toExponential(2)} 0.5:${PH[0.5].toExponential(2)}`);
    // *** THE FIRST DRAFT OF THIS ROW SAID "IDENTICAL TO THE BIT" AND IT WAS A NUMBER CARRIED FROM A
    // DIFFERENT PICTURE. *** On a 48x48 frame the two half-pixel phases came out equal to the last digit; at
    // 64x64 they are 3.68e-4 and 3.77e-4, because at 1.5 px/frame fewer pixels have a full ring and the two
    // worst-cases are taken over DIFFERENT SETS OF PIXELS. The law is not weaker for that -- what is weaker
    // is a claim of bit-equality between two measurements that never compared the same pixels. That is
    // v4549's mistake and v4555's, a third time, so the row now says what it can support: the two agree to a
    // few per cent while both sit three orders of magnitude above the integer-phase value.
    const phaseGap = Math.abs(PH[0.5] - PH[1.5]) / Math.max(PH[0.5], PH[1.5]);
    ok(`*** and a half-pixel phase reads the same at every speed that has one: ${PH[0.5].toExponential(2)} at 0.5 px/frame and ${PH[1.5].toExponential(2)} at 1.5, within ${(phaseGap * 100).toFixed(1)}% and both ${(PH[0.5] / PH[1]).toExponential(0)}x the integer-phase value -- a phase law, not a speed law ***`,
        phaseGap < 0.1 && PH[0.5] / PH[1] > 1e2 && PH[1.5] / PH[2] > 1e2,
        `0.5 ${PH[0.5].toExponential(3)}, 1.5 ${PH[1.5].toExponential(3)}, gap ${(phaseGap * 100).toFixed(2)}%`);
    // *** AND WHETHER THERE IS A GAP AT ALL DEPENDS ON THE FRAME SIZE, WHICH IS WORTH KNOWING BEFORE
    // ANYONE READS ONE. *** At 48x48 the two are bit-identical; at 64x64 they differ by 2.3%, because 1.5
    // px/frame leaves fewer pixels with a full ring and the two worst-cases are then taken over different
    // populations. Measured at both, so the row asserts the bound that holds at either rather than an
    // equality that holds at one -- which is exactly the carried-number mistake the row above records.
    report(`at ${W}x${H} the two half-pixel phases differ by ${(phaseGap * 100).toFixed(2)}%; at 64x64 the same measurement gives 2.3%, and the difference is the compared population rather than the law`);
    ok(`  the compared populations are what makes that gap move: 0.5 px/frame leaves ${(TRANS[0.5].coverage * 100).toFixed(0)}% of pixels with a full ring and 1.5 leaves ${(TRANS[1.5].coverage * 100).toFixed(0)}%`,
        TRANS[1.5].coverage <= TRANS[0.5].coverage, `0.5 ${TRANS[0.5].coverage.toFixed(3)}, 1.5 ${TRANS[1.5].coverage.toFixed(3)}`);
    ok(`  so a bound derived from THIS frame's phase is wrong next frame, and the usable floor is the worst over phases (${Math.max(...Object.values(PH)).toExponential(2)}) rather than whatever the current one happens to be`,
        PH[1] < Math.max(...Object.values(PH)) / 100);
}

console.log("\n3. THE QUESTION v4557 LEFT OPEN: DOES A ROTATING CAMERA NEED A PER-PIXEL BOUND?");

const ROLL = {};
{
    // under roll the displacement is proportional to the radius: zero at the centre, largest at the corners,
    // so ONE frame holds every speed at once -- which is exactly the case a single frame-wide number cannot
    // express, if the floor really varies with local displacement.
    for (const deg of [0.5, 1, 2]) {
        const rate = deg * Math.PI / 180;
        const r = sweep("roll", rate);
        const mm = lumaMean(r.lu), a = refNow(r.offs, r.aNow, r.cxNow);
        const B = new Map();
        for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
            const i = y * W + x;
            if (r.lu.filled[i] < r.lu.frames) continue;
            const dpx = Math.hypot(r.motion[i * 4] * W, r.motion[i * 4 + 1] * H);
            const b = Math.round(dpx * 4) / 4;
            if (!B.has(b)) B.set(b, { n: 0, worst: 0 });
            const s = B.get(b); s.n++; s.worst = Math.max(s.worst, Math.abs(mm[i] - a[i]));
        }
        const keys = [...B.keys()].sort((p, q) => p - q).filter((k) => B.get(k).n >= 20);
        ROLL[deg] = { B, keys, coverage: ringCoverage(r.lu).fraction,
                      overall: compare(mm, a, r.lu).worst,
                      centre: B.get(0) ? B.get(0).worst : NaN };
        report(`  ${deg} deg/frame, coverage ${(ROLL[deg].coverage * 100).toFixed(0)}%: ` + keys.map((k) => `${k}px:${B.get(k).worst.toExponential(1)}`).join("  "));
    }
    // *** THE CENTRE OF ROTATION IS NOT SPECIAL, WHICH IS THE ANSWER. *** A pixel with zero displacement has
    // the smallest error in the frame -- the same as a still camera -- so nothing about rotation breaks the
    // per-frame bound. (Against v4557's moving reference the centre read 8.2e-3, which looked like exactly
    // the anomaly a per-pixel bound would be needed for. It was the reference.)
    ok(`*** the rotation CENTRE, at zero displacement, has the SMALLEST error in the frame (${ROLL[2].centre.toExponential(1)} at 2 deg/frame) -- so rotation does not break the per-frame bound, and the anomaly that suggested it would was the reference ***`,
        [0.5, 1, 2].every((d) => ROLL[d].centre <= ROLL[d].overall) && ROLL[2].centre < 1e-3,
        [0.5, 1, 2].map((d) => `${d}deg centre ${ROLL[d].centre.toExponential(2)} vs frame worst ${ROLL[d].overall.toExponential(2)}`).join("; "));
    const rollWorst = Math.max(...[0.5, 1, 2].map((d) => ROLL[d].overall));
    const transWorst = Math.max(...[0, 0.25, 0.5, 1, 2].map((s) => TRANS[s].now.worst));
    ok(`*** and roll obeys the same law at the same magnitude: worst ${rollWorst.toExponential(2)} against translation's ${transWorst.toExponential(2)}, both ${(ARC_MARGIN / Math.max(rollWorst, transWorst)).toFixed(0)}x or more below the arc's margin -- so ONE frame-wide worst-case number is safe under rotation too, and the per-pixel bound v4557's closing anticipated is not needed ***`,
        rollWorst < ARC_MARGIN / 10 && rollWorst < transWorst * 10 && transWorst < rollWorst * 10,
        `roll ${rollWorst.toExponential(3)}, translation ${transWorst.toExponential(3)}`);
    ok(`  and the error does rise with local displacement within a frame (${ROLL[2].keys.slice(0, 4).map((k) => `${k}px:${ROLL[2].B.get(k).worst.toExponential(1)}`).join(" ")}), so the per-pixel structure is REAL -- it is just too small to need its own bound`,
        ROLL[2].B.get(0).worst < ROLL[2].B.get(1).worst);
}

console.log("\n4. ON THE DEVICE: THE RING UNDER ROLL, WHICH NO GATE HAS RUN");

const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** Sections 1-3 are CPU only; nothing above has run a kernel."); fails++; }
else {
    // every device row in this arc has driven the ring under TRANSLATION or a still camera. A roll makes the
    // reprojection vary across the frame, which is the case a mirror is most likely to get wrong.
    const DW = 24, DH = 24, rate = 2 * Math.PI / 180, FR = 2 * P + 2;
    const dEye = (x, y) => [(2 * ((x + 0.5) / DW) - 1) * HALF, (1 - 2 * ((y + 0.5) / DH)) * HALF];
    const dvp = (a) => mat4Multiply(ortho(), rotZ(a));
    const cpu = makeLumaState(DW, DH, P), frames = [];
    const st = makeJitterState(1);
    for (let f = 0; f < FR; f++) {
        const j = advanceJitter(st), a = f * rate;
        const c = new Float32Array(DW * DH * 4), d = new Float32Array(DW * DH);
        const ca = Math.cos(-a), sa = Math.sin(-a);
        for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
            const i = y * DW + x, o = i * 4;
            const [ex, ey] = dEye(x, y);
            const sx = ex + j[0] * S, sy = ey + j[1] * S;
            const v = shade(sx * ca - sy * sa, sx * sa + sy * ca);
            c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[i] = (Z - NEAR) / (FAR - NEAR);
        }
        const m = motionVectorsCPU(d, DW, DH, mat4Invert(dvp(a)), dvp(a - rate)).data;
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
        return { ring: Array.from(new Float32Array(await dev.read(ringA))),
                 filled: Array.from(new Float32Array(await dev.read(fillA))), errs, backend: dev.backend };
    }` });
    ok("the harness ran the ring push under ROLL on a real WebGPU device",
        r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
        r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        let wr = 0; for (let i = 0; i < DW * DH * 2 * P; i++) wr = Math.max(wr, Math.abs(r.result.ring[i] - cpu.ring[i]));
        let bad = 0, devFull = 0;
        for (let i = 0; i < DW * DH; i++) { if (r.result.filled[i] !== cpu.filled[i]) bad++; if (r.result.filled[i] >= 2 * P) devFull++; }
        ok(`*** the device's ring matches the CPU's under a ROTATING camera to ${wr.toExponential(2)} over ${FR} compounded reprojections -- ${(wr / (1 / 255)).toExponential(1)} of an 8-bit LSB, and every device row in this arc until now drove translation or a still camera ***`,
            wr < (1 / 255) / 20, `worst ${wr.toExponential(3)}`);
        ok(`  and its fill count agrees exactly (${devFull} of ${DW * DH} full, CPU ${cpuCov.full}), so the coverage a caller reads is the same on both sides under rotation`,
            bad === 0 && devFull === cpuCov.full, `${bad} disagreements`);
    }
}

// SABOTAGE LOG -- applied to render/temporalLock.mjs and render/temporalLockWgsl.mjs, three gates run --
// this one, temporalRidgeMargin's (whose rows this round corrected) and temporalLock's -- red counts summed,
// files restored and md5-verified. Baseline 0 red. MEASURED at v4558.
//   FA the ring not reprojected, sampled at the pixel's own uv (CPU) -> 18 red, the widest of the set.
//   FB the ring fetch made NEAREST instead of bilinear                -> 12 red. *** THE FIRST ATTEMPT AT
//      THIS SABOTAGE WAS A NO-OP AND READ 0 RED. *** It wrapped the fetch's indices in Math.round, and those
//      indices are already integers -- the bilinear WEIGHTS were untouched, so nothing changed. A sabotage
//      that does not change behaviour measures nothing about the gate, which v4553's BS recorded and this is
//      the second time. Replacing the whole four-tap sum with a single nearest sample is the real mutation,
//      and it matters here more than anywhere: this round's entire subject is the error bilinear
//      interpolation leaves behind, so a gate blind to the interpolation would be measuring nothing.
//   FC ringCoverage counting any history rather than a full ring      -> 3 red.
//   FD the ring not reprojected in the WGSL ONLY                      -> 4 red, caught by the roll parity row.
//   FE the WGSL ring fetch unweighted, every tap at 0.25 (WGSL only)  -> 4 red.
//   FF the corrected reference reverted to v4557's moving one         -> 7 red. This is the one that matters
//      for the round: the reference IS the finding, so it gets a mutation of its own rather than being
//      trusted because the numbers it produces look reasonable.
//   No 0-RED among the six once FB is a real mutation.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a PERSPECTIVE projection, where a rotation moves near and far surfaces by " +
    "different amounts and the displacement is no longer a pure function of screen radius; content that is " +
    "not band-limited, since a smooth surface is the best case for bilinear reprojection and this whole " +
    "floor is measured on one; the floor for a ridge DECISION rather than a pixel, which " +
    "render/temporalRidgeMargin-selfcheck.mjs measures at about 3e-3 and which is the number a caller " +
    "actually wants; and whether the arc's gates should ADOPT a derived margin, which would move every " +
    "number v4553 onward recorded and is still a round of its own.");
process.exit(fails ? 1 : 0);
