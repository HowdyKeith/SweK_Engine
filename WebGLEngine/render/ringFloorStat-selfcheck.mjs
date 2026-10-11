/**
 * THE HEADLINE NUMBER IS AN ORDER STATISTIC, AND IT MOVES THE WRONG WAY WHEN THE PICTURE IMPROVES.
 *
 * ringFloorCPU returns `worst`, a MAX over the frame, and every floor this arc has published since v4560 is
 * one -- v4559's 8.6e-1, v4562's 24x, v4564's ladder, v4567's yaw comparison. v4567 found that on a ground
 * plane that max sits at the HORIZON, the least representative pixel in the frame. This round asks what the
 * statistic is doing rather than where it lands.
 *
 * A max over N samples grows with N whether or not the thing being measured has changed. So `worst` is a
 * function of how many pixels were looked at, and a frame that gets genuinely better while getting bigger
 * can report a larger number. Sections 1 and 2 measure both halves of that.
 *
 * *** `worst` IS STILL THE ONLY ONE OF THESE THAT IS A BOUND, AND IT IS KEPT UNCHANGED. *** What is added is
 * the shape of the distribution underneath it, so a caller can tell "this frame is bad" from "this frame has
 * a horizon".
 */
import { makeLumaState, pushLuma, lumaMean } from "./temporalLock.mjs";
import { ringFloorCPU } from "./ringFloor.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const NEAR = 0.5, FAR = 40, FOVY = 60 * Math.PI / 180, EYE_Y = 1.6, P = jitterPhaseCount(1);
const content = (wx, wz) => 0.5 + 0.45 * Math.sin(wx * 1.1) * Math.cos(wz * 0.9);

/** The same world scene at whatever resolution is asked for, so only the sampling changes. */
function build(W, H, speed) {
    const persp = (() => { const f = 1 / Math.tan(FOVY / 2), o = new Float32Array(16);
        o[0] = f / (W / H); o[5] = f; o[10] = FAR / (NEAR - FAR); o[11] = -1; o[14] = FAR * NEAR / (NEAR - FAR); return o; })();
    const VP = (cx) => { const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; t[13] = -EYE_Y;
        return mat4Multiply(persp, t); };
    const xf = (m, x, y, z) => { const o = [0, 0, 0, 0];
        for (let r = 0; r < 4; r++) o[r] = m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]; return o; };
    const tracer = (cx) => { const m = VP(cx), inv = mat4Invert(m);
        return (x, y, j) => { const u = (x + 0.5 + j[0]) / W, v = (y + 0.5 + j[1]) / H;
            const a = xf(inv, 2 * u - 1, 1 - 2 * v, 0), b = xf(inv, 2 * u - 1, 1 - 2 * v, 0.5);
            const A = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], B = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
            const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
            if (Math.abs(d[1]) < 1e-12) return null;
            const t = -A[1] / d[1]; if (t <= 0) return null;
            const Pw = [A[0] + t * d[0], 0, A[2] + t * d[2]];
            const c = xf(m, Pw[0], Pw[1], Pw[2]); if (c[3] <= 0) return null;
            return { P: Pw, clipZ: c[2] / c[3] }; }; };
    const st = makeJitterState(1), lu = makeLumaState(W, H, P), hist = [];
    const NF = 2 * P + 10; let L2 = null, m2 = null, on2 = null, cxN = 0;
    for (let f = 0; f < NF; f++) {
        const j = advanceJitter(st), cx = f * speed, tr = tracer(cx);
        const c = new Float32Array(W * H * 4), d = new Float32Array(W * H), L = new Float32Array(W * H), on = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, o = i * 4, t = tr(x, y, j);
            const v = t ? content(t.P[0], t.P[2]) : 0.5;
            c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1;
            d[i] = t ? t.clipZ : 1; L[i] = v; on[i] = t ? 1 : 0;
        }
        m2 = motionVectorsCPU(d, W, H, mat4Invert(VP(cx)), VP(cx - speed)).data;
        pushLuma(lu, { current: c, motion: m2, w: W, h: H });
        hist.push(j); L2 = L; on2 = on; cxN = cx;
    }
    const truth = new Float32Array(W * H), trN = tracer(cxN);
    for (const jj of hist.slice(-P)) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const t = trN(x, y, jj); truth[y * W + x] += (t ? content(t.P[0], t.P[2]) : 0.5) / P; }
    const mean = lumaMean(lu), e = ringFloorCPU(L2, m2, W, H, P, undefined, "window", lu);
    const errs = [];
    for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
        const i = y * W + x;
        if (!on2[i] || lu.filled[i] < lu.frames) continue;
        errs.push(Math.abs(mean[i] - truth[i]));
    }
    errs.sort((a, b) => a - b);
    return { errs, est: e, W, H };
}
const q = (v, p) => v[Math.floor(v.length * p)];

console.log("ringFloorStat-selfcheck -- what the number this arc reports is actually measuring\n");
console.log("1. *** THE ORDER STATISTIC ALONE: ONE FIXED FRAME, THE MAX OVER N OF ITS PIXELS ***");
const BIG = build(96, 96, 0.05);
{
    // Nothing about the scene changes here. The only variable is how many of its pixels the max is taken
    // over, which is exactly what changes when a caller renders the same shot at a different resolution.
    let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const full = BIG.errs[BIG.errs.length - 1];
    const at = (N) => { const trials = [];
        for (let t = 0; t < 40; t++) { let m = 0;
            for (let k = 0; k < N; k++) m = Math.max(m, BIG.errs[Math.floor(rnd() * BIG.errs.length)]);
            trials.push(m); }
        trials.sort((a, b) => a - b); return trials[20]; };
    const pts = [64, 256, 1024, BIG.errs.length].map((N) => ({ N, v: at(N) }));
    report(`one 96x96 frame, ${BIG.errs.length} pixels with a full ring; median ${q(BIG.errs, 0.5).toExponential(3)}`);
    for (const p of pts) report(`   max over ${String(p.N).padStart(4)} random pixels: ${p.v.toExponential(3)}  (${(p.v / full * 100).toFixed(0)}% of the all-pixel max)`);
    ok(`*** the max over a FIXED frame grows with how many of its pixels are looked at: ${pts.map((p) => (p.v / full * 100).toFixed(0) + "%").join(" -> ")} at N = ${pts.map((p) => p.N).join(", ")} ***`,
        pts[0].v < full * 0.6 && pts[pts.length - 1].v >= full * 0.99,
        `${pts.map((p) => `${p.N}:${p.v.toExponential(2)}`).join("  ")}`);
    ok("  and the median over the same pixels is the same number however many are drawn, because it is not an order statistic of the tail",
        (() => { let s2 = 999; const r2 = () => (s2 = (s2 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
            const med = (N) => { const v = []; for (let k = 0; k < N; k++) v.push(BIG.errs[Math.floor(r2() * BIG.errs.length)]);
                v.sort((a, b) => a - b); return v[v.length >> 1]; };
            const a = med(256), b = med(BIG.errs.length);
            return Math.abs(a / b - 1) < 0.35; })(),
        `median over 256 drawn pixels against all of them, within a third`);
}

console.log("\n2. *** AND IN A REAL RESOLUTION CHANGE IT MOVES THE WRONG WAY ***");
const RES = {};
{
    // A real resolution change moves two things at once: the sample count rises, which lifts the max, and the
    // content's cycles-per-pixel falls, which by v4559's quadratic law should cut the floor about nine-fold
    // over a 3x finer sampling. The two nearly cancel in the max and do not in the median.
    report("size     n      worst(true)   p99(true)    median(true)   worst(est)   median(est)");
    for (const S of [32, 48, 64, 96]) {
        const r = S === 96 ? BIG : build(S, S, 0.05);
        RES[S] = r;
        report(`${String(S).padStart(3)}x${String(S).padEnd(3)} ${String(r.errs.length).padStart(5)}   ${r.errs[r.errs.length - 1].toExponential(2)}     ${q(r.errs, 0.99).toExponential(2)}     ${q(r.errs, 0.5).toExponential(2)}      ${r.est.worst.toExponential(2)}     ${r.est.quantiles.p50.toExponential(2)}`);
    }
    const med32 = q(RES[32].errs, 0.5), med96 = q(RES[96].errs, 0.5);
    ok(`*** sampling the same scene three times finer cuts the TYPICAL pixel's floor ${(med32 / med96).toFixed(0)}x, ${med32.toExponential(2)} to ${med96.toExponential(2)} -- which is v4559's quadratic law, since three times finer is about nine times less error ***`,
        med32 / med96 > 5, `median ${med32.toExponential(3)} at 32x32, ${med96.toExponential(3)} at 96x96`);
    const w32 = RES[32].errs[RES[32].errs.length - 1], w96 = RES[96].errs[RES[96].errs.length - 1];
    ok(`*** and over the same four runs the MAX does not move: ${w32.toExponential(2)} to ${w96.toExponential(2)}, because the order-statistic growth cancels the improvement -- so the headline reports no change where the frame got ${(med32 / med96).toFixed(0)}x better ***`,
        Math.abs(w96 / w32 - 1) < 0.5, `worst ${w32.toExponential(3)} -> ${w96.toExponential(3)}`);
    ok(`*** and the ESTIMATE's worst goes the wrong way outright, ${RES[32].est.worst.toExponential(2)} to ${RES[96].est.worst.toExponential(2)} -- a caller watching the number this arc reports would conclude the picture got worse ***`,
        RES[96].est.worst > RES[32].est.worst, `estimate worst ${RES[32].est.worst.toExponential(3)} -> ${RES[96].est.worst.toExponential(3)}`);
    ok(`  while the estimate's MEDIAN tracks the truth's: ${RES[32].est.quantiles.p50.toExponential(2)} to ${RES[96].est.quantiles.p50.toExponential(2)}, falling like the thing it is bounding`,
        RES[96].est.quantiles.p50 < RES[32].est.quantiles.p50, `median estimate ${RES[32].est.quantiles.p50.toExponential(3)} -> ${RES[96].est.quantiles.p50.toExponential(3)}`);
}

console.log("\n3. THE QUANTILES, AND WHAT THEY COST");
{
    // *** BY HISTOGRAM, NOT BY SORT. *** A full sort of the per-pixel field costs 68-72% of the estimator's
    // own run at 128x128 through 512x512 -- it would nearly double the price of the floor. A 1024-bucket
    // log-scale histogram costs 15.6-18.7%, which against v4561's 7.6%-of-the-ring-push is about 1.2% of a
    // frame. The bucket width bounds the error rather than a tolerance being chosen: over a dynamic range R
    // the relative error is R^(1/1024) - 1.
    const r = BIG.est, qn = r.quantiles;
    const exact = Array.from(r.per).filter((x) => x > 0).sort((a, b) => a - b);
    const eq = (p) => exact[Math.floor(exact.length * p)];
    report(`96x96: ${qn.count} pixels, stated relative error ${(qn.relError * 100).toFixed(2)}% from ${qn.buckets} buckets`);
    for (const [n, p] of [["p50", 0.5], ["p90", 0.9], ["p99", 0.99]])
        report(`   ${n}  histogram ${qn[n].toExponential(4)}   exact sort ${eq(p).toExponential(4)}   error ${((qn[n] / eq(p) - 1) * 100).toFixed(3)}%`);
    ok(`*** every quantile is within the error the bucket width predicts -- ${(qn.relError * 100).toFixed(2)}% stated, ${(Math.max(...[[0.5, "p50"], [0.9, "p90"], [0.99, "p99"]].map(([p, n]) => Math.abs(qn[n] / eq(p) - 1))) * 100).toFixed(3)}% worst measured -- so the bound on the approximation is derived from the construction and not chosen ***`,
        [[0.5, "p50"], [0.9, "p90"], [0.99, "p99"]].every(([p, n]) => Math.abs(qn[n] / eq(p) - 1) <= qn.relError * 1.05),
        `stated ${(qn.relError * 100).toFixed(3)}%`);
    // *** AND THE STATED ERROR HAS TO MOVE WITH THE FIELD, OR IT IS A CONSTANT WEARING A DERIVATION'S CLOTHES.
    // *** Hard-coding relError to this frame's 1.62% went 0-RED, because this section measured exactly one
    // field and 1.62% is its true answer. A second field with a different dynamic range is the whole test.
    // It is checked against the formula applied to THIS field's own observed range, which no constant can
    // satisfy for two fields at once -- rather than against a second field's number, which the first attempt
    // did and which separated them by only a factor of two.
    const rangeOf = (per) => { let lo = Infinity, hi = 0;
        for (let i = 0; i < per.length; i++) { const x = per[i]; if (x > 0) { if (x < lo) lo = x; if (x > hi) hi = x; } }
        return hi / lo; };
    const predicted = (r) => Math.exp(Math.log(r) / 1024) - 1;
    const fields = [["this frame", BIG.est], ["a 32x32 run", RES[32].est]];
    for (const [name, e] of fields)
        report(`${name}: dynamic range ${rangeOf(e.per).toExponential(1)}, stated error ${(e.quantiles.relError * 100).toFixed(4)}%, predicted ${(predicted(rangeOf(e.per)) * 100).toFixed(4)}%`);
    ok(`*** the stated error is DERIVED from each field's OWN dynamic range: it matches the bucket formula on both, and their ranges differ enough that no single constant satisfies them ***`,
        fields.every(([, e]) => Math.abs(e.quantiles.relError / predicted(rangeOf(e.per)) - 1) < 1e-9) &&
        Math.abs(BIG.est.quantiles.relError / RES[32].est.quantiles.relError - 1) > 0.02,
        fields.map(([n, e]) => `${n} ${(e.quantiles.relError * 100).toFixed(4)}%`).join(", "));
    ok("  and the count is the pixels the estimator actually visited, not the buffer's size, so a border of zeros cannot drag a quantile down",
        qn.count === exact.length && qn.count < BIG.est.per.length,
        `${qn.count} visited of ${BIG.est.per.length} in the buffer`);
    // *** AN EMPTY OR FLAT FIELD IS SAID RATHER THAN GUESSED. ***
    ok("*** a field the estimator visited nothing in returns null quantiles rather than zeros -- an absence read as an answer is v4402's fault and this one says which it is ***",
        (() => { const z = ringFloorCPU(new Float32Array(64), null, 8, 8, P).quantiles;
                 return z.p50 === null && z.count === 0 && z.relError === null; })(),
        "count 0 gives nulls, not a distribution of zeros");
    // *** AND IT HAS TO RETURN THE VALUE, NOT MERELY A NON-NULL. *** The first version of this row asserted
    // `p50 !== null`, and zero is not null -- so replacing the flat-field answer with 0 passed it. The row
    // has to compare against the value the pixels actually hold, which on a flat field is the arithmetic
    // floor and is the only thing there is to return.
    ok("  and a field whose every visited pixel reads the same returns THAT VALUE with zero error, rather than dividing by a zero log range or returning a zero that looks like an answer",
        (() => { const f = new Float32Array(16 * 16).fill(0.5);
                 const r2 = ringFloorCPU(f, null, 16, 16, P), z = r2.quantiles;
                 const held = r2.per[8 * 16 + 8];
                 return z.buckets === 1 && z.relError === 0 && z.p50 === z.p99 && held > 0 && z.p50 === held; })(),
        "a flat field is one bucket wide, says so, and reports the arithmetic floor its pixels hold");
}

console.log("\n4. WHAT IS NOT CHANGED");
{
    ok("*** `worst` is still the max and still the only one of these that is a BOUND -- the quantiles are added beside it, not in place of it ***",
        (() => { let m = 0; for (let i = 0; i < BIG.est.per.length; i++) m = Math.max(m, BIG.est.per[i]);
                 return BIG.est.worst === m; })(),
        "the headline is the same number it was before this round");
    ok("  and a quantile is NOT a bound: the p99 of the estimate is below its own max by a wide margin, which is exactly why it cannot replace it for a caller that needs to clear the noise",
        BIG.est.quantiles.p99 < BIG.est.worst * 0.9,
        `p99 ${BIG.est.quantiles.p99.toExponential(3)} against worst ${BIG.est.worst.toExponential(3)}`);
    ok("  so the two answer different questions and this round's claim is only that reporting one of them was never enough",
        BIG.est.quantiles.p50 < BIG.est.quantiles.p99 && BIG.est.quantiles.p99 <= BIG.est.worst,
        `p50 ${BIG.est.quantiles.p50.toExponential(2)} < p99 ${BIG.est.quantiles.p99.toExponential(2)} <= worst ${BIG.est.worst.toExponential(2)}`);
}

// SABOTAGE. Eight rewrites of the quantile construction, run against six gates -- this one, ringFloorYaw,
// ringFloorLight, ringFloorStep, ringFloorControl and ringFloor -- with v4557's crash rule applied.
//   RA  the quantiles dropped, back to a bare max                                1 red
//   RB  the empty field returns zeros instead of nulls                           1 red
//   RC  the histogram counts the whole buffer, border zeros included             2 red
//   RD  the bucket count cut to 8                                                2 red
//   RE  the stated relError hard-coded instead of derived                        1 red
//   RF  the quantile reads the bucket's lower edge                               1 red
//   RG  p90 and p99 swapped                                                      1 red
//   RH  the flat-field case returns zero instead of the value its pixels hold    1 red
//
// *** RE AND RH BOTH WENT 0-RED, AND BOTH WERE ROWS OF MINE THAT CHECKED THE WRONG THING. ***
//
// RE hard-codes relError to 1.62%. That passed because this section measured exactly ONE field, and 1.62%
// is that field's true answer -- a derived number and a constant are indistinguishable when there is only
// one case. It is now checked against the bucket formula applied to each field's OWN observed range, on two
// fields whose ranges differ, which no single constant can satisfy.
//
// RH returns zero for a field whose every pixel reads the same. The row asserted `p50 !== null`, and zero
// is not null, so it passed -- a check on the shape of the answer where the claim was about its VALUE. It
// now compares against the arithmetic floor those pixels actually hold.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether the arc's OWN published floors should be re-read in light of this -- " +
    "v4559's 8.6e-1, v4562's 24x and v4564's ladder are all maxima and none is retracted, but none has been " +
    "re-taken as a distribution either; the quantiles on the DEVICE, whose kernel returns a per-pixel field " +
    "and no reduction at all; whether p99 or p50 is the one a caller wants, which is a question about the " +
    "caller and not about the floor; and the histogram's behaviour when the field spans a dynamic range far " +
    "wider than the 1e7 its 1.6% error figure was quoted at.");
process.exit(fails ? 1 : 0);
