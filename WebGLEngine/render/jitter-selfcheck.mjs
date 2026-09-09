#!/usr/bin/env node
// WebGLEngine/render/jitter-selfcheck.mjs -- v4549
//
// THE THIRD AND LAST PREREQUISITE. render/motionVectors-selfcheck.mjs closes by naming what the temporal path still
// wants, and the jittered projection is the item on that list this file supplies: the Halton(2,3) sub-pixel
// sequence FSR2/3 offsets each frame by, and the PAIR of matrices that offset produces -- jittered for rendering,
// unjittered for motion vectors.
//
// The rows are the sequence's own properties, the matrix offset's, and the one that ties the two rungs together:
// a velocity computed from JITTERED matrices carries the jitter difference on top of the real motion, and this
// gate measures how much.
"use strict";
import { halton, jitterPhaseCount, jitterSequence, makeJitterState, jitterCurrent, jitterPrevious, advanceJitter, resetJitter, jitterProjection, frameMatrices } from "./jitter.mjs";
import { motionVectorsCPU, mat4Invert, transform4 } from "./motionVectors.mjs";
import { viewProj } from "./rasterProbe.js";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

console.log("\n1. THE SEQUENCE");
{
    // the radical inverse, against values a reader can check by hand: base 2 is j/2^k in bit-reversed order
    const b2 = Array.from({ length: 8 }, (_, k) => halton(k + 1, 2));
    const b3 = Array.from({ length: 6 }, (_, k) => halton(k + 1, 3));
    ok("halton(i, 2) is 1/2, 1/4, 3/4, 1/8, 5/8, 3/8, 7/8, 1/16 -- the radical inverse, exactly",
       b2.join() === [0.5, 0.25, 0.75, 0.125, 0.625, 0.375, 0.875, 0.0625].join(), b2.join(", "));
    ok("halton(i, 3) is 1/3, 2/3, 1/9, 4/9, 7/9, 2/9",
       b3.every((v, k) => Math.abs(v - [1 / 3, 2 / 3, 1 / 9, 4 / 9, 7 / 9, 2 / 9][k]) < 1e-15), b3.map((v) => v.toFixed(6)).join(", "));
    ok("halton(0, b) is 0 for every base -- the one index that is not a sub-pixel offset, which is why the sequence is 1-based",
       [2, 3, 5, 7].every((b) => halton(0, b) === 0));

    ok("the phase count is FSR's own 8 * ratio^2: 8 at 1x, 32 at 2x, 72 at 3x, 128 at 4x, and never below 1",
       jitterPhaseCount(1) === 8 && jitterPhaseCount(2) === 32 && jitterPhaseCount(3) === 72 && jitterPhaseCount(4) === 128 && jitterPhaseCount(0) === 1 && jitterPhaseCount(0.1) === 1,
       [1, 2, 3, 4].map((r) => `${r}x:${jitterPhaseCount(r)}`).join(" "));

    const seq = jitterSequence(jitterPhaseCount(2));
    // *** THE 1-BASED START WAS UNCHECKED UNTIL THIS ROW, AND A SABOTAGE OF IT WENT 0-RED THROUGH THE WHOLE GATE. ***
    // Every other row either calls halton() directly or compares the sequence against itself, so starting at index 0
    // changed nothing any of them could see. Index 0 is 0 in EVERY base, so a 0-based sequence opens with the centred
    // point (-0.5, -0.5) -- the pixel corner, not a jittered sample -- which wastes a phase and drags the mean. The
    // row pins the first element to halton(1, .) computed here, and refuses the index-0 point anywhere in the set.
    ok(`the sequence STARTS AT INDEX 1: its first offset is (${seq[0].map((v) => v.toFixed(4)).join(", ")}) = halton(1, .) centred, and the index-0 point (-0.5, -0.5) appears nowhere in the ${seq.length}`,
       seq[0][0] === halton(1, 2) - 0.5 && seq[0][1] === halton(1, 3) - 0.5 && !seq.some(([x, y]) => x === -0.5 && y === -0.5),
       `first ${seq[0].join(", ")}; want ${halton(1, 2) - 0.5}, ${halton(1, 3) - 0.5}`);

    ok(`every one of the ${seq.length} offsets is inside [-0.5, 0.5) in both axes -- a sub-pixel offset that left the pixel would be a different sample, not a jitter`,
       seq.every(([x, y]) => x >= -0.5 && x < 0.5 && y >= -0.5 && y < 0.5),
       `x [${Math.min(...seq.map((p) => p[0])).toFixed(4)}, ${Math.max(...seq.map((p) => p[0])).toFixed(4)}]`);

    // *** THE SEQUENCE DOES NOT CANCEL OVER FSR'S PERIOD, AND SAYING IT DOES WOULD BE A COMFORTABLE LIE. ***
    // A centred Halton mean vanishes EXACTLY at n = base^k - 1 and nowhere else: n = 1, 3, 7, 15, 31, 63, 127, 255
    // for base 2 and n = 2, 8, 26, 80, 242 for base 3. Those sets never meet, so NO phase count zeroes both axes --
    // scanned to 300 below -- and FSR's 8*ratio^2 is not one of them for either. At 2x the residual is about 1.5% of
    // a pixel in x and 1.9% in y, so a temporal accumulator converges to a very slightly shifted super-sample. Small,
    // real, and better written down than assumed away.
    const mean = (n, b) => { let s = 0; for (let k = 1; k <= n; k++) s += halton(k, b) - 0.5; return s / n; };
    const zx = [], zy = [], both = [];
    for (let n = 1; n <= 300; n++) { const a = Math.abs(mean(n, 2)) < 1e-12, c = Math.abs(mean(n, 3)) < 1e-12;
        if (a) zx.push(n); if (c) zy.push(n); if (a && c) both.push(n); }
    const m32x = mean(32, 2), m32y = mean(32, 3);
    ok(`*** the jitter does NOT cancel over FSR's period: the mean vanishes exactly at n = base^k - 1 (x at ${zx.join(",")}; y at ${zy.join(",")}) and at NO n up to 300 for both axes at once, so at 32 phases the sequence sits ${(m32x * 100).toFixed(2)}% of a pixel off-centre in x and ${(m32y * 100).toFixed(2)}% in y ***`,
       zx.join() === "1,3,7,15,31,63,127,255" && zy.join() === "2,8,26,80,242" && both.length === 0 && Math.abs(m32x) > 1e-3 && Math.abs(m32y) > 1e-3,
       `both-zero at: ${both.length ? both.join(",") : "none"}; mean(32) = ${m32x.toExponential(3)}, ${m32y.toExponential(3)}`);
    // and it cancels where the theory says -- but "exactly" means two different things per base, which is worth the
    // extra clause: base 2's Halton values are j/2^k, exact in binary floating point, so the sum is 0 TO THE BIT;
    // base 3's are thirds and ninths, which are not, so it reaches 2.8e-17 -- the arithmetic's floor, not the
    // sequence's. A first draft of this row asserted "0 to the bit" for both and went red on the second.
    ok(`  and it cancels where the theory says: mean(31, base 2) is ${mean(31, 2)} exactly, because j/2^k is exact in binary; mean(8, base 3) is ${mean(8, 3).toExponential(1)}, which is thirds and ninths hitting the floating-point floor rather than the sequence missing`,
       mean(31, 2) === 0 && mean(8, 3) !== 0 && Math.abs(mean(8, 3)) < 1e-16, `${mean(31, 2)}, ${mean(8, 3)}`);

    // *** LOW DISCREPANCY, AGAINST 2,000 RANDOM DRAWS RATHER THAN ONE. *** "Halton beats random" from a single seed
    // is a coin toss reported as a result. Occupancy spread over a 4x4 grid of the 32 offsets: Halton's is the best
    // any draw achieved, and no random draw beat it.
    const occ = (pts, k) => { const g = new Array(k * k).fill(0);
        for (const [x, y] of pts) { const i = Math.min(k - 1, Math.floor((x + 0.5) * k)), j = Math.min(k - 1, Math.floor((y + 0.5) * k)); g[j * k + i]++; } return g; };
    const spread = (g) => Math.max(...g) - Math.min(...g);
    const hs = spread(occ(seq, 4));
    let seed = 1; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let worse = 0, equal = 0, better = 0; const all = [];
    for (let t = 0; t < 2000; t++) { const s = spread(occ(Array.from({ length: 32 }, () => [rnd() - 0.5, rnd() - 0.5]), 4));
        all.push(s); if (s > hs) worse++; else if (s === hs) equal++; else better++; }
    all.sort((a, b) => a - b);
    ok(`*** it is LOW-DISCREPANCY, measured against 2,000 random draws and not one: over a 4x4 grid of the 32 offsets Halton's occupancy spread is ${hs}, random's median is ${all[1000]} and worst ${all[1999]}; random was WORSE in ${worse} draws, equal in ${equal}, and better in ${better} ***`,
       better === 0 && worse > 1500, `halton ${hs}; random min ${all[0]} med ${all[1000]} max ${all[1999]}; worse/equal/better ${worse}/${equal}/${better}`);
}

console.log("\n2. THE MATRIX OFFSET, AND THE CYCLE");
const W = 64, H = 64;
const VP = (ex) => viewProj([ex, -8, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], Math.tan(0.5), 1, 0.1, 100);
const uvOf = (m, p) => { const q = transform4(m, p[0], p[1], p[2], 1); return [(q[0] / q[3] + 1) * 0.5, (1 - q[1] / q[3]) * 0.5]; };
{
    const vp = VP(0);
    // *** THE OFFSET MUST BE THE SAME AT EVERY DEPTH. *** It is a clip-space translation by (dx*w, dy*w), so the
    // perspective divide cancels the w and the NDC shift is constant. A jitter that varied with depth would move
    // near and far geometry by different amounts and the accumulator would read it as motion.
    let worstPx = 0;
    for (const dist of [0.5, 1, 5, 40, 95]) {
        const P = [0.3, -8 + dist, 0.2];
        const a = uvOf(vp, P), b = uvOf(jitterProjection(vp, 0.5, 0.25, W, H), P);
        worstPx = Math.max(worstPx, Math.abs((b[0] - a[0]) * W - 0.5), Math.abs((b[1] - a[1]) * H - 0.25));
    }
    ok(`*** a (+0.5, +0.25) pixel jitter moves the projected point by exactly that, at EVERY depth from 0.5 to 95 units -- worst error ${worstPx.toExponential(2)} of a pixel ***`,
       worstPx < 1e-5, worstPx.toExponential(3));
    const sgn = uvOf(jitterProjection(vp, 0, 0.25, W, H), [0.3, -3, 0.2])[1] - uvOf(vp, [0.3, -3, 0.2])[1];
    ok(`  and the SIGN is uv's: a positive y jitter moves the sample DOWN the screen (dv = +${(sgn * H).toFixed(4)} px), the same orientation render/motionVectors.mjs uses`, sgn > 0, `dv ${(sgn * H).toFixed(6)} px`);
    const zero = jitterProjection(vp, 0, 0, W, H);
    ok("  and a zero jitter leaves the matrix bit-identical, so an unjittered frame costs nothing and hides nothing",
       Array.from(zero).every((v, i) => v === vp[i]));

    const st = makeJitterState(2);
    ok(`the cycle: ${st.phaseCount} phases, current and previous wrap together, and advancing ${st.phaseCount} times returns to the start`,
       st.phaseCount === 32 && jitterCurrent(st)[0] === jitterSequence(32)[0][0]
       && (() => { resetJitter(st); const first = jitterCurrent(st); for (let i = 0; i < 32; i++) advanceJitter(st); return jitterCurrent(st)[0] === first[0] && jitterCurrent(st)[1] === first[1]; })(),
       `phaseCount ${st.phaseCount}`);
    resetJitter(st); advanceJitter(st);
    ok("  and at the wrap `previous` is the LAST phase, not index -1 -- the one place a caller recomputing it from an index gets it wrong",
       (() => { resetJitter(st); const last = jitterSequence(32)[31]; return jitterPrevious(st)[0] === last[0] && jitterPrevious(st)[1] === last[1]; })(),
       `previous at phase 0 = ${jitterPrevious(st).map((v) => v.toFixed(4)).join(", ")}`);
}

console.log("\n3. WHY THERE ARE TWO MATRICES: what the jitter does to a velocity buffer");
{
    // A STATIC camera over two frames. The true velocity is zero everywhere. Compute it twice: once from the
    // UNJITTERED pair (what frameMatrices calls `motion`) and once from the JITTERED pair (what a caller reaches for
    // when there is only one matrix to reach for).
    const st = makeJitterState(2);
    const vp = VP(0);
    const f0 = frameMatrices(vp, st, W, H); advanceJitter(st);
    const f1 = frameMatrices(vp, st, W, H);
    const N = 16;
    const depth = new Float32Array(N * N).map((_, i) => -0.9 + 1.8 * ((i * 37) % 101) / 101);

    const clean = motionVectorsCPU(depth, N, N, mat4Invert(f1.motion), f0.motion);
    const dirty = motionVectorsCPU(depth, N, N, mat4Invert(f1.render), f0.render);
    const worstOf = (mv) => { let w = 0; for (let i = 0; i < N * N; i++) w = Math.max(w, Math.abs(mv.data[i * 4]), Math.abs(mv.data[i * 4 + 1])); return w; };
    const cleanPx = worstOf(clean) * N, dirtyPx = worstOf(dirty) * N;
    // the jitter difference between the two phases, in RENDER pixels, is what the dirty buffer is carrying
    const djx = f1.jitter[0] - f0.jitter[0], djy = f1.jitter[1] - f0.jitter[1];
    const expectPx = Math.max(Math.abs(djx), Math.abs(djy)) * (N / W);
    ok(`*** the camera did not move, and the UNJITTERED pair says so (${cleanPx.toExponential(2)} of a pixel) while the JITTERED pair reports ${dirtyPx.toFixed(4)} of a pixel of motion that never happened ***`,
       cleanPx < 1e-4 && dirtyPx > 20 * Math.max(cleanPx, 1e-6), `clean ${cleanPx.toExponential(3)} px, dirty ${dirtyPx.toFixed(5)} px`);
    ok(`  and the false motion IS the jitter difference between the two phases: (${djx.toFixed(4)}, ${djy.toFixed(4)}) render pixels becomes ${dirtyPx.toFixed(5)} at this buffer size against the ${expectPx.toFixed(5)} that difference predicts`,
       Math.abs(dirtyPx - expectPx) < 1e-3, `measured ${dirtyPx.toFixed(6)}, predicted ${expectPx.toFixed(6)}`);
    report("frameMatrices hands back both under names -- 'render' and 'motion' -- so the wrong one has to be asked for by name rather than reached for by default");
}

// SABOTAGE LOG -- applied to render/jitter.mjs, gate run, red count read, the file restored and md5-verified.
// Baseline 0 red. MEASURED at v4549.
//   AN the sequence left UNCENTRED (offsets in [0,1))       -> 2 red: the in-range row and the discrepancy row.
//   AO the phase count fixed at 8, ratio ignored             -> 3 red: the count row and both cycle rows.
//   AP Halton replaced by a uniform 1/32 grid                -> 5 red: a regular grid is not low-discrepancy, and
//      three of the sequence rows say so before the discrepancy row gets to.
//   AQ the jitter poked into column 2 instead of translating clip -> 3 red. That form works on a bare projection and
//      NOT on a view-projection, where column 2 is no longer the view-space z column; here it moves the point by
//      0.01 px instead of 0.25.
//   AR the y sign flipped to NDC's orientation               -> 2 red: the offset row and the sign row. Two modules
//      have to agree about which way y runs and this is the row that makes them.
//   AS frameMatrices handing back the JITTERED matrix for motion too -> 1 red, and it is the coupling row: a static
//      camera suddenly reports 0.083 of a pixel of motion that never happened.
//   AT `previous` computed as index-1 without the wrap       -> 1 red, exactly where the module's own comment says a
//      caller gets it wrong.
//   *** AM WENT 0-RED ON THE FIRST PASS AND IS RECORDED AS A FINDING. *** Starting the sequence at index 0 instead of
//      1 changed nothing the gate could see: every row either called halton() directly or compared the sequence
//      against itself, so the 1-based start -- the thing that keeps the degenerate (-0.5, -0.5) pixel corner out of
//      the set -- was asserted nowhere. A row was added that pins the first element to halton(1, .) computed
//      independently and refuses the index-0 point anywhere in the sequence; AM now goes red.
//   No 0-RED among the eight once that row exists.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the ACCUMULATION the jitter exists for -- nothing in this tree yet blends a history buffer, " +
    "so that the sequence converges to a super-sample is asserted of the sequence and not of a picture; the jitter's effect " +
    "on a RENDERED frame, since every row here projects points rather than rasterising; and REACTIVE masks and shading-change " +
    "detection, which FSR wants beside the jitter and this rung does not touch.");
process.exit(fails ? 1 : 0);
