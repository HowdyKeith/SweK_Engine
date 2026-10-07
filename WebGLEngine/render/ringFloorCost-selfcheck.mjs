/**
 * WHAT THE DERIVED FLOOR COSTS, AND WHAT THE ARC'S DEVICE ROWS HAVE ACTUALLY BEEN RUNNING ON.
 *
 * v4560 derived the ring's noise floor from the frame and left one thing unmeasured, in its own words: "the
 * estimator's COST, which nobody has timed against the ring push it would run beside". A floor estimate that
 * doubles the frame's compute is not adoptable however correct it is.
 *
 * *** TIMINGS ARE MACHINE-DEPENDENT AND THIS TREE ALREADY SAYS SO. *** tools/ship/meshPerf-selfcheck.mjs:
 * "asserting a speed threshold would be a flaky gate". sweep-timings.json's own note records that this box
 * moves 12-36% between hours. So nothing here asserts a duration. What is asserted is a RATIO taken in one
 * process with the two subjects INTERLEAVED, so the drift is common to both -- and, before the ratio is used
 * for anything, the ratio's own spread is measured, because a number whose error bar nobody looked at is not
 * a measurement either.
 *
 * *** AND THE RATIO IS COMPARED AGAINST A PREDICTION FROM OP COUNTS, NOT AGAINST A NUMBER I LIKE. *** A
 * threshold picked to pass is a declared number wearing a measurement's clothes; the op-count prediction is
 * derived from what the two functions actually do, and the interesting result is the size of the gap.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { SOFTWARE_HINTS } from "../ui/localModelProbe.js";
import { makeLumaState, pushLuma, luma, nearestTexel } from "./temporalLock.mjs";
import { makeLumaSums, pushLumaSums } from "./temporalLockSums.mjs";
import { ringFloorCPU } from "./ringFloor.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { jitterPhaseCount } from "./jitter.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const P = jitterPhaseCount(1), NEAR = 1, FAR = 10, HALF = 4, Z = 8;
const vp = (cx) => { const o = new Float32Array(16);
    o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1;
    const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; return mat4Multiply(o, t); };
const CONTENT = {
    smooth: (wx, wy) => 0.5 + 0.45 * Math.sin(wx * 0.35) * Math.cos(wy * 0.28),
    finer: (wx, wy) => 0.5 + 0.45 * Math.sin(wx * 1.4) * Math.cos(wy * 1.1),
    chequer: (wx, wy) => ((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? 0.92 : 0.06,
    edge: (wx) => wx < 0.37 ? 0.06 : 0.92,
};
function fixture(W, H, fn) {
    const c = new Float32Array(W * H * 4), d = new Float32Array(W * H), L = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, o = i * 4;
        const v = fn((2 * ((x + 0.5) / W) - 1) * HALF, (1 - 2 * ((y + 0.5) / H)) * HALF);
        c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[i] = (Z - NEAR) / (FAR - NEAR); L[i] = v;
    }
    const speed = 0.5 * (2 * HALF / W);
    return { c, m: motionVectorsCPU(d, W, H, mat4Invert(vp(0)), vp(-speed)).data, L, st: makeLumaState(W, H, P),
             old: makeLumaState(W, H, P), sums: makeLumaSums(W, H, P) };
}
// *** pushLuma AS IT WAS UNTIL THE LOCK-SUMS ROUND: the bilinear fetch a function called once per SLOT. *** Kept here
// and not in the module, as the control the module's push is measured against in section 2 -- and held there to be
// bit-identical to it, so the two timings are of the same arithmetic on the same memory and differ only in where the
// taps and weights are found. *** IT KEEPS THE ORIGINAL'S DEFAULT PARAMETERS, AND THAT IS NOT COSMETIC. *** A first
// copy written without `stride = 1, off = 0` (every call here passes both) ran at 370 ns a pixel where the module's
// own per-slot push ran at 710; with them it runs at the module's 460-470. Measured, Node 22: the defaults alone cost
// the per-slot form about 2x in this loop, and with inlining switched off both forms cost ~1250. That is a JIT's
// answer, not memory's -- which is section 2's point.
const clampI = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function sampleScalar(buf, w, h, u, v, stride = 1, off = 0) {
    const x = u * w - 0.5, y = v * h - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const at = (xx, yy) => buf[(clampI(yy, 0, h - 1) * w + clampI(xx, 0, w - 1)) * stride + off];
    return at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy)
         + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
}
function pushLumaPerSlot(st, { current, motion, w, h }) {
    const F = st.frames, nextRing = st.scratchRing, nextFilled = st.scratchFilled;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, o = i * 4, l = luma(current[o], current[o + 1], current[o + 2]);
        const hu = (x + 0.5) / w + motion[o], hv = (y + 0.5) / h + motion[o + 1];
        if (!(st.n > 0 && motion[o + 2] !== 0 && hu >= 0 && hu < 1 && hv >= 0 && hv < 1)) {
            for (let k = 0; k < F; k++) nextRing[i * F + k] = l; nextFilled[i] = 0; continue; }
        for (let k = 0; k < F - 1; k++) nextRing[i * F + k] = sampleScalar(st.ring, w, h, hu, hv, F, k + 1);
        nextRing[i * F + F - 1] = l;
        nextFilled[i] = Math.min(255, st.filled[nearestTexel(hu, hv, w, h)] + 1);
    }
    st.scratchRing = st.ring; st.scratchFilled = st.filled; st.ring = nextRing; st.filled = nextFilled; st.n++;
    return st;
}
// The index of the sorted sample that bounds the MEDIAN from above with at least 95% confidence, one-sided and
// distribution-free: the smallest k with P(Binomial(n, 1/2) >= k+1) <= 0.05, i.e. fewer than k+1 of n samples sit above
// the true median at that rate. For n = 11 it is the 9th (P = 67/2048 = 3.3%). Derived, not picked.
function medianUpperIndex(n) {
    const C = (a, b) => { let v = 1; for (let i = 1; i <= b; i++) v = v * (a - b + i) / i; return v; };
    for (let k = Math.ceil(n / 2); k < n; k++) {
        let tail = 0; for (let j = k + 1; j <= n; j++) tail += C(n, j);
        if (tail / 2 ** n <= 0.05) return k;
    }
    return n - 1;
}
const time = (f, n) => { const t = process.hrtime.bigint(); for (let i = 0; i < n; i++) f(); return Number(process.hrtime.bigint() - t) / 1e6 / n; };
/** Interleaved A/B/A: the reference is measured either side of the subjects, so drift is common to all of them. */
const OLD_REPS = 5;
function ratioAt(W, H, reps = 11) {
    const F = fixture(W, H, CONTENT.smooth), N = W * H;
    const push = () => pushLuma(F.st, { current: F.c, motion: F.m, w: W, h: H });
    const old = () => pushLumaPerSlot(F.old, { current: F.c, motion: F.m, w: W, h: H });
    const sums = () => pushLumaSums(F.sums, { current: F.c, motion: F.m, w: W, h: H });
    const floor = () => ringFloorCPU(F.L, F.m, W, H, P);
    // *** THE FIRST VERSION OF THIS GATE RAN 17.4 SECONDS AGAINST A 3,000 ms BUDGET. *** Seven repeats of
    // three timings of 1.2e6/N calls, warmed by twenty more, is a fine benchmark and a broken gate -- the
    // fault v4551, v4553, v4558 and v4559 each recorded, made a fifth time and worse than any of them. The
    // interleaving is what buys accuracy here, not the call count, so the counts come down and the A/B/A
    // stays; what that costs is measured below rather than assumed away.
    // *** THE LOCK-SUMS ROUND DOUBLED THE CALLS, 6e4/N -> 1.2e5/N, AND THE GATE STILL GOT CHEAPER. *** The push it
    // divides by became five times cheaper, so the same number of calls measured a fifth of the time and its spread
    // grew to reach the claim's line; twice the calls of a push five times cheaper is still under half the old cost.
    for (let i = 0; i < 4; i++) { push(); old(); sums(); floor(); }
    // *** v4816 -- ELEVEN REPEATS OF HALF THE CALLS (1.2e5/N x 5 -> 6e4/N x 11), FOR THE ERROR BAR SECTION 1 NOW USES. ***
    // The median's confidence bound needs order statistics to stand on, and five give none worth having; the call
    // count is halved so the gate costs what it did (section 1 at ~2.0 s here, against ~1.5-1.8 s before).
    const n = Math.max(2, Math.round(6e4 / N)), r = [], q = [], pushNs = [], floorNs = [], oldNs = [], sumsNs = [];
    for (let k = 0; k < reps; k++) {
        // each subject sits DIRECTLY between two pushes. The first draft of this round put all three subjects between one
        // pair, and the spread at 128x128 doubled, reaching the line on 2 of 12 runs alone: drift over a window three
        // subjects wide is not common to both ends. The interleaving is what this measurement is.
        // v4816: the per-slot control costs ~4.7 pushes a timing and its row's whole bar sits at 3.5-6x against a line at
        // 1.0, so it keeps the five repeats it was designed with; only the floor ratio, whose bound is tight, takes eleven.
        const withOld = k < OLD_REPS;
        const a1 = time(push, n), b = time(floor, n), a2 = time(push, n);
        const o = withOld ? time(old, n) : NaN, a3 = withOld ? time(push, n) : NaN;
        const sm = time(sums, n), a4 = time(push, n);
        const a = (a1 + a2) / 2;
        r.push(b / a); pushNs.push(a * 1e6 / N); floorNs.push(b * 1e6 / N); sumsNs.push(sm * 1e6 / N);
        if (withOld) { q.push(o / ((a2 + a3) / 2)); oldNs.push(o * 1e6 / N); }
    }
    for (const v of [r, q, pushNs, floorNs, oldNs, sumsNs]) v.sort((x, y) => x - y);
    const mid = (v) => v[(v.length - 1) >> 1];
    return { median: mid(r), lo: r[0], hi: r[r.length - 1], upper: r[medianUpperIndex(r.length)], sorted: r, oldMedian: mid(q), oldLo: q[0], oldHi: q[q.length - 1],
             pushNs: mid(pushNs), floorNs: mid(floorNs), oldNs: mid(oldNs), sumsNs: mid(sumsNs), n, reps };
}

// *** v4816 -- THE FLATNESS ROW'S TWO SIZES, INTERLEAVED THE WAY SECTION 1'S SUBJECTS ARE. *** It compared the 64x64
// and 128x128 per-pixel push times from two ratioAt calls taken a second apart, which is a clock read twice -- exactly
// what this header says not to assert -- and went red 1 run in 50 alone here on a 64x64 pass that was slow throughout
// (push 175, floor 113 ns/px, then 108 and 86 at 128). Here each 128x128 timing sits between two 64x64 ones.
function flatnessRatio(reps = 7) {
    const A = fixture(64, 64, CONTENT.smooth), B = fixture(128, 128, CONTENT.smooth);
    const pa = () => pushLuma(A.st, { current: A.c, motion: A.m, w: 64, h: 64 });
    const pb = () => pushLuma(B.st, { current: B.c, motion: B.m, w: 128, h: 128 });
    for (let i = 0; i < 4; i++) { pa(); pb(); }
    const na = Math.max(2, Math.round(3e4 / 4096)), nb = Math.max(2, Math.round(3e4 / 16384)), q = [];
    for (let k = 0; k < reps; k++) {
        const a1 = time(pa, na) / 4096, b = time(pb, nb) / 16384, a2 = time(pa, na) / 4096;
        q.push(b / ((a1 + a2) / 2));
    }
    q.sort((x, y) => x - y);
    return { median: q[(q.length - 1) >> 1], lo: q[0], hi: q[q.length - 1], reps };
}

console.log("ringFloorCost-selfcheck -- what the derived floor costs, measured as a ratio and not as a clock\n");
console.log("1. THE MEASUREMENT'S OWN SPREAD, BEFORE THE MEASUREMENT IS USED FOR ANYTHING");
const R = {};
{
    for (const s of [64, 128]) R[s] = ratioAt(s, s);
    for (const s of [64, 128]) report(`${s}x${s}: ratio floor:push median ${R[s].median.toFixed(3)}, 95% upper bound ${R[s].upper.toFixed(3)} (sample ${medianUpperIndex(R[s].reps) + 1} of ${R[s].reps}), spread ${R[s].lo.toFixed(3)}..${R[s].hi.toFixed(3)} (${((R[s].hi - R[s].lo) / R[s].median * 100).toFixed(0)}% of median) over ${R[s].reps} interleaved repeats, ${R[s].n} calls each`);
    // *** THE THRESHOLD IS THE CLAIM'S, NOT ONE I PICKED. *** "spread under 60%" would be a declared number
    // chosen to pass. What the claim below actually needs is that the error bar does not reach the line it
    // is being compared against: the spread has to be smaller than the distance from the median to that line.
    // That is a threshold derived from the claim it protects.
    // *** THE LINE MOVED FROM 0.5 TO 1.0 IN THE LOCK-SUMS ROUND, BECAUSE THE CLAIM HAD TO. *** Until then the floor
    // measured 0.08-0.12 of the push and the row claimed "under half". The push it was measured against spent four
    // fifths of its time finding the same four taps once per slot; with that gone (section 2) the floor measures
    // about 0.6 of it, and the claim that survives is the one adoption needs: it costs LESS than the push it runs
    // beside. 0.5 was never derived from anything but the old measurement, so it is not kept.
    //
    // *** v4816 -- THE ERROR BAR IS THE MEDIAN'S, BECAUSE THE CLAIM IS ABOUT THE MEDIAN. *** The row asked the whole
    // min..max range of five repeats to fit between the median and the line. On the box that now owns the timing record
    // (linux-x64-4c-16095mb-420793) the 128x128 median reads ~0.80, not the 0.55-0.69 the lock-sums round measured on
    // 142c0d, so the headroom is ~0.2 -- and one stray repeat sets a min..max range by itself. Measured here, run alone:
    // 5 of 10 runs red, then 4 of 12; sixty repeats in one process put a single repeat over 1.0 about once in 180, and
    // printed in order the strays (0.45, 0.93, 1.01 ...) are scattered, not front-loaded, so more warm-up is no cure.
    // A sample range also WIDENS with every repeat added, so "more repeats" could only make that row worse.
    // What the claim needs is that the MEDIAN is below the line with confidence, and the order statistic above bounds
    // it without assuming a distribution. 11 repeats of 6e4/N, bound = 9th of 11: 0 of 20 runs red, worst bound 0.850,
    // typical 0.82 at 128x128. The line stays at 1.0. Forcing a GC before every timing was also tried and is NOT used:
    // the 128x128 median falls to ~0.61 but single repeats reach 1.5, because the floor's own allocation is then
    // collected inside its own timing every time.
    // The index is derived, so it is checked where the binomial tail can be done by hand: n = 5 -> the 5th (1/32 = 3.1%),
    // n = 9 -> the 8th (10/512 = 2.0%; the 7th would be 46/512 = 9.0%), n = 11 -> the 9th (67/2048 = 3.3%; the 8th 11.3%).
    ok("  the bound's sample is the binomial one: 5th of 5, 8th of 9, 9th of 11 -- not the median, and not the maximum",
        medianUpperIndex(5) === 4 && medianUpperIndex(9) === 7 && medianUpperIndex(11) === 8,
        `n=5 -> ${medianUpperIndex(5) + 1}, n=9 -> ${medianUpperIndex(9) + 1}, n=11 -> ${medianUpperIndex(11) + 1}`);
    ok("  ...and the live bound IS that sample of the sorted repeats, at or above the median -- not the median wearing its name",
        [64, 128].every((s) => R[s].upper === R[s].sorted[medianUpperIndex(R[s].sorted.length)] &&
            R[s].sorted.length === R[s].reps && R[s].sorted.every((v, i, a) => i === 0 || a[i - 1] <= v) && R[s].upper >= R[s].median),
        [64, 128].map((s) => `${s}: bound ${R[s].upper.toFixed(3)} = sample ${medianUpperIndex(R[s].reps) + 1} of ${R[s].reps}, median ${R[s].median.toFixed(3)}`).join(", "));
    const REACH = 1.0;
    // the comparison is a function so a fixture can drive it: on this box every live bound clears the line, so loosening
    // the comparison changes no live answer (sabotage JO went 0 red before this control existed)
    const boundsClear = (rs, line) => rs.every((x) => x.upper < line);   // a NaN bound fails too: NaN < line is false
    ok("  CONTROL: a bound AT or over the line fails the row, one under it passes",
        boundsClear([{ upper: 0.98 }], REACH) && !boundsClear([{ upper: 0.98 }, { upper: 1.0 }], REACH) &&
        !boundsClear([{ upper: 1.02 }], REACH) && !boundsClear([{ upper: NaN }], REACH), "fixture bounds 0.98 / 1.00 / 1.02 / NaN against the line 1.0");
    ok("the interleaved ratio's error bar -- the median's 95% upper bound -- does not reach the line the claim is made against, which is what makes a timing row safe to assert rather than merely small",
        boundsClear([R[64], R[128]], REACH),
        [64, 128].map((s) => `${s}: median ${R[s].median.toFixed(3)}, bound ${R[s].upper.toFixed(3)} vs line ${REACH} (headroom ${(REACH - R[s].upper).toFixed(3)})`).join(", "));
    // *** THIS IS THE ONE ASSERTION A TIMING GATE CAN MAKE WITHOUT BEING FLAKY. *** Not "under 2 ms" -- under
    // the reference measured beside it, by a margin larger than the spread just measured.
    ok(`*** the derived floor costs LESS than the ring push it would run beside: ${(R[128].median * 100).toFixed(1)}% of it at 128x128 ***`,
        R[64].median < REACH && R[128].median < REACH, `64: ${R[64].median.toFixed(3)}, 128: ${R[128].median.toFixed(3)}`);
    // and beside the SUMS (render/temporalLockSums.mjs), which is what the lock can afford at 2x, it is not
    report(`beside the sums instead of the ring it is MORE than the history it serves: floor ${R[128].floorNs.toFixed(0)} ns/px against the sums' push ${R[128].sumsNs.toFixed(0)} at 128x128 (${(R[128].floorNs / R[128].sumsNs).toFixed(2)}x) -- reported, not asserted; the lock-sums round measured 1.3-1.7x`);
}

console.log("\n2. WHAT THE PUSH'S COST WAS, AND WHAT v4561 READ IT AS");
{
    // *** v4561 FOUND THE FLOOR BEAT ITS OP-COUNT PREDICTION 3.5x AND READ THAT AS "THE PUSH IS BANDWIDTH-BOUND". ***
    // It was not. The push called a bilinear function once per SLOT -- fifteen calls a pixel at 1x, each finding the
    // same four taps and weights through a fresh closure -- and that call was most of its cost. The lock-sums round
    // found the taps once a pixel: the same reads of the same ring, the same arithmetic in the same order, about five
    // times faster (460-470 -> ~95 ns a pixel at 128x128 here). A bandwidth-bound loop does not get five times faster
    // when its memory traffic is unchanged. The per-slot form is kept above as the control, and these rows hold the
    // comparison honest.
    const W = 48, H = 40, F = fixture(W, H, CONTENT.chequer), a = makeLumaState(W, H, P), b = makeLumaState(W, H, P);
    let differ = 0, slots = 0;
    for (let f = 0; f < 3 * P; f++) {
        pushLuma(a, { current: F.c, motion: F.m, w: W, h: H }); pushLumaPerSlot(b, { current: F.c, motion: F.m, w: W, h: H });
        for (let i = 0; i < a.ring.length; i++) { slots++; if (!Object.is(a.ring[i], b.ring[i])) differ++; }
        for (let i = 0; i < a.filled.length; i++) if (a.filled[i] !== b.filled[i]) differ++;
    }
    ok(`the control is the module's push to the BIT: ${slots} slots over ${3 * P} reprojected pushes of a pixel-scale chequer, ${differ} differ -- so the timing below compares where the taps are found and nothing else`,
        differ === 0 && slots > 0, `${W}x${H}, both axes clamped at the frame's edges`);
    // the line is 1.0 because that is the claim refuted: bandwidth-bound means the same traffic costs the same time
    ok(`*** the per-slot push costs ${R[128].oldMedian.toFixed(1)}x the module's at 128x128 (${R[128].oldNs.toFixed(0)} against ${R[128].pushNs.toFixed(0)} ns/px) with the same memory traffic, and the whole error bar is above 1 at both sizes -- the push was never bandwidth-bound ***`,
        [64, 128].every((s) => R[s].oldLo > 1), [64, 128].map((s) => `${s}: ${R[s].oldLo.toFixed(2)}..${R[s].oldHi.toFixed(2)}`).join(", "));
    // pushLuma per pixel: F-1 = 15 reprojected slots, four taps each, plus the current luma, plus 2P ring
    // writes, plus the fill read and write. ringFloorCPU per pixel: two axes, each four taps for the two
    // second differences and five for the range, plus two motion reads and one write.
    const F2 = 2 * P;
    const pushOps = (F2 - 1) * 4 + 1 + F2 + 2, floorOps = 2 * (4 + 5) + 2 + 1;
    const predicted = floorOps / pushOps;
    report(`op counts: push ~${pushOps} array touches per pixel, floor ~${floorOps} -> predicted ratio ${predicted.toFixed(3)}; measured ${R[128].median.toFixed(3)}, ${(R[128].median / predicted).toFixed(1)}x ABOVE it now`);
    // NOT a row any more. v4561's asserted the measurement beat this prediction, which it did only because the
    // push's cost was a call per slot that no count of array touches sees. With the call gone it reads above the
    // prediction instead: the floor's touches carry second differences, absolute values and a max, the push's a
    // multiply-add. A count of touches is not a model of either function's cost, and nothing is asserted from it.
    report(`per pixel: push ${R[128].pushNs.toFixed(0)} ns, floor ${R[128].floorNs.toFixed(0)} ns, the per-slot push ${R[128].oldNs.toFixed(0)} ns at 128x128`);
    const FL = flatnessRatio();
    ok(`  the push's per-pixel cost is flat with resolution (128x128 over 64x64, interleaved: ${FL.median.toFixed(2)}x): it touches its own pixel's slots and four neighbours' at any frame size`,
        Math.abs(FL.median - 1) < 0.35,
        `median ${FL.median.toFixed(3)} over ${FL.reps} interleaved repeats (${FL.lo.toFixed(2)}..${FL.hi.toFixed(2)}); section 1's separate passes read push ${R[64].pushNs.toFixed(0)} -> ${R[128].pushNs.toFixed(0)} ns/px, floor ${R[64].floorNs.toFixed(0)} -> ${R[128].floorNs.toFixed(0)} ns/px`);
}

console.log("\n3. *** THE OBVIOUS OPTIMISATION IS UNSAFE, AND ITS FAILURE IS THE MOST DANGEROUS ANSWER THERE IS ***");
{
    // The floor is a MAX over the frame, and a max over a subset can only go DOWN. That is the direction that
    // sets a margin below the noise. Whether it matters depends on how RARE the worst pixel is -- and this is
    // recorded because a future round looking to make the estimator cheaper will reach for exactly this.
    const W = 128, H = 128;
    report("content   full        1-in-4      1-in-16     1-in-64     worst under-report");
    const rows = {};
    for (const [name, fn] of Object.entries(CONTENT)) {
        const F = fixture(W, H, fn), full = ringFloorCPU(F.L, F.m, W, H, P);
        const sub = (k) => { let w = 0;
            for (let y = 3; y < H - 3; y += k) for (let x = 3; x < W - 3; x += k) w = Math.max(w, full.per[y * W + x]);
            return w; };
        const s = [sub(2), sub(4), sub(8)];
        rows[name] = { full: full.worst, s, worst: Math.min(...s.map((v) => v / full.worst)) };
        report(`${name.padEnd(9)} ${full.worst.toExponential(2)}  ${s.map((v) => v.toExponential(2)).join("  ")}  ${((1 - rows[name].worst) * 100).toFixed(1)}% low`);
    }
    ok("on three of the four contents a 1-in-64 sample is within 1% of the full max, which is exactly why this looks like a free optimisation",
        ["smooth", "finer", "chequer"].every((n) => rows[n].worst > 0.99),
        ["smooth", "finer", "chequer"].map((n) => `${n} ${((1 - rows[n].worst) * 100).toFixed(1)}%`).join(", "));
    // *** v4561 ASSERTED THIS WAS EXACTLY ZERO AND v4562 MADE IT 2.2e-7, WHICH IS WORSE. *** Adding the
    // arithmetic floor stopped the estimator ever returning zero, so a sampled max on the edge no longer
    // reports the obviously-broken 0.00e+0 -- it reports one arithmetic floor, a small plausible number that
    // looks like a measurement. The severity did not change (a factor of two million); the SIGNAL did. The
    // row is now written against the ratio, which is what it always meant, and the change is recorded because
    // a gate that quietly stopped failing here would have been read as the defect going away.
    ok(`*** and on the fourth it under-reports by ${((1 - rows.edge.worst) * 100).toFixed(1)}% -- a factor of ${(rows.edge.full / Math.max(rows.edge.s[2], 1e-30)).toExponential(0)} -- and since v4562 gave the estimator an arithmetic floor it comes back as a small PLAUSIBLE number rather than an obvious zero, which is worse to read and no better to use ***`,
        rows.edge.worst < 1e-3 && rows.edge.full > 0.1,
        `edge full ${rows.edge.full.toExponential(3)}, 1-in-16 ${rows.edge.s[1].toExponential(1)}, 1-in-64 ${rows.edge.s[2].toExponential(1)}`);
    ok("  and the reason generalises past this fixture: the three that survive have their worst pixel EVERYWHERE, the one that fails has it in a single column -- so sampling is safe exactly when the feature is common, and a rare high-error feature is what a lock is for",
        rows.edge.worst < 0.5 && rows.chequer.worst > 0.99,
        `edge is one column of ${W}; chequer is every other texel`);
}

console.log("\n4. *** WHAT THE ARC'S TEN DEVICE ROWS HAVE BEEN RUNNING ON, WHICH NOBODY ASKED UNTIL NOW ***");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** The adapter question is the point of this section and it has not been asked."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: {}, script: `async () => {
        const { requestDevice } = await import("/gfx/device.js");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        return { backend: dev.backend };
    }` });
    ok("the harness ran and reported an adapter alongside the result", r.ok && r.adapter != null,
        r.ok ? JSON.stringify(r.adapter) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.adapter) {
        const blob = [r.adapter.vendor, r.adapter.architecture, r.adapter.device, r.adapter.description].filter(Boolean).join(" ");
        report(`dev.backend says "${r.result.backend}"; the adapter says ${JSON.stringify(r.adapter)}`);
        // *** THE LABEL AND THE THING ARE DIFFERENT WORDS. *** Every device row in this arc has printed
        // "webgpu" and every one of them has run on a CPU.
        // *** v4647 -- TWO OF THESE THREE ROWS ASSERTED WHAT THE BOX IS, AND WENT RED WHEN THE BOX GOT BETTER. ***
        // They read `r.software === true`. On Keith's Intel gen-9 through D3D12 that is FALSE, so the gate
        // that exists to say "nobody asked what this runs on" failed for being answered. The finding they
        // were written for is real and is NOT retracted -- every device row in this arc had been a CPU
        // running WGSL -- but a finding is a thing that HAPPENED, and an assertion is a thing that must keep
        // happening. Those are different, and this section had them the same.
        //
        // What is durable is that the harness's verdict MATCHES what the adapter calls itself, on any adapter
        // -- both true on SwiftShader, both false on gen-9.
        //
        // *** AND IT IS NOT TWO INSTRUMENTS, WHICH IS WHAT THE FIRST DRAFT OF THIS COMMENT CLAIMED. *** A
        // sabotage said so: removing swiftshader from SOFTWARE_HINTS went 0 RED here where the old rows gave
        // 4. webgpuHarness computes `software` as `isFallback === true || SOFTWARE_HINTS.test(blob)`, and
        // isFallbackAdapter is ABSENT in this Chromium, so on this box `software` IS the name match -- one
        // instrument read twice, and a corruption that moves both cannot be seen from here at all.
        //
        // So this row checks the DERIVATION (that the harness still computes and reports it from the strings
        // it has), not the CLASSIFICATION. The list itself is gated where it lives: the same sabotage puts
        // tools/ship/localModelProbe-selfcheck.mjs 2 red against a fixture. Those 4 reds were mostly this
        // gate duplicating somebody else's property, and the coverage survives in the right place.
        report(`this box is ${r.software ? "a SOFTWARE rasteriser" : "REAL SILICON"}: ${blob || "(unnamed)"}`);
        ok(`*** the harness still DERIVES \`software\` from the adapter's own names and reports it -- not the list's own check, which lives in localModelProbe-selfcheck ***`,
            r.software === SOFTWARE_HINTS.test(blob),
            `software=${r.software}, name match=${SOFTWARE_HINTS.test(blob)}, isFallbackAdapter ${r.adapter.isFallback === null ? "ABSENT in this Chromium, so the name match is the instrument" : r.adapter.isFallback}`);
        ok("  the harness now returns it for all 109 gates that call runInEngineOrigin, so no gate has to remember to ask",
            typeof r.software === "boolean" && r.adapter.vendor != null, `software=${r.software}, vendor=${r.adapter.vendor}`);
        // *** AND THIS IS WHY THIS SECTION HAS NO TIMING IN IT -- CHECKED ON THE SOURCE, NOT ON THE ADAPTER. ***
        // The old row asserted `r.software === true` to justify the absence of a timing claim, which tested
        // the box rather than the choice: on real silicon it went red while the gate still published no
        // timing, so the assertion had nothing to do with the property. The property is that THIS SECTION'S
        // PAGE SCRIPT DOES NOT TIME ANYTHING, and that is readable from the file itself. Someone adding a
        // dispatch timer here in future goes red and has to confront the adapter question first.
        const mySrc = fs.readFileSync(new URL(import.meta.url), "utf8");
        const section4 = mySrc.slice(mySrc.indexOf("const r = await runInEngineOrigin"), mySrc.indexOf("// NOT a row:"));
        ok(`*** and THEREFORE this gate does not time the kernel -- its page script carries no timing primitive at all ***`,
            !/performance\s*\.\s*now|Date\s*\.\s*now|timestamp-query|writeTimestamp/.test(section4),
            `a dispatch ratio measured here would be whatever this box is, and this round measured one (0.68 at 128x128, against ${(R[128].median).toFixed(2)} on the CPU) before checking. The 0.68 is recorded in the closing as a SOFTWARE measurement and is not asserted here as a device one`);
    }
    // NOT a row: `ok(..., true)` is a control that cannot fail, and the first draft of this section had one
    // here. What a device parity row claims is UNHARMED -- agreement between two implementations is agreement
    // whatever they run on -- and that is a statement about the ten existing rows, not a check on anything.
    report("the ten existing device rows are NOT retracted: parity is parity whatever executes it; it is the timing claim alone the adapter invalidates");
}

// SABOTAGE. Seven rewrites of the harness, the estimator and the software-adapter name list, run against
// three gates -- this one, ringFloor-selfcheck and localModelProbe-selfcheck, whose regex this round reuses
// rather than copies -- with v4557's crash rule applied.
//   JA  the harness stops reporting the adapter (the state all 109 gates were in)    1 red
//   JB  the harness reports it but always calls it hardware                          2 red (v4647: 1)
//   JC  SOFTWARE_HINTS quietly loses swiftshader                                     4 red (v4647: 0 -- see below)
//   JD  the estimator's y-axis dropped -- half the work, blind to a horizontal edge  2 red
//   JE  the estimator sampled every fourth pixel, the optimisation section 3 refuses 5 red
//   JF  the per-pixel field left unwritten while `worst` stays right                12 red
//   JG  the range stencil narrowed from five taps to three                           2 red
//
// *** v4647 RE-RAN JB AND JC AGAINST THE REPAIRED SECTION 4, PLUS ONE NEW SABOTAGE. ***
//   JH  a timing primitive added to section 4's page script                          1 red
// JB stays red at 1 rather than 2, because one of its two victims is now a REPORT: what the box is belongs
// in the output, not in an assertion. JC drops to 0 and that is the finding, not the regression -- the old
// rows read `software === true`, so corrupting the list made them fail for the wrong reason. `software` is
// DERIVED from SOFTWARE_HINTS whenever isFallbackAdapter is absent, which it is in this Chromium, so this
// gate never had a second instrument to catch the list with. The list's own gate does, on a fixture:
// localModelProbe-selfcheck goes 2 red on the same sabotage. Four of those reds were duplicated coverage.
//
// *** JG WENT 0-RED ON THE FIRST SWEEP AND THAT WAS THE ROUND'S BEST FINDING. *** Narrowing the range
// stencil changed NOTHING any gate could see, because all four of v4560's contents classify identically
// under both widths -- the 47x gap that makes tau robust is far too wide for a stencil change to move
// anything across it. v4560's own row observed that its four contents sit 39, 14, 3.1 and 4.0 samples per
// period against tau's 7.9 and read that as a virtue: the threshold is not fitted to the data. It is ALSO a
// hole. No fixture exercised the regime boundary, so anything that only matters there was invisible.
// Measured on content built at the threshold, the three-tap range reads 2.92x of truth where the five-tap
// reads 1.66x, and flips 79% of the frame to the step bound. The narrow stencil is not WRONG -- a smaller
// range makes |D3|/range larger, so the bound only ever goes UP -- it is LOOSER, and tightness near the
// boundary is the whole thing v4560 spent a round earning. ringFloor-selfcheck now carries that fixture and
// two rows that pin the width, and JG bites on both.
//
// *** THE LOCK-SUMS ROUND, WHEN pushLuma STOPPED FINDING ITS TAPS ONCE PER SLOT AND SECTIONS 1-2 WERE REWRITTEN. ***
//   JK  the per-slot control given one wrong tap weight                              1 red, the bit row
//   JL  the module's push put back to the per-slot form                             1 red: the hoist row reads 1.0x,
//       which is exactly what "bandwidth-bound" would have predicted for the change and did not happen
//   JM  the claim's line put back at 0.5, the old measurement's number              2 red
// All three re-run after each subject was given its own pair of pushes (ratioAt): same counts but JK, which had also
// reddened the spread row while the window was three subjects wide. 15 of 15 runs alone green after that change, the
// spread's margin to the line 1.7x at worst; 2 of 12 had gone red before it. Before all of it, the module change itself
// went 3 red here and nowhere else: "a fraction under half", "beats its op-count
// prediction" and the spread against 0.5 were all statements about a push four fifths of whose time was the call.
//
// *** v4816 -- HARDENED ON THE BOX THAT OWNS THE TIMING RECORD, WHERE THE SPREAD ROW WENT RED 5 RUNS IN 10 ALONE. ***
// Section 1's error bar became the median's 95% upper bound (the 9th of 11 sorted repeats, 6e4/N calls each); the line
// stays 1.0. The flatness row's two sizes are interleaved (flatnessRatio), its 0.35 line kept. The per-slot control keeps
// five repeats (OLD_REPS), which brings the run back to ~2.1 s. Measured here, alone: before, 5 of 10 and 4 of 12 red on
// the spread row and 1 of 50 on the flatness row; after, 40 of 40 green, mean 2,065 ms, max 2,267 ms. Sabotage, each restored:
//   JM  the line back at 0.5                                                        3 red (both claim rows, now the bound too)
//   JN  medianUpperIndex returns the median's own index                              1 red, the binomial row
//   JO  the bound comparison loosened by a whole unit                                1 red, its fixture control
//   JQ  the live bound swapped for the median                                        1 red, the wiring row
//   JS  the 128x128 side of the flatness interleave pushed twice                     1 red, the flatness row
//   JR  repeats back to 5 (the bound then the maximum)                               0 red, AND CORRECTLY: these two change
//   JT  the flatness row back on section 1's separate passes                         0 red  how OFTEN a row flakes, not what
//       it asserts, and one run cannot measure a rate. The 5/10 and 1/50 above are those rates.
//
// *** AND THIS GATE'S FIRST VERSION RAN 17.4 SECONDS AGAINST A 3,000 ms BUDGET *** -- seven repeats of three
// timings of 1.2e6/N calls, warmed by twenty more. That is the over-budget fault v4551, v4553, v4558 and
// v4559 each recorded, made a fifth time and worse than any of them. Cutting to five repeats of 6e4/N
// brought it to 1.28 s and moved the measured ratio from 0.078 to 0.076, inside its own spread: the
// interleaving is what buys the accuracy here, not the call count, which is worth knowing before the next
// round reaches for a longer benchmark.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the cost on REAL hardware, which this container cannot answer at all and which " +
    "is the number a caller actually needs; whether the estimator can be made cheaper WITHOUT sampling -- " +
    "the y-stencil could be reused down a column, which nobody has tried; and the cost of the WGSL floor " +
    "kernel beside the WGSL ring push on a GPU, still open for the same reason.");
process.exit(fails ? 1 : 0);
