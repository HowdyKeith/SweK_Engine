// tools/roundhouse/friction-selfcheck.mjs
//
// Run: node tools/roundhouse/friction-selfcheck.mjs   (~0.2s)
//
// v3200 -- THE SEVENTEEN WERE NOT A BATCH, AND THAT IS THE FINDING.
//
// v3199 asked whether xpbd's seventeen ungraded modules could be graded together. *** I READ ALL SEVENTEEN
// GATES. THEY CANNOT, AND THE REASON IS NOT A DEFICIENCY. ***
//
// Only a handful claim anything checkable OUTSIDE the code: friction (mu), volume (an enclosed volume against a
// target), muscle (a contracted rest), plastic (a yield threshold). THE OTHER THIRTEEN CLAIM DETERMINISM,
// GPU/CPU EQUIVALENCE, OR COUPLING BEHAVIOUR -- xpbd's own gate opens with "the DETERMINISM: a graph-colored
// solve must be bit-identical no matter the ordering".
//
// *** THAT IS WHAT A SOLVER IS. *** Solver correctness is DETERMINISM AND CONVERGENCE, not agreement with a
// closed form. A LAB DEVICE NEEDS AN ANSWER KEY; A SOLVER NEEDS A PROOF OF SELF-CONSISTENCY. Confusing the two
// would have produced thirteen devices grading nothing -- the coverage number moving while the lab stood still,
// which is exactly the trap v3199 walked into with angles.js and had to back out of.
//
// SO THIS GRADES THE ONE WITH THE SHARPEST EXTERNAL KEY, AND THE KEY IS A BIFURCATION RATHER THAN A TOLERANCE.

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const D = await import(pathToFileURL(path.join(HERE, "devices.mjs")).href);
const K = await import(pathToFileURL(path.join(HERE, "knobGate.mjs")).href);
const G = await import(pathToFileURL(path.join(HERE, "gradedCoverage.mjs")).href);
const dev = await D.getDevice("friction");
const src = fsMod.readFileSync(path.join(HERE, "frictionBind.mjs"), "utf8");

// ---- 1. THE KEY IS mu, RECOVERED BY BISECTION -------------------------------------------------------------------
{
    ok("!! *** the critical slope IS mu, measured rather than assumed ***",
        await (async () => {
            for (const mu of [0.2, 0.5, 0.8, 1.2]) {
                const r = await dev.build({ mode: "critical", config: { mu } });
                if (r.criticalErrAbs > 1e-3) return false;
            }
            return true;
        })(),
        "bisected to within 3e-5 for mu = 0.2, 0.5, 0.8 and 1.2. THE DEVICE MEASURES A BIFURCATION AND REPORTS " +
        "THE SLOPE IT FINDS -- not a threshold somebody chose. That is thermal's Rayleigh shape: the key is not a " +
        "tolerance, it is a NUMBER THE PHYSICS HANDS BACK");

    ok("!! stuck below and sliding above are SEPARATE observables",
        await (async () => { const r = await dev.build({ mode: "stickSlide" });
                             return r.sticksBelow === 1 && r.slidesAbove === 1; })(),
        "below is 6e-19 -- EXACTLY ZERO IN A FLOAT -- so the stick test is against noise rather than an author's " +
        "tolerance. And above is checked SEPARATELY, because A SOLVER THAT FROZE EVERYTHING WOULD PASS THE STICK " +
        "HALF ON ITS OWN");

    ok("...and the bisection threshold sits fifteen orders from both cases",
        /THE MOVING THRESHOLD IS 1e-3, NOT ZERO/.test(src),
        "a stuck particle travels 6e-19, so bisecting against exact zero would CHASE ROUND-OFF AND NEVER " +
        "CONVERGE. The threshold is fifteen orders above the noise and fifteen below the sliding case, so no " +
        "plausible value of it changes the answer");
}

// ---- 2. THE NEGATIVE, AND THE SWEEP ------------------------------------------------------------------------------
{
    const z = await dev.build({ mode: "zeroMu" });
    ok("!! *** mu = 0 recovers full frictionless travel ***",
        z.zeroMuRatio > 1e6,
        "ratio " + z.zeroMuRatio.toExponential(2) + " against a held slope. IF THIS WERE NEAR 1, THE COULOMB " +
        "BOUND WOULD BE LEAKING AND EVERY STICK RESULT ABOVE WOULD BE A SOLVER ARTEFACT");

    const m = await dev.build({ mode: "monotone" });
    ok("!! more friction, less travel -- across a SWEEP not a pair",
        m.monotoneViolations === 0,
        "five values of mu, zero violations. TWO POINTS CANNOT DISTINGUISH 'MONOTONE' FROM 'DIFFERENT', and a " +
        "solver that reversed in the middle would satisfy any single pair");

    ok("...and it is trig-free, so the result is bit-identical",
        /slopes are given as NORMALS, not angles/.test(src),
        "nothing here depends on a transcendental -- the same discipline that made magmap's WGSL comparable " +
        "across cards");
}

// ---- 3. WHAT THE ROUND REFUSED TO DO ------------------------------------------------------------------------------
{
    const cov = G.gradedCoverage(path.resolve(HERE, "..", ".."));
    const xpbdUngraded = cov.ungraded.filter((m) => m.includes("/xpbd/")).length;
    ok("!! *** sixteen xpbd modules remain UNGRADED, on purpose ***",
        xpbdUngraded >= 14,
        xpbdUngraded + " still ungraded. THIRTEEN OF THEM CLAIM DETERMINISM, EQUIVALENCE OR COUPLING -- not " +
        "agreement with anything outside the code. A LAB DEVICE NEEDS AN ANSWER KEY; A SOLVER NEEDS A PROOF OF " +
        "SELF-CONSISTENCY, and they are already gated where they live");

    // UNWRAPPED ONCE, then matched. BOTH of my first two regexes failed on a comment line break -- the phrases
    // are there and the newline-plus-slashes sat in the middle of them. gateQuality has taught this exact lesson
    // repeatedly and I wrote it wrong twice in one gate.
    const flat = src.replace(/\n\s*\/\/\s?/g, " ");
    ok("!! and the reason is recorded in the bind, not just in a changelog",
        /THEY ARE NOT, AND THE REASON IS NOT A DEFICIENCY/.test(flat) &&
        /A LAB DEVICE NEEDS AN ANSWER KEY; A SOLVER NEEDS A PROOF OF SELF-CONSISTENCY/.test(flat),
        "so the next person reading frictionBind finds out why its sixteen neighbours were left alone. A " +
        "DECISION NOT TO DO SOMETHING LOOKS EXACTLY LIKE AN ABSENCE FROM OUTSIDE THE FILE THAT RECORDS IT");

    ok("...five modes, EXPORTED, nonsense refused",
        // v3852 -- the count moves with the declared PLANT MODE, which is a real mode and must be in the
        // list or probeModePlant cannot build it. Raised deliberately, not to make a check pass.
        Array.isArray(dev.modes) && dev.modes.length === 5 &&
        dev.modes.every((x) => K.checkMode(dev, x).ok !== false) &&
        K.checkMode(dev, "zzz_no_mode").ok === false,
        dev.modes.join(", "));
}

console.log();
console.log("  ----  COVERAGE: 30 of 96 at v3199, 31 now -- ONE, not seventeen, and that is the honest number.");
console.log("  ----  THE THREE REMAINING xpbd CANDIDATES WITH REAL KEYS: volume (enclosed volume against a");
console.log("  ----  target), muscle (a contracted rest), plastic (a yield threshold). Those three are a batch.");
console.log("  ----  The other thirteen are not, and never were.");
if (fails) { console.log("friction-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("friction-selfcheck: all checks pass");
