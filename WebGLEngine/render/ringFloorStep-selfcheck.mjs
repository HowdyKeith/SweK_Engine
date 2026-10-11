/**
 * THE STEP BRANCH, WHICH v4564 LOCATED AS THE WHOLE REMAINING GAP -- AND WHICH TURNED OUT TO BE UNSAFE.
 *
 * v4564 measured the step bound at 90x loose at the median on 41% of a perspective frame's pixels and named
 * tightening it as the next rung. *** IT DOES NOT TIGHTEN, AND THE REASON IS THAT IT WAS NOT A BOUND. ***
 *
 * max(f, 1-f) * step reads only the CURRENT frame's neighbourhood. On content where a high-contrast feature
 * has SWEPT PAST, a pixel is locally flat now and still carries that feature's reprojection error in the
 * ring: the bound sees a flat stencil, returns nearly nothing, and the error is large. Measured on this
 * arc's own edge fixture, the geometric step bound is BELOW the error actually present at 70-86% of
 * step-branch pixels -- and v4564 shipped that form as a per-pixel bound on the strength of one fixture, a
 * perspective ground plane, where it reads 0.03%.
 *
 * The ring is where the missing half lives, and it has been in the tree since v4553.
 */
import { makeLumaState, pushLuma, lumaMean, lumaMeanPrev, lumaInstability } from "./temporalLock.mjs";
import { ringFloorCPU } from "./ringFloor.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 32, H = 32, NEAR = 1, FAR = 10, HALF = 4, Z = 8, S = 2 * HALF / W, P = jitterPhaseCount(1);
const vp = (cx) => { const o = new Float32Array(16);
    o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1;
    const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; return mat4Multiply(o, t); };
const CONTENT = {
    chequer: (wx, wy) => ((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? 0.92 : 0.06,
    edge: (wx) => wx < 0.37 ? 0.06 : 0.92,
    finer: (wx, wy) => 0.5 + 0.45 * Math.sin(wx * 1.4) * Math.cos(wy * 1.1),
    smooth: (wx, wy) => 0.5 + 0.45 * Math.sin(wx * 0.35) * Math.cos(wy * 0.28),
};
const qt = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * p)];

/** One sweep, gathering every step-branch pixel-frame with its truth, its two candidate bounds and the max. */
function sweep(fn, phase) {
    const speed = phase * S, st = makeJitterState(1), lu = makeLumaState(W, H, P), offs = [];
    const rows = [], NF = 2 * P + 10;
    for (let f = 0; f < NF; f++) {
        const j = advanceJitter(st), cx = f * speed;
        const c = new Float32Array(W * H * 4), d = new Float32Array(W * H), L = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const k = y * W + x, o = k * 4;
            const v = fn((2 * ((x + 0.5) / W) - 1) * HALF + cx + j[0] * S, (1 - 2 * ((y + 0.5) / H)) * HALF + j[1] * S);
            c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[k] = (Z - NEAR) / (FAR - NEAR); L[k] = v;
        }
        const m = motionVectorsCPU(d, W, H, mat4Invert(vp(cx)), vp(cx - speed)).data;
        pushLuma(lu, { current: c, motion: m, w: W, h: H });
        offs.push(j);
        if (f < 2 * P + 2) continue;
        const truth = new Float32Array(W * H);
        for (const jj of offs.slice(-P)) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
            truth[y * W + x] += fn((2 * ((x + 0.5) / W) - 1) * HALF + cx + jj[0] * S, (1 - 2 * ((y + 0.5) / H)) * HALF + jj[1] * S) / P;
        const mean = lumaMean(lu), prev = lumaMeanPrev(lu), ins = lumaInstability(lu);
        // the composed bound the module now returns, and the geometry alone for comparison
        const both = ringFloorCPU(L, m, W, H, P, undefined, "window", lu);
        const geoOnly = ringFloorCPU(L, m, W, H, P, undefined, "window", { w: W, h: H, frames: 2 * P, period: P, ring: new Float32Array(W * H * 2 * P) });
        for (let i = 0; i < W * H; i++) {
            if (!both.regime[i] || lu.filled[i] < lu.frames) continue;
            const err = Math.abs(mean[i] - truth[i]); if (!(err > 0)) continue;
            rows.push({ err, geo: geoOnly.per[i], ring: Math.abs(mean[i] - prev[i]) + ins[i], max: both.per[i] });
        }
    }
    return rows;
}

console.log("ringFloorStep-selfcheck -- the step bound was not a bound, and the ring is the missing half\n");
console.log("1. *** THE GEOMETRIC STEP BOUND IS BELOW THE ERROR ON THE ARC'S OWN EDGE FIXTURE ***");
const R = {};
{
    report("content  phase   n     geometry     |  ring-measured  |  the max of both");
    report("                        median  under |  median  under  |  median  under");
    for (const [name, fn] of Object.entries(CONTENT)) for (const ph of [0.125, 0.5, 0.75]) {
        const rows = sweep(fn, ph);
        if (rows.length < 20) continue;
        const u = (k) => rows.filter((x) => x[k] < x.err).length / rows.length;
        const md = (k) => qt(rows.map((x) => x[k] / x.err), 0.5);
        R[`${name}:${ph}`] = { n: rows.length, gU: u("geo"), rU: u("ring"), mU: u("max"),
                               gM: md("geo"), rM: md("ring"), mM: md("max") };
        const r = R[`${name}:${ph}`];
        report(`${name.padEnd(8)} ${ph.toFixed(3)} ${String(r.n).padStart(5)}  ${r.gM.toFixed(1).padStart(7)}x ${(r.gU * 100).toFixed(1).padStart(5)}% | ${r.rM.toFixed(1).padStart(7)}x ${(r.rU * 100).toFixed(1).padStart(5)}% | ${r.mM.toFixed(1).padStart(7)}x ${(r.mU * 100).toFixed(1).padStart(5)}%`);
    }
    const edge = Object.entries(R).filter(([k]) => k.startsWith("edge:")).map(([, v]) => v);
    const cheq = Object.entries(R).filter(([k]) => k.startsWith("chequer:")).map(([, v]) => v);
    ok(`*** the geometric step bound is below the error actually present at ${(Math.min(...edge.map((e) => e.gU)) * 100).toFixed(0)}-${(Math.max(...edge.map((e) => e.gU)) * 100).toFixed(0)}% of step-branch pixels on the EDGE fixture -- it is not a bound, and v4564 shipped it as one on the strength of a single fixture where it reads 0.03% ***`,
        Math.min(...edge.map((e) => e.gU)) > 0.5, edge.map((e) => (e.gU * 100).toFixed(1) + "%").join(", "));
    ok(`*** and it is fine on the CHEQUER (${(Math.max(...cheq.map((c) => c.gU)) * 100).toFixed(2)}% under), which is why nothing caught it: the two contents fail the geometry in opposite ways and the arc has always had both ***`,
        Math.max(...cheq.map((c) => c.gU)) < 0.01, cheq.map((c) => (c.gU * 100).toFixed(2) + "%").join(", "));
    // *** WHY: THE ERROR IS IN THE HISTORY, NOT IN THE CURRENT NEIGHBOURHOOD. ***
    ok("  the reason is that the geometry reads only THIS frame's stencil: where a hard edge has swept past, a pixel is locally flat now and still carries that edge's reprojection error in the ring, so a flat stencil returns nearly nothing while the error is large",
        Math.min(...edge.map((e) => e.gM)) < 0.5, `edge geometry medians ${edge.map((e) => e.gM.toFixed(2) + "x").join(", ")} of the error`);
}

console.log("\n2. THE RING IS THE MISSING HALF, AND IT IS NOT A BOUND EITHER");
{
    const edge = Object.entries(R).filter(([k]) => k.startsWith("edge:")).map(([, v]) => v);
    const cheq = Object.entries(R).filter(([k]) => k.startsWith("chequer:")).map(([, v]) => v);
    // *** THE FIRST VERSION OF THIS ROW CALLED THE RING "a far better predictor" AND THE FIXTURE SET SAYS NO.
    // *** It is better on the contents where the geometry FAILS and far worse where the geometry works --
    // 1200-2256x on the two sinusoids against the geometry's 33-65x. That is not a weaker version of the
    // claim, it is the complementarity itself, and reading it as "better" would have been the same mistake
    // as reading the geometry as a bound from one fixture.
    const smooth2 = Object.entries(R).filter(([k]) => k.startsWith("smooth:") || k.startsWith("finer:")).map(([, v]) => v);
    ok(`*** neither signal dominates: on the EDGE the ring reads ${edge.map((e) => e.rM.toFixed(1)).join("/")}x where the geometry is unsafe, and on the two sinusoids it reads ${smooth2.map((v) => v.rM.toFixed(0)).join("/")}x where the geometry reads ${smooth2.map((v) => v.gM.toFixed(0)).join("/")}x ***`,
        Math.min(...smooth2.map((v) => v.rM / v.gM)) > 2 && Math.max(...edge.map((e) => e.gM)) < 0.5,
        `ring/geometry on the sinusoids: ${smooth2.map((v) => (v.rM / v.gM).toFixed(0) + "x").join(", ")}`);
    ok(`*** and it is UNSAFE alone, under by ${(Math.min(...cheq.map((c) => c.rU)) * 100).toFixed(1)}-${(Math.max(...cheq.map((c) => c.rU)) * 100).toFixed(1)}% on the chequer -- whose error is a persistent BIAS, and a difference between two periods cannot see a bias that sits in both ***`,
        Math.max(...cheq.map((c) => c.rU)) > 0.03, cheq.map((c) => (c.rU * 100).toFixed(1) + "%").join(", "));
    ok(`  so the two fail in different places by construction: the geometry misses what the history carries and the ring misses what does not change between periods -- ${(Math.max(...edge.map((e) => e.gU)) * 100).toFixed(0)}% and ${(Math.max(...cheq.map((c) => c.rU)) * 100).toFixed(0)}% respectively`,
        Math.max(...edge.map((e) => e.gU)) > 0.5 && Math.max(...cheq.map((c) => c.rU)) > 0.03,
        "neither is a bound alone, and neither is a refinement of the other");
}

console.log("\n3. *** THE MAX OF TWO BOUNDS THAT FAIL IN DIFFERENT PLACES ***");
{
    const all = Object.values(R);
    ok(`*** the max is under at ${(Math.max(...all.map((v) => v.mU)) * 100).toFixed(2)}% across ${all.length} content-and-phase combinations and ${all.reduce((a, v) => a + v.n, 0)} step-branch pixel-frames ***`,
        Math.max(...all.map((v) => v.mU)) === 0, `worst ${(Math.max(...all.map((v) => v.mU)) * 100).toFixed(3)}%`);
    ok(`  and it is not free: on the edge it is the ring's number and on the chequer the geometry's, so the composed bound is the LOOSER of the two everywhere and tightens nothing -- this round repairs, it does not tighten`,
        Object.entries(R).filter(([k]) => k.startsWith("chequer:")).every(([k, v]) => Math.abs(v.mM - v.gM) < v.gM * 0.01),
        "on the chequer the max is the geometry to within 1%");
    // *** AND SAYING SO PLAINLY, BECAUSE THE ROUND SET OUT TO DO THE OTHER THING. ***
    report("v4564 named tightening the step bound as this rung. It is not tightened: the geometry's 90x looseness on a perspective plane is untouched, because the max can only be larger. What changed is that it is now a bound at all.");
    ok("  and the frame form is untouched, so every frame-wide number v4560 through v4562 recorded still reads what it read",
        (() => { const L = new Float32Array(W * H).map((_, i) => Math.sin(i * 0.3));
                 const a = ringFloorCPU(L, null, W, H, P).worst;
                 return a === ringFloorCPU(L, null, W, H, P, undefined, "frame").worst && a > 0; })(),
        "the default path takes no ring and is the number it was");
}

console.log("\n4. THE PIECES, HELD TO WHAT THEY CLAIM");
{
    ok("*** the window form REFUSES to run without the ring rather than silently returning the half-bound v4564 shipped ***",
        (() => { try { ringFloorCPU(new Float32Array(W * H), null, W, H, P, undefined, "window"); return false; }
                 catch (e) { return /needs the ring state/.test(String(e.message)); } })(),
        "a per-pixel claim without the history it depends on is refused");
    // *** THE THREE RING READINGS ARE A SECOND COPY AND THIS ROW IS WHY THAT IS ALLOWED. ***
    // ringFloor.mjs cannot import temporalLock.mjs: temporalLock imports nothing from here and the arc keeps
    // that direction, so a cycle between the ring and the floor that bounds it is the alternative. The copy
    // is held to the original rather than trusted.
    ok("the module's private ring readings agree with temporalLock's exactly -- a second copy is only allowed because a row compares them",
        (() => {
            const st = makeLumaState(8, 8, P), c = new Float32Array(8 * 8 * 4);
            // *** A NON-ZERO MOTION, BECAUSE v4566 GATED THE RING TERM ON ONE. *** This row used a null
            // motion buffer, which made the ring term unreachable the moment the gate landed and turned the
            // row red -- correctly: with no displacement there is no reprojection to bound and the private
            // copy is not exercised at all. A quarter-texel in u keeps every pixel in bounds and fires it.
            const mv = new Float32Array(64 * 4);
            for (let i = 0; i < 64; i++) { mv[i * 4] = 0.25 / 8; mv[i * 4 + 2] = 1; }
            for (let f = 0; f < 2 * P; f++) {
                for (let i = 0; i < 64; i++) { const v = Math.sin(i * 0.7 + f * 0.4) * 0.5 + 0.5;
                    c[i * 4] = v; c[i * 4 + 1] = v; c[i * 4 + 2] = v; c[i * 4 + 3] = 1; }
                pushLuma(st, { current: c, motion: mv, w: 8, h: 8 });
            }
            // the composed floor on a flat luma field is exactly the ring term, so it exposes the private copy
            const flat = new Float32Array(64).fill(0.5);
            const mine = ringFloorCPU(flat, mv, 8, 8, P, undefined, "window", st).per;
            const theirs = (() => { const m = lumaMean(st), p = lumaMeanPrev(st), s = lumaInstability(st);
                return Array.from({ length: 64 }, (_, i) => Math.abs(m[i] - p[i]) + s[i]); })();
            let worst = 0;
            for (let y = 3; y < 5; y++) for (let x = 3; x < 5; x++) { const i = y * 8 + x;
                worst = Math.max(worst, Math.abs(mine[i] - theirs[i])); }
            return worst < 1e-6;
        })(),
        "lumaMean, lumaMeanPrev and lumaInstability, recomputed privately, match the exported ones");
    ok("  and a flat field is where that copy is visible at all: the geometric term is zero there, so whatever the floor returns is the ring term and nothing else",
        (() => { const st = makeLumaState(8, 8, P), c = new Float32Array(8 * 8 * 4).fill(0);
                 for (let i = 0; i < 64; i++) c[i * 4 + 3] = 1;
                 for (let f = 0; f < 2 * P; f++) pushLuma(st, { current: c, motion: null, w: 8, h: 8 });
                 const flat = new Float32Array(64).fill(0.5);
                 return ringFloorCPU(flat, null, 8, 8, P, undefined, "window", st).per[8 * 4 + 4] > 0; })(),
        "a flat field with a still ring still returns the arithmetic floor, not zero");
}

// SABOTAGE. Eight rewrites of the step branch and the private ring readings, run against six gates -- this
// one, ringFloorControl, ringFloorMargin, ringFloorPerspective, ringFloor and ringFloorCost -- with v4557's
// crash rule applied.
//   NA  the ring term dropped, back to v4564's geometry alone                    3 red
//   NB  the ring term applied on the RESOLVED branch too                         2 red
//   NC  the spread dropped, leaving only the period difference                   3 red
//   ND  the period difference dropped, leaving only the spread                   2 red
//   NE  the max becomes a MIN -- the tighter of two bounds, which is neither     6 red
//   NF  the ring requirement dropped, so the window form runs without history    2 red
//   NG  the private lumaMeanPrev reads the NEWER period, so the difference is 0  2 red
//   NH  the private spread divides by the ring depth rather than the period      2 red
//
// NC and ND are the pair worth reading together: each half of the ring term is load-bearing and they cover
// different failures. Without the spread the bound misses what the reprojection is still doing inside the
// newer period; without the difference it misses what it did between periods. Neither alone is what the
// edge fixture needs.
//
// *** AND THE COMPOSITION SHIPPED HERE IS THE SECOND ONE WRITTEN. *** The first added the ring term into
// BOTH axis terms, which double-counts a quantity the ring holds once per pixel rather than once per
// direction. It was safer than what replaced it and it was arithmetic nobody could justify. What caught it
// was the row comparing this module's private ring readings against temporalLock's exported ones on a flat
// field -- the one place the geometric term is zero and the ring term is therefore visible on its own. A
// second copy of three functions is only allowed because something compares it to the original, and here
// that row earned its place the first time it ran.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether the step bound can be TIGHTENED, which is what v4564 asked for and this " +
    "round did not deliver -- the max is looser than either half and the 90x on a perspective plane stands; " +
    "whether the ring term holds when the LIGHTING changes, since |newer - older| cannot tell a shading " +
    "change from a reprojection error and every fixture here is statically lit; the composed bound on the " +
    "DEVICE, whose kernel still carries the geometry alone and is now a different function from the mirror; " +
    "and whether any of this should be ADOPTED, still open since v4560.");
process.exit(fails ? 1 : 0);
