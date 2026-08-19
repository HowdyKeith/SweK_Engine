// tools/roundhouse/plasmaKrbn-selfcheck.mjs
//
// Run: node tools/roundhouse/plasmaKrbn-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2896 -- three things at once, and the first one exists because of the other two's ancestors.
//
//   1. THE TAUTOLOGY GUARD, promoted from habit to code. Three rounds produced three measurements that could not
//      possibly disagree with their answer keys, each caught by a human noticing an exact zero: v2892's
//      portability flag computed on an un-awaited promise, v2894's Roche radius inverted from the formula it was
//      graded against, v2895's dispersion measure graded against the function that IS its closed form. The
//      signature was identical every time. suspiciousZero() makes it structural.
//
//   2. PLASMA LENSING, and the answer is a sign. n = sqrt(1 - omega_p^2/omega^2) < 1, so light SPEEDS UP in a
//      density clump and bends away from it: an overdense blob is a DIVERGING lens. Using a blobulator as
//      magnifying optics would defocus the thing you wanted to see. The device measures that rather than
//      asserting it -- rays integrated through the numerically-differenced index field, never shown the formula.
//
//   3. KRBN CAN RENDER PROBE DATA, verified rather than assumed: a real Schwarzschild geodesic projects into
//      krbn's camera, every sample lands in the viewport, and -- because krbn's projection is invertible against
//      geometry -- the track is recoverable, which is what makes it a data view rather than a picture of one.

import { suspiciousZero, gradedAgainstKey, scanForTautologies } from "./suspiciousZero.mjs";
import { buildBlob } from "./blobThermalBind.mjs";
import { project, KRBN_CAM } from "../krbn/krbnCompare.js";
import { flyProbe, circularL } from "../../physics/blackhole/probe.js";
import { buildTidal } from "./tidalBind.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE GUARD ------------------------------------------------------------------------------------------------
{
    ok("!! a bare exact zero is flagged SUSPICIOUS", suspiciousZero(0).suspicious === true,
        "three rounds running, an unexplained 0.0 meant the measurement and its key were the same expression");
    ok("...and -0 is caught too, since it is the same story with a sign bit", suspiciousZero(-0).suspicious === true);
    ok("!! an exact zero WITH a stated reason passes -- this is a guard, not a ban",
        suspiciousZero(0, "ISCO = 6M with M = 1 is exactly representable").suspicious === false,
        "the ceremony is cheap; being unable to state a reason is the finding");
    ok("a real measurement error is simply nonzero", suspiciousZero(3.96e-3).verdict === "nonzero");
    const g = gradedAgainstKey(0, 1e-6);
    ok("!! gradedAgainstKey REFUSES a tautological pass even though 0 < tol", g.ok === false && g.suspicious === true,
        "a bare `err < tol` would have waved through every one of the three bugs");
    ok("...and accepts a genuine one", gradedAgainstKey(3.96e-3, 1e-2).ok === true);

    // the scanner, pointed at a REAL device output
    const roche = buildTidal({ mode: "roche" });
    ok("!! scanning the repaired Roche mode finds no unexplained zeros", scanForTautologies(roche).length === 0,
        "rocheErrFrac = " + roche.rocheErrFrac.toExponential(2) + " -- nonzero since v2894, which is how we know it stopped inverting its own key");
    ok("...while a fabricated tautology is caught by the scanner",
        scanForTautologies({ fooErrFrac: 0, barDeviation: 0 }).length === 2);
}

// ---- 2. PLASMA LENSING: THE BLOB IS THE WRONG SIGN OF LENS --------------------------------------------------------
{
    const runs = [0.2, 0.4, 0.6, 0.8].map((b) => buildBlob({ mode: "plasmalens", config: { dmAmp: 0.02, dmRadius: 1, nuLo: 1, bImpact: b } }));
    ok("!! at EVERY impact parameter the blob bends light OUTWARD -- it is a diverging lens",
        runs.every((r) => r.diverging === true && r.lensSign === "diverging" && r.focalLength < 0),
        "focal lengths " + runs.map((r) => r.focalLength.toFixed(1)).join(", ") +
        " -- all negative. A blobulator used as magnifying optics would DEFOCUS the thing you wanted to see, because " +
        "plasma has n < 1 and light speeds up in the clump");
    ok("!! the measured deflection matches the thin-lens closed form, with REAL error",
        runs.every((r) => r.bendErrFrac > 0 && r.bendErrFrac < 0.01),
        "errors " + runs.map((r) => r.bendErrFrac.toExponential(1)).join(", ") +
        " -- the ray integrator differences the index field numerically and never sees (32/35)(3.5) a b u^2.5 / (nu^2 r)");
    ok("...and the guard agrees this one is honestly measured",
        runs.every((r) => suspiciousZero(r.bendErrFrac).suspicious === false));
    // deflection must vanish on the axis (symmetry) and at the support edge (no gradient outside)
    const axis = buildBlob({ mode: "plasmalens", config: { dmAmp: 0.02, dmRadius: 1, nuLo: 1, bImpact: 1e-6 } });
    ok("deflection vanishes on the axis, as symmetry demands", Math.abs(axis.bendMeasured) < 1e-6,
        "a ray straight through the centre sees no transverse gradient");
}

// ---- 3. KRBN RENDERS PROBE DATA ----------------------------------------------------------------------------------
{
    const M = 1, rT = 12;
    const fly = flyProbe(M, { r0: rT, L: circularL(M, rT) * 1.06, turns: 2, dphi: 2e-4, sampleEvery: 40 });
    const S = 1 / 6;                                     // krbn's camera stands ~10 units off; a 12M orbit must be scaled in
    const pts = fly.samples.map((s) => [S * s.r * Math.cos(s.phi), S * s.r * Math.sin(s.phi), 0]);
    const scr = pts.map((p) => project(p, KRBN_CAM));
    const vis = scr.filter(Boolean);
    ok("!! a real Schwarzschild geodesic projects into krbn's camera -- every sample",
        vis.length === pts.length && pts.length > 1000,
        vis.length + " of " + pts.length + " samples projected; krbn's projection is a plain pinhole, so probe data goes " +
        "through it exactly like scene geometry does");
    const xs = vis.map((v) => v[0]), ys = vis.map((v) => v[1]);
    ok("...and the whole track lands inside the viewport",
        Math.min(...xs) > 0 && Math.max(...xs) < KRBN_CAM.viewport.width && Math.min(...ys) > 0 && Math.max(...ys) < KRBN_CAM.viewport.height,
        "bbox x " + Math.min(...xs).toFixed(0) + ".." + Math.max(...xs).toFixed(0) + ", y " + Math.min(...ys).toFixed(0) + ".." +
        Math.max(...ys).toFixed(0) + " of " + KRBN_CAM.viewport.width + "x" + KRBN_CAM.viewport.height);
    ok("!! points BEHIND the camera are refused rather than folded to a wrong place",
        project([0, 0, 100], KRBN_CAM) === null || project([-50, -50, 0], KRBN_CAM) === null,
        "the projection returns null for cz <= 0, so a track that leaves the frustum reports the gap instead of drawing a lie");
    // the scale commitment is a choice and should be stated, not buried
    ok("the scene scale is an explicit choice, not a fudge", S > 0 && rT * S < 4,
        "12M orbit scaled by 1/6 to sit inside a camera standing 10 units out -- stated, like every other unit commitment here");
}

console.log();
if (fails) { console.log("plasmaKrbn-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("plasmaKrbn-selfcheck: all checks pass");
