// WebGLEngine/physics/md/maxwellSpeed-selfcheck.mjs -- v3810
//
// Run: node physics/md/maxwellSpeed-selfcheck.mjs   (~1s, MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered by filename).
//
// THE MAXWELL-BOLTZMANN SPEED DISTRIBUTION, GRADED AGAINST DIMENSIONLESS FACTS ABOUT SPACE RATHER THAN NUMBERS.
//
// physics/md/thermostat.js reads a temperature from kinetic energy every step; nothing had ever graded the
// SHAPE the speeds are supposed to have. Every key here carries neither kT nor m:
//   - v_p : <v> : v_rms is a function of the DIMENSION alone, and for d=3 it is sqrt(2):sqrt(8/pi):sqrt(3).
//   - <(1/2) m v^2> = (d/2) kT EXACTLY -- the same equipartition thermostat.temperature() inverts, so a sample
//     drawn here and handed to that shipped function must return the T it was drawn at.
//   - The closed-form moment (Gamma) and a Gamma-FREE quadrature and a Gaussian-component SAMPLE are three
//     routes sharing no code, and they must all land on the same number.
//
// *** THE DIMENSION IS LOAD-BEARING, NOT DECORATION: the 2D (Rayleigh) ratios differ from the 3D ones, and a
// plant that grades a 3D sample against 2D moments fires. d=1 has NO most-probable speed (the half-Gaussian
// peaks at the origin), which is refused rather than reported as a speed. ***

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
    gammaFn, mbPdf, moment, momentQuad, rmsSpeed, meanSpeed, mostProbableSpeed,
    meanKE, speedRatios, sampleSpeeds, sampleMoment, recoverKT,
} from "./maxwellSpeed.mjs";
import { temperature } from "./thermostat.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));

// ---- 0. THE ONE SPECIAL FUNCTION IS AN EXTERNAL ANCHOR, NOT A ROUTINE TRUSTED ON FAITH -----------------------
{
    ok("!! Gamma(1) = 1 and Gamma(1/2) = sqrt(pi)",
        rel(gammaFn(1), 1) < 1e-13 && rel(gammaFn(0.5), Math.sqrt(Math.PI)) < 1e-13,
        "every moment below rides on this routine, so it is pinned against values known in closed form " +
        "rather than believed -- a wrong Gamma would make three agreeing routes agree on the wrong number");
    ok("Gamma(3/2)=sqrt(pi)/2, Gamma(5/2)=3sqrt(pi)/4, Gamma(4)=6",
        rel(gammaFn(1.5), Math.sqrt(Math.PI) / 2) < 1e-13 &&
        rel(gammaFn(2.5), 3 * Math.sqrt(Math.PI) / 4) < 1e-13 &&
        rel(gammaFn(4), 6) < 1e-12,
        "half-integer and integer arguments, both of which the moment formula reaches");
}

// ---- 1. THE PDF NORMALISES, AND THE GENERAL FORM REDUCES TO THE TEXTBOOK 3D ONE ------------------------------
{
    const kT = 2.5, m = 1.3, d = 3;
    // trapezoid of the full pdf (which DOES use Gamma) -- a normalisation is a claim the normaliser is right
    const vMax = 12 * rmsSpeed(kT, m, d), N = 400000, h = vMax / N;
    let s = 0;
    for (let i = 0; i <= N; i++) { const v = i * h; const w = (i === 0 || i === N) ? 0.5 : 1; s += w * mbPdf(v, kT, m, d); }
    s *= h;
    ok("!! the speed pdf integrates to 1", rel(s, 1) < 1e-9, "INT f(v) dv = " + s.toFixed(12));

    // the d=3 chi form must BE the textbook 4*pi*(m/2*pi*kT)^(3/2) v^2 exp(...), not merely close to it
    let worst = 0;
    for (const v of [0.4, 1.1, 1.9, 3.3, 5.0]) {
        const tb = 4 * Math.PI * Math.pow(m / (2 * Math.PI * kT), 1.5) * v * v * Math.exp(-m * v * v / (2 * kT));
        worst = Math.max(worst, rel(mbPdf(v, kT, m, d), tb));
    }
    ok("!! the general chi form IS the textbook 3D Maxwell pdf", worst < 1e-13,
        "worst relative gap over five speeds = " + worst.toExponential(2) +
        " -- the general d-dimensional form was written once and must collapse to the known d=3 case exactly");
}

// ---- 2. TWO ROUTES SHARING NO CODE: CLOSED-FORM MOMENT vs GAMMA-FREE QUADRATURE -----------------------------
{
    let worst = 0, where = "";
    for (const [kT, m] of [[2.5, 1.3], [40, 6.5], [0.7, 0.9]]) {
        for (const n of [1, 2, 3, 4]) {
            const a = moment(n, kT, m, 3), b = momentQuad(n, kT, m, 3);
            const r = rel(a, b);
            if (r > worst) { worst = r; where = "n=" + n + " kT=" + kT + " m=" + m; }
        }
    }
    ok("!! closed-form moments == Gamma-free quadrature (n=1..4, three (kT,m))", worst < 1e-8,
        "worst " + worst.toExponential(2) + " at " + where + " -- one route is (2kT/m)^(n/2) Gamma((d+n)/2)/Gamma(d/2), " +
        "the other is INT v^n g / INT g with the normaliser cancelled, so Gamma never enters it. Agreement is corroboration, not a tautology");
}

// ---- 3. THE EXACT DIMENSIONLESS RATIOS, AND THEY DO NOT MOVE WITH kT OR m (THE CONTROL) ----------------------
{
    const r = speedRatios(3);
    ok("!! <v>/v_rms = sqrt(8/(3*pi)) and v_p/v_rms = sqrt(2/3)",
        rel(r.mean_over_rms, Math.sqrt(8 / (3 * Math.PI))) < 1e-12 && rel(r.peak_over_rms, Math.sqrt(2 / 3)) < 1e-12,
        "mean/rms = " + r.mean_over_rms.toFixed(9) + ", peak/rms = " + r.peak_over_rms.toFixed(9) +
        " -- pure numbers, from the geometry of a 3D Gaussian and nothing in this file");

    // CONTROL: the ratios carry no kT and no m, so scaling both must move them by nothing.
    const base = speedRatios(3);
    const scaledMor = meanSpeed(25, 6.5, 3) / rmsSpeed(25, 6.5, 3);       // kT x10, m x5
    const scaledPor = mostProbableSpeed(25, 6.5, 3) / rmsSpeed(25, 6.5, 3);
    const moveM = Math.abs(base.mean_over_rms - scaledMor), moveP = Math.abs(base.peak_over_rms - scaledPor);
    ok("!! the ratios are INVARIANT under kT x10 and m x5", moveM < 1e-14 && moveP < 1e-14,
        "mean/rms moved " + moveM.toExponential(2) + ", peak/rms moved " + moveP.toExponential(2) +
        " -- a ratio that shifted with temperature or mass would not be a fact about the distribution's shape");
}

// ---- 4. EQUIPARTITION, AND THE CONSUMER: physics/md/thermostat.js READS BACK THE T IT WAS DRAWN AT ----------
{
    const kT = 2.5, m = 1.3, d = 3;
    ok("!! <(1/2) m v^2> = (d/2) kT exactly", rel(meanKE(kT, m, d), 1.5 * kT) < 1e-12,
        "meanKE = " + meanKE(kT, m, d).toFixed(12) + " against (3/2)kT = " + (1.5 * kT) +
        " -- equipartition is the identity the thermostat inverts, so this is the join's other half stated in closed form");

    // Hand a real draw to the shipped thermometer. masses all m, dof = 3N (no COM removal), kB = 1.
    const { vel } = sampleSpeeds(200000, kT, m, 3, 777);
    const masses = new Float64Array(200000).fill(m);
    const Tread = temperature(vel, masses, 3 * 200000);
    ok("!! thermostat.temperature() recovers the drawn kT from these velocities",
        rel(Tread, kT) < 5e-3,
        "read " + Tread.toFixed(5) + " against kT = " + kT + " -- the sampler here and the thermometer in " +
        "physics/md/thermostat.js are two files that had never met; the sample is drawn cold and the shipped " +
        "function is not told the answer. The 5e-3 window is the sampling error at N=2e5, not a tuned tolerance");
    ok("recoverKT (from speeds) agrees with the thermometer (from velocities)",
        rel(recoverKT(sampleSpeeds(200000, kT, m, 3, 777).speeds, m, 3), Tread) < 1e-9,
        "same draw, two inversions of the same equipartition, one on speeds and one on components");
}

// ---- 5. THE SAMPLE CONVERGES AT 1/sqrt(N), MEASURED AS AN ORDER RATHER THAN A THRESHOLD --------------------
{
    const kT = 2.5, m = 1.3, d = 3, target = meanSpeed(kT, m, d), SEEDS = 48;
    const Ns = [1000, 4000, 16000, 64000], rms = [];
    for (const N of Ns) {
        let s2 = 0;
        for (let sd = 1; sd <= SEEDS; sd++) { const { speeds } = sampleSpeeds(N, kT, m, d, sd * 101 + 7); const e = sampleMoment(speeds, 1) - target; s2 += e * e; }
        rms.push(Math.sqrt(s2 / SEEDS));
    }
    // log-log slope of RMS error vs N; the standard error of a mean falls as N^(-1/2)
    let sx = 0, sy = 0, sxx = 0, sxy = 0, n = Ns.length;
    for (let i = 0; i < n; i++) { const x = Math.log(Ns[i]), y = Math.log(rms[i]); sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const order = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    ok("!! the Gaussian-component sample converges to the closed form at order ~ -1/2",
        order < -0.35 && order > -0.65,
        "fitted log-log order = " + order.toFixed(4) + " over RMS-of-" + SEEDS + "-seeds at N in {" + Ns.join(",") + "}" +
        " -- the seeds are fixed so this number is bit-reproducible; a rate, not a threshold, so no tolerance was chosen");
    say("RMS <v> error: " + Ns.map((N, i) => "N=" + N + " " + rms[i].toExponential(2)).join("  "));
}

// ---- 6. THE DIMENSION IS LOAD-BEARING: 2D RATIOS DIFFER, AND GRADING 3D AGAINST 2D FIRES -------------------
{
    const R2 = speedRatios(2), R3 = speedRatios(3);
    const gap = Math.abs(R2.mean_over_rms - R3.mean_over_rms);
    ok("!! the 2D (Rayleigh) mean/rms differs from the 3D one", gap > 0.03,
        "2D = " + R2.mean_over_rms.toFixed(6) + ", 3D = " + R3.mean_over_rms.toFixed(6) + ", apart by " + gap.toFixed(6) +
        " -- the ratio is a fact about a SPECIFIC dimension, so the count of degrees of freedom is part of the key");

    // PLANT: grade a genuine 3D sample against the 2D predicted mean/rms. It must be caught, not tolerated.
    const kT = 2.5, m = 1.3;
    const { speeds } = sampleSpeeds(400000, kT, m, 3, 999);
    const sampleMoverRms = sampleMoment(speeds, 1) / Math.sqrt(sampleMoment(speeds, 2));
    const vs3D = Math.abs(sampleMoverRms - R3.mean_over_rms);
    const vs2D = Math.abs(sampleMoverRms - R2.mean_over_rms);
    ok("!! the 3D sample matches the 3D key and the 2D key (the plant) fails on it",
        vs3D < 5e-3 && vs2D > 0.03,
        "sample mean/rms = " + sampleMoverRms.toFixed(6) + " -> off 3D by " + vs3D.toExponential(2) +
        " but off 2D by " + vs2D.toFixed(6) + ": a wrong dimension is a wrong answer, not a loose tolerance");

    ok("d=1 has no most-probable SPEED (peak at the origin), and it is refused",
        mostProbableSpeed(2.5, 1.3, 1) === null,
        "sqrt((d-1)kT/m) = 0 at d=1, which is the peak of the half-Gaussian rather than a speed -- returning 0 " +
        "would be a number wearing a speed's costume, so it returns null instead");
}

// ---- 7. BROWSER-SAFE, AS THE HEADER CLAIMS (this is the MD consumer's own environment) ---------------------
{
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.join(HERE, "maxwellSpeed.mjs"), "utf8");
    // match IMPORTS, never mentions -- the string "node:" appears in this gate's own prose and must not count
    ok("the module imports no node builtins and touches no DOM",
        !/\bfrom\s+["']node:/.test(src) && !/\brequire\s*\(/.test(src) && !/\bdocument\.|\bwindow\./.test(src),
        "the distribution has to run in the same browser the MD sim does; a node: import at module scope would " +
        "make it a module physics/md/ could not load");
}

say("");
say("NOT CLAIMED: that a running MD trajectory PRODUCES this distribution. This grades the identity -- IF the");
say("velocity components are Gaussian THEN the speed moments are these and the thermostat reads them back -- and");
say("the sampler constructs that premise rather than earning it from md.js's integrator. Wiring this to a live");
say("trajectory (does thermostat.js relax INTO Maxwell-Boltzmann?) is the next round and moves lab-results, so");
say("it is a device edit and Marla's call. NO DEVICE BIND, NO lab-results-baseline change here (v3613's pattern).");
say("NOT CLAIMED: interactions. This is the ideal gas -- no collisions, no potential, no pair correlation.");

console.log("maxwellSpeed-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
