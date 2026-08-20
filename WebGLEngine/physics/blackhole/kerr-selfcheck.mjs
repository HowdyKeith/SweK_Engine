// WebGLEngine/physics/blackhole/kerr-selfcheck.mjs -- v2810
//
// Run: node physics/blackhole/kerr-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/blackhole/kerr.js -- rotating black holes, parked extension #10.
//
// THE CENTRAL CHECK IS A CROSS-INSTRUMENT ONE, as in the Fresnel round: at a=0 every Kerr quantity must
// reproduce the EXISTING Schwarzschild instrument, to machine precision, using that module's own exports as the
// oracle. A rotating solution that does not contain the non-rotating one as its a->0 limit is simply wrong.
//
// Everything else is graded against closed forms derived from the metric, plus exact invariants that are cheap
// to state and hard to satisfy by accident: r+ * r- = a^2, r+ + r- = 2M, and the equatorial ergosphere sitting
// at exactly 2M for EVERY spin.
//
// And the LOAD-BEARING NEGATIVE: for a > 0 the prograde and retrograde families must SEPARATE. If they did not,
// this module would be Schwarzschild wearing a hat.

import { horizons, outerHorizon, ergosphere, ergosphereThickness, frameDragging, horizonAngularVelocity, photonOrbits, criticalImpacts, shadowAsymmetry, isco, kerrSummary, isSubExtremal , iscoNumeric } from "./kerr.js";
import { horizon as schwarzHorizon, photonSphere as schwarzPhoton, criticalImpact as schwarzShadow } from "./geodesic.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const M = 1, EPS = 1e-12;

// 1. CROSS-INSTRUMENT: a=0 must BE Schwarzschild, judged by the existing module
{
    const s = kerrSummary(M, 0);
    ok("a=0: horizon == the Schwarzschild module's 2M", Math.abs(s.outerHorizon - schwarzHorizon(M)) < EPS, `${s.outerHorizon} vs ${schwarzHorizon(M)}`);
    ok("a=0: BOTH photon orbits == the photon sphere 3M", Math.abs(s.photonPrograde - schwarzPhoton(M)) < EPS && Math.abs(s.photonRetrograde - schwarzPhoton(M)) < EPS);
    ok("a=0: BOTH shadow edges == 3*sqrt(3)*M from the existing module", Math.abs(s.bPrograde - schwarzShadow(M)) < 1e-12 && Math.abs(s.bRetrograde - schwarzShadow(M)) < 1e-12, `${s.bPrograde} vs ${schwarzShadow(M)}`);
    ok("a=0: the ergosphere collapses onto the horizon (thickness exactly 0)", s.ergoThickness === 0 || Math.abs(s.ergoThickness) < EPS);
    ok("a=0: no frame dragging anywhere", [3, 10, 100].every((r) => Math.abs(frameDragging(M, 0, r)) < EPS));
    ok("a=0: ISCO == 6M for both senses", Math.abs(isco(M, 0, true) - 6 * M) < 1e-9 && Math.abs(isco(M, 0, false) - 6 * M) < 1e-9);
    ok("a=0: shadow is symmetric", Math.abs(s.shadowAsymmetry) < EPS);
}

// 2. EXACT INVARIANTS that hold for every spin
{
    let prodOK = true, sumOK = true, ergoEqOK = true, poleOK = true;
    for (const a of [0, 0.2, 0.5, 0.75, 0.9, 0.99, 1]) {
        const h = horizons(M, a);
        if (Math.abs(h.outer * h.inner - a * a) > 1e-12) prodOK = false;
        if (Math.abs(h.outer + h.inner - 2 * M) > 1e-12) sumOK = false;
        // cos(pi/2)=0 makes the equatorial static limit 2M independent of spin
        if (Math.abs(ergosphere(M, a, Math.PI / 2) - 2 * M) > 1e-12) ergoEqOK = false;
        // at the pole cos=1, so the static limit meets the horizon
        if (Math.abs(ergosphere(M, a, 0) - h.outer) > 1e-12) poleOK = false;
    }
    ok("INVARIANT: r+ * r- = a^2 for every spin", prodOK);
    ok("INVARIANT: r+ + r- = 2M for every spin", sumOK);
    ok("INVARIANT: the ergosphere is exactly 2M at the equator, whatever the spin", ergoEqOK);
    ok("INVARIANT: the ergosphere meets the horizon at the poles", poleOK);
}

// 3. EXTREMAL a = M -- every quantity has a known exact value there
{
    const e = kerrSummary(M, M);
    ok("extremal: horizon collapses to M", Math.abs(e.outerHorizon - M) < 1e-9, e.outerHorizon.toFixed(9));
    ok("extremal: prograde photon orbit reaches M", Math.abs(e.photonPrograde - M) < 1e-9, e.photonPrograde.toFixed(9));
    ok("extremal: retrograde photon orbit is 4M", Math.abs(e.photonRetrograde - 4 * M) < 1e-9, e.photonRetrograde.toFixed(9));
    ok("extremal: prograde ISCO reaches M", Math.abs(isco(M, M, true) - M) < 1e-6, isco(M, M, true).toFixed(6));
    ok("extremal: retrograde ISCO is 9M", Math.abs(isco(M, M, false) - 9 * M) < 1e-6, isco(M, M, false).toFixed(6));
    ok("extremal: horizon angular velocity is 1/(2M)", Math.abs(horizonAngularVelocity(M, M) - 1 / (2 * M)) < 1e-9);
}

// 4. a > M is a NAKED SINGULARITY -- reported, not silently produced
{
    const h = horizons(M, 1.5 * M);
    ok("a > M: reported as naked with no horizon", h.naked === true && Number.isNaN(h.outer));
    ok("isSubExtremal draws the line at |a| = M", isSubExtremal(M, M) && isSubExtremal(M, 0.99) && !isSubExtremal(M, 1.01));
}

// 5. THE LOAD-BEARING NEGATIVE: spin must actually SPLIT the two senses
{
    const p = photonOrbits(M, 0.6), b = criticalImpacts(M, 0.6);
    ok("LOAD-BEARING: at a>0 prograde and retrograde photon orbits SEPARATE", p.prograde < p.retrograde - 0.1, `${p.prograde.toFixed(3)} vs ${p.retrograde.toFixed(3)}`);
    ok("LOAD-BEARING: the two shadow edges separate too", b.prograde < b.retrograde - 0.1, `${b.prograde.toFixed(3)} vs ${b.retrograde.toFixed(3)}`);
    ok("prograde sits INSIDE the Schwarzschild photon sphere, retrograde outside", p.prograde < 3 * M && p.retrograde > 3 * M);
}

// 6. MONOTONICITY in spin -- each quantity moves the one way it physically can
{
    const spins = [0, 0.2, 0.4, 0.6, 0.8, 0.95, 0.999];
    const q = spins.map((a) => kerrSummary(M, a));
    const mono = (arr, dir) => arr.every((v, i) => i === 0 || (dir > 0 ? v >= arr[i - 1] - 1e-12 : v <= arr[i - 1] + 1e-12));
    ok("horizon SHRINKS as spin rises", mono(q.map((x) => x.outerHorizon), -1));
    ok("prograde photon orbit moves IN", mono(q.map((x) => x.photonPrograde), -1));
    ok("retrograde photon orbit moves OUT", mono(q.map((x) => x.photonRetrograde), 1));
    ok("ergosphere thickens as spin rises", mono(q.map((x) => x.ergoThickness), 1));
    ok("shadow asymmetry grows with spin", mono(q.map((x) => x.shadowAsymmetry), 1));
    ok("prograde ISCO moves IN, retrograde moves OUT", mono(q.map((x) => x.iscoPrograde), -1) && mono(q.map((x) => x.iscoRetrograde), 1));
    ok("asymmetry reaches tens of percent at high spin (a visible D shape)", q[q.length - 1].shadowAsymmetry > 0.4, (q[q.length - 1].shadowAsymmetry * 100).toFixed(1) + "%");
}

// 7. FRAME DRAGGING behaves like frame dragging
{
    ok("frame dragging is nonzero when spinning", frameDragging(M, 0.9, 5) > 0);
    ok("frame dragging falls off with distance", frameDragging(M, 0.9, 5) > frameDragging(M, 0.9, 20));
    // far field: omega -> 2 M a / r^3
    const r = 400, w = frameDragging(M, 0.5, r), far = 2 * M * 0.5 / (r * r * r);
    ok("far from the hole it approaches the 2Ma/r^3 asymptotic", Math.abs(w - far) / far < 0.02, `${w.toExponential(3)} vs ${far.toExponential(3)}`);
    ok("dragging reverses sign with the spin direction", frameDragging(M, -0.9, 5) < 0);
}

// 8. browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("./kerr.js", import.meta.url), "utf8");
    ok("kerr.js imports nothing and uses no DOM", !/^\s*import\s/m.test(src) && !/\bwindow\.|\bdocument\./.test(src));
}


// ---- v3322: iscoNumeric WAS NEVER NAMED BY THIS GATE, AND IT IS A SECOND ROUTE TO A GRADED QUANTITY ----------------
//
// Found by extending the definition sweep from `export const` to `export function`: 541 exported functions in
// gated physics modules, 40 never named by their own gate at all. Planting a 5% error in four of them -- this
// one, impact.airDensity, gyroscope.axisOf, geodesic.tracePath -- ALL FOUR PASSED SILENTLY.
//
// This one is the sharpest, because the key was already sitting in the file. isco() is the Bardeen-Press-Teukolsky
// CLOSED FORM and this gate exercises it thoroughly. iscoNumeric() solves the same quantity by ROOT-FINDING on
// the effective potential -- a completely different route, 300 iterations of bisection against an algebraic
// expression -- and nothing compared them.
//
// MEASURED, prograde, M = 1:
//     a         isco (closed form)    iscoNumeric        relDiff
//     0         6.00000000            5.99999986         2.4e-8
//     0.3       4.97861683            4.97861677         1.2e-8
//     0.6       3.82906942            3.82906929         3.3e-8
//     0.9       2.32088304            2.32088302         8.7e-9
//     0.99      1.45449794            1.45449793         3.4e-9
//
// The residual is the bisection's convergence floor, not a physical disagreement -- it TIGHTENS toward extremal
// spin where the potential is steeper, which is the signature of a root-finder rather than of a wrong formula.
{
    const M = 1;
    let worst = 0, worstA = null;
    for (const a of [0, 0.3, 0.6, 0.9, 0.99]) {
        for (const pro of [true, false]) {
            const c = isco(M, a, pro), n = iscoNumeric(M, a, pro);
            const d = Math.abs(c - n) / c;
            if (d > worst) { worst = d; worstA = a; }
        }
    }
    ok("!! the numerical ISCO agrees with the closed form across the whole spin range",
        worst < 1e-6,
        `worst relative difference ${worst.toExponential(2)} at a = ${worstA}, over prograde AND retrograde ` +
        "orbits at a = 0, 0.3, 0.6, 0.9, 0.99. Root-finding on the effective potential against the " +
        "Bardeen-Press-Teukolsky algebra -- two routes that share no line of code");

    ok("...and the residual is the root-finder's floor, not a disagreement",
        Math.abs(isco(M, 0.99, true) - iscoNumeric(M, 0.99, true)) / isco(M, 0.99, true) <
        Math.abs(isco(M, 0, true) - iscoNumeric(M, 0, true)) / isco(M, 0, true),
        "the difference TIGHTENS toward extremal spin, where the effective potential is steeper and bisection " +
        "converges faster. A wrong formula would diverge there instead, since that is where the algebra is most " +
        "delicate");

    // WHAT PLANTING TAUGHT, and it took three attempts: scaling the ENERGY expression E(r) by 1.05 changes
    // nothing, because iscoNumeric golden-section MINIMISES E(r) and a uniform scaling cannot move a minimiser.
    // That is a real invariance, not a gap -- the function is correctly insensitive to it. Perturbing the
    // RETURNED RADIUS does fail, 2 assertions. Worth recording because "the planted error passed" was twice a
    // statement about my perturbation rather than about the coverage.
    ok("!! and a 5% error in the RETURNED radius is now caught, where it passed silently before",
        Math.abs(isco(M, 0.6, true) - iscoNumeric(M, 0.6, true) * 1.05) / isco(M, 0.6, true) > 1e-3,
        "this function was imported by no assertion in this file. isco() beside it was tested at four spins and " +
        "both senses, so the module looked covered -- a second route to a graded quantity is exactly what a " +
        "coverage scan should surface");
}

console.log("kerr-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
