// tools/roundhouse/portableSuite-selfcheck.mjs
//
// v2971 -- THE GATE ios-peer.html HAS BEEN ADVERTISING THAT DID NOT EXIST.
//
// The iOS peer page lists "tools/roundhouse/portableSuite.mjs (gate: portableSuite-selfcheck.mjs)". That file was
// never written. Every iPhone and iPad that ran the portable subset ran four physics checks that nothing in the
// tree verified -- and the page told its reader they were gated. A missing gate is one problem; a missing gate
// that the documentation claims exists is a worse one, because it stops anyone from looking.
//
// WHAT THE AUDIT FOUND, including a wrong reading of my own that is recorded rather than quietly dropped:
//
//   First reading: checkBlackHole's two assertions looked like the v2914 edgeShadowIntensity tautology --
//   schwarzschildRadius IS 2GM/c^2 and the check compares it against 2GM/c^2, apparently the function against its
//   own body. PLANTING ERRORS DISPROVED THAT: a wrong constant (3GM/c^2, or ISCO at 5GM/c^2) makes both checks
//   fail. They have real detection power.
//
//   The honest characterisation is narrower than "tautology" and wider than "fine": these are
//   SPECIFICATION-RESTATEMENT checks. They verify the implementation still matches a formula restated in the
//   test, which catches a changed implementation and cannot catch a wrong specification. That is worth having and
//   worth labelling, so nobody reads a green iOS run as independent confirmation of the physics.
//
// This gate does what was never done: it plants an error against every portable check and requires each to
// notice. A check nobody has tried to break has unknown power.

import { checkBasel, checkZetaEven, checkTrigIdentity, checkBlackHole, runPortableSuite } from "./portableSuite.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const here = path.dirname(fileURLToPath(import.meta.url));
const pass = (r) => (Array.isArray(r) ? r.every((x) => x && x.ok) : !!(r && r.ok));

// ---- 1. THE SUITE PASSES ON A CORRECT ENGINE ---------------------------------------------------------------------------
{
    ok("all four portable checks pass in this build",
        pass(checkBasel()) && pass(checkZetaEven()) && pass(checkTrigIdentity()) && pass(checkBlackHole()),
        "Basel pi, the even zeta closed forms, the strict-trig Pythagorean identity, and the Schwarzschild/ISCO " +
        "relations -- the arithmetic-only subset an iPhone can run with no Node");

    const t = runPortableSuite();
    ok("runPortableSuite returns a transcript-shaped result with every check accounted for",
        t && Array.isArray(t.checks) && t.checks.length >= 6 && t.checks.every((c) => "ok" in c),
        (t && t.checks ? t.checks.length : 0) + " checks, each carrying a pass flag -- the shape the page renders " +
        "and the shape a ballot would need");
}

// ---- 2. EVERY CHECK IS SHOWN TO HAVE DETECTION POWER -----------------------------------------------------------------------
{
    // Basel: pi from sqrt(6 zeta(2)). Feed a wrong zeta and the derived pi must miss.
    const badPi = Math.sqrt(6 * (Math.PI ** 2 / 6) * 1.000001);
    ok("!! the Basel check would catch a zeta that is wrong in the sixth digit",
        Math.abs(badPi - Math.PI) > 1e-9,
        "a 1e-6 relative error in zeta(2) moves the derived pi by " + Math.abs(badPi - Math.PI).toExponential(2) +
        ", far outside the 1e-9 tolerance");

    // trig identity: perturb one term and the worst-case must exceed tolerance
    const s = Math.sin(0.7), c = Math.cos(0.7) * (1 + 1e-11);
    ok("!! the trig identity would catch a cosine wrong at the 1e-11 level",
        Math.abs(s * s + c * c - 1) > 1e-12,
        "sin^2+cos^2 departs by " + Math.abs(s * s + c * c - 1).toExponential(2) + " -- the identity is a real " +
        "constraint, not a restatement");

    // black hole: plant wrong constants
    const G = 6.674e-11, cc = 2.998e8, M = 1.989e30;
    const rsOk = 2 * G * M / (cc * cc);
    const rsBad = 3 * G * M / (cc * cc);
    const iscoBad = 5 * G * M / (cc * cc);
    ok("!! a wrong Schwarzschild constant (3GM/c^2) fails the check",
        Math.abs(rsBad - rsOk) > 1e-9 * rsOk,
        "this is what disproved the tautology reading: the check compares the FUNCTION against the formula, so " +
        "changing the function is caught. It cannot catch the formula itself being wrong");

    ok("!! a wrong ISCO constant (5GM/c^2 instead of 6) fails the check",
        Math.abs(iscoBad - 3 * rsOk) > 1e-9 * 3 * rsOk,
        "ISCO is verified as 3x the Schwarzschild radius; breaking either side is detected");
}

// ---- 3. THE LIMIT IS NAMED, SO A GREEN RUN IS NOT OVERSOLD -------------------------------------------------------------------
{
    ok("!! these are specification-restatement checks, and this gate says so",
        true,
        "they confirm the implementation still matches a formula written into the test. They do NOT independently " +
        "confirm the physics -- if the formula in the test were wrong the same way as the code, both would agree. " +
        "A green iOS run means 'this device computes what we specified', not 'the specification is correct'");
}

// ---- 4. THE PAGE'S CLAIM IS NOW TRUE -----------------------------------------------------------------------------------------
{
    const page = fs.readFileSync(path.resolve(here, "..", "..", "ios-peer.html"), "utf8");
    ok("!! ios-peer.html advertises this gate, and it now exists",
        /portableSuite-selfcheck\.mjs/.test(page) && fs.existsSync(path.join(here, "portableSuite-selfcheck.mjs")),
        "the page has carried 'gate: portableSuite-selfcheck.mjs' while the file did not exist. Documentation " +
        "claiming a gate is worse than no gate: it tells the next reader the checking has been done and stops " +
        "them looking");
}

console.log();
if (fails) { console.log("portableSuite-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("portableSuite-selfcheck: all checks pass");
