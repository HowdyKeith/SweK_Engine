// tools/roundhouse/rayleighOnset-selfcheck.mjs
//
// Run: node tools/roundhouse/rayleighOnset-selfcheck.mjs   (~80s -- MEASURED, was a typed ~60s)
//
// v3145 -- THERMAL'S ACTUAL BIFURCATION, AND A SECOND EXTERNAL ANSWER KEY FOR THE WHOLE LAB.
//
// The queue item read "thermal has no graded bifurcation -- a real Rayleigh-Benard onset needs heated-bottom /
// cooled-top boundaries, a SIMULATION change". *** EVERY INGREDIENT WAS ALREADY IN simulation/lbm/thermal2d.js.
// *** Heated floor and cooled ceiling (Tw = y === 0 ? Thot : Tcold), Guo forcing, the buoyancy coupling, and the
// RAYLEIGH NUMBER ITSELF -- computed and returned, and never once reported by thermalBind. Fourth time this
// session a measurement existed and nothing reached for it.
//
// *** WHAT WAS ACTUALLY MISSING WAS A SEED, AND THAT EXISTED TOO. *** The base state is perfectly symmetric and
// the solver deterministic, so ux stays EXACTLY ZERO forever and the instability has nothing to grow from.
// That is why v3105 measured "peak is LINEAR in gravity" and found no bifurcation -- CONVECTION COULD NOT START
// AT ANY Ra. opts.init(x, y) has always accepted a perturbed field. Nothing ever passed one.
//
// THE KEY IS EXTERNAL, which is the point. Ra_c = 1707.762 for rigid-rigid boundaries is Chandrasekhar's, not a
// rearrangement of anything in this repository. Until now kh's Michalke values were the lab's ONLY external
// reference; this is the second, and it AGREES rather than disagreeing.
//
// AND NOTHING IS THRESHOLDED. A supercritical pitchfork satisfies A^2 ~ (Ra - Ra_c), so a straight line through
// the saturated amplitude squared against Ra HITS ZERO AT Ra_c. The critical value is READ OFF THE FIT, never
// typed -- which is the tree's own law about never typing a reference a gate compares against.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const D = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "devices.mjs")).href);
const { makeThermal } = await import(pathToFileURL(path.join(ENG, "simulation", "lbm", "thermal2d.js")).href);
const thermal = await D.getDevice("thermal");
const run = await thermal.build({ mode: "rayleigh", config: { nx: 64, ny: 33, steps: 20000 } });

// ---- 1. THE MEASUREMENT AGAINST AN EXTERNAL NUMBER --------------------------------------------------------------
{
    ok("!! the measured onset lands within 5% of Chandrasekhar's Ra_c",
        run.raCritErrFrac != null && run.raCritErrFrac < 0.05,
        "Ra_c measured " + run.raCritMeasured.toFixed(1) + " against 1707.762 -- " +
        (run.raCritErrFrac * 100).toFixed(2) + "%. EXTERNAL: this number is not a rearrangement of anything in " +
        "this repository, which makes it the SECOND such reference in the lab after kh's Michalke values -- and " +
        "unlike kh, the device AGREES with it");

    ok("...and the critical value is READ OFF A FIT, not thresholded",
        Array.isArray(run.raSweep) && run.raSweep.length >= 3 && run.raCritMeasured < Math.min(...run.raSweep),
        "swept Ra " + run.raSweep.join(", ") + " -- every sample is ABOVE the extracted onset, which is what an " +
        "x-intercept means. Nothing here compares an amplitude to a chosen number");

    ok("...and the amplitude GROWS with Ra, or there is no pitchfork to read",
        run.onsetAmplitudes.every((a, i) => i === 0 || a > run.onsetAmplitudes[i - 1]),
        run.onsetAmplitudes.map((a) => a.toExponential(2)).join(" -> ") + ". A flat or falling series would " +
        "make the intercept a line through noise, which is why the mode returns NULL rather than a number when " +
        "the fitted slope is not positive");
}

// ---- 2. IT IS A BIFURCATION, NOT A LINEAR RESPONSE -------------------------------------------------------------------
{
    // v3105 measured that thermal's old "convecting" flag was LINEAR in gravity -- a forced response, not an
    // instability. THE DIFFERENCE IS WHETHER A SEED DECAYS OR GROWS, and that is checkable in two runs.
    const probe = (gravity) => {
        const nx = 64, ny = 33;
        const s = makeThermal({ nx, ny, tau: 0.8, tauG: 0.8, gravity, beta: 1, Thot: 0.5, Tcold: -0.5,
            init: (x, y) => ({ T: 0.5 - y / (ny - 1) + 0.02 * Math.sin(2 * Math.PI * x / nx) * Math.sin(Math.PI * y / (ny - 1)), ux: 0, uy: 0 }) });
        for (let i = 0; i < 12000; i++) s.step();
        let u = 0; for (let k = 0; k < nx * ny; k++) u = Math.max(u, Math.hypot(s.ux[k], s.uy[k]));
        return { Ra: s.Ra, u };
    };
    const below = probe(1e-4), above = probe(2e-3);
    ok("!! below onset the seed DECAYS; above it, it saturates",
        below.u < 1e-9 && above.u > 1e-2 && above.u / below.u > 1e6,
        "Ra " + Math.round(below.Ra) + " -> |u| " + below.u.toExponential(2) + " (a 0.02 seed decayed by " +
        "orders of magnitude); Ra " + Math.round(above.Ra) + " -> |u| " + above.u.toExponential(2) +
        ". THAT RATIO IS THE BIFURCATION. v3105's old flag was linear in gravity because convection could not " +
        "start at all -- it was measuring the forced response of a layer that never went unstable");

    ok("!! and WITHOUT a seed nothing happens at ANY Ra",
        (() => {
            const nx = 64, ny = 33;
            const s = makeThermal({ nx, ny, tau: 0.8, tauG: 0.8, gravity: 4e-3, beta: 1, Thot: 0.5, Tcold: -0.5 });
            for (let i = 0; i < 8000; i++) s.step();
            let ux = 0; for (let k = 0; k < nx * ny; k++) ux = Math.max(ux, Math.abs(s.ux[k]));
            return ux === 0;
        })(),
        "at Ra ~ 10800, six times past onset, HORIZONTAL VELOCITY IS EXACTLY ZERO with no seed. A perfectly " +
        "symmetric deterministic state has no mode to grow, so the instability is unreachable -- and 'exactly " +
        "zero' rather than 'small' is what makes that a structural fact instead of a tuning problem");
}

// ---- 3. THE MODE HAD TO BE DECLARED, WHICH v3144 CAUGHT --------------------------------------------------------------
{
    ok("!! 'rayleigh' is now a DECLARED mode",
        thermal.defaults({ mode: "rayleigh" }).mode === "rayleigh",
        "it was refused by the very clamp v3144 taught checkMode to read: defaults() replaced it with 'diffuse' " +
        "and the new branch never ran. MY OWN GUARD, WORKING ON ME one round after shipping it -- the cheapest " +
        "possible way to learn that a new mode needs declaring");

    ok("...and junk is still clamped",
        thermal.defaults({ mode: "xyzzyNotAMode" }).mode === "diffuse",
        "adding a mode must not open the door to any string");
    console.log("  ----  MEASURED AND NOT HIDDEN: a FINER grid (96x49) fits Ra_c = 1858, an 8.8% error against");
    console.log("        this grid's 2.6%. Finer is not automatically better here -- different aspect ratio, a");
    console.log("        different Ra window and possibly not converged at 20000 steps. Recording the worse");
    console.log("        number matters more than the better one, because somebody will refine the grid.");
}

console.log();
if (fails) { console.log("rayleighOnset-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("rayleighOnset-selfcheck: all checks pass");
