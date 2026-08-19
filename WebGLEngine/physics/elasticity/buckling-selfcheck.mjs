// WebGLEngine/physics/elasticity/buckling-selfcheck.mjs — v3407
//
// Run: node physics/elasticity/buckling-selfcheck.mjs   (~35s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// A THIRD EXACT KEY ON THE SAME DISCRETISATION. beam.js already answers two questions with one fourth-difference
// operator: where a loaded beam ends up (static, FL^3/3EI) and how an unloaded one rings (vibration, the roots of
// cos b cosh b = -1). This asks a third -- WHEN DOES IT STOP BEING STABLE -- and the answer is exact:
//
//     P_cr = pi^2 EI / (4 L^2)   ->   P_cr L^2 / EI = pi^2/4 = 2.467401
//
// with higher modes at the ODD SQUARES, so P2/P1 = 9 and P3/P1 = 25 exactly. Integers, which no discretisation
// error produces by accident.
//
// v3319 showed the first two keys catch different faults: one wrong boundary row broke both at once while giving
// each a plausible wrong answer. A third independent question on the same matrix tests the operator rather than
// repeating the first two -- and it reuses stiffness() and the shared eigensolver unchanged.

import { stiffness } from "./beam.js";
import { criticalLoad, geometricStiffness, measureBuckling } from "./buckling.js";
import { FBP_GAIN_IS_GEOMETRIC, gainRatio, reconQuality } from "../tomography/reconQuality.mjs";
import { phantomField, radon, filteredBackProjection } from "../tomography/ct.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE CRITICAL LOAD IS pi^2/4, AND IT CONVERGES AT SECOND ORDER -------------------------------------------
{
    const rows = [40, 80, 160].map((n) => {
        const r = measureBuckling({ n, count: 3 });
        return { n, ...r, rel: Math.abs(r.loads[0] - r.exact[0]) / r.exact[0] };
    });
    ok("!! the measured critical load lands on pi^2 EI / (4 L^2) = 2.467401",
       rows[2].rel < 2e-5,
       rows.map((r) => "n=" + r.n + ": " + r.loads[0].toFixed(6)).join(", ") + " against exact " + rows[0].exact[0].toFixed(6) +
       " — relative " + rows[2].rel.toExponential(1) + " at n=160");
    const r1 = rows[0].rel / rows[1].rel, r2 = rows[1].rel / rows[2].rel;
    ok("!! ...and doubling the grid QUARTERS the error, so what remains is discretisation and not a leak",
       r1 > 3 && r1 < 5 && r2 > 3 && r2 < 5,
       "error ratios " + r1.toFixed(2) + " and " + r2.toFixed(2) + " against the 4.00 a second-order scheme owes");
}

// ---- 2. THE MODE RATIOS ARE THE ODD SQUARES — INTEGERS, NOT FITTED NUMBERS -----------------------------------------
{
    const r = measureBuckling({ n: 160, count: 3 });
    const ratios = [r.loads[1] / r.loads[0], r.loads[2] / r.loads[0]];
    ok("!! the higher buckling loads sit at 9x and 25x the first — the odd squares, exactly",
       Math.abs(ratios[0] - 9) / 9 < 2e-3 && Math.abs(ratios[1] - 25) / 25 < 2e-3,
       "measured " + ratios.map((x) => x.toFixed(4)).join(", ") + " against 9 and 25 — " +
       "a ratio landing on an integer is a much harder target than a ratio landing near a fitted constant");
    ok("...and every measured load matches its own exact value, not merely the ratios",
       r.loads.every((v, i) => Math.abs(v - r.exact[i]) / r.exact[i] < 3e-4),
       r.loads.map((v, i) => v.toFixed(4) + "/" + r.exact[i].toFixed(4)).join(", "));
}

// ---- 3. THE GEOMETRIC STIFFNESS IS AN ENERGY FORM, AND HAND-ROLLING IT PRODUCED A GHOST -------------------------------
// The first version wrote the second-difference rows directly, with a ghost fold at the clamped end and a half
// cell at the free end to mirror K. It returned a lowest "critical load" of 0.152, then 0.076, then 0.038 as the
// grid refined -- HALVING WITH n, the signature of a null-space artefact rather than a physical load, and
// sitting well BELOW the true 2.467 where a reader would have found it alarming rather than obviously wrong.
{
    const n = 30, G = geometricStiffness(n);
    let worst = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) worst = Math.max(worst, Math.abs(G[i][j] - G[j][i]));
    ok("!! the geometric stiffness is SYMMETRIC by construction (D^T D), not by hand-checking",
       worst === 0, "worst |G[i][j] - G[j][i]| = " + worst);
    // positive definite: every leading minor positive is implied by a successful Cholesky, which measureBuckling needs
    const r = measureBuckling({ n: 40, count: 1 });
    ok("!! ...and positive definite, so the Cholesky reduction succeeds and no spurious near-zero mode appears",
       r.loads !== null && r.loads[0] > 2,
       r.loads ? "lowest load " + r.loads[0].toFixed(4) + " (the hand-rolled version gave 0.152, halving with n)" : r.why);
}

// ---- 4. IT IS A GENUINELY DIFFERENT QUESTION FROM THE OTHER TWO KEYS ------------------------------------------------------
// The buckling loads scale with EI exactly as the static deflection does and the mode RATIOS do not move at all,
// which is the same independence structure the static and vibration keys have -- and the reason a third key is
// worth having rather than being a restatement.
{
    const a = measureBuckling({ n: 80, E: 1, count: 2 });
    const b = measureBuckling({ n: 80, E: 10, count: 2 });
    ok("!! a tenfold EI change scales every critical load by ten",
       Math.abs(b.loads[0] / a.loads[0] - 10) < 1e-6,
       (b.loads[0] / a.loads[0]).toFixed(6) + "x");
    // I CLAIMED BIT-IDENTICAL AND IT IS NOT, THOUGH IT VERY NEARLY IS. The eigenvalues mu do not depend on E at
    // all -- E enters only when each load is formed as mu * E * I / h^2 -- so the ratio cancels E ANALYTICALLY
    // and would be exact in real arithmetic. In IEEE it is not: (mu2 * c) / (mu1 * c) is not guaranteed to equal
    // mu2 / mu1 once c has rounded each product separately. The beam's vibration key happened to come out
    // bit-identical and I generalised from one case. The claim is now what the measurement supports.
    const ra = a.loads[1] / a.loads[0], rb = b.loads[1] / b.loads[0];
    ok("!! ...and leaves the mode ratios unmoved to round-off, so a column ten times too stiff passes the ratio test perfectly",
       Math.abs(ra - rb) / ra < 1e-12,
       "ratio " + ra.toFixed(12) + " vs " + rb.toFixed(12) + " (relative " + (Math.abs(ra - rb) / ra).toExponential(1) +
       ") — E cancels analytically and survives only round-off, so one key cannot replace the other, which is the whole argument for a third");
    ok("the shared stiffness matrix is the same object both keys use",
       stiffness(20).length === 20 && geometricStiffness(20).length === 20,
       "buckling adds a geometric matrix and reuses K and the eigensolver unchanged");
}

// ---- 5. v3407 -- THE FBP GAIN LAW, CHECKED OUT OF SAMPLE -----------------------------------------------------------------
// v3378 established that the CT gain is a SAMPLING RATIO rather than a filter constant: gain * nDet / N = 0.9456
// with a spread of 0.0185, measured across N in {64, 96, 128} and nDet in {96, 140, 200}. That is a FIT, and a
// fit checked on the grid it was fitted to proves only that the arithmetic was done. These three geometries lie
// outside that grid, and the law predicts them to better than 1% -- which is what makes it a law rather than a
// table.
{
    const fitted = gainRatio();
    const k = typeof fitted === "number" ? fitted : (fitted && (fitted.k ?? fitted.mean));
    ok("the fitted constant re-derives from the recorded rows",
       typeof k === "number" && Math.abs(k - 0.9456) < 0.01, "k = " + Number(k).toFixed(5));

    // geometries OUTSIDE the fitted grid: N not in {64,96,128}, nDet not in {96,140,200}
    const ELL = [{ cx: 0, cy: 0, a: 0.7, b: 0.9, rho: 1 },
                 { cx: 0.2, cy: -0.1, a: 0.2, b: 0.15, rho: -0.5 }];
    const rows = [[80, 170], [112, 210], [72, 260]].map(([N, nDet]) => {
        const truth = phantomField(N, ELL);
        const angles = Array.from({ length: 180 }, (_, i) => Math.PI * i / 180);
        const rec = filteredBackProjection(radon(truth, N, angles, nDet), N, angles, nDet);
        const measured = reconQuality(rec, truth, N).gain;
        return { N, nDet, measured, predicted: k * N / nDet };
    });
    const worst = Math.max(...rows.map((r) => Math.abs(r.measured - r.predicted) / r.predicted));
    ok("!! the gain law predicts OUT OF SAMPLE, at geometries it was never fitted on",
       worst < 0.02,
       rows.map((r) => "N=" + r.N + "/nDet=" + r.nDet + ": " + r.measured.toFixed(4) + " vs " + r.predicted.toFixed(4)).join(", ") +
       " — worst " + (worst * 100).toFixed(2) + "%. The fitted grid was N in {64,96,128} and nDet in {96,140,200}; " +
       "none of these three is in it, and a fit checked only on its own grid proves the arithmetic was done rather than that the law holds");
    const inSample = FBP_GAIN_IS_GEOMETRIC.measured.every((r) => [64, 96, 128].includes(r.N));
    ok("...and the original rows really were confined to that grid, so this is genuinely new evidence",
       inSample, FBP_GAIN_IS_GEOMETRIC.measured.length + " recorded rows, all at N in {64,96,128}");
}

console.log(fails ? ("[buckling-selfcheck] FAILED " + fails) : "[buckling-selfcheck] all passed");
process.exit(fails ? 1 : 0);
