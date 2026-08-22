// WebGLEngine/tools/ship/ragdollSever-selfcheck.mjs
//
// Run: node tools/ship/ragdollSever-selfcheck.mjs   (~0.1s -- MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3234 -- THE INTERIM DEMONSTRATION: A LIMB COMES OFF BECAUSE A CONSTRAINT STOPPED EXISTING.
//
// *** THERE ARE TWO RAGDOLLS IN THIS TREE AND THEY SEVER BY DIFFERENT MECHANISMS. *** simulation/
// RagdollDismember.js reads ragdoll.boneCount, .parents, .worldPos, .prevPos, .mass and .animator -- a PARTICLE
// SKELETON, severed by walking parents[] to find a subtree and re-integrating those particles free. ragdoll.html
// builds ELEVEN RIGID BODIES held together by joints inside the Box3D WASM world: no parents array, no worldPos
// buffer, and the hierarchy living in the JOINT GRAPH rather than in an index.
//
// So wiring RagdollDismember into this page would mean fabricating a parents[]/worldPos view over rigid bodies
// -- a translation layer that becomes a third implementation of a thing this tree already has two of. THE BOX3D
// SIDE NEEDS NONE OF IT: world.jointDestroy(h) and the forearm falls, physically, with no severance logic at all.
//
// *** AND THE HANDLES WERE BEING CREATED AND THROWN AWAY. *** The build loop assigned j, put it in a table cell,
// and dropped it -- so nothing could refer to a joint again after the rig was built. That single omission is why
// the page could not do this already.
//
// THE DEMONSTRATION IS THE INVARIANT, NOT THE LIMB. box3dLoader's own comment on jointDestroy says it "leaves a
// hole rather than shifting the joints after it: an index must mean the same joint for the life of the world, or
// every handle the caller holds quietly points at a different bone." CUTTING ONE JOINT WHILE HOLDING TEN OTHERS
// IS HOW YOU SEE THAT HOLD.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments, codeOnly } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const page = fs.readFileSync(path.join(ROOT, "ragdoll.html"), "utf8");
const code = noComments(page);
const loader = noComments(fs.readFileSync(path.join(ROOT, "physics", "box3d", "box3dLoader.js"), "utf8"));
const dism = noComments(fs.readFileSync(path.join(ROOT, "simulation", "RagdollDismember.js"), "utf8"));

// ---- 1. THE TWO RAGDOLLS ARE DIFFERENT ANIMALS, AND THE PAGE DOES NOT PRETEND OTHERWISE -----------------------------
{
    const wantsParticles = /ragdoll\.parents/.test(dism) && /ragdoll\.worldPos/.test(dism) && /ragdoll\.boneCount/.test(dism);
    ok("!! *** RagdollDismember wants a PARTICLE SKELETON, which this page does not build ***",
        // *** SIXTH TIME THIS SESSION A CHECK COUNTED ITS OWN WARNING AS THE THING IT WARNS ABOUT. *** The page
        // explains the distinction in a sentence containing the words "walking parents[]", and that sentence is
        // in a STRING LITERAL, so noComments() leaves it standing and the structural test matched my own prose.
        // codeOnly() strips comments AND strings, which is precisely the rule this tree already wrote down:
        // codeOnly for an IDIOM, noComments for TEXT the code contains. I used the wrong one and it told me the
        // page builds a particle skeleton.
        wantsParticles && !/parents\s*[:[]/.test(codeOnly(page)) && /world\.addBox/.test(codeOnly(page)),
        "it reads boneCount / parents / worldPos / prevPos / mass / animator and severs by WALKING parents[]. " +
        "ragdoll.html builds eleven RIGID BODIES joined by hinges, where the hierarchy is the JOINT GRAPH. " +
        "Wiring one into the other would mean fabricating a parents[] view over rigid bodies -- A THIRD " +
        "IMPLEMENTATION OF A THING THIS TREE ALREADY HAS TWO OF");

    ok("...and the page says so where a reader will meet it",
        /two ragdolls, two mechanisms/i.test(page),
        "somebody will otherwise ask why the module named 'dismember' is not imported by the page that dismembers");
}

// ---- 2. THE HANDLES ARE KEPT, WHICH IS THE WHOLE FIX -----------------------------------------------------------------
{
    ok("!! *** the joint handles are KEPT rather than dropped into a table cell ***",
        /jointHandles\.push\(/.test(code) && /data-j=/.test(code),
        "the build loop assigned j, rendered it, and dropped it -- so NOTHING COULD REFER TO A JOINT AGAIN after " +
        "the rig was built. That single omission is why this page could not already do this");

    ok("...and severing is a call to the SOLVER, not to severance code",
        /world\.jointDestroy\(/.test(code) && !/RagdollDismember/.test(code),
        "a limb comes off HERE because a constraint stopped existing. NO SEVERANCE LOGIC RUNS -- which is the " +
        "demonstration, and it is why the Box3D side was the cheap one to do first");
}

// ---- 3. THE INVARIANT IT DEMONSTRATES IS THE LOADER'S OWN CLAIM --------------------------------------------------------
{
    ok("!! jointDestroy still promises to LEAVE A HOLE rather than renumber",
        /leaves a hole rather than shifting/i.test(fs.readFileSync(path.join(ROOT, "physics", "box3d", "box3dLoader.js"), "utf8")),
        "the page's readout rests on that sentence. IF SOMEBODY MAKES jointDestroy COMPACT THE ARRAY, this check " +
        "goes red and the page's claim about surviving handles becomes false in the same edit -- which is the " +
        "point of asserting it here rather than trusting it");

    ok("!! ...and the readout checks the SURVIVORS, not the limb",
        /still means the joint it meant/i.test(page) && /exactly one/i.test(page),
        "cutting one joint while holding ten others is how you SEE an index-stability claim hold. A page that " +
        "only showed an arm falling off would be theatre; THE INVARIANT IS THE DEMONSTRATION");

    ok("...and it reports a count that DISAGREES rather than assuming one went",
        /expected one, got/i.test(page),
        "jointCount before and after is the only thing the API can answer here, so it is asked and compared " +
        "rather than narrated -- an assertion nobody could see fail is not an assertion");
}

// ---- 4. THE POLICY DEMONSTRATION (v3235) ------------------------------------------------------------------------------
{
    ok("!! *** ONE severance path, TWO policies deciding when to call it ***",
        /accumulate \? \(buckets\[name\] >= THRESH\) : \(killing && dmg >= 0\.4\)/.test(codeOnly(page)) &&
        (codeOnly(page).match(/world\.jointDestroy\(/g) || []).length === 2,
        "THE CUT IS IDENTICAL EITHER WAY -- that is the point. What differs is whether damage is REMEMBERED " +
        "between hits, which is the only real difference between round 306 (live, kill-only) and round 307 " +
        "(unwired, accumulating) and the only thing a person needs to watch");

    ok("!! ...and it says which rule is which, on screen",
        /round 307's rule/i.test(page) && /round 306's rule/i.test(page) && /LIVE in the kaiju sim/i.test(page),
        "a toggle labelled only 'accumulate' would make somebody guess which side is the one currently shipping. " +
        "THE LIVE RULE IS NAMED AS LIVE");

    ok("!! *** it does NOT claim to be running RagdollDismember ***",
        !/RagdollDismember/.test(codeOnly(page)) && /THE POLICY IS PORTABLE EVEN THOUGH THE MECHANISM IS NOT/i.test(page),
        "that module needs a PARTICLE SKELETON (parents[], worldPos) and this rig is rigid bodies and joints. " +
        "Buckets and a threshold are the same question on either rig -- and SAYING SO is the difference between " +
        "a demonstration and a claim about code that is not running");

    // *** AND THIS IS THE MIRROR OF THE MISTAKE ONE ROUND AGO. *** v3234 used noComments() where the test needed
    // strings STRIPPED, and matched my own prose. This used codeOnly() where the test needs strings KEPT --
    // joint names are TEXT THE CODE CONTAINS, and codeOnly blanks them, so the rig declared zero joints. Both
    // wrong instruments, in opposite directions, one round apart, against a rule already written down:
    // codeOnly for an IDIOM, noComments for TEXT.
    const names = [...noComments(page).matchAll(/\["([a-zA-Z]+)",\s*"(weld|spherical|revolute)"/g)].map((m) => m[1]);
    ok("...and the joint it hits is one this rig actually has",
        names.includes("elbowL"),
        "the demo targets elbowL and the rig declares " + names.length + " joints: " + names.join(", ") +
        ". A DEMO AIMED AT A JOINT THAT DOES NOT EXIST would report 'already off' forever and look like a policy " +
        "that never fires");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT DO: the kaiju side. RagdollIntegration.js has severed limbs since ROUND");
console.log("  ----  306 -- randomly, on the killing blow only -- and imports round 307's RagdollDismember ZERO");
console.log("  ----  times. THE GOOD ONE IS DEAD AND THE CRUDE ONE IS LIVE, which is the greedyMesh finding in a");
console.log("  ----  second subsystem. Retiring that duplicate changes what the game FEELS like and is its own");
console.log("  ----  round; this one changes nothing that was already running.");
if (fails) { console.log("ragdollSever-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("ragdollSever-selfcheck: all checks pass");
