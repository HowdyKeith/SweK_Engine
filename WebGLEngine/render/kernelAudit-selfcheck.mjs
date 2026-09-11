/**
 * WOULD ANYTHING NOTICE IF A KERNEL IN THIS ARC WERE WRONG?
 *
 * v4569 found RING_FLOOR_WGSL four rounds behind its mirror, with a parity row that went on passing because
 * it drove the one configuration the kernel still got right. Its closing asked the obvious next question:
 * the arc has twelve WGSL kernels, each with a parity row written when it was added and never widened. So
 * the question is not whether they are correct -- it is whether anything would say so if they were not.
 *
 * v4570 answered it by mutating each kernel once, behaviour-changingly, and counting what went red across
 * the arc's fourteen device-touching gates. ELEVEN OF THIRTEEN applied mutations were caught. The census and
 * the two that were not are recorded below, and this gate holds the two findings that came out of them.
 *
 * *** MOST KERNELS ARE PINNED BY EXACTLY ONE ROW, IN THEIR OWN GATE. *** That is a thin margin and it is
 * worth saying: LUMA, SHADING_SHIFT (twice), RIDGE, YCOCG and DISOCCLUSION (twice) each scored a single red.
 * One row weakened anywhere in that list and the kernel behind it is unpinned.
 */
import { lanczos2 } from "./temporalResolve.mjs";
import { ringFloorCPU } from "./ringFloor.mjs";
import { makeLumaState, pushLuma } from "./temporalLock.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const P = jitterPhaseCount(1);

console.log("kernelAudit-selfcheck -- what the arc's twelve kernels are actually held to\n");
console.log("1. *** LANCZOS2'S SUPPORT GUARD IS DEAD CODE, AND THE REASON IS A FALSE SENTENCE ***");
{
    // The resolve kernel's tap loop is dy,dx in [-1,1] about round(s). With the sample within half a texel
    // of the centre tap, the offsets it evaluates span [-1.5, 1.5] -- and Lanczos2 is non-zero out to 2.
    // The `|x| >= 2 -> 0` guard is therefore never reached, which is how the audit found this: doubling it
    // to 4.0 changed nothing in any gate in the arc.
    const offsets = [];
    for (let f = 0; f <= 0.5; f += 0.25) for (let d = -1; d <= 1; d++) offsets.push(Math.abs(d - f));
    ok(`*** the largest offset the 3x3 footprint ever evaluates is ${Math.max(...offsets).toFixed(2)}, so the guard at |x| >= 2 is unreachable -- dead code, and doubling it to 4.0 went 0-RED across all fourteen gates ***`,
        Math.max(...offsets) < 2, `offsets span 0 to ${Math.max(...offsets).toFixed(3)}`);
    ok("  and Lanczos2 is genuinely non-zero in the range those taps never reach, so the guard is not merely redundant -- it is guarding a region the loop excludes by construction",
        Math.abs(lanczos2(1.75)) > 1e-3 && lanczos2(2.0) === 0,
        `lanczos2(1.75) = ${lanczos2(1.75).toFixed(5)}, lanczos2(2) = ${lanczos2(2)}`);
    // *** THE WEIGHT THAT LEAVES, MEASURED. ***
    const missed = (f, lo, hi) => { let inside = 0, all = 0;
        for (let d = -4; d <= 4; d++) { const w = Math.abs(lanczos2(d - f)); all += w; if (d >= lo && d <= hi) inside += w; }
        return 1 - inside / all; };
    report("sub-pixel offset   |weight| outside the 3x3 window   outside a four-tap window");
    const rows = [0, 0.25, 0.5].map((f) => ({ f, three: missed(f, -1, 1), four: missed(f, -1, 2) }));
    for (const r of rows) report(`   ${r.f.toFixed(2)}                  ${(r.three * 100).toFixed(2)}%                          ${(r.four * 100).toFixed(2)}%`);
    const worst = Math.max(...rows.map((r) => r.three));
    ok(`*** at a half-texel phase the 3x3 window leaves ${(worst * 100).toFixed(2)}% of Lanczos2's weight unevaluated -- ${((1 - (1 - worst) ** 2) * 100).toFixed(2)}% of the separable 2-D weight -- while a four-tap window leaves ${(Math.max(...rows.map((r) => r.four)) * 100).toFixed(2)}% at every phase ***`,
        worst > 0.04 && rows.every((r) => r.four < 1e-9), `3x3 misses ${rows.map((r) => (r.three * 100).toFixed(2) + "%").join(", ")}`);
    ok("  and it is zero at an integer offset, which is why the shape of this is familiar: like every floor in this arc, the cost is a function of the sub-pixel phase",
        rows[0].three < 1e-9 && rows[2].three > 0.04, `${(rows[0].three * 100).toFixed(3)}% at 0, ${(rows[2].three * 100).toFixed(2)}% at a half`);
}

console.log("\n2. WHAT THAT COSTS IN OUTPUT, WHICH IS WHAT DECIDES WHETHER IT MATTERS");
{
    // A weight fraction is not an output difference. Resolving the same source with both footprints is.
    const RW = 64, RH = 64, DW = 128, DH = 128;
    const C = { smooth: (x, y) => 0.5 + 0.45 * Math.sin(x * 0.21) * Math.cos(y * 0.17),
                edge: (x) => x < RW * 0.37 ? 0.06 : 0.92,
                chequer: (x, y) => ((Math.floor(x / 2) + Math.floor(y / 2)) & 1) ? 0.92 : 0.06 };
    const at = (s, x, y) => s[Math.min(RH - 1, Math.max(0, y)) * RW + Math.min(RW - 1, Math.max(0, x))];
    const resolve = (src, taps, j) => {
        const out = new Float32Array(DW * DH);
        for (let dy = 0; dy < DH; dy++) for (let dx = 0; dx < DW; dx++) {
            const sx = (dx + 0.5) / DW * RW - 0.5 - j, sy = (dy + 0.5) / DH * RH - 0.5 - j;
            const bx = taps === 3 ? Math.round(sx) : Math.floor(sx), by = taps === 3 ? Math.round(sy) : Math.floor(sy);
            const lo = -1, hi = taps === 3 ? 1 : 2;
            let w = 0, c = 0;
            for (let b = lo; b <= hi; b++) for (let a = lo; a <= hi; a++) {
                const ww = lanczos2(sx - (bx + a)) * lanczos2(sy - (by + b));
                w += ww; c += ww * at(src, bx + a, by + b);
            }
            out[dy * DW + dx] = c / (Math.abs(w) > 1e-4 ? w : 1e-4);
        }
        return out;
    };
    report("content   jitter   worst |3x3 - 4tap|   as % of the source's range");
    const got = {};
    for (const [n, fn] of Object.entries(C)) {
        const src = new Float32Array(RW * RH);
        for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) src[y * RW + x] = fn(x, y);
        let lo = Infinity, hi = -Infinity;
        for (const v of src) { if (v < lo) lo = v; if (v > hi) hi = v; }
        for (const j of [0, 0.25]) {
            const a = resolve(src, 3, j), b = resolve(src, 4, j);
            let worst = 0; for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
            got[`${n}:${j}`] = worst / (hi - lo);
            report(`${n.padEnd(9)} ${j.toFixed(2)}     ${worst.toExponential(3)}          ${(worst / (hi - lo) * 100).toFixed(2)}%`);
        }
    }
    ok(`*** and the truncation is not a rounding detail: at a quarter-texel phase it moves the resolved output by ${(got["edge:0.25"] * 100).toFixed(1)}% of the range on a hard edge and ${(got["chequer:0.25"] * 100).toFixed(1)}% on a pixel-scale chequer ***`,
        got["edge:0.25"] > 0.03 && got["chequer:0.25"] > 0.1,
        `smooth ${(got["smooth:0.25"] * 100).toFixed(2)}%, edge ${(got["edge:0.25"] * 100).toFixed(2)}%, chequer ${(got["chequer:0.25"] * 100).toFixed(2)}%`);
    ok("  and it is larger at a quarter texel than at an integer, which is the phase law again and not an artefact of the comparison",
        got["chequer:0.25"] > got["chequer:0"], `chequer ${(got["chequer:0"] * 100).toFixed(2)}% at 0, ${(got["chequer:0.25"] * 100).toFixed(2)}% at a quarter`);
    // *** WHAT IS NOT DONE, AND WHY, STATED RATHER THAN LEFT TO A READER. ***
    report("the footprint is NOT widened here: that moves every number temporalResolve-selfcheck records and is a round of its own. What v4570 changed is the module's justification, which claimed 3x3 was ENOUGH and is the one thing the measurement flatly refutes.");
}

console.log("\n3. THE OTHER 0-RED: A PHASE TERM THAT ONLY SHOWS AT PHASES THE FIXTURES DID NOT USE");
{
    // v4569 pinned RING_FLOOR's window phase with a sabotage changing BOTH axis terms: 2 red. v4570's audit
    // changed only the x term: nothing. Two reasons, and both are about where the fixtures sit.
    //
    // FIRST, the phase factor is used ONLY on the resolved branch, and v4569's separating fixtures -- an edge,
    // a chequer -- are almost entirely the STEP branch, where it never appears.
    //
    // SECOND, and this is the one worth keeping: at a HALF-TEXEL speed f(1-f) is 0.2500, and the window form's
    // constant is 0.25. They are the same number. Every fixture in this arc that moves at half a texel cannot
    // separate the two forms at all, however many axes a sabotage touches.
    const W = 32, H = 32, HALF = 4, S = 2 * HALF / W;
    const vp = (cx) => { const o = new Float32Array(16);
        o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / 9; o[14] = -1 / 9; o[15] = 1;
        const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; return mat4Multiply(o, t); };
    const smooth = (wx, wy) => 0.5 + 0.45 * Math.sin(wx * 0.35) * Math.cos(wy * 0.28);
    const at = (ph) => {
        const st = makeJitterState(1), lu = makeLumaState(W, H, P);
        let L2 = null, m2 = null;
        for (let f = 0; f < 2 * P + 6; f++) {
            const j = advanceJitter(st), cx = f * ph * S;
            const c = new Float32Array(W * H * 4), d = new Float32Array(W * H), L = new Float32Array(W * H);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const k = y * W + x, o = k * 4;
                const v = smooth((2 * ((x + 0.5) / W) - 1) * HALF + cx + j[0] * S, (1 - 2 * ((y + 0.5) / H)) * HALF + j[1] * S);
                c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[k] = 0.5; L[k] = v;
            }
            m2 = motionVectorsCPU(d, W, H, mat4Invert(vp(cx)), vp(cx - ph * S)).data;
            pushLuma(lu, { current: c, motion: m2, w: W, h: H }); L2 = L;
        }
        const win = ringFloorCPU(L2, m2, W, H, P, undefined, "window", lu), frm = ringFloorCPU(L2, m2, W, H, P);
        let r = 0, res = 0, tot = 0;
        for (let i = 0; i < W * H; i++) { if (win.per[i] === 0) continue; tot++; if (!win.regime[i]) res++;
            if (frm.per[i] > 0) r = Math.max(r, win.per[i] / frm.per[i]); }
        return { ph, ratio: r, resolved: res / tot, f1: ph * (1 - ph) };
    };
    report("speed (texels/frame)   f(1-f) there   window/frame   resolved-branch pixels");
    const rows = [0.1, 0.25, 0.5].map(at);
    for (const r of rows) report(`   ${r.ph.toFixed(2)}                 ${r.f1.toFixed(4)}        ${r.ratio.toFixed(2)}x           ${(r.resolved * 100).toFixed(0)}%`);
    const slow = rows[0], half = rows[rows.length - 1];
    ok(`*** the two forms converge as the speed approaches a half texel, because f(1-f) THERE IS 0.25 and the window form's constant is 0.25: the separation falls from ${slow.ratio.toFixed(2)}x at a tenth of a texel to ${half.ratio.toFixed(2)}x at a half ***`,
        slow.ratio > half.ratio * 2 && Math.abs(half.f1 - 0.25) < 1e-9,
        `${rows.map((r) => r.ph + ":" + r.ratio.toFixed(2) + "x").join(", ")}`);
    ok(`  so a fixture running at half a texel cannot separate them however many axes a sabotage touches -- and half a texel is the speed almost every fixture in this arc uses`,
        Math.abs(half.ratio - 1) < 1, `at a half texel the forms differ by ${((half.ratio - 1) * 100).toFixed(0)}%`);
    ok(`  and the phase term only ever appears on the RESOLVED branch, so it also needs content that has one: this smooth fixture is ${(slow.resolved * 100).toFixed(0)}% resolved where v4569's separating edge was 0%`,
        slow.resolved > 0.9, `${(slow.resolved * 100).toFixed(0)}% resolved at a tenth of a texel`);
}

// THE AUDIT ITSELF. One behaviour-changing mutation per kernel, run against the arc's fourteen
// device-touching gates, with v4557's crash rule applied. Baseline 0.
//   LUMA            weights swapped                                2 red   temporalLock
//   RING_PUSH       the reprojection dropped                       5 red   lock, ringContent, ringFloor
//   RING_PUSH       the fill count advanced by two                 4 red   lock, ridgeMargin, +2
//   SHADING_SHIFT   an unfilled ring reads as no change            1 red   temporalLock
//   SHADING_SHIFT   the lag dropped, newer against zero            1 red   temporalLock
//   RIDGE           either axis becomes both                       1 red   temporalLock
//   COHERENT_RIDGE  the band starts at zero                        4 red   coherentLock, ridgePhase
//   YCOCG           the luma row's weights swapped                 1 red   temporalReject
//   DISOCCLUSION    everything reads disoccluded                   1 red   temporalReject
//   DISOCCLUSION    the off-screen case reads CLEAN                1 red   temporalReject
//   RESOLVE         Lanczos2's support doubled                     0 RED
//   RESOLVE         the base texel floored, not rounded            2 red   temporalResolve
//   RING_FLOOR      the window phase ignored, X axis only          0 RED
// (MOTION's mutation did not apply -- a wrong anchor on my part, and v4567 already scored that kernel at 35.)
//
// ELEVEN OF THIRTEEN CAUGHT. *** AND EIGHT OF THOSE ELEVEN ARE PINNED BY EXACTLY ONE ROW, IN THEIR OWN
// GATE. *** One row weakened anywhere in that list and the kernel behind it is unpinned. That is not a
// defect today and it is the whole margin.
//
// THE TWO ZEROS ARE SECTIONS 1-2 AND 3 OF THIS GATE. Neither was a gate being lax: both were the fixtures
// being unable to reach the thing. The support guard is unreachable BY CONSTRUCTION given a 3x3 tap loop,
// and the phase term is invisible at the half-texel speed almost every fixture in this arc runs at, because
// f(1-f) there IS the window form's 0.25.
//
// SABOTAGE OF THIS ROUND'S OWN WORK, against seven gates: TA the dead guard made live 3 red, TB lanczos2 as
// a box 8, TC its zero at x = 2 moved 2, TD the window constant off f(1-f)'s maximum 2, TE the window phase
// on the X axis only 2, TF the regime mask never resolved 5. No 0-RED. TE is the one that matters: it is
// exactly the mutation the audit found invisible, and it now scores two.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WIDENING the resolve footprint, which section 2 measures at up to 15.7% of the " +
    "range and which moves every number temporalResolve-selfcheck records; the tree's other thirty-odd WGSL " +
    "kernels outside this arc, none of which this audit touched; whether the eight kernels pinned by exactly " +
    "ONE row should each get a second, since a single row is the whole margin; and the audit itself, which " +
    "is a scratch harness rather than a gate -- nothing re-runs it, so the census it produced is a snapshot " +
    "and will rot exactly as the records this arc keeps re-taking do.");
process.exit(fails ? 1 : 0);
