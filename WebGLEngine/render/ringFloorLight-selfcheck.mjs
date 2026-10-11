/**
 * THE FLOOR AND THE SHADING DETECTOR ARE READING THE SAME NUMBER AND CALLING IT OPPOSITE THINGS.
 *
 * v4553 built shadingShiftCPU on |newer period mean - older period mean| to DETECT a lighting change.
 * v4565 spends that same quantity as REPROJECTION NOISE in the floor's step branch. Every fixture in this
 * arc is statically lit, so nothing has ever had to tell them apart -- and under changing light the floor
 * inflates, refusing locks exactly where the light is moving, which is where a temporal upscaler needs them.
 *
 * *** AT A STILL CAMERA THE SEPARATION IS EXACT, AND THAT IS THE PART THIS ROUND FIXES. *** With zero
 * displacement the reprojection is exact (v4558), so none of |newer - older| is its doing. Measured: 0.000
 * under static light and 0.520 under an 8%-per-frame ramp. The ring term is now gated on a displacement
 * having happened at all.
 *
 * *** UNDER MOTION THEY MIX AND NOTHING HERE SEPARATES THEM. *** Section 3 measures what that costs and the
 * gate does not touch it.
 */
import { makeLumaState, pushLuma, lumaMean, lumaMeanPrev, shadingShiftCPU } from "./temporalLock.mjs";
import { ringFloorCPU } from "./ringFloor.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 32, H = 32, NEAR = 1, FAR = 10, HALF = 4, Z = 8, S = 2 * HALF / W, P = jitterPhaseCount(1);
const vp = (cx, cy = 0) => { const o = new Float32Array(16);
    o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1;
    const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; t[13] = -cy; return mat4Multiply(o, t); };
const ALBEDO = {
    chequer: (wx, wy) => ((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? 0.92 : 0.06,
    edge: (wx) => wx < 0.37 ? 0.06 : 0.92,
    // *** A HORIZONTAL EDGE, WHICH ONLY A VERTICAL CAMERA MOVE SWEEPS PAST. *** Every fixture in this arc
    // translates the camera in X, so a bound that reads only the u component of the motion vector behaves
    // exactly like the real one -- measured as a 0-RED sabotage at v4566.
    edgeH: (wx, wy) => wy < 0.37 ? 0.06 : 0.92,
};
const LIGHT = { "static": () => 1, "ramp 2%/frame": (f) => 1 + 0.02 * f, "ramp 8%/frame": (f) => 1 + 0.08 * f };

/** One run. The geometry is identical in every lighting regime; only the brightness over time differs. */
function run(albedo, light, phase, axis = "x") {
    const speed = phase * S, st = makeJitterState(1), lu = makeLumaState(W, H, P), offs = [];
    const vert = axis === "y";
    const NF = 2 * P + 8; let L2 = null, m2 = null;
    for (let f = 0; f < NF; f++) {
        const j = advanceJitter(st), t0 = f * speed, cx = vert ? 0 : t0, cy = vert ? t0 : 0;
        const c = new Float32Array(W * H * 4), d = new Float32Array(W * H), L = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const k = y * W + x, o = k * 4;
            const v = albedo((2 * ((x + 0.5) / W) - 1) * HALF + cx + j[0] * S, (1 - 2 * ((y + 0.5) / H)) * HALF + cy + j[1] * S) * light(f);
            c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[k] = (Z - NEAR) / (FAR - NEAR); L[k] = v;
        }
        m2 = motionVectorsCPU(d, W, H, mat4Invert(vp(cx, cy)), vp(vert ? 0 : cx - speed, vert ? cy - speed : 0)).data;
        pushLuma(lu, { current: c, motion: m2, w: W, h: H });
        offs.push(j); L2 = L;
    }
    // *** THE TRUTH UNDER CHANGING LIGHT IS EACH FRAME'S OWN LIGHT. *** The ring mean averages P frames lit
    // differently, so a reference at one fixed brightness would report the light ramp itself as error.
    const tNow = (NF - 1) * speed, cxN = vert ? 0 : tNow, cyN = vert ? tNow : 0, truth = new Float32Array(W * H);
    for (let q = 0; q < P; q++) { const j = offs[NF - P + q], lg = light(NF - P + q);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
            truth[y * W + x] += albedo((2 * ((x + 0.5) / W) - 1) * HALF + cxN + j[0] * S, (1 - 2 * ((y + 0.5) / H)) * HALF + cyN + j[1] * S) * lg / P; }
    const mean = lumaMean(lu), prev = lumaMeanPrev(lu);
    let worstTrue = 0, n = 0, worstDiff = 0;
    for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
        const i = y * W + x; if (lu.filled[i] < lu.frames) continue;
        n++; worstTrue = Math.max(worstTrue, Math.abs(mean[i] - truth[i]));
        worstDiff = Math.max(worstDiff, Math.abs(mean[i] - prev[i]));
    }
    const e = ringFloorCPU(L2, m2, W, H, P, undefined, "window", lu);
    const ss = shadingShiftCPU(lu, { scale: 0.9, strength: 1 });
    let shiftMax = 0;
    for (let i = 0; i < W * H; i++) if (lu.filled[i] >= lu.frames) shiftMax = Math.max(shiftMax, ss.data[i]);
    return { worstTrue, worstDiff, est: e.worst, shiftMax, n, lu, truth, mean, per: e.per, regime: e.regime, motion: m2 };
}

console.log("ringFloorLight-selfcheck -- the floor's noise is the shading detector's signal\n");
console.log("1. *** THEY ARE THE SAME NUMBER, AND AT A STILL CAMERA IT IS ENTIRELY THE LIGHT ***");
const R = {};
{
    report("albedo   lighting        true floor   |newer-older|   shadingShift   floor estimate");
    for (const [an, af] of Object.entries(ALBEDO)) for (const [ln, lf] of Object.entries(LIGHT)) {
        const r = run(af, lf, 0);
        R[`${an}:${ln}`] = r;
        report(`${an.padEnd(8)} ${ln.padEnd(15)} ${r.worstTrue.toExponential(2)}     ${r.worstDiff.toFixed(3)}          ${r.shiftMax.toFixed(3)}          ${r.est.toExponential(2)}`);
    }
    const cs = R["chequer:static"], c8 = R["chequer:ramp 8%/frame"];
    ok("every one of these runs had pixels with a full ring -- a comparison over an empty set is not a comparison",
        Object.values(R).every((r) => r.n > 100), `least ${Math.min(...Object.values(R).map((r) => r.n))} pixels`);
    // *** THE SEPARATION, MEASURED. ***
    ok(`*** at a still camera with static light |newer - older| is ${cs.worstDiff.toFixed(3)} -- the jitter cancels over a whole period exactly, as v4553 built it to -- and under an 8%/frame ramp it is ${c8.worstDiff.toFixed(3)}, so at zero displacement the quantity is ENTIRELY the light ***`,
        cs.worstDiff < 1e-6 && c8.worstDiff > 0.3, `static ${cs.worstDiff.toExponential(2)}, ramp ${c8.worstDiff.toFixed(3)}`);
    ok(`*** and the shading detector reads the same number and calls it signal: ${c8.shiftMax.toFixed(3)} of its [0,1] range under the ramp against ${cs.shiftMax.toFixed(3)} under static light -- one quantity, two opposite interpretations, in the same tree since v4553 ***`,
        c8.shiftMax > 0.3 && cs.shiftMax < 1e-6,
        `shadingShift fires at ${c8.shiftMax.toFixed(3)}; the floor would have spent the same ${c8.worstDiff.toFixed(3)} as noise`);
    // *** AND THE TRUE FLOOR DOES NOT MOVE, WHICH IS WHAT MAKES IT A MISATTRIBUTION RATHER THAN A COST. ***
    ok(`  and the error actually present barely moves -- ${cs.worstTrue.toExponential(2)} to ${c8.worstTrue.toExponential(2)} -- because at zero displacement the reprojection is exact whatever the light is doing, so anything the floor adds here is attributed to the wrong cause`,
        c8.worstTrue < 1e-5 && cs.worstTrue < 1e-5, `static ${cs.worstTrue.toExponential(2)}, ramp ${c8.worstTrue.toExponential(2)}`);
}

console.log("\n2. THE GATE: NO DISPLACEMENT, NO REPROJECTION, NO RING TERM");
{
    // The gate is a hard test with nothing to tune: the motion vector is zero or it is not.
    // *** THE FIRST VERSION OF THIS ROW ASSERTED THE FLOOR ITSELF WOULD VANISH, AND IT DOES NOT. *** The
    // gate removes the RING term; the geometric term stays, and on this content at zero displacement that is
    // the full step -- which is itself proportional to the light, since a brighter chequer has bigger steps.
    // So the gate removes one of two lighting-driven contributions, not both, and the row has to compare the
    // gated floor against the ungated one rather than against zero. The ungated value is reconstructed here
    // because that is exactly what the module computed before v4566: the max with the ring term.
    // *** AND THE FRAME-WIDE MAX IS THE WRONG STATISTIC FOR THIS, WHICH THE SECOND VERSION OF THE ROW SHOWED
    // BY READING 1.00. *** The worst pixel in the frame is one where the geometric term already dominates, so
    // the gate cannot move it. What the gate changes is every pixel where the geometry is near zero -- the
    // flat regions an edge leaves behind -- and those are exactly the pixels that carry a lighting change and
    // no reprojection at all. The comparison has to be per pixel.
    const perPixel = (r) => {
        const m = lumaMean(r.lu), pv = lumaMeanPrev(r.lu), ratios = [];
        let changed = 0, n = 0;
        for (let i = 0; i < W * H; i++) {
            if (!r.regime[i] || r.lu.filled[i] < r.lu.frames) continue;
            const ungated = Math.max(r.per[i], Math.abs(m[i] - pv[i]));
            n++; if (ungated > r.per[i] * 1.01) { changed++; ratios.push(ungated / r.per[i]); }
        }
        ratios.sort((a, b) => a - b);
        return { n, changed, frac: changed / n, med: ratios.length ? ratios[ratios.length >> 1] : 1 };
    };
    const e8 = R["edge:ramp 8%/frame"], es = R["edge:static"];
    const g8 = perPixel(e8), gs = perPixel(es);
    report(`edge at a still camera, per step-branch pixel: under the ramp the gate lowers ${(g8.frac * 100).toFixed(0)}% of them, median ${g8.med.toExponential(1)}x; under static light ${(gs.frac * 100).toFixed(0)}%`);
    ok(`*** gated, the ring term contributes nothing at zero displacement: on the edge under the ramp it lowers ${(g8.frac * 100).toFixed(0)}% of step-branch pixels by a median ${g8.med.toExponential(1)}x, and every bit of that was the light being counted as reprojection noise ***`,
        g8.frac > 0.3 && g8.med > 100, `${g8.changed} of ${g8.n} pixels, median ${g8.med.toExponential(2)}x`);
    ok(`  and under STATIC light the same gate changes ${(gs.frac * 100).toFixed(0)}% of nothing -- |newer - older| is already zero there, so the gate removes a contribution that only exists when the light moves`,
        gs.frac < 0.01, `${gs.changed} of ${gs.n} pixels changed under static light`);
    ok(`  and what remains is not the gate failing: the geometric term at zero displacement is the full step, and a step scales with the light too -- ${es.est.toExponential(2)} static against ${e8.est.toExponential(2)} under the ramp, which is the brightness and not the reprojection`,
        e8.est > es.est, `static ${es.est.toExponential(3)}, ramp ${e8.est.toExponential(3)}`);
    ok("  and it is still a bound: no pixel on the step branch is under the error actually present, on either albedo and all three lighting regimes",
        (() => { let under = 0, n = 0;
            for (const r of Object.values(R)) for (let i = 0; i < W * H; i++) {
                if (!r.regime[i] || r.lu.filled[i] < r.lu.frames) continue;
                const err = Math.abs(r.mean[i] - r.truth[i]); if (!(err > 0)) continue;
                n++; if (r.per[i] < err) under++; }
            return n > 500 && under === 0; })(),
        "checked across all six still-camera runs");
    ok("  and the gate is a hard test rather than a tuned one: the motion vector is zero or it is not, and there is no threshold in it to choose",
        (() => { const z = new Float32Array(W * H * 4);
                 for (let i = 0; i < W * H; i++) z[i * 4 + 2] = 1;      // valid, but no displacement
                 const r = R["edge:ramp 8%/frame"];
                 const a = ringFloorCPU(new Float32Array(W * H).fill(0.5), z, W, H, P, undefined, "window", r.lu).worst;
                 const nz = new Float32Array(W * H * 4);
                 for (let i = 0; i < W * H; i++) { nz[i * 4] = 0.25 / W; nz[i * 4 + 2] = 1; }
                 const b = ringFloorCPU(new Float32Array(W * H).fill(0.5), nz, W, H, P, undefined, "window", r.lu).worst;
                 return b > a * 100; })(),
        "the same ring, the same flat field: a zero displacement gives the arithmetic floor and a quarter-texel gives the ring term");
}

console.log("\n3. *** WHAT THE GATE DOES NOT FIX, MEASURED RATHER THAN WAVED AT ***");
const M = {};
{
    report("albedo   lighting        true floor   floor estimate   est/true");
    for (const [an, af] of Object.entries(ALBEDO)) for (const [ln, lf] of Object.entries(LIGHT)) {
        const r = run(af, lf, 0.5);
        M[`${an}:${ln}`] = r;
        report(`${an.padEnd(8)} ${ln.padEnd(15)} ${r.worstTrue.toExponential(2)}     ${r.est.toExponential(2)}        ${(r.est / r.worstTrue).toFixed(1)}x`);
    }
    const cs = M["chequer:static"], c8 = M["chequer:ramp 8%/frame"];
    ok(`*** under motion the two mix and the gate cannot fire: the same 8%/frame ramp still lifts the floor from ${cs.est.toExponential(2)} to ${c8.est.toExponential(2)}, ${(c8.est / cs.est).toFixed(1)}x, and nothing here can say how much of that is the light ***`,
        c8.est > cs.est * 1.5, `static ${cs.est.toExponential(3)}, ramp ${c8.est.toExponential(3)}`);
    ok(`  the true floor DOES rise under motion (${cs.worstTrue.toExponential(2)} to ${c8.worstTrue.toExponential(2)}), so part of that lift is real -- which is exactly why it cannot be gated away, and why this round fixes only the case where the reprojection contributed nothing at all`,
        c8.worstTrue > cs.worstTrue, `true floor ${cs.worstTrue.toExponential(3)} -> ${c8.worstTrue.toExponential(3)}, a factor of ${(c8.worstTrue / cs.worstTrue).toFixed(1)}`);
    ok("  and it remains a bound under motion on both albedos and all three lightings, which is the property the round must not have broken",
        (() => { let under = 0, n = 0;
            for (const r of Object.values(M)) for (let i = 0; i < W * H; i++) {
                if (!r.regime[i] || r.lu.filled[i] < r.lu.frames) continue;
                const err = Math.abs(r.mean[i] - r.truth[i]); if (!(err > 0)) continue;
                n++; if (r.per[i] < err) under++; }
            return n > 500 && under === 0; })(),
        "checked across all six moving-camera runs");
}

console.log("\n4. THE PROBE THAT FOUND THIS READ A FIELD THAT DOES NOT EXIST");
{
    // *** RECORDED BECAUSE IT IS THIS ARC'S OLDEST FAULT AND I MADE IT AGAIN THIS ROUND. *** The probe that
    // opened the round indexed shadingShiftCPU's result directly -- ss[i] -- where it returns { data, unknown }.
    // Every read was undefined, every comparison false, and it reported "the detector fires on 0% of pixels"
    // for three lighting regimes. An absence read as a measurement, and the number it produced was exactly
    // the one that would have made the collision look like it was not there.
    const st = makeLumaState(8, 8, P), c = new Float32Array(8 * 8 * 4);
    // 2P + 2, not 2P: the first push cannot reproject (there is no history yet), so a ring of depth 2P needs
    // one extra frame to fill and the detector answers `unknown` for every pixel until it has
    for (let f = 0; f < 2 * P + 2; f++) { for (let i = 0; i < 64; i++) { const v = 0.3 + 0.4 * f / (2 * P);
        c[i * 4] = v; c[i * 4 + 1] = v; c[i * 4 + 2] = v; c[i * 4 + 3] = 1; }
        pushLuma(st, { current: c, motion: null, w: 8, h: 8 }); }
    const ss = shadingShiftCPU(st, { scale: 0.9 });
    ok("*** shadingShiftCPU returns { data, unknown } and not a bare array -- indexing it directly yields undefined, and undefined > 0.1 is false, which reads exactly like a detector that never fires ***",
        ss.data instanceof Float32Array && ss[0] === undefined && ss.data.length === 64,
        "the shape is pinned here so the next probe that gets it wrong goes red instead of quiet");
    ok("  and the detector does fire on this ramp once it is read correctly, which is what the wrong reading hid",
        ss.data[8 * 4 + 4] > 0.05, `shift ${ss.data[8 * 4 + 4].toFixed(3)} at an interior pixel`);
    ok("  and it reports how many pixels it could not answer for, rather than returning a zero that looks like an answer",
        typeof ss.unknown === "number" && ss.unknown === 0, `unknown = ${ss.unknown} of 64, the ring having filled`);
}

console.log("\n5. *** A CAMERA THAT MOVES VERTICALLY, WHICH THIS ARC HAS NEVER HAD ***");
{
    // Every fixture from v4553 to v4565 translates the camera in X. A gate reading only the u component of
    // the motion vector is therefore indistinguishable from the real one -- measured as a 0-RED sabotage
    // this round. A horizontal edge under a vertical camera move is the smallest fixture that separates them:
    // the ring term is load-bearing there, and a u-only gate would switch it off.
    const v8 = run(ALBEDO.edgeH, LIGHT["ramp 8%/frame"], 0.5, "y");
    const vs = run(ALBEDO.edgeH, LIGHT.static, 0.5, "y");
    report(`horizontal edge, camera moving in Y: static floor ${vs.est.toExponential(2)} against a true ${vs.worstTrue.toExponential(2)}; under the 8%/frame ramp ${v8.est.toExponential(2)} against ${v8.worstTrue.toExponential(2)}`);
    ok("*** the bound holds under VERTICAL camera motion, which needs the gate to read the v component and not only the u -- every fixture in this arc moves in x, so a u-only gate reads identically on all of them ***",
        (() => { let under = 0, n = 0;
            for (const r of [v8, vs]) for (let i = 0; i < W * H; i++) {
                if (!r.regime[i] || r.lu.filled[i] < r.lu.frames) continue;
                const err = Math.abs(r.mean[i] - r.truth[i]); if (!(err > 0)) continue;
                n++; if (r.per[i] < err) under++; }
            return n > 200 && under === 0; })(),
        "no step-branch pixel under the error, on a horizontal edge swept vertically");
    // *** THE FIRST VERSION OF THIS ROW MULTIPLIED BY ZERO AND COMPARED THE RESULT TO NOTHING. *** It read
    // `Math.abs(r.per[i] * 0)` into a variable it never used and returned a pixel count -- a control that
    // cannot fail, in the round whose whole subject is a fixture that could not tell two things apart.
    // What it has to check is that the motion vectors really are vertical, which is the property the
    // u-only gate would exploit.
    const mv = vs.motion;
    let maxU = 0, maxV = 0;
    for (let i = 0; i < W * H; i++) {
        if (mv[i * 4 + 2] === 0) continue;
        maxU = Math.max(maxU, Math.abs(mv[i * 4]));
        maxV = Math.max(maxV, Math.abs(mv[i * 4 + 1]));
    }
    ok(`  and the fixture genuinely exercises the v component: the motion vectors carry ${(maxV * H).toFixed(2)} texels vertically and ${(maxU * W).toExponential(1)} horizontally, so a gate reading only u would see a still camera here`,
        maxV * H > 0.1 && maxU * W < 1e-6, `max |u| ${maxU.toExponential(2)}, max |v| ${maxV.toExponential(2)}`);
    // *** AND A NULL MOTION BUFFER IS NOT MOTION. ***
    const still = R["edge:ramp 8%/frame"];
    ok("*** and a null motion buffer is not motion: with no displacement information at all the ring term is not applied, rather than applied on the assumption that something moved ***",
        (() => { const flat = new Float32Array(W * H).fill(0.5);
                 const a = ringFloorCPU(flat, null, W, H, P, undefined, "window", still.lu).worst;
                 const nz = new Float32Array(W * H * 4);
                 for (let i = 0; i < W * H; i++) { nz[i * 4] = 0.25 / W; nz[i * 4 + 2] = 1; }
                 const b = ringFloorCPU(flat, nz, W, H, P, undefined, "window", still.lu).worst;
                 return b > a * 100; })(),
        "the same ring and the same field: null motion gives the arithmetic floor, a quarter-texel gives the ring term");
}

// SABOTAGE. Seven rewrites of the gate and the shading detector's contract, run against seven gates --
// this one, ringFloorStep, ringFloorControl, ringFloorMargin, ringFloorPerspective, ringFloor and
// temporalLock -- with v4557's crash rule applied.
//   PA  the gate removed, so the light counts as reprojection noise again        3 red
//   PB  the gate inverted, the ring term applied only where nothing moved        8 red
//   PC  the gate reads only the u component of the motion vector                 1 red
//   PD  a null motion buffer treated as motion                                   1 red
//   PE  shadingShiftCPU returns a bare array instead of { data, unknown }        4 red
//   PF  shadingShiftCPU stops reporting `unknown`                                1 red
//   PG  the ring term drops the spread again, with the gate in place             3 red
//
// *** PC AND PD BOTH WENT 0-RED ON THE FIRST SWEEP. ***
//
// PC reads only the u component, so a camera moving straight down is treated as a still one. It was
// invisible because EVERY FIXTURE IN THIS ARC, from v4553 to v4565, translates the camera in X. Thirteen
// rounds of gates and not one of them moves it anywhere else, so a bound that ignores half the motion vector
// reads identically on all of them. Section 5 is a horizontal edge swept vertically, which is the smallest
// fixture that can tell the two apart.
//
// PD treats a null motion buffer as motion. Nothing checked it because the callers that pass null use the
// frame form, which has no ring term at all -- so the one combination that matters, a per-pixel bound with no
// displacement information, had no reader.
//
// *** AND THE PROBE THAT OPENED THIS ROUND READ ss[i] WHERE shadingShiftCPU RETURNS { data, unknown }. ***
// Every read was undefined, every comparison false, and it reported "the detector fires on 0% of pixels" for
// three lighting regimes -- the exact number that would have made this collision look like it was not there.
// An absence read as a measurement, this arc's oldest fault, made again by me in the round that is about two
// readings of one quantity. PE and PF pin the shape so the next probe that gets it wrong goes red.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: separating the light from the reprojection UNDER MOTION, which section 3 " +
    "measures at 2.8x of unattributable inflation and which this round does not attempt; whether a caller " +
    "should feed shadingShiftCPU's own answer back to the floor as a correction, since the two now " +
    "demonstrably read one quantity and nothing composes them; lighting that changes SPATIALLY rather than " +
    "uniformly, since a ramp over the whole frame is the easiest case there is; and the gate on the DEVICE, " +
    "whose kernel carries neither the ring term nor this.");
process.exit(fails ? 1 : 0);
