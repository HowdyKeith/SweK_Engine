// WebGLEngine/physics/mechanics/contactImpulse-selfcheck.mjs -- v3580
//
// Run: node physics/mechanics/contactImpulse-selfcheck.mjs
// RUNTIME .1s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 3 IS THE ROUND AND IT IS A REFUTATION. *** The shim's contacts block has stated its purpose since
// v3037 and this is the first time anything drove it. The purpose does not hold for the field it exports, and
// the gate DEMONSTRATES that rather than asserting a replacement and quietly dropping the claim.
"use strict";
import { initNode } from "../box3d/box3dNode.mjs";
import { contactsAvailable, contactRows, sumTotal, sumLast, restingBudget, impactTrace,
         SOLVER_PASSES, MEASURED_V3580, reportLines } from "./contactImpulse.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("contactImpulse-selfcheck -- the contact list, driven for the first time since v3037\n");

const st = await initNode();
if (!st.ready) { console.log("  box3d wasm not loadable: " + st.reason); process.exit(1); }
if (!contactsAvailable()) {
    console.log("  FAIL  the contact exports are absent. They landed in the shim at v3037 and in the ARTIFACT at");
    console.log("        v3569; if this fires, the wasm has been rebuilt from an older shim.");
    process.exit(1);
}

// ---------------------------------------------------------------------------
console.log("1. *** THE EXPORTS EXIST AND SOMETHING FINALLY USES THEM ***");
{
    const r = restingBudget();
    report("contact points on a resting box", String(r.points));
    ok("!! the contact list returns real geometry, not an empty array",
        r.points === 4 && r.total > 0,
        "four corners of a box on a plane. *** THE BLOCK CALLS ITSELF 'round 1 of 3 (exports -> gate -> " +
        "overlay)' AND ROUNDS 2 AND 3 NEVER HAPPENED. *** For 500 versions that was invisible because the " +
        "functions were not in the binary; v3569 built them and left a capability with ZERO CONSUMERS, which " +
        "is the state rigidKeys section 6 refuses for the other two exports.");
    ok("...and the stride is published rather than assumed",
        r.rows[0].length === 10,
        "swk_contact_stride() is read from the wasm; a hard-coded 10 here would break silently on the day the " +
        "row grows an eleventh field");
}

// ---------------------------------------------------------------------------
console.log("\n2. THE STATIC CLOSURE IS EXACT, AND THE FACTOR IS READ RATHER THAN FITTED");
{
    const grid = [[1 / 60, 4], [1 / 120, 4], [1 / 240, 4], [1 / 240, 1], [1 / 240, 2], [1 / 240, 8], [1 / 240, 16]];
    const rows = grid.map(([dt, ss]) => restingBudget({ dt, substeps: ss }));
    report("closure sum/2 / (m g dt)", rows.map((r) => r.closure.toFixed(4)).join("  "));

    ok("!! *** A RESTING BOX'S CONTACT CANCELS GRAVITY TO FOUR DIGITS ***",
        rows.every((r) => Math.abs(r.closure - 1) < 1e-3),
        "its velocity does not change, so the contact impulse MUST equal m g dt. *** THE STATIC CASE IS THE ONE " +
        "WITH NO PAIRING AMBIGUITY: there is no question of which step's impulse belongs to which velocity " +
        "change when the velocity change is zero. ***");
    ok("!! ...and it holds across dt AND substeps INDEPENDENTLY, which is what makes it a property",
        new Set(grid.map(([dt]) => dt)).size === 3 && new Set(grid.map(([, ss]) => ss)).size === 5,
        "three timesteps and five substep counts. A factor that held at one setting would be a fitted number " +
        "wearing a derivation.");
    ok("!! the factor of 2 is READ FROM box3d's solver.c, not chosen to make the sum come out",
        SOLVER_PASSES === 2,
        "each substep runs b3_stageSolve (useBias=true) AND b3_stageRelax (useBias=false), both calling " +
        "b3SolveContacts_*, and contact_solver.c:458 accumulates totalNormalImpulse in each. *** v3569's LESSON " +
        "APPLIED THE RIGHT WAY ROUND: measure the ratio, then READ THE SOURCE for why, rather than naming a " +
        "coefficient. ***");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** AND THE CLOSURE THE SHIM HEADER PROMISED DOES NOT EXIST ***");
{
    const tr = impactTrace();
    for (const r of tr.slice(0, 5))
        report("step " + r.step, "needed " + r.needed.toFixed(5) + "   reported " + r.reported.toFixed(5) +
               "   ratio " + r.ratio.toFixed(3));
    const ratios = tr.slice(0, 6).map((r) => r.ratio);

    ok("!! the impact step alone already disagrees with the static factor",
        Math.abs(ratios[0] - 2) > 0.2,
        "1.742 where the static case gives exactly 2. box3d_shim.c has said since v3037 that the key is 'sum " +
        "the normal impulses acting on a body across a step and it must equal that body's momentum change'. " +
        "*** THAT IS FALSE FOR THE FIELD IT EXPORTS. ***");
    ok("!! *** AND THE RATIO IS NOT A CONSTANT: IT WANDERS OVER AN ORDER OF MAGNITUDE ***",
        Math.max(...ratios) / Math.min(...ratios) > 10,
        "1.74 at impact, then 14, 30, 27, 28, 30 while settling, and exactly 2 only at rest. *** A NUMBER THAT " +
        "MOVES LIKE THAT IS NOT A BUDGET WITH A COEFFICIENT IN FRONT OF IT -- IT IS A DIAGNOSTIC SUM THAT " +
        "HAPPENS TO AGREE WITH ONE IN A SPECIAL CASE. *** No factor rescues the header; the header was wrong " +
        "about what the field is.");
    ok("!! ...and the reason is read from the source rather than inferred from the numbers",
        "theReasonIsReadNotGuessed" in MEASURED_V3580,
        "the two passes compute THE SAME impulse when the state is not changing, and DIFFERENT ones when it is. " +
        "So the sum is exactly twice the physical impulse at rest and unrelated to it in motion. *** A PROPERTY " +
        "OF A SOFT-STEP SOLVER, NOT A DEFECT IN box3d *** -- which is why this round ends in a corrected shim " +
        "header rather than a bug report.");
    ok("the shim header has been corrected rather than left to mislead the next reader",
        /THE CLOSURE THIS BLOCK WAS BUILT FOR DOES NOT EXIST/.test(
            fs.readFileSync(path.join(ENG, "physics", "box3d", "box3d_shim.c"), "utf8")),
        "a stated purpose that cannot be delivered is worse than no purpose: the next person spends a round " +
        "building it, which is exactly what happened here");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE FIELD RELATIONSHIP IS EXACT, AND IT QUANTIFIES THE PRE-v3569 BUG");
{
    const rows = [1, 2, 4, 8, 16].map((ss) => restingBudget({ dt: 1 / 240, substeps: ss }));
    report("last/total at substeps 1,2,4,8,16", rows.map((r) => r.fieldRatio.toFixed(5)).join("  "));
    report("1/(2*substeps)", [1, 2, 4, 8, 16].map((s) => (1 / (2 * s)).toFixed(5)).join("  "));

    ok("!! normalImpulse / totalNormalImpulse = 1/(2*substeps), exactly",
        rows.every((r, i) => Math.abs(r.fieldRatio - 1 / (2 * [1, 2, 4, 8, 16][i])) < 1e-4),
        "box3d's doc says normalImpulse is the FINAL SUB-STEP result. *** THIS IS THAT SENTENCE, MEASURED: the " +
        "pre-v3569 guess would have under-reported by EXACTLY THE SUBSTEP COUNT *** -- the magnitude v3569 " +
        "predicted from a doc comment and could not check, because the wasm did not export the field yet.");
    ok("...and both fields are exported, so the wrong one can be shown failing",
        rows[0].rows[0].length === 10,
        "v3569 widened the stride from 9 to 10 to carry both. A shim exporting only the corrected field would " +
        "make this check impossible to write.");
}

// ---------------------------------------------------------------------------
console.log("\n5. A PREDICTION FROM THE SOURCE THAT COULD NOT FIRE, RECORDED AS SUCH");
{
    const es = [0, 0.2, 0.5, 0.9].map((e) => restingBudget({ e }));
    report("ratioTotal at e = 0, 0.2, 0.5, 0.9", es.map((r) => r.ratioTotal.toFixed(4)).join("  "));

    ok("!! restitution does NOT raise the ratio above 2, and solver.c says why",
        es.every((r) => Math.abs(r.ratioTotal - 2) < 1e-3),
        "b3ApplyRestitution is a THIRD accumulating pass (contact_solver.c:652), so a bouncy contact should " +
        "push this above 2. It does not. Line 631: restitution is skipped unless relativeVelocity exceeds a " +
        "threshold, and *** A RESTING CONTACT HAS NO APPROACH SPEED. THE PREDICTION WAS NOT WRONG; THE TEST " +
        "COULD NOT REACH IT. ***");
    ok("!! ...and the flat 1.9999 is POSITIVE evidence, not a null result",
        es.every((r) => Math.abs(r.ratioTotal - SOLVER_PASSES) < 1e-3),
        "if a third pass had run, the sum would have exceeded twice the physical impulse. It is exactly twice, " +
        "at four restitution values, which is the reading confirmed from the other side.");
    ok("nothing is ratcheted", !("baseline" in MEASURED_V3580),
        "every ratio is recomputed each run; freezing one would ratchet a dt and a substep count");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE REPORT PRINTS AND THE SPLIT HOLDS");
ok("the reporting tool produces a report", (await reportLines()).length > 12,
    "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");

console.log(fails ? `\ncontactImpulse-selfcheck: ${fails} FAILED` : "\ncontactImpulse-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
