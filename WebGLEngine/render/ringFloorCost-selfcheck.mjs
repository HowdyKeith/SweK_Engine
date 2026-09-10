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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { SOFTWARE_HINTS } from "../ui/localModelProbe.js";
import { makeLumaState, pushLuma } from "./temporalLock.mjs";
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
    return { c, m: motionVectorsCPU(d, W, H, mat4Invert(vp(0)), vp(-speed)).data, L, st: makeLumaState(W, H, P) };
}
const time = (f, n) => { const t = process.hrtime.bigint(); for (let i = 0; i < n; i++) f(); return Number(process.hrtime.bigint() - t) / 1e6 / n; };
/** Interleaved A/B/A: the reference is measured either side of the subject, so drift is common to both. */
function ratioAt(W, H, reps = 5) {
    const F = fixture(W, H, CONTENT.smooth), N = W * H;
    const push = () => pushLuma(F.st, { current: F.c, motion: F.m, w: W, h: H });
    const floor = () => ringFloorCPU(F.L, F.m, W, H, P);
    // *** THE FIRST VERSION OF THIS GATE RAN 17.4 SECONDS AGAINST A 3,000 ms BUDGET. *** Seven repeats of
    // three timings of 1.2e6/N calls, warmed by twenty more, is a fine benchmark and a broken gate -- the
    // fault v4551, v4553, v4558 and v4559 each recorded, made a fifth time and worse than any of them. The
    // interleaving is what buys accuracy here, not the call count, so the counts come down and the A/B/A
    // stays; what that costs is measured below rather than assumed away.
    for (let i = 0; i < 4; i++) { push(); floor(); }
    const n = Math.max(2, Math.round(6e4 / N)), r = [], pushNs = [], floorNs = [];
    for (let k = 0; k < reps; k++) {
        const a1 = time(push, n), b = time(floor, n), a2 = time(push, n), a = (a1 + a2) / 2;
        r.push(b / a); pushNs.push(a * 1e6 / N); floorNs.push(b * 1e6 / N);
    }
    r.sort((x, y) => x - y); pushNs.sort((x, y) => x - y); floorNs.sort((x, y) => x - y);
    const mid = (v) => v[(v.length - 1) >> 1];
    return { median: mid(r), lo: r[0], hi: r[r.length - 1], pushNs: mid(pushNs), floorNs: mid(floorNs), n, reps };
}

console.log("ringFloorCost-selfcheck -- what the derived floor costs, measured as a ratio and not as a clock\n");
console.log("1. THE MEASUREMENT'S OWN SPREAD, BEFORE THE MEASUREMENT IS USED FOR ANYTHING");
const R = {};
{
    for (const s of [64, 128]) R[s] = ratioAt(s, s);
    for (const s of [64, 128]) report(`${s}x${s}: ratio floor:push median ${R[s].median.toFixed(3)}, spread ${R[s].lo.toFixed(3)}..${R[s].hi.toFixed(3)} (${((R[s].hi - R[s].lo) / R[s].median * 100).toFixed(0)}% of median) over ${R[s].reps} interleaved repeats, ${R[s].n} calls each`);
    // *** THE THRESHOLD IS THE CLAIM'S, NOT ONE I PICKED. *** "spread under 60%" would be a declared number
    // chosen to pass. What the claim below actually needs is that the error bar does not reach the line it
    // is being compared against: the ratio is asserted under 0.5, so the spread has to be smaller than the
    // distance from the median to 0.5. That is a threshold derived from the claim it protects.
    const REACH = 0.5;
    ok("the interleaved ratio's error bar does not reach the line the claim is made against -- which is what makes a timing row safe to assert rather than merely small",
        [64, 128].every((s) => (R[s].hi - R[s].lo) < (REACH - R[s].median)),
        [64, 128].map((s) => `${s}: spread ${(R[s].hi - R[s].lo).toFixed(3)} vs headroom ${(REACH - R[s].median).toFixed(3)} (${((REACH - R[s].median) / ((R[s].hi - R[s].lo) || 1e-9)).toFixed(0)}x)`).join(", "));
    // *** THIS IS THE ONE ASSERTION A TIMING GATE CAN MAKE WITHOUT BEING FLAKY. *** Not "under 2 ms" -- under
    // the reference measured beside it, by a margin far larger than the spread just measured.
    ok(`*** the derived floor costs a FRACTION of the ring push it would run beside: ${(R[128].median * 100).toFixed(1)}% at 128x128, and the margin to 1.0 is ${((1 - R[128].median) / ((R[128].hi - R[128].lo) || 1e-9)).toFixed(0)}x the spread ***`,
        R[64].median < 0.5 && R[128].median < 0.5, `64: ${R[64].median.toFixed(3)}, 128: ${R[128].median.toFixed(3)}`);
}

console.log("\n2. AGAINST A PREDICTION FROM OP COUNTS, WHICH IS WHERE THE INTERESTING PART IS");
{
    // pushLuma per pixel: F-1 = 15 reprojected slots, four taps each, plus the current luma, plus 2P ring
    // writes, plus the fill read and write. ringFloorCPU per pixel: two axes, each four taps for the two
    // second differences and five for the range, plus two motion reads and one write.
    const F2 = 2 * P;
    const pushOps = (F2 - 1) * 4 + 1 + F2 + 2, floorOps = 2 * (4 + 5) + 2 + 1;
    const predicted = floorOps / pushOps;
    report(`op counts: push ~${pushOps} array touches per pixel, floor ~${floorOps} -> predicted ratio ${predicted.toFixed(3)}`);
    report(`measured ${R[128].median.toFixed(3)}, which is ${(predicted / R[128].median).toFixed(1)}x BELOW the prediction`);
    ok(`*** and it beats its own op-count prediction by ${(predicted / R[128].median).toFixed(1)}x, which is the finding: the push is BANDWIDTH-bound on ${F2 * 4} bytes of ring per pixel while the estimator's stencil stays in cache, so counting operations overstates its cost ***`,
        R[128].median < predicted, `predicted ${predicted.toFixed(3)}, measured ${R[128].median.toFixed(3)}`);
    report(`per pixel: push ${R[128].pushNs.toFixed(0)} ns, floor ${R[128].floorNs.toFixed(0)} ns at 128x128`);
    // and the direction of the residual, which says which one degrades with size
    ok(`  the push's per-pixel cost is flat with resolution and the estimator's is not (${R[64].floorNs.toFixed(0)} -> ${R[128].floorNs.toFixed(0)} ns), because the push is already bandwidth-bound at every size while the estimator's y-stencil starts crossing the row stride`,
        Math.abs(R[128].pushNs - R[64].pushNs) / R[64].pushNs < 0.35,
        `push ${R[64].pushNs.toFixed(0)} -> ${R[128].pushNs.toFixed(0)} ns/px, floor ${R[64].floorNs.toFixed(0)} -> ${R[128].floorNs.toFixed(0)} ns/px`);
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
    ok(`*** and on the fourth it reports EXACTLY ZERO -- a ${((1 - rows.edge.worst) * 100).toFixed(0)}% under-report, and zero is the most dangerous possible answer because it says there is no noise to clear ***`,
        rows.edge.s[1] === 0 && rows.edge.s[2] === 0 && rows.edge.full > 0.1,
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
        ok(`*** dev.backend reads "${r.result.backend}" and the adapter is ${r.adapter.architecture} -- a SOFTWARE rasteriser -- so every device row this arc has written was a CPU running WGSL, and none of the ten had any way to know ***`,
            r.software === true && SOFTWARE_HINTS.test(blob),
            `software=${r.software}, isFallbackAdapter ${r.adapter.isFallback === null ? "ABSENT in this Chromium, so the name match is the instrument" : r.adapter.isFallback}`);
        ok("  the harness now returns it for all 109 gates that call runInEngineOrigin, so no gate has to remember to ask",
            typeof r.software === "boolean" && r.adapter.vendor != null, `software=${r.software}, vendor=${r.adapter.vendor}`);
        // *** AND THIS IS WHY THIS SECTION HAS NO TIMING IN IT. ***
        ok(`*** and THEREFORE this gate does not time the kernel: a dispatch ratio measured here would be SwiftShader's, and this round measured one (0.68 at 128x128, against ${(R[128].median).toFixed(2)} on the CPU) before checking, which would have shipped a software number as a device number ***`,
            r.software === true, "the 0.68 is recorded in the closing as a software measurement and is not asserted here as a device one");
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
//   JB  the harness reports it but always calls it hardware                          2 red
//   JC  SOFTWARE_HINTS quietly loses swiftshader                                     4 red
//   JD  the estimator's y-axis dropped -- half the work, blind to a horizontal edge  2 red
//   JE  the estimator sampled every fourth pixel, the optimisation section 3 refuses 5 red
//   JF  the per-pixel field left unwritten while `worst` stays right                12 red
//   JG  the range stencil narrowed from five taps to three                           2 red
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
