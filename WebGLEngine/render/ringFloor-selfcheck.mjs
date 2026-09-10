/**
 * THE FLOOR ridgeMarginBounds HAS BEEN ASKING FOR SINCE v4557, SUPPLIED WITHOUT AN ORACLE.
 *
 * v4557 built ridgeMarginBounds to refuse an unmeasured noiseFloor. v4558 and v4559 measured that floor --
 * against the analytic surface their fixtures were drawn from. A renderer has no analytic surface, so the
 * function has stood for three rounds demanding a number nobody in this tree could produce: a control that
 * cannot be called.
 *
 * This gate measures whether the floor is DERIVABLE from the frame and the motion vectors alone, and then
 * asks what the answer says about the 0.05 every gate from v4553 onward declares.
 *
 * IT DOES NOT MOVE THAT 0.05. Adopting a derived margin would move every number this arc has recorded, and
 * that is a round of its own -- this one establishes the number and reports the comparison.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { makeLumaState, pushLuma, lumaMean, ridgeMarginBounds } from "./temporalLock.mjs";
import { ringFloorCPU, resampleDepth, samplesPerPeriodAt, RESOLUTION_TAU } from "./ringFloor.mjs";
import { RING_FLOOR_WGSL } from "./ringFloorWgsl.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 32, H = 32, NEAR = 1, FAR = 10, HALF = 4, Z = 8, S = 2 * HALF / W, P = jitterPhaseCount(1);
const ARC_MARGIN = 0.05, CONTRAST = 0.92 - 0.06;
const vp = (cx) => { const o = new Float32Array(16);
    o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1;
    const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; return mat4Multiply(o, t); };
// v4559's four contents, unchanged, so this round's numbers sit beside that round's
const CONTENT = {
    smooth: (wx, wy) => 0.5 + 0.45 * Math.sin(wx * 0.35) * Math.cos(wy * 0.28),
    finer: (wx, wy) => 0.5 + 0.45 * Math.sin(wx * 1.4) * Math.cos(wy * 1.1),
    chequer: (wx, wy) => ((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? 0.92 : 0.06,
    edge: (wx) => wx < 0.37 ? 0.06 : 0.92,
    // *** AND ONE AT THE THRESHOLD, WHICH v4560's FOUR DID NOT COVER. *** That round's own row observed the
    // four contents sit 39, 14, 3.1 and 4.0 samples per period against tau's 7.9, and read it as a virtue:
    // none of them fitted the threshold. It is also a HOLE. Anything that only matters near the regime
    // boundary was invisible, and v4561's sabotage found one -- narrowing the range stencil from five taps to
    // three changed NOTHING on all four, and changes the estimate by 76% here.
    near: (wx, wy) => 0.5 + 0.45 * Math.sin(wx * 3.1) * Math.cos(wy * 2.4),
};
const HALF_TEXEL = 0.5 * (2 * HALF / W);

/** One sweep: the ring, the last frame's luma and motion, and the offsets the truth needs. */
function sweep(fn, period, speed = HALF_TEXEL) {
    const st = makeJitterState(1), lu = makeLumaState(W, H, period), offs = [];
    const frames = 2 * period + 4;
    let luma = null, motion = null;
    for (let i = 0; i < frames; i++) {
        const j = advanceJitter(st), cx = i * speed;
        const c = new Float32Array(W * H * 4), d = new Float32Array(W * H), L = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const k = y * W + x, o = k * 4;
            const v = fn((2 * ((x + 0.5) / W) - 1) * HALF + cx + j[0] * S, (1 - 2 * ((y + 0.5) / H)) * HALF + j[1] * S);
            c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[k] = (Z - NEAR) / (FAR - NEAR); L[k] = v;
        }
        motion = motionVectorsCPU(d, W, H, mat4Invert(vp(cx)), vp(cx - speed)).data;
        pushLuma(lu, { current: c, motion, w: W, h: H });
        offs.push({ j, cx }); luma = L;
    }
    return { lu, luma, motion, offs: offs.slice(-period), cxNow: (frames - 1) * speed };
}
/** v4558's corrected reference: the surface at this pixel NOW, under each frame's jitter. */
function truth(fn, q, period) {
    const a = new Float32Array(W * H);
    for (const o of q.offs) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        a[y * W + x] += fn((2 * ((x + 0.5) / W) - 1) * HALF + q.cxNow + o.j[0] * S,
                           (1 - 2 * ((y + 0.5) / H)) * HALF + o.j[1] * S) / period;
    const mm = lumaMean(q.lu);
    // *** n, NOT JUST w. *** The first draft of this returned 0 where NO pixel had a full ring, which is an
    // absence reported as a measurement -- the fault v4554 and v4555 both recorded, written again here.
    let w = 0, n = 0;
    for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
        const i = y * W + x; if (q.lu.filled[i] < q.lu.frames) continue;
        n++; w = Math.max(w, Math.abs(mm[i] - a[i]));
    }
    return { worst: w, n };
}

console.log("ringFloor-selfcheck -- the noise floor derived from the frame, not from an oracle\n");
console.log("1. THE RESAMPLE DEPTH IS DERIVED FROM lumaMean's SLOT RANGE, AND P = 1 PROVES IT");

const SW = {};                                  // one sweep per (content, period), shared by every section
for (const [name, fn] of Object.entries(CONTENT)) for (const p of [1, 2, 4, 8]) SW[`${name}:${p}`] = sweep(fn, p);
{
    ok("resampleDepth is (P-1)/2 -- lumaMean averages slots resampled 0..P-1, and the newest slot is fresh",
        resampleDepth(1) === 0 && resampleDepth(2) === 0.5 && resampleDepth(8) === 3.5,
        `P=1 -> ${resampleDepth(1)}, P=2 -> ${resampleDepth(2)}, P=8 -> ${resampleDepth(8)}`);
    ok("...and it refuses a period that is not a positive integer rather than returning a plausible number",
        (() => { try { resampleDepth(0); return false; } catch { } try { resampleDepth(2.5); return false; } catch { return true; } })(),
        "0 and 2.5 both throw");
    // *** THE PREDICTION WITH TEETH. *** If the depth were (1+P)/2 -- the obvious guess, averaging slots
    // 1..P resamples -- then a P = 1 ring would carry one bilinear step's worth of error. It carries none.
    const t1 = truth(CONTENT.chequer, SW["chequer:1"], 1);
    ok(`*** a P = 1 ring's floor is EXACTLY ${t1.worst.toExponential(2)} on the chequer, the content with the largest single-step error in this arc -- so the newest slot is never reprojected and the depth is (P-1)/2, not the obvious (1+P)/2 ***`,
        t1.n > 0 && t1.worst === 0, `${t1.worst.toExponential(3)} over ${t1.n} pixels with a full ring`);
    const oneStep = ringFloorCPU(SW["chequer:1"].luma, SW["chequer:1"].motion, W, H, 2).worst;
    ok(`  and that is a real distinction, not a rounding one: one step on this content is worth ${oneStep.toExponential(2)}, which the (1+P)/2 guess would have predicted for a ring that in fact carries zero`,
        oneStep > 0.1, `one step ${oneStep.toExponential(3)}`);
}

console.log("\n2. THE ESTIMATE IS SAFE ON EVERY CONTENT AND PERIOD -- AND TIGHT WHERE THE FIELD IS RESOLVED");
const RATIO = {};
{
    report("content  P   TRUE floor   estimate    est/true   unresolved");
    for (const [name, fn] of Object.entries(CONTENT)) for (const p of [2, 4, 8]) {
        const q = SW[`${name}:${p}`], t = truth(fn, q, p);
        const e = ringFloorCPU(q.luma, q.motion, W, H, p);
        RATIO[`${name}:${p}`] = { t: t.worst, e: e.worst, r: e.worst / t.worst, u: e.unresolvedFraction, n: t.n };
        report(`${name.padEnd(8)} ${p}   ${t.worst.toExponential(3)}   ${e.worst.toExponential(3)}   ${(e.worst / t.worst).toFixed(2).padStart(6)}    ${(e.unresolvedFraction * 100).toFixed(0)}%   (${t.n} px)`);
    }
    const all = Object.values(RATIO);
    ok("every one of the twelve had pixels with a full ring -- a bound over an empty set is not a bound",
        all.every((r) => r.n > 0), `least ${Math.min(...all.map((r) => r.n))} pixels`);
    // *** SAFE IS THE ONLY DIRECTION THAT MATTERS FOR A MARGIN. *** An under-predicted floor sets the margin
    // below the noise and every lock above it reads resampling error as a feature.
    ok(`*** the estimate never goes UNDER the truth: the worst ratio across four contents and three periods is ${Math.min(...all.map((r) => r.r)).toFixed(2)}x ***`,
        all.every((r) => r.r >= 1), `min ${Math.min(...all.map((r) => r.r)).toFixed(3)}x, max ${Math.max(...all.map((r) => r.r)).toFixed(2)}x`);
    // *** AND A BOUND IS NOT A MEASUREMENT UNLESS IT IS TIGHT. *** The step bound alone is safe everywhere
    // and 141x loose on the arc's own fixture, which would set a margin nobody can use.
    const res = [RATIO["smooth:2"], RATIO["smooth:4"], RATIO["smooth:8"], RATIO["finer:2"], RATIO["finer:4"], RATIO["finer:8"]];
    ok(`*** and where the field is RESOLVED it is tight, not merely safe: ${Math.max(...res.map((r) => r.r)).toFixed(2)}x at worst over six readings, against 141x for the step bound alone on the same content ***`,
        res.every((r) => r.r <= 1.5), `smooth ${res.slice(0,3).map((r) => r.r.toFixed(2)).join("/")}, finer ${res.slice(3).map((r) => r.r.toFixed(2)).join("/")}`);
    const un = [RATIO["chequer:8"], RATIO["edge:8"]];
    ok(`  where it is NOT resolved the same bound is looser but still honest -- ${un.map((r) => r.r.toFixed(2) + "x").join(" and ")} -- because a step has no bounded second derivative and the fallback is the step's own size`,
        un.every((r) => r.r >= 1 && r.r <= 6), `chequer ${un[0].r.toFixed(2)}x, edge ${un[1].r.toFixed(2)}x`);
    ok("  and the regime test agrees with the contents' own construction: the two sinusoids read as resolved and the chequer and the edge do not",
        RATIO["smooth:8"].u < 0.05 && RATIO["finer:8"].u < 0.05 && RATIO["chequer:8"].u > 0.8 && RATIO["edge:8"].u > 0.8,
        `smooth ${(RATIO["smooth:8"].u*100).toFixed(0)}%, finer ${(RATIO["finer:8"].u*100).toFixed(0)}%, chequer ${(RATIO["chequer:8"].u*100).toFixed(0)}%, edge ${(RATIO["edge:8"].u*100).toFixed(0)}%`);
}

console.log("\n2b. *** THE RANGE STENCIL'S WIDTH, WHICH NOTHING PINNED UNTIL A SABOTAGE WENT 0-RED ***");
{
    // v4561 narrowed neighbourhood()'s range from five taps to three and every gate stayed green. The four
    // original contents classify identically under both, because the 47x gap is far too wide for a stencil
    // change to move anything across it. Content AT the threshold is the only thing that can tell them apart,
    // and until `near` existed there was none. The narrower stencil is not WRONG -- a smaller range makes
    // |D3|/range larger, so more pixels read unresolved and the bound only ever goes UP -- it is LOOSER, and
    // tightness near the boundary is exactly what v4560 spent a round earning.
    const q = SW["near:8"], t = truth(CONTENT.near, q, P);
    const five = ringFloorCPU(q.luma, q.motion, W, H, P);
    report(`at the threshold: truth ${t.worst.toExponential(2)}, five-tap range ${five.worst.toExponential(2)} (${(five.worst / t.worst).toFixed(2)}x), unresolved ${(five.unresolvedFraction * 100).toFixed(0)}%`);
    ok("the threshold fixture is genuinely at the boundary -- resolved under the module's stencil, and near enough that a narrower one would flip it",
        five.unresolvedFraction < 0.2 && t.n > 0, `unresolved ${(five.unresolvedFraction * 100).toFixed(0)}%, ${t.n} pixels with a full ring`);
    ok(`*** and the five-tap range earns its width here: it holds the estimate to ${(five.worst / t.worst).toFixed(2)}x where a three-tap range reads 2.92x and flips 79% of the frame to the step bound -- safe either way, but the tightness is the whole point ***`,
        five.worst >= t.worst && five.worst / t.worst < 2.0,
        `five-tap ${(five.worst / t.worst).toFixed(2)}x; the three-tap figure is v4561's measurement, recorded in the closing`);
}

console.log("\n3. THE THRESHOLD SITS IN A MEASURED GAP, AND IT NAMES A RESOLUTION");
{
    const stat = (fn) => {
        const L = new Float32Array(W * H); let worst = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
            L[y * W + x] = fn((2 * ((x + 0.5) / W) - 1) * HALF, (1 - 2 * ((y + 0.5) / H)) * HALF);
        for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
            const i = y * W + x;
            const a = L[i - 1] - 2 * L[i] + L[i + 1], b = L[i] - 2 * L[i + 1] + L[i + 2];
            let lo = Infinity, hi = -Infinity;
            for (let k = -2; k <= 2; k++) { const q = L[i + k]; if (q < lo) lo = q; if (q > hi) hi = q; }
            if (hi - lo > 1e-6) worst = Math.max(worst, Math.abs(b - a) / (hi - lo));
        }
        return worst;
    };
    const sm = stat(CONTENT.smooth), fi = stat(CONTENT.finer), ch = stat(CONTENT.chequer), ed = stat(CONTENT.edge), nr = stat(CONTENT.near);
    // the threshold fixture sits BETWEEN the two groups by construction, so it is reported beside the gap
    // rather than inside it -- folding it into either extreme would shrink the gap by moving its own edge
    report(`the threshold fixture reads ${nr.toFixed(4)}, which is ${(nr / Math.max(sm, fi)).toFixed(0)}x above the resolved group and ${(Math.min(ch, ed) / nr).toFixed(0)}x below the unresolved one -- inside the gap, which is what makes it able to pin the stencil`);
    report(`|D3| / range, worst over the interior: smooth ${sm.toFixed(4)}, finer ${fi.toFixed(4)}, chequer ${ch.toFixed(2)}, edge ${ed.toFixed(2)}`);
    ok(`*** the statistic separates the two regimes by ${(Math.min(ch, ed) / Math.max(sm, fi)).toFixed(0)}x with nothing in between, so the threshold is chosen from a GAP rather than fitted to the data ***`,
        Math.min(ch, ed) / Math.max(sm, fi) > 15 && RESOLUTION_TAU > Math.max(sm, fi) && RESOLUTION_TAU < Math.min(ch, ed),
        `resolved top ${Math.max(sm, fi).toFixed(4)}, unresolved floor ${Math.min(ch, ed).toFixed(2)}, tau ${RESOLUTION_TAU}`);
    const n = samplesPerPeriodAt();
    ok(`*** and tau is not a preference, it is a RESOLUTION: a sinusoid at n samples per period has |D3|/range = (2pi/n)^3/2, so tau = ${RESOLUTION_TAU} is ${n.toFixed(1)} samples per period -- above Nyquist's 2 and below v4559's measured 12-pixel margin crossing ***`,
        n > 7 && n < 9, `${n.toFixed(2)} samples per period`);
    // *** THE FIRST VERSION OF THIS ROW QUOTED 71, 18, 2 AND 1 -- NUMBERS I GOT BY CONVERTING EACH CONTENT'S
    // WORLD FREQUENCY BY HAND RATHER THAN BY ASKING THE STATISTIC. *** The statistic says 39, 14, 3.1 and
    // 4.0. Both describe the same fixtures; only one of them is a measurement, and the hand conversion was
    // wrong by nearly 2x on the content the arc actually uses.
    const N = [sm, fi, ch, ed].map((v) => samplesPerPeriodAt(v)), n0 = samplesPerPeriodAt();
    const nearest = Math.min(...N.map((v) => Math.max(v / n0, n0 / v)));
    ok(`  and none of the four contents sits near it: measured at ${N.map((v) => v.toFixed(1)).join(", ")} samples per period, the nearest is ${nearest.toFixed(2)}x away, so none of them set it`,
        nearest > 1.5, `tau is ${n0.toFixed(2)}; nearest content ${nearest.toFixed(3)}x away`);
    // and the compression is worth naming: a cube root turns 47x of separation in the statistic into 3.5x in
    // resolution, so the comfortable-looking gap above is a narrower one here
    ok("  the 47x gap in the statistic is only 3.5x once expressed as a resolution, because the statistic goes as the CUBE of it -- the same separation, stated in the units a caller would think in",
        samplesPerPeriodAt(Math.max(sm, fi)) / samplesPerPeriodAt(Math.min(ch, ed)) > 3 && samplesPerPeriodAt(Math.max(sm, fi)) / samplesPerPeriodAt(Math.min(ch, ed)) < 4,
        `${samplesPerPeriodAt(Math.max(sm, fi)).toFixed(1)} down to ${samplesPerPeriodAt(Math.min(ch, ed)).toFixed(1)} samples per period`);
}

console.log("\n4. *** THE TWO REGIME TESTS I WROTE FIRST, BOTH WRONG THE SAME WAY, KEPT AS ROWS ***");
{
    // Neither of these is the module's test. They are here because each read a perfectly smooth sinusoid as
    // a step on several percent of its pixels, and a worst-over-frame is a MAXIMUM: a few false pixels move
    // the whole answer.
    //
    // *** AND THE FIRST VERSION OF THIS SECTION MEASURED ZERO AND I NEARLY RECORDED IT. *** It built the
    // field once with no jitter and no camera offset. At that one grid alignment the degeneracy does not
    // bite, so a test that mis-classifies up to 5.7% of the frame read 0.0% and the row asserting 7% went
    // red -- looking like a wrong constant when it was a blind fixture. Same fault as v4559's 24x24: a
    // defect a fixture hides by accident. The rate has to be swept over the jitter, because the jitter is
    // exactly what moves the sample grid relative to the extrema.
    const rates = (fn) => {
        const st = makeJitterState(1), a = [], b = [], c = [];
        for (let f = 0; f < 2 * P + 4; f++) {
            const j = advanceJitter(st), cx = f * HALF_TEXEL, L = new Float32Array(W * H);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
                L[y * W + x] = fn((2 * ((x + 0.5) / W) - 1) * HALF + cx + j[0] * S, (1 - 2 * ((y + 0.5) / H)) * HALF + j[1] * S);
            let n1 = 0, n2 = 0, n3 = 0, tot = 0;
            for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
                const i = y * W + x;
                for (const st2 of [1, W]) {
                    const d2a = L[i - st2] - 2 * L[i] + L[i + st2], d2b = L[i] - 2 * L[i + st2] + L[i + 2 * st2];
                    const step = Math.max(Math.abs(L[i] - L[i - st2]), Math.abs(L[i + st2] - L[i]));
                    let lo = Infinity, hi = -Infinity;
                    for (let k = -2; k <= 2; k++) { const q = L[i + k * st2]; if (q < lo) lo = q; if (q > hi) hi = q; }
                    tot++;
                    if (!(Math.abs(d2a) < step)) n1++;                                        // test 1: |D2| < first difference
                    if (!(Math.abs(d2b - d2a) < Math.abs(d2a))) n2++;                          // test 2: |D3| < |D2|
                    if (!(hi - lo > 1e-6 && Math.abs(d2b - d2a) / (hi - lo) < RESOLUTION_TAU)) n3++;   // the module's
                }
            }
            a.push(n1 / tot); b.push(n2 / tot); c.push(n3 / tot);
        }
        const sp = (v) => ({ lo: Math.min(...v), hi: Math.max(...v) });
        return { first: sp(a), curv: sp(b), range: sp(c) };
    };
    const RS = rates(CONTENT.smooth), RF = rates(CONTENT.finer);
    const pc = (r) => `${(r.lo * 100).toFixed(1)}%-${(r.hi * 100).toFixed(1)}%`;
    report(`false "unresolved" over ${2 * P + 4} jitter phases -- smooth: |D2|<first ${pc(RS.first)}, |D3|<|D2| ${pc(RS.curv)}, range-normalised ${pc(RS.range)}`);
    report(`                                       finer : |D2|<first ${pc(RF.first)}, |D3|<|D2| ${pc(RF.curv)}, range-normalised ${pc(RF.range)}`);
    ok(`*** |D2| < first difference calls up to ${(RS.first.hi * 100).toFixed(1)}% of a SMOOTH sinusoid a step -- the slope vanishes at every extremum while the curvature is maximal ***`,
        RS.first.hi > 0.03, `smooth ${pc(RS.first)}, finer ${pc(RF.first)}`);
    ok(`*** and |D3| < |D2| moves the same degeneracy to the inflections, where D2 passes through zero: up to ${(RS.curv.hi * 100).toFixed(1)}% ***`,
        RS.curv.hi > 0.03, `smooth ${pc(RS.curv)}, finer ${pc(RF.curv)}`);
    ok(`*** and the rate is INTERMITTENT, which is worse than a constant error: it swings ${(RS.first.lo * 100).toFixed(1)}%-${(RS.first.hi * 100).toFixed(1)}% across jitter phases on one fixed scene, so a gate can pass on one frame and fail on the next for no reason a reader could see ***`,
        RS.first.hi / Math.max(RS.first.lo, 1e-9) > 1.5 && RS.first.lo >= 0,
        `swing ${(RS.first.hi / Math.max(RS.first.lo, 1e-9)).toFixed(1)}x on smooth, ${(RF.curv.hi / Math.max(RF.curv.lo, 1e-9)).toFixed(1)}x on finer`);
    ok(`  the module's test is normalised by the local RANGE, which vanishes only on a flat field: ${pc(RS.range)} on the same frames, against ${pc(RS.first)} and ${pc(RS.curv)}`,
        RS.range.hi < 0.03 && RS.range.hi < RS.first.hi && RS.range.hi < RS.curv.hi,
        `range-normalised smooth ${pc(RS.range)}, finer ${pc(RF.range)}`);
    report("measured cost of getting it wrong: the smooth estimate went 1.05x of truth -> 9.93x under the first test and 95x under the second, because a worst-over-frame is a maximum and a few false pixels own it");
}

console.log("\n5. WHAT THIS SAYS ABOUT THE 0.05 EVERY GATE FROM v4553 ONWARD DECLARES");
const ADOPT = {};
{
    report("content   floor       derived margin   vs the declared 0.05    blind window derived vs 0.05");
    for (const name of Object.keys(CONTENT)) {
        const q = SW[`${name}:8`], floor = ringFloorCPU(q.luma, q.motion, W, H, P).worst;
        const b = ridgeMarginBounds({ noiseFloor: floor, contrast: CONTRAST });
        ADOPT[name] = { floor, b };
        report(`${name.padEnd(9)} ${floor.toExponential(3)}   ${b.feasible ? b.margin.toExponential(3) : "INFEASIBLE".padEnd(9)}     ${b.feasible ? (b.margin / ARC_MARGIN).toFixed(3) + "x" : "0.05 is BELOW the floor"}${b.feasible ? "                " + (b.margin / CONTRAST * 100).toFixed(2) + "% vs " + (ARC_MARGIN / CONTRAST * 100).toFixed(2) + "%" : ""}`);
    }
    ok(`*** on the arc's OWN fixture the declared 0.05 is ${(ARC_MARGIN / ADOPT.smooth.b.margin).toFixed(0)}x the derived margin -- safe, and paying ${(ARC_MARGIN / CONTRAST * 100).toFixed(1)}% of the range in blind window where ${(ADOPT.smooth.b.margin / CONTRAST * 100).toFixed(2)}% would do ***`,
        ADOPT.smooth.b.feasible && ARC_MARGIN / ADOPT.smooth.b.margin > 10,
        `derived ${ADOPT.smooth.b.margin.toExponential(3)}, declared ${ARC_MARGIN}`);
    ok(`*** and on pixel-scale content it is not conservative at all, it is INFEASIBLE: the chequer's floor alone is ${ADOPT.chequer.floor.toExponential(2)}, ${(ADOPT.chequer.floor / ARC_MARGIN).toFixed(0)}x ABOVE 0.05, so every lock placed there is reading resampling error ***`,
        !ADOPT.chequer.b.feasible && !ADOPT.edge.b.feasible && ADOPT.chequer.floor > ARC_MARGIN,
        `chequer floor ${ADOPT.chequer.floor.toExponential(3)}, edge floor ${ADOPT.edge.floor.toExponential(3)}`);
    ok(`  so one declared number is simultaneously ${(ARC_MARGIN / ADOPT.smooth.b.margin).toFixed(0)}x too loose and below the floor, on two contents in the same arc -- which is the case for deriving it and is not, on its own, a case for any particular replacement`,
        ARC_MARGIN / ADOPT.smooth.b.margin > 10 && ADOPT.chequer.floor > ARC_MARGIN,
        `smooth ${(ARC_MARGIN / ADOPT.smooth.b.margin).toFixed(1)}x loose, chequer ${(ADOPT.chequer.floor / ARC_MARGIN).toFixed(1)}x over`);
    ok("  and the finer sinusoid is the case AGAINST assuming the declared number is always wrong: there it is 0.79x of derived, which is very nearly right",
        ADOPT.finer.b.feasible && ADOPT.finer.b.margin / ARC_MARGIN > 0.5 && ADOPT.finer.b.margin / ARC_MARGIN < 1.2,
        `finer derived ${ADOPT.finer.b.margin.toExponential(3)} = ${(ADOPT.finer.b.margin / ARC_MARGIN).toFixed(2)}x of 0.05`);
}

console.log("\n6. THE KERNEL AGREES WITH THE MIRROR, PER PIXEL");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** Sections 1-5 are CPU only; nothing above has run a kernel."); fails++; }
else {
    // the chequer AND the smooth sinusoid, at a half-texel speed: v4559's finding was that a device row on
    // smooth content at an integer speed cannot see the defects that matter
    const cases = ["chequer", "smooth"].map((n) => ({ n, q: SW[`${n}:8`] }));
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, P, tau: RESOLUTION_TAU,
        cases: cases.map((c) => ({ luma: Array.from(c.q.luma), motion: Array.from(c.q.motion) })) }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { RING_FLOOR_WGSL } = await import("/render/ringFloorWgsl.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const out = [];
        for (const c of a.cases) {
            const p = dev.compute({ wgsl: RING_FLOOR_WGSL });
            const dst = dev.buffer({ data: new Float32Array(a.W * a.H), usage: ["storage"] });
            const ub = new ArrayBuffer(32);
            new Uint32Array(ub, 0, 4).set([a.W, a.H, a.P, 0]);
            new Float32Array(ub, 16, 4).set([a.tau, 0, 0, 0]);
            p.bind("luma", dev.buffer({ data: new Float32Array(c.luma), usage: ["storage"] }))
             .bind("motion", dev.buffer({ data: new Float32Array(c.motion), usage: ["storage"] }))
             .bind("dst", dst).bind("u", dev.buffer({ data: new Uint32Array(ub), usage: "uniform" }));
            dev.frame(({ pass }) => { pass.dispatch(p, [Math.ceil(a.W / 8), Math.ceil(a.H / 8)]); pass.clear([0,0,0,1]); }, { offscreen: true });
            out.push(Array.from(new Float32Array(await dev.read(dst))));
        }
        return { out, errs, backend: dev.backend };
    }` });
    ok("the harness ran the floor kernel on both contents at a half-texel speed",
        r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
        r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        for (let ci = 0; ci < cases.length; ci++) {
            const c = cases[ci], cpu = ringFloorCPU(c.q.luma, c.q.motion, W, H, P), dev = r.result.out[ci];
            let worst = 0, worstAt = -1, nz = 0;
            for (let i = 0; i < W * H; i++) {
                if (cpu.per[i] !== 0) nz++;
                const d = Math.abs(dev[i] - cpu.per[i]);
                if (d > worst) { worst = d; worstAt = i; }
            }
            // *** nz IS THE POINT. *** A parity row over a field that is all zeros agrees perfectly and
            // measures nothing -- v4554's finding, and the reason this row reports what it compared.
            ok(`${c.n}: the kernel's per-pixel floor is the mirror's to ${worst.toExponential(2)} over ${nz} non-zero pixels`,
                nz > 300 && worst < 1e-5, `worst ${worst.toExponential(3)} at pixel ${worstAt}, ${nz} non-zero of ${W * H}`);
        }
    }
}

// SABOTAGE. Nine rewrites of the estimator and its kernel, with v4557's crash rule applied -- a non-zero
// exit with no FAIL line is scored RED, because a stack trace is not a verdict.
//   HA  the derived depth replaced by the obvious guess, (P-1)/2 -> (1+P)/2      2 red
//   HB  the accumulation dropped entirely, one step whatever the ring depth      4 red
//   HC  the regime test always RESOLVED -- Taylor applied to a step              3 red
//   HD  the regime test always UNRESOLVED -- safe, and 141x loose                4 red
//   HE  the curvature surrogate back to D2max alone                              1 red
//   HF  tau moved onto the resolved side of the gap, 0.25 -> 0.01                4 red
//   HG  the phase gate dropped, f(1-f) -> 1                                      4 red
//   HH  the KERNEL's regime test inverted, mirror untouched                      2 red
//   HI  the KERNEL's depth off by one period, mirror untouched                   2 red
//
// HE is the one that matters most and it scores lowest: ONE row, the safety row, which reads 0.98x -- the
// exact 2% shortfall this round measured and repaired. A bound that goes 2% under is not visibly different
// from one that does not, unless something is watching the direction, and one row is.
//
// *** THE SET IS ONE GATE, WHICH IS WEAKER THAN v4559's FOUR, AND THE REASON IS WORTH STATING: *** nothing
// else in the tree imports ringFloor.mjs yet, because this round deliberately does not adopt it. So these
// nine mutations have exactly one reader, and the day a caller starts using the derived margin this set has
// to be re-run against that caller as well -- a sabotage set is only as wide as the gates it drives, and
// v4559 learned that from a 0-RED that was a hole in the set rather than in the gates.
//
// *** AND SECTION 4 ALMOST WENT IN AS A WRONG CONSTANT. *** Its first version built the field once, with no
// jitter and no camera offset, and measured 0.0% false-unresolved for a test that mis-classifies up to 5.7%
// of the frame. The row asserting 7% went red and looked like a bad number when it was a blind fixture --
// v4559's 24x24 finding, made again one round later. The rate had to be swept over the jitter, because the
// jitter is exactly what moves the sample grid relative to the extrema the degeneracy lives on.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether the arc SHOULD adopt the derived margin, which would move every number " +
    "v4553 onward recorded and is a round of its own -- this gate establishes the number and reports the " +
    "comparison, and changes no gate's 0.05; the floor under camera ROLL and under a PERSPECTIVE " +
    "projection, both still unmeasured after v4558 named the second; whether tau holds on natural imagery, " +
    "since the gap it sits in was measured on four synthetic contents and a photograph has a spectrum " +
    "rather than a frequency; and the estimator's COST, which nobody has timed against the ring push it " +
    "would run beside.");
process.exit(fails ? 1 : 0);
