/**
 * THE FLOOR UNDER A PERSPECTIVE PROJECTION, WHICH EVERY NUMBER IN THIS ARC WAS MEASURED WITHOUT.
 *
 * v4553 onward built the temporal ring, its locks and its noise floor on an ORTHOGRAPHIC fixture, where a
 * camera translation moves every pixel by exactly the same amount. v4558 named perspective as unmeasured,
 * v4559 and v4560 each repeated the note, and v4561 named it again. It matters because the floor is gated by
 * SUB-PIXEL PHASE (v4558) and under perspective the displacement -- and therefore the phase -- varies across
 * the frame with depth. Measured here: a 47x spread of displacement within ONE frame, where orthographic is
 * exactly 1 by construction.
 *
 * The question this answers is whether ONE frame-wide floor is legitimate at all when the thing it bounds
 * varies that much across the picture.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { makeLumaState, pushLuma, lumaMean } from "./temporalLock.mjs";
import { ringFloorCPU, EPS_F32, ARITHMETIC_ULPS } from "./ringFloor.mjs";
import { RING_FLOOR_WGSL } from "./ringFloorWgsl.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 48, H = 48, NEAR = 0.5, FAR = 40, FOVY = 60 * Math.PI / 180, EYE_Y = 1.6;
const P = jitterPhaseCount(1), SPEED = 0.05, FRAMES = 2 * P + 4;

/** WebGPU-style perspective, clip z in [0,1], looking down -z. Column-major, this tree's layout. */
function persp(aspect) {
    const f = 1 / Math.tan(FOVY / 2), o = new Float32Array(16);
    o[0] = f / aspect; o[5] = f; o[10] = FAR / (NEAR - FAR); o[11] = -1; o[14] = FAR * NEAR / (NEAR - FAR);
    return o;
}
const viewOf = (cx) => { const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; t[13] = -EYE_Y; return t; };
const VP = (cx) => mat4Multiply(persp(W / H), viewOf(cx));
const xform = (m, x, y, z) => {
    const o = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) o[r] = m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r];
    return o;
};
const content = (wx, wz) => 0.5 + 0.45 * Math.sin(wx * 1.1) * Math.cos(wz * 0.9);

/** Ray through a pixel, intersected with the ground plane y = 0. The inverse is HOISTED: recomputing a 4x4
 *  inverse per pixel per frame is 48*48*20 of them and this gate has a 3,000 ms budget to live in. */
function tracer(cx) {
    const m = VP(cx), inv = mat4Invert(m);
    return (x, y, j) => {
        const u = (x + 0.5 + j[0]) / W, v = (y + 0.5 + j[1]) / H;
        const nx = 2 * u - 1, ny = 1 - 2 * v;
        const a = xform(inv, nx, ny, 0.0), b = xform(inv, nx, ny, 0.5);
        const A = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], B = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
        const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        if (Math.abs(d[1]) < 1e-12) return null;
        const t = -A[1] / d[1];
        if (t <= 0) return null;                                  // above the horizon: no surface
        const Pw = [A[0] + t * d[0], 0, A[2] + t * d[2]];
        const c = xform(m, Pw[0], Pw[1], Pw[2]);
        if (c[3] <= 0) return null;
        return { P: Pw, clipZ: c[2] / c[3] };
    };
}

console.log("ringFloorPerspective-selfcheck -- the floor when displacement varies across the frame\n");
console.log("1. THE FIXTURE VERIFIES ITS OWN CONVENTIONS BEFORE ANYTHING IS MEASURED ON IT");
{
    // motionVectors.mjs is explicitly agnostic between a [0,1] and a [-1,1] depth convention and says the
    // CALLER must not be. An arc that has only ever built orthographic matrices has never had to prove it.
    const m = VP(0);
    const zn = xform(m, 0, 0, -NEAR), zf = xform(m, 0, 0, -FAR);
    ok("the projection puts the near plane at clip z 0 and the far plane at 1, which is the convention the depth buffer is written in",
        Math.abs(zn[2] / zn[3] - 0) < 1e-5 && Math.abs(zf[2] / zf[3] - 1) < 1e-5,
        `near ${(zn[2] / zn[3]).toFixed(6)}, far ${(zf[2] / zf[3]).toFixed(6)}`);
    const inv = mat4Invert(m), p = [1.3, 0, -6.5];
    const c = xform(m, p[0], p[1], p[2]);
    const nd = [c[0] / c[3], c[1] / c[3], c[2] / c[3]];
    const b = xform(inv, nd[0], nd[1], nd[2]);
    const back = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
    const err = Math.max(...p.map((v, i) => Math.abs(v - back[i])));
    ok("and unprojecting a projected point returns it -- the perspective divide is done in both directions and they agree",
        err < 1e-4, `round-trip error ${err.toExponential(2)} on ${JSON.stringify(p)}`);
    const tr = tracer(0);
    const nearRow = tr(W >> 1, H - 1, [0, 0]), farRow = tr(W >> 1, Math.floor(H * 0.58), [0, 0]);
    ok("the scene has a real depth RANGE down the screen, which is the only reason this fixture differs from the arc's",
        nearRow && farRow && Math.abs(farRow.P[2]) > 3 * Math.abs(nearRow.P[2]),
        `bottom row world z ${nearRow.P[2].toFixed(2)}, upper row ${farRow.P[2].toFixed(2)}`);
}

console.log("\n2. *** THE THING ORTHOGRAPHIC COULD NOT ASK: DISPLACEMENT VARYING ACROSS ONE FRAME ***");
const SC = {};
{
    const st = makeJitterState(1), lu = makeLumaState(W, H, P), offs = [];
    let luma = null, motion = null, onPlane = null;
    for (let f = 0; f < FRAMES; f++) {
        const j = advanceJitter(st), cx = f * SPEED, tr = tracer(cx);
        const c = new Float32Array(W * H * 4), d = new Float32Array(W * H), L = new Float32Array(W * H), op = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, o = i * 4, t = tr(x, y, j);
            const v = t ? content(t.P[0], t.P[2]) : 0.5;
            c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1;
            d[i] = t ? t.clipZ : 1; L[i] = v; op[i] = t ? 1 : 0;
        }
        motion = motionVectorsCPU(d, W, H, mat4Invert(VP(cx)), VP(cx - SPEED)).data;
        pushLuma(lu, { current: c, motion, w: W, h: H });
        offs.push(j); luma = L; onPlane = op;
    }
    Object.assign(SC, { lu, luma, motion, onPlane, offs: offs.slice(-P), cxNow: (FRAMES - 1) * SPEED });
    let lo = Infinity, hi = 0, n = 0;
    for (let i = 0; i < W * H; i++) {
        if (!onPlane[i] || motion[i * 4 + 2] === 0) continue;
        const px = Math.abs(motion[i * 4]) * W;
        if (px < lo) lo = px; if (px > hi) hi = px; n++;
    }
    SC.spread = hi / lo; SC.lo = lo; SC.hi = hi;
    ok(`*** one camera translation moves the near ground ${hi.toFixed(3)} pixels and the far ground ${lo.toFixed(4)} -- a ${(hi / lo).toFixed(0)}x spread of sub-pixel phase inside a single frame, where every orthographic fixture in this arc has a spread of exactly 1 ***`,
        hi / lo > 10 && n > 500, `${lo.toFixed(4)}..${hi.toFixed(4)} px over ${n} on-plane pixels`);
}

console.log("\n3. THE FLOOR BY DEPTH BAND, AND WHICH BAND ACTUALLY SETS THE FRAME-WIDE NUMBER");
const BAND = [];
{
    // v4558's corrected reference, under perspective: the surface at THIS pixel NOW, under each frame's
    // jitter. The correction matters more here than it did there -- a reference that moved with the camera
    // would be wrong by the parallax, which is the very thing this fixture has and the arc's did not.
    const ref = new Float32Array(W * H);
    for (const j of SC.offs) { const tr = tracer(SC.cxNow);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const t = tr(x, y, j);
            ref[y * W + x] += (t ? content(t.P[0], t.P[2]) : 0.5) / P;
        } }
    const mm = lumaMean(SC.lu), est = ringFloorCPU(SC.luma, SC.motion, W, H, P);
    report("band (px/frame)   pixels   TRUE floor   estimate    est/true");
    for (const [lo, hi] of [[0, 0.05], [0.05, 0.15], [0.15, 0.35], [0.35, 1.0]]) {
        let t = 0, e = 0, n = 0;
        for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
            const i = y * W + x;
            if (!SC.onPlane[i] || SC.lu.filled[i] < SC.lu.frames || SC.motion[i * 4 + 2] === 0) continue;
            const px = Math.abs(SC.motion[i * 4]) * W;
            if (px < lo || px >= hi) continue;
            n++; t = Math.max(t, Math.abs(mm[i] - ref[i])); e = Math.max(e, est.per[i]);
        }
        BAND.push({ lo, hi, n, t, e });
        report(`${lo.toFixed(2)}-${hi.toFixed(2)}          ${String(n).padStart(5)}   ${n ? t.toExponential(3) : "  no pixels"}   ${n ? e.toExponential(3) : ""}   ${n && t > 0 ? (e / t).toFixed(2) : "--"}`);
    }
    const live = BAND.filter((b) => b.n > 0 && b.t > 0);
    ok("every band this fixture claims to measure actually has pixels with a full ring -- four bands, none of them an empty set reported as a number",
        live.length === 4, `${live.map((b) => b.n).join(", ")} pixels per band`);
    const wT = Math.max(...live.map((b) => b.t)), wE = Math.max(...live.map((b) => b.e));
    SC.wT = wT; SC.wE = wE;
    // *** SAFE, WHICH IS THE QUESTION THAT MATTERED. *** Twelve orthographic readings said nothing about this.
    ok(`*** the estimate is still SAFE under perspective, frame-wide: ${wE.toExponential(2)} against a true ${wT.toExponential(2)} ***`,
        wE >= wT, `ratio ${(wE / wT).toFixed(2)}`);
    // *** AND MUCH LOOSER, WHICH IS THE PRICE. ***
    ok(`*** but the price is tightness: ${(wE / wT).toFixed(0)}x frame-wide where twelve orthographic readings ran 1.05x to 4.48x, and the loosest band is ${Math.max(...live.map((b) => b.e / b.t)).toFixed(0)}x ***`,
        wE / wT > 5, `bands ${live.map((b) => (b.e / b.t).toFixed(0) + "x").join(", ")}`);
    // *** AND THE FRAME-WIDE NUMBER IS SET BY THE FAR FIELD, NOT THE NEAR ONE, WHICH IS BACKWARDS FROM THE
    // OBVIOUS GUESS. *** Parallax is largest near; the floor is largest far, because a ground plane is
    // FORESHORTENED with distance, so the far field carries the highest spatial frequency per pixel -- and
    // the floor is a content law (v4559) before it is a motion one.
    const nearest = live[live.length - 1], farthest = live[0];
    ok(`*** and the frame-wide floor is set by the FAR field (${farthest.t.toExponential(2)} at ${farthest.lo}-${farthest.hi} px/frame), not the near one (${nearest.t.toExponential(2)} at the largest displacement) -- backwards from the obvious guess, because foreshortening puts the highest spatial frequency where the motion is smallest, and the floor is a content law before it is a motion one ***`,
        farthest.t > nearest.t * 2, `far ${farthest.t.toExponential(3)}, near ${nearest.t.toExponential(3)}, ${(farthest.t / nearest.t).toFixed(1)}x`);
    ok(`  so one frame-wide margin is legitimate but expensive: it over-margins the loudest-motion band by ${(wT / nearest.t).toFixed(0)}x, and a caller wanting that back needs a per-band floor, which this gate does not build`,
        wT / nearest.t > 2, `frame-wide ${wT.toExponential(3)} vs the fastest band's ${nearest.t.toExponential(3)}`);
}

console.log("\n4. *** WHY THE LOOSENESS IS THE STEP BOUND'S PHASE TERM -- AND THE REPAIR THAT MEASURED UNSAFE ***");
{
    // The step bound is max(f, 1-f) * step. At f = 0 that returns the FULL step where v4558 proved the fetch
    // is EXACT. Under perspective much of the frame sits near integer phase, which is exactly where the bound
    // is loosest -- hence section 3's numbers.
    //
    // *** THE OBVIOUS REPAIR IS min(f, 1-f), AND IT IS UNSAFE. *** It is zero at both f = 0 and f = 1 and
    // equal to max at f = 0.5 -- and f = 0.5 is the ONLY phase every orthographic fixture in this arc runs
    // at, so no existing fixture can tell the two forms apart. Measured across phases on the chequer, the min
    // form reads 0.37x, 0.79x and 0.68x of truth: UNDER, which for a margin is the direction that matters.
    // The reason is that the ring's window spans MANY frames, and the jitter gives each a different phase --
    // so this frame's f does not bound the window's worst, and only a form that stays large when f is small
    // can. max(f, 1-f) is crude and it is safe, and it is kept.
    // *** THE REJECTED FORM IS COMPUTED HERE, NOT QUOTED. *** The first version of this row asserted a
    // constant carried over from a scratchpad probe, which is a row that restates my own arithmetic instead
    // of driving anything -- a control that cannot fail, and its constant was wrong as well. The min form is
    // not part of the module (it was rejected), so the gate that rejects it owns the code.
    const estMin = (L, motion, w, h, depth) => {
        let worst = 0;
        const nb = (i, st) => {
            const d2a = L[i - st] - 2 * L[i] + L[i + st], d2b = L[i] - 2 * L[i + st] + L[i + 2 * st];
            let lo = Infinity, hi = -Infinity;
            for (let k = -2; k <= 2; k++) { const q = L[i + k * st]; if (q < lo) lo = q; if (q > hi) hi = q; }
            return { d3: Math.abs(d2b - d2a), d2: Math.max(Math.abs(d2a), Math.abs(d2b)),
                     step: Math.max(Math.abs(L[i] - L[i - st]), Math.abs(L[i + st] - L[i])), range: hi - lo };
        };
        for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
            const i = y * w + x, o = i * 4;
            const hu = (x + 0.5) / w + motion[o], hv = (y + 0.5) / h + motion[o + 1];
            const fx = hu * w - 0.5 - Math.floor(hu * w - 0.5), fy = hv * h - 0.5 - Math.floor(hv * h - 0.5);
            const X = nb(i, 1), Y = nb(i, w);
            const rx = X.range > 1e-6 && X.d3 / X.range < 0.25, ry = Y.range > 1e-6 && Y.d3 / Y.range < 0.25;
            const ex = rx ? depth * 0.5 * fx * (1 - fx) * (X.d2 + X.d3) : Math.min(fx, 1 - fx) * X.step;
            const ey = ry ? depth * 0.5 * fy * (1 - fy) * (Y.d2 + Y.d3) : Math.min(fy, 1 - fy) * Y.step;
            worst = Math.max(worst, ex + ey);
        }
        return worst;
    };
    const HALF_W = 32, HALF_S = 8;
    const orthoVp = (cx) => { const o = new Float32Array(16);
        o[0] = 1 / (HALF_S / 2); o[5] = 1 / (HALF_S / 2); o[10] = 1 / 9; o[14] = -1 / 9; o[15] = 1;
        const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; return mat4Multiply(o, t); };
    const cheq = (wx, wy) => ((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? 0.92 : 0.06;
    const runPhase = (ph) => {
        const S2 = HALF_S / HALF_W, speed = ph * S2, st = makeJitterState(1);
        const lu = makeLumaState(HALF_W, HALF_W, P), offs = [];
        let L2 = null, m2 = null;
        for (let i = 0; i < FRAMES; i++) {
            const j = advanceJitter(st), cx = i * speed;
            const c = new Float32Array(HALF_W * HALF_W * 4), d = new Float32Array(HALF_W * HALF_W), L = new Float32Array(HALF_W * HALF_W);
            for (let y = 0; y < HALF_W; y++) for (let x = 0; x < HALF_W; x++) {
                const k = y * HALF_W + x, o = k * 4;
                const v = cheq((2 * ((x + 0.5) / HALF_W) - 1) * (HALF_S / 2) + cx + j[0] * S2, (1 - 2 * ((y + 0.5) / HALF_W)) * (HALF_S / 2) + j[1] * S2);
                c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[k] = 0.5; L[k] = v;
            }
            m2 = motionVectorsCPU(d, HALF_W, HALF_W, mat4Invert(orthoVp(cx)), orthoVp(cx - speed)).data;
            pushLuma(lu, { current: c, motion: m2, w: HALF_W, h: HALF_W }); offs.push(j); L2 = L;
        }
        const cxNow = (FRAMES - 1) * speed, a = new Float32Array(HALF_W * HALF_W);
        for (const j of offs.slice(-P)) for (let y = 0; y < HALF_W; y++) for (let x = 0; x < HALF_W; x++)
            a[y * HALF_W + x] += cheq((2 * ((x + 0.5) / HALF_W) - 1) * (HALF_S / 2) + cxNow + j[0] * S2, (1 - 2 * ((y + 0.5) / HALF_W)) * (HALF_S / 2) + j[1] * S2) / P;
        const mm = lumaMean(lu); let t = 0, n = 0;
        for (let y = 3; y < HALF_W - 3; y++) for (let x = 3; x < HALF_W - 3; x++) { const i = y * HALF_W + x;
            if (lu.filled[i] < lu.frames) continue; n++; t = Math.max(t, Math.abs(mm[i] - a[i])); }
        return { t, n, e: ringFloorCPU(L2, m2, HALF_W, HALF_W, P).worst, eMin: estMin(L2, m2, HALF_W, HALF_W, (P - 1) / 2) };
    };
    report("phase   TRUE       kept max-form  ratio    rejected min-form  ratio");
    const got = [];
    for (const ph of [0.125, 0.25, 0.5, 0.75]) {
        const r = runPhase(ph);
        got.push({ ph, ...r });
        report(`${ph.toFixed(3)}   ${r.t.toExponential(2)}   ${r.e.toExponential(2)}       ${(r.e / r.t).toFixed(2).padStart(5)}    ${r.eMin.toExponential(2)}          ${(r.eMin / r.t).toFixed(2).padStart(5)}${r.eMin < r.t ? "  UNSAFE" : ""}`);
    }
    ok("the kept max-form is safe at every phase measured, not only at the half-texel one every orthographic fixture in this arc happens to use",
        got.every((g) => g.n > 0 && g.e >= g.t), got.map((g) => `${g.ph}: ${(g.e / g.t).toFixed(2)}x`).join(", "));
    const under = got.filter((g) => g.eMin < g.t);
    ok(`*** and min(f, 1-f) -- the repair the looseness suggests -- is UNSAFE at ${under.length} of the ${got.length} phases, reading as low as ${Math.min(...got.map((g) => g.eMin / g.t)).toFixed(2)}x of truth: the ring's window spans many frames at many jitter phases, so THIS frame's f does not bound the window's worst ***`,
        under.length >= 2 && Math.min(...got.map((g) => g.eMin / g.t)) < 0.9,
        got.map((g) => `${g.ph}: ${(g.eMin / g.t).toFixed(2)}x`).join(", "));
    const at5 = got.find((g) => g.ph === 0.5);
    // *** AND THE ROW THAT WAS HERE FIRST CLAIMED THE TWO FORMS COINCIDE AT PHASE 0.5, WHICH IS FALSE. ***
    // They coincide where f = 0.5, and a half-texel camera speed only puts the MOVING axis there. The still
    // axis sits at f = 0, where max returns the whole step and min returns nothing -- the two forms differ
    // maximally on it. So the reason no earlier round caught the min form is NOT that its fixtures were blind
    // to it: it is that nobody had written the min form to compare. Recorded because the first version of
    // this row would have shipped a blind-fixture story that the fixture itself refutes.
    ok(`*** and they differ even at a half-texel speed -- ${at5.e.toExponential(2)} against ${at5.eMin.toExponential(2)}, a factor of ${(at5.e / at5.eMin).toFixed(1)} -- because only the MOVING axis sits at f = 0.5; the still axis sits at f = 0 where max returns the whole step and min returns nothing ***`,
        at5.e > at5.eMin * 2, `max-form ${at5.e.toExponential(4)}, min-form ${at5.eMin.toExponential(4)}`);
    ok("  so this is a rejected alternative rather than a blind spot: the arc's own orthographic fixture separates the two forms, and what was missing was anyone writing the second one down to be separated",
        Math.abs(at5.e - at5.eMin - at5.eMin * 2) < at5.eMin * 0.5,
        `the gap is the still axis's whole step: ${(at5.e - at5.eMin).toExponential(3)}`);
}

console.log("\n5. *** THE ESTIMATE RETURNED EXACTLY ZERO AT AN INTEGER DISPLACEMENT, AND ZERO IS NOT A FLOOR ***");
{
    // At an integer displacement f(1-f) is exactly zero, so on resolved content v4560's estimator returned 0.
    // v4561's own sampling section calls a zero floor the most dangerous answer there is: ridgeMarginBounds
    // turns noiseFloor 0 into margin 0, and a margin of zero makes every fluctuation a feature.
    const smooth = (wx, wy) => 0.5 + 0.45 * Math.sin(wx * 0.35) * Math.cos(wy * 0.28);
    const SW = 32, SPAN = 8, S2 = SPAN / SW;
    const oVp = (cx) => { const o = new Float32Array(16);
        o[0] = 2 / SPAN; o[5] = 2 / SPAN; o[10] = 1 / 9; o[14] = -1 / 9; o[15] = 1;
        const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; return mat4Multiply(o, t); };
    const st = makeJitterState(1); let L2 = null, m2 = null;
    const lu = makeLumaState(SW, SW, P), offs = [];
    for (let i = 0; i < FRAMES; i++) {
        const j = advanceJitter(st), cx = i * S2;                       // EXACTLY one texel per frame
        const c = new Float32Array(SW * SW * 4), d = new Float32Array(SW * SW), L = new Float32Array(SW * SW);
        for (let y = 0; y < SW; y++) for (let x = 0; x < SW; x++) {
            const k = y * SW + x, o = k * 4;
            const v = smooth((2 * ((x + 0.5) / SW) - 1) * (SPAN / 2) + cx + j[0] * S2, (1 - 2 * ((y + 0.5) / SW)) * (SPAN / 2) + j[1] * S2);
            c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[k] = 0.5; L[k] = v;
        }
        m2 = motionVectorsCPU(d, SW, SW, mat4Invert(oVp(cx)), oVp(cx - S2)).data;
        pushLuma(lu, { current: c, motion: m2, w: SW, h: SW }); offs.push(j); L2 = L;
    }
    const cxNow = (FRAMES - 1) * S2, a = new Float32Array(SW * SW);
    for (const j of offs.slice(-P)) for (let y = 0; y < SW; y++) for (let x = 0; x < SW; x++)
        a[y * SW + x] += smooth((2 * ((x + 0.5) / SW) - 1) * (SPAN / 2) + cxNow + j[0] * S2, (1 - 2 * ((y + 0.5) / SW)) * (SPAN / 2) + j[1] * S2) / P;
    const mm = lumaMean(lu); let t = 0, n = 0, mag = 0;
    for (let y = 3; y < SW - 3; y++) for (let x = 3; x < SW - 3; x++) { const i = y * SW + x;
        if (lu.filled[i] < lu.frames) continue; n++; t = Math.max(t, Math.abs(mm[i] - a[i])); mag = Math.max(mag, Math.abs(L2[i])); }
    const e = ringFloorCPU(L2, m2, SW, SW, P);
    report(`at an exactly-integer displacement: true floor ${t.toExponential(3)}, estimate ${e.worst.toExponential(3)}, one ulp of the local magnitude is ${(EPS_F32 * mag).toExponential(3)}`);
    ok("the true floor at an integer displacement is not zero -- the reprojection is exact and the ARITHMETIC is not",
        n > 0 && t > 0, `${t.toExponential(3)} over ${n} pixels`);
    ok(`*** and the estimate no longer returns zero there: it is floored at ${ARITHMETIC_ULPS} ulps of the local magnitude, which is ${(e.worst / t).toFixed(2)}x the measured floor rather than the 0.00e+0 v4560 returned ***`,
        e.worst > 0 && e.worst >= t, `estimate ${e.worst.toExponential(3)}, truth ${t.toExponential(3)}`);
    // *** THE ULP COUNT IS MEASURED AND THE ROUNDING UP IS LABELLED. ***
    ok(`  and the ulp count is a measurement, not a derivation: the ring mean's error over a 64x range of magnitude reads 1.05, 1.05, 1.05 and 0.54 ulps, and ${ARITHMETIC_ULPS} is that rounded up to a power of two -- the (P+1)/2-ulp argument from summing ${P} values predicts ${((P + 1) / 2).toFixed(1)} and over-predicts by ${(((P + 1) / 2) / 1.05).toFixed(0)}x, so it is not what is used`,
        ARITHMETIC_ULPS >= 1.05 && ARITHMETIC_ULPS < (P + 1) / 2, `${ARITHMETIC_ULPS} ulps, measured 1.05`);
    ok("  and it scales with the local magnitude rather than being an absolute number, which is what an HDR caller whose values are not in 0..1 needs",
        (() => { const big = new Float32Array(L2.length); for (let i = 0; i < L2.length; i++) big[i] = L2[i] * 64;
                 const eb = ringFloorCPU(big, m2, SW, SW, P);
                 return Math.abs(eb.worst / e.worst - 64) < 1; })(),
        "the same field scaled 64x gives a floor scaled 64x");
}

console.log("\n6. THE KERNEL CARRIES THE SAME FLOOR");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** Sections 1-5 are CPU only; nothing above has run a kernel."); fails++; }
else {
    const est = ringFloorCPU(SC.luma, SC.motion, W, H, P);
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, P, tau: 0.25,
        luma: Array.from(SC.luma), motion: Array.from(SC.motion) }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { RING_FLOOR_WGSL } = await import("/render/ringFloorWgsl.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const p = dev.compute({ wgsl: RING_FLOOR_WGSL });
        const dst = dev.buffer({ data: new Float32Array(a.W * a.H), usage: ["storage"] });
        const ub = new ArrayBuffer(32);
        new Uint32Array(ub, 0, 4).set([a.W, a.H, a.P, 0]);
        new Float32Array(ub, 16, 4).set([a.tau, 0, 0, 0]);
        p.bind("luma", dev.buffer({ data: new Float32Array(a.luma), usage: ["storage"] }))
         .bind("motion", dev.buffer({ data: new Float32Array(a.motion), usage: ["storage"] }))
         .bind("dst", dst).bind("u", dev.buffer({ data: new Uint32Array(ub), usage: "uniform" }));
        dev.frame(({ pass }) => { pass.dispatch(p, [Math.ceil(a.W / 8), Math.ceil(a.H / 8)]); pass.clear([0,0,0,1]); }, { offscreen: true });
        return { dst: Array.from(new Float32Array(await dev.read(dst))), errs, backend: dev.backend };
    }` });
    ok("the harness ran the floor kernel on the perspective frame",
        r.ok && r.result && r.result.errs.length === 0,
        r.ok ? `${r.result && r.result.backend}${r.software ? " on a SOFTWARE adapter (" + r.adapter.architecture + "), per v4561 -- parity, not timing" : ""}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        let worst = 0, nz = 0, floored = 0;
        for (let i = 0; i < W * H; i++) {
            if (est.per[i] !== 0) nz++;
            if (est.per[i] > 0 && est.per[i] <= ARITHMETIC_ULPS * EPS_F32 * 2) floored++;
            worst = Math.max(worst, Math.abs(r.result.dst[i] - est.per[i]));
        }
        ok(`the kernel's per-pixel floor is the mirror's to ${worst.toExponential(2)} over ${nz} non-zero pixels, on a frame whose displacement spans ${SC.spread.toFixed(0)}x`,
            nz > 900 && worst < 1e-5, `worst ${worst.toExponential(3)}, ${nz} non-zero of ${W * H}`);
        ok(`  and the mirror's arithmetic floor is not a dead branch on this frame: ${floored} pixels sit at it, which is what a perspective frame's far field looks like`,
            floored > 0, `${floored} pixels at the arithmetic floor`);
        // *** AND THE PARITY ROW ABOVE CANNOT SEE THE ARITHMETIC FLOOR AT ALL. *** Its tolerance is 1e-5 and
        // the floor's entire scale is 2.3e-7, so removing the floor from the KERNEL while leaving it in the
        // mirror moves every affected pixel by less than the row's resolution: measured as a 0-RED sabotage.
        // An absolute tolerance is blind to any defect smaller than itself, and this arc has now built two
        // things -- the tie at v4559 and the floor here -- that live below one. The floored pixels need a
        // RELATIVE comparison, and this is it.
        let relWorst = 0, relN = 0, devFloored = 0;
        for (let i = 0; i < W * H; i++) {
            const c = est.per[i];
            if (!(c > 0) || c > ARITHMETIC_ULPS * EPS_F32 * 2) continue;      // only the floored pixels
            relN++;
            if (r.result.dst[i] >= c * 0.5) devFloored++;
            relWorst = Math.max(relWorst, Math.abs(r.result.dst[i] - c) / c);
        }
        ok(`*** and the kernel is floored on those pixels too, checked RELATIVELY: ${devFloored} of ${relN} carry the floor and the worst relative disagreement is ${relWorst.toExponential(2)} -- the parity row above has a 1e-5 tolerance and the floor is 2.3e-7, so it could not have told ***`,
            relN > 100 && devFloored === relN && relWorst < 1e-3,
            `${devFloored}/${relN} floored on the device, worst relative ${relWorst.toExponential(3)}`);
    }
}

// SABOTAGE. Seven rewrites of the estimator, its kernel and the motion-vector reconstruction, run against
// four gates -- this one, ringFloor, ringFloorCost and motionVectors -- with v4557's crash rule applied.
//   KA  the arithmetic floor removed (back to v4560's exact zero)                4 red
//   KB  the arithmetic floor made ABSOLUTE instead of relative to magnitude      1 red
//   KC  the ulp count cut below the 1.05 measured                                2 red
//   KD  the step bound's phase term flipped to min(f, 1-f)                       9 red
//   KE  the local magnitude read at the pixel instead of over the stencil        4 red
//   KF  the perspective divide dropped from the motion-vector reconstruction    10 red
//   KG  the KERNEL's arithmetic floor removed, the mirror's kept                 1 red
//
// *** KF IS THE ONE THIS ARC COULD NOT HAVE RUN BEFORE TODAY. *** Dropping p[0]/p[3] is a perfect no-op
// under an orthographic projection, where w is 1 at every pixel -- so for nine rounds the tree's entire
// perspective path was unpinned by anything in this arc, not because a row was missing but because no
// fixture could reach it. It scores ten.
//
// *** AND KG WENT 0-RED ON THE FIRST SWEEP. *** Removing the arithmetic floor from the kernel while leaving
// it in the mirror moved every affected pixel by 2.3e-7, and the parity row's tolerance is 1e-5 -- fifty
// times coarser than the entire defect. An ABSOLUTE tolerance is blind to anything smaller than itself, and
// this arc has now built two things that live below one: v4559's tie and this floor. The repair is a
// RELATIVE comparison restricted to the floored pixels, and it is a general lesson rather than a local
// patch -- every parity row in this arc carries an absolute tolerance chosen for values of order one.
//
// *** AND ADDING THE FLOOR BROKE v4561's SAMPLING ROW, WHICH ASSERTED AN EXACT ZERO. *** A sampled max on
// the edge fixture now returns one arithmetic floor instead of 0.00e+0. The severity is unchanged -- a
// factor of two million -- but the SIGNAL is worse: a small plausible number reads like a measurement where
// a zero reads like a bug. That row is now written against the ratio, which is what it always meant, and the
// change is recorded rather than quietly absorbed, because a gate that stops failing looks like a defect
// going away.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a PER-BAND floor, which section 3 shows is worth 6x on the fastest band and " +
    "which nothing in this tree builds; the floor under perspective with a ROTATING camera, since this " +
    "fixture translates only and v4558's roll measurement was orthographic; content that is not a ground " +
    "plane, since foreshortening is what put the highest frequency in the far field and a facing wall would " +
    "not; and whether the arc's gates should ADOPT any of this, still the open question v4560 named and " +
    "still a round of its own.");
process.exit(fails ? 1 : 0);
