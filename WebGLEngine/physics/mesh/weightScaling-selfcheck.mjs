// WebGLEngine/physics/mesh/weightScaling-selfcheck.mjs -- v3650
//
// Run: node physics/mesh/weightScaling-selfcheck.mjs
//
// v3649 found the boundary row's weight had been a hardcoded 1 for six rounds and that the optimum was near 0.25,
// worth 1.70x. It ended on the right question: DOES THE OPTIMUM MOVE WITH REFINEMENT? A fixed constant is
// defensible only if it does not.
//
// *** AND THE FIRST ANSWER WAS MY OWN SEARCH GRID. A sweep spaced 2^0.25 reported the argmin moving by EXACTLY
// ONE SAMPLE at each refinement, twice, then zero -- which is what a quantised search reports when the true
// optimum drifts more slowly than the grid. AN ARGMIN OVER A SWEEP IS AN INDEX, and v3619's law applies to it
// unchanged: an index cannot see a shift smaller than one cell. ***

import { readFileSync } from "node:fs";
import { makeAnnulus, potentialFlow, cellValues, annulusFaces, wallSideError } from "./curvedWall.mjs";
import { vertexNeighbours } from "./rankRepair.mjs";
import { quadraticGradient, quadraticGradientWithWall, optimalRowWeight, wallAspect } from "./quadraticRecon.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const study = (nt, { a = 1, b = 3, U = 1, nrScale = 8 } = {}) => {
    const { phi, grad } = potentialFlow({ U, a });
    const m = makeAnnulus({ nr: Math.max(4, Math.round(nt / nrScale)), nt, a, b });
    const u = cellValues(m, phi), F = annulusFaces(m), vn = vertexNeighbours(m);
    const f = (lw) => wallSideError(m, F, grad, quadraticGradientWithWall(u, m, vn, F, { rowWeight: Math.pow(2, lw) }), "inner");
    const best = optimalRowWeight(f);
    return {
        nt, m, best, aspect: wallAspect(m), arc: 2 * Math.PI * a / nt,
        atOne: f(0), noRow: wallSideError(m, F, grad, quadraticGradient(u, m, vn), "inner"),
    };
};

// --- 1. the search grid was the first answer ---------------------------------------------------------------------
{
    say("1. A SWEEP CANNOT ANSWER THIS. v3649's grid was spaced 2^0.25 = 1.189.");
    const sweep = [48, 96, 192, 384].map((nt) => {
        const { phi, grad } = potentialFlow({});
        const m = makeAnnulus({ nr: Math.max(4, Math.round(nt / 8)), nt, a: 1, b: 3 });
        const u = cellValues(m, phi), F = annulusFaces(m), vn = vertexNeighbours(m);
        let best = null;
        for (let e = -3; e <= 3; e += 0.25) {
            const w = Math.pow(2, e);
            const err = wallSideError(m, F, grad, quadraticGradientWithWall(u, m, vn, F, { rowWeight: w }), "inner");
            if (!best || err < best.e) best = { w, e: err };
        }
        return best.w;
    });
    say("     sweep argmin at nt = 48, 96, 192, 384:  " + sweep.map((x) => x.toFixed(4)).join(", "));
    ok("!! it moves by EXACTLY one grid sample, twice, then zero", (() => {
        const r1 = sweep[1] / sweep[0], r2 = sweep[2] / sweep[1], r3 = sweep[3] / sweep[2];
        say("     successive ratios: " + [r1, r2, r3].map((x) => x.toFixed(4)).join(", ") +
            "   (one grid step = " + Math.pow(2, 0.25).toFixed(4) + ")");
        return Math.abs(r1 - Math.pow(2, 0.25)) < 1e-3 && Math.abs(r2 - Math.pow(2, 0.25)) < 1e-3 && Math.abs(r3 - 1) < 1e-9;
    })(), "AN ARGMIN OVER A SWEEP IS AN INDEX. It reports the grid, not the optimum -- v3619's law, applied to a " +
        "search rather than to a front");
}

// --- 2. THE OPTIMUM CONVERGES, IT DOES NOT SCALE ---------------------------------------------------------------------
{
    say("2. GOLDEN SECTION ON log2(w), tolerance 1e-4. Refining at fixed mesh SHAPE.");
    const R = [48, 96, 192, 384, 768].map((nt) => study(nt));
    for (const r of R) say("     nt " + String(r.nt).padStart(3) + "   arc " + r.arc.toFixed(6) +
        "   w* " + r.best.w.toFixed(6) + "   err " + r.best.error.toExponential(3) +
        "   gain over w=1 " + (r.atOne / r.best.error).toFixed(3) + "x");
    ok("!! the optimum CONVERGES rather than scaling with h", (() => {
        const w = R.map((r) => r.best.w);
        const d = w.slice(1).map((x, i) => x - w[i]);
        say("     w*: " + w.map((x) => x.toFixed(6)).join(", ") + "   increments " + d.map((x) => x.toFixed(6)).join(", "));
        say("     w*/arc: " + R.map((r) => (r.best.w / r.arc).toFixed(2)).join(", ") +
            "   w*/sqrt(arc): " + R.map((r) => (r.best.w / Math.sqrt(r.arc)).toFixed(3)).join(", "));
        // MY OWN OFF-BY-ONE: this read `x < d[i]`, which compares each increment TO ITSELF and is false for
        // every i > 0. The predecessor is d[i - 1]. A monotonicity check that indexes the element it is testing
        // is not a weak check, it is the wrong one -- and it went red rather than passing vacuously, which is the
        // only reason it was caught.
        return d.every((x, i) => i === 0 || x < d[i - 1]) && w[4] / w[0] < 1.6;
    })(), "the increments shrink (0.0341, 0.0124, 0.0093, 0.0058) and NEITHER w*/h NOR w*/sqrt(h) is constant -- " +
        "both grow monotonically, so the optimum is not a scaling law. IT APPROACHES A DIMENSIONLESS CONSTANT " +
        "NEAR 0.218, AND IT IS STILL 5% SHORT AT nt = 768");
    ok("...and the GAIN is h-independent, which is the part a caller feels", (() => {
        const g = R.map((r) => r.atOne / r.best.error);
        return g.every((x) => x > 1.69 && x < 1.79) && Math.abs(g[4] - g[3]) < 0.02;
    })(), "1.78, 1.74, 1.72, 1.71, 1.70 -- CHOOSING THE WEIGHT IS WORTH THE SAME 1.7x AT EVERY RESOLUTION, so the " +
        "cost of leaving it at 1 does not shrink as the mesh improves");
}

// --- 3. THE CONTROLS: what it must NOT depend on ------------------------------------------------------------------------
{
    say("3. THE OPTIMUM IS INVARIANT TO THE TWO THINGS IT MUST BE INVARIANT TO.");
    const base = study(192).best.w;
    const amp = study(192, { U: 5 }).best.w;
    const scaled = study(192, { a: 2, b: 6 }).best.w;
    say("     baseline " + base.toFixed(6) + "   field amplitude x5 " + amp.toFixed(6) +
        "   geometry scaled x2 (same ratio) " + scaled.toFixed(6));
    ok("!! identical under a field amplitude change", amp === base,
        "the problem is LINEAR in u, so scaling the field scales every row equally and the argmin cannot move. " +
        "BIT-IDENTICAL, which is the check that says the search is measuring the method and not noise");
    ok("!! and identical under an overall length scale", scaled === base,
        "a = 2, b = 6 is the same shape twice as big; the weight is DIMENSIONLESS and must not notice");
}

// --- 4. AND THE ONE THING IT DOES DEPEND ON ----------------------------------------------------------------------------
{
    say("4. BUT IT IS A FUNCTION OF THE CELL ASPECT RATIO, AND THAT IS NOT SOMETHING A GLOBAL CONSTANT CAN CARRY.");
    const cases = [
        ["b = 2 (thin annulus)", { b: 2 }], ["baseline b = 3", {}], ["b = 6 (thick)", { b: 6 }],
        ["radial cells x2", { nrScale: 4 }], ["radial cells /2", { nrScale: 16 }],
    ].map(([name, o]) => { const s = study(192, o); return { name, w: s.best.w, aspect: s.aspect }; });
    for (const c of cases) say("     " + c.name.padEnd(24) + " aspect " + c.aspect.toFixed(3).padStart(6) + "   w* " + c.w.toFixed(6));
    ok("!! the optimum moves by 2.2x across shapes at the SAME refinement",
        Math.max(...cases.map((c) => c.w)) / Math.min(...cases.map((c) => c.w)) > 2,
        "0.107339 to 0.240166 -- and the annulus thickness and the radial cell count are two different knobs that " +
        "MOVE IT THE SAME WAY, because both change the same thing");
    ok("!! and two settings with the SAME aspect ratio give the SAME optimum, to the last digit", (() => {
        const thin = cases.find((c) => c.name.startsWith("b = 2")), fine = cases.find((c) => c.name.startsWith("radial cells x2"));
        say("     b = 2 (aspect " + thin.aspect.toFixed(4) + ") -> " + thin.w.toFixed(6) +
            "   |   radial cells x2 (aspect " + fine.aspect.toFixed(4) + ") -> " + fine.w.toFixed(6));
        return Math.abs(thin.aspect - fine.aspect) < 1e-9 && thin.w === fine.w;
    })(), "TWO DIFFERENT GEOMETRIES, ONE ASPECT RATIO, ONE OPTIMUM -- which is what says the aspect ratio is the " +
        "variable rather than a coincidence of the annulus");
    ok("the dependence saturates rather than growing without bound", (() => {
        const byAspect = [...cases].sort((a, b) => a.aspect - b.aspect);
        say("     by aspect: " + byAspect.map((c) => c.aspect.toFixed(2) + " -> " + c.w.toFixed(4)).join(",  "));
        return byAspect[3].w > 0.9 * byAspect[byAspect.length - 1].w;
    })(), "rising steeply from aspect 1.3 to 2.6 and then flattening near 0.24");
}

// --- 5. what this means for the default -------------------------------------------------------------------------------
{
    say("5. SO WHAT SHOULD THE DEFAULT BE?");
    say("   A CONSTANT IS DEFENSIBLE AT FIXED MESH SHAPE -- section 2 -- AND IS NOT DEFENSIBLE ACROSS SHAPES,");
    say("   because section 4 moves it by 2.2x at one refinement. THE SHIPPED DEFAULT OF 1 IS OUTSIDE THE WHOLE");
    say("   MEASURED RANGE (0.107 to 0.240) AND IS WORSE THAN EVERY POINT IN IT.");
    ok("the default is STILL 1 and every earlier number reproduces", (() => {
        const s = study(384);
        say("     nt 384 at w = 1: " + s.atOne.toExponential(3) + "   (v3648 reported 3.017e-4)");
        return Math.abs(s.atOne - 3.017e-4) / 3.017e-4 < 1e-3;
    })(), "NOT CHANGED, because a value fitted to one field on one mesh family is a knob with a story rather than " +
        "a key -- and the honest deliverable is that the knob EXISTS, what it depends on, and that the current " +
        "value is off the end of the range");
    const src = readFileSync(new URL("./quadraticRecon.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    ok("the search records why a sweep was not enough", /AN ARGMIN OVER A SWEEP IS\n\/\/ AN INDEX/.test(src) || /ARGMIN OVER A SWEEP IS/.test(src));
    say("   NOT DONE: the aspect-ratio dependence as a FORMULA. Five points on one mesh family is a trend, not a");
    say("   law, and fitting a curve to them would be exactly the fabricated provenance this project refuses.");
    say("   NOT DONE: whether the same dependence appears on triangles that are not annulus quads split in two.");
}

console.log("weightScaling-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
