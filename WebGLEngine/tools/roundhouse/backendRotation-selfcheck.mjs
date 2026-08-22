// WebGLEngine/tools/roundhouse/backendRotation-selfcheck.mjs -- v3564
//
// Run: node tools/roundhouse/backendRotation-selfcheck.mjs
// RUNTIME 4s MEASURED with date(1) around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 2 IS THE ROUND. It drives the under-powered run that produced my WRONG first answer and shows the
// derived threshold refusing it. A gate that only demonstrated the correct reading would be hiding the part
// worth keeping. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backendAvailable, bootBox3d, box3dRun, keyRun, minimumSpin, fixtureInertia, shimDamping,
         FIXTURE, MEASURED_V3564, reportLines, WASM } from "./backendRotation.mjs";
import { stabilityRate } from "../../physics/mechanics/freeRotation.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("backendRotation-selfcheck -- does box3d carry the gyroscopic term, and can the question be asked?\n");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { I, mid } = fixtureInertia();

// ---------------------------------------------------------------------------
console.log("1. THE BACKEND IS REACHABLE FROM NODE, AND THE SHIM ALREADY EXPORTS WHAT THIS NEEDS");
{
    ok("!! box3d.wasm is present", backendAvailable(),
        "a missing wasm would be a CAPABILITY, not a failure -- v3225's rule, and the report says so instead " +
        "of throwing");
    const mod = await bootBox3d();
    const ex = Object.keys(mod).filter((k) => k.startsWith("_swk"));
    report("swk_* exports", String(ex.length));
    ok("!! *** IT BOOTS HEADLESS IN NODE, WITH NO SHIM AND NO REBUILD ***", ex.length > 30,
        "Node's fetch has no file:// scheme and box3d.js fetches locateFile(...), so it is handed a data: URL " +
        "of its own bytes. *** v3563 LISTED THE BACKEND COMPARISON AS BLOCKED ON A CONTRACT CHANGE. KEITH SAID " +
        "THE WASM WOULD DRIVE HEADLESS AND IT DOES. ***");
    ok("!! ...and the three calls this needs were there all along",
        ex.includes("_swk_body_box") && ex.includes("_swk_body_ang_impulse") && ex.includes("_swk_transforms"),
        "_swk_body_box takes THREE half-extents, so addShip's cube was never the only option; " +
        "_swk_transforms returns pos + QUATERNION, so the spin axis is watchable in world space WITH NO " +
        "ANGULAR-VELOCITY READER -- which is why readVelocities() being linear-only was never the blocker it " +
        "looked like.");
    ok("the fixture body really has three distinct moments", mid >= 0 && I[0] !== I[1] && I[1] !== I[2],
        "I " + I.map((v) => v.toFixed(2)).join(" / ") + " -- a cube would have no intermediate axis at all");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE FIRST ANSWER WAS WRONG, AND THE DERIVED THRESHOLD REFUSES IT ***");
{
    const minW = minimumSpin({ I, axis: mid, eps: FIXTURE.eps, T: FIXTURE.T });
    report("minimum spin for this window", minW.toFixed(4) + "   (eps " + FIXTURE.eps + ", T " + FIXTURE.T + "s)");

    // THE UNDER-POWERED RUN, driven rather than described: an angular impulse of 1 gives omega = 0.2.
    const weak = { ...FIXTURE, L: 1 };
    const weakOmega = weak.L / I[mid];
    const weakKey = keyRun(weak);
    const weakB3 = await box3dRun(weak);
    report("UNDER-POWERED omega " + weakOmega.toFixed(4),
        "key flips " + weakKey.flips + "   box3d flips " + weakB3.flips + "   box3d wander " + weakB3.maxOff.toExponential(2));

    ok("!! the under-powered spin is BELOW the derived threshold", weakOmega < minW,
        weakOmega.toFixed(4) + " < " + minW.toFixed(4) + ". *** THIS IS THE RUN I ALMOST PUBLISHED. Every axis " +
        "showed a wander that was BOUNDED, QUADRATIC IN THE SEED and FLAT IN TIME -- the exact signature of a " +
        "solver whose w is constant -- and I was one paragraph from reporting THAT BOX3D DROPS THE GYROSCOPIC " +
        "TERM. ***");
    ok("!! ...and BOTH sides go quiet there, which is what makes the null worthless rather than informative",
        weakKey.flips === 0 && weakB3.flips === 0,
        "*** THE ANSWER KEY -- WHICH PROVABLY HAS THE TERM -- ALSO FAILS TO FLIP AT THIS SPIN. That is the " +
        "whole guard: a backend's silence means nothing in a window where the CORRECT physics is silent too. " +
        "v3507's shape, and the CPU side already had this guard at v3562. I did not carry it across. ***");
    ok("!! the threshold is DERIVED from sigma's proportionality to omega, not chosen",
        Math.abs(minW - Math.log(1 / FIXTURE.eps) / (FIXTURE.T * stabilityRate(I, mid, 1).sigma)) < 1e-12,
        "W >= ln(1/eps) / (T * sigmaPerUnitOmega). Change the body or the window and it moves with them -- " +
        "NEVER TYPE A REFERENCE VALUE A GATE COMPARES AGAINST.");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** POWERED CORRECTLY, box3d's SPIN AXIS REVERSES ***");
{
    const key = keyRun(), b3 = await box3dRun();
    report("omega " + key.omega.toFixed(4) + "   sigma " + key.sigma.toFixed(4) + "/s",
        "key flips " + key.flips + "   box3d flips " + b3.flips + "   box3d wander " + b3.maxOff.toFixed(6));
    ok("!! the run clears the derived threshold", key.omega >= minimumSpin({ I, axis: mid, eps: FIXTURE.eps, T: FIXTURE.T }),
        "so a null here WOULD have meant something -- which is the only condition under which reading the " +
        "backend's behaviour is legitimate");
    ok("!! *** box3d's spin axis LEAVES ITS STARTING DIRECTION AND REVERSES ***", b3.maxOff > 0.9 && b3.flips > 0,
        "1-|cos| reaches " + b3.maxOff.toFixed(6) + " -- a complete reversal, not a wobble. THE GYROSCOPIC TERM " +
        "IS PRESENT IN SOME FORM. Observed through the ORIENTATION ONLY, which is what any backend can supply.");
    ok("...and the answer key flips too, so the comparison is between two things that both move",
        key.flips > 0, "key flips " + key.flips + " -- a backend agreeing with a key that does nothing is not agreement");
}

// ---------------------------------------------------------------------------
console.log("\n4. WHAT IS NOT CLAIMED, AND WHY IT IS NOT DECIDABLE HERE");
{
    const d = shimDamping();
    const key = keyRun(), b3 = await box3dRun();
    report("shim angular damping", String(d.angularDamping) + (d.settable ? " (settable)" : "  -- NO EXPORT SETS IT"));
    ok("!! the shim damps every box, deliberately", d.angularDamping > 0,
        "v2468 set bd.angularDamping = 0.05f after measuring box3d's default at 0.00/s against Jolt's 0.05/s " +
        "and deciding THE ENGINE should choose rather than inherit. *** DAMPED ROTATION IS NOT TORQUE-FREE. ***");
    ok("!! ...and no export can turn it off, so the rate comparison is REFUSED rather than fudged",
        !d.settable,
        "damping bleeds omega and sigma follows omega, so the flip COUNT in a fixed window is expected UNDER " +
        "the undamped key's -- measured key " + key.flips + ", box3d " + b3.flips + ". *** THAT IS REPORTED AS " +
        "CONSISTENT WITH THE DAMPING AND NOT AS A DEFECT: separating 'damped as designed' from 'a different " +
        "equation' needs a wasm rebuild (clang + wasi-libc), and guessing which it is would be exactly the " +
        "confident wrong answer this tree refuses. ***");
    ok("the direction of the discrepancy is the one damping predicts", b3.flips <= key.flips,
        "if box3d had flipped MORE than the undamped key, damping could not explain it and this would be a " +
        "finding instead of a caveat -- so the check is on the SIGN, which damping does constrain");
    ok("jolt is untouched and said to be untouched", /jolt is untouched/.test(MEASURED_V3564.joltNotRun),
        "joltLoader sets mAngularDamping the same way and loads through a different path; whether it boots in " +
        "Node is a separate question this round does not answer");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE FRONT DOOR, AND NOTHING IN THE BACKEND OR THE CONTRACT IS EDITED");
{
    const lines = await reportLines();
    ok("the report prints and names both numbers", lines.length > 12 && lines.join("\n").includes("box3d"),
        "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");
    const shim = fs.readFileSync(path.join(ENG, "physics/box3d/box3d_shim.c"), "utf8");
    const contract = fs.readFileSync(path.join(ENG, "physics/backendConformance.mjs"), "utf8");
    ok("!! the shim is NOT edited", /bd\.angularDamping = 0\.05f;/.test(shim),
        "this round asked box3d a question it could already answer. *** THE CONTRACT CHANGE v3563 CALLED A " +
        "BLOCKER TURNED OUT NOT TO BE ONE FOR box3d -- the ten-call contract is still angular-blind and that " +
        "is still worth fixing, but it was never what stood between here and an answer. ***");
    ok("...and the conformance contract is untouched too", !/angularImpulse/.test(contract),
        "adding an angular entry to a SHARED interface is a decision about both backends and stays its own " +
        "round -- and it is now a round with a MEASUREMENT behind it rather than a guess");
    ok("nothing is ratcheted", !("baseline" in MEASURED_V3564),
        "one backend, one body, one window. A baseline frozen from a first look would freeze my choice of spin " +
        "rate -- and this round is precisely about how much that choice decides.");
}

console.log(fails ? `\nbackendRotation-selfcheck: ${fails} FAILED` : "\nbackendRotation-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
