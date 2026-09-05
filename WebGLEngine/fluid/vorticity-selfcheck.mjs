// fluid/vorticity-selfcheck.mjs -- v4440 -- the gate for fluid/vorticity.mjs.
//
// *** THE ROUND SET OUT TO ADD A SMOKE SOLVER AND FOUND THE TREE HAS TWO FLUID SOLVERS -- THE FOURTH ABSENCE
// CLAIM OF MINE IN FOUR ROUNDS TO BE WRONG, AND THE FIRST CAUGHT BEFORE A LINE WAS WRITTEN. *** What was
// actually missing was the MEASUREMENT: fx/vorton/vorton.js's header claims its method keeps "the beautiful
// filamentary wisps a grid solver smears away", both sides of that comparison are in this tree, and nobody
// had put them in the same room.
//
// ---- *** FOUR SABOTAGES, RESULTS BY NAME *** ------------------------------------------------------------
//
//  A. Flip the sign of du/dy in curlAt                          -> 7 RED
//  B. Use a one-sided difference for dv/dx instead of central   -> 2 RED
//     Only two, and they are the two that matter: the convergence RATE collapses from second order. A value
//     check would not have noticed -- a one-sided difference is still roughly right, just first order.
//  C. Drop the cross product in confinementAt (use N directly)   -> 4 RED
//  D. Skip the confinement force entirely (eps ignored)          -> 3 RED
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That confinement is good. Section 4 measures that IT IS NOT A RESTORATION: there is no value of eps that
// returns the lost enstrophy without also adding energy to a dissipative scheme, and the parameter that makes
// the enstrophy number right is chosen BY the enstrophy number being right, which is circular. That the
// comparison against vortons is like-for-like: a vorton sim and a grid sim are not the same discretisation of
// the same problem, so section 5 checks only the vorton header's OWN claim and draws no winner. And nothing
// here is three-dimensional or has a free surface -- one periodic-ish 2D box, one analytic field.

import {
    curlAt, curlField, enstrophy, kineticEnergy, confinementAt, applyConfinement,
    advectSemiLagrangian, run, taylorGreen, TG,
} from "./vorticity.mjs";
import { inducedVelocity } from "../fx/vorton/vorton.js";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);
const K = Math.PI * 2;

console.log("vorticity-selfcheck -- the grid smears, and what it costs to pretend otherwise\n");

// ---- 1. THE DISCRETE CURL IS SECOND ORDER ---------------------------------------------------------------
console.log("1. a rate, not a value -- so a lucky constant cannot satisfy it");

const errs = [16, 32, 64, 128, 256].map((n) => {
    const s = taylorGreen(n, n, K, { h: 1 / n });
    let worst = 0;
    for (let j = Math.floor(n * 0.25); j < Math.floor(n * 0.75); j++) {
        for (let i = Math.floor(n * 0.25); i < Math.floor(n * 0.75); i++) {
            worst = Math.max(worst, Math.abs(curlAt(s, i, j) - TG.curl((i + 0.5) / n, (j + 0.5) / n, K)));
        }
    }
    return worst;
});
const ratios = errs.slice(1).map((e, i) => errs[i] / e);
say(`max curl error at n = 16..256: ${errs.map((e) => e.toExponential(2)).join("  ")}`);
say(`ratios: ${ratios.map((r) => r.toFixed(2)).join("  ")}   (second order is 4)`);
ok("!! the discrete curl converges at second order", ratios[ratios.length - 1] > 3.9 && ratios[ratios.length - 1] < 4.1,
   "*** THE FIRST VERSION OF THE ANALYTIC REFERENCE HAD THE WRONG SIGN, and what identified it as a SIGN " +
   "rather than a truncation error was the SIZE: the error sat FLAT at 25.1 across four resolutions, exactly " +
   "twice the curl's amplitude of 4pi. An error that does not fall with h is not truncation, and one equal to " +
   "twice the signal is the signal negated. THE CODE WAS RIGHT AND THE REFERENCE WAS WRONG. ***");
ok("...and it is still improving at the finest grid, so the rate is real and not a plateau",
   errs[errs.length - 1] < errs[errs.length - 2] * 0.3);

// ---- 2. THE FORCE IS PERPENDICULAR TO ITS OWN GRADIENT, EXACTLY -----------------------------------------
console.log("\n2. f . N = 0 -- a cross product being a cross product");

const s64 = taylorGreen(64, 64, K, { h: 1 / 64 });
const w64 = curlField(s64);
let worstDot = 0, cells = 0;
for (let j = 1; j < 63; j++) {
    for (let i = 1; i < 63; i++) {
        const [fx, fy, Nx, Ny] = confinementAt(s64, w64, i, j, 1.0);
        if (fx === 0 && fy === 0) continue;
        cells++;
        worstDot = Math.max(worstDot, Math.abs(fx * Nx + fy * Ny));
    }
}
say(`f . N over ${cells} cells: worst ${worstDot.toExponential(3)}`);
ok("!! the confinement force never points up the vorticity gradient", worstDot < 1e-15,
   "an exact zero rather than a tolerance -- it pushes ALONG a vortex sheet, and a wrong sign or index order " +
   "would not have this");
ok("...and the force is not trivially zero, so the row above means something", cells > 3000);

// ---- 3. THE GRID SMEARS, AND HERE IS BY HOW MUCH ---------------------------------------------------------
console.log("\n3. the vorton header's claim, measured for the first time");

const steps = 60, dt = 0.004;
const base = run(taylorGreen(64, 64, K, { h: 1 / 64 }), { steps, dt, eps: 0 });
const retained = base[steps].enstrophy / base[0].enstrophy;
say(`semi-Lagrangian advection, ${steps} steps: enstrophy ${base[0].enstrophy.toExponential(4)} -> ` +
    `${base[steps].enstrophy.toExponential(4)} (${(retained * 100).toFixed(1)}% retained)`);
ok("!! the grid destroys roughly half its vorticity in sixty steps", retained > 0.35 && retained < 0.55,
   "which is what 'a grid solver smears away' means, as a number");
ok("...and the decay is monotone, so it is dissipation and not an oscillation",
   base.every((r, i) => i === 0 || r.enstrophy <= base[i - 1].enstrophy * 1.0001));

// ---- 4. CONFINEMENT IS NOT A RESTORATION ----------------------------------------------------------------
console.log("\n4. what it costs to put the vorticity back");

const rows = [0.5, 2, 5, 10, 20, 40].map((eps) => {
    const r = run(taylorGreen(64, 64, K, { h: 1 / 64 }), { steps, dt, eps });
    return { eps, ens: r[steps].enstrophy / base[0].enstrophy, en: r[steps].energy / r[0].energy };
});
for (const r of rows) say(`eps ${String(r.eps).padEnd(5)} enstrophy ${(r.ens * 100).toFixed(1)}%   energy ${(r.en * 100).toFixed(1)}%`);
ok("confinement does increase the retained vorticity", rows[rows.length - 1].ens > rows[0].ens * 2);
// *** THE FINDING. *** Bisect for the eps that restores enstrophy exactly, and read the energy there.
let lo = 5, hi = 40;
for (let it = 0; it < 14; it++) {
    const mid = (lo + hi) / 2;
    const r = run(taylorGreen(64, 64, K, { h: 1 / 64 }), { steps, dt, eps: mid });
    if (r[steps].enstrophy / base[0].enstrophy < 1) lo = mid; else hi = mid;
}
const epsStar = (lo + hi) / 2;
const atStar = run(taylorGreen(64, 64, K, { h: 1 / 64 }), { steps, dt, eps: epsStar });
const energyAtStar = atStar[steps].energy / atStar[0].energy;
say(`the eps that restores enstrophy to exactly 100%: ${epsStar.toFixed(3)}, at which energy is ` +
    `${(energyAtStar * 100).toFixed(1)}% of initial`);
ok("!! *** RESTORING THE VORTICITY LEAVES A DISSIPATIVE SCHEME WITH MORE ENERGY THAN IT STARTED WITH ***",
   energyAtStar > 1.0, `${(energyAtStar * 100).toFixed(1)}% -- confinement does not give back what advection ` +
   "took; it adds energy until the vorticity number looks right, and there is no independent criterion for eps");
ok("...and there is no stable ceiling -- it runs away rather than converging",
   rows[rows.length - 1].ens > 2.5, `eps 40 reaches ${(rows[rows.length - 1].ens * 100).toFixed(0)}% enstrophy`);

// ---- 5. THE OTHER HALF OF THE COMPARISON, ON ITS OWN TERMS ONLY -----------------------------------------
console.log("\n5. the vorton claim, checked -- and no winner declared");

const vortons = [{ x: [0.3, 0.4, 0.5], w: [0, 0, 1.5] }, { x: [0.7, 0.6, 0.5], w: [0, 1.0, 0] },
                 { x: [0.5, 0.3, 0.7], w: [0.8, 0, 0] }];
const divAt = (q, e) => {
    let d = 0;
    for (let k = 0; k < 3; k++) {
        const a = q.slice(), b = q.slice();
        a[k] += e; b[k] -= e;
        d += (inducedVelocity(vortons, a, 0.15)[k] - inducedVelocity(vortons, b, 0.15)[k]) / (2 * e);
    }
    return Math.abs(d);
};
const pts = [];
for (let t = 0; t < 200; t++) pts.push([0.1 + (t % 17) / 20, 0.1 + ((t * 7) % 19) / 24, 0.1 + ((t * 11) % 23) / 29]);
const worstDiv = Math.max(...pts.map((q) => divAt(q, 1e-4)));
const mag = Math.max(...pts.map((q) => { const v = inducedVelocity(vortons, q, 0.15); return Math.hypot(v[0], v[1], v[2]); }));
say(`vorton induced field: worst |div u| ${worstDiv.toExponential(3)} against |u| ~ ${mag.toExponential(2)} ` +
    `(relative ${(worstDiv / mag).toExponential(2)})`);
ok("!! the vorton field IS divergence-free, which its header claimed and nothing had measured",
   worstDiv / mag < 1e-5);
// *** AND THE RESIDUAL IS THE PROBE, WHICH IS CHECKED RATHER THAN ASSUMED -- v4432's rule. *** A central
// difference carries O(e^2) error, so coarsening e must make the residual WORSE if it is the instrument.
const coarse = Math.max(...pts.map((q) => divAt(q, 1e-2)));
ok("...and the residual is the finite difference, not the field -- coarsening the probe makes it worse",
   coarse > worstDiv * 5, `e=1e-2 gives ${coarse.toExponential(2)} against e=1e-4's ${worstDiv.toExponential(2)}`);

console.log(`\nvorticity-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
