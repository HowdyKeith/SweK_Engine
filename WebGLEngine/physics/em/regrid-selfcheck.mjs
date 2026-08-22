// WebGLEngine/physics/em/regrid-selfcheck.mjs -- v3633
//
// Run: node physics/em/regrid-selfcheck.mjs
//
// WHAT IT COSTS TO CHANGE THE GRID UNDER A FIELD THAT IS ALREADY PROPAGATING -- WAVELET's actual claim, and the
// one part v3632 left unmeasured. Nothing vendored, no claim about their code.
//
// *** SECTION 1 IS A CHECK THAT CANNOT FAIL, KEPT ON PURPOSE AND LABELLED AS ONE, BECAUSE I ALMOST SHIPPED IT AS
// A RESULT. A refine-then-SAMPLE round trip reads 0.000e+0 for every field including a sine at eight cells per
// wavelength, and it reads that BY CONSTRUCTION: refine() writes the coarse values at the coincident fine nodes
// and coarsenSample() reads exactly those back, so the pair is a LEFT INVERSE. "Sampling is lossless" would have
// been a true sentence about function composition and a false one about physics. THE REAL COST IS NOT IN THE
// ROUND TRIP -- IT IS IN WHAT THE REFINED FIELD *IS*, and section 3 measures that against an ANALYTIC field that
// neither operator is ever told. ***

import { readFileSync } from "node:fs";
import {
    refine, coarsenSample, coarsenAverage, roundTrip, identityError, interpolationError, repeated,
    integral, energy, constantField, rampField, gaussianField, sineField,
} from "./regrid.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// --- 1. the trivial half, named as trivial ---------------------------------------------------------------------
{
    say("1. REFINE-THEN-SAMPLE IS ALGEBRAICALLY THE IDENTITY. This section proves nothing and says so.");
    const fields = [["constant", constantField(201)], ["ramp", rampField(201)],
        ["gaussian", gaussianField(401, 200, 20)], ["sine at 8 cells/wave", sineField(513, 8)]];
    for (const [name, f] of fields) {
        const e = identityError(f, 2, "sample");
        say("     " + name.padEnd(22) + " relative " + e.relative.toExponential(3));
    }
    ok("!! it reads exactly zero on EVERY field, including one that is barely resolved",
        fields.every(([, f]) => identityError(f, 2, "sample").relative === 0),
        "a sine at eight cells per wavelength is nearly unrepresentable and still returns bit-identical -- THAT IS " +
        "THE GIVE-AWAY. A measurement that cannot distinguish a constant from an unresolved wave is not measuring the field");
    ok("...and the module records why, where the next reader meets it", (() => {
        const src = readFileSync(new URL("./regrid.mjs", import.meta.url), "utf8");
        return /THE ROUND TRIP WITH SAMPLING IS THE IDENTITY BY CONSTRUCTION/.test(src) && /LEFT INVERSE/.test(src);
    })());
}

// --- 2. the two ways back, and you cannot have both ------------------------------------------------------------
{
    say("2. SAMPLE KEEPS THE VALUE AND LOSES THE SUM; AVERAGE KEEPS THE SUM AND LOSES THE VALUE.");
    const g = gaussianField(401, 200, 20);
    const s = identityError(g, 2, "sample"), a = identityError(g, 2, "average");
    say("     sample   relative " + s.relative.toExponential(3) + "   integral drift " + s.integralDrift.toExponential(3) +
        "   energy ratio " + s.energyRatio.toFixed(9));
    say("     average  relative " + a.relative.toExponential(3) + "   integral drift " + a.integralDrift.toExponential(3) +
        "   energy ratio " + a.energyRatio.toFixed(9));
    ok("!! averaging conserves the discrete integral to round-off", a.integralDrift < 1e-14,
        "which is the whole reason to choose it -- a conservative remap must not lose the quantity it is remapping");
    ok("...and it pays for that by damping: energy falls every trip", a.energyRatio < 1 && a.energyRatio > 0.99,
        "energy ratio " + a.energyRatio.toFixed(9) + " per round trip. AVERAGING IS A LOW-PASS FILTER and calling it " +
        "'conservative' names the integral it keeps, not the field it does not");
    const rs = identityError(rampField(201), 2, "sample"), ra = identityError(rampField(201), 2, "average");
    ok("!! and averaging is NOT exact even on a straight line, where sampling is", rs.relative === 0 && ra.relative > 1e-4,
        "ramp: sample " + rs.relative.toExponential(1) + " against average " + ra.relative.toExponential(3) +
        " -- while the ramp's INTEGRAL survives averaging exactly (" + ra.integralDrift.toExponential(1) + "). " +
        "TWO CORRECTNESS CLAIMS, ONE OPERATOR SATISFIES EACH, AND NEITHER SATISFIES BOTH");
    // where the ramp error lives -- MEASURED, because "it is an end effect" is the kind of story that turns out wrong
    {
        const f = rampField(201), back = roundTrip(f, 2, "average");
        let worstAt = 0, worst = 0;
        for (let i = 0; i < f.length; i++) { const d = Math.abs(back[i] - f[i]); if (d > worst) { worst = d; worstAt = i; } }
        const interior = (() => { let w = 0; for (let i = 5; i < f.length - 5; i++) w = Math.max(w, Math.abs(back[i] - f[i])); return w; })();
        say("     the ramp's averaging error is at index " + worstAt + " of " + (f.length - 1) +
            ", and over the interior it is " + interior.toExponential(3));
        ok("the ramp error is located rather than explained away", worstAt < 5 || worstAt > f.length - 6,
            "it lives where the averaging stencil is TRUNCATED by the end of the grid; in the interior a symmetric " +
            "mean of a straight line is exact, and the measurement says so instead of a story saying so");
    }
}

// --- 3. THE COST THAT IS REAL -----------------------------------------------------------------------------------
{
    say("3. REFINING INVENTS THE FIELD BETWEEN NODES AS A STRAIGHT LINE, AND THE FIELD IS NOT A STRAIGHT LINE.");
    say("   Graded against an ANALYTIC field sampled on the fine grid -- a truth neither operator is told.");
    const gauss = [4, 2, 1, 0.5].map((dxCoarse) =>
        interpolationError((x) => Math.exp(-Math.pow((x - 200) / 40, 2)), Math.round(400 / dxCoarse) + 1, 2, { dxCoarse }).relative);
    const gOrders = gauss.slice(1).map((e, i) => Math.log2(gauss[i] / e));
    say("     gaussian, dxCoarse 4 -> 0.5:  " + gauss.map((e) => e.toExponential(3)).join("  ") +
        "   orders " + gOrders.map((o) => o.toFixed(3)).join(", "));
    ok("!! the interpolation error is SECOND ORDER in the coarse spacing, DERIVED not typed",
        gOrders.every((o) => o > 1.9 && o < 2.1),
        "which is linear interpolation's own order, recovered without being told it");
    const sine = [8, 16, 32, 64].map((cpw) => interpolationError((x) => Math.sin(2 * Math.PI * x / cpw), 257, 2, {}).relative);
    const sOrders = sine.slice(1).map((e, i) => Math.log2(sine[i] / e));
    say("     sine, 8 -> 64 cells per wavelength:  " + sine.map((e) => e.toExponential(3)).join("  ") +
        "   orders " + sOrders.map((o) => o.toFixed(3)).join(", "));
    ok("...and the same order in resolution, so the cost is set by cells per wavelength and nothing else",
        sOrders.every((o) => o > 1.85 && o < 2.1),
        "7.0% at eight cells per wavelength -- a barely-resolved wave loses seven percent of its amplitude the " +
        "moment the grid is refined under it, before a single step is taken");
}

// --- 4. HOW OFTEN CAN YOU AFFORD TO REGRID -----------------------------------------------------------------------
{
    say("4. THE ENGINEERING QUESTION. Apply the trip repeatedly and watch whether the damage adds up or settles.");
    const rows = repeated(gaussianField(401, 200, 20), 2, "average", 8);
    say("     relative after 1..8 trips:  " + rows.map((r) => r.relative.toExponential(2)).join("  "));
    say("     relative / trip number:     " + rows.map((r) => (r.relative / r.trip).toExponential(3)).join("  "));
    const perTrip = rows.map((r) => r.relative / r.trip);
    ok("!! the damage accumulates LINEARLY -- there is no saturation to hide behind",
        Math.max(...perTrip) / Math.min(...perTrip) < 1.02,
        "error per trip is constant to " + (100 * (Math.max(...perTrip) / Math.min(...perTrip) - 1)).toFixed(2) +
        "% over eight trips, so N regrids cost N times as much. A field does NOT relax onto what the operator can " +
        "represent and then stop losing -- every trip takes another bite");
    ok("...and the energy falls monotonically with it", rows.every((r, i) => i === 0 || r.energyRatio < rows[i - 1].energyRatio),
        "1.000 -> " + rows[rows.length - 1].energyRatio.toFixed(6) + " over eight round trips");
    // the round-trip error's ORDER in resolution -- this is the one that decides the trade
    const cpw = [8, 16, 32, 64].map((c) => identityError(sineField(513, c), 2, "average").relative);
    const orders = cpw.slice(1).map((e, i) => Math.log2(cpw[i] / e));
    say("     averaging round trip vs cells/wavelength: " + cpw.map((e) => e.toExponential(3)).join("  ") +
        "   orders " + orders.map((o) => o.toFixed(3)).join(", "));
    ok("!! and the conservative remap is only FIRST order, inside a SECOND order scheme",
        orders.every((o) => o > 0.8 && o < 1.15),
        "orders " + orders.map((o) => o.toFixed(3)).join(", ") + ". THAT IS THE VERDICT: refining costs a " +
        "second-order error once (section 3), but COARSENING BACK CONSERVATIVELY COSTS A FIRST-ORDER ONE EVERY TIME, " +
        "and it accumulates linearly. A moving refinement window that crosses a wave N times injects N first-order " +
        "insults into a scheme whose whole accuracy claim is second order");
}

// --- 5. scope ------------------------------------------------------------------------------------------------------
{
    say("5. SCOPE.");
    const src = readFileSync(new URL("./regrid.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    ok("refine is exact on the nodes it already had", (() => {
        const f = gaussianField(101, 50, 8), r = refine(f, 3);
        for (let i = 0; i < f.length; i++) if (r[i * 3] !== f[i]) return false;
        return true;
    })(), "so the interpolation error in section 3 is entirely BETWEEN nodes, which is where the invention happens");
    // MY FIRST VERSION COMPARED THEIR INTEGRALS AND WENT RED -- because averaging conserves the integral to
    // round-off, so BOTH routes return the same total BY DESIGN. That was the section-2 finding used as a
    // discriminator, which it is exactly not: the quantity the two operators agree on cannot separate them.
    ok("the two coarsen routes are genuinely different functions", (() => {
        const fine = refine(gaussianField(201, 100, 12), 2);
        const a = coarsenSample(fine, 2), b = coarsenAverage(fine, 2);
        let diff = 0, sameIntegral = Math.abs(integral(a) - integral(b)) / Math.abs(integral(a));
        for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
        say("     pointwise |sample - average| " + diff.toExponential(3) + ", integrals agree to " + sameIntegral.toExponential(2));
        return coarsenSample !== coarsenAverage && diff > 1e-6;
    })(), "separated POINTWISE, because the integral is the one thing they are built to agree on");
    say("   NOT MEASURED, AND NOT CLAIMED: what any of this does to a RUNNING solver. This grades the remap");
    say("   OPERATOR in isolation, which is the honest unit -- a number from a full simulation would mix the remap");
    say("   with the scheme's own error and with the boundary treatment, and none of the three could be read off");
    say("   the total. NOT BUILT, STILL REFUSED: an adaptive grid (greedyMesh3d rule, unchanged since v3631).");
    say("   ALSO NOT DONE: higher-order interpolation (cubic would move section 3 to fourth order and section 4's");
    say("   first order is the one that matters anyway), and a conservative remap that is second order -- which");
    say("   EXISTS and is the thing to reach for if this trade ever has to be paid.");
    void energy;
}

console.log("regrid-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
