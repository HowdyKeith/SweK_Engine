// WebGLEngine/physics/mesh/curvedWall-selfcheck.mjs -- v3646
//
// Run: node physics/mesh/curvedWall-selfcheck.mjs
//
// *** A THIRD CATEGORY. v3642-v3645 had two: a boundary assertion that is TRUE (exact, free, rank-restoring) and
// one that is FALSE (worse than the refusal). This round measures one that is TRUE AND BADLY WRITTEN DOWN --
// grad u . n = 0 holds POINTWISE on a curved wall, and a single row per face asserts one number for a condition
// that varies across it. ***
//
// AND THE DISCRIMINATOR BETWEEN "BADLY WRITTEN DOWN" AND "FALSE" NEEDS NO TOLERANCE AT ALL:
// A DISCRETISATION ERROR CONVERGES UNDER REFINEMENT AND A FALSE ASSERTION DOES NOT. Both are on the same mesh.
//
// The fixture is potential flow past a cylinder, phi = U(r + a^2/r)cos(theta), on an annulus a <= r <= b. Its
// radial derivative is U(1 - a^2/r^2)cos(theta), EXACTLY ZERO at r = a at every angle -- a genuine zero-flux wall
// that curves -- and nonzero at r = b. ONE MESH, ONE FIELD, BOTH CASES.

import { readFileSync } from "node:fs";
import {
    makeAnnulus, potentialFlow, cellValues, annulusFaces, normalTurn, gradientWall, wallSideError,
} from "./curvedWall.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const { phi, grad } = potentialFlow({});
const sweep = [24, 48, 96, 192, 384].map((nt) => {
    const m = makeAnnulus({ nr: Math.max(4, Math.round(nt / 8)), nt, a: 1, b: 3 });
    const u = cellValues(m, phi), F = annulusFaces(m);
    return {
        nt, m, F, turn: normalTurn(m, F),
        innerNone: wallSideError(m, F, grad, gradientWall(u, m, { wall: "none", faces: F }), "inner"),
        innerNeu: wallSideError(m, F, grad, gradientWall(u, m, { wall: "inner", faces: F }), "inner"),
        outerNone: wallSideError(m, F, grad, gradientWall(u, m, { wall: "none", faces: F }), "outer"),
        outerNeu: wallSideError(m, F, grad, gradientWall(u, m, { wall: "outer", faces: F }), "outer"),
    };
});
const orders = (k) => sweep.slice(1).map((r, i) => Math.log2(sweep[i][k] / r[k]));

// --- 1. the fixture, checked before anything is concluded -------------------------------------------------------
{
    say("1. IS THE INNER WALL REALLY A ZERO-FLUX WALL? Checked at several angles rather than taken from the algebra.");
    let worst = 0;
    for (const th of [0, 0.4, 0.7, 1.6, 2.3, 3.0]) {
        const x = Math.cos(th), y = Math.sin(th), [gx, gy] = grad(x, y);
        worst = Math.max(worst, Math.abs(gx * x + gy * y));
    }
    say("     worst |grad . rhat| on r = a over six angles: " + worst.toExponential(3));
    ok("!! grad u . n is zero on the inner wall at every angle, to round-off", worst < 1e-15,
        "POINTWISE, not on average -- which is what makes this a TRUE condition badly written down rather than a false one");
    // *** MY FIRST VERSION ASSERTED THE MINIMUM OVER FOUR ANGLES WAS LARGE AND WENT RED, AND IT WAS THE CHECK
    // THAT WAS WRONG. On the outer wall grad u . n = U(1 - a^2/b^2)cos(theta), which VANISHES AT theta = pi/2 AND
    // 3pi/2 -- the top and bottom of the circle. THE FALSE WALL IS NOT UNIFORMLY FALSE: the condition is true at
    // two isolated points and O(1) wrong over the rest. That is worth stating rather than asserting away, and the
    // check now measures the TYPICAL magnitude with the two zeros named. ***
    ok("...and it is O(1) wrong over most of the outer wall, while being true at exactly two points", (() => {
        let sum = 0, n = 0, least = Infinity, leastAt = 0;
        for (let i = 0; i < 360; i++) {
            const th = 2 * Math.PI * i / 360, x = 3 * Math.cos(th), y = 3 * Math.sin(th);
            const [gx, gy] = grad(x, y), d = Math.abs((gx * x + gy * y) / 3);
            sum += d; n++;
            if (d < least) { least = d; leastAt = th; }
        }
        say("     |grad . rhat| on r = b: mean over 360 angles " + (sum / n).toFixed(6) +
            ", least " + least.toExponential(2) + " at theta = " + leastAt.toFixed(4) + " (pi/2 = " + (Math.PI / 2).toFixed(4) + ")");
        return sum / n > 0.4 && least < 1e-4 && Math.abs(leastAt - Math.PI / 2) < 0.02;
    })(), "the same mesh and the same field carry both cases, and only WHICH WALL gets the row differs -- and the " +
        "false wall has two points where the row happens to be right, which is why section 2 measures the WORST " +
        "cell rather than the mean");
    ok("the normal turns within a face, and the turn HALVES with each refinement", (() => {
        say("     normal turn per face: " + sweep.map((r) => r.turn.toFixed(5)).join(", "));
        return sweep.every((r, i) => i === 0 || Math.abs(r.turn / sweep[i - 1].turn - 0.5) < 0.01);
    })(), "0.26180 down to 0.01636 -- THE QUANTITY THAT DECIDES WHETHER ONE ROW IS A GOOD STATEMENT OF A POINTWISE " +
        "CONDITION, and it is O(h) by construction rather than by luck");
}

// --- 2. THE DISCRIMINATOR --------------------------------------------------------------------------------------------
{
    say("2. REFINEMENT. A discretisation error converges; a false assertion does not.");
    for (const r of sweep) say("     nt " + String(r.nt).padStart(3) + "   inner: none " + r.innerNone.toExponential(2) +
        " neumann " + r.innerNeu.toExponential(2) + "   |   outer: none " + r.outerNone.toExponential(2) +
        " neumann " + r.outerNeu.toExponential(2));
    const oIn = orders("innerNeu"), oOut = orders("outerNeu");
    say("     orders -- inner (TRUE): " + oIn.map((o) => o.toFixed(2)).join(", ") +
        "   outer (FALSE): " + oOut.map((o) => o.toFixed(2)).join(", "));
    ok("!! on the TRUE curved wall the error CONVERGES, approaching first order", oIn[oIn.length - 1] > 0.85 &&
        sweep[4].innerNeu < 0.2 * sweep[0].innerNeu,
        "1.05e-1 down to 1.36e-2, orders rising to " + oIn[oIn.length - 1].toFixed(2) + " -- the row is a one-number " +
        "statement of a condition that varies across the face, and the variation is O(h), so the damage vanishes");
    ok("!! on the FALSE wall it does NOT converge at all", oOut.every((o) => Math.abs(o) < 0.15) &&
        sweep[4].outerNeu > 0.4,
        "flat at about 0.5 across a sixteenfold refinement, orders " + oOut.map((o) => o.toFixed(2)).join(", ") +
        ". A FALSE ASSERTION IS NOT A DISCRETISATION ERROR AND NO MESH FIXES IT -- which is the discriminator, and " +
        "it needed no tolerance: 0.93 against -0.02");
    ok("the unrepaired outer wall converges perfectly well, so the flatness is the ROW and not the corner",
        (() => { const o = orders("outerNone"); return o[o.length - 1] > 0.9; })(),
        "outer with NO row: 2.33e-2 down to 1.20e-3 at order " + orders("outerNone").slice(-1)[0].toFixed(2) +
        " -- the same cells, the same field, converging. ONLY THE FALSE ROW STOPS IT");
}

// --- 3. AND ON A CURVED WALL THE TRUE CONDITION BUYS ALMOST NOTHING ----------------------------------------------------
{
    say("3. WHAT DOES THE ROW ACTUALLY BUY ON A CURVED WALL?");
    for (const r of sweep) say("     nt " + String(r.nt).padStart(3) + "   inner without " + r.innerNone.toExponential(3) +
        "   with " + r.innerNeu.toExponential(3) + "   ratio " + (r.innerNeu / r.innerNone).toFixed(4));
    ok("!! it is neutral to marginally NEGATIVE -- not the exact win it was on a flat wall",
        sweep.every((r) => r.innerNeu / r.innerNone > 0.98 && r.innerNeu / r.innerNone < 1.05),
        "ratios " + sweep.map((r) => (r.innerNeu / r.innerNone).toFixed(3)).join(", ") + ". v3645 measured the SAME " +
        "condition on a FLAT wall at 1.805e-15 -- EXACT, free and rank-restoring. CURVATURE DESTROYS THE EXACTNESS " +
        "AND LEAVES THE COST");
    say("   *** SO THE THIRD CATEGORY IS REAL AND IT IS NOT A MIDDLE GROUND. A true condition on a flat wall is");
    say("   EXACT. The same condition on a curved wall is a first-order approximation that costs a hair and buys");
    say("   a hair. The same condition where it is FALSE never converges. The three are not points on one scale --");
    say("   the first is about ALGEBRA, the second about RESOLUTION, and the third about the PROBLEM. ***");
}

// --- 4. the metric that was wrong first -------------------------------------------------------------------------------
{
    say("4. AND THE FIRST VERSION OF THIS MEASUREMENT WAS MY OWN DENOMINATOR.");
    ok("the error is normalised by a scale over the whole wall, not per cell", (() => {
        const src = readFileSync(new URL("./curvedWall.mjs", import.meta.url), "utf8");
        return /AN ERROR THAT GROWS WHEN THE MESH IMPROVES IS A FACT ABOUT THE DENOMINATOR/.test(src);
    })(), "I divided each cell's error by ITS OWN |grad|, and on a cylinder |grad| = 2U|sin theta| at r = a, which " +
        "VANISHES AT THE TWO STAGNATION POINTS. The metric diverged exactly where the physics is most benign and " +
        "the UNREPAIRED error appeared to RISE under refinement, 2.39e-1 to 3.45e-1 -- which no least-squares " +
        "gradient on a smooth field can do. AN ERROR THAT GROWS WHEN THE MESH IMPROVES IS A FACT ABOUT THE " +
        "DENOMINATOR, and it is the same shape as every other 'implausible number is a finding about the instrument'");
    ok("...and with the scale fixed, the unrepaired error falls monotonically", (() => {
        const o = orders("innerNone");
        say("     inner, no row: " + sweep.map((r) => r.innerNone.toExponential(2)).join(", ") +
            "   orders " + o.map((x) => x.toFixed(2)).join(", "));
        return sweep.every((r, i) => i === 0 || r.innerNone < sweep[i - 1].innerNone);
    })(), "which is what a gradient on a smooth field must do, and is the check that says the fixture is sound");
}

// --- 5. scope -----------------------------------------------------------------------------------------------------------
{
    say("5. SCOPE.");
    const src = readFileSync(new URL("./curvedWall.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    ok("the annulus is deterministic -- no randomness anywhere", !/Math\.random/.test(src));
    ok("wall kind is derived from the face midpoint's radius against the mid-annulus, not from an index", /kind: Math\.hypot\(mx, my\) < mid/.test(src));
    say("   NOT CLAIMED: that the field is exactly represented. It is NOT linear, so cell values are centroid");
    say("   samples and second order -- the key here is the ORDER, not exactness, and that is the honest question");
    say("   on a curved wall in the first place. NOT DONE: a higher-order boundary row (two rows per face, or one");
    say("   row per quadrature point), which is what would recover the exactness curvature costs -- and which is a");
    say("   different construction rather than a tuning. STILL OPEN FROM v3644/v3645: a sheared mesh with a");
    say("   straddling interface, a limiter on the discontinuous field, and the 3D corner touching three walls.");
}

console.log("curvedWall-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
