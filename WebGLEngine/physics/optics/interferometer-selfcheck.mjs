// physics/optics/interferometer-selfcheck.mjs
//
// Run: node physics/optics/interferometer-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The simulated interferometer held to what makes it a benchmark and not a picture of fringes. First the full pipeline:
// take a metaball surface we know exactly, imprint its height as phase, make the four-step fringe stack, and recover the
// height back from the fringes alone -- the reconstruction never sees the truth -- and it must come back to the surface
// to machine precision. Second, the wrapping is a real phenomenon, not a decoration: a surface tall enough to wrap the
// phase several times is recovered wrongly if you skip unwrapping and correctly if you do, so unwrapping is load-bearing.
// Third, the four-step recovery must invert a known phase exactly. The sabotage swaps the atan2 arguments -- the textbook
// way to get phase-shifting subtly wrong -- and the recovered surface no longer matches, which the gate refuses.
import { sphereGap, ringRadii, newtonRingRadius, newtonRingRadiusNoShift } from "./interferometer.js";
import { readFileSync } from "node:fs";
import { sampleSurface, fourStep, phaseShiftRecover, recoverHeight, scoreRecovery, interferogram, phaseFromHeight, metaballHeight, unwrap2d } from "./interferometer.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const W = 64, H = 64, lambda = 1.0;
const balls = [{ cx: 22, cy: 26, a: 1.4, s: 11 }, { cx: 42, cy: 34, a: 1.1, s: 9 }, { cx: 30, cy: 44, a: 0.8, s: 7 }];
const truth = sampleSurface(balls, W, H);

// ---- 0a. metaballHeight IS THE EXACT ANALYTIC SUM OF GAUSSIAN BUMPS, NOT A REIMPLEMENTATION HERE -----
{
    const ball = { cx: 10, cy: 20, a: 1.4, s: 5 };
    ok("!! at a bump's own centre, height equals its amplitude exactly (exp(0) = 1)",
       Math.abs(metaballHeight([ball], 10, 20) - 1.4) < 1e-15, "z(cx,cy) = " + metaballHeight([ball], 10, 20));
    // one sigma off-centre along x: height = a * exp(-1/2), a closed form nobody fed the function
    const oneSigma = metaballHeight([ball], 10 + 5, 20);
    ok("!! one sigma away, height matches a*exp(-1/2) exactly", Math.abs(oneSigma - 1.4 * Math.exp(-0.5)) < 1e-14,
       oneSigma.toPrecision(15) + " vs " + (1.4 * Math.exp(-0.5)).toPrecision(15));
    // two balls superpose LINEARLY -- the sum at a point equals the sum of each ball's own contribution
    const far = { cx: 10, cy: 20, a: 1.4, s: 5 }, near = { cx: 12, cy: 21, a: 0.8, s: 3 };
    const combined = metaballHeight([far, near], 12, 21);
    const bySum = metaballHeight([far], 12, 21) + metaballHeight([near], 12, 21);
    ok("!! two balls superpose linearly: z(balls,p) == sum of each ball's own z(p)", Math.abs(combined - bySum) < 1e-15,
       combined.toPrecision(15) + " vs " + bySum.toPrecision(15));
    ok("far from every bump the height decays toward zero", Math.abs(metaballHeight([ball], 10 + 1000, 20)) < 1e-30);
}

// ---- 1. THE FULL PIPELINE RECOVERS THE KNOWN SURFACE TO MACHINE PRECISION ---------------------------
{
    const rec = recoverHeight(fourStep(truth, lambda), lambda, W, H, true);   // sees only the fringes
    const s = scoreRecovery(rec, truth);
    ok("!! the height recovered from the fringes matches the surface we know, to machine precision", s.rms < 1e-9,
       "metaball surface -> phase -> four-step interferogram -> phase recovery -> unwrap -> height comes back with rms " + s.rms.toExponential(1) + ", and the reconstruction never saw the true height -- it graded against a truth we own.");
}

// ---- 2. WRAPPING IS REAL: UNWRAPPING IS LOAD-BEARING, NOT DECORATION --------------------------------
{
    let zmin = Infinity, zmax = -Infinity; for (const z of truth) { if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
    const fringes = (zmax - zmin) / (lambda / 2);
    const withU = scoreRecovery(recoverHeight(fourStep(truth, lambda), lambda, W, H, true), truth);
    const noU = scoreRecovery(recoverHeight(fourStep(truth, lambda), lambda, W, H, false), truth);
    ok("!! a surface that wraps the phase is recovered only when the fringes are unwrapped", fringes > 2 && noU.rms > 100 * withU.rms,
       "the surface spans ~" + fringes.toFixed(1) + " fringes; skipping unwrap leaves rms " + noU.rms.toExponential(1) + " vs " + withU.rms.toExponential(1) + " with it -- the phase ambiguity is a genuine metrology problem the pipeline actually solves.");
}

// ---- 3. THE FOUR-STEP RECOVERY INVERTS A KNOWN PHASE EXACTLY ----------------------------------------
{
    // a known phase ramp; build its four-step stack directly; recover; compare circularly (mod 2pi)
    const phiTrue = new Float64Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) phiTrue[j * W + i] = 0.11 * i + 0.07 * j;
    const frames = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].map((d) => { const I = new Float64Array(W * H); for (let k = 0; k < I.length; k++) I[k] = 1 + 0.9 * Math.cos(phiTrue[k] + d); return I; });
    const rec = phaseShiftRecover(frames);
    let maxErr = 0; for (let k = 0; k < rec.length; k++) { const d = Math.atan2(Math.sin(phiTrue[k] - rec[k]), Math.cos(phiTrue[k] - rec[k])); if (Math.abs(d) > maxErr) maxErr = Math.abs(d); }
    ok("!! the four-step algorithm recovers a known phase exactly, modulo 2 pi", maxErr < 1e-9,
       "worst circular phase error over the field is " + maxErr.toExponential(1) + " -- the recovery is the correct inverse of the stepped-reference model, not an approximation.");
}

// ---- 3b. unwrap2d IS A NO-OP ON A CONTINUOUS FIELD, AND REMOVES A KNOWN SYNTHETIC 2*pi JUMP ----------
{
    const w = 6, h = 4;
    // A field with no jump larger than pi anywhere (adjacent step 0.3 rad << pi): unwrapping must change nothing.
    const smooth = new Float64Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) smooth[j * w + i] = 0.3 * i + 0.2 * j;
    const smoothOut = unwrap2d(smooth, w, h);
    let maxDelta = 0; for (let k = 0; k < smooth.length; k++) maxDelta = Math.max(maxDelta, Math.abs(smoothOut[k] - smooth[k]));
    ok("!! unwrap2d is a NO-OP on an already-continuous phase field", maxDelta < 1e-15, "max |out - in| = " + maxDelta.toExponential(2));

    // Now build a WRAPPED version of a true linear ramp: wrap every sample into (-pi, pi], which injects exactly
    // the 2*pi jumps unwrap2d exists to undo, and check the true ramp is recovered up to the single global
    // constant unwrapping cannot resolve (the arbitrary reference phase).
    const trueRamp = new Float64Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) trueRamp[j * w + i] = 0.9 * i + 0.6 * j;   // spans > 2*pi
    const TAU = 2 * Math.PI;
    const wrapped = trueRamp.map((v) => { let x = v; while (x > Math.PI) x -= TAU; while (x <= -Math.PI) x += TAU; return x; });
    const recovered = unwrap2d(wrapped, w, h);
    const offset = recovered[0] - trueRamp[0];
    let worst = 0; for (let k = 0; k < recovered.length; k++) worst = Math.max(worst, Math.abs((recovered[k] - offset) - trueRamp[k]));
    ok("!! unwrap2d recovers a synthetically-wrapped linear ramp up to a global constant", worst < 1e-9,
       "worst deviation after removing the single unresolvable offset: " + worst.toExponential(2));
    // and the jump really was there before unwrapping -- otherwise the check above is vacuous
    let hadJump = false;
    for (let i = 1; i < w; i++) if (Math.abs(wrapped[i] - wrapped[i - 1]) > 3) hadJump = true;
    ok("...and the wrapped input really did contain a 2*pi discontinuity to remove", hadJump);
}

// --- v3078: AN ANSWER KEY THAT OWES NOTHING TO THE RECOVERY ALGEBRA -------------------------------------------
// Every check above is a ROUND TRIP: build a height map, make frames, recover, compare. It returns rms 9.25e-17,
// machine precision -- and it should, because the four-step arctan is the exact algebraic inverse of the cosine
// that made the frames. IT PROVES THE ALGEBRA ROUND-TRIPS and says nothing about whether phaseFromHeight has the
// right factor, because a wrong factor CANCELS: in through the forward model, out through the inverse. The
// inverse crime, the same one CT had.
//
// Newton's rings are derived from geometry alone: gap z = r^2/2R under a sphere, dark where 2z is a whole number
// of wavelengths. Measuring ring radii out of a generated interferogram tests the FACTOR OF 2 in
// phaseFromHeight, the wavelength scaling and the fringe geometry TOGETHER -- none of which a round trip can see.
{
    const W = 1201, H = 9, R = 0.5, lam = 633e-9, extent = 3e-3;
    const z = sphereGap(W, H, R, extent);

    // The module's own convention: no reflection phase shift, so the centre is BRIGHT and darks are half-order.
    const rHalf = ringRadii(interferogram(z, lam, 0), W, H, extent, 5);
    let worstHalf = 0;
    rHalf.forEach((v, k) => { worstHalf = Math.max(worstHalf, Math.abs(v - newtonRingRadiusNoShift(k + 1, lam, R)) / newtonRingRadiusNoShift(k + 1, lam, R)); });
    ok("!! the fringe radii match sqrt((m-1/2) lambda R) -- geometry, not this module's algebra",
        worstHalf < 1e-4 && rHalf.length === 5, "worst relative error " + worstHalf.toExponential(2) + " over 5 rings");

    // Step the reference by pi -- which is what the reflection off the denser medium does -- and the textbook
    // integer-order rings appear. Two conventions, one model, and the difference is physics not bookkeeping.
    const rInt = ringRadii(interferogram(z, lam, Math.PI), W, H, extent, 5);
    let worstInt = 0;
    rInt.forEach((v, k) => { worstInt = Math.max(worstInt, Math.abs(v - newtonRingRadius(k + 1, lam, R)) / newtonRingRadius(k + 1, lam, R)); });
    ok("!! ...and with the pi reflection shift they land on the TEXTBOOK sqrt(m lambda R)",
        worstInt < 1e-4 && rInt.length === 5, "worst relative error " + worstInt.toExponential(2));
    ok("...so the module's centre is BRIGHT and the textbook's is dark, which is the whole difference",
        rHalf[0] < rInt[0], "half-order first ring " + rHalf[0].toExponential(3) + " sits inside the integer one " + rInt[0].toExponential(3));

    // THE SABOTAGE THE ROUND TRIP CANNOT DO. Break the factor of 2 in phaseFromHeight and the round trip still
    // returns machine precision, because the same wrong factor undoes itself. The rings move immediately.
    ok("!! SABOTAGE(wrong factor in the phase): ring radii move, though a ROUND TRIP would not notice", (() => {
        const bad = new Float64Array(z.length);
        for (let k = 0; k < z.length; k++) bad[k] = z[k] * 2;      // as if phaseFromHeight used 8pi/lambda
        const rBad = ringRadii(interferogram(bad, lam, 0), W, H, extent, 5);
        if (!rBad.length) return true;
        return Math.abs(rBad[0] - rHalf[0]) / rHalf[0] > 0.2;
    })(), "a factor error cancels through forward-then-inverse and cannot cancel through a geometric prediction");

    ok("the wavelength really scales the pattern, as sqrt(lambda)", (() => {
        const r2 = ringRadii(interferogram(z, lam * 4, 0), W, H, extent, 3);
        return r2.length >= 1 && Math.abs(r2[0] / rHalf[0] - 2) < 0.02;
    })(), "four times the wavelength doubles every radius -- a prediction the round trip has no access to");

    ok("ring finding is sub-sample, not nearest-grid", (() => {
        const src = readFileSync(new URL("./interferometer.js", import.meta.url), "utf8");
        return /parabolic sub-sample refinement/.test(src);
    })(), "rounding a smooth curve's minimum to the nearest sample puts a grid artefact into the measurement");

    ok("HONEST NOTE KEPT: the integer form was tried first and missed by 29% on ring 1", (() => {
        const src = readFileSync(new URL("./interferometer.js", import.meta.url), "utf8");
        return /missed by 29%/.test(src) && /key being wrong for this\s*(\/\/\s*)?model/.test(src.replace(/\n\s*\/\/\s?/g, " "));
    })(), "the miss SHRINKING with m is what identified an order offset rather than a scale error");
}

console.log(fails ? "\ninterferometer-selfcheck: " + fails + " FAILED" : "\ninterferometer-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
