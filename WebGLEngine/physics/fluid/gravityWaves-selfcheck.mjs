// WebGLEngine/physics/fluid/gravityWaves-selfcheck.mjs -- v3627
//
// Run: node physics/fluid/gravityWaves-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// TWO HALVES, AND THE SECOND IS ABOUT SHIPPED CODE.
//
// THE PHYSICS. omega^2 = g k tanh(k h) is a wave speed predicted from DEPTH ALONE, with nothing from any grid
// in it -- the erf/Stefan/pendulum shape. Its keys are all external: the shallow and deep limits are elementary
// closed forms with no tanh in them, the group speed has an analytic form checkable against a numerical
// derivative that shares no algebra with it, and in deep water c_group/c_phase is EXACTLY 1/2.
//
// *** THE SOLVER. THE TREE HAS THREE HEIGHT-FIELD WATERS -- water/waterMath.js, render/WaterField.js,
// world/waveSystem.js -- AND NOT ONE CONTAINS g, A DEPTH, A dx OR A dt. water/tools/water-selfcheck.mjs proves
// a drop propagates and then decays and NEVER ASKS HOW FAST; grepped before a line of this was written, it has
// no occurrence of speed, dispersion, Courant, CFL, depth or gravity. So the engine's water has never had a
// wave speed anybody could predict. Section 3 derives what it actually is, section 4 finds where the shipped
// stiffness sits, and section 5 says what that means for calling it water. NOTHING IN waveStep IS EDITED. ***

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
    omega, phaseSpeed, groupSpeed, groupSpeedNumeric, shallowSpeed, deepSpeed, shallowValidity,
    schemeOmega, schemeMargin, schemePhaseSpeed, schemeLongWaveSpeed, schemeStabilityLimit,
    runMode, measuredOmega, G_EARTH,
} from "./gravityWaves.mjs";

const require = createRequire(import.meta.url);
const water = require("../../water/waterMath.js");        // THE SHIPPED SOLVER, not a copy

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (got, want) => Math.abs(got - want) / Math.max(Math.abs(want), 1e-300);

// --- 1. the two limits, each an elementary closed form ---------------------------------------------------------
{
    say("1. THE LIMITS. sqrt(g h) and sqrt(g/k) contain no tanh, so neither is a restatement of the relation.");
    const errsS = [0.4, 0.2, 0.1, 0.05].map((kh) => rel(phaseSpeed(kh / 2, 2), shallowSpeed(2)));
    const ordS = errsS.slice(1).map((e, i) => Math.log2(errsS[i] / e));
    say("     SHALLOW, h = 2 m, kh = 0.4 -> 0.05:  " + errsS.map((e) => e.toExponential(3)).join("  "));
    ok("c -> sqrt(g h) at SECOND order in kh, DERIVED not typed", ordS.every((o) => o > 1.9 && o < 2.1),
        "orders " + ordS.map((o) => o.toFixed(3)).join(", ") + " -- tanh(x)/x = 1 - x^2/3 + ...");
    const errsD = [5, 10, 20].map((kh) => rel(phaseSpeed(kh / 100, 100), deepSpeed(kh / 100)));
    say("     DEEP, h = 100 m, kh = 5, 10, 20:  " + errsD.map((e) => e.toExponential(3)).join("  "));
    ok("!! and c -> sqrt(g/k) EXPONENTIALLY, not as a power -- a different KIND of limit",
        errsD[0] / errsD[1] > 1000 && errsD[2] === 0,
        "ratio " + (errsD[0] / errsD[1]).toExponential(2) + " for a doubling of kh, because tanh's residue is ~2 exp(-2kh)");
    say("   THE TWO SIDES OF ONE RELATION APPROACH THEIR LIMITS AT DIFFERENT RATES, AND REPORTING ONE 'ORDER' FOR");
    say("   BOTH WOULD HAVE BEEN A NUMBER WEARING THE WRONG NAME.");
}

// --- 2. the group speed, two ways, and the exact 1/2 ------------------------------------------------------------
{
    say("2. GROUP SPEED. Analytic (c/2)(1 + 2kh/sinh 2kh) against a central difference on omega(k).");
    let worst = 0;
    for (const [k, h] of [[0.05, 2], [0.5, 2], [2, 2], [0.1, 50], [5, 0.5]]) worst = Math.max(worst, rel(groupSpeed(k, h), groupSpeedNumeric(k, h)));
    ok("the two agree across shallow, intermediate and deep", worst < 1e-9,
        "worst rel " + worst.toExponential(3) + " -- and the residue is the DIFFERENCE's own truncation, not the formula's");
    const ratios = [1, 5, 20].map((k) => groupSpeed(k, 1000) / phaseSpeed(k, 1000));
    ok("!! in DEEP water the group travels at exactly HALF the phase speed", ratios.every((r) => Math.abs(r - 0.5) < 1e-12),
        "reads " + ratios.map((r) => r.toFixed(12)).join(", ") + " -- an exact rational, which is why crests appear at the back of a group and die at the front");
    ok("...and in SHALLOW water they coincide, which is what NON-DISPERSIVE means",
        Math.abs(groupSpeed(1e-4, 2) / phaseSpeed(1e-4, 2) - 1) < 1e-7,
        "the same relation contains both regimes; the limits are not two models");
}

// --- 3. THE SHIPPED SOLVER'S OWN DISPERSION RELATION ----------------------------------------------------------------
{
    say("3. waveStep's DISCRETE DISPERSION, derived from its update rule and then MEASURED on the shipped code.");
    ok("the shipped stiffness really is 2.0 and its damping really is 0.995", (() => {
        const src = readFileSync(new URL("../../water/waterMath.js", import.meta.url), "utf8");
        return /\(avg - h\[i\]\) \* 2\.0/.test(src) && /damping = 0\.995/.test(src);
    })(), "read from the file, so this section is about the tree and not about my memory of it");

    // the periodic copy in gravityWaves.mjs must agree with the SHIPPED clamped solver away from the boundary
    // THE MARGIN HAS TO BE DERIVED, NOT GUESSED. waveStep CLAMPS at its edges, so a reflection travels inward at
    // the scheme's own speed -- 1/sqrt(2) cells per step. My first attempt used 60 steps on a 48-cell grid with a
    // 12-cell margin and read 4.961e-1: the reflection had reached 42 cells, so THERE WAS NO INTERIOR LEFT and
    // the "disagreement" was entirely my own fixture. margin > steps / sqrt(2) is the condition.
    const N = 64, steps = 15, margin = 20;
    const h = new Float32Array(N * N), v = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = Math.cos(2 * Math.PI * 4 * x / N);
    const h0 = Float64Array.from(h);
    for (let t = 0; t < steps; t++) water.waveStep(h, v, N, N, 1.0);
    const mine = runMode({ kx: 2 * Math.PI * 4 / N, ky: 0, s: 2, damping: 1, steps, N });
    let interiorWorst = 0;
    for (let y = margin; y < N - margin; y++) for (let x = margin; x < N - margin; x++) {
        interiorWorst = Math.max(interiorWorst, Math.abs(h[y * N + x] - mine.final[y * N + x]));
    }
    ok("!! the periodic probe reproduces THE SHIPPED waveStep in the interior", interiorWorst < 2e-6,
        "worst |diff| " + interiorWorst.toExponential(3) + " over the interior after " + steps + " steps (margin " + margin +
        " cells against a reflection front at " + (steps * Math.SQRT1_2).toFixed(1) + ") -- the probe exists only because " +
        "waveStep CLAMPS at its edges and a clean dispersion measurement needs wrap; it is not a second solver");
    void h0;

    let worst = 0;
    for (const n of [1, 2, 4]) {
        const k = 2 * Math.PI * n / 64;
        const m = runMode({ kx: k, ky: 0, s: 2, damping: 1, steps: 4000, N: 64 });
        const wm = measuredOmega(m.probe), wp = schemeOmega(k, 0, 2).omega;
        say("     k = " + k.toFixed(4) + "   predicted omega " + wp.toFixed(5) + "   measured " + wm.toFixed(5) +
            "   c " + (wp / k).toFixed(5) + " cells/step");
        worst = Math.max(worst, Math.abs(wm - wp) / wp);
    }
    ok("sin(omega/2) = sqrt(s/4) sqrt(sin^2(kx/2)+sin^2(ky/2)), derived and then measured", worst < 0.01,
        "worst rel " + worst.toExponential(2) + ", limited by counting sign changes rather than by the relation");
    ok("!! the long-wave speed is sqrt(s/4) = 1/sqrt(2) CELLS PER STEP, a LATTICE CONSTANT",
        rel(schemeLongWaveSpeed(2), Math.SQRT1_2) < 1e-15 && rel(schemePhaseSpeed(1e-4, 2), Math.SQRT1_2) < 1e-8,
        "reads " + schemeLongWaveSpeed(2).toFixed(12) + " -- note the UNITS: cells per step. No metre and no second entered.");
}

// --- 4. WHERE THE SHIPPED CONSTANT SITS, AND WHAT IS ACTUALLY HOLDING IT ----------------------------------------------
{
    say("4. THE WORST MODE IS THE CHECKERBOARD kx = ky = pi, where sin^2(omega/2) = s/2, so the 2D limit is s <= 2.");
    ok("!! and the shipped stiffness is EXACTLY that limit, not near it", schemeStabilityLimit() === 2 && Math.abs(schemeMargin(2) - 1) < 1e-12,
        "checkerboard q = " + schemeMargin(2).toFixed(12) + " at s = 2, against q = " + schemeMargin(1.9).toFixed(6) + " at s = 1.9");
    ok("the boundary is admitted as MARGINAL rather than refused as unstable", (() => {
        const at2 = schemeOmega(Math.PI, Math.PI, 2), at201 = schemeOmega(Math.PI, Math.PI, 2.01);
        return at2 !== null && at2.marginal === true && Math.abs(at2.omega - Math.PI) < 1e-12 && at201 === null;
    })(), "MARGINAL AND UNSTABLE ARE TWO CLAIMS; my first guard was a strict `q > 1` and it called the SHIPPED CONFIGURATION unstable");

    const peaks = [250, 500, 1000, 2000].map((steps) => runMode({ steps, N: 16, damping: 1 }).peaks[steps - 1]);
    const slopes = peaks.slice(1).map((p, i) => p / peaks[i]);
    say("     s = 2, damping 1.0, checkerboard, peak after 250/500/1000/2000 steps: " + peaks.map((p) => p.toExponential(4)).join("  "));
    ok("!! at the boundary the growth is LINEAR, not exponential -- a DEFECTIVE double root", slopes.every((r) => Math.abs(r - 2) < 0.01),
        "each doubling of the step count doubles the amplitude (" + slopes.map((r) => r.toFixed(4)).join(", ") + "), so it is algebraic and slow, which is exactly why nobody has noticed");
    const damped = runMode({ steps: 2000, N: 16, damping: 0.995 }).peaks[1999];
    ok("!! and `damping` is what holds it -- a knob whose comment says 'lose energy each step'", damped < 1,
        "with the shipped 0.995 the same run peaks at " + damped.toExponential(3) + " against " + peaks[3].toExponential(3) + " undamped");
    ok("the module's own header sentence is TRUE, and true for a different reason than it reads", (() => {
        const src = readFileSync(new URL("../../water/waterMath.js", import.meta.url), "utf8");
        return /Stable for damping in \(0,1\)/.test(src);
    })(), "ONE CONSTANT DOING TWO JOBS WITH ONLY ONE OF THEM WRITTEN DOWN -- appearance, and the stability of a marginal scheme");
    say("   ANTIDOTE: IF ANYBODY CHANGES waveStep's 2.0 OR ITS DAMPING DEFAULT, THE FIRST LINE OF SECTION 3 GOES RED.");
    say("   THE RIGHT RESPONSE IS TO RE-DERIVE THE LIMIT FOR THE NEW CONSTANT AND REWRITE THESE LINES -- NOT TO");
    say("   WEAKEN THEM, AND NOT TO DELETE THEM. A stiffness ABOVE 2 diverges in under 2000 steps even damped.");
}

// --- 5. what it means to call it water -----------------------------------------------------------------------------------
{
    say("5. THE SCHEME IS NON-DISPERSIVE IN THE LONG-WAVE LIMIT, so it can model gravity waves ONLY where they are too.");
    const v1 = shallowValidity(0.01), v01 = shallowValidity(0.001);
    ok("how shallow 'shallow' has to be, bisected rather than taken from the series it justifies", v1.kh > 0.2 && v1.kh < 0.3,
        "1% needs kh < " + v1.kh.toFixed(4) + " (wavelength > " + v1.wavelengthsPerDepth.toFixed(1) +
        " depths); 0.1% needs kh < " + v01.kh.toFixed(4) + " (> " + v01.wavelengthsPerDepth.toFixed(1) + " depths)");
    ok("!! and the solver has NO DEPTH to be shallow relative to", (() => {
        const src = readFileSync(new URL("../../water/waterMath.js", import.meta.url), "utf8");
        return !/\bdepth\b/i.test(src) && !/\bgravity\b/i.test(src) && !/\bG_EARTH|9\.8/.test(src);
    })(), "waveStep contains no g, no h, no dx and no dt, so 'shallow relative to what' has no answer in it");

    // CAN NUMERICAL DISPERSION IMITATE PHYSICAL DISPERSION? Both curves fall with k, so the question is real.
    // Fit the ONE free parameter (s) to the deep-water curve over a band and report the residue.
    const band = [0.2, 0.4, 0.6, 0.8, 1.0, 1.2];
    const target = band.map((k) => Math.sqrt(1 / k));                 // deep water, g = 1: c = sqrt(g/k)
    let bestS = 0, bestErr = Infinity;
    for (let s = 0.01; s <= 2; s += 0.001) {
        const scale = target[0] / schemePhaseSpeed(band[0], s);
        let e = 0;
        for (let i = 0; i < band.length; i++) e = Math.max(e, rel(scale * schemePhaseSpeed(band[i], s), target[i]));
        if (e < bestErr) { bestErr = e; bestS = s; }
    }
    ok("!! no stiffness makes the lattice imitate deep-water dispersion, and the residue says so",
        bestErr > 0.3,
        "best s = " + bestS.toFixed(3) + " still misses by " + (100 * bestErr).toFixed(1) + "% across k = 0.2 to 1.2 -- " +
        "c ~ k^-1/2 is a POWER LAW and 2 asin(q sin(k/2))/k is not one, so the shapes cannot be made to agree");
    say("   THIS IS THE ONE WORTH KEEPING: A SCHEME ERROR AND A PHYSICAL EFFECT ARE TWO THINGS WEARING ONE LABEL");
    say("   (both are 'dispersion', both make short waves slower) AND YOU CANNOT BUY THE SECOND WITH THE FIRST.");
    say("   Real dispersion would have to enter as a term in the equation, not as a property of the grid.");
}

// --- 6. refusals, and the tree untouched --------------------------------------------------------------------------------
{
    say("6. REFUSALS AND SCOPE.");
    ok("omega refuses a non-positive depth or wavenumber", omega(0, 1) === null && omega(1, 0) === null && omega(1, -1) === null);
    ok("schemeOmega refuses a genuinely unstable mode instead of returning an imaginary frequency", schemeOmega(Math.PI, Math.PI, 3) === null);
    ok("the deep-water group formula does not overflow where sinh does", Number.isFinite(groupSpeed(1000, 1000)),
        "2kh = 2e6 overflows Math.sinh; the bracket is 1 there and the answer is c/2, stated rather than NaN");
    const src = readFileSync(new URL("./gravityWaves.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/node:/.test(src) && !/\bdocument\s*[.[]/.test(src) && !/\bwindow\s*[.[]/.test(src));
    ok("NOT CLAIMED: that this is a shallow-water SOLVER", /NOTHING IN water\/waterMath\.js IS EDITED/.test(src),
        "it is the dispersion relation plus an analysis of the scheme the tree already ships; a solver with a real g and a real depth is a separate round with its own keys");
    say("   AND THE HONEST LIMIT OF THE PHYSICS HALF: omega^2 = g k tanh(kh) IS LINEAR THEORY. It says nothing");
    say("   about breaking, about amplitude, or about surface tension (which takes over below ~2 cm and would");
    say("   add a k^3 term). A key that is exact within its own regime is not a key to everything.");
    void G_EARTH;
}

console.log("gravityWaves-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
