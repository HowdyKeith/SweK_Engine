/**
 * THE CONTROL v4563's CHURN NUMBER DID NOT HAVE, AND WHAT IT SHOWS.
 *
 * v4563 reported 28.9% churn for a pooled per-pixel margin against 10.7% for the arc's fixed 0.05 and had
 * nothing to compare either against. A number with no control cannot say whether it is near-optimal or three
 * times worse than achievable -- "a bound is not a measurement". This gate builds the ladder:
 *
 *   SCENE   ridges of the NOISELESS truth field. The camera moves, so features genuinely enter and leave;
 *           no detector can churn less than this and it is not a defect when they do.
 *   ORACLE  the ring mean with a margin derived from the error ACTUALLY THERE rather than an estimate of it.
 *           This is what a perfect estimator would buy, and it is the headroom the estimator has.
 *
 * *** AND MEASURING IT FOUND SOMETHING WORSE THAN THE CHURN: the estimator is a bound on the FRAME'S worst
 * error and not on each pixel's own, and v4563 spent it per pixel. *** See section 3.
 */
import { makeLumaState, pushLuma, lumaMean, ridgesCPU, ridgeMarginBounds } from "./temporalLock.mjs";
import { ringFloorCPU, makeFloorPool, pushFloor, pooledFloor, marginsFromFloor } from "./ringFloor.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 48, H = 48, NEAR = 0.5, FAR = 40, FOVY = 60 * Math.PI / 180, EYE_Y = 1.6;
const P = jitterPhaseCount(1), SPEED = 0.05, ARC = 0.05, CONTRAST = 0.9;
function persp(a) { const f = 1 / Math.tan(FOVY / 2), o = new Float32Array(16);
    o[0] = f / a; o[5] = f; o[10] = FAR / (NEAR - FAR); o[11] = -1; o[14] = FAR * NEAR / (NEAR - FAR); return o; }
const viewOf = (cx) => { const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; t[13] = -EYE_Y; return t; };
const VP = (cx) => mat4Multiply(persp(W / H), viewOf(cx));
const xform = (m, x, y, z) => { const o = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) o[r] = m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]; return o; };
const content = (wx, wz) => 0.5 + 0.45 * Math.sin(wx * 1.1) * Math.cos(wz * 0.9);
function tracer(cx) { const m = VP(cx), inv = mat4Invert(m);
    return (x, y, j) => {
        const u = (x + 0.5 + j[0]) / W, v = (y + 0.5 + j[1]) / H;
        const a = xform(inv, 2 * u - 1, 1 - 2 * v, 0), b = xform(inv, 2 * u - 1, 1 - 2 * v, 0.5);
        const A = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], B = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
        const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        if (Math.abs(d[1]) < 1e-12) return null;
        const t = -A[1] / d[1]; if (t <= 0) return null;
        return { P: [A[0] + t * d[0], 0, A[2] + t * d[2]] }; }; }

console.log("ringFloorControl-selfcheck -- what the churn number is worth once it has a control\n");

const F = [];
{
    const st = makeJitterState(1), lu = makeLumaState(W, H, P), hist = [];
    const poolW = makeFloorPool(W, H, P), poolF = makeFloorPool(W, H, P), poolO = makeFloorPool(W, H, P);
    for (let f = 0; f < 2 * P + 16; f++) {
        const j = advanceJitter(st), cx = f * SPEED, tr = tracer(cx);
        const c = new Float32Array(W * H * 4), d = new Float32Array(W * H), L = new Float32Array(W * H), op = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, o = i * 4, t = tr(x, y, j);
            const v = t ? content(t.P[0], t.P[2]) : 0.5;
            c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1;
            const q = xform(VP(cx), t ? t.P[0] : 0, 0, t ? t.P[2] : -1);
            d[i] = t ? q[2] / q[3] : 1; L[i] = v; op[i] = t ? 1 : 0; }
        const m = motionVectorsCPU(d, W, H, mat4Invert(VP(cx)), VP(cx - SPEED)).data;
        pushLuma(lu, { current: c, motion: m, w: W, h: H });
        hist.push(j);
        const truth = new Float32Array(W * H), trN = tracer(cx);
        for (const jj of hist.slice(-P)) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const t = trN(x, y, jj); truth[y * W + x] += (t ? content(t.P[0], t.P[2]) : 0.5) / P; }
        const mean = lumaMean(lu);
        // *** THE ORACLE: the error actually present, not a bound on it. ***
        const oracle = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) oracle[i] = Math.abs(mean[i] - truth[i]);
        const eW = ringFloorCPU(L, m, W, H, P, undefined, "window"), eF = ringFloorCPU(L, m, W, H, P);
        pushFloor(poolW, eW.per, "window"); pushFloor(poolF, eF.per, "frame"); pushFloor(poolO, oracle, "window");
        if (f < 2 * P + 2) continue;
        const opt = { contrast: CONTRAST, phase: "window" };
        F.push({ op, truth, mean, oracle, regime: eW.regime, estW: eW.per, estF: eF.per,
            rScene: ridgesCPU(truth, W, H, ARC).data,
            rFixed: ridgesCPU(mean, W, H, ARC).data,
            rOracle: ridgesCPU(mean, W, H, marginsFromFloor(pooledFloor(poolO).data, W, H, ridgeMarginBounds, opt).data).data,
            rEst: ridgesCPU(mean, W, H, marginsFromFloor(pooledFloor(poolW).data, W, H, ridgeMarginBounds, opt).data).data });
    }
}
const churn = (k) => { let ch = 0, on = 0, tot = 0;
    for (let n = 0; n < F.length; n++) for (let i = 0; i < W * H; i++) {
        if (!F[n].op[i]) continue;
        if (F[n][k][i]) tot++;
        if (n === 0 || !F[n - 1].op[i]) continue;
        if (F[n][k][i] !== F[n - 1][k][i]) ch++;
        if (F[n][k][i]) on++; }
    return { perFrame: tot / F.length, churn: on ? ch / on * 100 : 0 }; };

console.log("1. *** THE LADDER, AND A PERFECT MARGIN CHURNS MORE THAN A CONSTANT ONE ***");
const CH = {};
{
    for (const [n, k] of [["SCENE only, noiseless truth", "rScene"], ["ring mean, arc's fixed 0.05", "rFixed"],
                          ["ring mean, ORACLE margin", "rOracle"], ["ring mean, ESTIMATED margin", "rEst"]]) CH[n] = churn(k);
    report("what is being detected              ridges/frame   churn per ridge held");
    for (const [n, v] of Object.entries(CH))
        report(`${n.padEnd(35)} ${v.perFrame.toFixed(1).padStart(7)}        ${v.churn.toFixed(1).padStart(6)}%`);
    ok(`*** the scene itself churns ${CH["SCENE only, noiseless truth"].churn.toFixed(1)}% with no ring in the picture at all -- the camera is moving, features enter and leave, and no detector can do better than that ***`,
        CH["SCENE only, noiseless truth"].churn > 3 && CH["SCENE only, noiseless truth"].churn < CH["ring mean, arc's fixed 0.05"].churn,
        `scene ${CH["SCENE only, noiseless truth"].churn.toFixed(1)}%, ring at the same margin ${CH["ring mean, arc's fixed 0.05"].churn.toFixed(1)}%`);
    // *** THE RESULT THAT REFRAMES v4563. ***
    ok(`*** and a PERFECT per-pixel margin churns MORE than the constant one -- ${CH["ring mean, ORACLE margin"].churn.toFixed(1)}% against ${CH["ring mean, arc's fixed 0.05"].churn.toFixed(1)}% -- so per-pixel churn is INTRINSIC to a threshold that tracks a moving field, not an estimator's error ***`,
        CH["ring mean, ORACLE margin"].churn > CH["ring mean, arc's fixed 0.05"].churn,
        `oracle ${CH["ring mean, ORACLE margin"].churn.toFixed(1)}%, fixed ${CH["ring mean, arc's fixed 0.05"].churn.toFixed(1)}%`);
    ok(`  and the oracle finds MORE ridges than either (${CH["ring mean, ORACLE margin"].perFrame.toFixed(0)} against the fixed margin's ${CH["ring mean, arc's fixed 0.05"].perFrame.toFixed(0)}), so its extra churn is not the price of being conservative -- it is the price of tracking`,
        CH["ring mean, ORACLE margin"].perFrame > CH["ring mean, arc's fixed 0.05"].perFrame,
        `${CH["ring mean, ORACLE margin"].perFrame.toFixed(1)} vs ${CH["ring mean, arc's fixed 0.05"].perFrame.toFixed(1)} ridges/frame`);
    ok(`*** so v4563's 28.9% has a floor of ${CH["ring mean, ORACLE margin"].churn.toFixed(1)}% and not of zero: the estimator's own contribution is the gap to the oracle, and the rest is what a per-pixel threshold costs however well it is computed ***`,
        CH["ring mean, ESTIMATED margin"].churn > CH["ring mean, ORACLE margin"].churn,
        `estimated ${CH["ring mean, ESTIMATED margin"].churn.toFixed(1)}%, oracle floor ${CH["ring mean, ORACLE margin"].churn.toFixed(1)}%`);
}

console.log("\n2. WHERE THE GAP TO THE ORACLE LIVES: ONE BRANCH, NOT THE WHOLE ESTIMATE");
const LOOSE = {};
{
    const gather = (pick) => { const v = [];
        for (const f of F) for (let i = 0; i < W * H; i++) {
            if (!f.op[i] || !(f.oracle[i] > 0) || !(f.estW[i] > 0)) continue;
            if (pick !== null && !!f.regime[i] !== pick) continue;
            v.push(f.estW[i] / f.oracle[i]); }
        v.sort((a, b) => a - b); return v; };
    const med = (v) => v[v.length >> 1], p90 = (v) => v[Math.floor(v.length * 0.9)];
    const all = gather(null), tay = gather(false), stp = gather(true);
    LOOSE.stepFrac = stp.length / (stp.length + tay.length);
    report(`looseness against the error actually there -- overall median ${med(all).toFixed(1)}x, p90 ${p90(all).toFixed(0)}x`);
    report(`   TAYLOR branch  median ${med(tay).toFixed(1)}x  p90 ${p90(tay).toFixed(0)}x     (${((1 - LOOSE.stepFrac) * 100).toFixed(0)}% of pixels)`);
    report(`   STEP branch    median ${med(stp).toFixed(0)}x  p90 ${p90(stp).toFixed(0)}x     (${(LOOSE.stepFrac * 100).toFixed(0)}% of pixels)`);
    ok(`*** the gap is one branch: the step bound runs ${med(stp).toFixed(0)}x loose at the median where the Taylor bound runs ${med(tay).toFixed(1)}x, so tightening the estimate means tightening the STEP case and nothing else ***`,
        med(stp) > med(tay) * 5, `Taylor ${med(tay).toFixed(2)}x, step ${med(stp).toFixed(1)}x`);
    ok(`  and it is not a rare corner: ${(LOOSE.stepFrac * 100).toFixed(0)}% of on-plane pixels take that branch on this scene, because a foreshortened ground plane is under-resolved over most of its area`,
        LOOSE.stepFrac > 0.15, `${(LOOSE.stepFrac * 100).toFixed(1)}% on the step branch`);
    // *** THE FIRST VERSION OF THIS ROW SAID "the median is already near 1" AND MEASURED 35.8x. *** That was
    // the FRAME form's median, carried over from the probe while the gate had moved to the window form. The
    // conclusion survives and the reason does not: scaling fails because the DISTRIBUTION IS WIDE, not
    // because it is centred at 1. Measured on the window form, dividing by 4 leaves the median still 8.9x
    // loose and already puts 2.13% of pixels UNDER their own error; by 8 it is 17.45%. A single factor
    // cannot reach a median at 36x without cutting through a left edge that is already at 1.
    const scaledUnder = (k) => { let under = 0, n = 0;
        for (const f of F) for (let i = 0; i < W * H; i++) {
            if (!f.op[i] || !(f.oracle[i] > 0) || !(f.estW[i] > 0)) continue;
            n++; if (f.estW[i] / k < f.oracle[i]) under++; }
        return under / n; };
    ok(`*** and no uniform scaling closes it: dividing by 4 leaves the median ${(med(all) / 4).toFixed(1)}x loose and already puts ${(scaledUnder(4) * 100).toFixed(2)}% of pixels under their own error, and by 8 it is ${(scaledUnder(8) * 100).toFixed(1)}% -- the distribution is too WIDE for one factor, its left edge sitting at 1 while its median sits at ${med(all).toFixed(0)} ***`,
        scaledUnder(4) > 0.01 && scaledUnder(8) > scaledUnder(4) * 4,
        `/4 -> ${(scaledUnder(4) * 100).toFixed(2)}% under, /8 -> ${(scaledUnder(8) * 100).toFixed(1)}%`);
}

console.log("\n3. *** THE ESTIMATOR WAS NEVER A BOUND PER PIXEL, AND v4563 SPENT IT PER PIXEL ***");
{
    // Every safety row from v4560 onward compared the frame's WORST estimate against the frame's WORST
    // error. That is a frame-wide claim and it holds. v4563 then composed the same numbers into a per-pixel
    // margin, where what matters is whether EACH pixel's estimate covers THAT pixel's error -- and its own
    // safety row compared each ridge against the floor its margin was derived from, which can only return 0.
    const count = (key) => { let under = 0, uRes = 0, nRes = 0, n = 0, fw = 0;
        for (const f of F) {
            let we = 0, wo = 0;
            for (let i = 0; i < W * H; i++) {
                if (!f.op[i] || !(f.oracle[i] > 0) || !(f[key][i] > 0)) continue;
                n++; if (!f.regime[i]) nRes++;
                if (f[key][i] < f.oracle[i]) { under++; if (!f.regime[i]) uRes++; }
                we = Math.max(we, f[key][i]); wo = Math.max(wo, f.oracle[i]); }
            if (we >= wo) fw++; }
        return { under: under / n, uRes: nRes ? uRes / nRes : 0, frameWide: fw }; };
    const fr = count("estF"), wi = count("estW");
    report(`the "frame" form -- what v4560 built and v4563 spent per pixel:`);
    report(`   frame-wide, which is what every safety row since v4560 checked: safe on ${fr.frameWide} of ${F.length} frames`);
    report(`   per pixel: ${(fr.under * 100).toFixed(1)}% below their own error, and ${(fr.uRes * 100).toFixed(1)}% of those on the TAYLOR branch`);
    report(`the "window" form added this round: ${(wi.under * 100).toFixed(1)}% below their own error, ${wi.frameWide}/${F.length} frame-wide`);
    ok(`*** the frame form is safe frame-wide on every frame and below the error actually present at ${(fr.under * 100).toFixed(0)}% of pixels -- two different claims, and only the first was ever checked ***`,
        fr.frameWide === F.length && fr.under > 0.1,
        `frame-wide ${fr.frameWide}/${F.length}, per-pixel ${(fr.under * 100).toFixed(1)}% under`);
    ok(`*** the reason is the one v4562 wrote down about a DIFFERENT form and nobody followed through: the window spans P frames at P jitter phases, so THIS frame's f does not bound the window's worst. Frame-wide it washes out because some pixel always has a large phase ***`,
        fr.uRes > 0.1, `${(fr.uRes * 100).toFixed(1)}% of Taylor-branch pixels under their own error`);
    // *** AND THE RESIDUE IS REPORTED RATHER THAN ROUNDED TO ZERO. *** The probe that found this repair
    // printed 0.0% and the gate's first row asserted exactly zero; it is four pixels in 12,348, which is not
    // zero and is worth knowing the shape of.
    let tayU = 0, stpU = 0, nT = 0, nS = 0;
    for (const f of F) for (let i = 0; i < W * H; i++) {
        if (!f.op[i] || !(f.oracle[i] > 0) || !(f.estW[i] > 0)) continue;
        if (f.regime[i]) { nS++; if (f.estW[i] < f.oracle[i]) stpU++; } else { nT++; if (f.estW[i] < f.oracle[i]) tayU++; } }
    ok(`*** and the repair is to take the phase factor's maximum, 0.25, instead of this frame's: from ${(fr.under * 100).toFixed(0)}% down to ${(wi.under * 100).toFixed(2)}% -- ${tayU + stpU} pixels in ${nT + nS}, split ${tayU} on the Taylor branch and ${stpU} on the step ***`,
        wi.under < 0.002 && wi.under < fr.under / 50,
        `window ${(wi.under * 100).toFixed(3)}% vs frame ${(fr.under * 100).toFixed(1)}%`);
    ok(`  and the residue is not a systematic hole: it is split across both branches, so it is the CURVATURE surrogate (D2max + D3 standing in for f'' at an unknown point between the taps) rather than the phase term this round repaired`,
        tayU > 0 && stpU > 0 && tayU + stpU < 10, `${tayU} Taylor, ${stpU} step, of ${nT + nS}`);
    // and the price, stated rather than buried
    const loosen = (() => { let a = 0, b = 0, n = 0;
        for (const f of F) for (let i = 0; i < W * H; i++) {
            if (!f.op[i] || f.regime[i] || !(f.estF[i] > 0)) continue;
            a += f.estW[i]; b += f.estF[i]; n++; }
        return a / b; })();
    ok(`  and it costs ${loosen.toFixed(0)}x on the Taylor branch, which is what a bound that holds at every pixel costs over one that holds on average across a frame`,
        loosen > 2, `window/frame = ${loosen.toFixed(1)}x on resolved pixels`);
}

console.log("\n4. THE GUARD THAT MAKES THE v4563 MISTAKE UNREPEATABLE");
{
    ok("marginsFromFloor refuses a floor that was not built as a per-pixel bound, rather than documenting the requirement and hoping",
        (() => { try { marginsFromFloor(new Float32Array(4), 2, 2, ridgeMarginBounds, { contrast: CONTRAST }); return false; }
                 catch (e) { return /per-pixel bound/.test(String(e.message)); } })(),
        "omitting the phase throws");
    ok("  and the floor pool carries the form with the numbers, so it cannot be mixed or misremembered",
        (() => { const q = makeFloorPool(2, 2, 2); pushFloor(q, new Float32Array(4), "frame");
                 try { pushFloor(q, new Float32Array(4), "window"); return false; } catch { return pooledFloor(q).phase === "frame"; } })(),
        "a pool holding one form rejects the other and reports which it holds");
    ok("  and ringFloorCPU still defaults to the frame form, so every frame-wide claim v4560 through v4562 recorded is the number it was",
        (() => { const L = new Float32Array(16 * 16).map((_, i) => Math.sin(i * 0.4));
                 const a = ringFloorCPU(L, null, 16, 16, P).worst, b = ringFloorCPU(L, null, 16, 16, P, undefined, "frame").worst;
                 return a === b && ringFloorCPU(L, null, 16, 16, P, undefined, "window").worst >= a; })(),
        "the default is `frame`, and `window` is never below it");
}

// SABOTAGE. Seven rewrites of the phase form, the guard and the regime mask, run against five gates --
// this one, ringFloorMargin, ringFloorPerspective, ringFloor and ringFloorCost -- with v4557's crash rule
// applied.
//   MA  the window phase silently becomes this frame's (the v4563 mistake, restored)   4 red
//   MB  the window phase bound set below f(1-f)'s maximum, 0.25 -> 0.10                3 red
//   MC  the phase argument ignored, everything the window form                        10 red
//   MD  marginsFromFloor stops refusing the frame form                                 2 red
//   ME  the floor pool stops carrying the phase, so a frame pool passes as a window    2 red
//   MF  ringFloorCPU accepts an unknown phase and silently picks one                   1 red
//   MG  the regime mask never set                                                      1 red
//
// MA is the one worth naming: it restores exactly what v4563 shipped -- a frame-wide bound spent per pixel
// -- and it now scores four. When v4563 did it, nothing in the tree went red, because its own safety row
// compared each ridge against the floor its margin was derived from and could only ever return zero. The
// difference is not that the code got better at catching it; it is that this round measured against the
// error ACTUALLY THERE instead of against the estimate.
//
// MC is the counterpart and scores highest: making everything the window form is not "safer everywhere",
// it MOVES every frame-wide number v4560 through v4562 recorded. The two forms answer different questions
// and neither is the safe default for the other's caller.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether the step bound CAN be tightened -- section 2 says that is where the " +
    "whole gap is and v4562 measured the one obvious repair as unsafe, so it needs a round; whether the " +
    "oracle's extra churn is worth its extra ridges, which is a question about what a lock is FOR and " +
    "nothing here answers it; the ladder on content that is not a ground plane; and the window form's cost " +
    "on the DEVICE, whose kernel still carries only the frame form.");
process.exit(fails ? 1 : 0);
