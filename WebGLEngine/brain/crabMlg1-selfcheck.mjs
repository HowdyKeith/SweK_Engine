// WebGLEngine/brain/crabMlg1-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/crabMlg1-selfcheck.mjs      (about 30 s)
//
// THE GATE OF brain/crabMlg1.mjs: the crab Neohelice's MLG1 looming-location network of Luan et al. 2022 (Front. Neurosci. 15:787256, equations 1 to 22, Table 1).
//   1 THE PARAMETERS   Table 1 (N_p 1, W_I 0.3, C_w 4, dc 0.01, T_g 30, c_i1 0.5, c_i2 0.3, c_a 0.3, tau 0.04, T_s 0.7, n_sp 4, N_a 1, T_FF0 15, a_ffi 0.02), 16 segments of 37.5 degrees; frozen.
//   2 THE SEGMENTS    segment j is centred on 22.5 j degrees and covers 37.5 degrees of the 360 degree strip, wrapping at the seam; neighbours share the 15 degrees the paper gives; together they cover every column.
//   3 THE EQUATIONS   each equation as a small function checked against a hand computation: eq. 2 persistence, eq. 1 the photoreceptor, eq. 4 and 5 the neighbour kernel (1/8, 1/4), eq. 6 the summation (and its sign), eq. 7 to 12 the grouping layer and m on a worked plane (mean filter, omega, G~, threshold), eq. 14 to 16 the adaptive coefficient
//                      in its four cases and its floor, eq. 13 the sigmoid, eq. 17 and 18 the feed-forward inhibition, eq. 19 the spike rule, eq. 20 the alarm, eq. 21 and 22 the winner-take-all (one segment, two neighbours, the seam, none).
//   4 THE PAPER'S RESULTS THAT HOLD   a static scene: M = 0.5 (sigmoid of 0), no spike, no alarm; an approaching ball is LOCALISED: the winning segment is the one nearest its azimuth (0, 45, 90, 180, 270 degrees), 5 degrees off the course gives the same answer; the distance at which the alarm comes GROWS with the object's size (half-size 2 < 4 < 8 cm
//                      at 10 cm/s) and with its speed (3 < 10 < 30 cm/s) as the paper reports; a darker ball alarms EARLIER and a low-contrast one not at all; a whole-scene flicker is suppressed by the feed-forward inhibition (spikes with it on are a small fraction of those with it off); a textured background drifting past with no object gives no alarm.
//   5 PINNED NEGATIVE RESULT   the paper says a receding object does not alarm; THIS implementation (the equations as printed with the assumptions in the header) DOES alarm on a receding ball, within about 12 frames of the motion starting and in every variant tried (mu 0 to 8, n_sp 4 to 12, the printed sign of the inhibition, the printed |G~| form of eq. 12): pinned so that a change is noticed.
//   6 THE SOURCE       pure.
// SABOTAGE (2026-11-15, 82 mutants of brain/crabMlg1.mjs, three to four at a time in scratch copies): the first pass left 14 survivors; of these 5 are equivalent and argued (the clamp written two ways; the history cap, since eq. 20 reads only the tail; a1 = 0.5 at the default mu 0 is also pinned by the mu 3 row, so the mutant is real and now red; the stripped-out `bg` string did not match), the rest each got a row in section 5b (c_i2 bookkeeping through the network, F from the PREVIOUS photoreceptor output, mu used, first-alarm lock, firstAlarm and spikeFrame, the stimulus angle, receding reversal, elevation sign, texture and drift, exact zero of c). All red after the second pass (16 of 16 re-run).
// SABOTAGE of the Round 23 combined channels (24 mutants of brain/crabMlg1.mjs): 24 red after adding rows for the channels' polarity, each channel's own coefficient history (also with both channels active) and the dominance weight; the first pass left seven survivors (swapped polarity labels, history bookkeeping, kappa, the OFF initial value).
// NOT CHECKED, said plainly: the authors' code (not seen); their camera panoramas and the Colias robot; the winner-take-all weights alpha_i (not used); the numbers of the physiological recordings of Figure 2. The alarm comes at a larger angular size than the paper's figures suggest (about 17 degrees for a dark ball at 10 cm/s).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "./crabMlg1.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const throws = (f) => { try { f(); return false; } catch (e) { return /crabMlg1/.test(e.message); } };

console.log("crabMlg1-selfcheck -- the crab MLG1 looming-location network of Luan et al. 2022\n");

console.log("1. THE PARAMETERS");
{
    const P = C.PARAMS;
    ok("!! Table 1: N_p 1, W_I 0.3, C_w 4, dc 0.01, T_g 30, c_i1 0.5, c_i2 0.3, c_a 0.3, tau 0.04, T_s 0.7, n_sp 4, N_a 1, T_FF0 15, a_ffi 0.02; 16 segments of 37.5 degrees; frozen", P.Np === 1 && P.Wi === 0.3 && P.Cw === 4 && P.dc === 0.01 && P.Tg === 30 && P.ci1 === 0.5 && P.ci2 === 0.3 && P.ca === 0.3 && P.tau === 0.04 && P.Ts === 0.7 && P.nsp === 4 && P.Na === 1 && P.TF0 === 15 && P.aFfi === 0.02 && P.segments === 16 && P.segmentDeg === 37.5 && Object.isFrozen(P));
    ok("the assumptions are the ones the header names: mu 0, the FFI persistence 0.5, the inhibition sign -1, m summed over the pixels that pass T_g", P.mu === 0 && P.aFfi1 === 0.5 && P.inhibitionSign === -1 && P.mFromThresholded === true);
}

console.log("\n2. THE SEGMENTS");
{
    const W = 180, c0 = C.segmentColumns(0, W), c1 = C.segmentColumns(1, W), c15 = C.segmentColumns(15, W), all = new Set(); for (let j = 0; j < 16; j++) for (const x of C.segmentColumns(j, W)) all.add(x);
    ok("!! each segment covers 37.5 degrees (19 of 180 columns), segment 0 wraps the seam (columns 171 to 179 then 0 to 9), segment 1 is columns 2 to 20", c0.length === 19 && c0[0] === 171 && c0[9] === 0 && c0[18] === 9 && c1[0] === 2 && c1[18] === 20 && c15.length === 19);
    ok("!! neighbours share 15 degrees (7 to 8 columns of 180), and together the 16 segments cover every column of the strip", c0.filter((x) => c1.includes(x)).length >= 7 && c0.filter((x) => c1.includes(x)).length <= 8 && all.size === W);
    ok("segmentCentre is 22.5 j degrees, wrapping; a panorama narrower than the segments is refused", C.segmentCentre(0) === 0 && C.segmentCentre(4) === 90 && C.segmentCentre(16) === 0 && C.segmentCentre(15) === 337.5 && throws(() => C.createNetwork({ W: 8, H: 10 })));
}

console.log("\n3. THE EQUATIONS");
{
    const P = C.PARAMS;
    ok("!! eq. 2: a_i = 1 / (1 + e^(mu i)): 0.5 at mu 0, 0.2689 at mu 1, 0.0474 at mu 3, i multiplies mu", near(C.persistence(0, 1), 0.5) && near(C.persistence(1, 1), 0.2689414, 1e-6) && near(C.persistence(3, 1), 0.0474259, 1e-6) && near(C.persistence(1, 2), 0.1192029, 1e-6));
    const Pn = C.photoreceptor(Float32Array.from([10, -4]), Float32Array.from([100, 50]), Float32Array.from([90, 60]), 0.5);
    ok("!! eq. 1: P = a_1 P(t-1) + L(t) - L(t-1): 0.5 x 10 + 100 - 90 = 15 and 0.5 x -4 + 50 - 60 = -12", near(Pn[0], 15) && near(Pn[1], -12));
    const imp = new Float32Array(25); imp[12] = 1; const KI = C.conv3(imp, 5, 5, [1 / 8, 1 / 4, 1 / 8, 1 / 4, 0, 1 / 4, 1 / 8, 1 / 4, 1 / 8]);
    ok("the 3 x 3 convolution of an impulse is the kernel flipped in place: here the neighbour kernel (1/8 at corners, 1/4 at edges, 0 at the centre), sum 1.5", near(KI[12], 0) && near(KI[11], 0.25) && near(KI[7], 0.25) && near(KI[6], 0.125) && near(KI[18], 0.125) && near(KI.reduce((a, b) => a + b, 0), 1.5, 1e-6));
    const Sm = C.summation(Float32Array.from([100, -40]), Float32Array.from([50, 20]), 0.3, -1), Sp = C.summation(Float32Array.from([100]), Float32Array.from([50]), 0.3, +1);
    ok("!! eq. 6: S = P + sign W_I I: with the inhibition SUBTRACTING 100 - 0.3 x 50 = 85 and -40 - 0.3 x 20 = -46; with the paper's printed plus 115", near(Sm[0], 85, 1e-5) && near(Sm[1], -46, 1e-5) && near(Sp[0], 115, 1e-5));
    // worked grouping plane: 5 x 5, S = 0 except a 3 x 3 block of 90 in the middle
    const S = new Float32Array(25); for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) S[y * 5 + x] = 90;
    const g = C.groupingM(S, 5, 5, { Cw: 4, dc: 0.01, Tg: 30, thresholded: false }), gt = C.groupingM(S, 5, 5, { Cw: 4, dc: 0.01, Tg: 30, thresholded: true });
    let Ce = new Float64Array(25); for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { let s2 = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const yy = Math.min(4, Math.max(0, y + j)), xx = Math.min(4, Math.max(0, x + i)); s2 += S[yy * 5 + xx] / 9; } Ce[y * 5 + x] = s2; }
    const mx = Math.max(...Ce), om = 0.01 + mx / 4; let mAll = 0, mThr = 0; for (let i = 0; i < 25; i++) { const gv = S[i] * Ce[i] / om; mAll += Math.abs(gv); if (gv >= 30) mThr += Math.abs(gv); }
    ok("!! eq. 7 to 12 on a worked 5 x 5 plane (a 3 x 3 block of 90): the 3 x 3 mean, omega = dc + max|Ce| / C_w, G~ = S Ce / omega; m sums |G~| over all pixels (the printed form) or |G| over the pixels with G~ >= 30", near(g.omega, om, 1e-6) && near(g.m, mAll, 1e-3 * mAll) && near(gt.m, mThr, 1e-3 * mThr) && gt.m <= g.m && g.m > 0 && near(g.Ce[12], Ce[12], 1e-4), `m ${g.m.toFixed(1)} all, ${gt.m.toFixed(1)} thresholded`);
    ok("isolated noise is suppressed by the threshold: one lit pixel gives a smaller thresholded m than a block, and a flat plane gives 0", (() => { const one = new Float32Array(25); one[12] = 90; const a = C.groupingM(one, 5, 5, { Cw: 4, dc: 0.01, Tg: 30, thresholded: true }), b = C.groupingM(new Float32Array(25).fill(50), 5, 5, { Cw: 4, dc: 0.01, Tg: 30, thresholded: true }); return a.m < gt.m && b.m === 0 + b.m && b.m >= 0 && Number.isFinite(b.m); })());
    ok("!! eq. 14 to 16, every branch: m rising with m'' >= 0 (m 200, previous 100, 0) adds c_i1 = 0.5 (0.2 to 0.7); m rising with m'' < 0 (m 130, previous 100, 0) adds c_i2 = 0.3 (0.2 to 0.5); m falling (90 after 100) subtracts c_a = 0.3 (1 to 0.7); m unchanged subtracts too (0.4 to 0.1); a coefficient at or below 0 becomes dc = 0.01 (0.2 - 0.3)",
        near(C.adaptC(0.2, 200, 100, 0, P), 0.7, 1e-9) && near(C.adaptC(0.2, 130, 100, 0, P), 0.5, 1e-9) && near(C.adaptC(1, 90, 100, 0, P), 0.7, 1e-9) && near(C.adaptC(0.4, 100, 100, 0, P), 0.1, 1e-9) && near(C.adaptC(0.2, 90, 100, 0, P), 0.01, 1e-12));
    ok("!! eq. 13: M = 1 / (1 + exp(-c m / n_cell)): 0.5 when c m = 0, 0.7311 at c m / n = 1, 0.8808 at 2", near(C.sigmoidM(1, 0, 10), 0.5) && near(C.sigmoidM(0.5, 20, 10), 0.7310586, 1e-6) && near(C.sigmoidM(2, 10, 10), 0.8807971, 1e-6));
    const f1 = C.ffiStep(10, 15, 40, 20, P);
    ok("!! eq. 17 and 18: F = a_1 F(t-1) + (sum |P|) / n_cell = 0.5 x 10 + 40 / 20 = 7; T_FFI = T_F0 + a_ffi T_FFI(t-1) = 15 + 0.02 x 15 = 15.3, which settles at 15 / (1 - 0.02) = 15.306", near(f1.F, 7) && near(f1.Tffi, 15.3) && (() => { let T = 15; for (let i = 0; i < 200; i++) T = C.ffiStep(0, T, 0, 1, P).Tffi; return near(T, 15 / 0.98, 1e-9); })());
    ok("!! eq. 19: a spike needs M >= T_s AND F < T_FFI: (0.7, 14, 15, 0.7) spikes; M 0.69, or F 15 or more, does not", C.spikeOf(0.7, 14, 15, 0.7) === 1 && C.spikeOf(0.69, 14, 15, 0.7) === 0 && C.spikeOf(0.9, 15, 15, 0.7) === 0 && C.spikeOf(0.9, 20, 15, 0.7) === 0);
    ok("!! eq. 20: an alarm after n_sp = 4 successive spikes (the last four), not three, and not four with a gap", C.alarmOf([0, 1, 1, 1, 1], 4) === 1 && C.alarmOf([1, 1, 1], 4) === 0 && C.alarmOf([1, 1, 0, 1, 1], 4) === 0 && C.alarmOf([1, 1, 1, 1, 0], 4) === 0 && C.alarmOf([], 4) === 0);
    const w1 = C.winnerTakeAll([4], 16), w2 = C.winnerTakeAll([3, 4], 16), w3 = C.winnerTakeAll([15, 0], 16), w4 = C.winnerTakeAll([2, 6], 16), w0 = C.winnerTakeAll([], 16);
    ok("!! eq. 21, 22: one alarming segment is the location; two neighbours name the point between them (3 and 4 give 3.5, winner 4); across the seam 15 and 0 give 15.5 (winner 0); none gives null", w1.lsl === 4 && w1.winner === 4 && w2.lsl === 3.5 && w2.winner === 4 && w3.lsl === 15.5 && w3.winner === 0 && w4.lsl === 4 && w0.lsl === null && w0.winner === null);
}

console.log("\n4. THE PAPER'S RESULTS THAT HOLD");
const run = (o, p) => { const s = C.approachingBall(o), r = C.runPanorama(s.frames, { params: p || {} }), k = r.firstAlarm; return { s, r, k, theta: k === null ? null : s.theta[k], dist: k === null ? null : s.dist[k] }; };
{
    const W = 180, H = 60, stat = Array.from({ length: 40 }, () => ({ w: W, h: H, data: new Float32Array(W * H).fill(150) })), rs = C.runPanorama(stat);
    ok("!! a static scene: M = 0.5 (sigmoid of 0), no spike, no alarm, no location", near(rs.M[20][0], 0.5, 1e-9) && !rs.spikes.some((s) => s.some((v) => v)) && rs.firstAlarm === null && rs.lsl === null);
    const wins = [[0, 0], [45, 2], [90, 4], [180, 8], [270, 12]].map(([az, seg]) => ({ az, seg, r: run({ az0: az }) }));
    ok("!! LOCALISATION: an approaching ball at azimuth 0, 45, 90, 180, 270 degrees is named by the segment nearest it (0, 2, 4, 8, 12), a whole segment (not a half)", wins.every((w) => w.r.r.winner === w.seg && w.r.r.lsl === w.seg), wins.map((w) => `${w.az}:${w.r.r.lsl}`).join(" "));
    ok("!! 5 degrees off the course gives the same segment (the paper: the answer changes by at most one segment)", Math.abs(run({ az0: 5 }).r.winner - 0) <= 1 && Math.abs(run({ az0: 95 }).r.winner - 4) <= 1);
    const sz = [2, 4, 8].map((L) => run({ halfSize: L, speed: 10 })), sp = [3, 10, 30].map((v) => run({ halfSize: 4, speed: v }));
    ok("!! the alarm distance GROWS with the object's size (half-size 2, 4, 8 cm at 10 cm/s: strictly increasing) and with its speed (3, 10, 30 cm/s): the paper's trends", sz.every((x) => x.k !== null) && sz[0].dist < sz[1].dist && sz[1].dist < sz[2].dist && sp.every((x) => x.k !== null) && sp[0].dist < sp[1].dist && sp[1].dist < sp[2].dist, "size " + sz.map((x) => x.dist.toFixed(1)).join("<") + ", speed " + sp.map((x) => x.dist.toFixed(1)).join("<"));
    const cs = [10, 60, 100].map((fg) => run({ fg })), low = run({ fg: 140 });
    ok("!! CONTRAST: a darker ball alarms earlier (the alarm angular size at ball luminance 10 < 60 < 100) and a low-contrast one (140 on 150) not at all", cs.every((x) => x.k !== null) && cs[0].theta < cs[1].theta && cs[1].theta < cs[2].theta && low.k === null, cs.map((x) => x.theta.toFixed(1)).join("<"));
    const W2 = 180, H2 = 60, flick = Array.from({ length: 60 }, (_, k) => ({ w: W2, h: H2, data: new Float32Array(W2 * H2).fill(k % 2 ? 200 : 100) })), on = C.runPanorama(flick), off = C.runPanorama(flick, { params: { TF0: 1e9 } }), cnt = (r) => r.spikes.reduce((a, s) => a + s.reduce((x, y) => x + y, 0), 0);
    ok("!! the FEED-FORWARD INHIBITION: a whole-scene flicker gives a small fraction of the spikes with the inhibition on (under 5%) of those with it off", cnt(off) > 500 && cnt(on) < 0.05 * cnt(off), `on ${cnt(on)}, off ${cnt(off)}`);
    const dr = run({ drift: 60, texture: 60, fg: 150, halfSize: 4, speed: 10 });
    ok("a textured background drifting past with no object (the ball painted in the background's grey) gives no alarm", dr.k === null);
}

console.log("\n5. PINNED NEGATIVE RESULT");
{
    const rec = run({ receding: true }), app = run({}), variants = [{ mu: 3 }, { nsp: 6 }, { inhibitionSign: 1 }, { mFromThresholded: false }].map((p) => run({ receding: true }, p));
    ok("!! the paper says a receding object does not alarm; this implementation DOES: within 12 frames of the motion starting, and later than the approach's alarm by more than 50 frames; PINNED (so a change to the model is noticed, not hidden)", rec.k !== null && rec.k <= 12 && app.k !== null && app.k - rec.k > 50, `receding alarm frame ${rec.k}, approach ${app.k}`);
    ok("and it alarms on the receding ball in every variant tried (mu 3, n_sp 6, the printed plus sign of the inhibition, the printed |G~| form of eq. 12): the finding does not depend on those assumptions", variants.every((v) => v.k !== null && v.k <= 20), variants.map((v) => v.k).join(", "));
}

console.log("\n5b. THE NETWORK'S BOOKKEEPING AND THE STIMULUS GENERATOR (rows added after the mutants)");
{
    const P = C.PARAMS, ball = (o) => C.approachingBall({ halfSize: 4, speed: 10, ...o });
    const a = ball({ az0: 90 }), shiftFrames = (fr, d) => fr.map((_, k) => fr[Math.max(0, k - d)]);
    ok("adaptC at exactly zero becomes dc (0.3 - 0.3 = 0 on a falling m)", C.adaptC(0.3, 0, 1, 1, P) === P.dc);
    // the network's c, m1, m2 bookkeeping: recompute c from the reported m history
    const net = C.createNetwork({ W: 180, H: 60 }); const hist = []; for (const f of a.frames) hist.push(net.step(f));
    let c = P.dc, m1 = 0, m2 = 0, good = true, concave = 0; for (let k = 1; k < hist.length; k++) { const m = hist[k].m[4]; if (m > m1 && (m + m2 - 2 * m1) < 0) concave++; c = C.adaptC(c, m, m1, m2, P); if (!near(c, hist[k].c[4], 1e-9)) good = false; m2 = m1; m1 = m; }
    ok("!! the network's adaptive c follows adaptC on its own m history with the TWO previous potentials (m1, m2) at every step of the approach, which includes steps where m rises with m'' < 0 (the c_i2 case)", good && concave > 0 && hist.some((h) => h.c[4] !== P.dc), `${concave} concave-rise steps`);
    const step1 = C.createNetwork({ W: 180, H: 60 }), f0 = { w: 180, h: 60, data: new Float32Array(180 * 60).fill(100) }, f1 = { w: 180, h: 60, data: new Float32Array(180 * 60).fill(160) };
    step1.step(f0); const s1 = step1.step(f1), s2 = step1.step(f1);
    ok("!! the feed-forward term F uses the PREVIOUS photoreceptor output (eq. 17): zero at the first processed frame after a step in luminance, positive at the next", s1.F[3] === 0 && s2.F[3] > 0);
    const n0 = C.createNetwork({ W: 180, H: 60 }), n3 = C.createNetwork({ W: 180, H: 60, params: { mu: 3 } }); let diff = 0; for (const f of a.frames) { const r0 = n0.step(f), r3 = n3.step(f); for (let j = 0; j < 16; j++) diff += Math.abs(r0.m[j] - r3.m[j]); }
    ok("the persistence coefficient is used: mu 3 gives a different potential from mu 0", diff > 1e-6);
    // the first alarm locks the answer: a second ball that alarms later does not move it
    const b = ball({ az0: 270 }), n = Math.min(a.frames.length, b.frames.length), comb = [], delay = 25;
    for (let k = 0; k < n; k++) { const fa = a.frames[k], fb = b.frames[Math.max(0, k - delay)], d = new Float32Array(180 * 60); for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(255, 150 + (fa.data[i] - 150) + (fb.data[i] - 150))); comb.push({ w: 180, h: 60, data: d }); }
    const r = C.runPanorama(comb), aA = r.alarmFrame[4], aB = r.alarmFrame[12];
    ok("!! with two balls (90 degrees first, 270 degrees 25 frames later) the answer locks on the first alarm (segment 4), firstAlarm is the EARLIEST alarm and spikeFrame is the FIRST spike", aA !== null && aB !== null && aA < aB && r.winner === 4 && r.firstAlarm === Math.min(...r.alarmFrame.filter((v) => v !== null)) && r.spikeFrame.every((v, j) => v === null ? !r.spikes.some((sp) => sp[j]) : r.spikes.findIndex((sp) => sp[j]) === v), `alarms ${aA}, ${aB}`);
    const n2 = C.createNetwork({ W: 180, H: 60 }); let last = null; for (const f of comb) { const o = n2.step(f); last = o; }
    ok("the located segment is still 4 at the end (lsl 4)", last.lsl === 4 && last.winner === 4);
    ok("!! approachingBall: the first frame subtends th0 and the last th1 degrees (4 and 40), theta increases, distance decreases", near(a.theta[0], 4, 0.5) && near(a.theta.at(-1), 40, 3) && a.theta.every((v, i) => i === 0 || v > a.theta[i - 1]) && a.dist.every((v, i) => i === 0 || v < a.dist[i - 1]), `${a.theta[0].toFixed(2)}, ${a.theta.at(-1).toFixed(2)}`);
    const rc = ball({ az0: 90, receding: true });
    ok("receding reverses the angle and the distance too (theta decreases, dist increases, the first frame is the large ball)", rc.theta.every((v, i) => i === 0 || v < rc.theta[i - 1]) && rc.dist.every((v, i) => i === 0 || v > rc.dist[i - 1]) && rc.t.every((v, i) => i === 0 || v < rc.t[i - 1]));
    const cen = (f) => { let sx = 0, sy = 0, nn = 0; for (let y = 0; y < 60; y++) for (let x = 0; x < 180; x++) if (f.data[y * 180 + x] < 80) { sx += x; sy += y; nn++; } return nn ? { x: sx / nn, y: sy / nn } : null; };
    const up = cen(ball({ az0: 90, el0: 20 }).frames.at(-1)), dn = cen(ball({ az0: 90, el0: -20 }).frames.at(-1));
    ok("!! a ball at elevation +20 degrees sits ABOVE the strip's middle (smaller y) and at -20 below (60 pixels per 120 degrees: 10 pixels)", up && dn && near(up.y, 30 - 10, 1.5) && near(dn.y, 30 + 10, 1.5) && near(up.x, 45, 1.5), `${up && up.y.toFixed(1)}, ${dn && dn.y.toFixed(1)}`);
    const d0 = ball({ az0: 90 }).frames.at(-1), d1 = ball({ az0: 90, drift: 30, texture: 20 }), d2 = ball({ az0: 90, texture: 20 }), tx0 = ball({ az0: 90, texture: 0 });
    ok("!! texture adds a fixed pattern (frames differ from the textured-off ones), and drift moves that pattern between frames (frame 0 of the drift sequence equals the still one, the last frame differs from it)", d2.frames[0].data.some((v, i) => Math.abs(v - tx0.frames[0].data[i]) > 1) && d1.frames[0].data.every((v, i) => near(v, d2.frames[0].data[i], 1e-3)) && d1.frames.at(-1).data.some((v, i) => Math.abs(v - d2.frames.at(-1).data[i]) > 1));
    const pa = (pol, o) => C.runPanorama(C.approachingBall({ az0: 90, ...o }).frames, { params: { polarity: pol } }).firstAlarm;
    ok("!! polarity (an addition, not the paper's): with the grouping layer counting only DARKENING pixels (\"off\") the approaching dark ball alarms at the same frame as with both (262) and the RECEDING ball does NOT alarm; with only brightening (\"on\") the approach does not alarm and the receding ball does; \"both\" alarms on both (the pinned finding)", pa("off", {}) === pa("both", {}) && pa("off", {}) !== null && pa("off", { receding: true }) === null && pa("on", {}) === null && pa("on", { receding: true }) !== null && pa("both", { receding: true }) !== null, [pa("both", {}), pa("off", {}), pa("off", { receding: true }), pa("on", {}), pa("on", { receding: true })].join(", "));
    ok("a bad polarity is refused", throws(() => C.createNetwork({ W: 180, H: 60, params: { polarity: "up" } })));
    const Sx = new Float32Array([-1, 1, -1, 1, -1, 1, -1, 1, -1]), g = (pol) => C.groupingM(Sx, 3, 3, { Cw: 4, dc: 0.01, Tg: -1e9, thresholded: true, polarity: pol }).m;
    ok("groupingM sums over the negative pixels only for off, the positive only for on, all for both (a checkerboard of -1 and +1: off + on = both, each positive)", g("off") > 0 && g("on") > 0 && Math.abs(g("off") + g("on") - g("both")) < 1e-9);
    const fseq = [100, 100, 160, 100, 100, 100].map((v) => ({ w: 180, h: 60, data: Float32Array.from({ length: 180 * 60 }, (_, i) => ((i % 180) >= 80 && (i % 180) < 100 ? v : 100)) }));
    const nG = C.createNetwork({ W: 180, H: 60, params: { ffiPool: "global" } }), nS = C.createNetwork({ W: 180, H: 60 }); let rG = null, rS = null; for (const f of fseq) { rG = nG.step(f); rS = nS.step(f); }
    const meanS = rS.F.reduce((a, b) => a + b, 0) / 16;
    ok("!! ffiPool global (Round 10): every segment gets the SAME F, equal to the mean of the per-segment F of the default network (F is linear in its drive), while the default F differs between segments (zero where nothing changed)", rG.F.every((v) => near(v, rG.F[0], 1e-9)) && near(rG.F[0], meanS, 1e-6) && rS.F.some((v) => v === 0) && rS.F.some((v) => v > 0) && rG.F[0] > 0, `${rG.F[0].toFixed(4)} vs mean ${meanS.toFixed(4)}`);
    ok("a bad ffiPool is refused and the default is segment", throws(() => C.createNetwork({ W: 180, H: 60, params: { ffiPool: "all" } })) && C.PARAMS.ffiPool === "segment");
    // Round 23: the combined ON / OFF channels
    const cc = (r, a, b, k) => C.combineChannels(r, a, 1, b, 1, 10, k), sg = (x) => C.sigmoidM(1, x, 10);
    ok("!! combineChannels: sum M = sigmoid((a + b) / n), max M = the larger channel's sigmoid, dominance M = sigmoid((max - kappa min) / n) with m = max - kappa min (kappa 0.5 default), each with c m = a, b; unknown rule refused", near(cc("sum", 30, 10).M, sg(40)) && near(cc("sum", 30, 10).m, 40) && near(cc("max", 30, 10).M, sg(30)) && near(cc("max", 10, 30).m, 30) && near(cc("dominance", 30, 10, 0.5).M, sg(25)) && near(cc("dominance", 10, 30, 0.5).m, 25) && near(cc("dominance", 20, 20, 1).m, 0) && near(C.combineChannels("dominance", 30, 1, 10, 1, 10).m, 25) && near(C.combineChannels("sum", 3, 10, 2, 5, 10).m, 40) && throws(() => cc("mean", 1, 1)));
    ok("!! with c: the channels weigh their own coefficients (sum with c_on 2 and c_off 3: a = 2 m_on, b = 3 m_off)", near(C.combineChannels("sum", 4, 2, 5, 3, 10).m, 8 + 15) && near(C.combineChannels("max", 4, 2, 5, 3, 10).m, 15) && near(C.combineChannels("dominance", 4, 2, 5, 3, 10, 0.5).m, 15 - 0.5 * 8));
    const ch = (r, o) => C.runPanorama(C.approachingBall({ az0: 90, ...o }).frames, { params: { channels: r } });
    ok("!! the combined networks alarm on an approaching dark ball AND an approaching light ball at segment 4, and (a pinned finding) ALSO on a receding ball of either polarity within 12 frames, for sum, max and dominance", ["sum", "max", "dominance"].every((r) => ch(r, {}).winner === 4 && ch(r, { fg: 240, bg: 100 }).winner === 4 && ch(r, { receding: true }).firstAlarm !== null && ch(r, { receding: true }).firstAlarm <= 12 && ch(r, { fg: 240, bg: 100, receding: true }).firstAlarm <= 12));
    const polOn = ch("pooled", {}), a0 = C.runPanorama(C.approachingBall({ az0: 90 }).frames, { params: { channels: "sum", polarity: "off" } });
    ok("the channels option overrides polarity (channels sum with polarity off alarms as sum with both), the default is pooled, bad channels and bad kappa-free options are refused, and the pooled network is unchanged (alarm frame 262)", a0.firstAlarm === ch("sum", {}).firstAlarm && C.PARAMS.channels === "pooled" && C.PARAMS.kappa === 0.5 && throws(() => C.createNetwork({ W: 180, H: 60, params: { channels: "mean" } })) && polOn.firstAlarm === 262);
    const nCs = C.createNetwork({ W: 180, H: 60, params: { channels: "sum" } }), nCp = C.createNetwork({ W: 180, H: 60 }); let rs = null, rp = null; let maxDiff = 0, cDiff = false; for (const f of C.approachingBall({ az0: 90 }).frames.slice(0, 275)) { rs = nCs.step(f); rp = nCp.step(f); rs.m.forEach((v, i) => { maxDiff = Math.max(maxDiff, Math.abs(v - rp.m[i])); if (Math.abs(rs.c[i] - rs.cOff[i]) > 1e-9) cDiff = true; }); }
    ok("in the combined network the OFF channel keeps its own history: over 275 frames of a dark ball c_off differs from c_on in some segment at some frame (out.c is the ON channel's, out.cOff the OFF's, zero in the pooled network) and the combined m differs from the pooled m", maxDiff > 1e-6 && cDiff && rp.cOff.every((v) => v === 0) && rs.c.length === 16 && rs.cOff.length === 16, `max m difference ${maxDiff.toFixed(1)}`);
    const P0 = C.PARAMS;
    const track = (o, params) => { const net = C.createNetwork({ W: 180, H: 60, params: { channels: "sum", ...params } }), seg = 4, rec = []; for (const f of C.approachingBall({ az0: 90, ...o }).frames.slice(0, 275)) { const r = net.step(f); rec.push({ mOn: r.mOn[seg], mOff: r.mOff[seg], c: r.c[seg], cOff: r.cOff[seg], m: r.m[seg] }); } return rec; };
    const dk = track({}), lt = track({ fg: 240, bg: 100 }), sumOn = dk.reduce((a, r) => a + r.mOn, 0), sumOff = dk.reduce((a, r) => a + r.mOff, 0), lOn = lt.reduce((a, r) => a + r.mOn, 0), lOff = lt.reduce((a, r) => a + r.mOff, 0);
    ok("!! the channels carry their polarity: an approaching DARK ball drives the OFF channel (summed m_off over the approach above m_on, and above 10 times it) and an approaching LIGHT ball drives the ON channel", sumOff > 10 * sumOn && lOn > 10 * lOff && sumOff > 0 && lOn > 0, `dark off ${sumOff.toFixed(0)} on ${sumOn.toFixed(0)}; light on ${lOn.toFixed(0)} off ${lOff.toFixed(0)}`);
    let okc = true;
    { let c1 = P0.dc, c2 = P0.dc, m11 = 0, m12 = 0, f1 = 0, f2 = 0; for (const r of dk.slice(1)) { c1 = C.adaptC(c1, r.mOn, m11, m12, P0); c2 = C.adaptC(c2, r.mOff, f1, f2, P0); m12 = m11; m11 = r.mOn; f2 = f1; f1 = r.mOff; if (Math.abs(c1 - r.c) > 1e-9 || Math.abs(c2 - r.cOff) > 1e-9) okc = false; } }
    ok("!! each channel's adaptive coefficient follows adaptC on ITS OWN potential history with its own two previous values, at every frame of the approach (the OFF coefficient moves while the ON one stays at its floor for a dark ball)", okc && dk.some((r) => r.cOff > 0.05) && dk.slice(1).every((r) => r.c === P0.dc));
    const two = (kap) => { const A = C.approachingBall({ az0: 80 }), B = C.approachingBall({ az0: 100, fg: 240, bg: 100 }), net = C.createNetwork({ W: 180, H: 60, params: { channels: "dominance", kappa: kap } }), out = []; for (let k = 0; k < Math.min(A.frames.length, B.frames.length, 275); k++) { const d = new Float32Array(180 * 60); for (let i = 0; i < d.length; i++) d[i] = 150 + (A.frames[k].data[i] - 150) + (B.frames[k].data[i] - 100); const r = net.step({ w: 180, h: 60, data: d }); out.push(r.m[4]); } return out; };
    const k5 = two(0.5), k1 = two(1);
    ok("!! the dominance weight kappa is used: with a dark and a light ball approaching in the same segment (both channels active) kappa 1 gives a combined potential below kappa 0.5's at some frame, equal at none-active frames", k5.some((v, i) => v - k1[i] > 1e-6) && k5.every((v, i) => v + 1e-9 >= k1[i]), `max difference ${Math.max(...k5.map((v, i) => v - k1[i])).toFixed(1)}`);
    { const A = C.approachingBall({ az0: 80 }), B = C.approachingBall({ az0: 100, fg: 240, bg: 100 }), net = C.createNetwork({ W: 180, H: 60, params: { channels: "sum" } }); let c1 = P0.dc, c2 = P0.dc, a1 = 0, a2 = 0, b1 = 0, b2 = 0, both = 0, okb = true;
      for (let k = 0; k < Math.min(A.frames.length, B.frames.length, 275); k++) { const d = new Float32Array(180 * 60); for (let i = 0; i < d.length; i++) d[i] = 150 + (A.frames[k].data[i] - 150) + (B.frames[k].data[i] - 100); const r = net.step({ w: 180, h: 60, data: d }); if (k === 0) continue; const mo = r.mOn[4], mf = r.mOff[4]; c1 = C.adaptC(c1, mo, a1, a2, P0); c2 = C.adaptC(c2, mf, b1, b2, P0); a2 = a1; a1 = mo; b2 = b1; b1 = mf; if (mo > 0 && mf > 0) both++; if (Math.abs(c1 - r.c[4]) > 1e-9 || Math.abs(c2 - r.cOff[4]) > 1e-9) okb = false; }
      ok("!! with BOTH channels active (a dark and a light ball in one segment) each coefficient still follows adaptC on its own history (not on the sum of the channels)", okb && both > 20, `${both} frames with both channels active`); }
    ok("approachingBall refuses a non-positive half size or speed", throws(() => C.approachingBall({ halfSize: 0 })) && throws(() => C.approachingBall({ speed: -1 })));
}

console.log("\n6. THE SOURCE");
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "crabMlg1.mjs"), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! pure: no Math.random, no clock, no DOM, no file or network, no import", !/Math\.random|Date\.now|performance\.now|document\.|window\.|fetch\(|node:|readFileSync|^import\s/m.test(src));
    ok("bad inputs are refused: a frame of another size, a non-positive half-size or speed", throws(() => C.createNetwork({ W: 180, H: 60 }).step({ w: 90, h: 60, data: new Float32Array(5400) })) && throws(() => C.approachingBall({ halfSize: 0 })) && throws(() => C.approachingBall({ speed: -1 })));
}

finished = true;
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks pass");
if (fails) process.exit(1);
