// WebGLEngine/physics/blackhole/navigate-selfcheck.mjs -- v2876
//
// Run: node physics/blackhole/navigate-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// Grades the probe CONTROLLER -- the loop that drives a probe onto a chosen orbit.
//
// WHY THIS IS AN INSTRUMENT AND NOT A DEMO. Steering a spacecraft is not impressive by itself. What makes this
// gradeable is that the problem has an EXACT ANSWER the controller is never given: a circular orbit at r needs
// exactly L = r sqrt(M/(r-3M)). The controller sees one bit per trial -- did the probe drift IN or OUT -- and
// bisects. The exact value is used only afterwards, to mark the paper.
//
// THE CHECK THAT MATTERS MOST IS THE MIDDLE REGIME. Between 3M and 6M a circular orbit EXISTS and is UNSTABLE.
// A controller that reported success there would be returning a number that is CORRECT and a plan that is
// USELESS -- the most dangerous kind of wrong answer, because nothing about the number looks wrong. So stability
// is measured by perturbing the orbit and watching, not by looking up r > 6M.
import { measureOrbit, driftSign, steerToCircular, steerToISCO, stabilityOf, exactCircularL, NAV } from "./navigate.js";
import { circularL, iscoRadius, iscoAngularMomentum, photonSphere } from "./probe.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const M = 1;
const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- 1. THE CONTROLLER MUST NOT CONSULT THE ANSWER KEY --------------------------------------------------------
{
    const src = fs.readFileSync(path.join(HERE, "navigate.js"), "utf8");
    // strip comments: the reason it must not call circularL is DISCUSSED in the header, and a naive grep would
    // trip on the explanation rather than the code -- a mistake this session has made six times already.
    const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const searchFn = code.slice(code.indexOf("export function steerToCircular"), code.indexOf("export function stabilityOf"));
    ok("!! the SEARCH never calls circularL", !/circularL\(/.test(searchFn),
       "a search that consulted the exact value would be a lookup wearing a loop");
    ok("...and driftSign only looks at which way it drifted", !/circularL/.test(code.slice(code.indexOf("export function driftSign"), code.indexOf("export const NAV"))),
       "one bit per trial: in, or out");
    ok("the answer key is exported SEPARATELY, for grading", /exactCircularL/.test(code));
}

// ---- 2. IT LANDS ON THE EXACT VALUE ----------------------------------------------------------------------------
{
    let worst = 0, worstAt = 0;
    for (const r of [8, 10, 20, 50, 100]) {
        const s = steerToCircular(M, r);
        const e = Math.abs(s.L - circularL(M, r));
        if (e > worst) { worst = e; worstAt = r; }
        ok("steers to a circular orbit at " + r + "M", s.verdict === NAV.CIRCULARISED && e < 1e-9,
           "L = " + s.L.toPrecision(10) + " vs exact " + circularL(M, r).toPrecision(10) + ", err " + e.toExponential(2) + ", " + s.iterations + " trials");
    }
    ok("!! worst error across the range is tiny", worst < 1e-9, worst.toExponential(2) + " at r=" + worstAt + "M");
}

// ---- 3. THE ISCO -- the sharpest single test --------------------------------------------------------------------
{
    const i = steerToISCO(M);
    ok("!! it can steer to the ISCO", i.verdict === NAV.CIRCULARISED || i.verdict === NAV.UNSTABLE, i.verdict);
    ok("...landing on exactly 2*sqrt(3)*M", Math.abs(i.L - iscoAngularMomentum(M)) < 1e-9,
       i.L.toPrecision(12) + " vs " + iscoAngularMomentum(M).toPrecision(12));
    ok("...which it was never told", Math.abs(i.L - 2 * Math.sqrt(3)) < 1e-9);
}

// ---- 4. THE MIDDLE REGIME: right number, useless plan -------------------------------------------------------------
{
    for (const r of [5, 4, 3.5]) {
        const s = steerToCircular(M, r);
        ok("at " + r + "M the L is still CORRECT", Math.abs(s.L - circularL(M, r)) < 1e-9,
           s.L.toPrecision(9) + " vs " + circularL(M, r).toPrecision(9));
        ok("!! ...but it is reported UNSTABLE, not circularised", s.verdict === NAV.UNSTABLE,
           "inside the ISCO the orbit will not survive a nudge -- the number is right and the plan is useless");
        ok("...and the refusal says WHY", /UNSTABLE|ISCO/.test(s.reason || ""));
    }
    // and stability is MEASURED, not looked up
    const navSrc = fs.readFileSync(path.join(HERE, "navigate.js"), "utf8").replace(/^\s*\/\/.*$/gm, "");
    const stabFn = navSrc.slice(navSrc.indexOf("export function stabilityOf"));
    ok("!! stability is measured by PERTURBING, not by testing r > 6M", /nudge/.test(stabFn) && !/> 6 \* M/.test(stabFn.slice(0, 400)),
       "the physical definition -- nudge it and see whether the excursion grows");
}

// ---- 5. WHERE THERE IS NOTHING TO FIND, IT REFUSES ------------------------------------------------------------------
{
    for (const r of [3, 2.5, 2.1]) {
        const s = steerToCircular(M, r);
        ok("at " + r + "M it REFUSES", s.verdict === NAV.IMPOSSIBLE && s.L === undefined,
           "no circular orbit exists for matter at or inside the photon sphere (" + photonSphere(M) + "M)");
    }
    ok("...and the refusal carries a reason", (steerToCircular(M, 2.5).reason || "").length > 20);
    ok("!! it returns NO L rather than its closest attempt", steerToCircular(M, 2.5).L === undefined,
       "a best-effort number for an orbit that cannot exist is the failure this whole design avoids");
}

// ---- 6. the drift bit the controller actually steers on -----------------------------------------------------------
{
    const r0 = 10;
    const exact = circularL(M, r0);
    ok("below the circular value the probe falls INWARD", driftSign(M, exact * 0.9, r0) < 0);
    ok("above it the probe climbs OUTWARD", driftSign(M, exact * 1.1, r0) > 0);
    const o = measureOrbit(M, exact, r0);
    ok("!! at the circular value the orbit is a CIRCLE", Math.abs(o.ecc) < 1e-9, "eccentricity " + o.ecc.toExponential(2));
    const low = measureOrbit(M, 3.0, 10);
    ok("a badly under-powered release is CAPTURED", low.captured, "reaches the horizon");
}

// ---- 7. determinism ------------------------------------------------------------------------------------------------
{
    const a = steerToCircular(M, 12), b = steerToCircular(M, 12);
    ok("the controller is deterministic", a.L === b.L && a.iterations === b.iterations,
       "bisection on a measured sign, not a stochastic search -- so a gate can pin it");
}

console.log(fails ? "\nnavigate-selfcheck: " + fails + " FAILED" : "\nnavigate-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
